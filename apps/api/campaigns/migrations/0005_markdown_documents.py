import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("campaigns", "0004_session_templates"),
    ]

    operations = [
        migrations.CreateModel(
            name="CampaignDocument",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "document_type",
                    models.CharField(
                        choices=[
                            ("campaign", "Campaign"),
                            ("archive_item", "Archive item"),
                            ("template", "Template"),
                            ("publication_entry", "Publication entry"),
                        ],
                        max_length=32,
                    ),
                ),
                ("storage_key", models.CharField(max_length=512, unique=True)),
                ("current_version", models.PositiveIntegerField(default=1)),
                ("content_hash", models.CharField(default="", max_length=64)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "campaign",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="documents", to="campaigns.campaign"
                    ),
                ),
            ],
            options={
                "indexes": [models.Index(fields=["campaign", "document_type"], name="campaigns_ca_campaig_1b5f4e_idx")]
            },
        ),
        migrations.CreateModel(
            name="CampaignDocumentVersion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("number", models.PositiveIntegerField()),
                ("markdown", models.TextField()),
                ("content_hash", models.CharField(max_length=64)),
                ("reason", models.CharField(blank=True, max_length=240)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "created_by",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL),
                ),
                (
                    "document",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="versions",
                        to="campaigns.campaigndocument",
                    ),
                ),
            ],
            options={"ordering": ["-number"]},
        ),
        migrations.AddConstraint(
            model_name="campaigndocumentversion",
            constraint=models.UniqueConstraint(fields=("document", "number"), name="unique_document_version"),
        ),
        migrations.AddField(
            model_name="campaign",
            name="document",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="campaign_owner",
                to="campaigns.campaigndocument",
            ),
        ),
        migrations.AddField(
            model_name="archiveitem",
            name="document",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="archive_item",
                to="campaigns.campaigndocument",
            ),
        ),
        migrations.AddField(
            model_name="templateversion",
            name="document",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="template_version_owner",
                to="campaigns.campaigndocument",
            ),
        ),
        migrations.AddField(
            model_name="publicationentry",
            name="document",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="publication_entry",
                to="campaigns.campaigndocument",
            ),
        ),
        migrations.AddField(model_name="itemrevision", name="markdown", field=models.TextField(blank=True, default="")),
        migrations.AddField(
            model_name="itemrevision", name="content_hash", field=models.CharField(default="", max_length=64)
        ),
    ]
