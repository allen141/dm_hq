import json
import unittest
from urllib.parse import urlparse
from urllib.request import Request

from dmhq.client import SessionClient
from dmhq.cli import render_campaigns


class FakeResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return self.payload


class FakeOpener:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.requests = []

    def open(self, request: Request, timeout=30):
        self.requests.append(request)
        return FakeResponse(next(self.responses))


class SessionClientTests(unittest.TestCase):
    def test_login_and_token_creation_use_csrf_and_do_not_retain_password(self):
        opener = FakeOpener(
            [
                {"csrfToken": "csrf-1"},
                {"id": 1, "username": "dm"},
                {"csrfToken": "csrf-2"},
                {"id": "token-id", "name": "Codex", "token": "dmhq_secret"},
            ]
        )
        client = SessionClient("https://preview.example", opener=opener)
        client.login("dm", "not-saved")
        result = client.create_agent_token("Codex")

        self.assertEqual(result["token"], "dmhq_secret")
        self.assertFalse(hasattr(client, "password"))
        self.assertEqual([urlparse(request.full_url).path for request in opener.requests], [
            "/api/v1/auth/csrf",
            "/api/v1/auth/login",
            "/api/v1/auth/csrf",
            "/api/v1/auth/agent-tokens",
        ])
        login_payload = json.loads(opener.requests[1].data.decode("utf-8"))
        self.assertEqual(login_payload, {"username": "dm", "password": "not-saved"})
        self.assertEqual(opener.requests[1].get_header("X-csrftoken"), "csrf-1")
        self.assertEqual(opener.requests[3].get_header("X-csrftoken"), "csrf-2")

    def test_campaigns_render_with_copyable_id_and_json_remains_available(self):
        rendered = render_campaigns(
            [
                {
                    "id": "campaign-123",
                    "name": "Test Campaign",
                    "updated_at": "2026-08-04T12:00:00Z",
                }
            ]
        )
        self.assertIn("Campaigns (1)", rendered)
        self.assertIn("Test Campaign", rendered)
        self.assertIn("ID: campaign-123", rendered)
        self.assertIn("Updated: 2026-08-04", rendered)
        self.assertEqual(render_campaigns([]), "No campaigns found.")


if __name__ == "__main__":
    unittest.main()
