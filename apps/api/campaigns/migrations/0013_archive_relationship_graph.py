import uuid

import django.db.models.deletion
from django.db import migrations, models


def populate_relationship_ids(apps, schema_editor):
    Relationship = apps.get_model("campaigns", "Relationship")
    for relationship in Relationship.objects.filter(edge_id__isnull=True).iterator():
        relationship.edge_id = uuid.uuid4()
        relationship.save(update_fields=["edge_id"])


class Migration(migrations.Migration):
    dependencies = [("campaigns", "0012_slug_based_paths")]

    operations = [
        migrations.RenameField(
            model_name="relationship",
            old_name="reciprocal_label",
            new_name="inverse_label",
        ),
        migrations.AddField(
            model_name="relationship",
            name="edge_id",
            field=models.UUIDField(editable=False, null=True),
        ),
        migrations.AddField(
            model_name="relationship",
            name="label",
            field=models.CharField(blank=True, max_length=160),
        ),
        migrations.AlterField(
            model_name="relationship",
            name="inverse_label",
            field=models.CharField(blank=True, max_length=160),
        ),
        migrations.AddField(
            model_name="relationship",
            name="authored_position",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="relationship",
            name="source_version",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.RunPython(populate_relationship_ids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="relationship",
            name="edge_id",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.CreateModel(
            name="DocumentLink",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("source_identifier", models.UUIDField()),
                ("target_type", models.CharField(max_length=16)),
                ("target_identifier", models.UUIDField()),
                ("label", models.CharField(max_length=240)),
                ("context", models.TextField(blank=True)),
                ("authored_position", models.PositiveIntegerField(default=0)),
                (
                    "campaign",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="document_links",
                        to="campaigns.campaign",
                    ),
                ),
                (
                    "source_document",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="outgoing_links",
                        to="campaigns.campaigndocument",
                    ),
                ),
            ],
            options={"ordering": ["authored_position", "id"]},
        ),
    ]
