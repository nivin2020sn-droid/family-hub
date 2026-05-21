from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from calendar import monthrange


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


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
    user_id: str  # "wife" or "husband"
    type_id: Optional[str] = None
    color: str
    date: str  # ISO date YYYY-MM-DD
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class EventCreate(BaseModel):
    title: str
    user_id: str
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
    hero_title: str = "Together We Build Beautiful Memories"
    hero_subtitle: str = "Our Family, Our Dreams, Our Happiness"
    hero_photo: Optional[str] = None  # base64 data URL or remote URL
    message_title: str = "Message of the Day"
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
    caption: Optional[str] = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class WallPhotoCreate(BaseModel):
    image: str
    caption: Optional[str] = ""


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


# ============= Startup: seed users =============

@app.on_event("startup")
async def seed_users():
    default_users = [
        {"id": "wife", "name": "Wife", "role": "wife", "color": "#F472B6"},
        {"id": "husband", "name": "Husband", "role": "husband", "color": "#60A5FA"},
    ]
    # Upsert ensures both users exist even if a previous startup failed midway.
    # $setOnInsert preserves any custom name the user has saved.
    for u in default_users:
        try:
            await db.users.update_one(
                {"id": u["id"]},
                {"$setOnInsert": u},
                upsert=True,
            )
        except Exception as e:  # noqa: BLE001
            logging.getLogger(__name__).warning("seed_users failed for %s: %s", u["id"], e)


# ============= Routes =============

@api_router.get("/")
async def root():
    return {"message": "My Family My Life API"}


# ============= Auth: Family Code =============

class FamilyCodeVerify(BaseModel):
    code: str


@api_router.post("/auth/verify")
async def verify_family_code(payload: FamilyCodeVerify):
    expected = os.environ.get("FAMILY_CODE", "FAMILY2026")
    submitted = (payload.code or "").strip()
    if not submitted or submitted != expected:
        raise HTTPException(status_code=401, detail="Invalid family code")
    return {"ok": True}


@api_router.get("/users", response_model=List[User])
async def get_users():
    # Ensure both default users exist (self-healing on every read).
    defaults = [
        {"id": "wife", "name": "Wife", "role": "wife", "color": "#F472B6"},
        {"id": "husband", "name": "Husband", "role": "husband", "color": "#60A5FA"},
    ]
    for u in defaults:
        try:
            await db.users.update_one(
                {"id": u["id"]}, {"$setOnInsert": u}, upsert=True
            )
        except Exception:
            pass
    users = await db.users.find({}, {"_id": 0}).to_list(100)
    # Sort wife first, then husband, then any others
    order = {"wife": 0, "husband": 1}
    users.sort(key=lambda x: order.get(x.get("id"), 99))
    return users


@api_router.put("/users/{user_id}", response_model=User)
async def update_user(user_id: str, payload: UserUpdate):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        existing = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        return existing
    result = await db.users.find_one_and_update(
        {"id": user_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not result:
        raise HTTPException(404, "Not found")
    return result


# Event Types
@api_router.get("/event-types", response_model=List[EventType])
async def list_event_types():
    items = await db.event_types.find({}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return items


@api_router.post("/event-types", response_model=EventType)
async def create_event_type(payload: EventTypeCreate):
    obj = EventType(**payload.model_dump())
    await db.event_types.insert_one(obj.model_dump())
    return obj


@api_router.put("/event-types/{type_id}", response_model=EventType)
async def update_event_type(type_id: str, payload: EventTypeUpdate):
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
async def delete_event_type(type_id: str):
    res = await db.event_types.delete_one({"id": type_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# Events
@api_router.get("/events", response_model=List[Event])
async def list_events(user_id: Optional[str] = None, month: Optional[int] = None, year: Optional[int] = None):
    query: dict = {}
    if user_id:
        query["user_id"] = user_id
    if month and year:
        # Match by date string prefix YYYY-MM
        prefix = f"{year:04d}-{month:02d}"
        query["date"] = {"$regex": f"^{prefix}"}
    items = await db.events.find(query, {"_id": 0}).to_list(5000)
    # sort by date then start_time
    items.sort(key=lambda e: (e.get("date", ""), e.get("start_time") or ""))
    return items


@api_router.post("/events", response_model=Event)
async def create_event(payload: EventCreate):
    obj = Event(**payload.model_dump())
    await db.events.insert_one(obj.model_dump())
    return obj


@api_router.put("/events/{event_id}", response_model=Event)
async def update_event(event_id: str, payload: EventUpdate):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        existing = await db.events.find_one({"id": event_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        return existing
    result = await db.events.find_one_and_update(
        {"id": event_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not result:
        raise HTTPException(404, "Not found")
    return result


@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str):
    res = await db.events.delete_one({"id": event_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
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

    - Validates the family code against the FAMILY_CODE env var.
    - Upserts a `family_members` document keyed by `memberId` (creates one
      automatically on the first valid ping).
    - Appends an immutable point to `location_points` for the history view.
    """
    expected_code = os.environ.get("FAMILY_CODE", "FAMILY2026")
    if (payload.familyCode or "").strip() != expected_code:
        raise HTTPException(status_code=401, detail="Invalid family code")

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
    # Only overwrite name / image if the sender provided one — otherwise we
    # keep whatever was set previously.
    if payload.memberName:
        member_update["name"] = payload.memberName
    if payload.profileImage:
        member_update["profileImage"] = payload.profileImage

    await db.family_members.update_one(
        {"id": payload.memberId},
        {
            "$set": member_update,
            "$setOnInsert": {"id": payload.memberId, "createdAt": now_iso},
        },
        upsert=True,
    )

    point = {
        "memberId": payload.memberId,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy": payload.accuracy,
        "speed": payload.speed,
        "battery": payload.battery,
        "timestamp": timestamp,
        "networkStatus": payload.networkStatus,
        "connectionType": payload.connectionType,
    }
    await db.location_points.insert_one(point)

    return {"ok": True}


@api_router.get("/location/latest", response_model=List[FamilyMemberOut])
async def location_latest():
    """Return the latest known position for every tracked family member."""
    items = await db.family_members.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return items


@api_router.get("/location/history", response_model=List[LocationPointOut])
async def location_history(
    memberId: str,
    date: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    """Return the movement history for a single member.

    The caller can pass either a `date` (YYYY-MM-DD, UTC) for a 24h window, or
    an explicit `start` / `end` ISO range. If nothing is passed, returns the
    last 24h.
    """
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
async def delete_location_member(member_id: str, familyCode: Optional[str] = None):
    """Remove a single tracked member and their entire location history.

    Used by the web app to clean up stale / duplicate device identities (e.g.
    after the Android app is reinstalled and a fresh memberId is generated).
    Protected by the same `FAMILY_CODE` env var used by the POST ingest.
    """
    expected_code = os.environ.get("FAMILY_CODE", "FAMILY2026")
    if (familyCode or "").strip() != expected_code:
        raise HTTPException(status_code=401, detail="Invalid family code")
    member_res = await db.family_members.delete_one({"id": member_id})
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
