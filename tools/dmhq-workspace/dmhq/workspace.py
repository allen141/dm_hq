from __future__ import annotations

import hashlib
import json
import os
import re
try:
    import tomllib
except ImportError:  # pragma: no cover - Python 3.10 fallback
    class _TomlCompat:
        @staticmethod
        def loads(value: str) -> dict:
            result = {}
            for line in value.splitlines():
                if "=" not in line:
                    continue
                key, raw = line.split("=", 1)
                result[key.strip()] = raw.strip().strip('"')
            return result
    tomllib = _TomlCompat()
from pathlib import Path

from .client import Client
from .index import SearchIndex
from .storage import default_workspace_root, sha256_file, token_for


class WorkspaceError(RuntimeError):
    pass


def _hash_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def safe_relative_path(storage_key: str) -> Path:
    path = Path(storage_key)
    if path.is_absolute() or ".." in path.parts:
        raise WorkspaceError(f"Unsafe storage key: {storage_key}")
    return path


class Workspace:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.meta = self.root / ".dmhq"
        self.config_file = self.meta / "config.toml"
        self.state_file = self.meta / "state.json"
        if not self.config_file.exists():
            raise WorkspaceError(f"Not a DM HQ workspace: {self.root}")
        self.config = tomllib.loads(self.config_file.read_text(encoding="utf-8"))
        self.state = self._read_state()

    @classmethod
    def init(cls, base_url: str, campaign_id: str, root: Path | None = None) -> "Workspace":
        root = (root or default_workspace_root() / campaign_id).expanduser().resolve()
        meta = root / ".dmhq"
        meta.mkdir(parents=True, exist_ok=True)
        (meta / "conflicts").mkdir(exist_ok=True)
        (root / "campaigns").mkdir(parents=True, exist_ok=True)
        (meta / "config.toml").write_text(
            f'base_url = "{base_url.rstrip("/")}"\ncampaign_id = "{campaign_id}"\n', encoding="utf-8"
        )
        (meta / "state.json").write_text(json.dumps({"cursor": 0, "snapshot_after": "", "documents": {}}, indent=2) + "\n", encoding="utf-8")
        return cls(root)

    def _read_state(self) -> dict:
        try:
            return json.loads(self.state_file.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return {"cursor": 0, "snapshot_after": "", "documents": {}}

    def _save_state(self) -> None:
        tmp = self.state_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.state, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, self.state_file)

    def client(self) -> Client:
        base_url, token = token_for(self.config["base_url"])
        return Client(base_url, token)

    def path_for(self, storage_key: str) -> Path:
        path = self.root / safe_relative_path(storage_key)
        if self.root not in path.resolve().parents and path.resolve() != self.root:
            raise WorkspaceError("Storage path escapes workspace")
        return path

    def write_file(self, record: dict) -> None:
        path = self.path_for(record["storage_key"])
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(f".{path.name}.tmp")
        tmp.write_text(record["markdown"], encoding="utf-8")
        os.replace(tmp, path)

    def index(self) -> SearchIndex:
        return SearchIndex(self.meta / "index.sqlite")

    def sync(self) -> dict:
        client = self.client()
        if not self.state.get("documents"):
            self._snapshot(client)
        pulled = self.pull(client)
        return {"root": str(self.root), "pulled": pulled, "cursor": self.state["cursor"]}

    def _snapshot(self, client: Client) -> None:
        after = ""
        snapshot_cursor = None
        records = []
        while True:
            page = client.snapshot(self.config["campaign_id"], after=after, cursor=snapshot_cursor)
            snapshot_cursor = page["manifest"]["cursor"] if snapshot_cursor is None else snapshot_cursor
            for record in page["files"]:
                self.write_file(record)
                self.state["documents"][record["document_id"]] = {
                    "storage_key": record["storage_key"], "version": record["version"], "hash": record["hash"]
                }
                records.append(record)
            manifest = page["manifest"]
            if not manifest.get("has_more"):
                break
            after = manifest.get("next_after") or ""
        self.state["cursor"] = snapshot_cursor or 0
        self.state["snapshot_after"] = ""
        with self.index() as index:
            index.rebuild(records)
        self._save_state()

    def pull(self, client: Client | None = None) -> int:
        client = client or self.client()
        total = 0
        while True:
            page = client.changes(self.config["campaign_id"], self.state.get("cursor", 0))
            for change in page.get("changes", []):
                self._apply_change(change)
                total += 1
            self.state["cursor"] = page.get("cursor", self.state.get("cursor", 0))
            self._save_state()
            if not page.get("has_more"):
                break
        return total

    def _apply_change(self, change: dict) -> None:
        document_id = change["document_id"]
        current = self.state["documents"].get(document_id)
        previous_key = change.get("previous_storage_key") or (current or {}).get("storage_key")
        previous_path = self.path_for(previous_key) if previous_key else None
        path = self.path_for(change["storage_key"])
        local_path = previous_path if change.get("operation") == "move" and previous_path else path
        local_hash = sha256_file(local_path) if local_path and local_path.exists() else None
        base_hash = current.get("hash") if current else None
        if change["operation"] == "delete":
            if local_hash and local_hash != base_hash:
                self._write_conflict(change, local_path.read_text(encoding="utf-8"), None, "delete")
                return
            path.unlink(missing_ok=True)
            if previous_path and previous_path != path:
                previous_path.unlink(missing_ok=True)
            self.state["documents"].pop(document_id, None)
            with self.index() as index:
                index.remove(document_id)
            return
        if local_hash and base_hash and local_hash != base_hash and change["hash"] != base_hash:
            self._write_conflict(change, local_path.read_text(encoding="utf-8"), change.get("markdown"), change["operation"])
            if change.get("operation") == "move" and path != local_path:
                self.write_file(change)
            self.state["documents"][document_id] = {"storage_key": change["storage_key"], "version": change["version"], "hash": change["hash"]}
            return
        if local_hash and base_hash and local_hash != base_hash and change["hash"] == base_hash:
            return
        self.write_file(change)
        if previous_path and previous_path != path:
            previous_path.unlink(missing_ok=True)
        self.state["documents"][document_id] = {"storage_key": change["storage_key"], "version": change["version"], "hash": change["hash"]}
        with self.index() as index:
            index.upsert(document_id, change["storage_key"], change["version"], change["hash"], change["markdown"])

    def _write_conflict(self, change: dict, local_markdown: str, server_markdown: str | None, operation: str) -> None:
        target = self.meta / "conflicts" / change["document_id"]
        target.mkdir(parents=True, exist_ok=True)
        (target / "local.md").write_text(local_markdown, encoding="utf-8")
        if server_markdown is not None:
            (target / "server.md").write_text(server_markdown, encoding="utf-8")
        metadata = {
            "operation": operation,
            "document_id": change["document_id"],
            "previous_storage_key": change.get("previous_storage_key"),
            "storage_key": change["storage_key"],
            "version": change.get("version"),
            "hash": change.get("hash"),
            "base_version": self.state.get("documents", {}).get(change["document_id"], {}).get("version"),
            "base_hash": self.state.get("documents", {}).get(change["document_id"], {}).get("hash"),
        }
        (target / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    def changed_documents(self, path: str | None = None) -> list[tuple[str, dict, Path]]:
        result = []
        for document_id, record in self.state["documents"].items():
            file_path = self.path_for(record["storage_key"])
            if path and str(file_path) != str(Path(path).resolve()):
                continue
            if file_path.exists() and sha256_file(file_path) != record["hash"]:
                result.append((document_id, record, file_path))
        return result

    def push(self, client: Client | None = None, path: str | None = None) -> dict:
        validation_errors = self.validate(path)
        if validation_errors:
            raise WorkspaceError("Validation failed: " + "; ".join(validation_errors))
        client = client or self.client()
        applied = 0
        conflicts = 0
        for document_id, record, file_path in self.changed_documents(path):
            markdown = file_path.read_text(encoding="utf-8")
            try:
                result = client.apply(self.config["campaign_id"], {"document_id": document_id, "version": record["version"], "hash": record["hash"], "markdown": markdown, "reason": "Local workspace update"})
            except Exception as exc:
                if getattr(exc, "status", None) != 409:
                    raise
                current = client.document(self.config["campaign_id"], document_id)
                self._write_conflict({**current, "operation": "update"}, markdown, current["markdown"], "push")
                conflicts += 1
                continue
            old_path = file_path
            self.write_file(result)
            new_path = self.path_for(result["storage_key"])
            if old_path != new_path:
                old_path.unlink(missing_ok=True)
            self.state["documents"][document_id] = {"storage_key": result["storage_key"], "version": result["version"], "hash": result["hash"]}
            with self.index() as index:
                index.upsert(document_id, result["storage_key"], result["version"], result["hash"], result["markdown"])
            applied += 1
        self._save_state()
        return {"applied": applied, "conflicts": conflicts}

    def validate(self, path: str | None = None) -> list[str]:
        errors = []
        records = self.state["documents"].items()
        for document_id, record in records:
            file_path = self.path_for(record["storage_key"])
            if path and str(file_path) != str(Path(path).resolve()):
                continue
            if not file_path.exists():
                errors.append(f"{file_path}: missing local file")
                continue
            text = file_path.read_text(encoding="utf-8")
            if not text.startswith("---\n") or "\n---\n" not in text[4:]:
                errors.append(f"{file_path}: missing frontmatter delimiters")
            if not text.strip():
                errors.append(f"{file_path}: empty document")
            if not document_id or not record.get("version"):
                errors.append(f"{file_path}: missing sync metadata")
            if text.startswith("---\n") and "\n---\n" in text[4:]:
                raw = text[4 : text.find("\n---\n", 4)]
                # Keep the CLI dependency-free: identity checks only need the
                # scalar YAML keys, while the server performs full validation.
                id_match = re.search(r"(?m)^id:\s*[\"']?([^\"'\n#]+)", raw)
                campaign_match = re.search(r"(?m)^campaign_id:\s*[\"']?([^\"'\n#]+)", raw)
                frontmatter_id = id_match.group(1).strip() if id_match else None
                frontmatter_campaign = campaign_match.group(1).strip() if campaign_match else None
                if frontmatter_id and frontmatter_id != document_id:
                    errors.append(f"{file_path}: frontmatter id does not match document id")
                if frontmatter_campaign and frontmatter_campaign != self.config["campaign_id"]:
                    errors.append(f"{file_path}: frontmatter campaign_id does not match workspace")
        return errors

    def create_item(self, client, kind: str, markdown: str) -> dict:
        result = client.create_item(self.config["campaign_id"], kind, markdown)
        document_id = str(result["id"])
        storage_key = result.get("storage_key")
        if not storage_key:
            raise WorkspaceError("DM HQ did not return the canonical storage path for the new document")
        record = {
            "document_id": document_id,
            "storage_key": storage_key,
            "version": result["version"],
            "hash": _hash_text(result["markdown"]),
            "markdown": result["markdown"],
        }
        self.write_file(record)
        self.state["documents"][document_id] = {"storage_key": storage_key, "version": result["version"], "hash": record["hash"]}
        with self.index() as index:
            index.upsert(document_id, storage_key, result["version"], record["hash"], result["markdown"])
        self._save_state()
        return {"document_id": document_id, "storage_key": storage_key, "version": result["version"], "hash": record["hash"]}

    def status(self) -> dict:
        dirty = len(self.changed_documents())
        return {"root": str(self.root), "campaign_id": self.config["campaign_id"], "cursor": self.state.get("cursor", 0), "documents": len(self.state.get("documents", {})), "dirty": dirty, "conflicts": len(list((self.meta / "conflicts").glob("*/metadata.json")))}
