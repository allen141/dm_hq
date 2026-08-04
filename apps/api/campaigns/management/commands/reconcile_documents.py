from django.core.management.base import BaseCommand

from campaigns.documents import content_hash, parse_document, read_current, storage_key_for, storage_root, write_current
from campaigns.models import CampaignDocument


class Command(BaseCommand):
    help = "Verify current campaign Markdown files and repair missing or stale materializations from SQL."

    def handle(self, *args, **options):
        repaired = 0
        failures = []
        for document in CampaignDocument.objects.all().iterator():
            try:
                expected = document.versions.get(number=document.current_version)
                path_value = read_current(document)
                metadata, _ = parse_document(expected.markdown)
                expected_key = storage_key_for(document.campaign, document.document_type, metadata)
                path_changed = expected_key != document.storage_key
                old_key = document.storage_key
                if path_changed:
                    document.storage_key = expected_key
                if (
                    path_changed
                    or content_hash(path_value) != expected.content_hash
                    or document.content_hash != expected.content_hash
                ):
                    write_current(document, expected.markdown)
                    if path_changed:
                        (storage_root() / old_key).unlink(missing_ok=True)
                    document.content_hash = expected.content_hash
                    document.search_text = expected.markdown
                    document.save(update_fields=["storage_key", "content_hash", "search_text", "updated_at"])
                    repaired += 1
            except Exception as exc:  # report every document so deployment can fail loudly
                failures.append(f"{document.id}: {exc}")
        self.stdout.write(
            self.style.SUCCESS(f"Verified {CampaignDocument.objects.count()} documents; repaired {repaired}.")
        )
        if failures:
            for failure in failures:
                self.stderr.write(failure)
            raise SystemExit(1)
