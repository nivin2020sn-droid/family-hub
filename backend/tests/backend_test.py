"""Backend API tests for My Family My Life app."""
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

# Load frontend .env to read REACT_APP_BACKEND_URL
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Users ----------
class TestUsers:
    def test_get_users_seeded(self, http):
        r = http.get(f"{API}/users", timeout=15)
        assert r.status_code == 200
        users = r.json()
        ids = {u["id"]: u for u in users}
        assert "wife" in ids and "husband" in ids
        assert ids["wife"]["color"] == "#F472B6"
        assert ids["husband"]["color"] == "#60A5FA"
        assert ids["wife"]["role"] == "wife"
        assert ids["husband"]["role"] == "husband"


# ---------- Event Types CRUD ----------
class TestEventTypes:
    created_id = None

    def test_create_event_type(self, http):
        payload = {"name": f"TEST_Cat_{uuid.uuid4().hex[:6]}", "color": "#123456", "description": "test"}
        r = http.post(f"{API}/event-types", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == payload["name"]
        assert data["color"] == "#123456"
        assert data["description"] == "test"
        assert "id" in data
        TestEventTypes.created_id = data["id"]

    def test_list_event_types(self, http):
        r = http.get(f"{API}/event-types", timeout=15)
        assert r.status_code == 200
        items = r.json()
        ids = [i["id"] for i in items]
        assert TestEventTypes.created_id in ids

    def test_update_event_type(self, http):
        assert TestEventTypes.created_id
        r = http.put(
            f"{API}/event-types/{TestEventTypes.created_id}",
            json={"name": "TEST_Cat_Updated", "color": "#ABCDEF"},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "TEST_Cat_Updated"
        assert data["color"].lower() == "#abcdef"
        # GET verify persistence
        r2 = http.get(f"{API}/event-types", timeout=15)
        found = next((x for x in r2.json() if x["id"] == TestEventTypes.created_id), None)
        assert found and found["name"] == "TEST_Cat_Updated"

    def test_delete_event_type(self, http):
        assert TestEventTypes.created_id
        r = http.delete(f"{API}/event-types/{TestEventTypes.created_id}", timeout=15)
        assert r.status_code == 200
        # Verify gone
        r2 = http.get(f"{API}/event-types", timeout=15)
        ids = [x["id"] for x in r2.json()]
        assert TestEventTypes.created_id not in ids

    def test_update_404(self, http):
        r = http.put(f"{API}/event-types/nonexistent-id-xyz", json={"name": "x"}, timeout=15)
        assert r.status_code == 404

    def test_delete_404(self, http):
        r = http.delete(f"{API}/event-types/nonexistent-id-xyz", timeout=15)
        assert r.status_code == 404


# ---------- Events CRUD + filtering ----------
class TestEvents:
    created_ids = []

    def test_create_event_wife(self, http):
        payload = {
            "title": "TEST_Yoga",
            "user_id": "wife",
            "color": "#F472B6",
            "date": "2026-01-15",
            "start_time": "09:00",
            "end_time": "10:00",
            "notes": "morning",
        }
        r = http.post(f"{API}/events", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "TEST_Yoga"
        assert d["user_id"] == "wife"
        assert d["date"] == "2026-01-15"
        assert d["start_time"] == "09:00"
        assert "id" in d
        TestEvents.created_ids.append(d["id"])

    def test_create_event_husband(self, http):
        payload = {
            "title": "TEST_Work",
            "user_id": "husband",
            "color": "#60A5FA",
            "date": "2026-01-15",
            "start_time": "08:00",
            "end_time": "17:00",
        }
        r = http.post(f"{API}/events", json=payload, timeout=15)
        assert r.status_code == 200
        TestEvents.created_ids.append(r.json()["id"])

    def test_create_event_other_month(self, http):
        # Different month - should be excluded by filter
        payload = {
            "title": "TEST_Other",
            "user_id": "wife",
            "color": "#000000",
            "date": "2026-02-10",
        }
        r = http.post(f"{API}/events", json=payload, timeout=15)
        assert r.status_code == 200
        TestEvents.created_ids.append(r.json()["id"])

    def test_filter_by_year_month(self, http):
        r = http.get(f"{API}/events", params={"year": 2026, "month": 1}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        titles = [e["title"] for e in data]
        assert "TEST_Yoga" in titles
        assert "TEST_Work" in titles
        assert "TEST_Other" not in titles
        # All returned events should be in 2026-01
        for e in data:
            assert e["date"].startswith("2026-01")

    def test_filter_by_user(self, http):
        r = http.get(f"{API}/events", params={"user_id": "wife", "year": 2026, "month": 1}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        for e in data:
            assert e["user_id"] == "wife"
        assert any(e["title"] == "TEST_Yoga" for e in data)

    def test_update_event(self, http):
        eid = TestEvents.created_ids[0]
        r = http.put(f"{API}/events/{eid}", json={"title": "TEST_Yoga_Updated", "notes": "evening"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_Yoga_Updated"
        # GET verify
        r2 = http.get(f"{API}/events", params={"year": 2026, "month": 1}, timeout=15)
        found = next((x for x in r2.json() if x["id"] == eid), None)
        assert found and found["title"] == "TEST_Yoga_Updated"
        assert found["notes"] == "evening"

    def test_delete_event_and_verify(self, http):
        for eid in TestEvents.created_ids:
            r = http.delete(f"{API}/events/{eid}", timeout=15)
            assert r.status_code == 200
        # Verify removed
        r2 = http.get(f"{API}/events", params={"year": 2026, "month": 1}, timeout=15)
        ids_left = [e["id"] for e in r2.json()]
        for eid in TestEvents.created_ids:
            assert eid not in ids_left

    def test_update_404(self, http):
        r = http.put(f"{API}/events/nope-xyz", json={"title": "x"}, timeout=15)
        assert r.status_code == 404

    def test_delete_404(self, http):
        r = http.delete(f"{API}/events/nope-xyz", timeout=15)
        assert r.status_code == 404


# ---------- PWA static files ----------
class TestPWA:
    def test_manifest(self, http):
        r = http.get(f"{BASE_URL}/manifest.json", timeout=15)
        assert r.status_code == 200

    def test_service_worker(self, http):
        r = http.get(f"{BASE_URL}/service-worker.js", timeout=15)
        assert r.status_code == 200
