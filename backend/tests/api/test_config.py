import pytest

from backend.app.config import DEV_SECRET, Settings, require_production_secrets


def _settings(**kw):
    return Settings(**{"database_url": "sqlite:///local.db", "jwt_secret": DEV_SECRET, **kw})


def test_local_sqlite_may_use_the_dev_secret():
    require_production_secrets(_settings(), env={})


@pytest.mark.parametrize("settings, env", [
    (_settings(database_url="postgresql://u:p@neon.example/db"), {}),       # real database
    (_settings(), {"VERCEL": "1"}),                                         # running on Vercel
    (_settings(database_url="postgresql://x", jwt_secret="short"), {}),     # too short to be safe
])
def test_deployed_app_refuses_a_weak_or_public_secret(settings, env):
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        require_production_secrets(settings, env=env)


def test_deployed_app_accepts_a_real_secret():
    require_production_secrets(_settings(database_url="postgresql://x", jwt_secret="k" * 40), env={"VERCEL": "1"})
