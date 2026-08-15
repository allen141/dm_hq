import hashlib
import json
import re
import unicodedata
import uuid

import yaml
from django.db import migrations, transaction

MAX_SLUG = 80


def parse(markdown):
    text = markdown.replace("\r\n", "\n").strip() + "\n"
    if not text.startswith("---\n") or "\n---\n" not in text[4:]:
        raise ValueError("missing frontmatter")
    end = text.find("\n---\n", 4)
    metadata = yaml.safe_load(text[4:end])
    if not isinstance(metadata, dict):
        raise ValueError("frontmatter is not an object")
    return metadata, text[end + 6 :].strip()


def serialize(metadata, body):
    return "---\n" + json.dumps(metadata, indent=2, ensure_ascii=False) + "\n---\n\n" + body.strip() + "\n"


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def slugify(value, fallback="untitled"):
    raw = str(value or "").strip()
    value = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii").lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")[:MAX_SLUG].strip("-")
    return value or fallback


def short_id(value):
    return uuid.UUID(str(value)).hex[:8]


def forwards(apps, schema_editor):
    CampaignDocument = apps.get_model("campaigns", "CampaignDocument")
    CampaignDocumentVersion = apps.get_model("campaigns", "CampaignDocumentVersion")
    PublicationEntry = apps.get_model("campaigns", "PublicationEntry")

    plans = []
    errors = []
    expected_keys = {}

    documents = CampaignDocument.objects.filter(document_type="publication_entry").select_related("campaign")
    for document in documents.iterator():
        entry = (
            PublicationEntry.objects.filter(document_id=document.id)
            .select_related("version__publication", "item", "version__publication__campaign__document")
            .first()
        )
        versions = list(CampaignDocumentVersion.objects.filter(document_id=document.id).order_by("number"))
        if entry is None or not versions:
            errors.append(f"{document.id}: missing publication relation or document revision")
            continue

        try:
            campaign = entry.version.publication.campaign
            campaign_slug = campaign.name
            if campaign.document_id:
                campaign_version = CampaignDocumentVersion.objects.get(
                    document_id=campaign.document_id, number=campaign.document.current_version
                )
                campaign_metadata, _ = parse(campaign_version.markdown)
                campaign_slug = campaign_metadata.get("slug") or campaign_slug
            campaign_slug = slugify(campaign_slug)

            repaired_versions = []
            for version in versions:
                metadata, body = parse(version.markdown)
                metadata["publication_id"] = str(entry.version.publication_id)
                metadata["source_item_id"] = str(entry.item_id)
                metadata["version"] = entry.version.number
                repaired = serialize(metadata, body)
                repaired_versions.append((version, repaired, digest(repaired)))

            current = next((value for value in repaired_versions if value[0].number == document.current_version), None)
            if current is None:
                raise ValueError(f"missing current revision {document.current_version}")

            current_metadata, _ = parse(current[1])
            publication_slug = slugify(current_metadata.get("publication_slug") or "publication")
            item_slug = slugify(current_metadata.get("slug") or current_metadata.get("title"))
            expected_key = (
                f"campaigns/{campaign_slug}--{short_id(document.campaign_id)}/publications/"
                f"{publication_slug}--{short_id(entry.version.publication_id)}/v{entry.version.number}/"
                f"{item_slug}--{short_id(entry.item_id)}.md"
            )
            collision = expected_keys.get(expected_key)
            if collision and collision != document.id:
                raise ValueError(f"storage key collision with {collision}")
            expected_keys[expected_key] = document.id
            plans.append((document, repaired_versions, current))
        except (AttributeError, KeyError, TypeError, ValueError, yaml.YAMLError) as exc:
            errors.append(f"{document.id}: {exc}")

    if errors:
        raise RuntimeError("Publication metadata repair aborted; no data changed:\n" + "\n".join(errors))

    with transaction.atomic():
        for document, repaired_versions, current in plans:
            for version, repaired, repaired_hash in repaired_versions:
                version.markdown = repaired
                version.content_hash = repaired_hash
                version.save(update_fields=["markdown", "content_hash"])
            document.content_hash = current[2]
            document.search_text = current[1]
            document.save(update_fields=["content_hash", "search_text", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [("campaigns", "0014_archive_view")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
