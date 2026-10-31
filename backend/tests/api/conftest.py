"""API tests run the real app on a throwaway SQLite file, with no LLM key (the assistant uses its
keyword fallback unless a test swaps in a fake model)."""
import importlib.util
import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
_tmp = tempfile.mkdtemp(prefix="cit-api-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp) / 'test.db'}"
os.environ["GEMINI_API_KEY"] = ""
os.environ.setdefault("SOLVER_TIME_LIMIT_S", "20")
os.environ["DEMO_PASSWORD"] = "test-pass"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app.main import app  # noqa: E402

PW = "test-pass"
SAMPLE = ROOT / "starter_pack" / "examples" / "sample_disruption.json"


def load_validator():
    spec = importlib.util.spec_from_file_location("validator", ROOT / "starter_pack" / "validator.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def token(c, email: str) -> dict:
    r = c.post("/api/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def heads(client):
    return {k: token(client, f"{k}@cit.demo") for k in ("admin", "faculty", "club")} | {
        "cse": token(client, "cse.coord@cit.demo"), "ece": token(client, "ece.coord@cit.demo")}


def fresh(client, heads, exams: bool = False) -> dict:
    """Reset the demo data and generate a timetable (and exams)."""
    assert client.post("/api/admin/reset", headers=heads["admin"]).status_code == 200
    r = client.post("/api/timetable/generate", json={"time_limit_s": 15}, headers=heads["admin"])
    assert r.status_code == 200, r.text
    if exams:
        e = client.post("/api/exams/generate", json={"time_limit_s": 15}, headers=heads["admin"])
        assert e.status_code == 200, e.text
    return r.json()
