from __future__ import annotations

import hashlib
import json
import os
import re
import unicodedata
import uuid
from pathlib import Path

from django.conf import settings
from django.db import migrations, models, transaction

MAX_SLUG = 80


def slugify(value, fallback="untitled"):
    raw = str(value or "").strip()
    value = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii").lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")[:MAX_SLUG].strip("-")
    return value or fallback


def parse(markdown):
    text = markdown.replace("\r\n", "\n").strip() + "\n"
    if not text.startswith("---\n") or "\n---\n" not in text[4:]:
        raise ValueError("missing frontmatter")
    end = text.find("\n---\n", 4)
    raw = text[4:end]
    try:
        metadata = json.loads(raw)
    except json.JSONDecodeError:
        metadata = {}
        for line in raw.splitlines():
            if ":" in line and not line.startswith(" "):
                key, value = line.split(":", 1)
                metadata[key.strip()] = value.strip().strip("\"'")
    if not isinstance(metadata, dict):
        raise ValueError("frontmatter is not an object")
    return metadata, text[end + 6 :].strip()


def serialize(metadata, body):
    return "---\n" + json.dumps(metadata, indent=2, ensure_ascii=False) + "\n---\n\n" + body.strip() + "\n"


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def short_id(value):
    return uuid.UUID(str(value)).hex[:8]


def campaign_segment(campaign, slug):
    return f"{slugify(slug or campaign.name)}--{short_id(campaign.id)}"


def path_for(campaign, document_type, metadata, relation):
    segment = campaign_segment(campaign, metadata.get("campaign_slug"))
    slug = slugify(metadata.get("slug") or metadata.get("title") or metadata.get("name"))
    if document_type == "campaign":
        return f"campaigns/{segment}/campaign.md"
    if document_type == "archive_item":
        return f"campaigns/{segment}/items/{slug}--{short_id(relation.id)}.md"
    if document_type == "template":
        return f"campaigns/{segment}/templates/{slug}--{short_id(relation.template_id)}/v{relation.number}.md"
    publication = relation.version.publication_id
    return f"campaigns/{segment}/publications/publication--{short_id(publication)}/v{relation.version.number}/{slug}--{short_id(relation.item_id)}.md"


def materialize(root, key, value):
    path = root / key
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.migration.tmp")
    temp.write_text(value, encoding="utf-8")
    with temp.open("rb") as handle:
        os.fsync(handle.fileno())
    os.replace(temp, path)


def forwards(apps, schema_editor):
    Campaign = apps.get_model("campaigns", "Campaign")
    ArchiveItem = apps.get_model("campaigns", "ArchiveItem")
    CampaignDocument = apps.get_model("campaigns", "CampaignDocument")
    CampaignDocumentVersion = apps.get_model("campaigns", "CampaignDocumentVersion")
    TemplateVersion = apps.get_model("campaigns", "TemplateVersion")
    PublicationEntry = apps.get_model("campaigns", "PublicationEntry")
    WorkspaceChange = apps.get_model("campaigns", "WorkspaceChange")
    root = Path(getattr(settings, "DM_HQ_DOCUMENT_ROOT", Path(settings.BASE_DIR) / "documents"))
    documents = list(CampaignDocument.objects.select_related("campaign").all())
    plans = []
    errors = []
    keys = {}
    campaign_slugs = {}
    for doc in documents:
        campaign = doc.campaign
        relation = (
            Campaign.objects.filter(document_id=doc.id).first()
            or ArchiveItem.objects.filter(document_id=doc.id).first()
            or TemplateVersion.objects.filter(document_id=doc.id).first()
            or PublicationEntry.objects.select_related("version__publication").filter(document_id=doc.id).first()
        )
        version = CampaignDocumentVersion.objects.filter(document_id=doc.id, number=doc.current_version).first()
        if relation is None or version is None:
            errors.append(f"{doc.id}: missing relation or current version")
            continue
        if not (root / doc.storage_key).exists():
            errors.append(f"{doc.id}: current file is missing ({doc.storage_key})")
            continue
        try:
            metadata, body = parse(version.markdown)
            source = metadata.get("title") or metadata.get("name") or getattr(relation, "title", None) or getattr(relation, "name", None) or "untitled"
            stable_slug = slugify(metadata.get("slug") or source)
            metadata["slug"] = stable_slug
            metadata["campaign_id"] = str(campaign.id)
            campaign_slug = campaign_slugs.setdefault(campaign.id, slugify(campaign.name))
            metadata["campaign_slug"] = campaign_slug
            key = path_for(campaign, doc.document_type, metadata, relation)
            metadata.pop("campaign_slug", None)
            current = serialize(metadata, body)
            if key in keys and keys[key] != doc.id:
                errors.append(f"{doc.id}: storage key collision with {keys[key]}")
                continue
            keys[key] = doc.id
            plans.append((doc, relation, stable_slug, key, current))
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            errors.append(f"{doc.id}: {exc}")
    if errors:
        raise RuntimeError("Slug migration aborted; no data changed:\n" + "\n".join(errors))
    with transaction.atomic():
        for doc, _relation, stable_slug, key, current in plans:
            old_key = doc.storage_key
            for version in CampaignDocumentVersion.objects.filter(document_id=doc.id):
                metadata, body = parse(version.markdown)
                metadata["slug"] = stable_slug
                metadata["campaign_id"] = str(doc.campaign_id)
                value = serialize(metadata, body)
                version.markdown = value
                version.content_hash = digest(value)
                version.save(update_fields=["markdown", "content_hash"])
            doc.storage_key = key
            doc.content_hash = digest(current)
            doc.search_text = current
            doc.save(update_fields=["storage_key", "content_hash", "search_text", "updated_at"])
            materialize(root, key, current)
            if old_key != key:
                old_path = root / old_key
                if old_path != root / key:
                    old_path.unlink(missing_ok=True)
            if doc.document_type != "publication_entry":
                latest = CampaignDocumentVersion.objects.filter(document_id=doc.id, number=doc.current_version).first()
                WorkspaceChange.objects.create(
                    campaign_id=doc.campaign_id,
                    document_id=doc.id,
                    document_identifier=doc.id,
                    previous_storage_key=old_key if old_key != key else "",
                    storage_key=key,
                    operation="move" if old_key != key else "upsert",
                    version=doc.current_version,
                    content_hash=doc.content_hash,
                    markdown=latest.markdown if latest else current,
                )


class Migration(migrations.Migration):
    dependencies = [("campaigns", "0011_agent_token_workspace_change")]
    operations = [
        migrations.AddField(
            model_name="workspacechange",
            name="previous_storage_key",
            field=models.CharField(blank=True, default="", max_length=512),
        ),
        migrations.AlterField(
            model_name="workspacechange",
            name="operation",
            field=models.CharField(choices=[("upsert", "Upsert"), ("move", "Move"), ("delete", "Delete")], max_length=12),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
