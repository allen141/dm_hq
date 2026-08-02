from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("campaigns", "0008_document_search_text")]
    operations = [
        migrations.RenameIndex(
            model_name="campaigndocument",
            old_name="campaigns_ca_campaig_1b5f4e_idx",
            new_name="campaigns_c_campaig_678a7e_idx",
        )
    ]
