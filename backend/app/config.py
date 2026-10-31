"""Settings from environment variables. Every variable here is listed in .env.example."""
import os
import tempfile
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

DEV_SECRET = "dev-only-secret-set-JWT_SECRET-in-production"
MIN_SECRET_LEN = 32
# Neon's Vercel integration sets DATABASE_URL (POSTGRES_URL on older setups)
_DB_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or ""
# On Vercel only /tmp is writable, so without a database URL the app still starts, on a throwaway SQLite file
_SERVERLESS = bool(os.environ.get("VERCEL"))


def _default_db() -> str:
    folder = Path(tempfile.gettempdir()) if _SERVERLESS else REPO_ROOT
    return f"sqlite:///{folder / ('velora.db' if _SERVERLESS else 'local.db')}"


@dataclass(frozen=True)
class Settings:
    database_url: str = _DB_URL or _default_db()
    temporary_db: bool = _SERVERLESS and not _DB_URL
    jwt_secret: str = os.environ.get("JWT_SECRET") or DEV_SECRET
    demo_password: str = os.environ.get("DEMO_PASSWORD") or "demo1234"
    gemini_api_key: str = os.environ.get("GEMINI_API_KEY", "")
    gemini_model: str = os.environ.get("GEMINI_MODEL") or "gemini-3.5-flash-lite"
    solver_time_limit_s: float = float(os.environ.get("SOLVER_TIME_LIMIT_S") or 60)
    solver_workers: int = int(os.environ.get("SOLVER_WORKERS") or 8)
    llm_timeout_s: float = float(os.environ.get("LLM_TIMEOUT_S") or 8)
    team_name: str = os.environ.get("TEAM_NAME") or "Velora"


def require_production_secrets(s: Settings, env=os.environ) -> None:
    """A deployed app must not sign login tokens with the fallback secret, which is in this public repo:
    anyone could forge an Admin token. Local SQLite runs may use it."""
    deployed = bool(env.get("VERCEL")) or not s.database_url.startswith("sqlite")
    if deployed and (s.jwt_secret == DEV_SECRET or len(s.jwt_secret) < MIN_SECRET_LEN):
        raise RuntimeError(f"Set JWT_SECRET to a random string of at least {MIN_SECRET_LEN} characters "
                           "in the host's environment variables before deploying")


settings = Settings()
require_production_secrets(settings)
