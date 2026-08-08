import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("campaigns", "0013_archive_relationship_graph")]

    operations = [
        migrations.AlterField(
            model_name="campaigndocument",
            name="document_type",
            field=models.CharField(
                choices=[
                    ("campaign", "Campaign"),
                    ("archive_item", "Archive item"),
                    ("template", "Template"),
                    ("publication_entry", "Publication entry"),
                    ("archive_view", "Archive view"),
                ],
                max_length=32,
            ),
        ),
        migrations.CreateModel(
            name="ArchiveView",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "view_type",
                    models.CharField(choices=[("map", "Map"), ("relationship", "Relationship")], max_length=20),
                ),
                ("title", models.CharField(max_length=200)),
                (
                    "status",
                    models.CharField(
                        choices=[("active", "Active"), ("archived", "Archived")], default="active", max_length=20
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "campaign",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="archive_views",
                        to="campaigns.campaign",
                    ),
                ),
                (
                    "document",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="archive_view",
                        to="campaigns.campaigndocument",
                    ),
                ),
            ],
            options={
                "ordering": ["title", "id"],
                "indexes": [
                    models.Index(fields=["campaign", "view_type", "status"], name="campaigns_a_campaig_19eeca_idx")
                ],
            },
        ),
    ]
