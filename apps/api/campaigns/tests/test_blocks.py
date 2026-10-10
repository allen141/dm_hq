import json
import tempfile
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings

from campaigns.api import _remap_archive_metadata
from campaigns.documents import parse_document, serialize_document
from campaigns.models import ArchiveItem, Campaign, CampaignMembership
from campaigns.tests.test_archive import markdown


def block(kind, **data):
    return {"id": str(uuid4()), "type": kind, "title": kind.title(), "data": data}


def collection(*blocks):
    return {"version": 1, "entries": list(blocks)}


class SessionBlockTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        settings = override_settings(DM_HQ_DOCUMENT_ROOT=Path(self.directory.name))
        settings.enable()
        self.addCleanup(settings.disable)
        self.user = User.objects.create_user("block-dm", password="fixture-password")
        self.campaign = Campaign.objects.create(name="Example campaign", owner=self.user)
        CampaignMembership.objects.create(campaign=self.campaign, user=self.user)
        self.client = Client(enforce_csrf_checks=True)
        self.client.force_login(self.user)
        self.csrf = self.client.get("/api/v1/auth/csrf").cookies["csrftoken"].value

    def post(self, path, payload):
        return self.client.post(path, json.dumps(payload), content_type="application/json", HTTP_X_CSRFTOKEN=self.csrf)

    def create(self, *blocks, title="Example page"):
        response = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/items",
            {"kind": "note", "markdown": markdown(self.campaign.id, uuid4(), title=title, blocks=collection(*blocks))},
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def update(self, item, metadata):
        return self.client.patch(
            f"/api/v1/items/{item['id']}",
            json.dumps({"version": item["version"], "markdown": serialize_document(metadata, "Supplementary prose")}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf,
        )

    def test_all_block_kinds_roundtrip_revision_and_search(self):
        scene = block("scene", mood="Fogbound basalt", custom_future_field={"kept": True})
        encounter = block(
            "conversation",
            topics=[
                {
                    "id": str(uuid4()),
                    "label": "Harbor",
                    "entries": [{"id": str(uuid4()), "text": "The tide remembers", "kind": "flavor"}],
                }
            ],
        )
        beat = {"id": str(uuid4()), "title": "Arrival", "scene_ids": [scene["id"]], "encounter_ids": [encounter["id"]]}
        story = block("story", summary="Find the courier", beats=[beat])
        scene["beat_id"] = beat["id"]
        character = block(
            "character",
            ruleset="dnd_5e_2014",
            ac=12,
            max_hp=9,
            attacks=[{"id": str(uuid4()), "name": "Staff", "attack_bonus": 2, "damage": "1d6"}],
        )
        challenge = block(
            "challenge", mode="individual_checks", checks=[{"id": str(uuid4()), "approach": "Listen", "dc": 10}]
        )
        item = self.create(story, scene, character, encounter, challenge)
        self.assertEqual(item["metadata"]["blocks"], collection(story, scene, character, encounter, challenge))
        search = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/search?q=basalt").json()
        self.assertEqual(search["items"][0]["id"], item["id"])
        modified = deepcopy(item["metadata"])
        modified["blocks"]["entries"][1]["data"]["mood"] = "Sunlit"
        updated = self.update(item, modified)
        self.assertEqual(updated.status_code, 200)
        stale = self.update(item, modified)
        self.assertEqual(stale.status_code, 409)
        restored = self.post(f"/api/v1/items/{item['id']}/restore", {"version": 2, "revision": 1})
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(restored.json()["metadata"]["blocks"], item["metadata"]["blocks"])

    def test_validation_errors_leave_document_unchanged(self):
        item = self.create(block("scene"))
        invalid = [
            collection(block("unknown")),
            {"version": 2, "entries": []},
            collection(block("character", ac=True)),
            collection(block("challenge", mode="threshold", success_target=0, failure_target=3)),
            collection(block("challenge", checks=[{"id": str(uuid4()), "dc": "hard"}])),
            collection(block("story", beats=[{"id": str(uuid4()), "scene_ids": [str(uuid4())]}])),
        ]
        duplicate = block("scene")
        invalid.append(collection(duplicate, duplicate))
        for value in invalid:
            with self.subTest(value=value):
                metadata = deepcopy(item["metadata"])
                metadata["blocks"] = value
                self.assertEqual(self.update(item, metadata).status_code, 422)
        self.assertEqual(self.client.get(f"/api/v1/items/{item['id']}").json()["version"], 1)

    def test_reuse_resolution_backlinks_and_missing_definition(self):
        canonical = block("character", voice="Soft-spoken")
        source = self.create(canonical, title="Courier")
        reference = block("character")
        reference["reference"] = {"item_id": source["id"], "block_id": canonical["id"]}
        reference["context"] = "Arrives exhausted"
        scene = block("scene", features=f"Meet [courier](dmhq://item/{source['id']})")
        session = self.create(reference, scene)
        self.assertEqual(session["resolved_blocks"][0]["data"]["voice"], "Soft-spoken")
        self.assertEqual(session["metadata"]["blocks"]["entries"][0]["data"], {})
        backlinks = self.client.get(f"/api/v1/items/{source['id']}").json()["backlinks"]
        self.assertTrue(any(row["source_id"] == session["id"] for row in backlinks))
        source_meta = deepcopy(source["metadata"])
        source_meta["blocks"]["entries"][0]["data"]["voice"] = "Sharp and urgent"
        changed_source = self.update(source, source_meta)
        self.assertEqual(changed_source.status_code, 200)
        source = changed_source.json()
        refreshed = self.client.get(f"/api/v1/items/{session['id']}").json()
        self.assertEqual(refreshed["resolved_blocks"][0]["data"]["voice"], "Sharp and urgent")
        self.assertEqual(refreshed["resolved_blocks"][0]["source_version"], 2)
        self.assertEqual(refreshed["version"], 1)
        source_meta = source["metadata"]
        source_meta["blocks"]["entries"] = []
        self.assertEqual(self.update(source, source_meta).status_code, 200)
        self.assertIn("reference_error", self.client.get(f"/api/v1/items/{session['id']}").json()["resolved_blocks"][0])

    def test_cross_campaign_references_and_inline_links_are_rejected(self):
        other = Campaign.objects.create(name="Other", owner=self.user)
        foreign = ArchiveItem.objects.create(campaign=other, title="Foreign", kind="note")
        for row in (
            block("scene", location_id=str(foreign.id)),
            block("conversation", participant_ids=[str(foreign.id)]),
            block("scene", features=f"[private](dmhq://item/{foreign.id})"),
        ):
            response = self.post(
                f"/api/v1/campaigns/{self.campaign.id}/items",
                {
                    "kind": "note",
                    "markdown": markdown(self.campaign.id, uuid4(), blocks=collection(row)),
                },
            )
            self.assertEqual(response.status_code, 422)
        item = self.create(block("scene"))
        outsider = User.objects.create_user("outsider", password="fixture-password")
        self.client.force_login(outsider)
        self.assertEqual(self.client.get(f"/api/v1/items/{item['id']}").status_code, 404)

    def test_archive_restore_remaps_item_ids_preserves_block_and_entry_ids(self):
        canonical = block("scene", mood="Still water")
        source = self.create(canonical, title="Example location")
        reference = block("scene")
        reference["reference"] = {"item_id": source["id"], "block_id": canonical["id"]}
        session = self.create(reference, block("conversation", participant_ids=[source["id"]]), title="Example session")
        exported = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/exports")
        restored = self.client.post(
            "/api/v1/exports/restore",
            {"archive": SimpleUploadedFile("example.zip", exported.content, content_type="application/zip")},
            HTTP_X_CSRFTOKEN=self.csrf,
        )
        self.assertEqual(restored.status_code, 200, restored.content)
        campaign_id = restored.json()["id"]
        copied_source = ArchiveItem.objects.get(campaign_id=campaign_id, title=source["title"])
        copied_session = ArchiveItem.objects.get(campaign_id=campaign_id, title=session["title"])
        data = self.client.get(f"/api/v1/items/{copied_session.id}").json()
        reference_data = data["metadata"]["blocks"]["entries"][0]
        self.assertEqual(reference_data["reference"]["item_id"], str(copied_source.id))
        self.assertEqual(reference_data["id"], reference["id"])
        self.assertEqual(reference_data["reference"]["block_id"], canonical["id"])
        self.assertEqual(data["resolved_blocks"][0]["data"]["mood"], "Still water")
        meta, _ = parse_document(session["markdown"])
        meta["blocks"]["entries"].append(block("scene", features=f"[location](dmhq://item/{source['id']})"))
        _remap_archive_metadata(
            meta, {"items": {source["id"]: str(copied_source.id)}, "campaigns": {}, "edges": {}, "templates": {}}
        )
        self.assertIn(str(copied_source.id), meta["blocks"]["entries"][-1]["data"]["features"])

    def test_publication_never_contains_blocks_or_resolved_character_details(self):
        item = self.create(block("story", truth="Private hidden antagonist"))
        publication = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/publications",
            {
                "entries": [
                    {"item_id": item["id"], "markdown": serialize_document(item["metadata"], "A safe invitation")}
                ]
            },
        )
        self.assertEqual(publication.status_code, 200)
        public = self.client.get(f"/api/v1/publications/public/{publication.json()['token']}")
        self.assertNotIn("Private hidden antagonist", public.content.decode())
        self.assertNotIn('"blocks"', public.content.decode())
        self.assertIn("A safe invitation", public.content.decode())
