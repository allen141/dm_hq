import django.db.models.deletion
from django.db import migrations, models

SESSION_FIELDS = [
    {"key": "scheduled_for", "label": "Scheduled date", "type": "calendar_date", "required": False},
    {
        "key": "session_status",
        "label": "Session status",
        "type": "choice",
        "options": ["planned", "completed"],
        "required": True,
    },
    {"key": "outcome_text", "label": "Outcome", "type": "long_text", "required": False},
]


def seed_session_templates(apps, schema_editor):
    Campaign = apps.get_model("campaigns", "Campaign")
    SessionDetail = apps.get_model("campaigns", "SessionDetail")
    Template = apps.get_model("campaigns", "Template")
    TemplateVersion = apps.get_model("campaigns", "TemplateVersion")
    for campaign in Campaign.objects.all():
        template, _ = Template.objects.get_or_create(
            campaign_id=campaign.id, name="Session", defaults={"applies_to": "session"}
        )
        version, _ = TemplateVersion.objects.get_or_create(
            template_id=template.id, number=1, defaults={"fields": SESSION_FIELDS}
        )
        for detail in SessionDetail.objects.filter(item__campaign_id=campaign.id, template_version__isnull=True):
            detail.template_version_id = version.id
            detail.field_values = {
                "scheduled_for": detail.scheduled_for.isoformat() if detail.scheduled_for else "",
                "session_status": detail.session_status,
                "outcome_text": detail.outcome_text,
            }
            detail.save(update_fields=["template_version", "field_values"])


class Migration(migrations.Migration):
    dependencies = [("campaigns", "0003_publication_token_value")]

    operations = [
        migrations.AddField(
            model_name="sessiondetail",
            name="field_values",
            field=models.JSONField(default=dict),
        ),
        migrations.AddField(
            model_name="sessiondetail",
            name="template_version",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                to="campaigns.templateversion",
            ),
        ),
        migrations.RunPython(seed_session_templates, migrations.RunPython.noop),
    ]
