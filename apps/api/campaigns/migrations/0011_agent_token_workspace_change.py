from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


def backfill_workspace_changes(apps, schema_editor):
    CampaignDocument = apps.get_model("campaigns", "CampaignDocument")
    WorkspaceChange = apps.get_model("campaigns", "WorkspaceChange")
    for document in CampaignDocument.objects.exclude(document_type="publication_entry").iterator():
        version = document.versions.filter(number=document.current_version).first()
        WorkspaceChange.objects.create(
            campaign_id=document.campaign_id,
            document_identifier=document.id,
            storage_key=document.storage_key,
            operation="upsert",
            version=document.current_version,
            content_hash=document.content_hash,
            markdown=version.markdown if version else None,
        )


class Migration(migrations.Migration):
    dependencies = [("campaigns", "0010_delete_itemrevision")]

    operations = [
        migrations.CreateModel(
            name="AgentToken",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120)),
                ("token_hash", models.CharField(max_length=64, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_used_at", models.DateTimeField(blank=True, null=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="agent_tokens", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="WorkspaceChange",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("document_identifier", models.UUIDField()),
                ("storage_key", models.CharField(max_length=512)),
                ("operation", models.CharField(choices=[("upsert", "Upsert"), ("delete", "Delete")], max_length=12)),
                ("version", models.PositiveIntegerField(blank=True, null=True)),
                ("content_hash", models.CharField(blank=True, default="", max_length=64)),
                ("markdown", models.TextField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("campaign", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="workspace_changes", to="campaigns.campaign")),
                ("document", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="workspace_changes", to="campaigns.campaigndocument")),
            ],
            options={"indexes": [models.Index(fields=["campaign", "id"], name="campaigns_w_campaig_f6d6af_idx")]},
        ),
        migrations.RunPython(backfill_workspace_changes, migrations.RunPython.noop),
    ]
