from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("campaigns", "0009_rename_document_index")]
    operations = [migrations.DeleteModel(name="ItemRevision")]
