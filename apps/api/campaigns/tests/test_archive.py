import io
import json
import zipfile
import uuid
from pathlib import Path

from django.contrib.auth.models import User
from django.test import Client, TestCase, override_settings

from campaigns.models import ArchiveItem, Campaign, CampaignDocumentVersion, CampaignMembership


def markdown(campaign_id, item_id, kind="note", title="Rumor", body="First", **extra):
    metadata = {"document_type": "archive_item", "id": str(item_id), "campaign_id": str(campaign_id), "kind": kind, "title": title, "status": "draft", "aliases": [], "tags": [], "references": [], "relationships": [], **extra}
    return f"---\n{json.dumps(metadata, indent=2)}\n---\n\n{body}\n"


@override_settings(DM_HQ_DOCUMENT_ROOT=Path("/tmp/dm-hq-test-documents"))
class ArchiveApiTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.user = User.objects.create_user(username="dm", password="test-password")
        self.other = User.objects.create_user(username="other", password="test-password")
        self.campaign = Campaign.objects.create(name="Glass Coast", owner=self.user)
        CampaignMembership.objects.create(campaign=self.campaign, user=self.user)
        self.assertTrue(self.client.login(username="dm", password="test-password"))
        self.csrf_token = self.client.get("/api/v1/auth/csrf").cookies["csrftoken"].value

    def post(self, path, payload):
        return self.client.post(path, data=json.dumps(payload), content_type="application/json", HTTP_X_CSRFTOKEN=self.csrf_token)

    def create_item(self, kind="note", title="Rumor", body="First", **extra):
        return self.post(f"/api/v1/campaigns/{self.campaign.id}/items", {"kind": kind, "markdown": markdown(self.campaign.id, uuid.uuid4(), kind, title, body, **extra)}).json()

    def test_full_markdown_create_projects_and_materializes_file(self):
        item = self.create_item(kind="entity", title="Mara Venn", body="A **quiet** ferrymaster.", subject_type="person", fields={"species": "Human"}, aliases=["The Ferrymaster"], tags=["harbor"])
        self.assertEqual(item["metadata"]["fields"]["species"], "Human")
        self.assertEqual(item["aliases"], ["The Ferrymaster"])
        self.assertIn("A **quiet**", item["markdown"])
        self.assertTrue(Path("/tmp/dm-hq-test-documents") .joinpath(f"campaigns/{self.campaign.id}/items/{item['id']}.md").exists())
        self.assertEqual(CampaignDocumentVersion.objects.filter(document__archive_item__id=item["id"]).count(), 1)

    def test_invalid_frontmatter_and_stale_full_document_write(self):
        bad = self.post(f"/api/v1/campaigns/{self.campaign.id}/items", {"kind": "note", "markdown": "# no frontmatter"})
        self.assertEqual(bad.status_code, 422)
        item = self.create_item()
        replacement = markdown(self.campaign.id, item["id"], title="Updated", body="Second")
        updated = self.client.patch(f"/api/v1/items/{item['id']}", data=json.dumps({"version": 1, "markdown": replacement}), content_type="application/json", HTTP_X_CSRFTOKEN=self.csrf_token)
        self.assertEqual(updated.status_code, 200); self.assertEqual(updated.json()["version"], 2)
        stale = self.client.patch(f"/api/v1/items/{item['id']}", data=json.dumps({"version": 1, "markdown": markdown(self.campaign.id, item["id"], title="Overwrite")}), content_type="application/json", HTTP_X_CSRFTOKEN=self.csrf_token)
        self.assertEqual(stale.status_code, 409)
        revisions = self.client.get(f"/api/v1/items/{item['id']}/revisions").json()["revisions"]
        self.assertEqual([revision["number"] for revision in revisions], [2, 1])

    def test_relationship_search_and_workspace_are_markdown_backed(self):
        place = self.create_item(kind="entity", title="Saltmere", body="Salt road")
        person = self.create_item(kind="entity", title="Mara", body="Keeps the salt road")
        relation = self.post(f"/api/v1/items/{person['id']}/relationships", {"target_id": place["id"], "kind": "works_at", "notes": "Harbor records"})
        self.assertEqual(relation.status_code, 200)
        detail = self.client.get(f"/api/v1/items/{person['id']}").json()
        self.assertEqual(detail["metadata"]["relationships"][0]["kind"], "works_at")
        self.assertIn("Saltmere", [item["title"] for item in self.client.get(f"/api/v1/campaigns/{self.campaign.id}/search?q=Salt").json()["items"]])
        snapshot = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/workspace/snapshot").json()
        file = next(file for file in snapshot["files"] if file["document_id"] == str(detail["metadata"]["id"]) or file["storage_key"].endswith(f"{person['id']}.md"))
        changed = markdown(self.campaign.id, person["id"], "entity", "Mara Updated", "New local prose")
        applied = self.post(f"/api/v1/campaigns/{self.campaign.id}/workspace/apply", {"document_id": file["document_id"], "version": file["version"], "markdown": changed})
        self.assertEqual(applied.status_code, 200)
        conflict = self.post(f"/api/v1/campaigns/{self.campaign.id}/workspace/apply", {"document_id": file["document_id"], "version": file["version"], "markdown": changed})
        self.assertEqual(conflict.status_code, 409)

    def test_publication_and_markdown_archive_round_trip(self):
        item = self.create_item(kind="entity", title="Secret NPC", body="Private clue", fields={"species": "Human"})
        public_markdown = markdown(self.campaign.id, item["id"], "entity", "The Stranger", "A traveler.", fields={"species": "Human"})
        publication = self.post(f"/api/v1/campaigns/{self.campaign.id}/publications", {"entries": [{"item_id": item["id"], "markdown": public_markdown}]})
        self.assertEqual(publication.status_code, 200); token = publication.json()["token"]
        public = self.client.get(f"/api/v1/publications/public/{token}")
        self.assertEqual(public.status_code, 200); self.assertNotIn("Private clue", public.content.decode()); self.assertIn("A traveler", public.content.decode())
        export = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/exports")
        with zipfile.ZipFile(io.BytesIO(export.content)) as archive:
            self.assertIn("manifest.json", archive.namelist()); self.assertNotIn("campaign.json", archive.namelist()); self.assertTrue(any(name.endswith(".md") for name in archive.namelist())); self.assertNotIn("token", "".join(archive.namelist()))
        restored = self.client.post("/api/v1/exports/restore", {"archive": __import__("django").core.files.uploadedfile.SimpleUploadedFile("archive.zip", export.content, content_type="application/zip")}, HTTP_X_CSRFTOKEN=self.csrf_token)
        self.assertEqual(restored.status_code, 200); self.assertTrue(ArchiveItem.objects.filter(campaign_id=restored.json()["id"], title="Secret NPC").exists())
