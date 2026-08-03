from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .client import ApiError
from .storage import profiles, prompt_token, save_profile, token_for
from .workspace import Workspace, WorkspaceError


def workspace_from_args(args) -> Workspace:
    root = Path(args.workspace).expanduser() if getattr(args, "workspace", None) else Path.cwd()
    return Workspace(root)


def cmd_auth(args) -> int:
    if args.auth_command == "add":
        token = args.token or prompt_token()
        save_profile(args.base_url, token)
        print(f"Saved DM HQ profile for {args.base_url.rstrip('/')}")
        return 0
    if args.auth_command == "list":
        print(json.dumps([{"profile": key, **value} for key, value in profiles().items()], indent=2))
        return 0
    if args.auth_command == "revoke":
        base_url, token = token_for()
        from .client import Client
        print(json.dumps(Client(base_url, token).token_revoke(args.token_id), indent=2))
        return 0
    return 2


def cmd_skills(args) -> int:
    if args.skills_command != "install":
        return 2
    target = Path(args.workspace or Path.cwd()).expanduser().resolve()
    target.mkdir(parents=True, exist_ok=True)
    package = Path(__file__).parent / "templates"
    (target / "AGENTS.md").write_text((package / "AGENTS.md").read_text(encoding="utf-8"), encoding="utf-8")
    (target / ".dmhq").mkdir(exist_ok=True)
    (target / ".dmhq" / "SKILL.md").write_text((package / "SKILL.md").read_text(encoding="utf-8"), encoding="utf-8")
    print(f"Installed DM HQ guidance in {target}")
    return 0


def cmd_campaign(args) -> int:
    base_url, token = token_for(args.base_url)
    from .client import Client
    print(json.dumps(Client(base_url, token).campaigns(), indent=2))
    return 0


def cmd_workspace(args) -> int:
    if args.workspace_command == "init":
        base_url, _ = token_for(args.base_url)
        workspace = Workspace.init(base_url, args.campaign, Path(args.workspace_root).expanduser() if args.workspace_root else None)
        print(workspace.root)
        return 0
    workspace = workspace_from_args(args)
    if args.workspace_command in {"sync", "pull"}:
        print(json.dumps(workspace.sync() if args.workspace_command == "sync" else {"pulled": workspace.pull()}, indent=2))
        return 0
    if args.workspace_command == "new":
        workspace = workspace_from_args(args)
        markdown = Path(args.file).read_text(encoding="utf-8")
        print(json.dumps(workspace.create_item(workspace.client(), args.kind, markdown), indent=2))
        return 0
    if args.workspace_command == "status":
        print(json.dumps(workspace.status(), indent=2))
        return 0
    if args.workspace_command == "search":
        with workspace.index() as index:
            print(json.dumps(index.search(args.query), indent=2))
        return 0
    if args.workspace_command == "validate":
        errors = workspace.validate(args.path)
        if errors:
            print("\\n".join(errors), file=sys.stderr)
            return 1
        print("Valid")
        return 0
    if args.workspace_command == "push":
        print(json.dumps(workspace.push(path=args.path), indent=2))
        return 0
    if args.workspace_command == "conflicts":
        print(json.dumps(sorted(str(path.parent) for path in (workspace.meta / "conflicts").glob("*/metadata.json")), indent=2))
        return 0
    return 2


def parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="dmhq", description="DM HQ local Markdown workspace")
    sub = parser.add_subparsers(dest="command", required=True)
    auth = sub.add_parser("auth")
    auth_sub = auth.add_subparsers(dest="auth_command", required=True)
    add = auth_sub.add_parser("add")
    add.add_argument("--base-url", required=True)
    add.add_argument("--token")
    auth_sub.add_parser("list")
    revoke = auth_sub.add_parser("revoke")
    revoke.add_argument("token_id")
    skills = sub.add_parser("skills")
    skills_sub = skills.add_subparsers(dest="skills_command", required=True)
    install = skills_sub.add_parser("install")
    install.add_argument("--workspace")
    campaign = sub.add_parser("campaign")
    campaign_sub = campaign.add_subparsers(dest="campaign_command", required=True)
    campaign_list = campaign_sub.add_parser("list")
    campaign_list.add_argument("--base-url")
    workspace = sub.add_parser("workspace")
    workspace_sub = workspace.add_subparsers(dest="workspace_command", required=True)
    init = workspace_sub.add_parser("init")
    init.add_argument("--campaign", required=True)
    init.add_argument("--base-url")
    init.add_argument("--workspace-root")
    for name in ("sync", "pull", "status", "conflicts"):
        cmd = workspace_sub.add_parser(name)
        cmd.add_argument("--workspace")
    search = workspace_sub.add_parser("search")
    search.add_argument("query")
    search.add_argument("--workspace")
    validate = workspace_sub.add_parser("validate")
    validate.add_argument("--workspace")
    validate.add_argument("path", nargs="?")
    new = workspace_sub.add_parser("new")
    new.add_argument("--kind", choices=["note", "entity", "session"], required=True)
    new.add_argument("file")
    new.add_argument("--workspace")
    push = workspace_sub.add_parser("push")
    push.add_argument("path", nargs="?")
    push.add_argument("--workspace")
    for name in ("sync", "pull", "status", "conflicts"):
        cmd = sub.add_parser(name)
        cmd.set_defaults(command="workspace", workspace_command=name)
        cmd.add_argument("--workspace")
    search = sub.add_parser("search")
    search.set_defaults(command="workspace", workspace_command="search")
    search.add_argument("query")
    search.add_argument("--workspace")
    validate = sub.add_parser("validate")
    validate.set_defaults(command="workspace", workspace_command="validate")
    validate.add_argument("--workspace")
    validate.add_argument("path", nargs="?")
    new = sub.add_parser("new")
    new.set_defaults(command="workspace", workspace_command="new")
    new.add_argument("--kind", choices=["note", "entity", "session"], required=True)
    new.add_argument("file")
    new.add_argument("--workspace")
    push = sub.add_parser("push")
    push.set_defaults(command="workspace", workspace_command="push")
    push.add_argument("path", nargs="?")
    push.add_argument("--workspace")
    return parser


def main() -> None:
    args = parser().parse_args()
    try:
        if args.command == "auth":
            code = cmd_auth(args)
        elif args.command == "campaign":
            code = cmd_campaign(args)
        elif args.command == "skills":
            code = cmd_skills(args)
        else:
            code = cmd_workspace(args)
    except (ApiError, WorkspaceError, RuntimeError, OSError, ValueError) as exc:
        print(f"dmhq: {exc}", file=sys.stderr)
        code = 1
    raise SystemExit(code)
