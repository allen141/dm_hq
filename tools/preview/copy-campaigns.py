#!/usr/bin/env python3
"""Copy production campaign documents to NEW preview campaigns, never accounts or publications.

Run on the Docker host. Default is a read-only report. Backups and mappings contain private
campaign content and must be written outside the checkout. See docs/operations/preview-campaigns.md.
"""

import argparse
import base64
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import zipfile

BOOT = "import os; os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings'); import django; django.setup();\n"
READ = (
    BOOT
    + """
import base64, hashlib, json, sys
from django.db import connection, transaction
from campaigns.api import export_campaign
from campaigns.models import Campaign
from campaigns.documents import read_current
identifier = sys.argv[1]
with transaction.atomic():
    if connection.vendor != 'postgresql':
        raise RuntimeError('Production inspection requires PostgreSQL read-only transactions')
    with connection.cursor() as cursor:
        cursor.execute('SET TRANSACTION READ ONLY')
    campaigns = Campaign.objects.filter(id=identifier) if identifier != 'all' else Campaign.objects.all().order_by('id')
    result = []
    for campaign in campaigns:
        if not campaign.document_id or campaign.archive_items.filter(document__isnull=True).exists():
            raise RuntimeError('Materialize legacy documents separately before taking a read-only snapshot')
        documents = list(campaign.documents.order_by('id'))
        digest = hashlib.sha256()
        for document in documents:
            digest.update(json.dumps([str(document.id), document.current_version, document.content_hash], separators=(',', ':')).encode())
            digest.update(read_current(document).encode())
        row = dict(id=str(campaign.id), name=campaign.name, items=campaign.archive_items.count(), documents=len(documents), digest=digest.hexdigest())
        if sys.argv[2] == 'export':
            row['archive'] = base64.b64encode(export_campaign(campaign)).decode()
        result.append(row)
    if not result:
        raise RuntimeError('Source campaign does not exist')
    print(json.dumps(result))
"""
)
WRITE = (
    BOOT
    + """
import io, json, sys
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client
from campaigns.models import Campaign
from campaigns.documents import parse_document, read_current
user = get_user_model().objects.get(username=sys.argv[1], is_active=True)
client = Client(enforce_csrf_checks=True)
client.force_login(user)
host = next(host for host in settings.ALLOWED_HOSTS if host != '*')
kwargs = dict(HTTP_HOST=host, secure=True, HTTP_ORIGIN='https://' + host)
csrf = client.get('/api/v1/auth/csrf', **kwargs).cookies['csrftoken'].value
response = client.post('/api/v1/exports/restore', {'archive': SimpleUploadedFile('snapshot.zip', sys.stdin.buffer.read(), content_type='application/zip')}, HTTP_X_CSRFTOKEN=csrf, **kwargs)
if response.status_code != 200:
    raise RuntimeError('Preview restore failed: ' + response.content.decode()[:2000])
result = response.json()
campaign = Campaign.objects.get(id=result['id'])
mapping = {}
for document in campaign.documents.all():
    metadata, _ = parse_document(read_current(document))
    source_id = metadata.get('preview_snapshot_source_id')
    if source_id:
        mapping[source_id] = metadata['id']
client.logout()
print(json.dumps(dict(campaign_id=str(campaign.id), name=campaign.name, owner=user.username, mapping=mapping, items=campaign.archive_items.count(), publications=campaign.publications.count())))
"""
)
CHECK_USER = (
    BOOT
    + "from django.contrib.auth import get_user_model; import sys; assert get_user_model().objects.filter(username=sys.argv[1], is_active=True).exists(), 'Preview owner must already exist'"
)


def docker_python(container, code, *args, data=None):
    result = subprocess.run(
        ["docker", "exec", "-i", container, "python", "-c", code, *args],
        input=data,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.decode()[-3000:])
    return result.stdout


def isolation(source, target):
    if source != "dmhq-production-api" or target != "dmhq-preview-api":
        raise ValueError("This operator tool only supports dmhq-production-api → dmhq-preview-api")
    info = json.loads(subprocess.check_output(["docker", "inspect", source, target]))
    if any(not container["State"]["Running"] for container in info):
        raise ValueError("Both API containers must be running")
    networks = [set(container["NetworkSettings"]["Networks"]) for container in info]
    if networks[0] & networks[1]:
        raise ValueError("Production and preview must have separate container networks")
    documents = [
        {mount["Source"] for mount in container["Mounts"] if mount["Destination"] == "/var/lib/dm-hq/documents"}
        for container in info
    ]
    if not all(documents) or documents[0] & documents[1]:
        raise ValueError("Production and preview must have separate document mounts")


def staged_archive(raw, timestamp, source, name):
    # Metadata is JSON when exported by DM HQ. Preserve body and all other source fields.
    output = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(raw)) as original, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as staged:
        manifest = json.loads(original.read("manifest.json"))
        manifest["publications"] = []
        kept = {}
        for filename in original.namelist():
            if not filename.startswith("campaigns/") or not filename.endswith(".md") or "/publications/" in filename:
                continue
            text = original.read(filename).decode()
            if not text.startswith("---\n"):
                raise ValueError("Exported document has no frontmatter")
            frontmatter, body = text[4:].split("\n---\n", 1)
            metadata = json.loads(frontmatter)
            metadata["preview_snapshot_source_id"] = metadata["id"]
            if metadata["document_type"] == "campaign":
                metadata["title"] = name + " · Preview snapshot " + timestamp
                metadata["preview_snapshot"] = dict(
                    source_campaign_id=source["id"], source_digest=source["digest"], captured_at=timestamp
                )
            staged.writestr(filename, "---\n" + json.dumps(metadata, indent=2, ensure_ascii=False) + "\n---\n" + body)
            kept[str(metadata["id"])] = filename
        manifest["documents"] = kept
        staged.writestr("manifest.json", json.dumps(manifest, indent=2))
    return output.getvalue()


def private_write(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--campaign", default="all", help="Source campaign UUID; default all")
    parser.add_argument("--owner", default="dm", help="Existing preview username")
    parser.add_argument("--output", type=Path, required=True, help="Private backup directory OUTSIDE the checkout")
    parser.add_argument("--apply", action="store_true", help="Create a fresh snapshot for each campaign")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    destination = args.output.resolve()
    if destination == root or root in destination.parents:
        parser.error("Snapshot artifacts must stay outside the checkout")
    isolation("dmhq-production-api", "dmhq-preview-api")
    docker_python("dmhq-preview-api", CHECK_USER, args.owner)
    report = json.loads(docker_python("dmhq-production-api", READ, args.campaign, "report"))
    print(json.dumps(dict(mode="apply" if args.apply else "dry-run", owner=args.owner, campaigns=report), indent=2))
    if not args.apply:
        return
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    exports = json.loads(docker_python("dmhq-production-api", READ, args.campaign, "export"))
    for source in exports:
        raw = base64.b64decode(source.pop("archive"))
        prefix = destination / (source["id"] + "-" + timestamp)
        # Keep original history privately before restoring the current document snapshot.
        private_write(str(prefix) + "-production.zip", raw)
        staged = staged_archive(raw, timestamp, source, source["name"])
        private_write(str(prefix) + "-preview.zip", staged)
        result = json.loads(docker_python("dmhq-preview-api", WRITE, args.owner, data=staged))
        if result["items"] != source["items"] or result["publications"] != 0:
            raise RuntimeError("Snapshot verification failed; inspect mapping and the new campaign before proceeding")
        private_write(str(prefix) + "-mapping.json", json.dumps(dict(source=source, preview=result), indent=2).encode())
        print(
            json.dumps(
                dict(
                    source_campaign_id=source["id"],
                    preview_campaign_id=result["campaign_id"],
                    items=result["items"],
                    mapping_file=str(prefix) + "-mapping.json",
                )
            )
        )
    after = json.loads(docker_python("dmhq-production-api", READ, args.campaign, "report"))
    if after != report:
        raise RuntimeError(
            "Production changed during the snapshot. Investigate concurrent edits; no source writes were requested."
        )
    print("Production content versions and hashes unchanged. Existing preview campaigns retained.")


if __name__ == "__main__":
    main()
