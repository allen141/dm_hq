# DM HQ workspace CLI

Install locally with `python -m pip install -e tools/dmhq-workspace`. Create a personal agent token in DM HQ, then run:

```text
dmhq auth add --base-url http://127.0.0.1:8000
dmhq workspace init --campaign <campaign-id>
cd <workspace-path>
dmhq sync
dmhq search harbor
dmhq validate
dmhq push
```

The CLI stores the Markdown cache in the platform user-data directory by default. Set `DMHQ_DATA_ROOT` or pass `--workspace-root` to override it.
