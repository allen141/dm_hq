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

    def test_server_move_removes_old_path_and_materializes_new_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            workspace = Workspace.init("http://example.test", "campaign-1", root)
            old_key = "campaigns/campaign-1/items/old--doc-1.md"
            new_key = "campaigns/campaign-1/items/new--doc-1.md"
            old_path = workspace.path_for(old_key)
            old_path.parent.mkdir(parents=True)
            old_path.write_text("old", encoding="utf-8")
            workspace.state["documents"]["doc-1"] = {"storage_key": old_key, "version": 1, "hash": "cba06b5736faf67e54b07b561eae94395e774c517a7d910a54369e1263ccfbd4"}
            workspace._apply_change({
                "document_id": "doc-1",
                "previous_storage_key": old_key,
                "storage_key": new_key,
                "operation": "move",
                "version": 2,
                "hash": "server",
                "markdown": "new",
            })
            self.assertFalse(old_path.exists())
            self.assertEqual(workspace.path_for(new_key).read_text(encoding="utf-8"), "new")
            self.assertEqual(workspace.state["documents"]["doc-1"]["storage_key"], new_key)

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
