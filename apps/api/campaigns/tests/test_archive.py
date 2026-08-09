import io
import json
import uuid
import zipfile
from pathlib import Path

from django.apps import apps
from django.contrib.auth.models import User
from django.test import Client, TestCase, override_settings

from campaigns.documents import parse_document
from campaigns.models import ArchiveItem, Campaign, CampaignDocument, CampaignDocumentVersion, CampaignMembership


def markdown(campaign_id, item_id, kind="note", title="Rumor", body="First", **extra):
    metadata = {
        "document_type": "archive_item",
        "id": str(item_id),
        "campaign_id": str(campaign_id),
        "kind": kind,
        "title": title,
        "status": "draft",
        "aliases": [],
        "tags": [],
        "references": [],
        "relationships": [],
        **extra,
    }
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
        return self.client.post(
            path, data=json.dumps(payload), content_type="application/json", HTTP_X_CSRFTOKEN=self.csrf_token
        )

    def create_item(self, kind="note", title="Rumor", body="First", **extra):
        return self.post(
            f"/api/v1/campaigns/{self.campaign.id}/items",
            {"kind": kind, "markdown": markdown(self.campaign.id, uuid.uuid4(), kind, title, body, **extra)},
        ).json()

    def test_full_markdown_create_projects_and_materializes_file(self):
        item = self.create_item(
            kind="entity",
            title="Mara Venn",
            body="A **quiet** ferrymaster.",
            subject_type="person",
            fields={"species": "Human"},
            aliases=["The Ferrymaster"],
            tags=["harbor"],
        )
        self.assertEqual(item["metadata"]["fields"]["species"], "Human")
        self.assertEqual(item["aliases"], ["The Ferrymaster"])
        self.assertIn("A **quiet**", item["markdown"])
        self.assertTrue(Path("/tmp/dm-hq-test-documents").joinpath(item["storage_key"]).exists())
        self.assertEqual(CampaignDocumentVersion.objects.filter(document__archive_item__id=item["id"]).count(), 1)

    def test_create_binds_client_frontmatter_id_to_server_item(self):
        client_id = uuid.uuid4()
        item = self.create_item(title="Bound identity")
        self.assertEqual(str(item["id"]), item["metadata"]["id"])
        self.assertNotEqual(str(client_id), item["metadata"]["id"])
        stored = Path("/tmp/dm-hq-test-documents").joinpath(item["storage_key"]).read_text(encoding="utf-8")
        stored_metadata, _ = parse_document(stored)
        self.assertEqual(stored_metadata["id"], item["metadata"]["id"])
        self.assertEqual(stored_metadata["campaign_id"], str(self.campaign.id))

    def test_update_rejects_mismatched_frontmatter_id(self):
        item = self.create_item()
        wrong_id = uuid.uuid4()
        bad = self.client.patch(
            f"/api/v1/items/{item['id']}",
            data=json.dumps(
                {
                    "version": item["version"],
                    "markdown": markdown(self.campaign.id, wrong_id, title="Wrong id"),
                }
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(bad.status_code, 422)
        self.assertIn("Frontmatter id does not match", bad.content.decode())

    def test_invalid_frontmatter_and_stale_full_document_write(self):
        bad = self.post(f"/api/v1/campaigns/{self.campaign.id}/items", {"kind": "note", "markdown": "# no frontmatter"})
        self.assertEqual(bad.status_code, 422)
        item = self.create_item()
        replacement = markdown(self.campaign.id, item["id"], title="Updated", body="Second")
        updated = self.client.patch(
            f"/api/v1/items/{item['id']}",
            data=json.dumps({"version": 1, "markdown": replacement}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["version"], 2)
        stale = self.client.patch(
            f"/api/v1/items/{item['id']}",
            data=json.dumps({"version": 1, "markdown": markdown(self.campaign.id, item["id"], title="Overwrite")}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(stale.status_code, 409)
        revisions = self.client.get(f"/api/v1/items/{item['id']}/revisions").json()["revisions"]
        self.assertEqual([revision["number"] for revision in revisions], [2, 1])

    def test_relationship_search_and_workspace_are_markdown_backed(self):
        place = self.create_item(kind="entity", title="Saltmere", body="Salt road")
        person = self.create_item(kind="entity", title="Mara", body="Keeps the salt road")
        relation = self.post(
            f"/api/v1/items/{person['id']}/relationships",
            {"version": person["version"], "target_id": place["id"], "kind": "works_at", "notes": "Harbor records"},
        )
        self.assertEqual(relation.status_code, 200)
        detail = self.client.get(f"/api/v1/items/{person['id']}").json()
        self.assertEqual(detail["metadata"]["relationships"][0]["kind"], "works_at")
        self.assertIn(
            "Saltmere",
            [
                item["title"]
                for item in self.client.get(f"/api/v1/campaigns/{self.campaign.id}/search?q=Salt").json()["items"]
            ],
        )
        snapshot = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/workspace/snapshot").json()
        file = next(
            file
            for file in snapshot["files"]
            if file["document_id"] == str(detail["metadata"]["id"]) or file["storage_key"] == person["storage_key"]
        )
        changed = markdown(self.campaign.id, person["id"], "entity", "Mara Updated", "New local prose")
        applied = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/workspace/apply",
            {"document_id": file["document_id"], "version": file["version"], "hash": file["hash"], "markdown": changed},
        )
        self.assertEqual(applied.status_code, 200)
        conflict = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/workspace/apply",
            {"document_id": file["document_id"], "version": file["version"], "hash": file["hash"], "markdown": changed},
        )
        self.assertEqual(conflict.status_code, 409)
        wrong_id = markdown(self.campaign.id, uuid.uuid4(), "entity", "Wrong", "Bad id")
        rejected = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/workspace/apply",
            {
                "document_id": file["document_id"],
                "version": applied.json()["version"],
                "hash": applied.json()["hash"],
                "markdown": wrong_id,
            },
        )
        self.assertEqual(rejected.status_code, 422)
        self.assertIn("Frontmatter id does not match", rejected.content.decode())

    def test_relationship_crud_is_markdown_owned_and_versioned(self):
        first = self.create_item(title="First")
        second = self.create_item(title="Second")
        third = self.create_item(title="Third")
        created = self.post(
            f"/api/v1/items/{first['id']}/relationships",
            {
                "version": first["version"],
                "target_id": second["id"],
                "kind": "member_of",
                "label": "member of",
                "inverse_label": "has member",
                "notes": "Canonical note",
            },
        )
        self.assertEqual(created.status_code, 200)
        payload = created.json()
        edge_id = payload["relationship"]["id"]
        self.assertEqual(payload["item"]["metadata"]["relationships"][0]["id"], edge_id)
        self.assertEqual(payload["relationship"]["source_version"], 2)

        stale = self.post(
            f"/api/v1/items/{first['id']}/relationships",
            {"version": first["version"], "target_id": third["id"], "kind": "rival_of"},
        )
        self.assertEqual(stale.status_code, 409)

        updated = self.client.patch(
            f"/api/v1/items/{first['id']}/relationships/{edge_id}",
            data=json.dumps(
                {
                    "version": payload["item"]["version"],
                    "target_id": third["id"],
                    "kind": "allied_with",
                    "label": "trusts",
                    "inverse_label": "trusted by",
                    "notes": "Changed",
                }
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["relationship"]["target_id"], third["id"])
        incoming = self.client.get(f"/api/v1/items/{third['id']}").json()["incoming_relationships"]
        self.assertEqual(incoming[0]["inverse_label"], "trusted by")

        deleted = self.client.delete(
            f"/api/v1/items/{first['id']}/relationships/{edge_id}",
            data=json.dumps({"version": updated.json()["item"]["version"]}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.json()["item"]["metadata"]["relationships"], [])

    def test_graph_combines_document_links_references_and_relationships(self):
        target = self.create_item(title="Target")
        source = self.create_item(
            title="Source",
            body=f"Follow [Target](dmhq://item/{target['id']}).",
        )
        reference = self.post(
            f"/api/v1/items/{source['id']}/references",
            {"target_id": target["id"], "label": "mentions"},
        )
        self.assertEqual(reference.status_code, 200)
        relation = self.post(
            f"/api/v1/items/{source['id']}/relationships",
            {
                "version": reference.json()["item"]["version"],
                "target_id": target["id"],
                "kind": "allied_with",
                "label": "ally",
                "inverse_label": "ally",
            },
        )
        self.assertEqual(relation.status_code, 200)
        graph = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/archive/graph?focus_id={source['id']}&depth=1")
        self.assertEqual(graph.status_code, 200)
        graph_payload = graph.json()
        self.assertEqual({node["id"] for node in graph_payload["nodes"]}, {source["id"], target["id"]})
        self.assertEqual(
            {edge["edge_class"] for edge in graph_payload["edges"]},
            {"document_link", "reference", "relationship"},
        )

        bad_link = self.create_item(body=f"[Missing](dmhq://item/{uuid.uuid4()})")
        self.assertIn("detail", bad_link)

    def test_one_hop_includes_all_connected_components(self):
        direct_target = self.create_item(title="Direct target")
        source = self.create_item(
            title="Focused source",
            body=f"Follow [Direct target](dmhq://item/{direct_target['id']}).",
        )
        distant_target = self.create_item(title="Distant target")
        distant_source = self.create_item(
            title="Distant source",
            body=f"Follow [Distant target](dmhq://item/{distant_target['id']}).",
        )

        graph = self.client.get(
            f"/api/v1/campaigns/{self.campaign.id}/archive/graph?focus_id={source['id']}&depth=1"
        )
        self.assertEqual(graph.status_code, 200)
        node_ids = {node["id"] for node in graph.json()["nodes"]}
        expected_ids = {source["id"], direct_target["id"], distant_source["id"], distant_target["id"]}
        self.assertTrue(expected_ids <= node_ids)

    def test_graph_includes_bounded_plain_text_node_summaries(self):
        target = self.create_item(
            title="Target",
            body=" ".join(["A **very** long note."] * 100),
        )
        source = self.create_item(
            title="Source",
            body=f"Source points to [Target](dmhq://item/{target['id']}).",
        )
        home = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/archive/home").json()
        home_markdown = home["markdown"].replace(
            "\n\n", f"\n\nCampaign links [Source](dmhq://item/{source['id']}).\n", 1
        )
        updated_home = self.client.patch(
            f"/api/v1/campaigns/{self.campaign.id}/archive/home",
            data=json.dumps({"version": home["version"], "markdown": home_markdown}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(updated_home.status_code, 200)
        graph = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/archive/graph?focus_id={source['id']}")
        self.assertEqual(graph.status_code, 200)
        nodes = {node["id"]: node for node in graph.json()["nodes"]}
        self.assertEqual(nodes[source["id"]]["summary"], "Source points to Target.")
        self.assertEqual(nodes[str(self.campaign.id)]["summary"], "Campaign links Source.")
        self.assertLessEqual(len(nodes[target["id"]]["summary"]), 240)
        self.assertNotIn("**", nodes[target["id"]]["summary"])

    def test_default_templates_validate_typed_fields_and_canon_requirements(self):
        templates = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/templates").json()["templates"]
        person = next(template for template in templates if template["applies_to"] == "entity")
        session = next(template for template in templates if template["applies_to"] == "session")
        self.assertTrue(any(field["key"] == "species" for field in person["versions"][0]["fields"]))
        self.assertEqual(
            next(field for field in session["versions"][0]["fields"] if field["key"] == "session_status")["required"],
            True,
        )
        entity = self.create_item(kind="entity", title="Typed NPC", fields={"species": "Human", "level": 3})
        self.assertEqual(entity["metadata"]["fields"]["level"], 3)
        self.assertEqual(entity["metadata"]["template"]["id"], person["id"])
        invalid = self.client.patch(
            f"/api/v1/items/{entity['id']}",
            data=json.dumps(
                {
                    "version": entity["version"],
                    "markdown": markdown(
                        self.campaign.id,
                        entity["id"],
                        "entity",
                        "Typed NPC",
                        fields={"level": "three"},
                        template=entity["metadata"]["template"],
                    ),
                }
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(invalid.status_code, 422)
        session_item = self.create_item(
            kind="session", title="Session", fields={}, template={"id": session["id"], "version": 1}
        )
        canon = self.client.patch(
            f"/api/v1/items/{session_item['id']}",
            data=json.dumps(
                {
                    "version": session_item["version"],
                    "markdown": markdown(
                        self.campaign.id,
                        session_item["id"],
                        "session",
                        "Session",
                        fields={},
                        template=session_item["metadata"]["template"],
                        status="canon",
                    ),
                }
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(canon.status_code, 422)

    def test_slug_paths_are_human_readable_and_explicit_rename_emits_move(self):
        item = self.create_item(kind="entity", title="Mara Venn", body="Harbor keeper")
        self.assertIn(
            f"campaigns/glass-coast--{str(self.campaign.id).replace('-', '')[:8]}/items/mara-venn--",
            item["storage_key"],
        )
        old_key = item["storage_key"]
        snapshot = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/workspace/snapshot").json()
        renamed = self.client.patch(
            f"/api/v1/items/{item['id']}",
            data=json.dumps(
                {
                    "version": item["version"],
                    "markdown": markdown(
                        self.campaign.id,
                        item["id"],
                        "entity",
                        "Mara Venn (renamed)",
                        "Harbor keeper",
                        slug="ferrymaster",
                    ),
                }
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(renamed.status_code, 200)
        new_key = renamed.json()["storage_key"]
        self.assertIn("/items/ferrymaster--", new_key)
        self.assertNotEqual(old_key, new_key)
        self.assertFalse(Path("/tmp/dm-hq-test-documents").joinpath(old_key).exists())
        self.assertTrue(Path("/tmp/dm-hq-test-documents").joinpath(new_key).exists())
        changes = self.client.get(
            f"/api/v1/campaigns/{self.campaign.id}/workspace/changes?after={snapshot['manifest']['cursor']}"
        ).json()["changes"]
        move = next(change for change in changes if change["storage_key"] == new_key)
        self.assertEqual(move["operation"], "move")
        self.assertEqual(move["previous_storage_key"], old_key)
        self.assertIn("Harbor keeper", move["markdown"])

    def test_title_edit_keeps_path_and_invalid_slug_is_rejected(self):
        item = self.create_item(title="Stable Name")
        replacement = self.client.patch(
            f"/api/v1/items/{item['id']}",
            data=json.dumps(
                {
                    "version": item["version"],
                    "markdown": markdown(self.campaign.id, item["id"], title="Display Name Changed"),
                }
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(replacement.status_code, 200)
        self.assertEqual(replacement.json()["storage_key"], item["storage_key"])
        invalid = self.client.patch(
            f"/api/v1/items/{item['id']}",
            data=json.dumps(
                {
                    "version": replacement.json()["version"],
                    "markdown": markdown(self.campaign.id, item["id"], title="Bad", slug="../escape"),
                }
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(invalid.status_code, 422)
        self.assertIn("path separators", invalid.content.decode())

    def test_publication_scrubs_private_frontmatter(self):
        item = self.create_item(
            kind="entity",
            title="Private NPC",
            body="Public prose",
            aliases=["Secret name"],
            tags=["gm-only"],
            fields={"species": "Human"},
        )
        publication = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/publications",
            {"entries": [{"item_id": item["id"], "markdown": item["markdown"]}]},
        )
        self.assertEqual(publication.status_code, 200)
        public = self.client.get(f"/api/v1/publications/public/{publication.json()['token']}")
        payload = public.json()
        metadata = payload["entries"][0]["metadata"]
        self.assertEqual(
            metadata,
            {
                "document_type": "publication_entry",
                "id": metadata["id"],
                "campaign_id": str(self.campaign.id),
                "source_item_id": item["id"],
                "publication_id": publication.json()["id"],
                "version": 1,
                "slug": "private-npc",
                "title": "Private NPC",
            },
        )
        self.assertNotIn("gm-only", public.content.decode())
        self.assertNotIn("Secret name", public.content.decode())

    def test_cursor_pagination_and_workspace_sequence(self):
        first = self.create_item(title="First")
        self.create_item(title="Second")
        page = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/items?limit=1").json()
        self.assertEqual(len(page["items"]), 1)
        self.assertTrue(page["next_cursor"])
        next_page = self.client.get(
            f"/api/v1/campaigns/{self.campaign.id}/items?limit=1&cursor={page['next_cursor']}"
        ).json()
        self.assertEqual(len(next_page["items"]), 1)
        snapshot = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/workspace/snapshot").json()
        first_document_id = next(
            file["document_id"] for file in snapshot["files"] if file["storage_key"] == first["storage_key"]
        )
        changed = markdown(self.campaign.id, first["id"], title="First changed", body="New prose")
        updated = self.client.patch(
            f"/api/v1/items/{first['id']}",
            data=json.dumps({"version": first["version"], "markdown": changed}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(updated.status_code, 200)
        changes = self.client.get(
            f"/api/v1/campaigns/{self.campaign.id}/workspace/changes?after={snapshot['manifest']['cursor']}"
        ).json()
        self.assertTrue(any(change["document_id"] == first_document_id for change in changes["changes"]))
        self.assertGreater(changes["cursor"], snapshot["manifest"]["cursor"])

    def test_publication_and_markdown_archive_round_trip(self):
        item = self.create_item(kind="entity", title="Secret NPC", body="Private clue", fields={"species": "Human"})
        public_markdown = markdown(
            self.campaign.id, item["id"], "entity", "The Stranger", "A traveler.", fields={"species": "Human"}
        )
        publication = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/publications",
            {"entries": [{"item_id": item["id"], "markdown": public_markdown}]},
        )
        self.assertEqual(publication.status_code, 200)
        token = publication.json()["token"]
        public = self.client.get(f"/api/v1/publications/public/{token}")
        self.assertEqual(public.status_code, 200)
        self.assertNotIn("Private clue", public.content.decode())
        self.assertIn("A traveler", public.content.decode())
        export = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/exports")
        with zipfile.ZipFile(io.BytesIO(export.content)) as archive:
            self.assertIn("manifest.json", archive.namelist())
            self.assertNotIn("campaign.json", archive.namelist())
            self.assertTrue(any(name.endswith(".md") for name in archive.namelist()))
            self.assertNotIn("token", "".join(archive.namelist()))
        restored = self.client.post(
            "/api/v1/exports/restore",
            {
                "archive": __import__("django").core.files.uploadedfile.SimpleUploadedFile(
                    "archive.zip", export.content, content_type="application/zip"
                )
            },
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(restored.status_code, 200)
        self.assertTrue(ArchiveItem.objects.filter(campaign_id=restored.json()["id"], title="Secret NPC").exists())

    def test_archive_export_restore_remaps_links_navigation_relationships_and_views(self):
        target = self.create_item(kind="entity", title="Harbor", subject_type="place", fields={})
        source = self.create_item(
            kind="entity",
            title="Keeper",
            body=f"Visit [Harbor](dmhq://item/{target['id']}).",
            subject_type="person",
            fields={},
        )
        reference = self.post(
            f"/api/v1/items/{source['id']}/references",
            {"target_id": target["id"], "label": "works near"},
        ).json()
        related = self.post(
            f"/api/v1/items/{source['id']}/relationships",
            {
                "version": reference["item"]["version"],
                "target_id": target["id"],
                "kind": "member_of",
                "label": "serves",
                "inverse_label": "has keeper",
            },
        )
        self.assertEqual(related.status_code, 200)
        session = self.create_item(kind="session", title="Arrival", fields={})
        linked = self.post(f"/api/v1/items/{session['id']}/session-links", {"item_id": source["id"]})
        self.assertEqual(linked.status_code, 200)

        map_view = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/archive/views",
            {
                "view_type": "map",
                "title": "Harbor map",
                "background": {"url": "https://example.test/map.png", "alt": "Harbor"},
                "placements": [{"id": str(uuid.uuid4()), "item_id": target["id"], "x": 0.25, "y": 0.75}],
            },
        ).json()
        board = self.post(
            f"/api/v1/campaigns/{self.campaign.id}/archive/views",
            {
                "view_type": "relationship",
                "title": "Harbor ties",
                "members": [
                    {"id": str(uuid.uuid4()), "item_id": source["id"]},
                    {"id": str(uuid.uuid4()), "item_id": target["id"]},
                ],
                "settings": {
                    "orientation": "top_to_bottom",
                    "root_item_id": source["id"],
                    "relationship_kinds": [],
                },
            },
        ).json()

        home = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/archive/home").json()
        home_meta, home_body = parse_document(home["markdown"])
        home_meta.setdefault(
            "archive",
            {
                "schema_version": 1,
                "tab_order": ["wiki", "graph", "maps", "relationships"],
                "view_order": {"maps": [], "relationships": []},
                "navigation": [],
            },
        )
        home_meta["archive"]["navigation"] = [
            {
                "id": str(uuid.uuid4()),
                "type": "page",
                "label": "Keeper",
                "target": {"type": "item", "id": source["id"]},
            }
        ]
        home_meta["archive"]["view_order"] = {
            "maps": [map_view["id"]],
            "relationships": [board["id"]],
        }
        home_body += f"\n[Keeper](dmhq://item/{source['id']})"
        updated_home = self.client.patch(
            f"/api/v1/campaigns/{self.campaign.id}/archive/home",
            data=json.dumps(
                {
                    "version": home["version"],
                    "markdown": f"---\n{json.dumps(home_meta, indent=2)}\n---\n\n{home_body}\n",
                }
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(updated_home.status_code, 200)

        exported = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/exports")
        with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            source_path = manifest["documents"][source["id"]]
            source_markdown = archive.read(source_path).decode()
            self.assertNotIn("dmhq://item/", source_markdown)
            self.assertIn(".md)", source_markdown)

        restored_response = self.client.post(
            "/api/v1/exports/restore",
            {
                "archive": __import__("django").core.files.uploadedfile.SimpleUploadedFile(
                    "archive.zip", exported.content, content_type="application/zip"
                )
            },
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(restored_response.status_code, 200, restored_response.content)
        restored_campaign = Campaign.objects.get(id=restored_response.json()["id"])
        restored_source = ArchiveItem.objects.get(campaign=restored_campaign, title="Keeper")
        restored_target = ArchiveItem.objects.get(campaign=restored_campaign, title="Harbor")
        restored_session = ArchiveItem.objects.get(campaign=restored_campaign, title="Arrival")
        restored_meta, restored_body = parse_document(
            restored_source.document.versions.get(number=restored_source.document.current_version).markdown
        )
        self.assertIn(f"dmhq://item/{restored_target.id}", restored_body)
        self.assertEqual(str(restored_meta["references"][0]["target_id"]), str(restored_target.id))
        self.assertEqual(str(restored_meta["relationships"][0]["target_id"]), str(restored_target.id))
        self.assertNotEqual(restored_meta["relationships"][0]["id"], related.json()["relationship"]["id"])
        self.assertEqual(list(restored_session.session_links.values_list("item_id", flat=True)), [restored_source.id])

        restored_home, _ = parse_document(
            restored_campaign.document.versions.get(number=restored_campaign.document.current_version).markdown
        )
        self.assertEqual(restored_home["archive"]["navigation"][0]["target"]["id"], str(restored_source.id))
        restored_views = {view.title: view for view in restored_campaign.archive_views.all()}
        self.assertEqual(set(restored_views), {"Harbor map", "Harbor ties"})
        map_meta, _ = parse_document(
            restored_views["Harbor map"]
            .document.versions.get(number=restored_views["Harbor map"].document.current_version)
            .markdown
        )
        board_meta, _ = parse_document(
            restored_views["Harbor ties"]
            .document.versions.get(number=restored_views["Harbor ties"].document.current_version)
            .markdown
        )
        self.assertEqual(map_meta["placements"][0]["item_id"], str(restored_target.id))
        self.assertEqual(board_meta["settings"]["root_item_id"], str(restored_source.id))
        self.assertEqual(
            {member["item_id"] for member in board_meta["members"]},
            {str(restored_source.id), str(restored_target.id)},
        )
        self.assertEqual(restored_home["archive"]["view_order"]["maps"], [str(restored_views["Harbor map"].id)])

    def test_slug_migration_rebuilds_a_missing_materialized_file_from_revision(self):
        item = self.create_item(title="Missing materialization")
        document = CampaignDocument.objects.get(archive_item__id=item["id"])
        path = Path("/tmp/dm-hq-test-documents") / document.storage_key
        path.unlink()
        self.assertFalse(path.exists())

        import importlib

        migration = importlib.import_module("campaigns.migrations.0012_slug_based_paths")
        migration.forwards(apps, None)

        document.refresh_from_db()
        rebuilt = Path("/tmp/dm-hq-test-documents") / document.storage_key
        self.assertTrue(rebuilt.exists())
        metadata, _ = parse_document(rebuilt.read_text(encoding="utf-8"))
        self.assertEqual(metadata["id"], item["id"])

    def test_workspace_pages_include_markdown_and_hash_conflicts(self):
        item = self.create_item(title="Local item", body="Initial")
        snapshot = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/workspace/snapshot?limit=1").json()
        self.assertEqual(snapshot["manifest"]["version"], 2)
        self.assertTrue(snapshot["files"])
        file = next(value for value in snapshot["files"] if value["storage_key"] == item["storage_key"])
        token_response = self.client.post(
            "/api/v1/auth/agent-tokens",
            data=json.dumps({"name": "workspace"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(token_response.status_code, 200)
        headers = {"HTTP_AUTHORIZATION": f"Bearer {token_response.json()['token']}"}
        changed = markdown(self.campaign.id, item["id"], title="Local changed", body="Updated")
        applied = self.client.post(
            f"/api/v1/campaigns/{self.campaign.id}/workspace/apply",
            data=json.dumps(
                {
                    "document_id": file["document_id"],
                    "version": file["version"],
                    "hash": file["hash"],
                    "markdown": changed,
                }
            ),
            content_type="application/json",
            **headers,
        )
        self.assertEqual(applied.status_code, 200)
        self.assertEqual(applied.json()["version"], file["version"] + 1)
        self.assertIn("Updated", applied.json()["markdown"])
        stale = self.client.post(
            f"/api/v1/campaigns/{self.campaign.id}/workspace/apply",
            data=json.dumps(
                {
                    "document_id": file["document_id"],
                    "version": file["version"],
                    "hash": file["hash"],
                    "markdown": changed,
                }
            ),
            content_type="application/json",
            **headers,
        )
        self.assertEqual(stale.status_code, 409)
        changes = self.client.get(
            f"/api/v1/campaigns/{self.campaign.id}/workspace/changes?after={snapshot['manifest']['cursor']}",
            **headers,
        ).json()
        event = next(change for change in changes["changes"] if change["document_id"] == file["document_id"])
        self.assertEqual(event["operation"], "upsert")
        self.assertIn("Updated", event["markdown"])

    def test_workspace_delete_events_use_stable_document_ids(self):
        item = self.create_item(title="To delete")
        snapshot = self.client.get(f"/api/v1/campaigns/{self.campaign.id}/workspace/snapshot").json()
        file = next(value for value in snapshot["files"] if value["storage_key"] == item["storage_key"])
        document = CampaignDocument.objects.get(id=file["document_id"])
        document.delete()
        token_response = self.client.post(
            "/api/v1/auth/agent-tokens",
            data=json.dumps({"name": "delete-check"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        headers = {"HTTP_AUTHORIZATION": f"Bearer {token_response.json()['token']}"}
        changes = self.client.get(
            f"/api/v1/campaigns/{self.campaign.id}/workspace/changes?after={snapshot['manifest']['cursor']}",
            **headers,
        ).json()
        event = next(change for change in changes["changes"] if change["document_id"] == file["document_id"])
        self.assertEqual(event["operation"], "delete")
        self.assertIsNone(event["markdown"])
