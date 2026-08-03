import tempfile
import unittest
from pathlib import Path

from dmhq.index import SearchIndex
from dmhq.workspace import Workspace, WorkspaceError


class WorkspaceTests(unittest.TestCase):
    def test_path_safety_and_local_search(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            workspace = Workspace.init("http://example.test", "campaign-1", root)
            self.assertRaises(WorkspaceError, workspace.path_for, "../secret.md")
            record = {
                "document_id": "doc-1",
                "storage_key": "campaigns/campaign-1/items/doc-1.md",
                "version": 1,
                "hash": "base",
                "markdown": "---\n{\"title\": \"Harbor\"}\n---\n\nSalt road",
            }
            workspace.write_file(record)
            workspace.state["documents"]["doc-1"] = {"storage_key": record["storage_key"], "version": 1, "hash": "base"}
            workspace._save_state()
            with workspace.index() as index:
                index.upsert("doc-1", record["storage_key"], 1, "base", record["markdown"])
                self.assertEqual(index.search("Harbor")[0]["document_id"], "doc-1")

    def test_server_change_creates_conflict_without_overwriting_local_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            workspace = Workspace.init("http://example.test", "campaign-1", root)
            path = workspace.path_for("campaigns/campaign-1/items/doc-1.md")
            path.parent.mkdir(parents=True)
            path.write_text("local edit", encoding="utf-8")
            workspace.state["documents"]["doc-1"] = {"storage_key": str(path.relative_to(root)), "version": 1, "hash": "base"}
            workspace._apply_change({
                "document_id": "doc-1",
                "storage_key": "campaigns/campaign-1/items/doc-1.md",
                "operation": "upsert",
                "version": 2,
                "hash": "server",
                "markdown": "server edit",
            })
            self.assertEqual(path.read_text(encoding="utf-8"), "local edit")
            conflict = root / ".dmhq" / "conflicts" / "doc-1"
            self.assertTrue((conflict / "local.md").exists())
            self.assertTrue((conflict / "server.md").exists())


if __name__ == "__main__":
    unittest.main()
