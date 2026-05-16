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
from datetime import datetime, timezone


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


class WallGoalCreate(BaseModel):
    label: str
    icon: Optional[str] = "Target"
    done: bool = False


class WallGoalUpdate(BaseModel):
    label: Optional[str] = None
    icon: Optional[str] = None
    done: Optional[bool] = None


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
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.wall_settings.update_one(
            {"id": WALL_SETTINGS_ID}, {"$set": update}, upsert=True
        )
    doc = await db.wall_settings.find_one({"id": WALL_SETTINGS_ID}, {"_id": 0}) or {}
    doc.pop("id", None)
    # Merge defaults to ensure all keys present
    merged = WallSettings().model_dump()
    merged.update({k: v for k, v in doc.items() if v is not None})
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
async def list_wall_goals():
    items = await db.wall_goals.find({}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return items


@api_router.post("/wall/goals", response_model=WallGoal)
async def create_wall_goal(payload: WallGoalCreate):
    obj = WallGoal(**payload.model_dump())
    await db.wall_goals.insert_one(obj.model_dump())
    return obj


@api_router.put("/wall/goals/{goal_id}", response_model=WallGoal)
async def update_wall_goal(goal_id: str, payload: WallGoalUpdate):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        existing = await db.wall_goals.find_one({"id": goal_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        return existing
    result = await db.wall_goals.find_one_and_update(
        {"id": goal_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not result:
        raise HTTPException(404, "Not found")
    return result


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
