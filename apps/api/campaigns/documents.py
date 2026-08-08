from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import unicodedata
import uuid
from datetime import date
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import transaction

from .models import (
    Alias,
    ArchiveItem,
    CampaignDocument,
    CampaignDocumentVersion,
    DocumentLink,
    ItemTag,
    Reference,
    Relationship,
    SessionLink,
    Tag,
    TemplateVersion,
    WorkspaceChange,
)

try:
    import yaml
except ImportError:  # pragma: no cover - dependency is installed in deployed environments
    yaml = None

YAMLError = yaml.YAMLError if yaml is not None else ValueError
try:
    from markdown_it import MarkdownIt
except ImportError:  # pragma: no cover - dependency is installed in deployed environments
    MarkdownIt = None


class DocumentError(ValueError):
    pass


SLUG_MAX_LENGTH = 80
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
RELATIONSHIP_KIND_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,79}$")
CANONICAL_LINK_PATTERN = re.compile(r"\[([^\]]+)\]\(dmhq://(item|campaign)/([0-9a-fA-F-]{36})\)")


def normalize_slug(value: Any, fallback: str = "untitled", reject_separators: bool = False) -> str:
    """Return the filesystem-safe, canonical slug for a document name."""
    raw = str(value or "").strip()
    if reject_separators and ("/" in raw or "\\" in raw or raw in {".", ".."}):
        raise DocumentError("Slug may not contain path separators")
    normalized = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii").lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")[:SLUG_MAX_LENGTH].strip("-")
    return normalized or fallback


def ensure_slug(metadata: dict[str, Any]) -> dict[str, Any]:
    """Populate and canonicalize the explicit frontmatter slug."""
    if not isinstance(metadata, dict):
        raise DocumentError("Frontmatter must be an object")
    explicit = metadata.get("slug")
    source = explicit or metadata.get("title") or metadata.get("name") or "untitled"
    metadata["slug"] = normalize_slug(source, reject_separators=explicit is not None)
    return metadata


def _short_id(value: Any) -> str:
    try:
        return uuid.UUID(str(value)).hex[:8]
    except (ValueError, TypeError, AttributeError):
        return str(value).replace("-", "")[:8]


def campaign_path_segment(campaign, campaign_slug: str | None = None) -> str:
    return f"{normalize_slug(campaign_slug or campaign.name)}--{_short_id(campaign.id)}"


def storage_key_for(campaign, document_type: str, metadata: dict[str, Any]) -> str:
    """Build the only supported current-file path for a canonical document."""
    campaign_slug = metadata.get("campaign_slug")
    if (
        not campaign_slug
        and document_type != CampaignDocument.DocumentType.CAMPAIGN
        and getattr(campaign, "document_id", None)
    ):
        try:
            campaign_metadata, _ = parse_document(read_current(campaign.document))
            campaign_slug = campaign_metadata.get("slug")
        except (DocumentError, OSError):
            campaign_slug = None
    campaign_segment = campaign_path_segment(campaign, campaign_slug)
    if document_type == CampaignDocument.DocumentType.CAMPAIGN:
        return f"campaigns/{campaign_segment}/campaign.md"
    if document_type == CampaignDocument.DocumentType.ARCHIVE_ITEM:
        item_slug = normalize_slug(metadata.get("slug"))
        return f"campaigns/{campaign_segment}/items/{item_slug}--{_short_id(metadata['id'])}.md"
    if document_type == CampaignDocument.DocumentType.TEMPLATE:
        template_id = metadata.get("template_id") or metadata.get("id")
        template_slug = normalize_slug(metadata.get("slug") or metadata.get("name"))
        return (
            f"campaigns/{campaign_segment}/templates/{template_slug}--{_short_id(template_id)}"
            f"/v{int(metadata.get('version') or 1)}.md"
        )
    if document_type == CampaignDocument.DocumentType.ARCHIVE_VIEW:
        view_slug = normalize_slug(metadata.get("slug") or metadata.get("title"))
        return f"campaigns/{campaign_segment}/views/{view_slug}--{_short_id(metadata['id'])}.md"
    if document_type == CampaignDocument.DocumentType.PUBLICATION_ENTRY:
        publication_id = metadata.get("publication_id") or "publication"
        publication_slug = normalize_slug(metadata.get("publication_slug") or "publication")
        item_id = metadata.get("source_item_id") or metadata.get("item_id") or metadata.get("id")
        item_slug = normalize_slug(metadata.get("slug") or metadata.get("title"))
        return (
            f"campaigns/{campaign_segment}/publications/{publication_slug}--{_short_id(publication_id)}"
            f"/v{int(metadata.get('version') or 1)}/{item_slug}--{_short_id(item_id)}.md"
        )
    raise DocumentError(f"Unsupported document type: {document_type}")


def storage_root() -> Path:
    root = Path(getattr(settings, "DM_HQ_DOCUMENT_ROOT", Path(settings.BASE_DIR) / "documents"))
    root.mkdir(parents=True, exist_ok=True)
    return root


def content_hash(markdown: str) -> str:
    return hashlib.sha256(markdown.encode("utf-8")).hexdigest()


def _scalar(value: str) -> Any:
    value = value.strip()
    if value in {"", "null", "~"}:
        return None
    if value.lower() in {"true", "false"}:
        return value.lower() == "true"
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1]
    try:
        return int(value)
    except ValueError:
        try:
            return float(value)
        except ValueError:
            return value


def _fallback_frontmatter(raw: str) -> dict[str, Any]:
    lines = [
        (len(line) - len(line.lstrip(" ")), line.strip())
        for line in raw.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]

    def parse_value(value: str) -> Any:
        value = value.strip()
        if value in {"", "null", "~"}:
            return None
        if value.startswith("[") or value.startswith("{"):
            try:
                return json.loads(value.replace("'", '"'))
            except json.JSONDecodeError:
                pass
        return _scalar(value)

    def block(index: int, indent: int):
        if index >= len(lines):
            return {}, index
        is_list = lines[index][0] == indent and lines[index][1].startswith("-")
        result: Any = [] if is_list else {}
        while index < len(lines):
            level, text = lines[index]
            if level < indent:
                break
            if level > indent:
                break
            if is_list:
                if not text.startswith("-"):
                    break
                item = text[1:].strip()
                index += 1
                if not item:
                    if index < len(lines) and lines[index][0] > indent:
                        value, index = block(index, lines[index][0])
                    else:
                        value = None
                elif ":" in item:
                    key, value_text = item.split(":", 1)
                    value = {key.strip(): parse_value(value_text)}
                    if index < len(lines) and lines[index][0] > indent:
                        nested, index = block(index, lines[index][0])
                        if isinstance(nested, dict):
                            value.update(nested)
                else:
                    value = parse_value(item)
                result.append(value)
            else:
                if ":" not in text:
                    index += 1
                    continue
                key, value_text = text.split(":", 1)
                index += 1
                if value_text.strip():
                    value = parse_value(value_text)
                elif index < len(lines) and lines[index][0] > indent:
                    value, index = block(index, lines[index][0])
                else:
                    value = None
                result[key.strip()] = value
        return result, index

    value, _ = block(0, lines[0][0] if lines else 0)
    return value if isinstance(value, dict) else {}


def parse_document(markdown: str) -> tuple[dict[str, Any], str]:
    text = markdown.replace("\r\n", "\n").strip() + "\n"
    if not text.startswith("---\n"):
        raise DocumentError("Markdown document must begin with YAML frontmatter")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise DocumentError("Markdown document has no closing frontmatter delimiter")
    raw = text[4:end]
    try:
        metadata = yaml.safe_load(raw) if yaml is not None else json.loads(raw)
        if not isinstance(metadata, dict):
            raise ValueError
    except (json.JSONDecodeError, ValueError, YAMLError):
        metadata = _fallback_frontmatter(raw)
    body = text[end + 6 :].strip()
    return metadata, body


def serialize_document(metadata: dict[str, Any], body: str = "") -> str:
    return "---\n" + json.dumps(metadata, indent=2, ensure_ascii=False) + "\n---\n\n" + body.strip() + "\n"


def clean_body(body: str) -> str:
    return re.sub(r"<[^>]*>", "", body or "")


def searchable_text(metadata: dict[str, Any], body: str) -> str:
    values: list[str] = []
    for key in ("title", "subject_type", "aliases", "tags"):
        value = metadata.get(key)
        if isinstance(value, list):
            values.extend(str(entry) for entry in value)
        elif value is not None:
            values.append(str(value))
    fields = metadata.get("fields")
    if isinstance(fields, dict):
        values.extend(str(value) for value in fields.values() if value is not None)
    values.append(body)
    return "\n".join(value for value in values if value)


def markdown_body(markdown: str) -> str:
    return parse_document(markdown)[1]


def safe_publication_markdown(
    markdown: str, campaign_id: Any, source_item_id: Any, publication_id: Any | None = None, version: int = 1
) -> str:
    metadata, body = parse_document(markdown)
    safe_metadata = {
        "document_type": "publication_entry",
        "id": str(uuid.uuid4()),
        "campaign_id": str(campaign_id),
        "source_item_id": str(source_item_id),
        "publication_id": str(publication_id) if publication_id else None,
        "version": version,
        "title": str(metadata.get("title") or "Untitled"),
        "slug": normalize_slug(metadata.get("slug") or metadata.get("title") or "untitled"),
    }
    if safe_metadata["publication_id"] is None:
        safe_metadata.pop("publication_id")
    body = CANONICAL_LINK_PATTERN.sub(lambda match: match.group(1), body)
    return serialize_document(safe_metadata, body)


def canonical_document_links(body: str) -> list[dict[str, Any]]:
    links = []
    for position, match in enumerate(CANONICAL_LINK_PATTERN.finditer(body or "")):
        links.append(
            {
                "label": match.group(1).strip(),
                "target_type": match.group(2),
                "target_identifier": uuid.UUID(match.group(3)),
                "context": body[max(0, match.start() - 80) : match.end() + 80].strip(),
                "authored_position": position,
            }
        )
    return links


def project_document_links(document: CampaignDocument, metadata: dict[str, Any], body: str) -> None:
    document.outgoing_links.all().delete()
    DocumentLink.objects.bulk_create(
        [
            DocumentLink(
                campaign_id=document.campaign_id,
                source_document=document,
                source_identifier=metadata["id"],
                **link,
            )
            for link in canonical_document_links(body)
        ]
    )


def write_current(doc: CampaignDocument, markdown: str) -> None:
    path = storage_root() / doc.storage_key
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=".document-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(markdown)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def read_current(doc: CampaignDocument) -> str:
    path = storage_root() / doc.storage_key
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        version = doc.versions.get(number=doc.current_version)
        write_current(doc, version.markdown)
        return version.markdown


def metadata_for_item(item: ArchiveItem) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "document_type": "archive_item",
        "id": str(item.id),
        "campaign_id": str(item.campaign_id),
        "kind": item.kind,
        "title": item.title,
        "slug": normalize_slug(item.title),
        "status": item.status,
        "aliases": list(item.aliases.values_list("value", flat=True)),
        "tags": list(item.item_tags.select_related("tag").values_list("tag__name", flat=True)),
    }
    if hasattr(item, "entity_detail"):
        detail = item.entity_detail
        metadata["subject_type"] = detail.subject_type
        if detail.template_version:
            metadata["template"] = {
                "id": str(detail.template_version.template_id),
                "version": detail.template_version.number,
            }
    if hasattr(item, "session_detail"):
        detail = item.session_detail
        if detail.template_version:
            metadata["template"] = {
                "id": str(detail.template_version.template_id),
                "version": detail.template_version.number,
            }
    refs = list(item.outgoing_references.values("target_id", "label"))
    metadata["references"] = [{"target_id": str(row["target_id"]), "label": row["label"]} for row in refs]
    metadata["relationships"] = [
        {
            "id": str(r.edge_id),
            "target_id": str(r.target_id),
            "kind": r.kind,
            "label": r.label,
            "inverse_label": r.inverse_label,
            "notes": r.notes,
        }
        for r in item.outgoing_relationships.order_by("authored_position", "id")
    ]
    if item.kind == ArchiveItem.Kind.SESSION:
        metadata["session_links"] = [str(value) for value in item.session_links.values_list("item_id", flat=True)]
    return metadata


def project_item(item: ArchiveItem, metadata: dict[str, Any]) -> None:
    item.title = str(metadata.get("title") or "Untitled")[:240]
    item.status = str(metadata.get("status") or "draft")
    item.save(update_fields=["title", "status", "updated_at"])
    if hasattr(item, "entity_detail"):
        detail = item.entity_detail
        detail.subject_type = str(metadata.get("subject_type") or "person")
        template = metadata.get("template") or {}
        if template.get("id"):
            detail.template_version = TemplateVersion.objects.filter(
                template_id=template["id"], number=template.get("version", 1), template__campaign=item.campaign
            ).first()
        else:
            detail.template_version = None
        detail.save(update_fields=["subject_type", "template_version"])
    if hasattr(item, "session_detail"):
        detail = item.session_detail
        template = metadata.get("template") or {}
        if template.get("id"):
            detail.template_version = TemplateVersion.objects.filter(
                template_id=template["id"], number=template.get("version", 1), template__campaign=item.campaign
            ).first()
        else:
            detail.template_version = None
        detail.save(update_fields=["template_version"])
    item.aliases.all().delete()
    Alias.objects.bulk_create(
        [Alias(item=item, value=str(value).strip()) for value in metadata.get("aliases", []) if str(value).strip()]
    )
    item.item_tags.all().delete()
    for name in dict.fromkeys(str(value).strip().lower() for value in metadata.get("tags", []) if str(value).strip()):
        tag, _ = Tag.objects.get_or_create(campaign=item.campaign, name=name)
        ItemTag.objects.get_or_create(item=item, tag=tag)
    item.outgoing_references.all().delete()
    for ref in metadata.get("references", []):
        target = ArchiveItem.objects.filter(id=ref.get("target_id"), campaign=item.campaign).first()
        if target:
            Reference.objects.get_or_create(source=item, target=target, label=str(ref.get("label") or ""))
    item.outgoing_relationships.all().delete()
    source_version = item.document.current_version if item.document_id else item.version
    for position, rel in enumerate(metadata.get("relationships", [])):
        target = ArchiveItem.objects.filter(id=rel.get("target_id"), campaign=item.campaign).first()
        if target:
            Relationship.objects.create(
                edge_id=rel["id"],
                source=item,
                target=target,
                kind=str(rel["kind"]),
                label=str(rel.get("label") or ""),
                inverse_label=str(rel.get("inverse_label") or ""),
                notes=str(rel.get("notes") or ""),
                authored_position=position,
                source_version=source_version,
            )
    if item.kind == ArchiveItem.Kind.SESSION:
        item.session_links.all().delete()
        for target_id in metadata.get("session_links", []):
            target = ArchiveItem.objects.filter(id=target_id, campaign=item.campaign).first()
            if target:
                SessionLink.objects.get_or_create(session=item, item=target)


@transaction.atomic
def validate_metadata(metadata: dict[str, Any], document_type: str, campaign_id: Any, body: str = "") -> None:
    ensure_slug(metadata)
    required = {"document_type", "id", "campaign_id", "slug"}
    missing = sorted(required - metadata.keys())
    if missing:
        raise DocumentError("Missing frontmatter keys: " + ", ".join(missing))
    if metadata.get("document_type") != document_type:
        raise DocumentError("Document type does not match endpoint")
    if str(metadata.get("campaign_id")) != str(campaign_id):
        raise DocumentError("Document belongs to another campaign")
    try:
        uuid.UUID(str(metadata["id"]))
    except (ValueError, TypeError, AttributeError) as exc:
        raise DocumentError("Frontmatter id must be a UUID") from exc
    for link in canonical_document_links(body):
        target_id = link["target_identifier"]
        if link["target_type"] == "campaign" and str(target_id) != str(campaign_id):
            raise DocumentError("Campaign links must target this campaign")
        if (
            link["target_type"] == "item"
            and not ArchiveItem.objects.filter(id=target_id, campaign_id=campaign_id).exists()
        ):
            raise DocumentError("Document link target does not exist in this campaign")

    if document_type == CampaignDocument.DocumentType.CAMPAIGN:
        archive = metadata.get("archive") or {}
        if not isinstance(archive, dict):
            raise DocumentError("archive configuration must be an object")
        tab_order = archive.get("tab_order", ["wiki", "graph", "maps", "relationships"])
        if (
            not isinstance(tab_order, list)
            or set(tab_order) != {"wiki", "graph", "maps", "relationships"}
            or len(tab_order) != 4
        ):
            raise DocumentError("archive.tab_order must contain each fixed tab exactly once")
        view_order = archive.get("view_order", {})
        if not isinstance(view_order, dict):
            raise DocumentError("archive.view_order must be an object")
        for view_type in ("maps", "relationships"):
            values = view_order.get(view_type, [])
            if not isinstance(values, list) or any(not _valid_uuid(value) for value in values):
                raise DocumentError(f"archive.view_order.{view_type} must contain view UUIDs")
        navigation = archive.get("navigation", [])
        if not isinstance(navigation, list):
            raise DocumentError("archive.navigation must be a list")
        seen_nodes: set[str] = set()
        node_count = 0

        def validate_navigation(nodes: list[Any], level: int) -> None:
            nonlocal node_count
            if level > 8:
                raise DocumentError("archive.navigation may not exceed eight levels")
            for node in nodes:
                node_count += 1
                if node_count > 500 or not isinstance(node, dict) or not _valid_uuid(node.get("id")):
                    raise DocumentError("archive navigation nodes require unique UUID ids and a 500-node limit")
                node_id = str(node["id"])
                if node_id in seen_nodes:
                    raise DocumentError("archive navigation node ids must be unique")
                seen_nodes.add(node_id)
                node_type = node.get("type")
                if node_type == "group":
                    children = node.get("children", [])
                    if not isinstance(children, list):
                        raise DocumentError("archive navigation groups require children")
                    validate_navigation(children, level + 1)
                elif node_type == "page":
                    if node.get("children") not in (None, []):
                        raise DocumentError("archive navigation page nodes cannot have children")
                    target = node.get("target") or {}
                    if (
                        not isinstance(target, dict)
                        or target.get("type") not in {"item", "campaign"}
                        or not _valid_uuid(target.get("id"))
                    ):
                        raise DocumentError("archive navigation pages require an item or campaign target")
                    target_id = target["id"]
                    if target["type"] == "campaign":
                        valid_target = str(target_id) == str(campaign_id)
                    else:
                        valid_target = ArchiveItem.objects.filter(id=target_id, campaign_id=campaign_id).exists()
                    if not valid_target:
                        raise DocumentError("archive navigation target does not exist in this campaign")
                else:
                    raise DocumentError("archive navigation node type must be group or page")

        validate_navigation(navigation, 1)

    if document_type == "template":
        template_id = metadata.get("template_id")
        version = metadata.get("version")
        if not template_id or not isinstance(metadata.get("fields"), list):
            raise DocumentError("Template documents require template_id, version, and fields")
        try:
            uuid.UUID(str(template_id))
            int(version)
        except (ValueError, TypeError, AttributeError) as exc:
            raise DocumentError("Template identity is invalid") from exc
        for field in metadata["fields"]:
            if not isinstance(field, dict) or not str(field.get("key") or "").strip():
                raise DocumentError("Template fields require stable keys")
            if field.get("type") not in {
                "short_text",
                "long_text",
                "number",
                "boolean",
                "calendar_date",
                "choice",
                "entity_reference",
            }:
                raise DocumentError("Template field type is invalid")
            if field.get("type") == "choice" and not isinstance(field.get("options"), list):
                raise DocumentError("Choice fields require options")
    if document_type == CampaignDocument.DocumentType.ARCHIVE_VIEW:
        if metadata.get("view_type") not in {"map", "relationship"}:
            raise DocumentError("Archive view type is invalid")
        if metadata.get("status") not in {"active", "archived"}:
            raise DocumentError("Archive view status is invalid")
        if not str(metadata.get("title") or "").strip():
            raise DocumentError("Archive view title is required")
        if metadata["view_type"] == "map":
            background = metadata.get("background") or {}
            if background:
                if not isinstance(background, dict) or not str(background.get("url") or "").startswith("https://"):
                    raise DocumentError("Map backgrounds must use HTTPS URLs")
                if not str(background.get("alt") or "").strip():
                    raise DocumentError("Map backgrounds require alt text")
            placements = metadata.get("placements", [])
            if not isinstance(placements, list):
                raise DocumentError("Map placements must be a list")
            placement_ids = set()
            for placement in placements:
                if (
                    not isinstance(placement, dict)
                    or not _valid_uuid(placement.get("id"))
                    or not _valid_uuid(placement.get("item_id"))
                ):
                    raise DocumentError("Map placements require stable id and item_id")
                if str(placement["id"]) in placement_ids:
                    raise DocumentError("Map placement ids must be unique")
                placement_ids.add(str(placement["id"]))
                if not ArchiveItem.objects.filter(id=placement["item_id"], campaign_id=campaign_id).exists():
                    raise DocumentError("Map placement item does not exist in this campaign")
                try:
                    x, y = float(placement.get("x")), float(placement.get("y"))
                except (TypeError, ValueError) as exc:
                    raise DocumentError("Map placement coordinates must be numbers") from exc
                if not 0 <= x <= 1 or not 0 <= y <= 1:
                    raise DocumentError("Map placement coordinates must be between 0 and 1")
        else:
            members = metadata.get("members", [])
            if not isinstance(members, list):
                raise DocumentError("Relationship view members must be a list")
            member_ids = set()
            for member in members:
                if (
                    not isinstance(member, dict)
                    or not _valid_uuid(member.get("id"))
                    or not _valid_uuid(member.get("item_id"))
                ):
                    raise DocumentError("Relationship members require stable id and item_id")
                if str(member["item_id"]) in member_ids:
                    raise DocumentError("Relationship view members must be unique")
                member_ids.add(str(member["item_id"]))
                if not ArchiveItem.objects.filter(id=member["item_id"], campaign_id=campaign_id).exists():
                    raise DocumentError("Relationship member does not exist in this campaign")
        return
    if document_type != "archive_item":
        return
    if metadata.get("kind") not in {choice.value for choice in ArchiveItem.Kind}:
        raise DocumentError("Archive item kind is invalid")
    if not str(metadata.get("title") or "").strip():
        raise DocumentError("Archive item title is required")
    if metadata.get("status") not in {choice.value for choice in ArchiveItem.Status}:
        raise DocumentError("Archive item status is invalid")
    if metadata.get("kind") == ArchiveItem.Kind.ENTITY and metadata.get("subject_type") not in {
        "person",
        "place",
        "faction",
        "thing",
        "event",
        "lore",
    }:
        raise DocumentError("Entity subject type is invalid")
    for key in ("aliases", "tags", "references", "relationships"):
        if key in metadata and not isinstance(metadata[key], list):
            raise DocumentError(f"{key} must be a list")
    for key in ("references", "relationships"):
        for value in metadata.get(key, []):
            if not isinstance(value, dict) or not value.get("target_id"):
                raise DocumentError(f"{key} entries require target_id")
            try:
                uuid.UUID(str(value["target_id"]))
            except (ValueError, TypeError, AttributeError) as exc:
                raise DocumentError(f"{key} target_id must be a UUID") from exc
    relationship_ids: set[str] = set()
    relationship_targets: set[tuple[str, str]] = set()
    source_id = str(metadata["id"])
    for relationship in metadata.get("relationships", []):
        relationship_id = relationship.get("id")
        kind = str(relationship.get("kind") or "")
        target_id = str(relationship.get("target_id"))
        if not relationship_id or not _valid_uuid(relationship_id):
            raise DocumentError("Relationship entries require a stable UUID id")
        if str(relationship_id) in relationship_ids:
            raise DocumentError("Relationship ids must be unique within a document")
        relationship_ids.add(str(relationship_id))
        if not RELATIONSHIP_KIND_PATTERN.fullmatch(kind):
            raise DocumentError("Relationship kind must use lower_snake_case")
        if target_id == source_id:
            raise DocumentError("Relationships cannot target their source item")
        if not ArchiveItem.objects.filter(id=target_id, campaign_id=campaign_id).exists():
            raise DocumentError("Relationship target does not exist in this campaign")
        target_kind = (target_id, kind)
        if target_kind in relationship_targets:
            raise DocumentError("Relationship target and kind must be unique within a document")
        relationship_targets.add(target_kind)
        if "reciprocal_label" in relationship:
            raise DocumentError("Use inverse_label instead of reciprocal_label")
        for field in ("label", "inverse_label"):
            if len(str(relationship.get(field) or "")) > 160:
                raise DocumentError(f"Relationship {field} must be at most 160 characters")
    fields = metadata.get("fields", {})
    if not isinstance(fields, dict):
        raise DocumentError("fields must be an object")
    template_ref = metadata.get("template")
    if not template_ref:
        if fields:
            raise DocumentError("Field values require a template reference")
        return
    if not isinstance(template_ref, dict) or not template_ref.get("id"):
        raise DocumentError("Template reference is invalid")
    try:
        template_id = uuid.UUID(str(template_ref["id"]))
        template_number = int(template_ref.get("version", 1))
    except (ValueError, TypeError, AttributeError) as exc:
        raise DocumentError("Template reference is invalid") from exc
    template_version = (
        TemplateVersion.objects.filter(
            template_id=template_id, number=template_number, template__campaign_id=campaign_id
        )
        .select_related("template")
        .first()
    )
    if not template_version:
        raise DocumentError("Template version does not exist in this campaign")
    expected_template_kind = "entity" if metadata.get("kind") == "entity" else "session"
    if template_version.template.applies_to != expected_template_kind:
        raise DocumentError("Template does not apply to this item kind")
    if not template_version.document_id:
        raise DocumentError("Template document is missing")
    template_metadata, _ = parse_document(read_current(template_version.document))
    definitions = template_metadata.get("fields", [])
    definitions_by_key = {field.get("key"): field for field in definitions if isinstance(field, dict)}
    unknown = sorted(set(fields) - set(definitions_by_key))
    if unknown:
        raise DocumentError("Unknown template fields: " + ", ".join(unknown))
    for key, value in fields.items():
        field = definitions_by_key[key]
        field_type = field.get("type")
        if value in (None, ""):
            continue
        valid = (
            (field_type in {"short_text", "long_text"} and isinstance(value, str))
            or (field_type == "number" and isinstance(value, (int, float)) and not isinstance(value, bool))
            or (field_type == "boolean" and isinstance(value, bool))
            or (field_type == "calendar_date" and isinstance(value, str) and _valid_date(value))
            or (field_type == "choice" and isinstance(value, str) and value in field.get("options", []))
            or (field_type == "entity_reference" and _valid_uuid(value))
        )
        if (
            field_type == "entity_reference"
            and valid
            and not ArchiveItem.objects.filter(id=value, campaign_id=campaign_id).exists()
        ):
            raise DocumentError(f"Field {key} references an item outside this campaign")
        if not valid:
            raise DocumentError(f"Field {key} has an invalid value")
    if metadata.get("status") == "canon":
        missing_required = [
            key for key, field in definitions_by_key.items() if field.get("required") and fields.get(key) in (None, "")
        ]
        if missing_required:
            raise DocumentError("Canon items require fields: " + ", ".join(sorted(missing_required)))


def _valid_uuid(value: Any) -> bool:
    try:
        uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return False
    return True


def _valid_date(value: str) -> bool:
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def prepare_archive_item_markdown(item: ArchiveItem, markdown: str) -> str:
    metadata, body = parse_document(markdown)
    if item.document_id is None:
        metadata["id"] = str(item.id)
        metadata["campaign_id"] = str(item.campaign_id)
    elif str(metadata.get("id")) != str(item.id):
        raise DocumentError("Frontmatter id does not match archive item")
    if item.document_id and not metadata.get("slug"):
        current_metadata, _ = parse_document(read_current(item.document))
        metadata["slug"] = current_metadata.get("slug")
    if item.kind == "entity":
        metadata.setdefault(
            "subject_type",
            getattr(getattr(item, "entity_detail", None), "subject_type", "person"),
        )
    ensure_slug(metadata)
    validate_metadata(metadata, "archive_item", item.campaign_id, body)
    if metadata.get("kind") != item.kind:
        raise DocumentError("Document kind does not match item")
    return serialize_document(metadata, clean_body(body))


def save_document(
    campaign,
    document_type: str,
    storage_key: str | None,
    markdown: str,
    user,
    reason: str = "",
    expected_version: int | None = None,
    document: CampaignDocument | None = None,
) -> CampaignDocument:
    metadata, body = parse_document(markdown)
    if document is not None and not metadata.get("slug"):
        current_metadata, _ = parse_document(read_current(document))
        metadata["slug"] = current_metadata.get("slug")
    ensure_slug(metadata)
    validate_metadata(metadata, document_type, campaign.id, body)
    derived_storage_key = storage_key_for(campaign, document_type, metadata)
    if document is None:
        document = CampaignDocument.objects.create(
            campaign=campaign, document_type=document_type, storage_key=derived_storage_key, current_version=0
        )
        previous_storage_key = None
    else:
        document = CampaignDocument.objects.select_for_update().get(id=document.id)
        previous_storage_key = document.storage_key
        document.storage_key = derived_storage_key
    if expected_version is not None and document.current_version != expected_version:
        raise DocumentError("stale_version")
    number = document.current_version + 1
    normalized = serialize_document(metadata, clean_body(body))
    digest = content_hash(normalized)
    CampaignDocumentVersion.objects.create(
        document=document, number=number, markdown=normalized, content_hash=digest, created_by=user, reason=reason
    )
    document.current_version = number
    document.content_hash = digest
    document.search_text = searchable_text(metadata, body)
    document.save(update_fields=["storage_key", "current_version", "content_hash", "search_text", "updated_at"])
    if document.document_type != "publication_entry":
        moved = previous_storage_key and previous_storage_key != document.storage_key
        WorkspaceChange.objects.create(
            campaign_id=document.campaign_id,
            document=document,
            document_identifier=document.id,
            previous_storage_key=previous_storage_key if moved else "",
            storage_key=document.storage_key,
            operation=WorkspaceChange.Operation.MOVE if moved else WorkspaceChange.Operation.UPSERT,
            version=document.current_version,
            content_hash=digest,
            markdown=normalized,
        )
    write_current(document, normalized)
    project_document_links(document, metadata, body)
    if previous_storage_key and previous_storage_key != document.storage_key:
        old_path = storage_root() / previous_storage_key
        if old_path != storage_root() / document.storage_key:
            old_path.unlink(missing_ok=True)
    return document


def current_markdown_for_item(item: ArchiveItem) -> str:
    if item.document_id:
        return read_current(item.document)
    return serialize_document(metadata_for_item(item), getattr(item, "body", ""))


def ensure_item_document(item: ArchiveItem, user, reason: str = "Created") -> CampaignDocument:
    if item.document_id:
        return item.document
    metadata = metadata_for_item(item)
    markdown = serialize_document(metadata, getattr(item, "body", ""))
    doc = save_document(item.campaign, "archive_item", None, markdown, user, reason)
    item.document = doc
    item.save(update_fields=["document"])
    return doc


def item_document_output(item: ArchiveItem) -> dict[str, Any]:
    markdown = current_markdown_for_item(item)
    metadata, body = parse_document(markdown)
    document_backlinks = DocumentLink.objects.filter(
        campaign_id=item.campaign_id, target_type="item", target_identifier=item.id
    ).select_related("source_document")
    outgoing_relationships = item.outgoing_relationships.select_related("target").order_by("authored_position", "id")
    incoming_relationships = item.incoming_relationships.select_related("source").order_by("authored_position", "id")

    def summary(record: ArchiveItem) -> dict[str, Any]:
        return {"id": record.id, "title": record.title, "kind": record.kind, "status": record.status}

    return {
        "id": item.id,
        "campaign_id": item.campaign_id,
        "kind": item.kind,
        "markdown": markdown,
        "storage_key": item.document.storage_key if item.document_id else None,
        "html": markdown_html(body, item.campaign_id),
        "metadata": metadata,
        "title": metadata.get("title", item.title),
        "status": metadata.get("status", item.status),
        "version": item.document.current_version if item.document_id else item.version,
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
        "aliases": metadata.get("aliases", []),
        "tags": metadata.get("tags", []),
        "references": [
            {"id": r.id, "target_id": r.target_id, "label": r.label} for r in item.outgoing_references.all()
        ],
        "backlinks": [
            *[{"id": r.id, "source_id": r.source_id, "label": r.label} for r in item.incoming_references.all()],
            *[
                {
                    "id": link.id,
                    "source_id": link.source_identifier,
                    "source_type": link.source_document.document_type,
                    "label": link.label,
                    "context": link.context,
                }
                for link in document_backlinks
            ],
        ],
        "relationships": [
            {
                "id": r.edge_id,
                "source_id": r.source_id,
                "target_id": r.target_id,
                "target": summary(r.target),
                "kind": r.kind,
                "label": r.label,
                "inverse_label": r.inverse_label,
                "notes": r.notes,
                "authored_position": r.authored_position,
                "source_version": r.source_version,
            }
            for r in outgoing_relationships
        ],
        "incoming_relationships": [
            {
                "id": r.edge_id,
                "source_id": r.source_id,
                "target_id": r.target_id,
                "source": summary(r.source),
                "kind": r.kind,
                "label": r.label,
                "inverse_label": r.inverse_label,
                "notes": r.notes,
                "authored_position": r.authored_position,
                "source_version": r.source_version,
            }
            for r in incoming_relationships
        ],
    }


def markdown_html(value: str, campaign_id: Any | None = None) -> str:
    import html

    if MarkdownIt is not None:
        source = clean_body(value)
        if campaign_id is not None:

            def local_link(match: re.Match[str]) -> str:
                target_type, target_id = match.group(2), match.group(3)
                href = (
                    f"/campaigns/{campaign_id}/archive/items/{target_id}"
                    if target_type == "item"
                    else f"/campaigns/{campaign_id}/archive"
                )
                return f"[{match.group(1)}]({href})"

            source = CANONICAL_LINK_PATTERN.sub(local_link, source)
        return MarkdownIt("commonmark", {"html": False, "linkify": False}).disable("html").render(source)

    blocks = []
    for block in clean_body(value).split("\n\n"):
        lines = block.strip().splitlines()
        if not lines:
            continue
        if all(line.lstrip().startswith("- ") for line in lines):
            blocks.append("<ul>" + "".join(f"<li>{html.escape(line.lstrip()[2:])}</li>" for line in lines) + "</ul>")
            continue
        text = "<br>".join(html.escape(line) for line in lines)
        text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
        text = re.sub(r"^### (.+)$", r"<h3>\1</h3>", text)
        text = re.sub(r"^## (.+)$", r"<h2>\1</h2>", text)
        text = re.sub(r"^# (.+)$", r"<h1>\1</h1>", text)
        if campaign_id is not None:

            def render_link(match):
                target_type, target_id = match.group(2), match.group(3)
                href = (
                    f"/campaigns/{campaign_id}/archive/items/{target_id}"
                    if target_type == "item"
                    else f"/campaigns/{campaign_id}/archive"
                )
                return f'<a href="{href}">{match.group(1)}</a>'

            text = CANONICAL_LINK_PATTERN.sub(render_link, text)
        blocks.append(text if text.startswith("<h") else f"<p>{text}</p>")
    return "".join(blocks)
