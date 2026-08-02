import hashlib
import json
import os
from pathlib import Path

from django.conf import settings
from django.db import migrations, transaction


def markdown(metadata, body=""):
    return "---\n" + json.dumps(metadata, indent=2, sort_keys=True, ensure_ascii=False) + "\n---\n\n" + (body or "")


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def materialize(doc, value):
    root = Path(getattr(settings, "DM_HQ_DOCUMENT_ROOT", Path(settings.BASE_DIR) / "documents"))
    path = root / doc.storage_key
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".migration.tmp")
    tmp.write_text(value, encoding="utf-8")
    os.replace(tmp, path)


def create_version(Document, Version, campaign, document_type, key, value, actor, relation=None):
    doc = Document.objects.create(campaign_id=campaign.id, document_type=document_type, storage_key=key, current_version=1, content_hash=digest(value))
    Version.objects.create(document_id=doc.id, number=1, markdown=value, content_hash=doc.content_hash, created_by_id=actor.id, reason="Replacement migration")
    materialize(doc, value)
    if relation is not None:
        relation.document_id = doc.id
        relation.save(update_fields=["document"])
    return doc


def convert(apps, schema_editor):
    Campaign = apps.get_model("campaigns", "Campaign")
    ArchiveItem = apps.get_model("campaigns", "ArchiveItem")
    CampaignDocument = apps.get_model("campaigns", "CampaignDocument")
    CampaignDocumentVersion = apps.get_model("campaigns", "CampaignDocumentVersion")
    TemplateVersion = apps.get_model("campaigns", "TemplateVersion")
    PublicationEntry = apps.get_model("campaigns", "PublicationEntry")
    for campaign in Campaign.objects.select_related("owner").all():
        with transaction.atomic():
            if not campaign.document_id:
                value = markdown({"document_type": "campaign", "id": str(campaign.id), "campaign_id": str(campaign.id), "title": campaign.name})
                create_version(CampaignDocument, CampaignDocumentVersion, campaign, "campaign", f"campaigns/{campaign.id}/campaign.md", value, campaign.owner, relation=campaign)
            for item in ArchiveItem.objects.filter(campaign_id=campaign.id).all():
                if item.document_id:
                    continue
                metadata = {"document_type": "archive_item", "id": str(item.id), "campaign_id": str(campaign.id), "kind": item.kind, "title": item.title, "status": item.status, "aliases": list(item.aliases.values_list("value", flat=True)), "tags": list(item.item_tags.values_list("tag__name", flat=True)), "references": [{"target_id": str(r.target_id), "label": r.label} for r in item.outgoing_references.all()], "relationships": [{"target_id": str(r.target_id), "kind": r.kind, "reciprocal_label": r.reciprocal_label, "notes": r.notes} for r in item.outgoing_relationships.all()]}
                if hasattr(item, "entity_detail"):
                    detail = item.entity_detail
                    metadata["subject_type"] = detail.subject_type
                    metadata["fields"] = detail.field_values or {}
                    if detail.template_version_id:
                        metadata["template"] = {"id": str(detail.template_version.template_id), "version": detail.template_version.number}
                if hasattr(item, "session_detail"):
                    detail = item.session_detail
                    values = dict(detail.field_values or {})
                    values.setdefault("scheduled_for", detail.scheduled_for.isoformat() if detail.scheduled_for else "")
                    values.setdefault("session_status", detail.session_status)
                    values.setdefault("outcome_text", detail.outcome_text)
                    metadata["fields"] = values
                    if detail.template_version_id:
                        metadata["template"] = {"id": str(detail.template_version.template_id), "version": detail.template_version.number}
                value = markdown(metadata, item.body)
                create_version(CampaignDocument, CampaignDocumentVersion, campaign, "archive_item", f"campaigns/{campaign.id}/items/{item.id}.md", value, campaign.owner, relation=item)
            for version in TemplateVersion.objects.filter(template__campaign_id=campaign.id).select_related("template").all():
                if version.document_id:
                    continue
                metadata = {"document_type": "template", "id": str(uuid.uuid4()), "campaign_id": str(campaign.id), "template_id": str(version.template_id), "version": version.number, "name": version.template.name, "applies_to": version.template.applies_to, "fields": version.fields or []}
                value = markdown(metadata)
                create_version(CampaignDocument, CampaignDocumentVersion, campaign, "template", f"campaigns/{campaign.id}/templates/{version.template_id}/v{version.number}.md", value, campaign.owner, relation=version)
            for entry in PublicationEntry.objects.filter(version__publication__campaign_id=campaign.id).select_related("version__publication", "item").all():
                if entry.document_id:
                    continue
                metadata = {"document_type": "publication_entry", "id": str(uuid.uuid4()), "campaign_id": str(campaign.id), "source_item_id": str(entry.item_id), "title": entry.safe_title, "fields": entry.safe_fields or {}, "status": "published"}
                value = markdown(metadata, entry.safe_body)
                key = f"campaigns/{campaign.id}/publications/{entry.version.publication_id}/v{entry.version.number}/{entry.item_id}.md"
                create_version(CampaignDocument, CampaignDocumentVersion, campaign, "publication_entry", key, value, campaign.owner, relation=entry)


class Migration(migrations.Migration):
    dependencies = [("campaigns", "0005_markdown_documents")]
    operations = [migrations.RunPython(convert, migrations.RunPython.noop)]
