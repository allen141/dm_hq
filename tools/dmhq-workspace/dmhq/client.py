from __future__ import annotations

import json
from dataclasses import dataclass
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen


class ApiError(RuntimeError):
    def __init__(self, status: int, message: str, body: object = None):
        super().__init__(message)
        self.status = status
        self.body = body


class SessionClient:
    """Small session client used only to exchange login credentials for a token."""

    def __init__(self, base_url: str, opener=None):
        self.base_url = base_url.rstrip("/")
        self.opener = opener or build_opener(HTTPCookieProcessor(CookieJar()))
        self.csrf_token = ""

    def request(self, method: str, path: str, payload: dict | None = None, csrf: bool = False) -> dict:
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Accept": "application/json", "Referer": self.base_url + "/"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if csrf:
            headers["X-CSRFToken"] = self.csrf_token
        request = Request(f"{self.base_url}/api/v1{path}", data=body, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=30) as response:
                raw = response.read()
        except HTTPError as exc:
            raw = exc.read()
            try:
                detail = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                detail = raw.decode("utf-8", errors="replace")
            message = detail.get("detail", "API request failed") if isinstance(detail, dict) else str(detail)
            raise ApiError(exc.code, message, detail) from exc
        except URLError as exc:
            raise ApiError(0, f"Could not reach DM HQ: {exc.reason}") from exc
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def csrf(self) -> str:
        response = self.request("GET", "/auth/csrf")
        self.csrf_token = response.get("csrfToken", "")
        if not self.csrf_token:
            raise ApiError(0, "DM HQ did not return a CSRF token")
        return self.csrf_token

    def login(self, username: str, password: str) -> dict:
        self.csrf()
        return self.request(
            "POST",
            "/auth/login",
            {"username": username, "password": password},
            csrf=True,
        )

    def create_agent_token(self, name: str) -> dict:
        # Fetch a fresh CSRF token after login because Django may rotate it.
        self.csrf()
        return self.request("POST", "/auth/agent-tokens", {"name": name}, csrf=True)


@dataclass
class Client:
    base_url: str
    token: str

    def __post_init__(self) -> None:
        self.base_url = self.base_url.rstrip("/")

    def request(self, method: str, path: str, payload: dict | None = None, params: dict | None = None) -> dict:
        query = f"?{urlencode(params)}" if params else ""
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Accept": "application/json", "Authorization": f"Bearer {self.token}"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = Request(f"{self.base_url}/api/v1{path}{query}", data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=30) as response:
                raw = response.read()
        except HTTPError as exc:
            raw = exc.read()
            try:
                detail = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                detail = raw.decode("utf-8", errors="replace")
            message = detail.get("detail", "API request failed") if isinstance(detail, dict) else str(detail)
            raise ApiError(exc.code, message, detail) from exc
        except URLError as exc:
            raise ApiError(0, f"Could not reach DM HQ: {exc.reason}") from exc
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def campaigns(self) -> list[dict]:
        return self.request("GET", "/campaigns")

    def token_list(self) -> list[dict]:
        return self.request("GET", "/auth/agent-tokens")

    def token_revoke(self, token_id: str) -> dict:
        return self.request("POST", f"/auth/agent-tokens/{token_id}/revoke", {})

    def snapshot(self, campaign_id: str, after: str = "", limit: int = 100, cursor: int | None = None) -> dict:
        params = {"after": after, "limit": limit}
        if cursor is not None:
            params["cursor"] = cursor
        return self.request("GET", f"/campaigns/{campaign_id}/workspace/snapshot", params=params)

    def changes(self, campaign_id: str, after: int, limit: int = 100) -> dict:
        return self.request("GET", f"/campaigns/{campaign_id}/workspace/changes", params={"after": after, "limit": limit})

    def document(self, campaign_id: str, document_id: str) -> dict:
        return self.request("GET", f"/campaigns/{campaign_id}/workspace/documents/{document_id}")

    def apply(self, campaign_id: str, payload: dict) -> dict:
        return self.request("POST", f"/campaigns/{campaign_id}/workspace/apply", payload)

    def create_item(self, campaign_id: str, kind: str, markdown: str) -> dict:
        return self.request("POST", f"/campaigns/{campaign_id}/items", {"kind": kind, "markdown": markdown})
