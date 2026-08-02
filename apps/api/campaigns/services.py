# ruff: noqa: F401

"""Markdown-canonical campaign document services.

The API uses :mod:`campaigns.documents` directly. This module remains a small
named seam for callers that previously imported campaign services; it no longer
constructs JSON snapshots or treats relational content columns as authoritative.
"""

from .documents import (
    clean_body,
    content_hash,
    current_markdown_for_item,
    item_document_output,
    markdown_html,
    metadata_for_item,
    parse_document,
    project_item,
    read_current,
    save_document,
    serialize_document,
    storage_root,
    write_current,  # noqa: F401
)


def item_snapshot(item):
    """Return the canonical document response, not a JSON content snapshot."""
    return item_document_output(item)
