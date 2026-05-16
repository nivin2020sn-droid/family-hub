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
    description: Optional[str] = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class EventTypeCreate(BaseModel):
    name: str
    color: str
    description: Optional[str] = ""


class EventTypeUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None


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


# ============= Startup: seed users =============

@app.on_event("startup")
async def seed_users():
    default_users = [
        {"id": "wife", "name": "Wife", "role": "wife", "color": "#F472B6"},
        {"id": "husband", "name": "Husband", "role": "husband", "color": "#60A5FA"},
    ]
    for u in default_users:
        existing = await db.users.find_one({"id": u["id"]}, {"_id": 0})
        if not existing:
            await db.users.insert_one(u)


# ============= Routes =============

@api_router.get("/")
async def root():
    return {"message": "My Family My Life API"}


@api_router.get("/users", response_model=List[User])
async def get_users():
    users = await db.users.find({}, {"_id": 0}).to_list(100)
    return users


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
