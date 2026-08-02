from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
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
    ItemTag,
    Reference,
    Relationship,
    SessionLink,
    Tag,
    TemplateVersion,
)


class DocumentError(ValueError):
    pass


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
        metadata = json.loads(raw)
        if not isinstance(metadata, dict):
            raise ValueError
    except (json.JSONDecodeError, ValueError):
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


def safe_publication_markdown(markdown: str, campaign_id: Any, source_item_id: Any) -> str:
    metadata, body = parse_document(markdown)
    safe_metadata = {
        "document_type": "publication_entry",
        "id": str(uuid.uuid4()),
        "campaign_id": str(campaign_id),
        "source_item_id": str(source_item_id),
        "title": str(metadata.get("title") or "Untitled"),
    }
    return serialize_document(safe_metadata, body)


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
        {"target_id": str(r.target_id), "kind": r.kind, "reciprocal_label": r.reciprocal_label, "notes": r.notes}
        for r in item.outgoing_relationships.all()
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
    for rel in metadata.get("relationships", []):
        target = ArchiveItem.objects.filter(id=rel.get("target_id"), campaign=item.campaign).first()
        if target:
            Relationship.objects.create(
                source=item,
                target=target,
                kind=str(rel.get("kind") or "related_to"),
                reciprocal_label=str(rel.get("reciprocal_label") or ""),
                notes=str(rel.get("notes") or ""),
            )
    if item.kind == ArchiveItem.Kind.SESSION:
        item.session_links.all().delete()
        for target_id in metadata.get("session_links", []):
            target = ArchiveItem.objects.filter(id=target_id, campaign=item.campaign).first()
            if target:
                SessionLink.objects.get_or_create(session=item, item=target)


@transaction.atomic
def validate_metadata(metadata: dict[str, Any], document_type: str, campaign_id: Any) -> None:
    required = {"document_type", "id", "campaign_id"}
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
    if item.kind == "entity":
        metadata.setdefault(
            "subject_type",
            getattr(getattr(item, "entity_detail", None), "subject_type", "person"),
        )
    validate_metadata(metadata, "archive_item", item.campaign_id)
    if metadata.get("kind") != item.kind:
        raise DocumentError("Document kind does not match item")
    return serialize_document(metadata, clean_body(body))


def save_document(
    campaign,
    document_type: str,
    storage_key: str,
    markdown: str,
    user,
    reason: str = "",
    expected_version: int | None = None,
    document: CampaignDocument | None = None,
) -> CampaignDocument:
    metadata, body = parse_document(markdown)
    validate_metadata(metadata, document_type, campaign.id)
    if document is None:
        document = CampaignDocument.objects.create(
            campaign=campaign, document_type=document_type, storage_key=storage_key, current_version=0
        )
    else:
        document = CampaignDocument.objects.select_for_update().get(id=document.id)
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
    document.save(update_fields=["current_version", "content_hash", "search_text", "updated_at"])
    write_current(document, normalized)
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
    doc = save_document(
        item.campaign, "archive_item", f"campaigns/{item.campaign_id}/items/{item.id}.md", markdown, user, reason
    )
    item.document = doc
    item.save(update_fields=["document"])
    return doc


def item_document_output(item: ArchiveItem) -> dict[str, Any]:
    markdown = current_markdown_for_item(item)
    metadata, body = parse_document(markdown)
    return {
        "id": item.id,
        "campaign_id": item.campaign_id,
        "kind": item.kind,
        "markdown": markdown,
        "html": markdown_html(body),
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
        "backlinks": [{"id": r.id, "source_id": r.source_id, "label": r.label} for r in item.incoming_references.all()],
        "relationships": [
            {"id": r.id, "target_id": r.target_id, "kind": r.kind, "label": r.reciprocal_label, "notes": r.notes}
            for r in item.outgoing_relationships.all()
        ],
        "incoming_relationships": [
            {"id": r.id, "source_id": r.source_id, "kind": r.kind, "label": r.reciprocal_label, "notes": r.notes}
            for r in item.incoming_relationships.all()
        ],
    }


def markdown_html(value: str) -> str:
    import html

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
        blocks.append(text if text.startswith("<h") else f"<p>{text}</p>")
    return "".join(blocks)
