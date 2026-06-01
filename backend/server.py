from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
import asyncio
from datetime import datetime, timezone, timedelta
from calendar import monthrange


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
raw_db = client[os.environ['DB_NAME']]

# Tenant isolation layer.
from tenant import (
    ScopedDB, install_middleware as install_tenant_middleware,
    resolve_family_by_code, current_family_id,
)
db = ScopedDB(raw_db)

# Create the main app without a prefix
app = FastAPI()

# Install the tenant middleware BEFORE any router so it sets the family
# context for every /api/* call.
install_tenant_middleware(app, os.environ['JWT_SECRET'], db=raw_db)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Multi-tenant auth routers (defined in /app/backend/auth_module.py).
from auth_module import (
    build_auth_router,
    build_family_router,
    build_admin_router,
    ensure_indexes as auth_ensure_indexes,
    seed_admin as auth_seed_admin,
    seed_default_family as auth_seed_default_family,
    require_member_token,
    require_account_token,
    require_active_account_token_async,
    require_admin,
    hash_secret,
    verify_secret,
)

# Auth/admin routers need cross-tenant access → raw_db, not the scoped wrapper.
api_router.include_router(build_auth_router(raw_db))
api_router.include_router(build_family_router(raw_db))
api_router.include_router(build_admin_router(raw_db))


# ============= Models =============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    role: str  # "wife" or "husband"
    color: str


class EventType(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: str
    abbreviation: Optional[str] = ""
    description: Optional[str] = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class EventTypeCreate(BaseModel):
    name: str
    color: str
    abbreviation: Optional[str] = ""
    description: Optional[str] = ""


class EventTypeUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    abbreviation: Optional[str] = None
    description: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None


class Event(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    user_id: str  # owner — family_members.id (legacy fallback for very old rows: 'wife'/'husband')
    owner_member_id: Optional[str] = None  # mirrors user_id for new rows; canonical going forward
    type_id: Optional[str] = None
    color: str
    date: str  # ISO date YYYY-MM-DD
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class EventCreate(BaseModel):
    title: str
    user_id: Optional[str] = None  # if omitted, server defaults to caller
    owner_member_id: Optional[str] = None  # alias of user_id; either is fine
    type_id: Optional[str] = None
    color: str
    date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    notes: Optional[str] = ""


class EventUpdate(BaseModel):
    title: Optional[str] = None
    user_id: Optional[str] = None
    type_id: Optional[str] = None
    color: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    notes: Optional[str] = None


# ============= Wall Board Models =============

class WallSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    # Defaults are empty so the frontend can fall back to localized
    # placeholders (`t("hero.defaultTitle")` / `.single`). When a user
    # explicitly saves a custom string we store it verbatim; the empty
    # default means "use the current language's wording".
    hero_title: str = ""
    hero_subtitle: str = ""
    hero_photo: Optional[str] = None  # base64 data URL or remote URL
    message_title: str = ""
    message_text: str = ""


class WallSettingsUpdate(BaseModel):
    hero_title: Optional[str] = None
    hero_subtitle: Optional[str] = None
    hero_photo: Optional[str] = None
    message_title: Optional[str] = None
    message_text: Optional[str] = None


class WallPhoto(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    image: str  # base64 data URL
    title: Optional[str] = ""
    caption: Optional[str] = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class WallPhotoCreate(BaseModel):
    image: str
    title: Optional[str] = ""
    caption: Optional[str] = ""


class WallPhotoUpdate(BaseModel):
    title: Optional[str] = None
    caption: Optional[str] = None


class WallGoal(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str
    icon: Optional[str] = "Target"
    done: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None
    archived_at: Optional[str] = None


class WallGoalCreate(BaseModel):
    label: str
    icon: Optional[str] = "Target"
    done: bool = False


class WallGoalUpdate(BaseModel):
    label: Optional[str] = None
    icon: Optional[str] = None
    done: Optional[bool] = None
    archived: Optional[bool] = None  # convenience flag → sets/clears archived_at


class WallCountdown(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str
    date: str  # YYYY-MM-DD
    icon: Optional[str] = "Heart"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class WallCountdownCreate(BaseModel):
    label: str
    date: str
    icon: Optional[str] = "Heart"


class WallCountdownUpdate(BaseModel):
    label: Optional[str] = None
    date: Optional[str] = None
    icon: Optional[str] = None


class WallAchievement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    note: Optional[str] = ""
    image: Optional[str] = None  # base64 data URL or None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class WallAchievementCreate(BaseModel):
    name: str
    note: Optional[str] = ""
    image: Optional[str] = None


class WallAchievementUpdate(BaseModel):
    name: Optional[str] = None
    note: Optional[str] = None
    image: Optional[str] = None


class WallNote(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    color: str = "#60A5FA"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class WallNoteCreate(BaseModel):
    text: str
    color: Optional[str] = "#60A5FA"


class WallNoteUpdate(BaseModel):
    text: Optional[str] = None
    color: Optional[str] = None


class WallFamilyEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    date: str  # YYYY-MM-DD
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class WallFamilyEventCreate(BaseModel):
    title: str
    date: str
    notes: Optional[str] = ""


class WallFamilyEventUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    notes: Optional[str] = None


# ============= Family Location Models =============

class LocationUpdate(BaseModel):
    """Payload sent by the Android sender app on every location ping."""
    model_config = ConfigDict(extra="ignore")
    familyCode: str
    memberId: str
    memberName: Optional[str] = None
    profileImage: Optional[str] = None
    deviceId: Optional[str] = None
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    battery: Optional[float] = None
    timestamp: Optional[str] = None  # ISO string; server falls back to now()
    trackingStatus: Optional[str] = None  # e.g. "active", "paused"
    networkStatus: Optional[str] = None   # "online" | "offline"
    connectionType: Optional[str] = None  # "wifi" | "mobile" | "unknown"


class FamilyMemberOut(BaseModel):
    id: str
    name: Optional[str] = None
    profileImage: Optional[str] = None
    deviceId: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    battery: Optional[float] = None
    lastUpdate: Optional[str] = None
    trackingStatus: Optional[str] = None
    networkStatus: Optional[str] = None
    connectionType: Optional[str] = None


class LocationPointOut(BaseModel):
    memberId: str
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    battery: Optional[float] = None
    timestamp: str
    networkStatus: Optional[str] = None
    connectionType: Optional[str] = None


# ============= Startup: seed users (RETIRED) =============
# The legacy `users` collection (with the singleton wife / husband rows) was
# the heart of the original single-family build. Multi-tenant migration
# moved every flow over to `family_members`, but this seeder still ran on
# every boot and re-created the legacy entries — which then leaked into the
# first family that issued a request (the ScopedCollection upsert pinned
# them to whichever family was active). The hook is removed; the rows
# survive only inside Nasser Family for historical reference.


# ============= Routes =============

@api_router.get("/")
async def root():
    return {"message": "My Life My Time API"}


# ============= Public branding (email logo) =============
# Email clients fetch this URL on behalf of the recipient — it must be
# reachable without any auth header.

@api_router.get("/branding/email-logo")
async def public_email_logo():
    """Return the admin-uploaded email logo, or 302-redirect to the static
    fallback shipped with the frontend (`/logo512.png`). Cache for an
    hour so Gmail's image proxy doesn't refetch on every open."""
    import base64
    from fastapi.responses import Response, RedirectResponse
    doc = await raw_db.email_settings.find_one(
        {"_key": "global"},
        {"_id": 0, "brand_logo_data": 1, "brand_logo_mime": 1, "brand_logo_updated_at": 1},
    )
    if doc and doc.get("brand_logo_data"):
        try:
            blob = base64.b64decode(doc["brand_logo_data"])
        except Exception:  # pragma: no cover — settings invariants protect us
            blob = None
        if blob:
            return Response(
                content=blob,
                media_type=doc.get("brand_logo_mime") or "image/png",
                headers={
                    "Cache-Control": "public, max-age=3600",
                    "ETag": f'"{doc.get("brand_logo_updated_at") or "0"}"',
                },
            )
    # No custom upload → redirect to the static frontend logo. Email clients
    # follow 302s; modern browsers cache them too.
    public_base = (os.environ.get("PUBLIC_APP_URL") or "https://mylife-mytime.com").rstrip("/")
    return RedirectResponse(url=f"{public_base}/logo512.png", status_code=302)


# ============= Legacy users / family-code endpoints (REMOVED in Feb 2026) =====
# The single-shared-family-code login flow and the legacy `users` collection
# (wife / husband) have been retired. Every page now reads from
# /api/family/members and authenticates via a per-account JWT. The endpoints
# below intentionally return 410 Gone so any straggler client still calling
# them gets a clear, observable failure instead of silently being routed
# through a non-tenant-scoped code path.


class FamilyCodeVerify(BaseModel):
    code: str


@api_router.post("/auth/verify")
async def verify_family_code(payload: FamilyCodeVerify):  # noqa: ARG001 — kept for 410 shape
    raise HTTPException(
        status_code=410,
        detail="Family-code login was retired. Use /api/auth/login with email + password.",
    )


@api_router.get("/users")
async def get_users():
    raise HTTPException(
        status_code=410,
        detail="The shared /api/users endpoint was retired. Use /api/family/members.",
    )


@api_router.put("/users/{user_id}")
async def update_user(user_id: str):  # noqa: ARG001 — kept for 410 shape
    raise HTTPException(
        status_code=410,
        detail="The shared /api/users endpoint was retired. Use /api/family/members.",
    )


# Event Types — every endpoint now requires a member token so the tenant
# middleware can scope the request. Without this an unauthenticated request
# would 401 only on the first scoped query, which has historically been a
# subtle defence-in-depth gap.
@api_router.get("/event-types", response_model=List[EventType])
async def list_event_types(token: dict = Depends(require_member_token)):  # noqa: ARG001
    items = await db.event_types.find({}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return items


@api_router.post("/event-types", response_model=EventType)
async def create_event_type(
    payload: EventTypeCreate, token: dict = Depends(require_member_token)  # noqa: ARG001
):
    obj = EventType(**payload.model_dump())
    await db.event_types.insert_one(obj.model_dump())
    return obj


@api_router.put("/event-types/{type_id}", response_model=EventType)
async def update_event_type(
    type_id: str,
    payload: EventTypeUpdate,
    token: dict = Depends(require_member_token),  # noqa: ARG001
):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        existing = await db.event_types.find_one({"id": type_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        return existing
    result = await db.event_types.find_one_and_update(
        {"id": type_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not result:
        raise HTTPException(404, "Not found")
    return result


@api_router.delete("/event-types/{type_id}")
async def delete_event_type(
    type_id: str, token: dict = Depends(require_member_token)  # noqa: ARG001
):
    res = await db.event_types.delete_one({"id": type_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# Events
def _event_owner_id(ev: dict) -> Optional[str]:
    """Return the owner of an event regardless of which historical schema the
    document was stored in. Newer events carry `owner_member_id`; legacy ones
    only have `user_id` (e.g. literal 'wife' / 'husband' before the
    multi-member overhaul)."""
    return ev.get("owner_member_id") or ev.get("user_id")


def _normalize_owner_filter(
    token: dict, user_id: Optional[str], user_ids: Optional[str]
) -> Optional[List[str]]:
    """Resolve which owner ids the caller is allowed to query.

    - Non-admin members: forced to their own id, regardless of what they asked.
    - Family admins: any combination of ids (comma-separated `user_ids` or a
      single `user_id`); empty → no owner filter (every event in the family).
    """
    requested: List[str] = []
    if user_ids:
        requested = [x.strip() for x in user_ids.split(",") if x.strip()]
    elif user_id:
        requested = [user_id.strip()]

    is_admin = bool(token.get("fadmin"))
    self_id = token.get("mid")
    if not is_admin:
        # Members always see ONLY their own calendar by default.
        return [self_id] if self_id else []
    return requested or None  # admin + no filter = everyone


@api_router.get("/events", response_model=List[Event])
async def list_events(
    user_id: Optional[str] = None,
    user_ids: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    token: dict = Depends(require_member_token),
):
    query: dict = {}
    owners = _normalize_owner_filter(token, user_id, user_ids)
    if owners is not None:
        # Match either the new `owner_member_id` OR the legacy `user_id` so
        # un-migrated rows still surface for the right person.
        query["$or"] = [
            {"owner_member_id": {"$in": owners}},
            {"user_id": {"$in": owners}, "owner_member_id": {"$exists": False}},
        ]
    if month and year:
        prefix = f"{year:04d}-{month:02d}"
        query["date"] = {"$regex": f"^{prefix}"}
    items = await db.events.find(query, {"_id": 0}).to_list(5000)
    # Fill in owner_member_id from legacy user_id so the UI can always rely
    # on a single field.
    for it in items:
        if not it.get("owner_member_id") and it.get("user_id"):
            it["owner_member_id"] = it["user_id"]
    items.sort(key=lambda e: (e.get("date", ""), e.get("start_time") or ""))
    return items


@api_router.post("/events", response_model=Event)
async def create_event(
    payload: EventCreate, token: dict = Depends(require_member_token)
):
    data = payload.model_dump()
    # `user_id` from the request body carries the desired owner (legacy
    # frontend name). For non-admins this MUST match the caller's member id.
    requested_owner = (data.get("owner_member_id") or data.get("user_id") or "").strip()
    self_id = token.get("mid")
    is_admin = bool(token.get("fadmin"))
    if not requested_owner:
        requested_owner = self_id
    if not is_admin and requested_owner != self_id:
        raise HTTPException(
            status_code=403, detail="Only family admins can create events for someone else"
        )
    data["user_id"] = requested_owner
    data["owner_member_id"] = requested_owner
    obj = Event(**data)
    await db.events.insert_one(obj.model_dump())
    await log_activity(token, "event.created", {
        "title": obj.title,
        "date": obj.date,
        "owner_member_id": requested_owner,
        "event_id": obj.id,
    })
    return obj


async def _ensure_event_writable(event_id: str, token: dict) -> dict:
    """Fetch the event, then enforce that the caller is either its owner or
    a family admin. Raises 404 if the event does not belong to this family
    (scoped collection already filters by family_id)."""
    existing = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    if not bool(token.get("fadmin")):
        owner = _event_owner_id(existing)
        if owner and owner != token.get("mid"):
            raise HTTPException(
                status_code=403,
                detail="Only the event owner or a family admin can edit this event",
            )
    return existing


@api_router.put("/events/{event_id}", response_model=Event)
async def update_event(
    event_id: str,
    payload: EventUpdate,
    token: dict = Depends(require_member_token),
):
    existing = await _ensure_event_writable(event_id, token)
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        return existing
    # Allow re-assigning the owner only when the caller is a family admin.
    if "user_id" in update:
        new_owner = (update.get("user_id") or "").strip()
        if new_owner and new_owner != _event_owner_id(existing):
            if not bool(token.get("fadmin")):
                raise HTTPException(
                    status_code=403,
                    detail="Only family admins can reassign events",
                )
            update["owner_member_id"] = new_owner
    result = await db.events.find_one_and_update(
        {"id": event_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not result:
        raise HTTPException(404, "Not found")
    if not result.get("owner_member_id") and result.get("user_id"):
        result["owner_member_id"] = result["user_id"]
    return result


@api_router.delete("/events/{event_id}")
async def delete_event(
    event_id: str, token: dict = Depends(require_member_token)
):
    existing = await _ensure_event_writable(event_id, token)
    await db.events.delete_one({"id": event_id})
    await log_activity(token, "event.deleted", {
        "title": existing.get("title"),
        "date": existing.get("date"),
        "event_id": event_id,
    })
    return {"ok": True}


# ============= Wall Board Routes =============

WALL_SETTINGS_ID = "wall_settings_singleton"


@api_router.get("/wall/settings", response_model=WallSettings)
async def get_wall_settings():
    doc = await db.wall_settings.find_one({"id": WALL_SETTINGS_ID}, {"_id": 0})
    if not doc:
        defaults = WallSettings().model_dump()
        defaults["id"] = WALL_SETTINGS_ID
        await db.wall_settings.insert_one(defaults)
        defaults.pop("id", None)
        return defaults
    doc.pop("id", None)
    return doc


@api_router.put("/wall/settings", response_model=WallSettings)
async def update_wall_settings(payload: WallSettingsUpdate):
    # Use exclude_unset so that explicit `null` values (e.g. clearing the hero
    # photo) are persisted, while fields the client never mentioned stay
    # untouched.
    update = payload.model_dump(exclude_unset=True)
    if update:
        await db.wall_settings.update_one(
            {"id": WALL_SETTINGS_ID}, {"$set": update}, upsert=True
        )
    doc = await db.wall_settings.find_one({"id": WALL_SETTINGS_ID}, {"_id": 0}) or {}
    doc.pop("id", None)
    # Merge defaults to ensure all keys present
    merged = WallSettings().model_dump()
    for k, v in doc.items():
        merged[k] = v
    return merged


# --- Photos
@api_router.get("/wall/photos", response_model=List[WallPhoto])
async def list_wall_photos():
    items = await db.wall_photos.find({}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return items


@api_router.post("/wall/photos", response_model=WallPhoto)
async def create_wall_photo(payload: WallPhotoCreate):
    obj = WallPhoto(**payload.model_dump())
    await db.wall_photos.insert_one(obj.model_dump())
    return obj


@api_router.delete("/wall/photos/{photo_id}")
async def delete_wall_photo(photo_id: str):
    res = await db.wall_photos.delete_one({"id": photo_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@api_router.put("/wall/photos/{photo_id}", response_model=WallPhoto)
async def update_wall_photo(photo_id: str, payload: WallPhotoUpdate):
    update = payload.model_dump(exclude_unset=True)
    if not update:
        existing = await db.wall_photos.find_one({"id": photo_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        return existing
    res = await db.wall_photos.update_one({"id": photo_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    return await db.wall_photos.find_one({"id": photo_id}, {"_id": 0})


# --- Goals
@api_router.get("/wall/goals", response_model=List[WallGoal])
async def list_wall_goals(include_archived: bool = False):
    query: dict = {} if include_archived else {"archived_at": None}
    items = await db.wall_goals.find(query, {"_id": 0}).sort("created_at", 1).to_list(500)
    # Back-fill any older docs created before timestamp fields existed.
    for it in items:
        it.setdefault("updated_at", it.get("created_at"))
        it.setdefault("completed_at", None)
        it.setdefault("archived_at", None)
    return items


@api_router.post("/wall/goals", response_model=WallGoal)
async def create_wall_goal(payload: WallGoalCreate):
    obj = WallGoal(**payload.model_dump())
    await db.wall_goals.insert_one(obj.model_dump())
    return obj


@api_router.put("/wall/goals/{goal_id}", response_model=WallGoal)
async def update_wall_goal(goal_id: str, payload: WallGoalUpdate):
    existing = await db.wall_goals.find_one({"id": goal_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")

    data = payload.model_dump(exclude_unset=True)
    update: dict = {}
    now = datetime.now(timezone.utc).isoformat()

    if "label" in data:
        update["label"] = data["label"]
    if "icon" in data:
        update["icon"] = data["icon"]
    if "done" in data:
        update["done"] = bool(data["done"])
        # Stamp completed_at on transition to true; clear on transition to false.
        if data["done"] and not existing.get("done"):
            update["completed_at"] = now
        elif not data["done"] and existing.get("done"):
            update["completed_at"] = None
    if "archived" in data:
        if data["archived"]:
            update["archived_at"] = now
        else:
            update["archived_at"] = None

    update["updated_at"] = now

    await db.wall_goals.update_one({"id": goal_id}, {"$set": update})
    doc = await db.wall_goals.find_one({"id": goal_id}, {"_id": 0})
    doc.setdefault("updated_at", doc.get("created_at"))
    doc.setdefault("completed_at", None)
    doc.setdefault("archived_at", None)
    return doc


@api_router.delete("/wall/goals/{goal_id}")
async def delete_wall_goal(goal_id: str):
    res = await db.wall_goals.delete_one({"id": goal_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# --- Countdown
@api_router.get("/wall/countdown", response_model=List[WallCountdown])
async def list_wall_countdown():
    items = await db.wall_countdown.find({}, {"_id": 0}).sort("date", 1).to_list(500)
    return items


@api_router.post("/wall/countdown", response_model=WallCountdown)
async def create_wall_countdown(payload: WallCountdownCreate):
    obj = WallCountdown(**payload.model_dump())
    await db.wall_countdown.insert_one(obj.model_dump())
    return obj


@api_router.put("/wall/countdown/{cd_id}", response_model=WallCountdown)
async def update_wall_countdown(cd_id: str, payload: WallCountdownUpdate):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        existing = await db.wall_countdown.find_one({"id": cd_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        return existing
    result = await db.wall_countdown.find_one_and_update(
        {"id": cd_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not result:
        raise HTTPException(404, "Not found")
    return result


@api_router.delete("/wall/countdown/{cd_id}")
async def delete_wall_countdown(cd_id: str):
    res = await db.wall_countdown.delete_one({"id": cd_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# --- Achievements
@api_router.get("/wall/achievements", response_model=List[WallAchievement])
async def list_wall_achievements():
    items = await db.wall_achievements.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api_router.post("/wall/achievements", response_model=WallAchievement)
async def create_wall_achievement(payload: WallAchievementCreate):
    obj = WallAchievement(**payload.model_dump())
    await db.wall_achievements.insert_one(obj.model_dump())
    return obj


@api_router.put("/wall/achievements/{ach_id}", response_model=WallAchievement)
async def update_wall_achievement(ach_id: str, payload: WallAchievementUpdate):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        existing = await db.wall_achievements.find_one({"id": ach_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        return existing
    result = await db.wall_achievements.find_one_and_update(
        {"id": ach_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not result:
        raise HTTPException(404, "Not found")
    return result


@api_router.delete("/wall/achievements/{ach_id}")
async def delete_wall_achievement(ach_id: str):
    res = await db.wall_achievements.delete_one({"id": ach_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# --- Notes
@api_router.get("/wall/notes", response_model=List[WallNote])
async def list_wall_notes():
    items = await db.wall_notes.find({}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return items


@api_router.post("/wall/notes", response_model=WallNote)
async def create_wall_note(payload: WallNoteCreate):
    obj = WallNote(**payload.model_dump())
    await db.wall_notes.insert_one(obj.model_dump())
    return obj


@api_router.put("/wall/notes/{note_id}", response_model=WallNote)
async def update_wall_note(note_id: str, payload: WallNoteUpdate):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        existing = await db.wall_notes.find_one({"id": note_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        return existing
    result = await db.wall_notes.find_one_and_update(
        {"id": note_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not result:
        raise HTTPException(404, "Not found")
    return result


@api_router.delete("/wall/notes/{note_id}")
async def delete_wall_note(note_id: str):
    res = await db.wall_notes.delete_one({"id": note_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# --- Family Events
@api_router.get("/wall/family-events", response_model=List[WallFamilyEvent])
async def list_wall_family_events():
    items = await db.wall_family_events.find({}, {"_id": 0}).sort("date", 1).to_list(500)
    return items


@api_router.post("/wall/family-events", response_model=WallFamilyEvent)
async def create_wall_family_event(payload: WallFamilyEventCreate):
    obj = WallFamilyEvent(**payload.model_dump())
    await db.wall_family_events.insert_one(obj.model_dump())
    return obj


@api_router.put("/wall/family-events/{ev_id}", response_model=WallFamilyEvent)
async def update_wall_family_event(ev_id: str, payload: WallFamilyEventUpdate):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        existing = await db.wall_family_events.find_one({"id": ev_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        return existing
    result = await db.wall_family_events.find_one_and_update(
        {"id": ev_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not result:
        raise HTTPException(404, "Not found")
    return result


@api_router.delete("/wall/family-events/{ev_id}")
async def delete_wall_family_event(ev_id: str):
    res = await db.wall_family_events.delete_one({"id": ev_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ============= Family Location Routes =============

@api_router.post("/location/update")
async def location_update(payload: LocationUpdate):
    """Receive a location ping from any device.

    - Resolves the family from `families.family_code` (per-family secret),
      never the legacy shared FAMILY_CODE env var.
    - Upserts a `gps_devices` document keyed by `memberId` + `family_id`.
    - Appends an immutable point to `location_points` for the history view.
    """
    family = await resolve_family_by_code(raw_db, (payload.familyCode or "").strip())
    if not family:
        raise HTTPException(status_code=401, detail="Invalid family code")
    fid = family["id"]

    now_iso = datetime.now(timezone.utc).isoformat()
    timestamp = (payload.timestamp or "").strip() or now_iso

    member_update = {
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy": payload.accuracy,
        "speed": payload.speed,
        "battery": payload.battery,
        "lastUpdate": timestamp,
        "trackingStatus": payload.trackingStatus,
        "networkStatus": payload.networkStatus,
        "connectionType": payload.connectionType,
        "deviceId": payload.deviceId,
    }
    if payload.memberName:
        member_update["name"] = payload.memberName
    if payload.profileImage:
        member_update["profileImage"] = payload.profileImage

    # Direct (non-scoped) writes — the scope here comes from the family_code
    # the caller proved possession of, not from a JWT.
    await raw_db.gps_devices.update_one(
        {"id": payload.memberId, "family_id": fid},
        {
            "$set": member_update,
            "$setOnInsert": {
                "id": payload.memberId,
                "family_id": fid,
                "createdAt": now_iso,
            },
        },
        upsert=True,
    )

    await raw_db.location_points.insert_one({
        "memberId": payload.memberId,
        "family_id": fid,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy": payload.accuracy,
        "speed": payload.speed,
        "battery": payload.battery,
        "timestamp": timestamp,
        "networkStatus": payload.networkStatus,
        "connectionType": payload.connectionType,
    })

    return {"ok": True}


@api_router.get("/location/latest", response_model=List[FamilyMemberOut])
async def location_latest():
    """Return the latest known position for every tracked family member."""
    items = await db.gps_devices.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return items


@api_router.get("/location/history", response_model=List[LocationPointOut])
async def location_history(
    memberId: str,
    date: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    """Return the movement history for a single member."""
    if date:
        try:
            start_dt = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError as exc:
            raise HTTPException(400, "Invalid date format, expected YYYY-MM-DD") from exc
        end_dt = start_dt + timedelta(days=1)
        start_iso, end_iso = start_dt.isoformat(), end_dt.isoformat()
    elif start and end:
        start_iso, end_iso = start, end
    else:
        end_dt = datetime.now(timezone.utc)
        start_dt = end_dt - timedelta(days=1)
        start_iso, end_iso = start_dt.isoformat(), end_dt.isoformat()

    cursor = db.location_points.find(
        {
            "memberId": memberId,
            "timestamp": {"$gte": start_iso, "$lt": end_iso},
        },
        {"_id": 0},
    ).sort("timestamp", 1)
    return await cursor.to_list(5000)


@api_router.delete("/location/member/{member_id}")
async def delete_location_member(member_id: str):
    """Remove a single tracked device and its entire location history.

    The tenant scope comes from the bearer token, so no familyCode query
    parameter is required (or accepted) anymore.
    """
    member_res = await db.gps_devices.delete_one({"id": member_id})
    points_res = await db.location_points.delete_many({"memberId": member_id})
    if member_res.deleted_count == 0 and points_res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Member not found")
    return {
        "ok": True,
        "memberDeleted": member_res.deleted_count,
        "pointsDeleted": points_res.deleted_count,
    }


# ============= Routines Models =============

RECURRENCE_TYPES = {"minutes", "hours", "days", "weeks", "months", "monthly_weekday"}


class Routine(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = ""
    icon: Optional[str] = "Repeat"
    recurrence_type: str  # one of RECURRENCE_TYPES
    recurrence_interval: int = 1
    monthly_week: Optional[int] = None  # 1..4 or -1 for "last"
    monthly_weekday: Optional[int] = None  # 0=Sun..6=Sat
    time_of_day: Optional[str] = None  # "HH:MM" in user's local timezone
    tz_offset_minutes: int = 0  # client's UTC offset at create-time (minutes east)
    last_done_at: Optional[str] = None
    next_due_at: str = ""
    notify_enabled: bool = True
    notify_before_minutes: int = 60
    default_assignee: Optional[str] = ""
    archived: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RoutineCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    icon: Optional[str] = "Repeat"
    recurrence_type: str
    recurrence_interval: int = 1
    monthly_week: Optional[int] = None
    monthly_weekday: Optional[int] = None
    time_of_day: Optional[str] = None
    tz_offset_minutes: int = 0
    notify_enabled: bool = True
    notify_before_minutes: int = 60
    default_assignee: Optional[str] = ""


class RoutineUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    recurrence_type: Optional[str] = None
    recurrence_interval: Optional[int] = None
    monthly_week: Optional[int] = None
    monthly_weekday: Optional[int] = None
    time_of_day: Optional[str] = None
    tz_offset_minutes: Optional[int] = None
    notify_enabled: Optional[bool] = None
    notify_before_minutes: Optional[int] = None
    default_assignee: Optional[str] = None
    archived: Optional[bool] = None


class RoutineComplete(BaseModel):
    done_at: Optional[str] = None  # ISO; defaults to now
    notes: Optional[str] = ""
    assignee: Optional[str] = ""


class RoutineSnooze(BaseModel):
    minutes: int = 60


class RoutineLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    routine_id: str
    done_at: str
    notes: Optional[str] = ""
    assignee: Optional[str] = ""


# ----- Recurrence engine -----

def _add_months(dt: datetime, n: int) -> datetime:
    month = dt.month - 1 + n
    year = dt.year + month // 12
    month = month % 12 + 1
    day = min(dt.day, monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def _nth_weekday_of_month(year: int, month: int, weekday_sun0: int, n: int):
    """Find the Nth (1..4) or last (-1) occurrence of `weekday_sun0` (0=Sun..6=Sat).

    Returns a naive datetime at midnight, or None if not found.
    """
    # Convert Sun-first to Python's Mon-first (Mon=0..Sun=6)
    py_target = (weekday_sun0 + 6) % 7
    days = monthrange(year, month)[1]
    if n == -1:
        for d in range(days, 0, -1):
            dt = datetime(year, month, d)
            if dt.weekday() == py_target:
                return dt
        return None
    count = 0
    for d in range(1, days + 1):
        dt = datetime(year, month, d)
        if dt.weekday() == py_target:
            count += 1
            if count == n:
                return dt
    return None


def _apply_time_of_day(dt: datetime, time_of_day: Optional[str]) -> datetime:
    if not time_of_day:
        return dt
    try:
        h, m = [int(x) for x in time_of_day.split(":")[:2]]
    except Exception:  # noqa: BLE001
        return dt
    return dt.replace(hour=h, minute=m, second=0, microsecond=0)


def compute_next_due(routine: dict, from_dt_utc: datetime) -> datetime:
    """Compute the next due datetime (UTC) for a routine, given a from-time.

    `time_of_day` is interpreted in the user's local timezone (carried via
    `tz_offset_minutes`, minutes east of UTC). For minutes/hours we ignore TOD.
    """
    rtype = routine.get("recurrence_type")
    interval = max(1, int(routine.get("recurrence_interval") or 1))
    tod = routine.get("time_of_day")
    tz_off = int(routine.get("tz_offset_minutes") or 0)

    def to_local(dt_utc: datetime) -> datetime:
        return dt_utc + timedelta(minutes=tz_off)

    def to_utc(dt_local: datetime) -> datetime:
        return dt_local - timedelta(minutes=tz_off)

    if rtype == "minutes":
        return from_dt_utc + timedelta(minutes=interval)
    if rtype == "hours":
        return from_dt_utc + timedelta(hours=interval)
    if rtype == "days":
        local = to_local(from_dt_utc) + timedelta(days=interval)
        return to_utc(_apply_time_of_day(local, tod))
    if rtype == "weeks":
        local = to_local(from_dt_utc) + timedelta(weeks=interval)
        return to_utc(_apply_time_of_day(local, tod))
    if rtype == "months":
        local = _add_months(to_local(from_dt_utc), interval)
        return to_utc(_apply_time_of_day(local, tod))
    if rtype == "monthly_weekday":
        n = routine.get("monthly_week")
        wd = routine.get("monthly_weekday")
        if n is None or wd is None:
            return from_dt_utc + timedelta(days=30)
        # Work in naive local time for month/weekday arithmetic, then re-attach UTC.
        local_from_naive = (from_dt_utc + timedelta(minutes=tz_off)).replace(tzinfo=None)
        # Try current month first
        cand = _nth_weekday_of_month(local_from_naive.year, local_from_naive.month, wd, n)
        if cand is not None:
            cand = _apply_time_of_day(cand, tod)
            if cand > local_from_naive:
                return (cand - timedelta(minutes=tz_off)).replace(tzinfo=timezone.utc)
        # Otherwise the same Nth weekday in the next month
        nl = _add_months(local_from_naive.replace(day=1), 1)
        cand = _nth_weekday_of_month(nl.year, nl.month, wd, n)
        if cand is not None:
            cand = _apply_time_of_day(cand, tod)
            return (cand - timedelta(minutes=tz_off)).replace(tzinfo=timezone.utc)
        return from_dt_utc + timedelta(days=30)
    # Unknown type → safe fallback
    return from_dt_utc + timedelta(days=1)


def _validate_routine(data: dict) -> None:
    if data.get("recurrence_type") not in RECURRENCE_TYPES:
        raise HTTPException(400, "Invalid recurrence_type")
    if data.get("recurrence_type") == "monthly_weekday":
        n = data.get("monthly_week")
        wd = data.get("monthly_weekday")
        if n not in (1, 2, 3, 4, -1):
            raise HTTPException(400, "monthly_week must be 1..4 or -1")
        if wd is None or not (0 <= int(wd) <= 6):
            raise HTTPException(400, "monthly_weekday must be 0..6 (Sun..Sat)")


# ----- Routines Routes -----

@api_router.get("/routines", response_model=List[Routine])
async def list_routines(include_archived: bool = False):
    query: dict = {} if include_archived else {"archived": {"$ne": True}}
    items = await db.routines.find(query, {"_id": 0}).sort("next_due_at", 1).to_list(500)
    return items


@api_router.post("/routines", response_model=Routine)
async def create_routine(payload: RoutineCreate):
    data = payload.model_dump()
    _validate_routine(data)
    now = datetime.now(timezone.utc)
    obj = Routine(**data)
    # Compute next due from "now" so the first deadline starts ticking
    obj.next_due_at = compute_next_due(obj.model_dump(), now).isoformat()
    obj.created_at = now.isoformat()
    obj.updated_at = now.isoformat()
    await db.routines.insert_one(obj.model_dump())
    return obj


@api_router.put("/routines/{routine_id}", response_model=Routine)
async def update_routine(routine_id: str, payload: RoutineUpdate):
    existing = await db.routines.find_one({"id": routine_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    update = payload.model_dump(exclude_unset=True)
    if "recurrence_type" in update or "recurrence_interval" in update or "monthly_week" in update or "monthly_weekday" in update or "time_of_day" in update or "tz_offset_minutes" in update:
        merged = {**existing, **update}
        _validate_routine(merged)
        # If the recurrence definition changed, recompute next_due from now.
        merged["next_due_at"] = compute_next_due(
            merged, datetime.now(timezone.utc)
        ).isoformat()
        update["next_due_at"] = merged["next_due_at"]
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.routines.update_one({"id": routine_id}, {"$set": update})
    doc = await db.routines.find_one({"id": routine_id}, {"_id": 0})
    return doc


@api_router.delete("/routines/{routine_id}")
async def delete_routine(routine_id: str):
    res = await db.routines.delete_one({"id": routine_id})
    await db.routine_logs.delete_many({"routine_id": routine_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@api_router.post("/routines/{routine_id}/complete", response_model=Routine)
async def complete_routine(routine_id: str, payload: RoutineComplete):
    existing = await db.routines.find_one({"id": routine_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    now_iso = datetime.now(timezone.utc).isoformat()
    done_at = (payload.done_at or now_iso).strip() or now_iso
    try:
        done_dt = datetime.fromisoformat(done_at.replace("Z", "+00:00"))
        if done_dt.tzinfo is None:
            done_dt = done_dt.replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise HTTPException(400, "Invalid done_at") from exc
    next_due = compute_next_due(existing, done_dt)

    log = RoutineLog(
        routine_id=routine_id,
        done_at=done_dt.isoformat(),
        notes=payload.notes or "",
        assignee=payload.assignee or existing.get("default_assignee") or "",
    )
    await db.routine_logs.insert_one(log.model_dump())

    update = {
        "last_done_at": done_dt.isoformat(),
        "next_due_at": next_due.isoformat(),
        "updated_at": now_iso,
    }
    await db.routines.update_one({"id": routine_id}, {"$set": update})
    doc = await db.routines.find_one({"id": routine_id}, {"_id": 0})
    return doc


@api_router.post("/routines/{routine_id}/snooze", response_model=Routine)
async def snooze_routine(routine_id: str, payload: RoutineSnooze):
    existing = await db.routines.find_one({"id": routine_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    minutes = max(1, int(payload.minutes or 60))
    now = datetime.now(timezone.utc)
    try:
        current_due = datetime.fromisoformat(
            (existing.get("next_due_at") or now.isoformat()).replace("Z", "+00:00")
        )
        if current_due.tzinfo is None:
            current_due = current_due.replace(tzinfo=timezone.utc)
    except ValueError:
        current_due = now
    base = max(current_due, now)
    new_due = base + timedelta(minutes=minutes)
    await db.routines.update_one(
        {"id": routine_id},
        {"$set": {"next_due_at": new_due.isoformat(), "updated_at": now.isoformat()}},
    )
    doc = await db.routines.find_one({"id": routine_id}, {"_id": 0})
    return doc


@api_router.get("/routines/{routine_id}/logs", response_model=List[RoutineLog])
async def list_routine_logs(routine_id: str, limit: int = 100):
    cursor = (
        db.routine_logs.find({"routine_id": routine_id}, {"_id": 0})
        .sort("done_at", -1)
        .limit(max(1, min(limit, 500)))
    )
    return await cursor.to_list(500)


@api_router.delete("/routines/{routine_id}/logs/{log_id}")
async def delete_routine_log(routine_id: str, log_id: str):
    res = await db.routine_logs.delete_one({"id": log_id, "routine_id": routine_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ============= Family Budget =============
# Five top-level concepts:
#   - income      (one-off entries: salary, mini-job, gifts, refunds…)
#   - expenses    (one-off expenses: food, clothes, travel, health…)
#   - bills       (recurring: monthly_fixed, periodic, yearly)
#   - debts       (informal: borrowed from a person / shop)
#   - loans       (formal: bank loans with interest + tenure + monthly payment)
#
# Computation is server-side via `/api/budget/summary` so the frontend can be
# a thin renderer.


INCOME_TYPES = {"primary", "extra", "external"}
EXPENSE_CATS = {"food", "clothes", "travel", "maintenance", "gifts", "toys", "health", "other"}
BILL_TYPES = {"fixed_monthly", "periodic", "yearly"}
DEBT_STATUSES = {"unpaid", "partial", "paid"}
SHARED_OWNER = "shared"


def _norm_owner(value: Optional[str]) -> str:
    """Coerce owner to either a member id (any non-empty string) or 'shared'.

    Owner is now a free-form string holding the family_member.id (UUID) the
    entry belongs to, or the literal "shared" for joint household items.
    Legacy values like "bahaa" / "theresa" are migrated on startup; if any
    slip through they are preserved as-is so totals stay traceable.
    """
    v = (value or SHARED_OWNER).strip()
    if not v:
        return SHARED_OWNER
    return v.lower() if v.lower() == SHARED_OWNER else v


class BudgetEntry(BaseModel):
    """Common shape used by income & expenses (free-text category + amount)."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str = ""
    amount: float
    category: str  # for income: income_type; for expense: expense_cat
    owner: str = "shared"  # family_member.id | "shared"
    date: str  # ISO date or datetime
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BudgetEntryCreate(BaseModel):
    description: str = ""
    amount: float
    category: str
    owner: Optional[str] = "shared"
    date: Optional[str] = None
    notes: str = ""


class BudgetEntryUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    owner: Optional[str] = None
    date: Optional[str] = None
    notes: Optional[str] = None


class Bill(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    amount: float
    bill_type: str  # one of BILL_TYPES
    owner: str = "shared"
    due_date: Optional[str] = None  # next due date (YYYY-MM-DD)
    last_paid_at: Optional[str] = None
    is_paid: bool = False
    # Contract lifecycle — used by the financial forecast to decide whether
    # this bill is still active in a given future month.
    start_date: Optional[str] = None  # YYYY-MM-DD
    end_date: Optional[str] = None    # YYYY-MM-DD
    auto_renew: bool = False
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BillCreate(BaseModel):
    name: str
    amount: float
    bill_type: str
    owner: Optional[str] = "shared"
    due_date: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    auto_renew: Optional[bool] = False
    notes: str = ""


class BillUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    bill_type: Optional[str] = None
    owner: Optional[str] = None
    due_date: Optional[str] = None
    last_paid_at: Optional[str] = None
    is_paid: Optional[bool] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    auto_renew: Optional[bool] = None
    notes: Optional[str] = None


class Debt(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    creditor: str  # person or place we owe
    original_amount: float
    remaining_amount: float
    owner: str = "shared"
    due_date: Optional[str] = None
    status: str = "unpaid"  # unpaid | partial | paid
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class DebtCreate(BaseModel):
    creditor: str
    original_amount: float
    remaining_amount: Optional[float] = None
    owner: Optional[str] = "shared"
    due_date: Optional[str] = None
    notes: str = ""


class DebtUpdate(BaseModel):
    creditor: Optional[str] = None
    original_amount: Optional[float] = None
    remaining_amount: Optional[float] = None
    owner: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class Loan(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    lender: str = ""
    principal: float  # original loan amount
    interest_rate: float = 0.0  # annual %, informational only
    term_months: int  # total number of months
    monthly_payment: float
    payments_made: int = 0
    owner: str = "shared"
    start_date: Optional[str] = None
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class LoanCreate(BaseModel):
    name: str
    lender: str = ""
    principal: float
    interest_rate: float = 0.0
    term_months: int
    monthly_payment: float
    payments_made: int = 0
    owner: Optional[str] = "shared"
    start_date: Optional[str] = None
    notes: str = ""


class LoanUpdate(BaseModel):
    name: Optional[str] = None
    lender: Optional[str] = None
    principal: Optional[float] = None
    interest_rate: Optional[float] = None
    term_months: Optional[int] = None
    monthly_payment: Optional[float] = None
    payments_made: Optional[int] = None
    owner: Optional[str] = None
    start_date: Optional[str] = None
    notes: Optional[str] = None


def _month_bounds(year: int, month: int):
    """Return ISO start/end of a calendar month (UTC midnight)."""
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    return start.isoformat(), end.isoformat()


async def _sum_entries(coll, start: str, end: str) -> float:
    pipe = [
        {"$match": {"date": {"$gte": start, "$lt": end}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    rows = await coll.aggregate(pipe).to_list(1)
    return float(rows[0]["total"]) if rows else 0.0


def _bill_month_cost(bill: dict) -> float:
    """Approximate monthly cost contribution for forecasting."""
    bt = bill.get("bill_type")
    amt = float(bill.get("amount") or 0)
    if bt == "yearly":
        return amt / 12.0
    return amt  # fixed_monthly + periodic counted monthly


def _next_n_days_bills(bills: list, days: int, now: datetime):
    """Bills whose due_date falls within [now, now+days]. Filters out paid."""
    horizon = now + timedelta(days=days)
    out = []
    for b in bills:
        if b.get("is_paid"):
            continue
        due_str = b.get("due_date")
        if not due_str:
            continue
        try:
            due = datetime.fromisoformat(due_str.replace("Z", "+00:00"))
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if now <= due <= horizon:
            out.append((b, due))
    return out


# ----- CRUD generators (income / expenses) -----

def _income_routes():
    coll = db.budget_income

    @api_router.get("/budget/income", response_model=List[BudgetEntry])
    async def list_income():
        return await coll.find({}, {"_id": 0}).sort("date", -1).to_list(2000)

    @api_router.post("/budget/income", response_model=BudgetEntry)
    async def create_income(payload: BudgetEntryCreate):
        if payload.category not in INCOME_TYPES:
            raise HTTPException(400, f"category must be one of {sorted(INCOME_TYPES)}")
        obj = BudgetEntry(
            description=payload.description,
            amount=payload.amount,
            category=payload.category,
            owner=_norm_owner(payload.owner),
            date=payload.date or datetime.now(timezone.utc).isoformat(),
            notes=payload.notes,
        )
        await coll.insert_one(obj.model_dump())
        return obj

    @api_router.put("/budget/income/{item_id}", response_model=BudgetEntry)
    async def update_income(item_id: str, payload: BudgetEntryUpdate):
        update = payload.model_dump(exclude_unset=True)
        if "category" in update and update["category"] not in INCOME_TYPES:
            raise HTTPException(400, "invalid category")
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await coll.update_one({"id": item_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Not found")
        return await coll.find_one({"id": item_id}, {"_id": 0})

    @api_router.delete("/budget/income/{item_id}")
    async def delete_income(item_id: str):
        res = await coll.delete_one({"id": item_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Not found")
        return {"ok": True}


def _expense_routes():
    coll = db.budget_expenses

    @api_router.get("/budget/expenses", response_model=List[BudgetEntry])
    async def list_expenses():
        return await coll.find({}, {"_id": 0}).sort("date", -1).to_list(2000)

    @api_router.post("/budget/expenses", response_model=BudgetEntry)
    async def create_expense(payload: BudgetEntryCreate):
        if payload.category not in EXPENSE_CATS:
            raise HTTPException(400, f"category must be one of {sorted(EXPENSE_CATS)}")
        obj = BudgetEntry(
            description=payload.description,
            amount=payload.amount,
            category=payload.category,
            owner=_norm_owner(payload.owner),
            date=payload.date or datetime.now(timezone.utc).isoformat(),
            notes=payload.notes,
        )
        await coll.insert_one(obj.model_dump())
        return obj

    @api_router.put("/budget/expenses/{item_id}", response_model=BudgetEntry)
    async def update_expense(item_id: str, payload: BudgetEntryUpdate):
        update = payload.model_dump(exclude_unset=True)
        if "category" in update and update["category"] not in EXPENSE_CATS:
            raise HTTPException(400, "invalid category")
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await coll.update_one({"id": item_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Not found")
        return await coll.find_one({"id": item_id}, {"_id": 0})

    @api_router.delete("/budget/expenses/{item_id}")
    async def delete_expense(item_id: str):
        res = await coll.delete_one({"id": item_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Not found")
        return {"ok": True}


def _bill_routes():
    coll = db.budget_bills

    @api_router.get("/budget/bills", response_model=List[Bill])
    async def list_bills():
        return await coll.find({}, {"_id": 0}).sort("due_date", 1).to_list(1000)

    @api_router.post("/budget/bills", response_model=Bill)
    async def create_bill(payload: BillCreate):
        if payload.bill_type not in BILL_TYPES:
            raise HTTPException(400, f"bill_type must be one of {sorted(BILL_TYPES)}")
        data = payload.model_dump()
        data["owner"] = _norm_owner(data.get("owner"))
        obj = Bill(**data)
        await coll.insert_one(obj.model_dump())
        return obj

    @api_router.put("/budget/bills/{item_id}", response_model=Bill)
    async def update_bill(item_id: str, payload: BillUpdate):
        update = payload.model_dump(exclude_unset=True)
        if "bill_type" in update and update["bill_type"] not in BILL_TYPES:
            raise HTTPException(400, "invalid bill_type")
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await coll.update_one({"id": item_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Not found")
        return await coll.find_one({"id": item_id}, {"_id": 0})

    @api_router.delete("/budget/bills/{item_id}")
    async def delete_bill(item_id: str):
        res = await coll.delete_one({"id": item_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Not found")
        return {"ok": True}


def _debt_routes():
    coll = db.budget_debts

    @api_router.get("/budget/debts", response_model=List[Debt])
    async def list_debts():
        return await coll.find({}, {"_id": 0}).sort("due_date", 1).to_list(500)

    @api_router.post("/budget/debts", response_model=Debt)
    async def create_debt(payload: DebtCreate):
        remaining = (
            payload.remaining_amount
            if payload.remaining_amount is not None
            else payload.original_amount
        )
        obj = Debt(
            creditor=payload.creditor,
            original_amount=payload.original_amount,
            remaining_amount=remaining,
            owner=_norm_owner(payload.owner),
            due_date=payload.due_date,
            notes=payload.notes,
            status="paid"
            if remaining <= 0
            else ("partial" if remaining < payload.original_amount else "unpaid"),
        )
        await coll.insert_one(obj.model_dump())
        return obj

    @api_router.put("/budget/debts/{item_id}", response_model=Debt)
    async def update_debt(item_id: str, payload: DebtUpdate):
        existing = await coll.find_one({"id": item_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        update = payload.model_dump(exclude_unset=True)
        merged = {**existing, **update}
        # Auto-recompute status from amounts if not explicitly set
        if "status" not in update:
            orig = float(merged["original_amount"])
            remain = float(merged["remaining_amount"])
            if remain <= 0:
                merged["status"] = "paid"
            elif remain < orig:
                merged["status"] = "partial"
            else:
                merged["status"] = "unpaid"
        if merged["status"] not in DEBT_STATUSES:
            raise HTTPException(400, "invalid status")
        merged["updated_at"] = datetime.now(timezone.utc).isoformat()
        await coll.update_one({"id": item_id}, {"$set": merged})
        return merged

    @api_router.delete("/budget/debts/{item_id}")
    async def delete_debt(item_id: str):
        res = await coll.delete_one({"id": item_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Not found")
        return {"ok": True}


def _loan_routes():
    coll = db.budget_loans

    @api_router.get("/budget/loans", response_model=List[Loan])
    async def list_loans():
        return await coll.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

    @api_router.post("/budget/loans", response_model=Loan)
    async def create_loan(payload: LoanCreate):
        if payload.term_months <= 0:
            raise HTTPException(400, "term_months must be positive")
        data = payload.model_dump()
        data["owner"] = _norm_owner(data.get("owner"))
        obj = Loan(**data)
        await coll.insert_one(obj.model_dump())
        return obj

    @api_router.put("/budget/loans/{item_id}", response_model=Loan)
    async def update_loan(item_id: str, payload: LoanUpdate):
        update = payload.model_dump(exclude_unset=True)
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await coll.update_one({"id": item_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Not found")
        return await coll.find_one({"id": item_id}, {"_id": 0})

    @api_router.delete("/budget/loans/{item_id}")
    async def delete_loan(item_id: str):
        res = await coll.delete_one({"id": item_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Not found")
        return {"ok": True}


# Register CRUD route groups
_income_routes()
_expense_routes()
_bill_routes()
_debt_routes()
_loan_routes()


@api_router.get("/budget/summary")
async def budget_summary(year: Optional[int] = None, month: Optional[int] = None):
    """Aggregate snapshot for the dashboard.

    Returns:
      - totals for the requested month (default: current UTC month)
      - debts/loans totals (independent of month)
      - health status (green / orange / red) + reason
      - 7-day & end-of-month balance forecast
      - month-over-month comparisons for income, expenses, food, remaining
    """
    now = datetime.now(timezone.utc)
    year = year or now.year
    month = month or now.month
    start, end = _month_bounds(year, month)
    # Previous month bounds
    if month == 1:
        prev_year, prev_month = year - 1, 12
    else:
        prev_year, prev_month = year, month - 1
    pstart, pend = _month_bounds(prev_year, prev_month)

    # Income / expense totals (this & previous month) + per-owner breakdown
    income_total = 0.0
    expense_total = 0.0
    # Per-owner dicts auto-grow: any owner string seen in the data becomes a key.
    # We also pre-seed every current family member + "shared" so the frontend
    # always sees a row per wallet even if a member has no entries yet.
    member_ids = []
    async for m in raw_db.family_members.find(
        {"family_id": current_family_id.get()},
        {"_id": 0, "id": 1},
    ):
        if m.get("id"):
            member_ids.append(m["id"])
    seed_keys = list(member_ids) + [SHARED_OWNER]

    def _zero_dict():
        return {k: 0.0 for k in seed_keys}

    def _bump(d: dict, key: str, amt: float):
        if key not in d:
            d[key] = 0.0
        d[key] += amt

    by_owner_income = _zero_dict()
    by_owner_expense = _zero_dict()
    async for doc in db.budget_income.find(
        {"date": {"$gte": start, "$lt": end}}, {"_id": 0, "amount": 1, "owner": 1}
    ):
        amt = float(doc.get("amount") or 0)
        income_total += amt
        _bump(by_owner_income, _norm_owner(doc.get("owner")), amt)
    async for doc in db.budget_expenses.find(
        {"date": {"$gte": start, "$lt": end}}, {"_id": 0, "amount": 1, "owner": 1}
    ):
        amt = float(doc.get("amount") or 0)
        expense_total += amt
        _bump(by_owner_expense, _norm_owner(doc.get("owner")), amt)
    prev_income = await _sum_entries(db.budget_income, pstart, pend)
    prev_expense = await _sum_entries(db.budget_expenses, pstart, pend)

    # Per-category expense breakdown for this month
    breakdown = {c: 0.0 for c in EXPENSE_CATS}
    async for doc in db.budget_expenses.find(
        {"date": {"$gte": start, "$lt": end}}, {"_id": 0, "category": 1, "amount": 1}
    ):
        c = doc.get("category", "other")
        breakdown[c] = breakdown.get(c, 0.0) + float(doc.get("amount") or 0)

    prev_food = 0.0
    async for doc in db.budget_expenses.find(
        {"date": {"$gte": pstart, "$lt": pend}, "category": "food"},
        {"_id": 0, "amount": 1},
    ):
        prev_food += float(doc.get("amount") or 0)

    # Bills, debts, loans
    bills = await db.budget_bills.find({}, {"_id": 0}).to_list(1000)
    debts = await db.budget_debts.find({}, {"_id": 0}).to_list(500)
    loans = await db.budget_loans.find({}, {"_id": 0}).to_list(200)

    # This month's bill cost (sum of monthly contribution) + per-owner split
    bills_month_total = 0.0
    bills_by_owner = _zero_dict()
    for b in bills:
        if b.get("is_paid"):
            continue
        cost = _bill_month_cost(b)
        bills_month_total += cost
        _bump(bills_by_owner, _norm_owner(b.get("owner")), cost)

    debts_total = 0.0
    debts_by_owner = _zero_dict()
    for d in debts:
        r = float(d.get("remaining_amount") or 0)
        debts_total += r
        _bump(debts_by_owner, _norm_owner(d.get("owner")), r)

    # Loans: monthly payment = real monthly burden, NOT principal.
    loans_total_remaining = 0.0
    loans_principal = 0.0
    loans_paid = 0.0
    loans_remaining_by_owner = _zero_dict()
    loans_monthly_by_owner = _zero_dict()
    loans_monthly_total = 0.0
    for ln in loans:
        principal = float(ln.get("principal") or 0)
        monthly = float(ln.get("monthly_payment") or 0)
        made = int(ln.get("payments_made") or 0)
        term = int(ln.get("term_months") or 0)
        paid_amt = monthly * made
        remaining_amt = max(0.0, principal - paid_amt)
        owner = _norm_owner(ln.get("owner"))
        loans_principal += principal
        loans_paid += paid_amt
        loans_total_remaining += remaining_amt
        _bump(loans_remaining_by_owner, owner, remaining_amt)
        # Only count active loans (term not finished) in the monthly burden.
        if made < term:
            _bump(loans_monthly_by_owner, owner, monthly)
            loans_monthly_total += monthly

    # Remaining = income - expense - this-month's recurring bill cost - monthly loan payments.
    remaining = income_total - expense_total - bills_month_total - loans_monthly_total

    # Per-owner remaining (best-effort: own income/expense + own share of bills + own loans).
    # Union of every owner key seen across any of the per-owner dicts.
    all_owner_keys = set(seed_keys)
    for d in (by_owner_income, by_owner_expense, bills_by_owner, debts_by_owner,
              loans_remaining_by_owner, loans_monthly_by_owner):
        all_owner_keys.update(d.keys())

    def _g(d, k):
        return d.get(k, 0.0)

    remaining_by_owner = {
        k: _g(by_owner_income, k)
        - _g(by_owner_expense, k)
        - _g(bills_by_owner, k)
        - _g(loans_monthly_by_owner, k)
        for k in all_owner_keys
    }

    # Total monthly obligations = bills (monthly contribution) + loan monthlies
    monthly_obligations_total = bills_month_total + loans_monthly_total
    monthly_obligations_by_owner = {
        k: _g(bills_by_owner, k) + _g(loans_monthly_by_owner, k) for k in all_owner_keys
    }

    # Upcoming bills in next 14 days for the health signal & 7d forecast
    bills_next_14 = _next_n_days_bills(bills, 14, now)
    next_14_total = sum(float(b["amount"]) for b, _ in bills_next_14)
    bills_next_7 = [b for b in bills_next_14 if b[1] <= now + timedelta(days=7)]
    next_7_total = sum(float(b["amount"]) for b, _ in bills_next_7)

    # Health
    if remaining < 0 or next_14_total > max(0.0, remaining) * 1.0:
        health = "red"
        health_reason = "next_14_uncovered"
    elif next_14_total > remaining * 0.6:
        health = "orange"
        health_reason = "next_14_tight"
    else:
        health = "green"
        health_reason = "all_covered"

    # Forecast: assume no further income unless we can extrapolate; subtract upcoming bills
    forecast_balance_7d = remaining - next_7_total
    # Remaining month-end: subtract all unpaid bills due before end of month
    eom = datetime.fromisoformat(end.replace("Z", "+00:00"))
    days_to_eom = max(1, (eom - now).days)
    bills_to_eom = _next_n_days_bills(bills, days_to_eom, now)
    forecast_balance_eom = remaining - sum(float(b["amount"]) for b, _ in bills_to_eom)

    # Comparisons (percent change)
    def pct(curr, prev):
        if prev == 0:
            return None
        return round((curr - prev) / prev * 100, 1)

    prev_remaining = prev_income - prev_expense  # rough — ignores prev bills
    comparisons = {
        "income": {"current": income_total, "previous": prev_income, "pct": pct(income_total, prev_income)},
        "expense": {"current": expense_total, "previous": prev_expense, "pct": pct(expense_total, prev_expense)},
        "food": {"current": breakdown.get("food", 0.0), "previous": prev_food, "pct": pct(breakdown.get("food", 0.0), prev_food)},
        "remaining": {"current": remaining, "previous": prev_remaining, "pct": pct(remaining, prev_remaining)},
    }

    # Loan progress
    loan_progress = []
    for ln in loans:
        term = int(ln.get("term_months") or 0) or 1
        made = int(ln.get("payments_made") or 0)
        remaining_months = max(0, term - made)
        monthly = float(ln.get("monthly_payment") or 0)
        principal = float(ln.get("principal") or 0)
        paid_amt = monthly * made
        remaining_amt = max(0.0, principal - paid_amt)
        progress_pct = round(made / term * 100, 1) if term else 0.0
        # Estimated end date = start_date + term months (if start_date provided)
        est_end = None
        sd = ln.get("start_date")
        if sd:
            try:
                sd_dt = datetime.fromisoformat(sd.replace("Z", "+00:00"))
                # Naive add months
                ey = sd_dt.year + (sd_dt.month - 1 + term) // 12
                em = (sd_dt.month - 1 + term) % 12 + 1
                est_end = datetime(ey, em, min(sd_dt.day, 28), tzinfo=timezone.utc).date().isoformat()
            except ValueError:
                est_end = None
        loan_progress.append(
            {
                "id": ln["id"],
                "name": ln.get("name", ""),
                "owner": _norm_owner(ln.get("owner")),
                "principal": principal,
                "paid": paid_amt,
                "remaining": remaining_amt,
                "payments_made": made,
                "payments_remaining": remaining_months,
                "term_months": term,
                "progress_pct": progress_pct,
                "monthly_payment": monthly,
                "estimated_end_date": est_end,
            }
        )

    return {
        "month": {"year": year, "month": month, "start": start, "end": end},
        "income_total": round(income_total, 2),
        "expense_total": round(expense_total, 2),
        "bills_month_total": round(bills_month_total, 2),
        "remaining": round(remaining, 2),
        "debts_total": round(debts_total, 2),
        "loans_total_remaining": round(loans_total_remaining, 2),
        "loans_principal_total": round(loans_principal, 2),
        "loans_paid_total": round(loans_paid, 2),
        "loans_monthly_total": round(loans_monthly_total, 2),
        "monthly_obligations_total": round(monthly_obligations_total, 2),
        "by_owner": {
            "income": {k: round(v, 2) for k, v in by_owner_income.items()},
            "expense": {k: round(v, 2) for k, v in by_owner_expense.items()},
            "bills": {k: round(v, 2) for k, v in bills_by_owner.items()},
            "debts": {k: round(v, 2) for k, v in debts_by_owner.items()},
            "loans_remaining": {k: round(v, 2) for k, v in loans_remaining_by_owner.items()},
            "loans_monthly": {k: round(v, 2) for k, v in loans_monthly_by_owner.items()},
            "monthly_obligations": {k: round(v, 2) for k, v in monthly_obligations_by_owner.items()},
            "remaining": {k: round(v, 2) for k, v in remaining_by_owner.items()},
        },
        "expense_breakdown": {k: round(v, 2) for k, v in breakdown.items()},
        "upcoming_bills": [
            {**b, "_due": d.isoformat()} for b, d in bills_next_14
        ][:20],
        "next_14_total": round(next_14_total, 2),
        "next_7_total": round(next_7_total, 2),
        "health": health,
        "health_reason": health_reason,
        "forecast": {
            "balance_now": round(remaining, 2),
            "balance_7d": round(forecast_balance_7d, 2),
            "balance_eom": round(forecast_balance_eom, 2),
        },
        "comparisons": comparisons,
        "loan_progress": loan_progress,
        # Active family members for the frontend's wallet renderer.
        # Already scoped to current family via the find above.
        "wallet_owners": [
            {"id": m["id"], "name": (m.get("name") or "").strip() or "Member",
             "color": m.get("color") or "#3B82F6",
             "role": m.get("role"), "avatar": m.get("avatar"),
             "is_family_admin": bool(m.get("is_family_admin"))}
            for m in await raw_db.family_members.find(
                {"family_id": current_family_id.get()},
                {"_id": 0, "id": 1, "name": 1, "color": 1, "role": 1,
                 "avatar": 1, "is_family_admin": 1, "created_at": 1},
            ).sort("created_at", 1).to_list(100)
        ],
    }


# ============= Kids' Money ("My Money") =============
# Each entry belongs to ONE family member (the child) and records either an
# income (allowance, gift, eid money) or a payment (toy, snack, school).
# Privacy rules enforced server-side:
#   - A child can ONLY see / mutate their own entries.
#   - A family admin can read every child's ledger AND mutate any entry.
#   - Adults / parents (non-admin) cannot read other children's ledgers.

KIDS_MONEY_TYPES = {"income", "payment"}


class KidsMoneyEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    member_id: str  # owning child
    type: str  # "income" | "payment"
    description: str = ""
    amount: float
    date: str  # ISO date or datetime
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class KidsMoneyEntryCreate(BaseModel):
    type: str
    amount: float
    description: Optional[str] = ""
    member_id: Optional[str] = None  # admin only: target a specific child
    date: Optional[str] = None
    notes: Optional[str] = ""


class KidsMoneyEntryUpdate(BaseModel):
    type: Optional[str] = None
    amount: Optional[float] = None
    description: Optional[str] = None
    date: Optional[str] = None
    notes: Optional[str] = None


def _resolve_member_id(token: dict, requested: Optional[str]) -> str:
    """Decide which member_id a kids-money operation applies to.

    - Family admin may target any member by passing `requested`.
    - Anyone else (children, adults, parents without admin) is locked to
      their own member_id, regardless of what the client sent.
    """
    is_admin = bool(token.get("fadmin"))
    self_id = token.get("mid")
    if is_admin and requested:
        return requested
    if not self_id:
        raise HTTPException(status_code=401, detail="Member context missing")
    return self_id


async def _resolve_child_member(token: dict, target_id: str) -> dict:
    """Fetch the family member that owns the ledger. Enforces:

    - The target must belong to the current family (handled by `family_id`).
    - If the caller is NOT a family admin they may only operate on themselves.
    """
    is_admin = bool(token.get("fadmin"))
    if not is_admin and token.get("mid") != target_id:
        raise HTTPException(status_code=403, detail="Cannot access another member's money")
    member = await raw_db.family_members.find_one(
        {"id": target_id, "family_id": token["fid"]}, {"_id": 0, "pin_hash": 0}
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    return member


def _summarize_entries(entries: list) -> dict:
    income = 0.0
    payments = 0.0
    for e in entries:
        amt = float(e.get("amount") or 0)
        if e.get("type") == "income":
            income += amt
        elif e.get("type") == "payment":
            payments += amt
    return {
        "income": round(income, 2),
        "payments": round(payments, 2),
        "balance": round(income - payments, 2),
    }


@api_router.get("/kids-money/summary")
async def kids_money_summary(
    member_id: Optional[str] = Query(None),
    token: dict = Depends(require_member_token),
):
    target = _resolve_member_id(token, member_id)
    member = await _resolve_child_member(token, target)
    entries = await db.kids_money.find(
        {"member_id": target}, {"_id": 0}
    ).to_list(5000)
    summary = _summarize_entries(entries)
    return {
        "member": {
            "id": member["id"],
            "name": member.get("name"),
            "role": member.get("role"),
        },
        **summary,
        "entries_count": len(entries),
    }


@api_router.get("/kids-money/transactions", response_model=List[KidsMoneyEntry])
async def list_kids_money(
    member_id: Optional[str] = Query(None),
    token: dict = Depends(require_member_token),
):
    target = _resolve_member_id(token, member_id)
    await _resolve_child_member(token, target)
    items = await db.kids_money.find(
        {"member_id": target}, {"_id": 0}
    ).sort("date", -1).to_list(5000)
    return items


@api_router.post("/kids-money/transactions", response_model=KidsMoneyEntry)
async def create_kids_money(
    payload: KidsMoneyEntryCreate,
    token: dict = Depends(require_member_token),
):
    if payload.type not in KIDS_MONEY_TYPES:
        raise HTTPException(400, f"type must be one of {sorted(KIDS_MONEY_TYPES)}")
    if payload.amount is None or float(payload.amount) <= 0:
        raise HTTPException(400, "amount must be positive")
    target = _resolve_member_id(token, payload.member_id)
    await _resolve_child_member(token, target)
    obj = KidsMoneyEntry(
        member_id=target,
        type=payload.type,
        description=(payload.description or "").strip(),
        amount=float(payload.amount),
        date=payload.date or datetime.now(timezone.utc).isoformat(),
        notes=(payload.notes or "").strip(),
    )
    await db.kids_money.insert_one(obj.model_dump())
    await log_activity(token, f"kids_money.{obj.type}.added", {
        "amount": obj.amount,
        "description": obj.description,
        "for_member_id": target,
    })
    return obj


@api_router.put("/kids-money/transactions/{entry_id}", response_model=KidsMoneyEntry)
async def update_kids_money(
    entry_id: str,
    payload: KidsMoneyEntryUpdate,
    token: dict = Depends(require_member_token),
):
    existing = await db.kids_money.find_one({"id": entry_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    # Authorization: same family + (admin OR owner)
    await _resolve_child_member(token, existing["member_id"])
    update = payload.model_dump(exclude_unset=True)
    if "type" in update and update["type"] not in KIDS_MONEY_TYPES:
        raise HTTPException(400, "invalid type")
    if "amount" in update and float(update["amount"]) <= 0:
        raise HTTPException(400, "amount must be positive")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.kids_money.update_one({"id": entry_id}, {"$set": update})
    fresh = await db.kids_money.find_one({"id": entry_id}, {"_id": 0})
    return fresh


@api_router.delete("/kids-money/transactions/{entry_id}")
async def delete_kids_money(
    entry_id: str,
    token: dict = Depends(require_member_token),
):
    existing = await db.kids_money.find_one({"id": entry_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    await _resolve_child_member(token, existing["member_id"])
    await db.kids_money.delete_one({"id": entry_id})
    return {"ok": True}


@api_router.get("/kids-money/kids")
async def list_kids_with_balances(token: dict = Depends(require_member_token)):
    """Admin-only directory of every child in the family + their balance."""
    if not token.get("fadmin"):
        raise HTTPException(status_code=403, detail="Family admin permission required")
    members = await raw_db.family_members.find(
        {"family_id": token["fid"], "role": "child"},
        {"_id": 0, "pin_hash": 0},
    ).sort("created_at", 1).to_list(200)
    out = []
    for m in members:
        entries = await db.kids_money.find(
            {"member_id": m["id"]}, {"_id": 0}
        ).to_list(5000)
        out.append({
            "id": m["id"],
            "name": m.get("name"),
            "role": m.get("role"),
            **_summarize_entries(entries),
            "entries_count": len(entries),
        })
    return {"kids": out}


# ----- Saving goals -----
# Lightweight goals tied to a child's ledger. Progress is server-computed
# from the child's CURRENT balance — independent goals (a child dreaming of
# both a "Bike (80€)" and a "Toy (20€)" with 12€ balance sees each goal at
# 12 / target). Goals can be manually marked complete (e.g. the kid bought
# the bike) which freezes them at 100% and removes them from the active list.


class KidsMoneyGoal(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    member_id: str
    name: str
    target_amount: float
    icon: Optional[str] = "Target"
    notes: str = ""
    target_date: Optional[str] = None  # YYYY-MM-DD
    is_complete: bool = False
    completed_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class KidsMoneyGoalCreate(BaseModel):
    name: str
    target_amount: float
    member_id: Optional[str] = None  # admin: target a specific child
    icon: Optional[str] = "Target"
    notes: Optional[str] = ""
    target_date: Optional[str] = None


class KidsMoneyGoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    icon: Optional[str] = None
    notes: Optional[str] = None
    target_date: Optional[str] = None
    is_complete: Optional[bool] = None


def _decorate_goal(goal: dict, balance: float) -> dict:
    """Attach computed progress (saved / progress_pct) to a goal doc."""
    target = float(goal.get("target_amount") or 0)
    if goal.get("is_complete"):
        saved = target
    else:
        saved = max(0.0, min(balance, target))
    pct = (saved / target * 100.0) if target > 0 else 0.0
    return {
        **goal,
        "saved": round(saved, 2),
        "progress_pct": round(pct, 1),
    }


async def _current_balance(member_id: str) -> float:
    entries = await db.kids_money.find(
        {"member_id": member_id}, {"_id": 0, "type": 1, "amount": 1}
    ).to_list(5000)
    return _summarize_entries(entries)["balance"]


@api_router.get("/kids-money/goals", response_model=List[dict])
async def list_kids_money_goals(
    member_id: Optional[str] = Query(None),
    include_completed: bool = Query(True),
    token: dict = Depends(require_member_token),
):
    target = _resolve_member_id(token, member_id)
    await _resolve_child_member(token, target)
    query: dict = {"member_id": target}
    if not include_completed:
        query["is_complete"] = {"$ne": True}
    goals = await db.kids_money_goals.find(query, {"_id": 0}).sort("created_at", 1).to_list(200)
    balance = await _current_balance(target)
    return [_decorate_goal(g, balance) for g in goals]


@api_router.post("/kids-money/goals", response_model=dict)
async def create_kids_money_goal(
    payload: KidsMoneyGoalCreate,
    token: dict = Depends(require_member_token),
):
    if not payload.name or not payload.name.strip():
        raise HTTPException(400, "name is required")
    if payload.target_amount is None or float(payload.target_amount) <= 0:
        raise HTTPException(400, "target_amount must be positive")
    target = _resolve_member_id(token, payload.member_id)
    await _resolve_child_member(token, target)
    obj = KidsMoneyGoal(
        member_id=target,
        name=payload.name.strip(),
        target_amount=float(payload.target_amount),
        icon=(payload.icon or "Target"),
        notes=(payload.notes or "").strip(),
        target_date=payload.target_date,
    )
    await db.kids_money_goals.insert_one(obj.model_dump())
    balance = await _current_balance(target)
    await log_activity(token, "goal.created", {
        "name": obj.name,
        "target_amount": obj.target_amount,
        "for_member_id": target,
    })
    return _decorate_goal(obj.model_dump(), balance)


@api_router.put("/kids-money/goals/{goal_id}", response_model=dict)
async def update_kids_money_goal(
    goal_id: str,
    payload: KidsMoneyGoalUpdate,
    token: dict = Depends(require_member_token),
):
    existing = await db.kids_money_goals.find_one({"id": goal_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    await _resolve_child_member(token, existing["member_id"])
    update = payload.model_dump(exclude_unset=True)
    if "name" in update:
        if not update["name"] or not update["name"].strip():
            raise HTTPException(400, "name cannot be empty")
        update["name"] = update["name"].strip()
    if "target_amount" in update and float(update["target_amount"]) <= 0:
        raise HTTPException(400, "target_amount must be positive")
    if "is_complete" in update:
        flag = bool(update["is_complete"])
        update["is_complete"] = flag
        # Stamp / clear completed_at on transition.
        if flag and not existing.get("is_complete"):
            update["completed_at"] = datetime.now(timezone.utc).isoformat()
        elif not flag and existing.get("is_complete"):
            update["completed_at"] = None
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.kids_money_goals.update_one({"id": goal_id}, {"$set": update})
    fresh = await db.kids_money_goals.find_one({"id": goal_id}, {"_id": 0})
    balance = await _current_balance(existing["member_id"])
    # Log only the meaningful "completed" transition; other edits stay quiet
    # to avoid cluttering the activity feed.
    if "is_complete" in update and update["is_complete"] and not existing.get("is_complete"):
        await log_activity(token, "goal.completed", {
            "name": fresh.get("name"),
            "target_amount": fresh.get("target_amount"),
            "for_member_id": existing["member_id"],
        })
    return _decorate_goal(fresh, balance)


@api_router.delete("/kids-money/goals/{goal_id}")
async def delete_kids_money_goal(
    goal_id: str,
    token: dict = Depends(require_member_token),
):
    existing = await db.kids_money_goals.find_one({"id": goal_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    await _resolve_child_member(token, existing["member_id"])
    await db.kids_money_goals.delete_one({"id": goal_id})
    return {"ok": True}


# ============= Activity Feed =============
# Lightweight per-family/per-member activity log so the Wall Board can show a
# "Recent activity by you" strip. We deliberately store STRUCTURED payload
# fields (title, name, amount, …) instead of pre-formatted strings so the
# frontend can localise the rendered text to EN / AR / DE on the fly.
#
# Writes happen via `log_activity(token, kind, payload)` from inside the
# endpoints that mutate user data. Failures NEVER bubble up to the caller —
# the user-visible action must succeed even if the log write fails.

ACTIVITY_LIMIT = 20  # safety cap on a single fetch


async def log_activity(token: dict, kind: str, payload: Optional[dict] = None) -> None:
    """Append an activity entry attributed to the caller. Best-effort."""
    try:
        member_id = token.get("mid")
        if not member_id:
            return  # account-only token → not attributable to a member
        await db.activity_log.insert_one({
            "id": str(uuid.uuid4()),
            "kind": kind,
            "payload": payload or {},
            "member_id": member_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:  # pragma: no cover — logging is best-effort
        logging.getLogger(__name__).warning("log_activity failed: %s", exc)


@api_router.get("/activity/recent")
async def recent_activity(
    limit: int = 3,
    scope: str = "self",  # "self" (default) | "family" (admin only)
    token: dict = Depends(require_member_token),
):
    limit = max(1, min(limit, ACTIVITY_LIMIT))
    query: dict = {}
    if scope == "family":
        if not bool(token.get("fadmin")):
            raise HTTPException(status_code=403, detail="Family admin permission required")
    else:
        member_id = token.get("mid")
        if member_id:
            query["member_id"] = member_id
    rows = await db.activity_log.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return {"items": rows}


# ============= Tenant Diagnostics =============
# Family-admin debugging tool. Returns the current family_id + per-collection
# counts for THIS family, plus a sanity scan of the underlying database for
# documents that lack a `family_id` field at all (orphans). Used to verify
# the multi-tenant isolation fix and to make any future drift visible.


@api_router.get("/diag/tenant")
async def tenant_diagnostics(token: dict = Depends(require_member_token)):
    if not bool(token.get("fadmin")):
        raise HTTPException(status_code=403, detail="Family admin permission required")
    family_id = token["fid"]
    # Collections we expect to be tenant-scoped. Any document in one of
    # these that lacks a family_id is a leak risk and surfaced as "orphans".
    from tenant import SCOPED_COLLECTIONS  # local import to avoid cycles
    per_family: dict = {}
    orphans: dict = {}
    cross_tenant: dict = {}
    for name in sorted(SCOPED_COLLECTIONS):
        coll = raw_db[name]
        per_family[name] = await coll.count_documents({"family_id": family_id})
        orphans[name] = await coll.count_documents({"family_id": {"$exists": False}})
        # Sanity: any document tagged with a DIFFERENT family_id that the
        # scoped collection should never expose to us. Counted but never
        # listed (admin would see counts only).
        cross_tenant[name] = await coll.count_documents({
            "family_id": {"$exists": True, "$ne": family_id}
        })
    me = await raw_db.family_members.find_one(
        {"id": token.get("mid"), "family_id": family_id},
        {"_id": 0, "pin_hash": 0},
    )
    return {
        "family_id": family_id,
        "current_member": me,
        "scoped_collection_counts": per_family,
        "orphan_records_no_family_id": orphans,
        # Total docs that belong to OTHER families. By design these MUST never
        # be returned to this scope — counted here only to prove tenant
        # boundaries are intact (a leak would surface in the per-family
        # numbers above, not here).
        "other_family_records_in_db": cross_tenant,
        "note": "Only 'orphan_records_no_family_id' should be 0 for a healthy deployment. 'other_family_records_in_db' counts foreign-tenant rows that exist in the DB but remain invisible to this scope.",
    }


# ============= Shopping List =============
# Simple family-shared shopping list. Each item only tracks whether it has been
# purchased. "Finish shopping" removes purchased items and keeps the rest.

class ShoppingItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    purchased: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ShoppingItemCreate(BaseModel):
    name: str


@api_router.get("/shopping", response_model=List[ShoppingItem])
async def list_shopping_items():
    docs = await db.shopping_items.find({}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return [ShoppingItem(**d) for d in docs]


@api_router.post("/shopping", response_model=ShoppingItem)
async def create_shopping_item(payload: ShoppingItemCreate):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Item name is required")
    item = ShoppingItem(name=name)
    await db.shopping_items.insert_one(item.model_dump())
    return item


@api_router.patch("/shopping/{item_id}/toggle", response_model=ShoppingItem)
async def toggle_shopping_item(item_id: str):
    existing = await db.shopping_items.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    new_state = not bool(existing.get("purchased"))
    await db.shopping_items.update_one(
        {"id": item_id}, {"$set": {"purchased": new_state}}
    )
    existing["purchased"] = new_state
    return ShoppingItem(**existing)


@api_router.delete("/shopping/{item_id}")
async def delete_shopping_item(item_id: str):
    res = await db.shopping_items.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


@api_router.post("/shopping/finish")
async def finish_shopping():
    res = await db.shopping_items.delete_many({"purchased": True})
    return {"ok": True, "removed": res.deleted_count}


# ============= Financial Forecast =============
# Predicts the budget situation for any future month using:
#   - recurring income (average of last 3 completed months)
#   - bills active in that month (respecting start_date / end_date / auto_renew)
#   - loan installments still running that month (start_date + term_months)
#   - debts whose due_date falls inside the month and not yet paid
#
# IMPORTANT: only the monthly_payment of a loan is counted — never the
# remaining principal. That matches the rest of the budget engine.

def _parse_iso_date(value: Optional[str]):
    """Parse YYYY-MM-DD or full ISO datetime to a date. Returns None if invalid."""
    if not value:
        return None
    try:
        s = str(value)
        # Accept full datetime strings too — keep only the date part.
        if "T" in s:
            s = s.split("T")[0]
        if "Z" in s:
            s = s.split("Z")[0]
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def _add_months(year: int, month: int, delta: int):
    """Return (year, month) after adding delta months."""
    idx = (year * 12 + (month - 1)) + delta
    return idx // 12, (idx % 12) + 1


def _month_first_last(year: int, month: int):
    """Return (first_day, last_day) as date objects for a calendar month."""
    first = datetime(year, month, 1).date()
    days = monthrange(year, month)[1]
    last = datetime(year, month, days).date()
    return first, last


def _bill_active_in_month(bill: dict, year: int, month: int) -> bool:
    """A recurring bill counts in (year, month) if its contract window covers
    that month — or if it auto-renews past its declared end date."""
    first, last = _month_first_last(year, month)
    start = _parse_iso_date(bill.get("start_date"))
    end = _parse_iso_date(bill.get("end_date"))
    if start and start > last:
        # Contract hasn't started yet for this month.
        return False
    if end and end < first:
        # Contract already ended before this month — only count if auto-renew.
        return bool(bill.get("auto_renew"))
    return True


def _loan_active_in_month(loan: dict, year: int, month: int) -> bool:
    """Loan installment counts only when the loan is still running that month."""
    first, _ = _month_first_last(year, month)
    start = _parse_iso_date(loan.get("start_date"))
    term = int(loan.get("term_months") or 0)
    if not start or term <= 0:
        # No start_date or term — assume still active (best effort).
        return True
    # Last installment month = start_month + (term - 1).
    end_year, end_month = _add_months(start.year, start.month, term - 1)
    end_first, end_last = _month_first_last(end_year, end_month)
    return first <= end_last


def _debts_due_in_month(debts: list, year: int, month: int) -> float:
    """Sum remaining_amount of unpaid/partial debts due inside (year, month)."""
    first, last = _month_first_last(year, month)
    total = 0.0
    for d in debts:
        due = _parse_iso_date(d.get("due_date"))
        if not due:
            continue
        if first <= due <= last and (d.get("status") != "paid"):
            total += float(d.get("remaining_amount") or 0)
    return total


async def _recurring_income_estimate(target_year: int, target_month: int) -> float:
    """Average of last 3 completed months' income totals.

    We look back from the month *before* the target (so future months get the
    full available history). If no history exists, fall back to whatever was
    recorded for the current calendar month.
    """
    now = datetime.now(timezone.utc)
    # End anchor — the latest completed month that's not the target itself.
    anchor_y, anchor_m = now.year, now.month
    # If target is in the past, anchor right before the target.
    if (target_year, target_month) <= (anchor_y, anchor_m):
        anchor_y, anchor_m = _add_months(target_year, target_month, -1)

    totals = []
    for i in range(3):
        y, m = _add_months(anchor_y, anchor_m, -i)
        s, e = _month_bounds(y, m)
        totals.append(await _sum_entries(db.budget_income, s, e))
    nonzero = [t for t in totals if t > 0]
    if nonzero:
        return sum(nonzero) / len(nonzero)
    # Fallback — current month total (may be 0 for a brand-new app).
    s, e = _month_bounds(now.year, now.month)
    return await _sum_entries(db.budget_income, s, e)


async def _forecast_for_month(year: int, month: int) -> dict:
    bills = await db.budget_bills.find({}, {"_id": 0}).to_list(1000)
    loans = await db.budget_loans.find({}, {"_id": 0}).to_list(500)
    debts = await db.budget_debts.find({}, {"_id": 0}).to_list(500)

    income_total = await _recurring_income_estimate(year, month)

    bills_total = 0.0
    active_bills = []
    expired_bills = []
    for b in bills:
        if _bill_active_in_month(b, year, month):
            cost = _bill_month_cost(b)
            bills_total += cost
            active_bills.append({"id": b.get("id"), "name": b.get("name"), "amount": round(cost, 2)})
        else:
            expired_bills.append({"id": b.get("id"), "name": b.get("name")})

    loans_total = 0.0
    active_loans = []
    ended_loans = []
    for ln in loans:
        if _loan_active_in_month(ln, year, month):
            pay = float(ln.get("monthly_payment") or 0)
            loans_total += pay
            active_loans.append({"id": ln.get("id"), "name": ln.get("name"), "amount": round(pay, 2)})
        else:
            ended_loans.append({"id": ln.get("id"), "name": ln.get("name")})

    debts_total = _debts_due_in_month(debts, year, month)
    obligations = bills_total + loans_total + debts_total
    remaining = income_total - obligations

    return {
        "year": year,
        "month": month,
        "income_total": round(income_total, 2),
        "bills_total": round(bills_total, 2),
        "loans_total": round(loans_total, 2),
        "debts_total": round(debts_total, 2),
        "obligations_total": round(obligations, 2),
        "remaining": round(remaining, 2),
        "active_bills": active_bills,
        "expired_bills": expired_bills,
        "active_loans": active_loans,
        "ended_loans": ended_loans,
    }


@api_router.get("/budget/forecast")
async def budget_forecast(year: int, month: int):
    """Single-month forecast with a comparison to the current calendar month."""
    if month < 1 or month > 12:
        raise HTTPException(400, "month must be between 1 and 12")
    target = await _forecast_for_month(year, month)
    now = datetime.now(timezone.utc)
    current = await _forecast_for_month(now.year, now.month)

    # Try to identify what changed between current month and the forecast.
    ended_now = {ln["id"] for ln in current["active_loans"]} - {ln["id"] for ln in target["active_loans"]}
    expired_now = {b["id"] for b in current["active_bills"]} - {b["id"] for b in target["active_bills"]}

    return {
        "forecast": target,
        "current": {
            "year": current["year"],
            "month": current["month"],
            "remaining": current["remaining"],
            "obligations_total": current["obligations_total"],
            "income_total": current["income_total"],
        },
        "delta": {
            "remaining": round(target["remaining"] - current["remaining"], 2),
            "obligations": round(target["obligations_total"] - current["obligations_total"], 2),
        },
        "changes": {
            # IDs of loans/bills that exist now but not in the forecast month.
            "loans_ended": [ln for ln in current["active_loans"] if ln["id"] in ended_now],
            "bills_expired": [b for b in current["active_bills"] if b["id"] in expired_now],
        },
    }


@api_router.get("/budget/forecast/range")
async def budget_forecast_range(months: int = 6):
    """Compact forecast for the next N months — used for the rolling preview."""
    months = max(1, min(int(months or 6), 24))
    now = datetime.now(timezone.utc)
    out = []
    for i in range(months):
        y, m = _add_months(now.year, now.month, i + 1)
        f = await _forecast_for_month(y, m)
        out.append({
            "year": y,
            "month": m,
            "income_total": f["income_total"],
            "obligations_total": f["obligations_total"],
            "remaining": f["remaining"],
        })
    return {"months": out}


@api_router.get("/budget/contracts/expiring")
async def budget_contracts_expiring():
    """Bills whose contract end_date falls in the next 3 months. Buckets:
       3 months, 1 month, 2 weeks — for the reminder UI."""
    today = datetime.now(timezone.utc).date()
    horizon = today + timedelta(days=92)
    bills = await db.budget_bills.find({}, {"_id": 0}).to_list(1000)
    expiring = []
    for b in bills:
        end = _parse_iso_date(b.get("end_date"))
        if not end:
            continue
        if today <= end <= horizon:
            days = (end - today).days
            if days <= 14:
                bucket = "2_weeks"
            elif days <= 31:
                bucket = "1_month"
            else:
                bucket = "3_months"
            expiring.append({
                "id": b.get("id"),
                "name": b.get("name"),
                "amount": float(b.get("amount") or 0),
                "end_date": b.get("end_date"),
                "auto_renew": bool(b.get("auto_renew")),
                "days_left": days,
                "bucket": bucket,
            })
    expiring.sort(key=lambda x: x["days_left"])
    return {"expiring": expiring}


# ============= Site Content (admin-managed legal & brand text) =============
# Single global document keyed by SITE_CONTENT_KEY. Stores the editable
# brand metadata + the four legal long-text fields. The PUT endpoint is
# admin-only (require_admin). The GET endpoint is intentionally PUBLIC so
# the legal pages render with or without auth.
SITE_CONTENT_KEY = "global"

# Defaults — used when the doc doesn't exist yet OR when a field is empty.
# Keeping these here means the live legal pages still have content even on
# a brand-new install before the admin has saved anything.
DEFAULT_SITE_CONTENT = {
    "app_name": "My Life My Time",
    "app_version": "0.9.0-beta",
    "company_name": "My Life My Time",
    "contact_email": "info@mylife-mytime.com",
    "address": "Kaiserstraße 101\n76133 Karlsruhe\nGermany",
    "phone_number": "",
    "privacy_policy": (
        "My Life My Time respects your privacy and is committed to protecting "
        "your personal information.\n\n"
        "Information We Collect\n"
        "- Account information such as name, email address and login credentials\n"
        "- Profile information voluntarily provided by users\n"
        "- Family-related information entered by users\n"
        "- Uploaded images and documents\n"
        "- Device and technical information required for service operation\n"
        "- Usage information necessary to improve functionality and security\n\n"
        "How We Use Information\n"
        "- To provide and maintain the service\n"
        "- To authenticate users\n"
        "- To synchronize family data\n"
        "- To improve user experience\n"
        "- To provide customer support\n"
        "- To ensure platform security\n"
        "- To prevent abuse and unauthorized access\n\n"
        "Data Sharing\n"
        "Personal information is never sold to third parties. Information may "
        "only be disclosed when required by law, to protect legal rights, or "
        "to provide essential technical services required for operation.\n\n"
        "Data Retention\n"
        "Personal data is retained only as long as necessary to operate the "
        "service, maintain user accounts, fulfill legal obligations, and "
        "ensure platform security.\n\n"
        "User Rights\n"
        "Users may request access, correction, export, or deletion of their "
        "personal data by contacting info@mylife-mytime.com.\n\n"
        "Security\n"
        "Reasonable technical and organizational measures are implemented to "
        "protect personal information against unauthorized access, "
        "alteration, disclosure, or destruction.\n\n"
        "Contact\n"
        "For privacy-related inquiries: info@mylife-mytime.com."
    ),
    "terms_of_service": (
        "By accessing or using My Life My Time, you agree to these Terms of Service.\n\n"
        "Eligibility\n"
        "Users must comply with applicable laws and regulations when using the platform.\n\n"
        "Acceptable Use\n"
        "Users agree not to:\n"
        "- Use the platform for unlawful purposes\n"
        "- Attempt unauthorized access\n"
        "- Interfere with system operation\n"
        "- Upload malicious software\n"
        "- Abuse or exploit platform features\n\n"
        "Accounts\n"
        "Users are responsible for maintaining the confidentiality of their "
        "accounts and passwords.\n\n"
        "Service Availability\n"
        "The service is provided on an \"AS IS\" and \"AS AVAILABLE\" basis. "
        "The operator may modify, update, suspend, or discontinue any feature "
        "at any time without prior notice.\n\n"
        "Limitation of Liability\n"
        "The operator shall not be liable for indirect, incidental, special, "
        "consequential, or punitive damages arising from the use of the platform.\n\n"
        "Termination\n"
        "Accounts may be suspended or terminated in cases of abuse, fraud, "
        "illegal activity, or violation of these terms.\n\n"
        "Changes to Terms\n"
        "These terms may be updated periodically. Continued use of the "
        "platform constitutes acceptance of any modifications.\n\n"
        "Contact\n"
        "info@mylife-mytime.com"
    ),
    "legal_notice": (
        "Operator\n"
        "My Life My Time\n\n"
        "Owner\n"
        "Bahaa Nasser\n\n"
        "Address\n"
        "Kaiserstraße 101\n"
        "76133 Karlsruhe\n"
        "Germany\n\n"
        "Email\n"
        "info@mylife-mytime.com\n\n"
        "Disclaimer\n"
        "The information provided on this website and application is for "
        "general informational purposes only. While every effort is made to "
        "keep the information accurate and up to date, no warranties are made "
        "regarding completeness, accuracy, reliability, suitability, or "
        "availability.\n\n"
        "External Links\n"
        "External links are provided solely for convenience. The operator is "
        "not responsible for the content of third-party websites."
    ),
    "disclaimer": (
        "The content provided in this application is for general informational "
        "purposes only and does not constitute professional advice. While we "
        "strive to keep the information accurate and current, we make no "
        "representations or warranties of any kind, express or implied, about "
        "the completeness, accuracy, reliability, or suitability of the "
        "information for any purpose. Any reliance you place on such "
        "information is therefore strictly at your own risk."
    ),
}


class SiteContent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    # Short brand fields
    app_name: str = ""
    app_version: str = ""
    company_name: str = ""
    contact_email: str = ""
    address: str = ""
    phone_number: str = ""
    # Long legal texts
    privacy_policy: str = ""
    terms_of_service: str = ""
    legal_notice: str = ""
    disclaimer: str = ""
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None  # admin account_id


class SiteContentUpdate(BaseModel):
    """Partial update payload — only fields explicitly sent are applied,
    so the admin can save one field without wiping the others."""
    model_config = ConfigDict(extra="ignore")
    app_name: Optional[str] = None
    app_version: Optional[str] = None
    company_name: Optional[str] = None
    contact_email: Optional[str] = None
    address: Optional[str] = None
    phone_number: Optional[str] = None
    privacy_policy: Optional[str] = None
    terms_of_service: Optional[str] = None
    legal_notice: Optional[str] = None
    disclaimer: Optional[str] = None


async def _read_site_content() -> dict:
    """Load the global site_content doc, merge any missing fields with the
    defaults so every consumer sees a complete object."""
    doc = await raw_db.site_content.find_one(
        {"_key": SITE_CONTENT_KEY}, {"_id": 0}
    ) or {}
    merged = {**DEFAULT_SITE_CONTENT, **{k: v for k, v in doc.items() if k != "_key"}}
    # An explicit "" from the admin means "use default" — gives them a way
    # to wipe a field without sending null.
    for k, default_v in DEFAULT_SITE_CONTENT.items():
        if not merged.get(k):
            merged[k] = default_v
    return merged


@api_router.get("/site-content")
async def get_site_content():
    """PUBLIC — read by the Privacy / ToS / Legal Notice / Disclaimer pages,
    so anonymous visitors can see the current text. No auth, no PII."""
    return await _read_site_content()


@api_router.put("/site-content")
async def update_site_content(
    payload: SiteContentUpdate,
    admin: dict = Depends(require_admin),
):
    """Admin-only. Partial PATCH semantics — only sent fields are written."""
    patch = payload.model_dump(exclude_unset=True, exclude_none=True)
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    patch["updated_by"] = admin.get("sub")
    await raw_db.site_content.update_one(
        {"_key": SITE_CONTENT_KEY},
        {"$set": patch, "$setOnInsert": {"_key": SITE_CONTENT_KEY}},
        upsert=True,
    )
    return await _read_site_content()


# ============= Account Deletion (GDPR) =============
# Two-phase, soft-then-hard delete with a 30-day grace window:
#  1) POST /api/account/request-delete   → marks status="deletion_requested"
#                                          + sets the +30d schedule, requires
#                                          password confirmation + the
#                                          localized "DELETE" string.
#  2) POST /api/account/cancel-delete    → restores the account during the
#                                          grace window.
#  3) Background job (`_purge_overdue_deletions`) wipes EVERY tenant-scoped
#                                          collection for the family and
#                                          writes a minimal legal-only
#                                          record into `deletion_audit`.
#
# Auth: both endpoints accept the regular account_token. The token survives
# the deletion request (so the user can cancel by logging back in), but
# every OTHER endpoint guards via `require_active_account_token_async` and
# rejects with HTTP 423.

DELETION_GRACE_DAYS = 30

# Localized confirmation strings — admin must type one of these literally.
DELETION_CONFIRM_WORDS = {"DELETE", "حذف", "LÖSCHEN", "LOSCHEN"}

# Every Mongo collection that may carry tenant-scoped data tied to a
# family_id. The purge walks this list and deletes every doc with the
# matching family_id. Account-level docs (the account itself + sessions)
# are handled separately.
TENANT_COLLECTIONS = (
    "family_members",
    "events",
    "budget_income",
    "budget_expenses",
    "budget_bills",
    "budget_debts",
    "budget_loans",
    "wall_settings",
    "wall_messages",
    "wall_photos",
    "wall_goals",
    "wall_achievements",
    "wall_notes",
    "wall_countdown",
    "shopping_lists",
    "shopping_items",
    "routines",
    "routine_logs",
    "kids_money",
    "kids_money_goals",
    "kids_money_tx",
    "activity_log",
    "locations",
    "location_consents",
)

# Account-level collections (keyed by account_id, not family_id).
ACCOUNT_COLLECTIONS = (
    "password_resets",
    "login_attempts",
    "recovery_codes",
)


class RequestDeletePayload(BaseModel):
    password: str
    confirm: str  # must equal one of DELETION_CONFIRM_WORDS


@api_router.post("/account/request-delete")
async def request_account_deletion(
    payload: RequestDeletePayload,
    token: dict = Depends(require_account_token),
):
    """Initiate GDPR account deletion. Soft-marks the account and schedules
    permanent purge in +30 days. Reversible via /cancel-delete."""
    # 1) Confirmation phrase
    typed = (payload.confirm or "").strip().upper()
    if typed not in DELETION_CONFIRM_WORDS:
        raise HTTPException(
            status_code=400,
            detail="Confirmation phrase mismatch. Please type DELETE / حذف / LÖSCHEN.",
        )
    # 2) Password re-confirmation — protects against session-hijack scenarios.
    acc = await raw_db.accounts.find_one({"id": token["sub"]}, {"_id": 0})
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    if not verify_secret(payload.password, acc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Wrong password")
    if acc.get("status") == "deletion_requested":
        # Idempotent: report the existing schedule.
        return {
            "ok": True,
            "already_requested": True,
            "deletion_requested_at": acc.get("deletion_requested_at"),
            "scheduled_permanent_delete_at": acc.get("scheduled_permanent_delete_at"),
            "grace_days": DELETION_GRACE_DAYS,
        }
    now = datetime.now(timezone.utc)
    scheduled = now + timedelta(days=DELETION_GRACE_DAYS)
    await raw_db.accounts.update_one(
        {"id": acc["id"]},
        {"$set": {
            "status": "deletion_requested",
            "deletion_requested_at": now.isoformat(),
            "scheduled_permanent_delete_at": scheduled.isoformat(),
            "deletion_cancelled_at": None,
        }},
    )
    # Family is parked too — login still works (so user can cancel) but the
    # family-level status flips so member tokens are also invalidated.
    if acc.get("family_id"):
        await raw_db.families.update_one(
            {"id": acc["family_id"]},
            {"$set": {"status": "deletion_requested"}},
        )
    logger.warning(
        "[DELETION] requested account=%s family=%s purge_at=%s",
        acc["id"], acc.get("family_id"), scheduled.isoformat(),
    )
    return {
        "ok": True,
        "deletion_requested_at": now.isoformat(),
        "scheduled_permanent_delete_at": scheduled.isoformat(),
        "grace_days": DELETION_GRACE_DAYS,
    }


@api_router.post("/account/cancel-delete")
async def cancel_account_deletion(
    token: dict = Depends(require_account_token),
):
    """Revoke a pending deletion. Restores the account + family to active."""
    acc = await raw_db.accounts.find_one({"id": token["sub"]}, {"_id": 0})
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    if acc.get("status") != "deletion_requested":
        return {"ok": True, "noop": True}
    now = datetime.now(timezone.utc).isoformat()
    await raw_db.accounts.update_one(
        {"id": acc["id"]},
        {"$set": {
            "status": "active",
            "deletion_cancelled_at": now,
            "scheduled_permanent_delete_at": None,
        }},
    )
    if acc.get("family_id"):
        await raw_db.families.update_one(
            {"id": acc["family_id"]},
            {"$set": {"status": "active"}},
        )
    logger.warning(
        "[DELETION] cancelled account=%s family=%s",
        acc["id"], acc.get("family_id"),
    )
    return {"ok": True, "cancelled_at": now}


@api_router.get("/account/deletion-status")
async def account_deletion_status(
    token: dict = Depends(require_account_token),
):
    """Used by the frontend after login to display the cancel-deletion banner."""
    acc = await raw_db.accounts.find_one(
        {"id": token["sub"]},
        {"_id": 0, "status": 1, "deletion_requested_at": 1,
         "scheduled_permanent_delete_at": 1, "deletion_cancelled_at": 1},
    )
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    return {
        "status": acc.get("status") or "active",
        "deletion_requested_at": acc.get("deletion_requested_at"),
        "scheduled_permanent_delete_at": acc.get("scheduled_permanent_delete_at"),
        "deletion_cancelled_at": acc.get("deletion_cancelled_at"),
        "grace_days": DELETION_GRACE_DAYS,
    }


async def _purge_account_data(account: dict) -> dict:
    """Hard-delete every record tied to the account / family + write the
    legal-only audit row. Returns counts for observability.

    Only call this for accounts whose `scheduled_permanent_delete_at` is in
    the past — the caller is responsible for that check.
    """
    counts = {}
    fid = account.get("family_id")
    aid = account["id"]
    # 1) Tenant-scoped data (everything keyed by family_id).
    if fid:
        for col in TENANT_COLLECTIONS:
            res = await raw_db[col].delete_many({"family_id": fid})
            if res.deleted_count:
                counts[col] = res.deleted_count
        # site_content is GLOBAL — never purge it from here.
    # 2) Account-scoped data.
    for col in ACCOUNT_COLLECTIONS:
        res = await raw_db[col].delete_many({"account_id": aid})
        if res.deleted_count:
            counts[col] = res.deleted_count
    # 3) Audit log (legal-only fields, no PII besides the hashed email).
    await raw_db.deletion_audit.insert_one({
        "id": str(uuid.uuid4()),
        "account_id": aid,
        "hashed_email": hash_secret(account.get("email", "")),
        "account_type": (await raw_db.families.find_one(
            {"id": fid}, {"_id": 0, "account_type": 1}
        ) or {}).get("account_type", "unknown") if fid else "unknown",
        "deletion_requested_at": account.get("deletion_requested_at"),
        "permanently_deleted_at": datetime.now(timezone.utc).isoformat(),
        "reason": "user_request",
        "counts": counts,
    })
    # 4) Finally: remove the family + account documents themselves.
    if fid:
        await raw_db.families.delete_one({"id": fid})
    await raw_db.accounts.delete_one({"id": aid})
    logger.warning(
        "[DELETION] PURGED account=%s family=%s counts=%s",
        aid, fid, counts,
    )
    return counts


async def _purge_overdue_deletions():
    """Single scan-and-purge pass. Run on startup AND on a 6-hour timer."""
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor = raw_db.accounts.find(
        {
            "status": "deletion_requested",
            "scheduled_permanent_delete_at": {"$lte": now_iso, "$ne": None},
        },
        {"_id": 0},
    )
    purged = 0
    async for acc in cursor:
        await _purge_account_data(acc)
        purged += 1
    if purged:
        logger.warning("[DELETION] purge pass complete — %d accounts removed", purged)


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


@app.on_event("startup")
async def on_startup():
    """One-time bootstrap for the multi-tenant auth system + data migration."""
    try:
        await auth_ensure_indexes(raw_db)
        await auth_seed_admin(raw_db)
        await auth_seed_default_family(raw_db)
        await migrate_legacy_to_nasser(raw_db)
    except Exception as exc:  # never fail to start because of seed errors
        logger.exception("Auth bootstrap failed: %s", exc)

    # Kick off the deletion-purge periodic task. Runs an immediate scan and
    # then sleeps 6h between passes. Daemon-style — failures are logged
    # but never escape the loop so the server stays up.
    async def _deletion_purge_loop():
        while True:
            try:
                await _purge_overdue_deletions()
            except Exception as exc:  # noqa: BLE001
                logger.exception("Deletion purge pass failed: %s", exc)
            # 6 hours — well below the 30-day grace, so we hit the schedule
            # within < quarter-day of the deadline.
            await asyncio.sleep(6 * 60 * 60)

    asyncio.create_task(_deletion_purge_loop())


async def migrate_legacy_to_nasser(rdb):
    """Idempotent migration: attach all pre-existing data to Nasser Family.

    Adds `family_id` to every legacy document that doesn't have one yet,
    binds the Nasser Family's per-family `family_code` to the legacy value
    so the standalone Android sender keeps working, and moves GPS-shaped
    docs out of `family_members` (which is now reserved for auth) into the
    dedicated `gps_devices` collection.

    This DOES NOT delete any data and is safe to run on every boot.
    """
    nasser = await rdb.families.find_one({"legacy": True}, {"_id": 0})
    if not nasser:
        return
    fid = nasser["id"]

    # 1) Pin the legacy family_code so the standalone Android sender keeps
    # talking to Nasser Family without any reconfiguration.
    legacy_code = os.environ.get("FAMILY_CODE", "FAMILY2026")
    if not nasser.get("family_code"):
        await rdb.families.update_one(
            {"id": fid}, {"$set": {"family_code": legacy_code}}
        )
        logger.warning("[MIGRATE] bound family_code=%s to %s", legacy_code, nasser.get("name"))

    # 2) Move GPS-shaped docs out of family_members → gps_devices.
    legacy_gps = await rdb.family_members.find(
        {"pin_hash": {"$exists": False}, "latitude": {"$exists": True}},
        {"_id": 0},
    ).to_list(2000)
    if legacy_gps:
        for doc in legacy_gps:
            doc["family_id"] = fid
            await rdb.gps_devices.update_one(
                {"id": doc.get("id"), "family_id": fid},
                {"$setOnInsert": doc},
                upsert=True,
            )
        await rdb.family_members.delete_many(
            {"pin_hash": {"$exists": False}, "latitude": {"$exists": True}},
        )
        logger.warning("[MIGRATE] moved %d GPS docs to gps_devices", len(legacy_gps))

    # 3) Backfill family_id on every legacy data collection.
    from tenant import SCOPED_COLLECTIONS
    for col_name in SCOPED_COLLECTIONS:
        res = await rdb[col_name].update_many(
            {"family_id": {"$exists": False}},
            {"$set": {"family_id": fid}},
        )
        if res.modified_count:
            logger.warning(
                "[MIGRATE] %s: tagged %d legacy docs with family_id=%s",
                col_name, res.modified_count, fid,
            )

    # 4) Make sure every other family has its own random family_code so the
    # standalone GPS sender can authenticate it without reusing Nasser's.
    import secrets
    others = await rdb.families.find(
        {"family_code": {"$exists": False}}, {"_id": 0, "id": 1}
    ).to_list(1000)
    for f in others:
        await rdb.families.update_one(
            {"id": f["id"]},
            {"$set": {"family_code": secrets.token_urlsafe(12)}},
        )

    # 5) Per-family event owner migration. Legacy events store `user_id` as
    # the literal strings 'wife' / 'husband' (or other id strings from the
    # pre-multi-member era). Map any such event to the first family admin of
    # its family so it shows up under a real calendar owner. Idempotent.
    fam_ids = await rdb.events.distinct(
        "family_id", {"owner_member_id": {"$exists": False}}
    )
    for fid_ in fam_ids:
        # Prefer the oldest family admin; fall back to the oldest parent;
        # finally the oldest member of any role.
        first_admin = await rdb.family_members.find_one(
            {"family_id": fid_, "is_family_admin": True},
            {"_id": 0, "id": 1},
            sort=[("created_at", 1)],
        )
        if not first_admin:
            first_admin = await rdb.family_members.find_one(
                {"family_id": fid_}, {"_id": 0, "id": 1},
                sort=[("created_at", 1)],
            )
        if not first_admin:
            continue
        owner_id = first_admin["id"]
        # Wife/husband legacy → re-assign to the first admin.
        await rdb.events.update_many(
            {
                "family_id": fid_,
                "owner_member_id": {"$exists": False},
                "user_id": {"$in": ["wife", "husband"]},
            },
            {"$set": {"owner_member_id": owner_id, "user_id": owner_id}},
        )
        # Any remaining legacy event without owner_member_id but with a
        # non-empty user_id that already matches a family member id → mirror.
        async for ev in rdb.events.find(
            {"family_id": fid_, "owner_member_id": {"$exists": False}},
            {"_id": 0, "id": 1, "user_id": 1},
        ):
            uid = ev.get("user_id")
            if not uid:
                continue
            await rdb.events.update_one(
                {"id": ev["id"]}, {"$set": {"owner_member_id": uid}}
            )

    # 6) Budget owner migration. Legacy budget rows store `owner` as the
    # literal strings "bahaa" or "theresa". Map those to actual family
    # member ids per family by matching member names (case-insensitive).
    # Falls back to the first / second family admin if no name match.
    # Rows whose owner is already a member id (or "shared") are skipped.
    BUDGET_COLLECTIONS = (
        "budget_income", "budget_expenses", "budget_bills",
        "budget_debts", "budget_loans",
    )
    legacy_owner_names = ("bahaa", "theresa")
    for col_name in BUDGET_COLLECTIONS:
        fam_ids_b = await rdb[col_name].distinct(
            "family_id", {"owner": {"$in": list(legacy_owner_names)}}
        )
        for fid_b in fam_ids_b:
            members = await rdb.family_members.find(
                {"family_id": fid_b},
                {"_id": 0, "id": 1, "name": 1, "is_family_admin": 1, "created_at": 1},
            ).sort("created_at", 1).to_list(100)
            if not members:
                continue
            by_name = {(m.get("name") or "").strip().lower(): m["id"] for m in members}
            admins = [m["id"] for m in members if m.get("is_family_admin")]
            fallback_pool = admins or [m["id"] for m in members]
            mapping = {}
            for idx, legacy_name in enumerate(legacy_owner_names):
                mapped = by_name.get(legacy_name)
                if not mapped and idx < len(fallback_pool):
                    mapped = fallback_pool[idx]
                elif not mapped and fallback_pool:
                    mapped = fallback_pool[0]
                if mapped:
                    mapping[legacy_name] = mapped
            for legacy_name, new_owner in mapping.items():
                res = await rdb[col_name].update_many(
                    {"family_id": fid_b, "owner": legacy_name},
                    {"$set": {"owner": new_owner}},
                )
                if res.modified_count:
                    logger.warning(
                        "[MIGRATE] %s: remapped %d '%s' rows to member %s in family %s",
                        col_name, res.modified_count, legacy_name, new_owner, fid_b,
                    )

    # 7) Wall-settings default cleanup. Older versions baked English defaults
    # ("Together We Build Beautiful Memories", "Message of the Day", "Our
    # Family, Our Dreams, Our Happiness") straight into the DB on first
    # access. That bypasses i18n and looks broken in Arabic / German /
    # single-account mode. Clear them so the frontend can fall back to the
    # localized placeholders. Custom user strings are left intact.
    legacy_wall_defaults = {
        "hero_title": "Together We Build Beautiful Memories",
        "hero_subtitle": "Our Family, Our Dreams, Our Happiness",
        "message_title": "Message of the Day",
    }
    for field, legacy_value in legacy_wall_defaults.items():
        res = await rdb.wall_settings.update_many(
            {field: legacy_value},
            {"$set": {field: ""}},
        )
        if res.modified_count:
            logger.warning(
                "[MIGRATE] wall_settings.%s: cleared %d legacy-default rows",
                field, res.modified_count,
            )

    # 8) Same idea for the (very short-lived) v2 defaults that landed before
    # the "My Life My Time" rebrand. Cleared so the new localized strings
    # surface for every existing family.
    legacy_v2_wall_defaults = {
        "hero_title": "Organize your day, reach your goals",
        "hero_subtitle": "All your plans, notes, and tasks in one place",
    }
    for field, legacy_value in legacy_v2_wall_defaults.items():
        res = await rdb.wall_settings.update_many(
            {field: legacy_value},
            {"$set": {field: ""}},
        )
        if res.modified_count:
            logger.warning(
                "[MIGRATE] wall_settings.%s (v2): cleared %d rows",
                field, res.modified_count,
            )
