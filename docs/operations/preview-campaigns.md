# Preview campaign copies

Preview has its own database, container network, and document mount. It can contain production campaign content without sharing production write access. Keep snapshot archives outside Git; they contain private DM material.

## Copy

Run `tools/preview/copy-campaigns.py` on the Docker host with an existing preview owner. The default is a read-only report. For example, these commands copy all campaigns into new snapshots:

```sh
python3 tools/preview/copy-campaigns.py --owner dm --output /tmp/dmhq-preview-snapshots
python3 tools/preview/copy-campaigns.py --owner dm --output /tmp/dmhq-preview-snapshots --apply
```

Use `--campaign UUID` to select one source campaign. The tool only supports `dmhq-production-api` to `dmhq-preview-api`. It checks separate networks and document mounts, uses PostgreSQL read-only source transactions, verifies that canonical documents already exist, and requires an existing active preview user. It never creates or copies authentication accounts.

Each apply creates a campaign with a timestamp in its name. Existing preview campaigns remain intact. The restore remaps document and campaign identities, navigation, relationships, views, and standard-block references. No production publication or public access token is restored. New campaigns have baseline revisions; original history remains in the private export archive.

The output directory contains the original production archive, sanitized preview archive, and source-to-preview UUID mapping. Files are created with mode 0600. Source content versions and hashes are compared before and after. Concurrent production edits can cause this comparison to fail; investigate and repeat the snapshot rather than overwriting either environment.

Copying is manual. There is no deployment hook that periodically replaces preview edits. Preview deployment still uses the established [delivery workflow](deployment.md).

## Recovery

To refresh data, run the copy again. A new campaign preserves earlier demo edits. To undo a demo conversion, restore the copied page’s baseline revision from History. To retain a demo through another snapshot, export the preview campaign separately before editing or deleting it.

Keep the original archives and mappings in a private backup location appropriate for the installation. `/tmp` is convenient for a short review session but does not survive all host maintenance. The tool refuses output inside its checkout. Delete only the unwanted preview campaign after reviewing its contents and backups; the copy command never deletes a campaign.

The standard-block format is optional frontmatter, so it requires no SQL migration. Revert authored revisions before running an older application if block content needs to remain readable there. DokuWiki is neither read nor written by this operator command.
