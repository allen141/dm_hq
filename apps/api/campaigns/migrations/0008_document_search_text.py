from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("campaigns", "0007_remove_legacy_content_fields")]
    operations = [
        migrations.AddField(
            model_name="campaigndocument", name="search_text", field=models.TextField(blank=True, default="")
        )
    ]
