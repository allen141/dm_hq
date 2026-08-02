import hashlib
import html
import io
import json
import re
import secrets
import zipfile
from typing import Any

from .models import (
    ArchiveItem,
    ItemRevision,
    Publication,
    PublicationEntry,
    Relationship,
    SessionLink,
    Template,
    TemplateVersion,
)

PERSON_FIELDS = [
    {"key": "species", "label": "Species", "type": "short_text", "required": False},
    {"key": "alignment", "label": "Alignment", "type": "short_text", "required": False},
    {"key": "class", "label": "Class", "type": "short_text", "required": False},
    {"key": "level", "label": "Level", "type": "number", "required": False},
    {"key": "armor_class", "label": "Armor Class", "type": "number", "required": False},
    {"key": "hit_points", "label": "Hit points", "type": "number", "required": False},
    {"key": "speed", "label": "Speed", "type": "number", "required": False},
    {"key": "ability_scores", "label": "Ability scores", "type": "long_text", "required": False},
]


def ensure_person_template(campaign):
    template, _ = Template.objects.get_or_create(
        campaign=campaign, name="Person / NPC", defaults={"applies_to": "entity"}
    )
    TemplateVersion.objects.get_or_create(template=template, number=1, defaults={"fields": PERSON_FIELDS})
    return template


def clean_markdown(value: str) -> str:
    # Markdown is stored as source text. Remove HTML tags before rendering so raw markup cannot execute.
    return re.sub(r"<[^>]*>", "", value or "")


def markdown_html(value: str) -> str:
    blocks = []
    for block in clean_markdown(value).split("\n\n"):
        lines = block.strip().splitlines()
        if not lines:
            continue
        if all(line.lstrip().startswith("- ") for line in lines):
            body = "".join(f"<li>{html.escape(line.lstrip()[2:])}</li>" for line in lines)
            blocks.append(f"<ul>{body}</ul>")
            continue
        text = "<br>".join(html.escape(line) for line in lines)
        text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
        text = re.sub(r"^### (.+)$", r"<h3>\1</h3>", text)
        text = re.sub(r"^## (.+)$", r"<h2>\1</h2>", text)
        text = re.sub(r"^# (.+)$", r"<h1>\1</h1>", text)
        blocks.append(text if text.startswith("<h") else f"<p>{text}</p>")
    return "".join(blocks)


def item_snapshot(item: ArchiveItem) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": str(item.id),
        "kind": item.kind,
        "title": item.title,
        "body": item.body,
        "status": item.status,
        "version": item.version,
        "aliases": list(item.aliases.values_list("value", flat=True)),
        "tags": list(item.item_tags.select_related("tag").values_list("tag__name", flat=True)),
    }
    if item.kind == ArchiveItem.Kind.ENTITY and hasattr(item, "entity_detail"):
        detail = item.entity_detail
        data["entity"] = {
            "subject_type": detail.subject_type,
            "template_id": str(detail.template_version.template_id) if detail.template_version else None,
            "template_version": detail.template_version.number if detail.template_version else None,
            "fields": detail.field_values,
        }
    if item.kind == ArchiveItem.Kind.SESSION and hasattr(item, "session_detail"):
        detail = item.session_detail
        data["session"] = {
            "scheduled_for": detail.scheduled_for.isoformat() if detail.scheduled_for else None,
            "session_status": detail.session_status,
            "outcome_text": detail.outcome_text,
        }
    data["references"] = list(item.outgoing_references.values("target_id", "label"))
    return data


def record_revision(item: ArchiveItem, user, reason: str = "") -> ItemRevision:
    return ItemRevision.objects.create(
        item=item, number=item.version, snapshot=item_snapshot(item), created_by=user, reason=reason
    )


def random_publication_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    return token, hashlib.sha256(token.encode()).hexdigest()


def publication_url(publication: Publication) -> str | None:
    if not publication.token_value:
        return None
    return f"/p/{publication.token_value}"


def publication_output(publication: Publication, include_token: str | None = None) -> dict[str, Any]:
    version = publication.versions.get(number=publication.current_version)
    result: dict[str, Any] = {
        "id": publication.id,
        "status": publication.status,
        "version": version.number,
        "created_at": publication.created_at.isoformat(),
        "updated_at": publication.updated_at.isoformat(),
        "entries": [
            {
                "item_id": entry.item_id,
                "title": entry.safe_title,
                "body": entry.safe_body,
                "html": markdown_html(entry.safe_body),
                "fields": entry.safe_fields,
            }
            for entry in version.entries.all()
        ],
    }
    if include_token:
        result["token"] = include_token
    return result


def export_campaign(campaign) -> bytes:
    data: dict[str, Any] = {
        "format": "dm-hq-archive",
        "version": 1,
        "campaign": {"id": str(campaign.id), "name": campaign.name},
        "items": [item_snapshot(item) for item in campaign.archive_items.all()],
        "templates": [
            {
                "id": str(template.id),
                "name": template.name,
                "applies_to": template.applies_to,
                "versions": list(template.versions.values("number", "fields")),
            }
            for template in campaign.templates.prefetch_related("versions")
        ],
        "relationships": list(
            Relationship.objects.filter(source__campaign=campaign).values(
                "source_id", "target_id", "kind", "reciprocal_label", "notes"
            )
        ),
        "sessions": list(SessionLink.objects.filter(session__campaign=campaign).values("session_id", "item_id")),
        "revisions": [
            {
                "item_id": str(revision.item_id),
                "number": revision.number,
                "snapshot": revision.snapshot,
                "reason": revision.reason,
            }
            for revision in ItemRevision.objects.filter(item__campaign=campaign)
        ],
        "publications": [
            {
                "id": str(publication.id),
                "status": publication.status,
                "version": publication.current_version,
                "entries": list(
                    PublicationEntry.objects.filter(
                        version__publication=publication, version__number=publication.current_version
                    ).values("item_id", "safe_title", "safe_body", "safe_fields")
                ),
            }
            for publication in campaign.publications.all()
        ],
    }
    markdown = "\n\n".join(f"# {item['title']}\n\n{item['body']}" for item in data["items"])
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps({"format": data["format"], "version": data["version"]}, indent=2))
        archive.writestr("campaign.json", json.dumps(data, indent=2, default=str))
        archive.writestr("campaign.md", markdown)
    return output.getvalue()


def read_export(payload: bytes) -> dict[str, Any]:
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        if manifest != {"format": "dm-hq-archive", "version": 1}:
            raise ValueError("Unsupported archive manifest")
        return json.loads(archive.read("campaign.json"))
