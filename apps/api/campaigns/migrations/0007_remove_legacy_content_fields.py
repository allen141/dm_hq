from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("campaigns", "0006_convert_content_to_markdown")]
    operations = [
        migrations.RemoveField(model_name="archiveitem", name="body"),
        migrations.RemoveField(model_name="entitydetail", name="field_values"),
        migrations.RemoveField(model_name="sessiondetail", name="field_values"),
        migrations.RemoveField(model_name="sessiondetail", name="scheduled_for"),
        migrations.RemoveField(model_name="sessiondetail", name="session_status"),
        migrations.RemoveField(model_name="sessiondetail", name="outcome_text"),
        migrations.RemoveField(model_name="templateversion", name="fields"),
        migrations.RemoveField(model_name="publicationentry", name="safe_title"),
        migrations.RemoveField(model_name="publicationentry", name="safe_body"),
        migrations.RemoveField(model_name="publicationentry", name="safe_fields"),
        migrations.RemoveField(model_name="itemrevision", name="snapshot"),
    ]
