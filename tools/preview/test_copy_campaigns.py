import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("copy_campaigns", Path(__file__).with_name("copy-campaigns.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SnapshotArchiveTests(unittest.TestCase):
    def test_staging_keeps_current_documents_and_excludes_publications_and_history(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr(
                "manifest.json",
                json.dumps({"format": "dm-hq-markdown-archive", "version": 2, "publications": [{"id": "public"}]}),
            )
            archive.writestr(
                "campaigns/source/campaign.md",
                "---\n"
                + json.dumps({"id": "source", "document_type": "campaign", "title": "Example 🐉"})
                + "\n---\n\nOriginal body",
            )
            archive.writestr(
                "campaigns/source/items/page.md",
                "---\n"
                + json.dumps(
                    {"id": "page", "document_type": "archive_item", "custom": {"kept": True, "separator": "---"}}
                )
                + "\n---\n\nPrivate prose",
            )
            archive.writestr("campaigns/source/publications/public/v1/page.md", "Published body")
            archive.writestr("revisions/document/v1.md", "History")
        staged = module.staged_archive(output.getvalue(), "stamp", {"id": "source", "digest": "hash"}, "Example 🐉")
        with zipfile.ZipFile(io.BytesIO(staged)) as archive:
            self.assertEqual(len(archive.namelist()), 3)
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(manifest["publications"], [])
            self.assertEqual(set(manifest["documents"]), {"source", "page"})
            self.assertIn("🐉", archive.read("campaigns/source/campaign.md").decode())
            self.assertNotIn("\\ud83d", archive.read("campaigns/source/campaign.md").decode())
            self.assertIn("Original body", archive.read("campaigns/source/campaign.md").decode())
            self.assertIn("preview_snapshot_source_id", archive.read("campaigns/source/items/page.md").decode())
            self.assertIn('"kept": true', archive.read("campaigns/source/items/page.md").decode())

    def test_private_artifacts_are_exclusive_and_restrict_permissions(self):
        with tempfile.TemporaryDirectory() as folder:
            target = str(Path(folder) / "snapshot.zip")
            module.private_write(target, b"private")
            self.assertEqual(Path(target).stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                module.private_write(target, b"replace")


if __name__ == "__main__":
    unittest.main()
