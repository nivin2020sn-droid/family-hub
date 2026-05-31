"""Multi-tenant isolation for My Life My Time.

Wraps Motor's `AsyncIOMotorCollection` so that data collections automatically
filter every read by the current request's `family_id` and inject the same
value into every write.

The active family id is stored in a `contextvars.ContextVar`, populated by
`family_scope_middleware` for each `/api/*` request based on the bearer token.

Routes that legitimately need cross-tenant access (admin, auth) keep using the
raw Motor database handle that is passed separately to the auth/admin
routers; they do NOT go through `ScopedDB`.
"""

from __future__ import annotations

import contextvars
import logging
import os
from typing import Iterable

import jwt
from fastapi import HTTPException, Request

logger = logging.getLogger("mfml.tenant")

# Collections that hold per-family data. Anything not listed here keeps its
# raw Motor behaviour (e.g. `accounts`, `families`, `family_members`,
# `recovery_codes`, `login_attempts`).
SCOPED_COLLECTIONS = {
    # Budget
    "budget_income", "budget_expenses", "budget_bills",
    "budget_debts", "budget_loans",
    # Kids' personal money (one ledger per child member)
    "kids_money", "kids_money_goals",
    # Per-member activity feed for the Wall Board "Recent activity" strip.
    "activity_log",
    # Wall Board
    "wall_settings", "wall_photos", "wall_goals", "wall_countdown",
    "wall_achievements", "wall_notes", "wall_family_events",
    # Location (GPS) — `family_members` is reserved for auth; GPS devices now
    # live in their own collection.
    "gps_devices", "location_points",
    # Routines + Shopping
    "routines", "routine_logs",
    "shopping_items",
    # Legacy event_types / events / users (kept scoped just to be safe).
    "events", "event_types", "users",
}

current_family_id: contextvars.ContextVar = contextvars.ContextVar(
    "current_family_id", default=None
)


def require_current_family_id() -> str:
    fid = current_family_id.get()
    if not fid:
        raise HTTPException(status_code=401, detail="Family context required")
    return fid


class ScopedCollection:
    """Motor collection proxy that injects / enforces `family_id`."""

    def __init__(self, col):
        self._col = col
        self.name = col.name

    # -- helpers --
    def _fid(self) -> str:
        return require_current_family_id()

    def _scope_filter(self, filt):
        fid = self._fid()
        if filt is None:
            return {"family_id": fid}
        if not isinstance(filt, dict):
            return filt
        # Caller-provided family_id is overridden — never trust client input.
        return {**filt, "family_id": fid}

    def _scope_doc(self, doc):
        if isinstance(doc, dict):
            return {**doc, "family_id": self._fid()}
        return doc

    # -- read ops --
    def find(self, filt=None, *args, **kwargs):
        return self._col.find(self._scope_filter(filt), *args, **kwargs)

    async def find_one(self, filt=None, *args, **kwargs):
        return await self._col.find_one(self._scope_filter(filt), *args, **kwargs)

    async def count_documents(self, filt=None, **kwargs):
        return await self._col.count_documents(self._scope_filter(filt or {}), **kwargs)

    def aggregate(self, pipeline, **kwargs):
        fid = self._fid()
        new_pipeline = [{"$match": {"family_id": fid}}] + list(pipeline)
        return self._col.aggregate(new_pipeline, **kwargs)

    # -- write ops --
    async def insert_one(self, doc, **kwargs):
        return await self._col.insert_one(self._scope_doc(doc), **kwargs)

    async def insert_many(self, docs, **kwargs):
        return await self._col.insert_many([self._scope_doc(d) for d in docs], **kwargs)

    async def update_one(self, filt, update, **kwargs):
        return await self._col.update_one(self._scope_filter(filt), update, **kwargs)

    async def update_many(self, filt, update, **kwargs):
        return await self._col.update_many(self._scope_filter(filt), update, **kwargs)

    async def delete_one(self, filt, **kwargs):
        return await self._col.delete_one(self._scope_filter(filt), **kwargs)

    async def delete_many(self, filt, **kwargs):
        return await self._col.delete_many(self._scope_filter(filt), **kwargs)

    async def find_one_and_update(self, filt, update, **kwargs):
        return await self._col.find_one_and_update(
            self._scope_filter(filt), update, **kwargs
        )

    # Index management isn't scoped — admins create indexes globally.
    async def create_index(self, *args, **kwargs):
        return await self._col.create_index(*args, **kwargs)


class ScopedDB:
    """Proxy database: returns ScopedCollection for known data collections,
    and the raw Motor collection for everything else."""

    def __init__(self, db):
        self._db = db
        self._cache: dict = {}

    def __getattr__(self, name):
        # Underscore attrs (e.g. _db, _cache) come from __dict__ — handled by Python.
        if name in SCOPED_COLLECTIONS:
            cached = self._cache.get(name)
            if cached is None:
                cached = ScopedCollection(self._db[name])
                self._cache[name] = cached
            return cached
        return getattr(self._db, name)

    def __getitem__(self, name):
        return self.__getattr__(name)


def install_middleware(app, jwt_secret: str):
    """Attach a FastAPI middleware that decodes the bearer token (if any) and
    sets `current_family_id` for the duration of the request."""

    @app.middleware("http")
    async def family_scope_middleware(request: Request, call_next):
        fid = None
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            try:
                data = jwt.decode(
                    auth.split(" ", 1)[1].strip(),
                    jwt_secret,
                    algorithms=["HS256"],
                )
                # Only family-bound tokens set a scope. Admin tokens stay None.
                if data.get("type") in {"account", "member"} and data.get("role") != "admin":
                    fid = data.get("fid")
            except jwt.PyJWTError:
                pass
        token = current_family_id.set(fid)
        try:
            response = await call_next(request)
            return response
        finally:
            current_family_id.reset(token)


# ---------- helpers used by location ingest ----------

async def resolve_family_by_code(db, family_code: str):
    """Look up a family doc by its per-family `family_code`. Returns None if
    no match. We always use the families collection — never an env var.
    """
    if not family_code:
        return None
    return await db.families.find_one(
        {"family_code": family_code, "status": "active"},
        {"_id": 0},
    )
