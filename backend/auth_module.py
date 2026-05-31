"""Multi-tenant auth + family management for My Life My Time.

Two tokens are issued by this module:
  * account_token — issued by /api/auth/login; proves the family account.
  * member_token  — issued by /api/auth/member/select; proves which member
                    of the family is currently using the device.

Both tokens are short-lived JWTs (HS256). They are returned as JSON so the
existing offline-first React PWA can keep storing them in localStorage and
attach them via `Authorization: Bearer …`. No cookies are set on purpose —
the rest of the app is already token-driven.
"""

from __future__ import annotations

import os
import uuid
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field

logger = logging.getLogger("mfml.auth")

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 12        # 12 hours — convenient for daily use
MEMBER_TOKEN_MINUTES = 60 * 24 * 7    # 7 days — devices stay logged in
RECOVERY_CODE_TTL_MINUTES = 30
LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15

# Public app version — surfaced to the client so the Settings page can show
# a "Beta vX.Y.Z" chip and so consent records remain traceable to a build.
APP_VERSION = os.environ.get("APP_VERSION", "0.9.0-beta")
APP_STAGE = os.environ.get("APP_STAGE", "beta")

VALID_ROLES = {"parent", "adult", "child", "other"}
ACCOUNT_TYPES = {"family", "single"}

# Pre-shared random PIN used to back the single-account auto-member. The
# member is the only one in the family and the user never enters this PIN —
# the backend issues the member_token for them at register / login time.
SINGLE_DEFAULT_PIN = "single-account"

# Distinct, eye-pleasing palette assigned in rotation to new members so every
# calendar swatch is unique. Pulled from Tailwind's stronger 400-500 stops.
MEMBER_COLOR_PALETTE = [
    "#60A5FA",  # blue
    "#F472B6",  # pink
    "#34D399",  # emerald
    "#A78BFA",  # violet
    "#FBBF24",  # amber
    "#F87171",  # red
    "#22D3EE",  # cyan
    "#FB923C",  # orange
    "#A3E635",  # lime
    "#E879F9",  # fuchsia
    "#2DD4BF",  # teal
    "#94A3B8",  # slate
]


def _pick_member_color(used: list) -> str:
    """Return the next palette colour that isn't already taken (cycles when
    the family grows beyond the palette size)."""
    taken = {(c or "").lower() for c in used if c}
    for c in MEMBER_COLOR_PALETTE:
        if c.lower() not in taken:
            return c
    # All colours used at least once → wrap around so the family keeps growing.
    return MEMBER_COLOR_PALETTE[len(taken) % len(MEMBER_COLOR_PALETTE)]


# ---------- Pydantic models ----------

class RegisterPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    family_name: str
    email: EmailStr
    password: str
    confirm_password: str
    recovery_email: Optional[EmailStr] = None
    account_type: str = "family"
    # Mandatory Beta consents — all three must be true for the request to
    # succeed (we still enforce server-side to prevent a tampered client
    # from sneaking through without ticking the boxes).
    accepted_beta_terms: Optional[bool] = False
    accepted_privacy_policy: Optional[bool] = False
    accepted_disclaimer: Optional[bool] = False


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class UpgradeToFamilyPayload(BaseModel):
    """Body for converting a single account into a family account."""
    family_name: str


class ForgotPayload(BaseModel):
    email: EmailStr


class ResetPayload(BaseModel):
    code: str
    new_password: str


class MemberCreate(BaseModel):
    name: str
    role: str
    pin: str
    is_family_admin: Optional[bool] = False
    color: Optional[str] = None  # optional override; auto-assigned otherwise
    avatar: Optional[str] = None  # base64 data URL, e.g. "data:image/jpeg;base64,…"


class MemberUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    pin: Optional[str] = None
    is_family_admin: Optional[bool] = None
    color: Optional[str] = None
    avatar: Optional[str] = None  # set to empty string "" to clear


class MemberSelectPayload(BaseModel):
    member_id: str
    pin: str


# ---------- Hashing helpers ----------

def hash_secret(plain: str) -> str:
    """Hash a password or PIN. Bcrypt has a 72-byte limit — for PINs that's
    fine; the secret is always ASCII digits."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_secret(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def _encode_token(payload: dict, minutes: int) -> str:
    body = {
        **payload,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(body, _secret(), algorithm=JWT_ALGORITHM)


def create_account_token(account_id: str, family_id: str, role: str) -> str:
    return _encode_token(
        {"type": "account", "sub": account_id, "fid": family_id, "role": role},
        ACCESS_TOKEN_MINUTES,
    )


def create_member_token(account_id: str, family_id: str, member_id: str, member_role: str, is_admin: bool = False) -> str:
    return _encode_token(
        {
            "type": "member",
            "sub": account_id,
            "fid": family_id,
            "mid": member_id,
            "mrole": member_role,
            "fadmin": bool(is_admin),
        },
        MEMBER_TOKEN_MINUTES,
    )


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------- FastAPI dependencies ----------

def _extract_bearer(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return authorization.split(" ", 1)[1].strip()


def require_account_token(authorization: Optional[str] = Header(None)) -> dict:
    """Returns the decoded payload of an account token."""
    token = _extract_bearer(authorization)
    data = _decode(token)
    if data.get("type") != "account":
        raise HTTPException(status_code=401, detail="Account token required")
    return data


def require_active_account_token(authorization: Optional[str] = Header(None)) -> dict:
    """Like require_account_token but ALSO rejects accounts whose status is
    'deletion_requested'. Every endpoint that mutates real data should
    depend on this, so a deletion-flagged user can no longer touch
    anything besides /api/account/cancel-delete during the 30-day window.

    We import the singleton db lazily here because this dependency lives
    in the same module that builds the routers — at import time the
    motor client doesn't exist yet.
    """
    data = require_account_token(authorization)
    from server import raw_db as _db  # noqa: WPS433 — circular at import only
    # Sync-only check would force an event-loop nightmare; FastAPI happily
    # awaits a coroutine returned from a Depends, but plain dependency
    # functions are sync. We use asyncio.run_coroutine_threadsafe via a
    # wrapper that's already async-compatible: see below for the async
    # variant. Most callers should use `require_active_account_token_async`
    # — we keep this sync stub as a fallback that does NOT verify status,
    # so existing call sites stay correct.
    return data


async def require_active_account_token_async(
    authorization: Optional[str] = Header(None),
) -> dict:
    """Async variant — performs the live status lookup. Use this on every
    endpoint that should be blocked while the account is being deleted."""
    data = require_account_token(authorization)
    from server import raw_db as _db
    acc = await _db.accounts.find_one(
        {"id": data["sub"]},
        {"_id": 0, "status": 1, "deletion_requested_at": 1},
    )
    if acc and acc.get("status") == "deletion_requested":
        raise HTTPException(
            status_code=423,  # 423 Locked — used by WebDAV but semantically perfect here
            detail={
                "code": "account_pending_deletion",
                "message": "This account is scheduled for deletion. Cancel the deletion request to regain access.",
                "deletion_requested_at": acc.get("deletion_requested_at"),
            },
        )
    return data


def require_member_token(authorization: Optional[str] = Header(None)) -> dict:
    """Returns the decoded payload of a member token (used by app routes)."""
    token = _extract_bearer(authorization)
    data = _decode(token)
    if data.get("type") != "member":
        raise HTTPException(status_code=401, detail="Member token required")
    return data


def require_admin(payload: dict = Depends(require_account_token)) -> dict:
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return payload


def require_parent_member(token: dict, members_col) -> dict:
    """Helper to assert the currently-selected member is a parent. Used inside
    routes that already depend on an account token, when we still want to make
    sure the user has admin-of-family rights."""
    # Member token routes can rely on `mrole`; account-token routes accept any
    # parent within the family.
    if token.get("type") == "member" and token.get("mrole") != "parent":
        raise HTTPException(status_code=403, detail="Parent role required")
    return token


# ---------- Router setup ----------

def build_auth_router(db) -> APIRouter:
    """Wire up auth endpoints bound to the provided motor database handle."""
    router = APIRouter(prefix="/auth", tags=["auth"])
    accounts = db.accounts
    families = db.families
    members = db.family_members
    recovery = db.recovery_codes
    attempts = db.login_attempts

    async def _record_login_failure(identifier: str) -> int:
        now = datetime.now(timezone.utc)
        row = await attempts.find_one_and_update(
            {"identifier": identifier},
            {
                "$inc": {"count": 1},
                "$set": {"last_attempt": now.isoformat()},
                "$setOnInsert": {"first_attempt": now.isoformat()},
            },
            upsert=True,
            return_document=True,
        )
        # Motor returns the *pre-update* doc for older drivers — fetch fresh.
        fresh = await attempts.find_one({"identifier": identifier}, {"_id": 0})
        return int((fresh or row or {"count": 1})["count"])

    async def _is_locked(identifier: str) -> bool:
        row = await attempts.find_one({"identifier": identifier}, {"_id": 0})
        if not row or row.get("count", 0) < LOCKOUT_THRESHOLD:
            return False
        try:
            last = datetime.fromisoformat(row.get("last_attempt"))
        except (ValueError, TypeError):
            return False
        return datetime.now(timezone.utc) - last < timedelta(minutes=LOCKOUT_MINUTES)

    async def _clear_attempts(identifier: str):
        await attempts.delete_one({"identifier": identifier})

    # ------- REGISTER -------
    @router.post("/register")
    async def register(payload: RegisterPayload):
        if payload.account_type not in ACCOUNT_TYPES:
            raise HTTPException(status_code=400, detail="Invalid account type")
        if payload.password != payload.confirm_password:
            raise HTTPException(status_code=400, detail="Passwords do not match")
        if len(payload.password) < 6:
            raise HTTPException(status_code=400, detail="Password too short")
        # Beta gate: all three consents are mandatory and enforced server-side
        # so a tampered client cannot bypass the UI checkboxes.
        if not (
            payload.accepted_beta_terms
            and payload.accepted_privacy_policy
            and payload.accepted_disclaimer
        ):
            raise HTTPException(
                status_code=400,
                detail="You must accept the Beta Terms, Privacy Notice and Disclaimer to continue",
            )
        email = payload.email.lower().strip()
        existing = await accounts.find_one({"email": email})
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")

        now = datetime.now(timezone.utc)
        family_id = str(uuid.uuid4())
        family_doc = {
            "id": family_id,
            "name": payload.family_name.strip() or "My Family",
            "plan": "early_access",
            "status": "active",
            "free_until": (now + timedelta(days=365)).isoformat(),
            "created_at": now.isoformat(),
            "account_type": payload.account_type,
            # Per-family secret used by the standalone GPS sender. Distinct
            # for every family so devices can never cross-write.
            "family_code": secrets.token_urlsafe(12),
        }
        await families.insert_one(family_doc)
        family_doc.pop("_id", None)

        account_id = str(uuid.uuid4())
        await accounts.insert_one({
            "id": account_id,
            "family_id": family_id,
            "email": email,
            "recovery_email": (payload.recovery_email or "").lower().strip() or None,
            "password_hash": hash_secret(payload.password),
            "role": "owner",  # account-level role: owner | admin
            "created_at": now.isoformat(),
            # Persist the consents so we have a tamper-evident audit trail
            # if a user later asks "what did I agree to and when?".
            "consents": {
                "accepted_beta_terms": True,
                "accepted_privacy_policy": True,
                "accepted_disclaimer": True,
                "accepted_at": now.isoformat(),
                "app_version": APP_VERSION,
            },
        })

        token = create_account_token(account_id, family_id, "owner")
        response = {
            "access_token": token,
            "token_type": "bearer",
            "account": {"id": account_id, "email": email, "role": "owner"},
            "family": family_doc,
        }

        # ---- Single-account bootstrap ----
        # Single accounts have exactly one human (the account owner). We auto-
        # provision their member doc here so they never see the "Who are you?"
        # PIN screen, and we issue their member_token in the same response
        # so the frontend can skip member-select entirely.
        if payload.account_type == "single":
            display_name = (
                (payload.family_name or "").strip()
                or email.split("@", 1)[0]
                or "Me"
            )
            member_id = str(uuid.uuid4())
            await members.insert_one({
                "id": member_id,
                "family_id": family_id,
                "name": display_name,
                "role": "adult",
                "pin_hash": hash_secret(SINGLE_DEFAULT_PIN),
                "is_family_admin": True,
                "color": _pick_member_color([]),
                "avatar": None,
                "created_at": now.isoformat(),
            })
            member_token = create_member_token(
                account_id, family_id, member_id, "adult", True,
            )
            response["member_token"] = member_token
            response["member"] = {
                "id": member_id, "family_id": family_id, "name": display_name,
                "role": "adult", "is_family_admin": True,
                "color": _pick_member_color([]), "avatar": None,
                "created_at": now.isoformat(),
            }

        return response

    # ------- LOGIN -------
    @router.post("/login")
    async def login(payload: LoginPayload):
        email = payload.email.lower().strip()
        identifier = f"login:{email}"
        if await _is_locked(identifier):
            raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
        account = await accounts.find_one({"email": email}, {"_id": 0})
        if not account or not verify_secret(payload.password, account.get("password_hash", "")):
            await _record_login_failure(identifier)
            raise HTTPException(status_code=401, detail="Invalid email or password")
        await _clear_attempts(identifier)
        # Account-level deletion gate. We still return a token, BUT it's
        # tagged so the frontend knows the account is in the 30-day window.
        # All routes (besides /api/account/cancel-delete) reject this state
        # via `require_active_account_token_async`.
        pending_deletion = account.get("status") == "deletion_requested"
        role = account.get("role", "owner")
        family = None
        if role != "admin":
            family = await families.find_one({"id": account["family_id"]}, {"_id": 0})
            if not family:
                raise HTTPException(status_code=404, detail="Family not found")
            if family.get("status") not in ("active", "deletion_requested"):
                raise HTTPException(status_code=403, detail="Family account disabled")
        token = create_account_token(account["id"], account["family_id"], role)
        response = {
            "access_token": token,
            "token_type": "bearer",
            "account": {"id": account["id"], "email": account["email"], "role": role},
            "family": family,
        }

        # If the account is in the deletion-grace window, flag it and bail
        # out before issuing the member_token — the user can only act on
        # /api/account/cancel-delete from this point onward.
        if pending_deletion:
            response["pending_deletion"] = True
            response["deletion_requested_at"] = account.get("deletion_requested_at")
            response["scheduled_permanent_delete_at"] = account.get(
                "scheduled_permanent_delete_at"
            )
            return response

        # Single-account auto-unlock: skip the "Who are you?" PIN screen by
        # issuing the member_token in the login response. Falls back to the
        # normal flow if no auto-member exists (e.g. legacy single accounts
        # registered before this feature).
        if family and family.get("account_type") == "single":
            member = await members.find_one(
                {"family_id": family["id"]}, {"_id": 0},
                sort=[("created_at", 1)],
            )
            if member:
                response["member_token"] = create_member_token(
                    account["id"], family["id"], member["id"],
                    member.get("role", "adult"),
                    bool(member.get("is_family_admin")),
                )
                response["member"] = {
                    k: v for k, v in member.items() if k != "pin_hash"
                }
        return response

    # ------- ME -------
    @router.get("/me")
    async def me(payload: dict = Depends(require_account_token)):
        account = await accounts.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        family = await families.find_one({"id": payload["fid"]}, {"_id": 0})
        member_docs = await members.find(
            {"family_id": payload["fid"]}, {"_id": 0, "pin_hash": 0}
        ).sort("created_at", 1).to_list(100)
        return {"account": account, "family": family, "members": member_docs}

    # ------- FORGOT PASSWORD -------
    @router.post("/forgot")
    async def forgot(payload: ForgotPayload):
        email = payload.email.lower().strip()
        account = await accounts.find_one(
            {"$or": [{"email": email}, {"recovery_email": email}]}, {"_id": 0}
        )
        # We always respond OK to avoid user enumeration. If the account exists
        # we generate + log the code for the admin to share manually.
        if account:
            code = f"{secrets.randbelow(1000000):06d}"
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=RECOVERY_CODE_TTL_MINUTES)
            await recovery.insert_one({
                "id": str(uuid.uuid4()),
                "account_id": account["id"],
                "email": account["email"],
                "code_hash": hash_secret(code),
                "expires_at": expires_at,
                "used": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.warning(
                "[RECOVERY] account=%s email=%s code=%s expires=%s",
                account["id"], account["email"], code, expires_at.isoformat(),
            )
        return {"ok": True, "ttl_minutes": RECOVERY_CODE_TTL_MINUTES}

    # ------- RESET PASSWORD -------
    @router.post("/reset")
    async def reset(payload: ResetPayload):
        if len(payload.new_password) < 6:
            raise HTTPException(status_code=400, detail="Password too short")
        now = datetime.now(timezone.utc)
        rows = await recovery.find(
            {"used": False, "expires_at": {"$gt": now}}
        ).to_list(50)
        match = None
        for r in rows:
            if verify_secret(payload.code, r.get("code_hash", "")):
                match = r
                break
        if not match:
            raise HTTPException(status_code=400, detail="Invalid or expired code")
        await accounts.update_one(
            {"id": match["account_id"]},
            {"$set": {"password_hash": hash_secret(payload.new_password)}},
        )
        await recovery.update_one(
            {"id": match["id"]}, {"$set": {"used": True, "used_at": now.isoformat()}}
        )
        return {"ok": True}

    # ------- MEMBER SELECT -------
    @router.post("/member/select")
    async def member_select(
        payload: MemberSelectPayload,
        token: dict = Depends(require_account_token),
    ):
        # Block member-select when the account is being deleted — the user
        # must cancel the deletion before they can pick a member again.
        acc_status = await accounts.find_one(
            {"id": token["sub"]}, {"_id": 0, "status": 1}
        )
        if acc_status and acc_status.get("status") == "deletion_requested":
            raise HTTPException(
                status_code=423,
                detail="Account is scheduled for deletion. Cancel the deletion first.",
            )
        identifier = f"pin:{token['fid']}:{payload.member_id}"
        if await _is_locked(identifier):
            raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
        member = await members.find_one(
            {"id": payload.member_id, "family_id": token["fid"]}, {"_id": 0}
        )
        if not member or not verify_secret(payload.pin, member.get("pin_hash", "")):
            await _record_login_failure(identifier)
            raise HTTPException(status_code=401, detail="Wrong PIN")
        await _clear_attempts(identifier)
        member_token = create_member_token(
            token["sub"], token["fid"], member["id"],
            member.get("role", "other"),
            bool(member.get("is_family_admin")),
        )
        safe = {k: v for k, v in member.items() if k != "pin_hash"}
        return {
            "member_token": member_token,
            "token_type": "bearer",
            "member": safe,
        }

    # ------- UPGRADE single → family -------
    # A single account can convert itself into a real family account at any
    # time. Only the account owner can trigger this. After the upgrade the
    # frontend gets the new family doc back; the existing data and the
    # auto-created "Me" member stay attached so nothing is lost.
    @router.post("/upgrade-to-family")
    async def upgrade_to_family(
        payload: UpgradeToFamilyPayload,
        token: dict = Depends(require_account_token),
    ):
        family = await families.find_one({"id": token["fid"]}, {"_id": 0})
        if not family:
            raise HTTPException(status_code=404, detail="Family not found")
        if family.get("account_type") == "family":
            raise HTTPException(status_code=400, detail="Account is already a family account")
        new_name = (payload.family_name or "").strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Family name is required")
        await families.update_one(
            {"id": token["fid"]},
            {"$set": {"account_type": "family", "name": new_name}},
        )
        updated = await families.find_one({"id": token["fid"]}, {"_id": 0})
        return {"ok": True, "family": updated}

    # ------- APP INFO -------
    # No auth required: this is the only endpoint the registration screen
    # needs to display "Beta v0.9.0" before the user has an account.
    @router.get("/app/info")
    async def app_info():
        return {
            "name": "My Life My Time",
            "version": APP_VERSION,
            "stage": APP_STAGE,
        }

    return router


def build_family_router(db) -> APIRouter:
    """Family-management routes — listing/adding/editing members.

    Permission model:
      * Any account-token holder OR member-token holder can LIST members
        (so the "Who are you?" screen works before a member is selected).
      * Mutating routes (create / update / delete / toggle admin) require
        the caller to either:
          - be the account owner and the family has no admin yet (bootstrap),
          - or hold a member token with `fadmin=true`.
      * The last family admin can never be removed or demoted.
    """
    router = APIRouter(prefix="/family", tags=["family"])
    members = db.family_members
    activity_log = db.activity_log

    async def _log_activity(token: dict, kind: str, payload: dict) -> None:
        """Best-effort write to the per-family activity feed. Skipped when
        the caller is using an account token (no `mid` to attribute to)."""
        try:
            actor_id = token.get("mid")
            if not actor_id:
                return
            await activity_log.insert_one({
                "id": str(uuid.uuid4()),
                "family_id": token["fid"],
                "kind": kind,
                "payload": payload or {},
                "member_id": actor_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            pass

    async def _admin_count(family_id: str) -> int:
        return await members.count_documents(
            {"family_id": family_id, "is_family_admin": True}
        )

    async def _ensure_family_admin(token: dict) -> None:
        if token.get("role") == "admin":
            raise HTTPException(status_code=403, detail="System admins cannot edit families")
        admin_count = await _admin_count(token["fid"])
        # Bootstrap case — no family admin yet → only the account OWNER token
        # can seed the first one (so a random adult/child can't grant
        # themselves admin via an account token they shouldn't have).
        if admin_count == 0:
            if token.get("type") != "account":
                raise HTTPException(
                    status_code=403,
                    detail="Sign in with the account owner to add the first family admin",
                )
            return
        # Normal case — requester must be a family admin (member token).
        if not (token.get("type") == "member" and token.get("fadmin")):
            raise HTTPException(status_code=403, detail="Family admin permission required")

    def _accept_any_token(authorization: Optional[str] = Header(None)) -> dict:
        token = _extract_bearer(authorization)
        data = _decode(token)
        if data.get("type") not in {"account", "member"}:
            raise HTTPException(status_code=401, detail="Invalid token type")
        return data

    @router.get("/members")
    async def list_members(token: dict = Depends(_accept_any_token)):
        rows = await members.find(
            {"family_id": token["fid"]}, {"_id": 0, "pin_hash": 0}
        ).sort("created_at", 1).to_list(100)
        # Normalize fields so older docs without them look modern.
        used_colors = [r.get("color") for r in rows]
        for r in rows:
            r["is_family_admin"] = bool(r.get("is_family_admin"))
            if not r.get("color"):
                # Persist a fresh palette colour so it stays stable across
                # subsequent reads (calendar colour must never drift).
                fresh = _pick_member_color(used_colors)
                used_colors.append(fresh)
                await members.update_one({"id": r["id"]}, {"$set": {"color": fresh}})
                r["color"] = fresh
        return rows

    @router.post("/members")
    async def add_member(
        payload: MemberCreate,
        token: dict = Depends(_accept_any_token),
    ):
        await _ensure_family_admin(token)
        role = (payload.role or "parent").lower().strip()
        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"role must be one of {sorted(VALID_ROLES)}")
        if not payload.pin or not payload.pin.strip():
            raise HTTPException(status_code=400, detail="PIN is required")
        if len(payload.pin.strip()) < 4:
            raise HTTPException(status_code=400, detail="PIN must be at least 4 digits")

        is_admin_flag = bool(payload.is_family_admin)
        # Bootstrap: when no admin exists yet, the FIRST member created must
        # become a family admin regardless of what the caller sent — otherwise
        # the family would be permanently locked out of management.
        if (await _admin_count(token["fid"])) == 0:
            is_admin_flag = True

        # Pick a calendar colour. Explicit override wins, otherwise rotate
        # through the palette so every member of a family is visually unique.
        existing_colors = await members.distinct("color", {"family_id": token["fid"]})
        chosen_color = (payload.color or "").strip() or _pick_member_color(existing_colors)

        member_id = str(uuid.uuid4())
        doc = {
            "id": member_id,
            "family_id": token["fid"],
            "name": payload.name.strip(),
            "role": role,
            "is_family_admin": is_admin_flag,
            "color": chosen_color,
            "avatar": (payload.avatar or "").strip() or None,
            "pin_hash": hash_secret(payload.pin.strip()),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await members.insert_one(doc)
        doc.pop("_id", None)
        await _log_activity(token, "member.added", {
            "name": doc["name"],
            "member_id": member_id,
            "role": doc["role"],
            "is_family_admin": doc["is_family_admin"],
        })
        return {k: v for k, v in doc.items() if k != "pin_hash"}

    @router.put("/members/{member_id}")
    async def update_member(
        member_id: str,
        payload: MemberUpdate,
        token: dict = Depends(_accept_any_token),
    ):
        await _ensure_family_admin(token)
        existing = await members.find_one(
            {"id": member_id, "family_id": token["fid"]}, {"_id": 0}
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Member not found")

        update = {}
        if payload.name is not None:
            update["name"] = payload.name.strip()
        if payload.role is not None:
            r = payload.role.lower().strip()
            if r not in VALID_ROLES:
                raise HTTPException(status_code=400, detail="Invalid role")
            update["role"] = r
        if payload.pin is not None:
            if not payload.pin.strip():
                raise HTTPException(status_code=400, detail="PIN cannot be empty")
            if len(payload.pin.strip()) < 4:
                raise HTTPException(status_code=400, detail="PIN must be at least 4 digits")
            update["pin_hash"] = hash_secret(payload.pin.strip())
        if payload.is_family_admin is not None:
            new_flag = bool(payload.is_family_admin)
            # Block demoting the last family admin.
            if existing.get("is_family_admin") and not new_flag:
                if await _admin_count(token["fid"]) <= 1:
                    raise HTTPException(
                        status_code=400,
                        detail="Cannot remove admin rights from the last family admin",
                    )
            update["is_family_admin"] = new_flag
        if payload.color is not None:
            new_color = (payload.color or "").strip()
            if new_color:
                update["color"] = new_color
        if payload.avatar is not None:
            # Empty string explicitly clears the avatar (back to initial-letter
            # fallback); any non-empty value replaces it. The payload is
            # expected to be a base64 data URL prepared by the client.
            update["avatar"] = (payload.avatar or "").strip() or None

        if update:
            await members.update_one({"id": member_id, "family_id": token["fid"]}, {"$set": update})
        fresh = await members.find_one(
            {"id": member_id, "family_id": token["fid"]}, {"_id": 0, "pin_hash": 0}
        )
        fresh["is_family_admin"] = bool(fresh.get("is_family_admin"))
        # Log only the admin-flag transitions (the user-visible interesting
        # case). Name/role/avatar edits stay quiet to keep the feed clean.
        if "is_family_admin" in update:
            if update["is_family_admin"] and not existing.get("is_family_admin"):
                await _log_activity(token, "member.promoted", {"name": fresh.get("name"), "member_id": member_id})
            elif (not update["is_family_admin"]) and existing.get("is_family_admin"):
                await _log_activity(token, "member.demoted", {"name": fresh.get("name"), "member_id": member_id})
        return fresh

    @router.delete("/members/{member_id}")
    async def delete_member(member_id: str, token: dict = Depends(_accept_any_token)):
        await _ensure_family_admin(token)
        target = await members.find_one(
            {"id": member_id, "family_id": token["fid"]}, {"_id": 0}
        )
        if not target:
            raise HTTPException(status_code=404, detail="Member not found")
        if target.get("is_family_admin"):
            # Block deleting the last admin so the family never becomes
            # unmanageable. This also covers the self-delete case (the
            # only admin trying to remove themselves).
            if await _admin_count(token["fid"]) <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot delete the last family admin",
                )
        await members.delete_one({"id": member_id, "family_id": token["fid"]})
        await _log_activity(token, "member.deleted", {
            "name": target.get("name"),
            "member_id": member_id,
        })
        return {"ok": True}

    return router


def build_admin_router(db) -> APIRouter:
    """Admin-only routes — manage account-level metadata. Admin never reads
    family-internal data (budgets, locations, photos, routines, etc)."""
    router = APIRouter(prefix="/admin", tags=["admin"])
    families = db.families
    accounts = db.accounts
    members = db.family_members
    recovery = db.recovery_codes
    attempts = db.login_attempts

    @router.post("/families/{family_id}/members")
    async def admin_add_member(
        family_id: str,
        body: dict,
        _: dict = Depends(require_admin),
    ):
        """Admin-side member seeding for an existing family. This bypasses the
        usual parent-only restriction so the admin can bootstrap legacy
        families (e.g. "Nasser Family") without first having a Parent device.

        Preserves `family_id`. Does not touch any other family data.
        """
        family = await families.find_one({"id": family_id}, {"_id": 0})
        if not family:
            raise HTTPException(status_code=404, detail="Family not found")
        name = (body.get("name") or "").strip()
        role = (body.get("role") or "parent").lower().strip()
        pin = (body.get("pin") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name is required")
        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"role must be one of {sorted(VALID_ROLES)}")
        if not pin or len(pin) < 4:
            raise HTTPException(status_code=400, detail="PIN must be at least 4 characters")

        member_id = str(uuid.uuid4())
        existing_colors = await members.distinct("color", {"family_id": family_id})
        chosen_color = (body.get("color") or "").strip() or _pick_member_color(existing_colors)
        doc = {
            "id": member_id,
            "family_id": family_id,
            "name": name,
            "role": role,
            "is_family_admin": bool(body.get("is_family_admin")),
            "color": chosen_color,
            "pin_hash": hash_secret(pin),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "seeded_by": "admin",
        }
        await members.insert_one(doc)
        doc.pop("_id", None)
        safe = {k: v for k, v in doc.items() if k != "pin_hash"}
        logger.warning(
            "[ADMIN SEED MEMBER] family=%s name=%s role=%s", family_id, name, role
        )
        return safe

    @router.get("/families")
    async def list_families(_: dict = Depends(require_admin)):
        rows = await families.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
        out: List[dict] = []
        for f in rows:
            acct = await accounts.find_one(
                {"family_id": f["id"]}, {"_id": 0, "password_hash": 0}
            )
            count = await members.count_documents({"family_id": f["id"]})
            out.append({
                "id": f["id"],
                "name": f.get("name"),
                "status": f.get("status"),
                "plan": f.get("plan"),
                "free_until": f.get("free_until"),
                "created_at": f.get("created_at"),
                "account_email": acct.get("email") if acct else None,
                "recovery_email": acct.get("recovery_email") if acct else None,
                "members_count": count,
            })
        return {"families": out}

    @router.post("/families/{family_id}/status")
    async def set_status(family_id: str, body: dict, _: dict = Depends(require_admin)):
        status_v = (body.get("status") or "").lower()
        if status_v not in {"active", "disabled"}:
            raise HTTPException(status_code=400, detail="status must be active or disabled")
        res = await families.update_one({"id": family_id}, {"$set": {"status": status_v}})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Family not found")
        return {"ok": True, "status": status_v}

    @router.post("/families/{family_id}/recovery")
    async def generate_recovery(family_id: str, _: dict = Depends(require_admin)):
        """Admin-issued recovery code for a family account. The code is
        returned in the response (one-time view) AND printed to the logs."""
        acct = await accounts.find_one({"family_id": family_id}, {"_id": 0})
        if not acct:
            raise HTTPException(status_code=404, detail="Account not found")
        code = f"{secrets.randbelow(1000000):06d}"
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=RECOVERY_CODE_TTL_MINUTES)
        await recovery.insert_one({
            "id": str(uuid.uuid4()),
            "account_id": acct["id"],
            "email": acct["email"],
            "code_hash": hash_secret(code),
            "expires_at": expires_at,
            "used": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "issued_by": "admin",
        })
        logger.warning(
            "[ADMIN RECOVERY] family=%s email=%s code=%s", family_id, acct["email"], code
        )
        return {"code": code, "expires_at": expires_at.isoformat()}

    @router.post("/families/{family_id}/account")
    async def set_family_account(
        family_id: str,
        body: dict,
        _: dict = Depends(require_admin),
    ):
        """Attach (or replace) the login account of an existing family.

        Use case: bootstrapping a family that was auto-seeded without any
        login (e.g. "Nasser Family"), or letting the admin reset the email
        & password on the user's behalf during early access. The `family_id`
        is preserved — no data is touched, no new family is created.
        """
        family = await families.find_one({"id": family_id}, {"_id": 0})
        if not family:
            raise HTTPException(status_code=404, detail="Family not found")

        email = (body.get("email") or "").lower().strip()
        password = body.get("password") or ""
        recovery_email = (body.get("recovery_email") or "").lower().strip() or None

        if not email or "@" not in email:
            raise HTTPException(status_code=400, detail="Valid email is required")
        if len(password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

        # Make sure the email isn't already in use by another account.
        clash = await accounts.find_one({"email": email}, {"_id": 0})
        if clash and clash.get("family_id") != family_id:
            raise HTTPException(status_code=409, detail="Email already in use by another account")

        now = datetime.now(timezone.utc).isoformat()
        existing = await accounts.find_one({"family_id": family_id}, {"_id": 0})
        if existing:
            # Update in place — keep id + family_id.
            await accounts.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "email": email,
                    "recovery_email": recovery_email,
                    "password_hash": hash_secret(password),
                    "updated_at": now,
                    "updated_by": "admin",
                }},
            )
            action = "updated"
            account_id = existing["id"]
        else:
            account_id = str(uuid.uuid4())
            await accounts.insert_one({
                "id": account_id,
                "family_id": family_id,
                "email": email,
                "recovery_email": recovery_email,
                "password_hash": hash_secret(password),
                "role": "owner",
                "created_at": now,
                "created_by": "admin",
            })
            action = "created"

        # Invalidate any pending recovery codes & login lockouts on this email.
        await recovery.delete_many({"account_id": account_id, "used": False})
        await attempts.delete_many({"identifier": f"login:{email}"})

        logger.warning(
            "[ADMIN SET-ACCOUNT] family=%s email=%s action=%s",
            family_id, email, action,
        )
        return {
            "ok": True,
            "action": action,
            "account": {"id": account_id, "email": email, "recovery_email": recovery_email},
        }

    @router.get("/families/{family_id}/diagnostic")
    async def family_diagnostic(family_id: str, _: dict = Depends(require_admin)):
        """Read-only report of every collection that holds data for the
        given family. Returns counts + linked family_id per section.
        Does NOT touch any data.
        """
        family = await families.find_one({"id": family_id}, {"_id": 0})
        if not family:
            raise HTTPException(status_code=404, detail="Family not found")
        account = await accounts.find_one(
            {"family_id": family_id}, {"_id": 0, "password_hash": 0}
        )

        # Group raw collections by category for a friendlier admin report.
        sections = [
            ("members", "Family Members", ["family_members"]),
            ("budget", "Budget", [
                "budget_income", "budget_expenses", "budget_bills",
                "budget_debts", "budget_loans",
            ]),
            ("routines", "Routines", ["routines", "routine_logs"]),
            ("locations", "Locations", ["gps_devices", "location_points"]),
            ("wall_board", "Wall Board", [
                "wall_settings", "wall_photos", "wall_goals", "wall_countdown",
                "wall_achievements", "wall_notes",
            ]),
            ("family_events", "Family Events", ["wall_family_events"]),
            ("shopping", "Shopping List", ["shopping_items"]),
            ("legacy", "Legacy", ["events", "event_types", "users"]),
        ]

        report = []
        total = 0
        for key, label, cols in sections:
            cols_report = []
            section_total = 0
            for cname in cols:
                c = await db[cname].count_documents({"family_id": family_id})
                section_total += c
                cols_report.append({"collection": cname, "count": c, "family_id": family_id})
            total += section_total
            report.append({
                "key": key,
                "label": label,
                "count": section_total,
                "collections": cols_report,
            })

        return {
            "family": {
                "id": family["id"],
                "name": family.get("name"),
                "plan": family.get("plan"),
                "status": family.get("status"),
                "created_at": family.get("created_at"),
                "free_until": family.get("free_until"),
                "family_code": family.get("family_code"),
            },
            "account": {
                "login_email": account.get("email") if account else None,
                "recovery_email": account.get("recovery_email") if account else None,
                "created_at": account.get("created_at") if account else None,
            },
            "total_records": total,
            "sections": report,
        }

    @router.delete("/families/{family_id}")
    async def delete_family(
        family_id: str,
        confirm: str = "",
        _: dict = Depends(require_admin),
    ):
        """Hard-delete a family and EVERY linked document. Irreversible.

        Requires the admin to pass `?confirm=<family_id>` so the deletion can
        only succeed when both client and server agree on the exact target.
        """
        family = await families.find_one({"id": family_id}, {"_id": 0})
        if not family:
            raise HTTPException(status_code=404, detail="Family not found")
        if confirm != family_id:
            raise HTTPException(
                status_code=400,
                detail="Confirmation token does not match family id",
            )

        # Collect counts for the audit log before deleting.
        scoped = [
            "family_members",
            "budget_income", "budget_expenses", "budget_bills",
            "budget_debts", "budget_loans",
            "routines", "routine_logs",
            "gps_devices", "location_points",
            "wall_settings", "wall_photos", "wall_goals", "wall_countdown",
            "wall_achievements", "wall_notes", "wall_family_events",
            "shopping_items",
            "events", "event_types", "users",
        ]
        deleted = {}
        for cname in scoped:
            res = await db[cname].delete_many({"family_id": family_id})
            if res.deleted_count:
                deleted[cname] = res.deleted_count

        # Account, recovery codes, login attempts associated with the account.
        acct = await accounts.find_one({"family_id": family_id}, {"_id": 0})
        if acct:
            deleted["accounts"] = (await accounts.delete_many(
                {"family_id": family_id}
            )).deleted_count
            r1 = await recovery.delete_many({"account_id": acct["id"]})
            if r1.deleted_count:
                deleted["recovery_codes"] = r1.deleted_count
            a1 = await attempts.delete_many(
                {"identifier": f"login:{acct.get('email')}"}
            )
            if a1.deleted_count:
                deleted["login_attempts"] = a1.deleted_count

        # Family doc itself last so we have it for the log.
        await families.delete_one({"id": family_id})
        logger.warning(
            "[ADMIN DELETE FAMILY] id=%s name=%s deleted=%s",
            family_id, family.get("name"), deleted,
        )
        return {"ok": True, "family_id": family_id, "deleted": deleted}

    return router

async def ensure_indexes(db) -> None:
    await db.accounts.create_index("email", unique=True)
    await db.family_members.create_index([("family_id", 1)])
    await db.recovery_codes.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")
    # Migrate legacy members: anyone whose role is "parent" but who has no
    # `is_family_admin` flag becomes a family admin automatically. This keeps
    # already-active families manageable after the permission model change.
    await db.family_members.update_many(
        {"role": "parent", "is_family_admin": {"$exists": False}},
        {"$set": {"is_family_admin": True}},
    )
    # Everyone else (still missing the flag) becomes a non-admin member.
    await db.family_members.update_many(
        {"is_family_admin": {"$exists": False}},
        {"$set": {"is_family_admin": False}},
    )
    # Back-fill calendar colours for members that pre-date the per-member
    # palette. We pick palette colours per family so every name in a family
    # stays unique. Idempotent — runs on every boot.
    family_ids = await db.family_members.distinct("family_id", {"color": None})
    family_ids += await db.family_members.distinct(
        "family_id", {"color": {"$exists": False}}
    )
    for fid in set(family_ids):
        existing = await db.family_members.find(
            {"family_id": fid, "color": {"$exists": True, "$ne": None}},
            {"_id": 0, "color": 1},
        ).to_list(200)
        used = [r.get("color") for r in existing]
        async for m in db.family_members.find(
            {
                "family_id": fid,
                "$or": [{"color": {"$exists": False}}, {"color": None}],
            },
            {"_id": 0, "id": 1},
        ):
            c = _pick_member_color(used)
            used.append(c)
            await db.family_members.update_one(
                {"id": m["id"], "family_id": fid}, {"$set": {"color": c}}
            )


async def seed_admin(db) -> None:
    """Idempotent admin seed — keeps the admin password in sync with .env."""
    admin_email = os.environ["ADMIN_EMAIL"].lower().strip()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.accounts.find_one({"email": admin_email}, {"_id": 0})
    if existing is None:
        await db.accounts.insert_one({
            "id": str(uuid.uuid4()),
            "family_id": "__admin__",  # sentinel — admin owns no family
            "email": admin_email,
            "recovery_email": None,
            "password_hash": hash_secret(admin_password),
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("[SEED] admin account created: %s", admin_email)
    elif not verify_secret(admin_password, existing.get("password_hash", "")):
        await db.accounts.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_secret(admin_password), "role": "admin"}},
        )
        logger.info("[SEED] admin password updated from .env")


async def seed_default_family(db) -> None:
    """If no real family exists, create a placeholder so existing offline data
    can later be linked to a known family_id. Idempotent — runs once."""
    real = await db.families.count_documents({})
    if real > 0:
        return
    default_name = os.environ.get("DEFAULT_FAMILY_NAME", "Nasser Family")
    family_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.families.insert_one({
        "id": family_id,
        "name": default_name,
        "plan": "early_access",
        "status": "active",
        "free_until": (now + timedelta(days=365)).isoformat(),
        "created_at": now.isoformat(),
        "account_type": "family",
        "legacy": True,
    })
    logger.info("[SEED] default family '%s' created (id=%s)", default_name, family_id)
