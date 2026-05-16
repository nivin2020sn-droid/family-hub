"""Backend tests for Wall Board endpoints + auth + users + events."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://family-timeplan.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Auth ----------
class TestAuth:
    def test_verify_ok(self, s):
        r = s.post(f"{API}/auth/verify", json={"code": "FAMILY2026"}, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

    def test_verify_wrong(self, s):
        r = s.post(f"{API}/auth/verify", json={"code": "WRONG"}, timeout=20)
        assert r.status_code == 401

    def test_verify_empty(self, s):
        r = s.post(f"{API}/auth/verify", json={"code": ""}, timeout=20)
        assert r.status_code == 401


# ---------- Users (existing) ----------
class TestUsers:
    def test_get_users(self, s):
        r = s.get(f"{API}/users", timeout=20)
        assert r.status_code == 200
        users = r.json()
        ids = {u["id"] for u in users}
        assert "wife" in ids and "husband" in ids
        # Wife first
        assert users[0]["id"] == "wife"


# ---------- Wall settings ----------
class TestWallSettings:
    def test_get_defaults(self, s):
        r = s.get(f"{API}/wall/settings", timeout=20)
        assert r.status_code == 200
        data = r.json()
        for k in ["hero_title", "hero_subtitle", "hero_photo", "message_title", "message_text"]:
            assert k in data

    def test_put_partial_and_persist(self, s):
        payload = {"hero_title": "TEST Title", "message_text": "TEST motd"}
        r = s.put(f"{API}/wall/settings", json=payload, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["hero_title"] == "TEST Title"
        assert d["message_text"] == "TEST motd"
        # GET again to check persistence
        r2 = s.get(f"{API}/wall/settings", timeout=20)
        d2 = r2.json()
        assert d2["hero_title"] == "TEST Title"
        assert d2["message_text"] == "TEST motd"
        # subtitle should still have a value (default or preserved)
        assert "hero_subtitle" in d2


# ---------- Generic CRUD helper ----------
def crud_flow(s, path, create_payload, update_payload, expected_create_fields, expected_after_update):
    # Create
    r = s.post(f"{API}/{path}", json=create_payload, timeout=20)
    assert r.status_code == 200, f"POST {path}: {r.status_code} {r.text}"
    item = r.json()
    item_id = item["id"]
    for k, v in expected_create_fields.items():
        assert item[k] == v, f"create field {k} expected {v} got {item.get(k)}"
    # List contains it
    rl = s.get(f"{API}/{path}", timeout=20)
    assert rl.status_code == 200
    assert any(x["id"] == item_id for x in rl.json())
    # Update
    ru = s.put(f"{API}/{path}/{item_id}", json=update_payload, timeout=20)
    assert ru.status_code == 200, ru.text
    updated = ru.json()
    for k, v in expected_after_update.items():
        assert updated[k] == v
    # GET-verify persistence
    rl2 = s.get(f"{API}/{path}", timeout=20)
    found = next((x for x in rl2.json() if x["id"] == item_id), None)
    assert found is not None
    for k, v in expected_after_update.items():
        assert found[k] == v
    # Delete
    rd = s.delete(f"{API}/{path}/{item_id}", timeout=20)
    assert rd.status_code == 200
    # 404 on delete again
    rd2 = s.delete(f"{API}/{path}/{item_id}", timeout=20)
    assert rd2.status_code == 404
    return item_id


class TestWallGoals:
    def test_crud(self, s):
        crud_flow(
            s, "wall/goals",
            {"label": "TEST goal"}, {"done": True},
            {"label": "TEST goal", "done": False},
            {"done": True},
        )

    def test_sorted_by_created_at(self, s):
        a = s.post(f"{API}/wall/goals", json={"label": "TEST a"}, timeout=20).json()
        b = s.post(f"{API}/wall/goals", json={"label": "TEST b"}, timeout=20).json()
        items = s.get(f"{API}/wall/goals", timeout=20).json()
        ids = [x["id"] for x in items]
        assert ids.index(a["id"]) < ids.index(b["id"])
        s.delete(f"{API}/wall/goals/{a['id']}")
        s.delete(f"{API}/wall/goals/{b['id']}")

    def test_404(self, s):
        assert s.put(f"{API}/wall/goals/nope-xyz", json={"done": True}, timeout=20).status_code == 404
        assert s.delete(f"{API}/wall/goals/nope-xyz", timeout=20).status_code == 404


class TestWallCountdown:
    def test_crud_and_sorted_by_date(self, s):
        a = s.post(f"{API}/wall/countdown", json={"label": "TEST later", "date": "2030-12-31"}, timeout=20).json()
        b = s.post(f"{API}/wall/countdown", json={"label": "TEST sooner", "date": "2028-01-01"}, timeout=20).json()
        items = s.get(f"{API}/wall/countdown", timeout=20).json()
        # sorted by date ascending → b before a
        ids = [x["id"] for x in items]
        assert ids.index(b["id"]) < ids.index(a["id"])
        # Update
        ru = s.put(f"{API}/wall/countdown/{a['id']}", json={"label": "TEST updated"}, timeout=20)
        assert ru.status_code == 200 and ru.json()["label"] == "TEST updated"
        # cleanup
        assert s.delete(f"{API}/wall/countdown/{a['id']}").status_code == 200
        assert s.delete(f"{API}/wall/countdown/{b['id']}").status_code == 200

    def test_404(self, s):
        assert s.put(f"{API}/wall/countdown/nope", json={"label": "x"}).status_code == 404
        assert s.delete(f"{API}/wall/countdown/nope").status_code == 404


class TestWallAchievements:
    def test_crud(self, s):
        crud_flow(
            s, "wall/achievements",
            {"name": "TEST Kid", "note": "Reading champ", "image": "data:image/png;base64,iVBORw0KGgo="},
            {"note": "Updated note"},
            {"name": "TEST Kid", "note": "Reading champ"},
            {"note": "Updated note"},
        )

    def test_404(self, s):
        assert s.put(f"{API}/wall/achievements/nope", json={"name": "x"}).status_code == 404
        assert s.delete(f"{API}/wall/achievements/nope").status_code == 404


class TestWallNotes:
    def test_crud(self, s):
        crud_flow(
            s, "wall/notes",
            {"text": "TEST note", "color": "#34D399"},
            {"text": "TEST note updated"},
            {"text": "TEST note", "color": "#34D399"},
            {"text": "TEST note updated"},
        )

    def test_404(self, s):
        assert s.put(f"{API}/wall/notes/nope", json={"text": "x"}).status_code == 404
        assert s.delete(f"{API}/wall/notes/nope").status_code == 404


class TestWallFamilyEvents:
    def test_crud_and_sorted(self, s):
        a = s.post(f"{API}/wall/family-events", json={"title": "TEST later", "date": "2030-06-01", "notes": "n"}, timeout=20).json()
        b = s.post(f"{API}/wall/family-events", json={"title": "TEST sooner", "date": "2028-06-01"}, timeout=20).json()
        items = s.get(f"{API}/wall/family-events", timeout=20).json()
        ids = [x["id"] for x in items]
        assert ids.index(b["id"]) < ids.index(a["id"])
        ru = s.put(f"{API}/wall/family-events/{a['id']}", json={"title": "TEST renamed"}, timeout=20)
        assert ru.status_code == 200 and ru.json()["title"] == "TEST renamed"
        assert s.delete(f"{API}/wall/family-events/{a['id']}").status_code == 200
        assert s.delete(f"{API}/wall/family-events/{b['id']}").status_code == 200

    def test_404(self, s):
        assert s.put(f"{API}/wall/family-events/nope", json={"title": "x"}).status_code == 404
        assert s.delete(f"{API}/wall/family-events/nope").status_code == 404


class TestWallPhotos:
    def test_create_list_delete(self, s):
        b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        r = s.post(f"{API}/wall/photos", json={"image": b64, "caption": "TEST"}, timeout=20)
        assert r.status_code == 200
        pid = r.json()["id"]
        assert r.json()["image"] == b64
        # list
        rl = s.get(f"{API}/wall/photos", timeout=20)
        assert any(x["id"] == pid for x in rl.json())
        # delete
        rd = s.delete(f"{API}/wall/photos/{pid}", timeout=20)
        assert rd.status_code == 200
        rd2 = s.delete(f"{API}/wall/photos/{pid}", timeout=20)
        assert rd2.status_code == 404


# ---------- Existing Events CRUD ----------
class TestEvents:
    def test_event_crud(self, s):
        payload = {
            "title": "TEST Event",
            "user_id": "wife",
            "color": "#F472B6",
            "date": "2030-05-10",
            "start_time": "09:00",
            "end_time": "10:00",
            "notes": "TEST",
        }
        r = s.post(f"{API}/events", json=payload, timeout=20)
        assert r.status_code == 200
        ev = r.json()
        eid = ev["id"]
        assert ev["title"] == "TEST Event"
        # List filter
        rl = s.get(f"{API}/events?user_id=wife&month=5&year=2030", timeout=20)
        assert rl.status_code == 200
        assert any(x["id"] == eid for x in rl.json())
        # Update
        ru = s.put(f"{API}/events/{eid}", json={"title": "TEST Renamed"}, timeout=20)
        assert ru.status_code == 200 and ru.json()["title"] == "TEST Renamed"
        # Delete
        assert s.delete(f"{API}/events/{eid}", timeout=20).status_code == 200
        assert s.delete(f"{API}/events/{eid}", timeout=20).status_code == 404
