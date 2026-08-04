from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .client import ApiError, SessionClient
from .storage import profiles, prompt_token, save_profile, token_for
from .workspace import Workspace, WorkspaceError


def workspace_from_args(args) -> Workspace:
    root = Path(args.workspace).expanduser() if getattr(args, "workspace", None) else Path.cwd()
    return Workspace(root)


def emit(value, args, human) -> None:
    if getattr(args, "json", False):
        print(json.dumps(value, indent=2))
    else:
        print(human(value))


def render_auth_profiles(items: list[dict]) -> str:
    if not items:
        return "No saved DM HQ profiles found."
    lines = [f"Saved profiles ({len(items)})", ""]
    for item in items:
        lines.extend(
            [
                str(item.get("base_url", "Unknown server")),
                f"  Profile: {item.get('profile', 'unknown')}",
                "  Credential: stored locally",
                "",
            ]
        )
    return "\n".join(lines).rstrip()


def render_token(token: dict) -> str:
    name = token.get("name") or "Unnamed token"
    lines = [f"Agent token revoked: {name}"]
    if token.get("id"):
        lines.append(f"  ID: {token['id']}")
    if token.get("revoked_at"):
        lines.append(f"  Revoked: {token['revoked_at']}")
    return "\n".join(lines)


def render_campaigns(campaigns: list[dict]) -> str:
    if not campaigns:
        return "No campaigns found."
    lines = [f"Campaigns ({len(campaigns)})", ""]
    for campaign in campaigns:
        lines.extend(
            [
                str(campaign.get("name") or "Untitled campaign"),
                f"  ID: {campaign.get('id', 'unknown')}",
                f"  Updated: {campaign.get('updated_at', 'unknown')}",
                "",
            ]
        )
    return "\n".join(lines).rstrip()


def render_sync(result: dict) -> str:
    if "root" in result:
        return "\n".join(
            [
                f"Synchronized {result.get('root', 'workspace')}",
                f"  Changes applied: {result.get('pulled', 0)}",
                f"  Cursor: {result.get('cursor', 0)}",
            ]
        )
    return f"Pulled {result.get('pulled', 0)} change(s)."


def render_new(result: dict) -> str:
    return "\n".join(
        [
            "Created archive document",
            f"  ID: {result.get('document_id', 'unknown')}",
            f"  Path: {result.get('storage_key', 'unknown')}",
            f"  Version: {result.get('version', 'unknown')}",
        ]
    )


def render_status(result: dict) -> str:
    return "\n".join(
        [
            f"Workspace: {result.get('root', 'unknown')}",
            f"Campaign: {result.get('campaign_id', 'unknown')}",
            f"Documents: {result.get('documents', 0)}",
            f"Cursor: {result.get('cursor', 0)}",
            f"Pending local edits: {result.get('dirty', 0)}",
            f"Conflicts: {result.get('conflicts', 0)}",
        ]
    )


def render_search(results: list[dict]) -> str:
    if not results:
        return "No local matches found."
    lines = [f"Local matches ({len(results)})", ""]
    for result in results:
        lines.extend(
            [
                str(result.get("storage_key", "Unknown document")),
                f"  ID: {result.get('document_id', 'unknown')}",
                f"  Version: {result.get('version', 'unknown')}",
                f"  Hash: {result.get('content_hash', 'unknown')}",
                f"  Match: {result.get('snippet', '')}",
                "",
            ]
        )
    return "\n".join(lines).rstrip()


def render_push(result: dict) -> str:
    lines = [f"Pushed {result.get('applied', 0)} document(s)."]
    conflicts = result.get("conflicts", 0)
    if conflicts:
        lines.append(f"Conflicts requiring review: {conflicts}")
    return "\n".join(lines)


def render_conflicts(paths: list[str]) -> str:
    if not paths:
        return "No conflicts found."
    lines = [f"Conflicts ({len(paths)})", ""]
    lines.extend(f"- {path}" for path in paths)
    return "\n".join(lines)


def cmd_auth(args) -> int:
    if args.auth_command == "setup":
        base_url = (args.base_url or input("DM HQ base URL: ")).strip().rstrip("/")
        if not base_url:
            raise RuntimeError("A DM HQ base URL is required.")
        username = (args.username or input("DM HQ username: ")).strip()
        if not username:
            raise RuntimeError("A DM HQ username is required.")
        import getpass

        password = getpass.getpass("DM HQ password (not saved): ")
        name = args.name or input("Token name [Local workspace]: ").strip() or "Local workspace"
        session = SessionClient(base_url)
        session.login(username, password)
        token = session.create_agent_token(name)
        save_profile(base_url, token["token"])
        print(f"Saved DM HQ profile for {base_url}")
        print(f"Created agent token {token['id']} ({token['name']}). The password was not saved.")
        return 0
    if args.auth_command == "add":
        token = args.token or prompt_token()
        save_profile(args.base_url, token)
        print(f"Saved DM HQ profile for {args.base_url.rstrip('/')}")
        return 0
    if args.auth_command == "list":
        items = [{"profile": key, **value} for key, value in profiles().items()]
        emit(items, args, render_auth_profiles)
        return 0
    if args.auth_command == "revoke":
        base_url, token = token_for()
        from .client import Client

        result = Client(base_url, token).token_revoke(args.token_id)
        emit(result, args, render_token)
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

    campaigns = Client(base_url, token).campaigns()
    emit(campaigns, args, render_campaigns)
    return 0


def cmd_workspace(args) -> int:
    if args.workspace_command == "init":
        base_url, _ = token_for(args.base_url)
        workspace = Workspace.init(base_url, args.campaign, Path(args.workspace_root).expanduser() if args.workspace_root else None)
        emit({"workspace": str(workspace.root), "campaign_id": args.campaign}, args, lambda value: f"Initialized workspace for {value['campaign_id']}\n  Path: {value['workspace']}")
        return 0
    workspace = workspace_from_args(args)
    if args.workspace_command in {"sync", "pull"}:
        result = workspace.sync() if args.workspace_command == "sync" else {"pulled": workspace.pull()}
        emit(result, args, render_sync)
        return 0
    if args.workspace_command == "new":
        markdown = Path(args.file).read_text(encoding="utf-8")
        result = workspace.create_item(workspace.client(), args.kind, markdown)
        emit(result, args, render_new)
        return 0
    if args.workspace_command == "status":
        emit(workspace.status(), args, render_status)
        return 0
    if args.workspace_command == "search":
        with workspace.index() as index:
            emit(index.search(args.query), args, render_search)
        return 0
    if args.workspace_command == "validate":
        errors = workspace.validate(args.path)
        if args.json:
            print(json.dumps({"valid": not errors, "errors": errors}, indent=2))
        elif errors:
            print("\n".join(errors), file=sys.stderr)
        else:
            print("Valid")
        return 1 if errors else 0
    if args.workspace_command == "push":
        emit(workspace.push(path=args.path), args, render_push)
        return 0
    if args.workspace_command == "conflicts":
        paths = sorted(str(path.parent) for path in (workspace.meta / "conflicts").glob("*/metadata.json"))
        emit(paths, args, render_conflicts)
        return 0
    return 2


def add_json_option(command) -> None:
    command.add_argument("--json", action="store_true", help="return machine-readable JSON")


def parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="dmhq", description="DM HQ local Markdown workspace")
    sub = parser.add_subparsers(dest="command", required=True)
    auth = sub.add_parser("auth")
    auth_sub = auth.add_subparsers(dest="auth_command", required=True)
    setup = auth_sub.add_parser("setup", help="log in once, create a personal agent token, and save it locally")
    setup.add_argument("--base-url", help="DM HQ URL; prompted when omitted")
    setup.add_argument("--username", help="login username; prompted when omitted")
    setup.add_argument("--name", help="agent token name; prompted when omitted")
    add = auth_sub.add_parser("add", help="save an existing personal agent token")
    add.add_argument("--base-url", required=True)
    add.add_argument("--token")
    auth_list = auth_sub.add_parser("list", help="list saved local profiles")
    add_json_option(auth_list)
    revoke = auth_sub.add_parser("revoke", help="revoke an agent token")
    revoke.add_argument("token_id")
    add_json_option(revoke)
    skills = sub.add_parser("skills")
    skills_sub = skills.add_subparsers(dest="skills_command", required=True)
    install = skills_sub.add_parser("install")
    install.add_argument("--workspace")
    campaign = sub.add_parser("campaign")
    campaign_sub = campaign.add_subparsers(dest="campaign_command", required=True)
    campaign_list = campaign_sub.add_parser("list", help="list campaigns in a human-readable format")
    campaign_list.add_argument("--base-url")
    add_json_option(campaign_list)
    workspace = sub.add_parser("workspace")
    workspace_sub = workspace.add_subparsers(dest="workspace_command", required=True)
    init = workspace_sub.add_parser("init")
    init.add_argument("--campaign", required=True)
    init.add_argument("--base-url")
    init.add_argument("--workspace-root")
    add_json_option(init)
    for name in ("sync", "pull", "status", "conflicts"):
        command = workspace_sub.add_parser(name)
        command.add_argument("--workspace")
        add_json_option(command)
    search = workspace_sub.add_parser("search")
    search.add_argument("query")
    search.add_argument("--workspace")
    add_json_option(search)
    validate = workspace_sub.add_parser("validate")
    validate.add_argument("--workspace")
    validate.add_argument("path", nargs="?")
    add_json_option(validate)
    new = workspace_sub.add_parser("new")
    new.add_argument("--kind", choices=["note", "entity", "session"], required=True)
    new.add_argument("file")
    new.add_argument("--workspace")
    add_json_option(new)
    push = workspace_sub.add_parser("push")
    push.add_argument("path", nargs="?")
    push.add_argument("--workspace")
    add_json_option(push)
    for name in ("sync", "pull", "status", "conflicts"):
        command = sub.add_parser(name)
        command.set_defaults(command="workspace", workspace_command=name)
        command.add_argument("--workspace")
        add_json_option(command)
    search = sub.add_parser("search")
    search.set_defaults(command="workspace", workspace_command="search")
    search.add_argument("query")
    search.add_argument("--workspace")
    add_json_option(search)
    validate = sub.add_parser("validate")
    validate.set_defaults(command="workspace", workspace_command="validate")
    validate.add_argument("--workspace")
    validate.add_argument("path", nargs="?")
    add_json_option(validate)
    new = sub.add_parser("new")
    new.set_defaults(command="workspace", workspace_command="new")
    new.add_argument("--kind", choices=["note", "entity", "session"], required=True)
    new.add_argument("file")
    new.add_argument("--workspace")
    add_json_option(new)
    push = sub.add_parser("push")
    push.set_defaults(command="workspace", workspace_command="push")
    push.add_argument("path", nargs="?")
    push.add_argument("--workspace")
    add_json_option(push)
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
