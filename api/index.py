# Vercel Python function entry point: every /api/* request is routed here (see vercel.json).
from backend.app.main import app  # noqa: F401
