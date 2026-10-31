# Vercel Python function entry point: every /api/* request is routed here (see vercel.json).
import sys
from pathlib import Path

# make `backend` importable whatever directory the function starts in
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.main import app  # noqa: E402,F401
