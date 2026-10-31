"""Settings from environment variables. Every variable here is listed in .env.example."""
import os
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
STARTER_DATASET = REPO_ROOT / "starter_pack" / "data" / "cit_public.json"


def _load_dotenv() -> None:
    """Read a local .env (dev only). Real deployments set the variables in the host's settings."""
    path = REPO_ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


_load_dotenv()


@dataclass(frozen=True)
class Settings:
    database_url: str = os.environ.get("DATABASE_URL") or f"sqlite:///{REPO_ROOT / 'local.db'}"
    jwt_secret: str = os.environ.get("JWT_SECRET") or "dev-only-secret-set-JWT_SECRET-in-production"
    demo_password: str = os.environ.get("DEMO_PASSWORD") or "demo1234"
    gemini_api_key: str = os.environ.get("GEMINI_API_KEY", "")
    gemini_model: str = os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash"
    solver_time_limit_s: float = float(os.environ.get("SOLVER_TIME_LIMIT_S") or 60)
    solver_workers: int = int(os.environ.get("SOLVER_WORKERS") or 8)
    llm_timeout_s: float = float(os.environ.get("LLM_TIMEOUT_S") or 8)
    team_name: str = os.environ.get("TEAM_NAME") or "CIT Scheduler"


settings = Settings()
