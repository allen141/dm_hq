import io
import json
import zipfile

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase

from campaigns.models import (
    ArchiveItem,
    Campaign,
    CampaignMembership,
    EntityDetail,
    ItemRevision,
    Publication,
    SessionDetail,
)


class ArchiveApiTests(TestCase):
    def setUp(self) -> None:
        self.client = Client(enforce_csrf_checks=True)
        self.user = User.objects.create_user(username="dm", password="test-password")
        self.other = User.objects.create_user(username="other", password="test-password")
        self.campaign = Campaign.objects.create(name="Glass Coast", owner=self.user)
        CampaignMembership.objects.create(campaign=self.campaign, user=self.user)
        self.assertTrue(self.client.login(username="dm", password="test-password"))
        self.csrf_token = self.client.get("/api/v1/auth/csrf").cookies["csrftoken"].value

    def post(self, path: str, payload: dict):
        return self.client.post(
            path, data=json.dumps(payload), content_type="application/json", HTTP_X_CSRFTOKEN=self.csrf_token
        )

    def test_create_entity_uses_person_template_and_preserves_structure(self) -> None:
        templates = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/templates")
        self.assertEqual(templates.status_code, 200)
        template = next(template for template in templates.json()["templates"] if template["name"] == "Person / NPC")
        response = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/items",
            {
                "kind": "entity",
                "title": "Mara Venn",
                "body": "A **quiet** ferrymaster.",
                "subject_type": "person",
                "template_id": template["id"],
                "fields": {"species": "Human", "armor_class": 13},
                "aliases": ["Mara", "The Ferrymaster"],
                "tags": ["harbor"],
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["entity"]["fields"]["species"], "Human")
        self.assertEqual(response.json()["entity"]["template_fields"][0]["label"], "Species")
        self.assertEqual(response.json()["aliases"], ["Mara", "The Ferrymaster"])
        self.assertEqual(EntityDetail.objects.count(), 1)
        self.assertEqual(ItemRevision.objects.count(), 1)

    def test_person_entities_default_to_the_starter_template(self) -> None:
        response = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/items",
            {"kind": "entity", "title": "Unstructured NPC", "subject_type": "person"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["entity"]["template_fields"][0]["key"], "species")

    def test_session_uses_structured_template_fields_and_keeps_markdown_extension(self) -> None:
        templates = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/templates").json()["templates"]
        template = next(template for template in templates if template["name"] == "Session")
        response = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/items",
            {
                "kind": "session",
                "title": "Session One",
                "body": "## Optional extension",
                "template_id": template["id"],
                "fields": {
                    "scheduled_for": "2026-08-02",
                    "session_status": "planned",
                    "outcome_text": "Open questions",
                },
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["session"]["fields"]["outcome_text"], "Open questions")
        self.assertEqual(response.json()["session"]["template_fields"][0]["label"], "Scheduled date")
        self.assertEqual(response.json()["body"], "## Optional extension")
        self.assertEqual(SessionDetail.objects.count(), 1)
        updated = self.client.patch(
            f"/api/v1/items/{response.json()['id']}",
            data=json.dumps(
                {
                    "version": 1,
                    "fields": {
                        "scheduled_for": "2026-08-02",
                        "session_status": "completed",
                        "outcome_text": "Reconciled",
                    },
                }
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["session"]["session_status"], "completed")

    def test_search_relationship_and_backlink_are_campaign_scoped(self) -> None:
        place = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/items",
            {"kind": "entity", "title": "Saltmere", "subject_type": "place"},
        ).json()
        person = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/items",
            {"kind": "entity", "title": "Mara", "body": "Keeps the salt road."},
        ).json()
        relation = self.post(
            f"/api/v1/items/{person['id']}/relationships",
            {"target_id": place["id"], "kind": "works_at", "reciprocal_label": "employs"},
        )
        self.assertEqual(relation.status_code, 200)
        search = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/search?q=salt")
        self.assertEqual(search.status_code, 200)
        self.assertEqual([item["title"] for item in search.json()["items"]], ["Saltmere", "Mara"])
        detail = self.client.get(f"/api/v1/items/{place['id']}")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["incoming_relationships"][0]["source_id"], person["id"])

    def test_stale_update_and_restore_create_recoverable_revisions(self) -> None:
        item = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/items", {"kind": "note", "title": "Rumor", "body": "First"}
        ).json()
        updated = self.client.patch(
            f"/api/v1/items/{item['id']}",
            data=json.dumps({"version": 1, "body": "Second"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(updated.status_code, 200)
        stale = self.client.patch(
            f"/api/v1/items/{item['id']}",
            data=json.dumps({"version": 1, "body": "Overwrite"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(stale.status_code, 409)
        restored = self.post(f"/api/v1/items/{item['id']}/restore", {"version": 2, "revision": 1})
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(restored.json()["body"], "First")
        self.assertEqual(ItemRevision.objects.filter(item_id=item["id"]).count(), 3)

    def test_publication_is_snapshot_and_revocable(self) -> None:
        private = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/items",
            {"kind": "entity", "title": "Secret NPC", "body": "Private clue"},
        ).json()
        publication = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/publications",
            {"entries": [{"item_id": private["id"], "title": "The Stranger", "body": "A traveler."}]},
        )
        self.assertEqual(publication.status_code, 200)
        token = publication.json()["token"]
        self.assertEqual(publication.json()["url"], f"/p/{token}")
        handouts = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/publications")
        self.assertEqual(handouts.status_code, 200)
        self.assertEqual(handouts.json()["publications"][0]["url"], f"/p/{token}")
        self.assertIn(private["id"], handouts.json()["publications"][0]["item_ids"])
        public = self.client.get(f"/api/v1/publications/public/{token}")
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.json()["entries"][0]["title"], "The Stranger")
        self.assertNotIn("Private clue", public.content.decode())
        revoke = self.client.post(
            f"/api/v1/publications/{publication.json()['id']}/revoke", HTTP_X_CSRFTOKEN=self.csrf_token
        )
        self.assertEqual(revoke.status_code, 200)
        self.assertEqual(self.client.get(f"/api/v1/publications/public/{token}").json()["status"], "not_found")

    def test_export_and_restore_create_new_campaign_without_tokens(self) -> None:
        template = next(
            template
            for template in self.client.get(f"/api/v1/campaigns/{self.campaign.id}/templates").json()["templates"]
            if template["name"] == "Person / NPC"
        )
        entity = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/items",
            {"kind": "entity", "title": "Exported NPC", "template_id": template["id"], "fields": {"species": "Human"}},
        ).json()
        self.post(
            f"/api/v1/campaigns/{self.campaign.id}/items",
            {"kind": "note", "title": "Exported note", "body": "Portable prose"},
        )
        self.post(
            f"/api/v1/campaigns/{self.campaign.id}/publications",
            {"entries": [{"item_id": entity["id"], "title": "Safe NPC", "body": "Public prose"}]},
        )
        export = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/exports")
        self.assertEqual(export.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(export.content)) as archive:
            self.assertIn("manifest.json", archive.namelist())
            self.assertIn("campaign.json", archive.namelist())
            self.assertNotIn("token", archive.read("campaign.json").decode())
        upload = SimpleUploadedFile("archive.zip", export.content, content_type="application/zip")
        restored = self.client.post("/api/v1/exports/restore", {"archive": upload}, HTTP_X_CSRFTOKEN=self.csrf_token)
        self.assertEqual(restored.status_code, 200)
        self.assertTrue(Campaign.objects.filter(name="Glass Coast (restored)").exists())
        restored_campaign_id = restored.json()["id"]
        self.assertTrue(ArchiveItem.objects.filter(campaign_id=restored_campaign_id, title="Exported note").exists())
        restored_entity = ArchiveItem.objects.get(campaign_id=restored_campaign_id, title="Exported NPC")
        self.assertIsNotNone(restored_entity.entity_detail.template_version_id)
        self.assertTrue(Publication.objects.filter(campaign_id=restored_campaign_id, status="revoked").exists())
