from __future__ import annotations

import getpass
import hashlib
import json
import os
import secrets
from pathlib import Path
from platform import system


def user_data_root() -> Path:
    override = os.environ.get("DMHQ_DATA_ROOT")
    if override:
        return Path(override).expanduser()
    name = system()
    if name == "Windows":
        base = os.environ.get("LOCALAPPDATA") or Path.home() / "AppData/Local"
    elif name == "Darwin":
        base = Path.home() / "Library/Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share"))
    return Path(base) / "dm-hq"


def default_workspace_root() -> Path:
    return user_data_root() / "workspaces"


def config_path() -> Path:
    return user_data_root() / "config.json"


def _read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def _write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def _keyring():
    try:
        import keyring
    except ImportError:
        return None
    return keyring


def save_profile(base_url: str, token: str) -> None:
    root = user_data_root()
    root.mkdir(parents=True, exist_ok=True)
    profile = hashlib.sha256(base_url.rstrip("/").encode()).hexdigest()[:16]
    config = _read_json(config_path(), {"profiles": {}})
    config.setdefault("profiles", {})[profile] = {"base_url": base_url.rstrip("/"), "token_ref": profile}
    _write_json(config_path(), config)
    keyring = _keyring()
    if keyring:
        try:
            keyring.set_password("dm-hq", profile, token)
            return
        except Exception:
            pass
    credentials = root / "credentials.json"
    values = _read_json(credentials, {})
    values[profile] = token
    _write_json(credentials, values)


def profiles() -> dict:
    return _read_json(config_path(), {"profiles": {}}).get("profiles", {})


def token_for(base_url: str | None = None) -> tuple[str, str]:
    if os.environ.get("DMHQ_TOKEN"):
        url = base_url or os.environ.get("DMHQ_BASE_URL", "http://127.0.0.1:8000")
        return url.rstrip("/"), os.environ["DMHQ_TOKEN"]
    values = profiles()
    if not values:
        raise RuntimeError("No DM HQ profile configured. Run dmhq auth add --base-url <url>.")
    selected = next((p for p in values.values() if not base_url or p["base_url"] == base_url.rstrip("/")), None)
    if selected is None:
        raise RuntimeError("No configured DM HQ profile matches the requested base URL.")
    profile = next(key for key, value in values.items() if value is selected)
    keyring = _keyring()
    token = None
    if keyring:
        try:
            token = keyring.get_password("dm-hq", profile)
        except Exception:
            token = None
    if not token:
        token = _read_json(user_data_root() / "credentials.json", {}).get(profile)
    if not token:
        raise RuntimeError(f"No token stored for {selected['base_url']}.")
    return selected["base_url"], token


def prompt_token() -> str:
    token = getpass.getpass("DM HQ personal token: ").strip()
    if not token:
        raise RuntimeError("A token is required.")
    return token


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def new_id() -> str:
    return secrets.token_hex(16)
