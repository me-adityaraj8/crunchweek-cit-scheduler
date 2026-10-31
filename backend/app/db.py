from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


def _url(raw: str) -> str:
    # Neon/Vercel hand out postgres:// or postgresql:// URLs; SQLAlchemy needs the psycopg 3 driver named
    for prefix in ("postgres://", "postgresql://"):
        if raw.startswith(prefix):
            return "postgresql+psycopg://" + raw[len(prefix):]
    return raw


def make_engine(url: str):
    url = _url(url)
    if url.startswith("sqlite"):
        eng = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(eng, "connect")
        def _fk_on(conn, _record):    # enforce foreign keys like Postgres does, so local runs catch the same errors
            conn.execute("PRAGMA foreign_keys=ON")

        return eng
    # prepare_threshold=None: no server-side prepared statements, which break behind Neon's pooled
    # (PgBouncer) connection string
    return create_engine(url, pool_pre_ping=True, pool_size=2, max_overflow=2,
                         connect_args={"prepare_threshold": None})


engine = make_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
