# DM HQ workspace CLI

The recommended installation is the container launcher. It requires Docker, but no host Python or pip. The launcher builds a Python 3.13 image on first use, stores credentials and workspaces in a host-mounted data directory, and routes all DM HQ API calls through the container.

On Unraid, from the repository checkout:

```text
export PATH="$PWD/tools/dmhq-workspace/bin:$PATH"
dmhq auth setup --base-url https://dmhq-preview.tylerallen.net
dmhq campaign list
dmhq workspace init --campaign <campaign-id>
cd /mnt/user/appdata/dm-hq/agent-workspaces/workspaces/<campaign-id>
dmhq skills install
dmhq sync
dmhq search harbor
dmhq validate
dmhq push
```

Run the launcher from the synchronized campaign workspace for commands that operate on local files. Set `DMHQ_DATA_ROOT` to choose another persistent host directory, `DMHQ_IMAGE` to choose an image tag, and `DMHQ_REBUILD=1` after changing the package. The default on Unraid is `/mnt/user/appdata/dm-hq/agent-workspaces`; other hosts use `$XDG_DATA_HOME/dm-hq` or `$HOME/.local/share/dm-hq`.

The guided setup logs in once, creates a personal agent token, and stores only that token locally. The password is never saved. For a token created elsewhere, use `dmhq auth add --base-url <url>`.

The direct Python package remains available for environments with Python 3.11 or newer:

```text
python -m pip install -e tools/dmhq-workspace
```
