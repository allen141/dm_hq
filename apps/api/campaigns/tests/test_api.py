import json

from django.contrib.auth.models import User
from django.test import Client, TestCase

from campaigns.models import Campaign, CampaignMembership


class CampaignApiTests(TestCase):
    def setUp(self) -> None:
        self.client = Client(enforce_csrf_checks=True)
        self.user = User.objects.create_user(username="dm", password="test-password")
        self.other = User.objects.create_user(username="other", password="test-password")

    def csrf(self) -> str:
        response = self.client.get("/api/v1/auth/csrf")
        self.assertEqual(response.status_code, 200)
        return response.cookies["csrftoken"].value

    def test_health_is_public(self) -> None:
        response = self.client.get("/api/v1/health/live")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_readiness_checks_the_database(self) -> None:
        response = self.client.get("/api/v1/health/ready")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_login_requires_csrf_and_creates_a_session(self) -> None:
        denied = self.client.post(
            "/api/v1/auth/login",
            data=json.dumps({"username": "dm", "password": "test-password"}),
            content_type="application/json",
        )
        self.assertEqual(denied.status_code, 403)
        token = self.csrf()
        response = self.client.post(
            "/api/v1/auth/login",
            data=json.dumps({"username": "dm", "password": "test-password"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 200)

    def test_campaigns_require_authentication(self) -> None:
        response = self.client.get("/api/v1/campaigns")
        self.assertEqual(response.status_code, 401)

    def test_campaign_creation_requires_csrf(self) -> None:
        self.assertTrue(self.client.login(username="dm", password="test-password"))
        response = self.client.post(
            "/api/v1/campaigns",
            data=json.dumps({"name": "Unprotected Campaign"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(Campaign.objects.filter(name="Unprotected Campaign").exists())

    def test_owner_can_create_and_list_campaign(self) -> None:
        self.assertTrue(self.client.login(username="dm", password="test-password"))
        token = self.csrf()
        create = self.client.post(
            "/api/v1/campaigns",
            data=json.dumps({"name": "  The Glass Coast  "}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(create.status_code, 200)
        self.assertEqual(create.json()["name"], "The Glass Coast")
        campaign_id = create.json()["id"]

        listed = self.client.get("/api/v1/campaigns")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([item["id"] for item in listed.json()], [campaign_id])

    def test_campaigns_are_isolated_by_membership(self) -> None:
        campaign = Campaign.objects.create(name="Private Coast", owner=self.user)
        CampaignMembership.objects.create(campaign=campaign, user=self.user)
        self.assertTrue(self.client.login(username="other", password="test-password"))
        response = self.client.get(f"/api/v1/campaigns/{campaign.id}")
        self.assertEqual(response.status_code, 404)

    def test_empty_campaign_name_is_rejected(self) -> None:
        self.assertTrue(self.client.login(username="dm", password="test-password"))
        token = self.csrf()
        response = self.client.post(
            "/api/v1/campaigns",
            data=json.dumps({"name": "   "}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 422)
