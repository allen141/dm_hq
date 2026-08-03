from django.db.models.signals import pre_delete
from django.dispatch import receiver

from .models import CampaignDocument, WorkspaceChange


@receiver(pre_delete, sender=CampaignDocument)
def record_document_delete(sender, instance: CampaignDocument, **kwargs):
    if instance.document_type == "publication_entry":
        return
    WorkspaceChange.objects.create(
        campaign_id=instance.campaign_id,
        document_identifier=instance.id,
        storage_key=instance.storage_key,
        operation=WorkspaceChange.Operation.DELETE,
        version=instance.current_version,
        content_hash=instance.content_hash,
    )
