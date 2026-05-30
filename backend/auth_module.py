"""Multi-tenant auth + family management for My Family My Life.

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

VALID_ROLES = {"parent", "adult", "child", "other"}
ACCOUNT_TYPES = {"family", "single"}  # "single" is reserved for future use


# ---------- Pydantic models ----------

class RegisterPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    family_name: str
    email: EmailStr
    password: str
    confirm_password: str
    recovery_email: Optional[EmailStr] = None
    account_type: str = "family"


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class ForgotPayload(BaseModel):
    email: EmailStr


class ResetPayload(BaseModel):
    code: str
    new_password: str


class MemberCreate(BaseModel):
    name: str
    role: str
    pin: str


class MemberUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    pin: Optional[str] = None


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


def create_member_token(account_id: str, family_id: str, member_id: str, member_role: str) -> str:
    return _encode_token(
        {
            "type": "member",
            "sub": account_id,
            "fid": family_id,
            "mid": member_id,
            "mrole": member_role,
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
        })

        token = create_account_token(account_id, family_id, "owner")
        return {
            "access_token": token,
            "token_type": "bearer",
            "account": {"id": account_id, "email": email, "role": "owner"},
            "family": family_doc,
        }

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
        role = account.get("role", "owner")
        family = None
        if role != "admin":
            family = await families.find_one({"id": account["family_id"]}, {"_id": 0})
            if not family:
                raise HTTPException(status_code=404, detail="Family not found")
            if family.get("status") != "active":
                raise HTTPException(status_code=403, detail="Family account disabled")
        token = create_account_token(account["id"], account["family_id"], role)
        return {
            "access_token": token,
            "token_type": "bearer",
            "account": {"id": account["id"], "email": account["email"], "role": role},
            "family": family,
        }

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
            token["sub"], token["fid"], member["id"], member.get("role", "other")
        )
        safe = {k: v for k, v in member.items() if k != "pin_hash"}
        return {
            "member_token": member_token,
            "token_type": "bearer",
            "member": safe,
        }

    return router


def build_family_router(db) -> APIRouter:
    """Family-management routes — listing/adding/editing members. Parent-only
    for create/update/delete; any account-token holder can list."""
    router = APIRouter(prefix="/family", tags=["family"])
    members = db.family_members

    async def _ensure_parent(token: dict) -> None:
        """For account-token-based access we treat the owner of the account
        as the implicit parent. Once a parent member exists, only parents
        can manage other members."""
        if token.get("role") == "admin":
            raise HTTPException(status_code=403, detail="Admins cannot edit families")
        parent_exists = await members.find_one(
            {"family_id": token["fid"], "role": "parent"}, {"_id": 0}
        )
        # If no parent member exists yet, the first member created by the
        # account owner is bootstrap-allowed (so they can seed Parent #1).
        if not parent_exists:
            return
        # Once parents exist, the device must be in a parent member session.
        if token.get("type") != "member" or token.get("mrole") != "parent":
            raise HTTPException(status_code=403, detail="Only parents can manage members")

    def _accept_any_token(authorization: Optional[str] = Header(None)) -> dict:
        token = _extract_bearer(authorization)
        data = _decode(token)
        if data.get("type") not in {"account", "member"}:
            raise HTTPException(status_code=401, detail="Invalid token type")
        return data

    @router.get("/members")
    async def list_members(token: dict = Depends(_accept_any_token)):
        # Children only see basic name+role of others (no PIN exposed ever).
        rows = await members.find(
            {"family_id": token["fid"]}, {"_id": 0, "pin_hash": 0}
        ).sort("created_at", 1).to_list(100)
        return rows

    @router.post("/members")
    async def add_member(
        payload: MemberCreate,
        token: dict = Depends(_accept_any_token),
    ):
        await _ensure_parent(token)
        role = payload.role.lower().strip()
        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"role must be one of {sorted(VALID_ROLES)}")
        if not payload.pin or not payload.pin.strip():
            raise HTTPException(status_code=400, detail="PIN is required")
        member_id = str(uuid.uuid4())
        doc = {
            "id": member_id,
            "family_id": token["fid"],
            "name": payload.name.strip(),
            "role": role,
            "pin_hash": hash_secret(payload.pin.strip()),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await members.insert_one(doc)
        doc.pop("_id", None)
        safe = {k: v for k, v in doc.items() if k != "pin_hash"}
        return safe

    @router.put("/members/{member_id}")
    async def update_member(
        member_id: str,
        payload: MemberUpdate,
        token: dict = Depends(_accept_any_token),
    ):
        await _ensure_parent(token)
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
            update["pin_hash"] = hash_secret(payload.pin.strip())
        if update:
            await members.update_one({"id": member_id}, {"$set": update})
        fresh = await members.find_one({"id": member_id}, {"_id": 0, "pin_hash": 0})
        return fresh

    @router.delete("/members/{member_id}")
    async def delete_member(member_id: str, token: dict = Depends(_accept_any_token)):
        await _ensure_parent(token)
        # Prevent removing the last parent — keeps the family manageable.
        target = await members.find_one(
            {"id": member_id, "family_id": token["fid"]}, {"_id": 0}
        )
        if not target:
            raise HTTPException(status_code=404, detail="Member not found")
        if target.get("role") == "parent":
            parents = await members.count_documents(
                {"family_id": token["fid"], "role": "parent"}
            )
            if parents <= 1:
                raise HTTPException(status_code=400, detail="Cannot remove the last parent")
        await members.delete_one({"id": member_id, "family_id": token["fid"]})
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
        doc = {
            "id": member_id,
            "family_id": family_id,
            "name": name,
            "role": role,
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
