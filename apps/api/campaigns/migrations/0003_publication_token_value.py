from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("campaigns", "0002_archiveitem_alias_itemrevision_publication_and_more")]

    operations = [
        migrations.AddField(
            model_name="publication",
            name="token_value",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
    ]
