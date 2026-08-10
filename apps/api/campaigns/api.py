import base64
import hashlib
import io
import json
import posixpath
import re
import secrets
import zipfile
from html import unescape
from typing import Any, Literal
from uuid import UUID, uuid4

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.db import DatabaseError, connection, transaction
from django.db.models import Q
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.middleware.csrf import CsrfViewMiddleware, get_token
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import csrf_exempt
from ninja import NinjaAPI, Schema
from ninja.errors import HttpError
from ninja.security import HttpBearer, django_auth

from .documents import (
    DocumentError,
    clean_body,
    current_markdown_for_item,
    item_document_output,
    markdown_html,
    parse_document,
    prepare_archive_item_markdown,
    project_item,
    read_current,
    safe_publication_markdown,
    save_document,
    serialize_document,
)
from .models import (
    AgentToken,
    ArchiveItem,
    ArchiveView,
    Campaign,
    CampaignDocument,
    CampaignMembership,
    DocumentLink,
    EntityDetail,
    Publication,
    PublicationEntry,
    PublicationVersion,
    Reference,
    Relationship,
    SessionDetail,
    Template,
    TemplateVersion,
    WorkspaceChange,
)

api = NinjaAPI(title="DM HQ API", version="2.0.0")


class Credentials(Schema):
    username: str
    password: str


class CampaignCreate(Schema):
    name: str


class UserOut(Schema):
    id: int
    username: str


class CampaignOut(Schema):
    id: UUID
    name: str
    owner_id: int
    created_at: str
    updated_at: str


class ItemCreate(Schema):
    kind: str
    markdown: str


class ItemUpdate(Schema):
    version: int
    markdown: str
    reason: str = "Updated"


class PromotePayload(Schema):
    version: int
    subject_type: str = "person"
    template_id: UUID | None = None


class VersionPayload(Schema):
    version: int
    reason: str = "Archived"


class ReferencePayload(Schema):
    target_id: UUID
    label: str = ""


class RelationshipPayload(Schema):
    version: int
    target_id: UUID
    kind: str
    label: str = ""
    inverse_label: str = ""
    notes: str = ""


class RelationshipDeletePayload(Schema):
    version: int


class ArchiveViewPayload(Schema):
    version: int | None = None
    view_type: str
    title: str
    description: str = ""
    background: dict[str, Any] | None = None
    placements: list[dict[str, Any]] | None = None
    members: list[dict[str, Any]] | None = None
    settings: dict[str, Any] | None = None


GRAPH_NODE_SUMMARY_MAX_LENGTH = 240
GRAPH_NODE_SUMMARY_SOURCE_MAX_LENGTH = 4096


class SessionLinkPayload(Schema):
    item_id: UUID


class PublicationEntryPayload(Schema):
    item_id: UUID
    markdown: str


class PublicationPayload(Schema):
    entries: list[PublicationEntryPayload]


class RestorePayload(Schema):
    revision: int
    version: int
    reason: str = "Restored revision"


class AgentTokenCreate(Schema):
    name: str = "Local workspace"
    expires_at: str | None = None


class AgentTokenOut(Schema):
    id: UUID
    name: str
    created_at: str
    last_used_at: str | None = None
    expires_at: str | None = None
    revoked_at: str | None = None


class AgentTokenCreated(AgentTokenOut):
    token: str


class WorkspaceApplyPayload(Schema):
    document_id: UUID
    version: int
    hash: str
    markdown: str
    reason: str = "Workspace update"


class WorkspaceDocumentOut(Schema):
    document_id: UUID
    previous_storage_key: str | None = None
    storage_key: str
    markdown: str
    version: int
    hash: str


class WorkspaceChangeOut(Schema):
    document_id: UUID
    previous_storage_key: str | None = None
    storage_key: str
    operation: Literal["upsert", "move", "delete"]
    version: int | None = None
    hash: str
    markdown: str | None = None


class WorkspaceChangesOut(Schema):
    cursor: int
    has_more: bool
    changes: list[WorkspaceChangeOut]


class WorkspaceManifestOut(Schema):
    format: str
    version: int
    campaign_id: UUID
    cursor: int
    next_after: str | None = None
    has_more: bool


class WorkspaceSnapshotOut(Schema):
    manifest: WorkspaceManifestOut
    files: list[WorkspaceDocumentOut]


def error(status: int, code: str, message: str) -> HttpError:
    return HttpError(status, f"{code}: {message}")


def enforce_csrf(request: HttpRequest) -> None:
    if request.headers.get("Authorization", "").startswith("Bearer "):
        return
    middleware = CsrfViewMiddleware(lambda current_request: None)
    if middleware.process_view(request, None, (), {}) is not None:
        raise HttpError(403, "csrf_failed: CSRF verification failed")


def _token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class AgentBearerAuth(HttpBearer):
    def authenticate(self, request: HttpRequest, token: str):
        record = (
            AgentToken.objects.select_related("user")
            .filter(token_hash=_token_hash(token), revoked_at__isnull=True)
            .first()
        )
        if record is None or (record.expires_at and record.expires_at <= timezone.now()):
            return None
        AgentToken.objects.filter(id=record.id).update(last_used_at=timezone.now())
        return record.user


agent_bearer_auth = AgentBearerAuth()


def _current_agent_token(request: HttpRequest):
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    raw = header.removeprefix("Bearer ").strip()
    if not raw:
        return None
    token = (
        AgentToken.objects.select_related("user").filter(token_hash=_token_hash(raw), revoked_at__isnull=True).first()
    )
    if token is None or (token.expires_at and token.expires_at <= timezone.now()):
        return None
    AgentToken.objects.filter(id=token.id).update(last_used_at=timezone.now())
    return token


def _agent_token_user(request: HttpRequest):
    token = _current_agent_token(request)
    return token.user if token else None


def workspace_auth(request: HttpRequest):
    if getattr(request, "user", None) is not None and request.user.is_authenticated:
        return request.user
    user = _agent_token_user(request)
    if user is None:
        raise HttpError(401, "Unauthorized")
    return user


def agent_token_output(token: AgentToken) -> dict[str, Any]:
    return {
        "id": token.id,
        "name": token.name,
        "created_at": token.created_at.isoformat(),
        "last_used_at": token.last_used_at.isoformat() if token.last_used_at else None,
        "expires_at": token.expires_at.isoformat() if token.expires_at else None,
        "revoked_at": token.revoked_at.isoformat() if token.revoked_at else None,
    }


def get_member_campaign(request: HttpRequest, campaign_id: UUID) -> Campaign:
    try:
        return Campaign.objects.get(id=campaign_id, memberships__user=request.auth)
    except Campaign.DoesNotExist as exc:
        raise error(404, "not_found", "Campaign not found") from exc


def get_member_item(request: HttpRequest, item_id: UUID) -> ArchiveItem:
    try:
        return ArchiveItem.objects.select_related("campaign", "document", "entity_detail", "session_detail").get(
            id=item_id, campaign__memberships__user=request.auth
        )
    except ArchiveItem.DoesNotExist as exc:
        raise error(404, "not_found", "Archive item not found") from exc


def validate_kind(kind: str) -> None:
    if kind not in {choice.value for choice in ArchiveItem.Kind}:
        raise error(422, "validation", "Unknown item kind")


def ensure_campaign_document(campaign: Campaign, user) -> CampaignDocument:
    if campaign.document_id:
        return campaign.document
    metadata = {
        "document_type": "campaign",
        "id": str(campaign.id),
        "campaign_id": str(campaign.id),
        "title": campaign.name,
    }
    document = save_document(
        campaign,
        "campaign",
        None,
        serialize_document(metadata, ""),
        user,
        "Materialized campaign",
    )
    campaign.document = document
    campaign.save(update_fields=["document"])
    return document


def campaign_output(campaign: Campaign) -> dict[str, object]:
    return {
        "id": campaign.id,
        "name": campaign.name,
        "owner_id": campaign.owner_id,
        "created_at": campaign.created_at.isoformat(),
        "updated_at": campaign.updated_at.isoformat(),
    }


def item_summary(item: ArchiveItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "campaign_id": item.campaign_id,
        "kind": item.kind,
        "title": item.title,
        "status": item.status,
        "version": item.document.current_version if item.document_id else item.version,
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
    }


def ensure_template_document(version: TemplateVersion, user, fields: list[dict[str, Any]] | None = None) -> None:
    if version.document_id:
        if fields is None:
            return
        metadata, body = parse_document(read_current(version.document))
        if metadata.get("fields") == fields:
            return
        metadata["fields"] = fields
        save_document(
            version.template.campaign,
            "template",
            version.document.storage_key,
            serialize_document(metadata, body),
            user,
            "Updated default template fields",
            version.document.current_version,
            version.document,
        )
        return
    metadata = {
        "document_type": "template",
        "id": str(uuid4()),
        "campaign_id": str(version.template.campaign_id),
        "template_id": str(version.template_id),
        "version": version.number,
        "name": version.template.name,
        "applies_to": version.template.applies_to,
        "fields": fields or [],
    }
    doc = save_document(
        version.template.campaign,
        "template",
        None,
        serialize_document(metadata, ""),
        user,
        "Created template",
    )
    version.document = doc
    version.save(update_fields=["document"])


def ensure_default_templates(campaign, user) -> None:
    person, _ = Template.objects.get_or_create(
        campaign=campaign, name="Person / NPC", defaults={"applies_to": "entity"}
    )
    session, _ = Template.objects.get_or_create(campaign=campaign, name="Session", defaults={"applies_to": "session"})
    person_fields = [
        {"key": "species", "label": "Species", "type": "short_text", "required": False},
        {"key": "alignment", "label": "Alignment", "type": "short_text", "required": False},
        {"key": "class", "label": "Class", "type": "short_text", "required": False},
        {"key": "level", "label": "Level", "type": "number", "required": False},
        {"key": "armor_class", "label": "Armor Class", "type": "number", "required": False},
        {"key": "hit_points", "label": "Hit points", "type": "number", "required": False},
        {"key": "speed", "label": "Speed", "type": "number", "required": False},
        {"key": "ability_scores", "label": "Ability scores", "type": "long_text", "required": False},
    ]
    session_fields = [
        {"key": "scheduled_for", "label": "Scheduled date", "type": "calendar_date", "required": False},
        {
            "key": "session_status",
            "label": "Session status",
            "type": "choice",
            "options": ["planned", "completed"],
            "required": True,
        },
        {"key": "outcome_text", "label": "Outcome", "type": "long_text", "required": False},
    ]
    for template, fields in ((person, person_fields), (session, session_fields)):
        version, _ = TemplateVersion.objects.get_or_create(template=template, number=1)
        ensure_template_document(version, user, fields)


def template_fields(version: TemplateVersion | None) -> list[dict[str, Any]]:
    if not version:
        return []
    if version.document_id:
        metadata, _ = parse_document(read_current(version.document))
        return metadata.get("fields", [])
    return []


def save_item_markdown(item: ArchiveItem, markdown: str, user, expected_version: int, reason: str) -> dict[str, Any]:
    try:
        markdown = prepare_archive_item_markdown(item, markdown)
        metadata, _ = parse_document(markdown)
        doc = save_document(
            item.campaign,
            "archive_item",
            None,
            markdown,
            user,
            reason,
            expected_version,
            item.document if item.document_id else None,
        )
    except DocumentError as exc:
        if str(exc) == "stale_version":
            raise error(409, "stale_version", "The document changed since it was opened") from exc
        raise error(422, "invalid_markdown", str(exc)) from exc
    item.document = doc
    item.version = doc.current_version
    item.save(update_fields=["document", "version", "updated_at"])
    project_item(item, metadata)
    return item_document_output(item)


@api.get("health/live", auth=None)
def health_live(request: HttpRequest):
    return {"status": "ok"}


@api.get("health/ready", auth=None)
def health_ready(request: HttpRequest):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except DatabaseError:
        return 503, {"status": "unavailable"}
    return {"status": "ok"}


@api.get("health/version", auth=None)
def health_version(request: HttpRequest):
    return {"status": "ok", "version": settings.BUILD_VERSION, "pr": settings.BUILD_PR_NUMBER}


@api.get("auth/csrf", auth=None)
def csrf_token(request: HttpRequest):
    return {"csrfToken": get_token(request)}


@api.post("auth/login", auth=None, response=UserOut)
def auth_login(request: HttpRequest, credentials: Credentials):
    enforce_csrf(request)
    user = authenticate(request, username=credentials.username, password=credentials.password)
    if user is None:
        raise error(401, "invalid_credentials", "Invalid username or password")
    login(request, user)
    return {"id": user.id, "username": user.username}


@api.post("auth/logout", auth=django_auth)
def auth_logout(request: HttpRequest):
    enforce_csrf(request)
    logout(request)
    return {"status": "ok"}


@api.get("auth/me", auth=django_auth, response=UserOut)
def auth_me(request: HttpRequest):
    return {"id": request.auth.id, "username": request.auth.username}


@api.post("auth/agent-tokens", auth=django_auth, response=AgentTokenCreated)
@transaction.atomic
def agent_token_create(request: HttpRequest, payload: AgentTokenCreate):
    enforce_csrf(request)
    name = payload.name.strip() or "Local workspace"
    expires_at = parse_datetime(payload.expires_at) if payload.expires_at else None
    if payload.expires_at and expires_at is None:
        raise error(422, "validation", "expires_at must be an ISO-8601 datetime")
    raw = "dmhq_" + secrets.token_urlsafe(32)
    token = AgentToken.objects.create(
        user=request.auth,
        name=name,
        token_hash=_token_hash(raw),
        expires_at=expires_at,
    )
    return {**agent_token_output(token), "token": raw}


@api.get("auth/agent-tokens", auth=django_auth, response=list[AgentTokenOut])
def agent_token_list(request: HttpRequest):
    return [agent_token_output(token) for token in AgentToken.objects.filter(user=request.auth)]


@api.post("auth/agent-tokens/{token_id}/revoke", auth=[django_auth, agent_bearer_auth], response=AgentTokenOut)
@csrf_exempt
@transaction.atomic
def agent_token_revoke(request: HttpRequest, token_id: UUID):
    enforce_csrf(request)
    token = AgentToken.objects.filter(id=token_id, user=request.auth).first()
    current = _current_agent_token(request)
    if current is not None and str(current.id) != str(token_id):
        raise error(403, "forbidden", "A bearer token can only revoke itself")
    if token is None:
        raise error(404, "not_found", "Agent token not found")
    token.revoked_at = timezone.now()
    token.save(update_fields=["revoked_at"])
    return agent_token_output(token)


@api.get("campaigns", auth=[django_auth, agent_bearer_auth], response=list[CampaignOut])
def campaign_list(request: HttpRequest):
    return [campaign_output(c) for c in Campaign.objects.filter(memberships__user=request.auth)]


@api.post("campaigns", auth=django_auth, response=CampaignOut)
@transaction.atomic
def campaign_create(request: HttpRequest, payload: CampaignCreate):
    enforce_csrf(request)
    name = payload.name.strip()
    if not name:
        raise error(422, "validation", "Campaign name cannot be empty")
    campaign = Campaign.objects.create(name=name, owner=request.auth)
    CampaignMembership.objects.create(campaign=campaign, user=request.auth, role=CampaignMembership.Role.OWNER)
    metadata = {"document_type": "campaign", "id": str(campaign.id), "campaign_id": str(campaign.id), "title": name}
    doc = save_document(
        campaign,
        "campaign",
        None,
        serialize_document(metadata, ""),
        request.auth,
        "Created campaign",
    )
    campaign.document = doc
    campaign.save(update_fields=["document"])
    ensure_default_templates(campaign, request.auth)
    return campaign_output(campaign)


@api.get("campaigns/{campaign_id}", auth=django_auth, response=CampaignOut)
def campaign_detail(request: HttpRequest, campaign_id: UUID):
    return campaign_output(get_member_campaign(request, campaign_id))


def encode_item_cursor(item: ArchiveItem) -> str:
    value = json.dumps({"updated_at": item.updated_at.isoformat(), "id": str(item.id)}).encode()
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def decode_item_cursor(cursor: str) -> tuple[Any, UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        value = json.loads(base64.urlsafe_b64decode(padded).decode())
        updated_at = parse_datetime(str(value["updated_at"]))
        item_id = UUID(str(value["id"]))
        if updated_at is None:
            raise ValueError
        if timezone.is_naive(updated_at):
            updated_at = timezone.make_aware(updated_at)
        return updated_at, item_id
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise error(422, "validation", "Invalid pagination cursor") from exc


def paginate_items(items, cursor: str | None, limit: int) -> dict[str, Any]:
    limit = max(1, min(limit, 100))
    items = items.order_by("-updated_at", "-id")
    if cursor:
        updated_at, item_id = decode_item_cursor(cursor)
        items = items.filter(Q(updated_at__lt=updated_at) | Q(updated_at=updated_at, id__lt=item_id))
    values = list(items[: limit + 1])
    next_cursor = encode_item_cursor(values[limit - 1]) if len(values) > limit else None
    return {"items": [item_summary(item) for item in values[:limit]], "next_cursor": next_cursor}


@api.get("campaigns/{campaign_id}/items", auth=django_auth)
def item_list(
    request: HttpRequest,
    campaign_id: UUID,
    kind: str | None = None,
    status: str | None = None,
    cursor: str | None = None,
    limit: int = 50,
):
    campaign = get_member_campaign(request, campaign_id)
    items = campaign.archive_items.all()
    if kind:
        items = items.filter(kind=kind)
    if status:
        items = items.filter(status=status)
    return paginate_items(items, cursor, limit)


@api.get("campaigns/{campaign_id}/sessions", auth=django_auth)
def session_list(request: HttpRequest, campaign_id: UUID):
    campaign = get_member_campaign(request, campaign_id)
    return {"sessions": [item_summary(i) for i in campaign.archive_items.filter(kind="session")]}


@api.post("campaigns/{campaign_id}/sessions", auth=django_auth)
@transaction.atomic
def session_create(request: HttpRequest, campaign_id: UUID, payload: ItemCreate):
    return item_create(request, campaign_id, payload.model_copy(update={"kind": "session"}))


@api.post("campaigns/{campaign_id}/items", auth=[django_auth, agent_bearer_auth])
@csrf_exempt
@transaction.atomic
def item_create(request: HttpRequest, campaign_id: UUID, payload: ItemCreate):
    enforce_csrf(request)
    campaign = get_member_campaign(request, campaign_id)
    validate_kind(payload.kind)
    try:
        metadata, body = parse_document(payload.markdown)
    except DocumentError as exc:
        raise error(422, "invalid_markdown", str(exc)) from exc
    if metadata.get("document_type") != "archive_item" or metadata.get("kind") != payload.kind:
        raise error(422, "invalid_markdown", "Frontmatter document_type and kind must match the request")
    # Entity documents always carry a typed subject category in frontmatter. A
    # quick capture may omit it, so normalize the same default used by the
    # relational projection before validation.
    if payload.kind == ArchiveItem.Kind.ENTITY:
        metadata.setdefault("subject_type", "person")
    ensure_default_templates(campaign, request.auth)
    if payload.kind in {ArchiveItem.Kind.ENTITY, ArchiveItem.Kind.SESSION} and not metadata.get("template"):
        template = campaign.templates.filter(applies_to=payload.kind).order_by("created_at").first()
        if template:
            version = template.versions.order_by("-number").first()
            metadata["template"] = {"id": str(template.id), "version": version.number}
            metadata.setdefault("fields", {})
    item = ArchiveItem.objects.create(
        campaign=campaign,
        kind=payload.kind,
        title=str(metadata.get("title") or "Untitled"),
        status=str(metadata.get("status") or "draft"),
    )
    if item.kind == "entity":
        EntityDetail.objects.create(item=item, subject_type=str(metadata.get("subject_type") or "person"))
    if item.kind == "session":
        SessionDetail.objects.create(item=item)
    result = save_item_markdown(item, serialize_document(metadata, body), request.auth, 0, "Created")
    return result


def graph_node_summary(markdown: str, campaign_id: UUID) -> str:
    if not markdown:
        return ""
    try:
        _, body = parse_document(markdown)
    except DocumentError:
        return ""
    rendered = markdown_html(body[:GRAPH_NODE_SUMMARY_SOURCE_MAX_LENGTH], campaign_id)
    plain_text = re.sub(r"\s+", " ", unescape(clean_body(rendered))).strip()
    if len(plain_text) <= GRAPH_NODE_SUMMARY_MAX_LENGTH:
        return plain_text
    return f"{plain_text[: GRAPH_NODE_SUMMARY_MAX_LENGTH - 1].rstrip()}…"


@api.get("items/{item_id}", auth=django_auth)
def item_detail(request: HttpRequest, item_id: UUID):
    return item_document_output(get_member_item(request, item_id))


@api.get("campaigns/{campaign_id}/archive/graph", auth=django_auth)
def archive_graph(
    request: HttpRequest,
    campaign_id: UUID,
    focus_id: UUID | None = None,
    depth: int = 1,
    edge_classes: str = "document_link,reference,relationship",
    relationship_kinds: str = "",
):
    campaign = get_member_campaign(request, campaign_id)
    if focus_id is not None and depth not in {1, 2}:
        raise error(422, "validation", "Graph depth must be one or two")
    selected_classes = {value.strip() for value in edge_classes.split(",") if value.strip()}
    allowed_classes = {"document_link", "reference", "relationship"}
    if not selected_classes or not selected_classes <= allowed_classes:
        raise error(422, "validation", "Unknown graph edge class")
    selected_kinds = {value.strip() for value in relationship_kinds.split(",") if value.strip()}

    root_id = campaign.id
    items = list(campaign.archive_items.all().order_by("id"))
    items_by_id = {item.id: item for item in items}
    node_map: dict[UUID, dict[str, Any]] = {
        root_id: {
            "id": root_id,
            "node_type": "campaign",
            "title": campaign.name,
            "kind": "campaign",
            "status": "active",
        }
    }
    for item in items:
        node_map[item.id] = {
            "id": item.id,
            "node_type": "item",
            "title": item.title,
            "kind": item.kind,
            "status": item.status,
        }
    selected_focus = focus_id
    if selected_focus is not None and selected_focus not in node_map:
        raise error(404, "not_found", "Graph focus item not found")

    graph_edges: list[dict[str, Any]] = []
    if "document_link" in selected_classes:
        for link in DocumentLink.objects.filter(campaign=campaign).order_by("id"):
            if link.source_identifier in node_map and link.target_identifier in node_map:
                graph_edges.append(
                    {
                        "id": str(link.id),
                        "edge_class": "document_link",
                        "source_id": link.source_identifier,
                        "target_id": link.target_identifier,
                        "kind": "links_to",
                        "label": link.label,
                        "inverse_label": "linked from",
                    }
                )
    if "reference" in selected_classes:
        references = Reference.objects.filter(source__campaign=campaign).order_by("id")
        for reference in references:
            graph_edges.append(
                {
                    "id": f"reference:{reference.id}",
                    "edge_class": "reference",
                    "source_id": reference.source_id,
                    "target_id": reference.target_id,
                    "kind": "references",
                    "label": reference.label,
                    "inverse_label": "referenced by",
                }
            )
    if "relationship" in selected_classes:
        relationships = Relationship.objects.filter(source__campaign=campaign).order_by("edge_id")
        if selected_kinds:
            relationships = relationships.filter(kind__in=selected_kinds)
        for relationship in relationships:
            graph_edges.append(
                {
                    "id": str(relationship.edge_id),
                    "edge_class": "relationship",
                    "source_id": relationship.source_id,
                    "target_id": relationship.target_id,
                    "kind": relationship.kind,
                    "label": relationship.label,
                    "inverse_label": relationship.inverse_label,
                }
            )
    graph_edges.sort(key=lambda value: (value["edge_class"], str(value["id"])))

    max_nodes, max_edges = 100, 250
    nodes_truncated = False
    edges_truncated = False
    if selected_focus is None:
        # An unfocused request is the campaign overview, not a one-hop query.
        # Keep the campaign home first so the bounded view remains stable if a
        # large campaign exceeds the safety limit.
        overview_ids = [root_id, *(item.id for item in items)]
        visible_ids = overview_ids[:max_nodes]
        visited = set(visible_ids)
        nodes_truncated = len(overview_ids) > max_nodes
    else:
        visited = {selected_focus}
        frontier = {selected_focus}
        for _ in range(depth):
            next_frontier: set[UUID] = set()
            for edge in graph_edges:
                if edge["source_id"] not in frontier and edge["target_id"] not in frontier:
                    continue
                new_nodes = sorted({edge["source_id"], edge["target_id"]} - visited, key=str)
                available_nodes = max_nodes - len(visited)
                if len(new_nodes) > available_nodes:
                    nodes_truncated = True
                    new_nodes = new_nodes[:available_nodes]
                for node_id in new_nodes:
                    visited.add(node_id)
                    next_frontier.add(node_id)
            frontier = next_frontier
            if not frontier:
                break

    # Render the induced subgraph for the selected scope. Focused graphs use
    # the requested hop radius; an overview includes every visible page.
    included_edges: list[dict[str, Any]] = []
    for edge in graph_edges:
        if edge["source_id"] not in visited or edge["target_id"] not in visited:
            continue
        if len(included_edges) >= max_edges:
            edges_truncated = True
            break
        included_edges.append(edge)

    for node_id in visited:
        if node_id == root_id:
            markdown = read_current(campaign.document) if campaign.document_id else ""
        else:
            item = items_by_id.get(node_id)
            if item is None:
                continue
            markdown = current_markdown_for_item(item)
        node_map[node_id]["summary"] = graph_node_summary(markdown, campaign.id)

    return {
        "focus_id": selected_focus,
        "depth": depth if selected_focus is not None else 0,
        "nodes": [node_map[node_id] for node_id in sorted(visited, key=str)],
        "edges": included_edges,
        "limits": {"max_nodes": max_nodes, "max_edges": max_edges},
        "truncated": {"nodes": nodes_truncated, "edges": edges_truncated},
    }


def page_identity(item: ArchiveItem) -> dict[str, Any]:
    return {"id": item.id, "title": item.title, "kind": item.kind, "status": item.status}


def archive_home_output(campaign: Campaign) -> dict[str, Any]:
    document = campaign.document
    markdown = read_current(document)
    metadata, body = parse_document(markdown)
    return {
        "id": campaign.id,
        "markdown": markdown,
        "html": markdown_html(body, campaign.id),
        "version": document.current_version,
        "hash": document.content_hash,
        "metadata": metadata,
        "backlinks": [
            {"id": str(link.id), "source_id": link.source_identifier, "label": link.label, "context": link.context}
            for link in DocumentLink.objects.filter(
                campaign=campaign, target_type="campaign", target_identifier=campaign.id
            )
        ],
    }


def archive_view_output(view: ArchiveView) -> dict[str, Any]:
    markdown = read_current(view.document)
    metadata, body = parse_document(markdown)
    item_ids = []
    if view.view_type == "map":
        item_ids = [entry.get("item_id") for entry in metadata.get("placements", []) if entry.get("item_id")]
    else:
        item_ids = [entry.get("item_id") for entry in metadata.get("members", []) if entry.get("item_id")]
    items = {str(item.id): item for item in view.campaign.archive_items.filter(id__in=item_ids)}
    placements = [
        {**entry, "item": page_identity(items[str(entry["item_id"])])}
        for entry in metadata.get("placements", [])
        if str(entry.get("item_id")) in items
    ]
    members = [
        {**entry, "item": page_identity(items[str(entry["item_id"])])}
        for entry in metadata.get("members", [])
        if str(entry.get("item_id")) in items
    ]
    edges = []
    if view.view_type == "relationship":
        member_set = set(items)
        for rel in Relationship.objects.filter(source__campaign=view.campaign).order_by("authored_position", "edge_id"):
            if str(rel.source_id) in member_set and str(rel.target_id) in member_set:
                edges.append(
                    {
                        "id": str(rel.edge_id),
                        "edge_class": "relationship",
                        "source_id": rel.source_id,
                        "target_id": rel.target_id,
                        "kind": rel.kind,
                        "label": rel.label,
                        "inverse_label": rel.inverse_label,
                    }
                )
    return {
        "id": view.id,
        "campaign_id": view.campaign_id,
        "view_type": view.view_type,
        "title": view.title,
        "slug": metadata.get("slug", ""),
        "status": view.status,
        "version": view.document.current_version,
        "markdown": markdown,
        "html": markdown_html(body, view.campaign_id),
        "description": body,
        "background": metadata.get("background"),
        "placements": placements,
        "members": members,
        "settings": metadata.get("settings", {}),
        "edges": edges,
    }


def archive_view_metadata(
    view_id: UUID, campaign_id: UUID, payload: ArchiveViewPayload, status: str = "active"
) -> dict[str, Any]:
    metadata = {
        "document_type": "archive_view",
        "schema_version": 1,
        "id": str(view_id),
        "campaign_id": str(campaign_id),
        "view_type": payload.view_type,
        "title": payload.title.strip(),
        "status": status,
    }
    if payload.view_type == "map":
        metadata["background"] = payload.background or {}
        metadata["placements"] = payload.placements or []
    else:
        metadata["members"] = payload.members or []
        metadata["settings"] = payload.settings or {"orientation": "top_to_bottom", "relationship_kinds": []}
    return metadata


@api.get("campaigns/{campaign_id}/archive/home", auth=django_auth)
def archive_home(request: HttpRequest, campaign_id: UUID):
    campaign = get_member_campaign(request, campaign_id)
    ensure_campaign_document(campaign, request.auth)
    return archive_home_output(campaign)


@api.patch("campaigns/{campaign_id}/archive/home", auth=django_auth)
@transaction.atomic
def archive_home_update(request: HttpRequest, campaign_id: UUID, payload: ItemUpdate):
    enforce_csrf(request)
    campaign = get_member_campaign(request, campaign_id)
    document = ensure_campaign_document(campaign, request.auth)
    try:
        metadata, body = parse_document(payload.markdown)
        if metadata.get("document_type") != "campaign":
            raise DocumentError("Campaign home requires campaign frontmatter")
        save_document(
            campaign,
            "campaign",
            document.storage_key,
            payload.markdown,
            request.auth,
            payload.reason,
            payload.version,
            document,
        )
        campaign.name = str(metadata.get("title") or campaign.name)
        campaign.save(update_fields=["name", "updated_at"])
        return archive_home_output(campaign)
    except DocumentError as exc:
        code = "stale_version" if str(exc) == "stale_version" else "invalid_markdown"
        raise error(409 if code == "stale_version" else 422, code, str(exc)) from exc


@api.get("campaigns/{campaign_id}/archive/views", auth=django_auth)
def archive_view_list(request: HttpRequest, campaign_id: UUID, include_archived: bool = False):
    campaign = get_member_campaign(request, campaign_id)
    views = campaign.archive_views.all() if include_archived else campaign.archive_views.filter(status="active")
    return {
        "views": [
            {
                "id": view.id,
                "campaign_id": view.campaign_id,
                "view_type": view.view_type,
                "title": view.title,
                "slug": parse_document(read_current(view.document))[0].get("slug", ""),
                "status": view.status,
                "version": view.document.current_version,
                "updated_at": view.updated_at.isoformat(),
            }
            for view in views
        ]
    }


@api.post("campaigns/{campaign_id}/archive/views", auth=django_auth)
@transaction.atomic
def archive_view_create(request: HttpRequest, campaign_id: UUID, payload: ArchiveViewPayload):
    enforce_csrf(request)
    campaign = get_member_campaign(request, campaign_id)
    if payload.view_type not in {"map", "relationship"} or not payload.title.strip():
        raise error(422, "validation", "View type and title are required")
    view_id = uuid4()
    metadata = archive_view_metadata(view_id, campaign.id, payload)
    try:
        document = save_document(
            campaign,
            "archive_view",
            None,
            serialize_document(metadata, payload.description),
            request.auth,
            "Created view",
        )
    except DocumentError as exc:
        raise error(422, "invalid_view", str(exc)) from exc
    view = ArchiveView.objects.create(
        id=view_id,
        campaign=campaign,
        document=document,
        view_type=payload.view_type,
        title=payload.title.strip(),
    )
    return archive_view_output(view)


@api.get("campaigns/{campaign_id}/archive/views/{view_id}", auth=django_auth)
def archive_view_detail(request: HttpRequest, campaign_id: UUID, view_id: UUID):
    campaign = get_member_campaign(request, campaign_id)
    view = ArchiveView.objects.filter(id=view_id, campaign=campaign).first()
    if not view:
        raise error(404, "not_found", "Archive view not found")
    return archive_view_output(view)


@api.patch("campaigns/{campaign_id}/archive/views/{view_id}", auth=django_auth)
@transaction.atomic
def archive_view_update(request: HttpRequest, campaign_id: UUID, view_id: UUID, payload: ArchiveViewPayload):
    enforce_csrf(request)
    campaign = get_member_campaign(request, campaign_id)
    view = ArchiveView.objects.filter(id=view_id, campaign=campaign).select_related("document").first()
    if not view:
        raise error(404, "not_found", "Archive view not found")
    metadata, _ = parse_document(read_current(view.document))
    if payload.version != view.document.current_version:
        raise error(409, "stale_version", "The view changed elsewhere")
    metadata.update(archive_view_metadata(view.id, campaign.id, payload, view.status))
    try:
        save_document(
            campaign,
            "archive_view",
            view.document.storage_key,
            serialize_document(metadata, payload.description),
            request.auth,
            "Updated view",
            payload.version,
            view.document,
        )
    except DocumentError as exc:
        raise error(422, "invalid_view", str(exc)) from exc
    view.title = payload.title.strip()
    view.view_type = payload.view_type
    view.save(update_fields=["title", "view_type", "updated_at"])
    return archive_view_output(view)


def _archive_view_status(request: HttpRequest, campaign_id: UUID, view_id: UUID, payload: VersionPayload, status: str):
    campaign = get_member_campaign(request, campaign_id)
    view = ArchiveView.objects.filter(id=view_id, campaign=campaign).select_related("document").first()
    if not view:
        raise error(404, "not_found", "Archive view not found")
    if view.document.current_version != payload.version:
        raise error(409, "stale_version", "The view changed elsewhere")
    metadata, body = parse_document(read_current(view.document))
    metadata["status"] = status
    save_document(
        campaign,
        "archive_view",
        view.document.storage_key,
        serialize_document(metadata, body),
        request.auth,
        "Changed view status",
        payload.version,
        view.document,
    )
    view.status = status
    view.save(update_fields=["status", "updated_at"])
    return archive_view_output(view)


@api.post("campaigns/{campaign_id}/archive/views/{view_id}/archive", auth=django_auth)
@transaction.atomic
def archive_view_archive(request: HttpRequest, campaign_id: UUID, view_id: UUID, payload: VersionPayload):
    enforce_csrf(request)
    return _archive_view_status(request, campaign_id, view_id, payload, "archived")


@api.post("campaigns/{campaign_id}/archive/views/{view_id}/restore", auth=django_auth)
@transaction.atomic
def archive_view_restore(request: HttpRequest, campaign_id: UUID, view_id: UUID, payload: VersionPayload):
    enforce_csrf(request)
    return _archive_view_status(request, campaign_id, view_id, payload, "active")


@api.patch("items/{item_id}", auth=django_auth)
@transaction.atomic
def item_update(request: HttpRequest, item_id: UUID, payload: ItemUpdate):
    enforce_csrf(request)
    return save_item_markdown(
        get_member_item(request, item_id), payload.markdown, request.auth, payload.version, payload.reason
    )


@api.post("items/{item_id}/promote", auth=django_auth)
@transaction.atomic
def item_promote(request: HttpRequest, item_id: UUID, payload: PromotePayload):
    enforce_csrf(request)
    item = get_member_item(request, item_id)
    if item.kind != "note":
        raise error(422, "validation", "Only notes can be promoted")
    metadata, body = parse_document(current_markdown_for_item(item))
    metadata.update(
        {
            "kind": "entity",
            "subject_type": payload.subject_type,
            "template": {"id": str(payload.template_id), "version": 1}
            if payload.template_id
            else metadata.get("template"),
        }
    )
    item.kind = "entity"
    item.save(update_fields=["kind"])
    EntityDetail.objects.get_or_create(item=item)
    return save_item_markdown(
        item, serialize_document(metadata, body), request.auth, payload.version, "Promoted note to entity"
    )


@api.post("items/{item_id}/archive", auth=django_auth)
@transaction.atomic
def item_archive(request: HttpRequest, item_id: UUID, payload: VersionPayload):
    item = get_member_item(request, item_id)
    metadata, body = parse_document(current_markdown_for_item(item))
    metadata["status"] = "archived"
    return save_item_markdown(item, serialize_document(metadata, body), request.auth, payload.version, payload.reason)


@api.get("campaigns/{campaign_id}/templates", auth=django_auth)
def template_list(request: HttpRequest, campaign_id: UUID):
    campaign = get_member_campaign(request, campaign_id)
    ensure_default_templates(campaign, request.auth)
    output = []
    for template in campaign.templates.prefetch_related("versions"):
        versions = []
        for version in template.versions.all():
            ensure_template_document(version, request.auth)
            metadata, _ = parse_document(read_current(version.document))
            versions.append(
                {
                    "number": version.number,
                    "markdown": read_current(version.document),
                    "fields": metadata.get("fields", []),
                }
            )
        output.append(
            {"id": template.id, "name": template.name, "applies_to": template.applies_to, "versions": versions}
        )
    return {"templates": output}


@api.post("campaigns/{campaign_id}/templates", auth=django_auth)
@transaction.atomic
def template_create(request: HttpRequest, campaign_id: UUID, payload: dict[str, Any]):
    enforce_csrf(request)
    campaign = get_member_campaign(request, campaign_id)
    markdown = str(payload.get("markdown") or "")
    metadata, _ = parse_document(markdown)
    template = Template.objects.create(
        campaign=campaign,
        name=str(metadata.get("name") or "Template"),
        applies_to=str(metadata.get("applies_to") or "entity"),
    )
    version = TemplateVersion.objects.create(template=template, number=1)
    doc = save_document(
        campaign,
        "template",
        None,
        markdown,
        request.auth,
        "Created template",
    )
    version.document = doc
    version.save(update_fields=["document"])
    return {
        "id": template.id,
        "name": template.name,
        "applies_to": template.applies_to,
        "versions": [{"number": 1, "markdown": markdown, "fields": metadata.get("fields", [])}],
    }


@api.post("templates/{template_id}/versions", auth=django_auth)
@transaction.atomic
def template_version_create(request: HttpRequest, template_id: UUID, payload: dict[str, Any]):
    enforce_csrf(request)
    template = Template.objects.filter(id=template_id, campaign__memberships__user=request.auth).first()
    if not template:
        raise error(404, "not_found", "Template not found")
    number = (template.versions.order_by("-number").values_list("number", flat=True).first() or 0) + 1
    markdown = str(payload.get("markdown") or "")
    metadata, _ = parse_document(markdown)
    version = TemplateVersion.objects.create(template=template, number=number)
    doc = save_document(
        template.campaign,
        "template",
        None,
        markdown,
        request.auth,
        "Created template version",
    )
    version.document = doc
    version.save(update_fields=["document"])
    return {"number": number, "markdown": markdown, "fields": metadata.get("fields", [])}


@api.get("campaigns/{campaign_id}/search", auth=django_auth)
def search(
    request: HttpRequest,
    campaign_id: UUID,
    q: str = "",
    kind: str | None = None,
    tag: str | None = None,
    alias: str | None = None,
    cursor: str | None = None,
    limit: int = 50,
):
    campaign = get_member_campaign(request, campaign_id)
    items = campaign.archive_items.filter(status__in=["draft", "canon"])
    if kind:
        items = items.filter(kind=kind)
    if q:
        if connection.vendor == "postgresql":
            from django.contrib.postgres.search import SearchQuery, SearchVector

            items = items.annotate(search_vector=SearchVector("document__search_text", config="english")).filter(
                search_vector=SearchQuery(q, config="english", search_type="websearch")
            )
        else:
            items = items.filter(Q(document__search_text__icontains=q) | Q(title__icontains=q))
    if tag:
        items = items.filter(item_tags__tag__name=tag)
    if alias:
        items = items.filter(aliases__value__icontains=alias)
    return paginate_items(items.distinct(), cursor, limit)


def mutate_frontmatter(request: HttpRequest, item_id: UUID, mutate, reason: str):
    item = get_member_item(request, item_id)
    metadata, body = parse_document(current_markdown_for_item(item))
    mutate(metadata)
    result = save_item_markdown(
        item,
        serialize_document(metadata, body),
        request.auth,
        item.document.current_version if item.document_id else item.version,
        reason,
    )
    return result


@api.post("items/{item_id}/references", auth=django_auth)
@transaction.atomic
def add_reference(request: HttpRequest, item_id: UUID, payload: ReferencePayload):
    enforce_csrf(request)
    target = get_member_item(request, payload.target_id)
    if target.campaign_id != get_member_item(request, item_id).campaign_id:
        raise error(404, "not_found", "Target item not found")
    result = mutate_frontmatter(
        request,
        item_id,
        lambda m: m.setdefault("references", []).append({"target_id": str(target.id), "label": payload.label.strip()}),
        "Added reference",
    )
    return {"item": result, "target_id": target.id, "label": payload.label.strip()}


def relationship_output(relationship: Relationship) -> dict[str, Any]:
    return {
        "id": relationship.edge_id,
        "source_id": relationship.source_id,
        "target_id": relationship.target_id,
        "source": page_identity(relationship.source),
        "target": page_identity(relationship.target),
        "kind": relationship.kind,
        "label": relationship.label,
        "inverse_label": relationship.inverse_label,
        "notes": relationship.notes,
        "authored_position": relationship.authored_position,
        "source_version": relationship.source_version,
    }


def save_relationship_metadata(request, source: ArchiveItem, metadata, body, version: int, reason: str):
    result = save_item_markdown(source, serialize_document(metadata, body), request.auth, version, reason)
    return result


@api.post("items/{item_id}/relationships", auth=django_auth)
@transaction.atomic
def add_relationship(request: HttpRequest, item_id: UUID, payload: RelationshipPayload):
    enforce_csrf(request)
    source = get_member_item(request, item_id)
    target = get_member_item(request, payload.target_id)
    if source.campaign_id != target.campaign_id:
        raise error(404, "not_found", "Target item not found")
    metadata, body = parse_document(current_markdown_for_item(source))
    edge_id = uuid4()
    metadata.setdefault("relationships", []).append(
        {
            "id": str(edge_id),
            "target_id": str(target.id),
            "kind": payload.kind.strip(),
            "label": payload.label.strip(),
            "inverse_label": payload.inverse_label.strip(),
            "notes": payload.notes,
        }
    )
    item = save_relationship_metadata(request, source, metadata, body, payload.version, "Added relationship")
    relationship = Relationship.objects.get(edge_id=edge_id, source=source)
    return {"relationship": relationship_output(relationship), "item": item}


@api.patch("items/{item_id}/relationships/{edge_id}", auth=django_auth)
@transaction.atomic
def update_relationship(request: HttpRequest, item_id: UUID, edge_id: UUID, payload: RelationshipPayload):
    enforce_csrf(request)
    source = get_member_item(request, item_id)
    target = get_member_item(request, payload.target_id)
    if source.campaign_id != target.campaign_id:
        raise error(404, "not_found", "Target item not found")
    metadata, body = parse_document(current_markdown_for_item(source))
    entry = next((value for value in metadata.get("relationships", []) if str(value.get("id")) == str(edge_id)), None)
    if entry is None:
        raise error(404, "not_found", "Relationship not found")
    entry.update(
        {
            "target_id": str(target.id),
            "kind": payload.kind.strip(),
            "label": payload.label.strip(),
            "inverse_label": payload.inverse_label.strip(),
            "notes": payload.notes,
        }
    )
    item = save_relationship_metadata(request, source, metadata, body, payload.version, "Updated relationship")
    relationship = Relationship.objects.get(edge_id=edge_id, source=source)
    return {"relationship": relationship_output(relationship), "item": item}


@api.delete("items/{item_id}/relationships/{edge_id}", auth=django_auth)
@transaction.atomic
def delete_relationship(request: HttpRequest, item_id: UUID, edge_id: UUID, payload: RelationshipDeletePayload):
    enforce_csrf(request)
    source = get_member_item(request, item_id)
    metadata, body = parse_document(current_markdown_for_item(source))
    relationships = metadata.get("relationships", [])
    retained = [value for value in relationships if str(value.get("id")) != str(edge_id)]
    if len(retained) == len(relationships):
        raise error(404, "not_found", "Relationship not found")
    metadata["relationships"] = retained
    item = save_relationship_metadata(request, source, metadata, body, payload.version, "Deleted relationship")
    return {
        "deleted_id": edge_id,
        "item": item,
    }


@api.post("items/{item_id}/session-links", auth=django_auth)
@transaction.atomic
def add_session_link(request: HttpRequest, item_id: UUID, payload: SessionLinkPayload):
    enforce_csrf(request)
    session = get_member_item(request, item_id)
    target = get_member_item(request, payload.item_id)
    if session.kind != "session" or session.campaign_id != target.campaign_id:
        raise error(422, "validation", "A session can only link items in its campaign")
    result = mutate_frontmatter(
        request, item_id, lambda m: m.setdefault("session_links", []).append(str(target.id)), "Linked session item"
    )
    return {"item": result, "session_id": session.id, "item_id": target.id}


@api.get("items/{item_id}/revisions", auth=django_auth)
def revisions(request: HttpRequest, item_id: UUID):
    item = get_member_item(request, item_id)
    values = []
    for version in item.document.versions.all() if item.document_id else []:
        values.append(
            {
                "number": version.number,
                "reason": version.reason,
                "created_at": version.created_at.isoformat(),
                "markdown": version.markdown,
                "content_hash": version.content_hash,
            }
        )
    return {"revisions": values}


@api.get("items/{item_id}/revisions/{revision_number}", auth=django_auth)
def revision_compare(request: HttpRequest, item_id: UUID, revision_number: int, against: int | None = None):
    item = get_member_item(request, item_id)
    left = item.document.versions.filter(number=revision_number).first() if item.document_id else None
    right = item.document.versions.filter(number=against).first() if item.document_id and against else None
    if not left or (against and not right):
        raise error(404, "not_found", "Revision not found")
    return {
        "revision": revision_number,
        "against": against,
        "markdown": left.markdown,
        "previous_markdown": right.markdown if right else None,
    }


@api.post("items/{item_id}/restore", auth=django_auth)
@transaction.atomic
def restore_revision(request: HttpRequest, item_id: UUID, payload: RestorePayload):
    enforce_csrf(request)
    item = get_member_item(request, item_id)
    version = item.document.versions.filter(number=payload.revision).first() if item.document_id else None
    if not version:
        raise error(404, "not_found", "Revision not found")
    return save_item_markdown(item, version.markdown, request.auth, payload.version, payload.reason)


def random_token() -> tuple[str, str]:
    import secrets

    token = secrets.token_urlsafe(32)
    return token, hashlib.sha256(token.encode()).hexdigest()


def publication_output(publication: Publication, token: str | None = None) -> dict[str, Any]:
    version = publication.versions.get(number=publication.current_version)
    entries = []
    for entry in version.entries.select_related("document"):
        markdown = read_current(entry.document) if entry.document_id else ""
        metadata, body = parse_document(markdown)
        entries.append(
            {
                "item_id": entry.item_id,
                "markdown": markdown,
                "title": metadata.get("title", ""),
                "body": body,
                "html": markdown_html(body),
                "metadata": metadata,
            }
        )
    result = {
        "id": publication.id,
        "status": publication.status,
        "version": version.number,
        "created_at": publication.created_at.isoformat(),
        "updated_at": publication.updated_at.isoformat(),
        "entries": entries,
    }
    if token:
        result.update({"token": token, "url": f"/p/{token}"})
    return result


@api.post("campaigns/{campaign_id}/publications", auth=django_auth)
@transaction.atomic
def publication_create(request: HttpRequest, campaign_id: UUID, payload: PublicationPayload):
    enforce_csrf(request)
    campaign = get_member_campaign(request, campaign_id)
    if not payload.entries:
        raise error(422, "validation", "A publication needs at least one item")
    token, token_hash = random_token()
    publication = Publication.objects.create(campaign=campaign, token_hash=token_hash, token_value=token)
    version = PublicationVersion.objects.create(publication=publication, number=1, created_by=request.auth)
    for selected in payload.entries:
        item = get_member_item(request, selected.item_id)
        if item.campaign_id != campaign.id:
            raise error(404, "not_found", "Publication item not found")
        safe_markdown = safe_publication_markdown(
            selected.markdown, campaign.id, item.id, publication.id, version.number
        )
        entry = PublicationEntry.objects.create(version=version, item=item)
        doc = save_document(
            campaign,
            "publication_entry",
            None,
            safe_markdown,
            request.auth,
            "Created publication",
        )
        entry.document = doc
        entry.save(update_fields=["document"])
    return publication_output(publication, token)


@api.get("campaigns/{campaign_id}/publications", auth=django_auth)
def publication_list(request: HttpRequest, campaign_id: UUID):
    campaign = get_member_campaign(request, campaign_id)
    return {
        "publications": [
            {
                "id": p.id,
                "status": p.status,
                "version": p.current_version,
                "created_at": p.created_at.isoformat(),
                "updated_at": p.updated_at.isoformat(),
                "url": f"/p/{p.token_value}" if p.token_value else None,
                "item_ids": list(p.versions.get(number=p.current_version).entries.values_list("item_id", flat=True)),
            }
            for p in campaign.publications.all()
        ]
    }


@api.get("publications/{publication_id}", auth=django_auth)
def publication_detail(request: HttpRequest, publication_id: UUID):
    publication = Publication.objects.filter(id=publication_id, campaign__memberships__user=request.auth).first()
    if not publication:
        raise error(404, "not_found", "Publication not found")
    response = JsonResponse(publication_output(publication))
    response["Cache-Control"] = "no-store"
    return response


@api.post("publications/{publication_id}/revoke", auth=django_auth)
@transaction.atomic
def publication_revoke(request: HttpRequest, publication_id: UUID):
    enforce_csrf(request)
    publication = Publication.objects.filter(id=publication_id, campaign__memberships__user=request.auth).first()
    if not publication:
        raise error(404, "not_found", "Publication not found")
    publication.status = "revoked"
    publication.revoked_at = timezone.now()
    publication.save(update_fields=["status", "revoked_at", "updated_at"])
    return {"status": publication.status}


@api.get("publications/public/{token}", auth=None)
def public_publication(request: HttpRequest, token: str):
    publication = Publication.objects.filter(
        token_hash=hashlib.sha256(token.encode()).hexdigest(), status="active"
    ).first()
    response = JsonResponse(
        {"status": "not_found"} if not publication else publication_output(publication),
        status=404 if not publication else 200,
    )
    response["Cache-Control"] = "no-store"
    response["Referrer-Policy"] = "no-referrer"
    return response


RELATIVE_MARKDOWN_LINK_PATTERN = re.compile(r"\[([^\]]+)\]\(([^)]+\.md)\)")


def _export_relative_links(body: str, source_path: str, logical_paths: dict[str, str]) -> str:
    """Rewrite canonical links to portable paths while retaining labels."""
    canonical = re.compile(r"\[([^\]]+)\]\(dmhq://(item|campaign)/([0-9a-fA-F-]{36})\)")

    def replace(match):
        target_path = logical_paths.get(match.group(3))
        if not target_path:
            return match.group(0)
        relative = posixpath.relpath(target_path, posixpath.dirname(source_path))
        return f"[{match.group(1)}]({relative})"

    return canonical.sub(replace, body)


def _restore_canonical_links(
    body: str, source_path: str, archive_paths: dict[str, str], id_maps: dict[str, dict[str, str]]
) -> str:
    """Resolve exported relative Markdown links back to remapped canonical IDs."""
    path_to_id = {posixpath.normpath(path): logical_id for logical_id, path in archive_paths.items()}

    def replace(match):
        target_path = posixpath.normpath(posixpath.join(posixpath.dirname(source_path), match.group(2)))
        old_id = path_to_id.get(target_path)
        if not old_id:
            return match.group(0)
        if old_id in id_maps["items"]:
            return f"[{match.group(1)}](dmhq://item/{id_maps['items'][old_id]})"
        if old_id in id_maps["campaigns"]:
            return f"[{match.group(1)}](dmhq://campaign/{id_maps['campaigns'][old_id]})"
        return match.group(0)

    body = RELATIVE_MARKDOWN_LINK_PATTERN.sub(replace, body)

    def remap_canonical(match):
        mapping = id_maps["items"] if match.group(2) == "item" else id_maps["campaigns"]
        target_id = mapping.get(match.group(3), match.group(3))
        return f"[{match.group(1)}](dmhq://{match.group(2)}/{target_id})"

    canonical = re.compile(r"\[([^\]]+)\]\(dmhq://(item|campaign)/([0-9a-fA-F-]{36})\)")
    return canonical.sub(remap_canonical, body)


def _remap_navigation(nodes: list[Any], item_ids: dict[str, str], campaign_ids: dict[str, str]) -> None:
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node["id"] = str(uuid4())
        if node.get("type") == "group":
            _remap_navigation(node.get("children", []), item_ids, campaign_ids)
        target = node.get("target")
        if isinstance(target, dict) and target.get("id"):
            mapping = item_ids if target.get("type") == "item" else campaign_ids
            target["id"] = mapping.get(str(target["id"]), str(target["id"]))


def _remap_archive_metadata(meta: dict[str, Any], id_maps: dict[str, dict[str, str]]) -> None:
    """Rewrite every logical reference stored in canonical frontmatter."""
    item_ids = id_maps["items"]
    if meta.get("document_type") == "campaign":
        archive = meta.get("archive") or {}
        _remap_navigation(archive.get("navigation", []), item_ids, id_maps["campaigns"])
        view_order = archive.get("view_order") or {}
        for key in ("maps", "relationships"):
            view_order[key] = [id_maps["views"].get(str(value), str(value)) for value in view_order.get(key, [])]
    elif meta.get("document_type") == "archive_item":
        for key in ("references", "relationships"):
            for entry in meta.get(key, []):
                if isinstance(entry, dict) and entry.get("target_id"):
                    entry["target_id"] = item_ids.get(str(entry["target_id"]), str(entry["target_id"]))
                if key == "relationships" and isinstance(entry, dict) and entry.get("id"):
                    entry["id"] = id_maps["edges"].get(str(entry["id"]), str(entry["id"]))
        if isinstance(meta.get("session_links"), list):
            meta["session_links"] = [item_ids.get(str(value), str(value)) for value in meta["session_links"]]
        template = meta.get("template")
        if isinstance(template, dict) and template.get("id"):
            template["id"] = id_maps["templates"].get(str(template["id"]), str(template["id"]))
    elif meta.get("document_type") == "archive_view":
        if meta.get("view_type") == "map":
            for placement in meta.get("placements", []):
                placement["id"] = id_maps["placements"].get(str(placement["id"]), str(placement["id"]))
                placement["item_id"] = item_ids.get(str(placement["item_id"]), str(placement["item_id"]))
        else:
            for member in meta.get("members", []):
                member["id"] = id_maps["members"].get(str(member["id"]), str(member["id"]))
                member["item_id"] = item_ids.get(str(member["item_id"]), str(member["item_id"]))
            settings = meta.get("settings") or {}
            if settings.get("root_item_id"):
                settings["root_item_id"] = item_ids.get(str(settings["root_item_id"]), str(settings["root_item_id"]))


def export_campaign(campaign, user=None) -> bytes:
    if not campaign.document_id and user is not None:
        ensure_campaign_document(campaign, user)
    documents = list(campaign.documents.all())
    logical_paths: dict[str, str] = {}
    for document in documents:
        if document.document_type == "publication_entry":
            continue
        metadata, _ = parse_document(read_current(document))
        if metadata.get("id"):
            logical_paths[str(metadata["id"])] = document.storage_key

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "manifest.json",
            json.dumps(
                {
                    "format": "dm-hq-markdown-archive",
                    "version": 2,
                    "documents": logical_paths,
                    "publications": [
                        {
                            "id": str(publication.id),
                            "status": publication.status,
                            "current_version": publication.current_version,
                            "revoked_at": publication.revoked_at.isoformat() if publication.revoked_at else None,
                        }
                        for publication in campaign.publications.all()
                    ],
                },
                indent=2,
            ),
        )
        for doc in documents:
            if doc.document_type == "publication_entry" and not doc.storage_key.startswith(f"campaigns/{campaign.id}/"):
                continue
            markdown = read_current(doc)
            metadata, body = parse_document(markdown)
            portable = serialize_document(metadata, _export_relative_links(body, doc.storage_key, logical_paths))
            archive.writestr(doc.storage_key, portable)
            for version in doc.versions.all():
                archive.writestr(f"revisions/{doc.id}/v{version.number}.md", version.markdown)
    return output.getvalue()


@api.get("campaigns/{campaign_id}/exports", auth=django_auth)
def campaign_export(request: HttpRequest, campaign_id: UUID):
    campaign = get_member_campaign(request, campaign_id)
    response = HttpResponse(export_campaign(campaign, request.auth), content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="{campaign.name.replace(" ", "-").lower()}-archive.zip"'
    response["Cache-Control"] = "no-store"
    return response


def workspace_document_output(document: CampaignDocument, previous_storage_key: str | None = None) -> dict[str, Any]:
    return {
        "document_id": str(document.id),
        "storage_key": document.storage_key,
        "previous_storage_key": previous_storage_key or None,
        "markdown": read_current(document),
        "version": document.current_version,
        "hash": document.content_hash,
    }


def workspace_limit(limit: int) -> int:
    return max(1, min(limit, 500))


@api.get(
    "campaigns/{campaign_id}/workspace/snapshot", auth=[django_auth, agent_bearer_auth], response=WorkspaceSnapshotOut
)
def workspace_snapshot(
    request: HttpRequest, campaign_id: UUID, after: str = "", limit: int = 100, cursor: int | None = None
):
    campaign = get_member_campaign(request, campaign_id)
    limit = workspace_limit(limit)
    documents = campaign.documents.exclude(document_type="publication_entry").order_by("storage_key")
    if after:
        documents = documents.filter(storage_key__gt=after)
    rows = list(documents[: limit + 1])
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_after = rows[-1].storage_key if has_more and rows else None
    if cursor is None:
        cursor = (
            WorkspaceChange.objects.filter(campaign=campaign).order_by("-id").values_list("id", flat=True).first() or 0
        )
    return {
        "manifest": {
            "format": "dm-hq-workspace",
            "version": 2,
            "campaign_id": str(campaign.id),
            "cursor": cursor,
            "next_after": next_after,
            "has_more": has_more,
        },
        "files": [workspace_document_output(document) for document in rows],
    }


@api.get(
    "campaigns/{campaign_id}/workspace/changes", auth=[django_auth, agent_bearer_auth], response=WorkspaceChangesOut
)
def workspace_changes(request: HttpRequest, campaign_id: UUID, after: int = 0, limit: int = 100):
    campaign = get_member_campaign(request, campaign_id)
    limit = workspace_limit(limit)
    events = list(
        WorkspaceChange.objects.filter(campaign=campaign, id__gt=after)
        .exclude(document__document_type="publication_entry")
        .order_by("id")[: limit + 1]
    )
    has_more = len(events) > limit
    events = events[:limit]
    cursor = events[-1].id if events else after
    changes = [
        {
            "document_id": str(event.document_identifier),
            "storage_key": event.storage_key,
            "previous_storage_key": event.previous_storage_key or None,
            "operation": event.operation,
            "version": event.version,
            "hash": event.content_hash,
            "markdown": event.markdown if event.operation != WorkspaceChange.Operation.DELETE else None,
        }
        for event in events
    ]
    return {"cursor": cursor, "has_more": has_more, "changes": changes}


@api.get(
    "campaigns/{campaign_id}/workspace/documents/{document_id}",
    auth=[django_auth, agent_bearer_auth],
    response=WorkspaceDocumentOut,
)
def workspace_document(request: HttpRequest, campaign_id: UUID, document_id: UUID):
    campaign = get_member_campaign(request, campaign_id)
    document = (
        CampaignDocument.objects.filter(id=document_id, campaign=campaign)
        .exclude(document_type="publication_entry")
        .first()
    )
    if document is None:
        raise error(404, "not_found", "Document not found")
    return workspace_document_output(document)


@api.post(
    "campaigns/{campaign_id}/workspace/apply", auth=[django_auth, agent_bearer_auth], response=WorkspaceDocumentOut
)
@csrf_exempt
@transaction.atomic
def workspace_apply(request: HttpRequest, campaign_id: UUID, payload: WorkspaceApplyPayload):
    enforce_csrf(request)
    campaign = get_member_campaign(request, campaign_id)
    doc = (
        CampaignDocument.objects.filter(id=payload.document_id, campaign=campaign)
        .exclude(document_type="publication_entry")
        .first()
    )
    if not doc:
        raise error(404, "not_found", "Document not found")
    previous_storage_key = doc.storage_key
    if doc.current_version != payload.version or (payload.hash and doc.content_hash != payload.hash):
        raise error(409, "stale_version", "The document changed since it was opened")
    try:
        metadata, _ = parse_document(payload.markdown)
        if doc.document_type == "archive_item":
            item = ArchiveItem.objects.filter(document=doc, campaign=campaign).first()
            if not item:
                raise error(404, "not_found", "Archive item not found")
            save_item_markdown(item, payload.markdown, request.auth, payload.version, payload.reason)
            updated = item.document
        else:
            updated = save_document(
                campaign,
                doc.document_type,
                doc.storage_key,
                payload.markdown,
                request.auth,
                payload.reason,
                payload.version,
                doc,
            )
            if doc.document_type == "campaign":
                campaign.name = str(metadata.get("title") or campaign.name)
                campaign.save(update_fields=["name", "updated_at"])
            elif doc.document_type == "template":
                version = TemplateVersion.objects.filter(document=doc).first()
                if version:
                    version.template.name = str(metadata.get("name") or version.template.name)
                    version.template.save(update_fields=["name"])
        return workspace_document_output(
            updated, previous_storage_key if updated.storage_key != previous_storage_key else None
        )
    except DocumentError as exc:
        if str(exc) == "stale_version":
            raise error(409, "stale_version", "The document changed since it was opened") from exc
        raise error(422, "invalid_markdown", str(exc)) from exc


@api.post("exports/restore", auth=django_auth)
@transaction.atomic
def campaign_restore(request: HttpRequest):
    enforce_csrf(request)
    uploaded = request.FILES.get("archive")
    if not uploaded:
        raise error(422, "validation", "Upload an archive file")
    try:
        with zipfile.ZipFile(io.BytesIO(uploaded.read())) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            if manifest.get("format") != "dm-hq-markdown-archive" or manifest.get("version") != 2:
                raise ValueError

            names = [
                name
                for name in archive.namelist()
                if name.startswith("campaigns/") and name.endswith(".md") and "/publications/" not in name
            ]
            parsed: dict[str, tuple[dict[str, Any], str]] = {
                name: parse_document(archive.read(name).decode("utf-8")) for name in names
            }
            campaign_file = next(name for name, (meta, _) in parsed.items() if meta.get("document_type") == "campaign")
            campaign_metadata, campaign_body = parsed[campaign_file]
            old_campaign_id = str(campaign_metadata.get("id") or campaign_metadata.get("campaign_id"))
            campaign = Campaign.objects.create(
                name=str(campaign_metadata.get("title") or "Restored campaign"), owner=request.auth
            )
            CampaignMembership.objects.create(campaign=campaign, user=request.auth, role=CampaignMembership.Role.OWNER)

            id_maps: dict[str, dict[str, str]] = {
                "campaigns": {old_campaign_id: str(campaign.id)},
                "items": {},
                "templates": {},
                "views": {},
                "edges": {},
                "placements": {},
                "members": {},
            }
            for meta, _ in parsed.values():
                document_type = meta.get("document_type")
                if document_type == "archive_item" and meta.get("id"):
                    id_maps["items"][str(meta["id"])] = str(uuid4())
                    for relationship in meta.get("relationships", []):
                        if isinstance(relationship, dict) and relationship.get("id"):
                            id_maps["edges"][str(relationship["id"])] = str(uuid4())
                elif document_type == "template" and meta.get("template_id"):
                    id_maps["templates"][str(meta["template_id"])] = str(uuid4())
                elif document_type == "archive_view" and meta.get("id"):
                    id_maps["views"][str(meta["id"])] = str(uuid4())
                    for placement in meta.get("placements", []):
                        if isinstance(placement, dict) and placement.get("id"):
                            id_maps["placements"][str(placement["id"])] = str(uuid4())
                    for member in meta.get("members", []):
                        if isinstance(member, dict) and member.get("id"):
                            id_maps["members"][str(member["id"])] = str(uuid4())

            archive_paths = {
                str(logical_id): str(path) for logical_id, path in (manifest.get("documents") or {}).items()
            }
            if not archive_paths:
                archive_paths = {str(meta["id"]): name for name, (meta, _) in parsed.items() if meta.get("id")}

            # Allocate item shells before validating any cross-document references.
            for _name, (meta, _) in parsed.items():
                if meta.get("document_type") != "archive_item":
                    continue
                item = ArchiveItem.objects.create(
                    id=UUID(id_maps["items"][str(meta["id"])]),
                    campaign=campaign,
                    kind=str(meta.get("kind") or "note"),
                    title=str(meta.get("title") or "Untitled"),
                    status=str(meta.get("status") or "draft"),
                )
                if item.kind == "entity":
                    EntityDetail.objects.create(item=item)
                if item.kind == "session":
                    SessionDetail.objects.create(item=item)

            template_names = [name for name, (meta, _) in parsed.items() if meta.get("document_type") == "template"]
            for name in sorted(template_names):
                meta, body = parsed[name]
                template_id = UUID(id_maps["templates"][str(meta["template_id"])])
                meta["template_id"] = str(template_id)
                meta["campaign_id"] = str(campaign.id)
                meta["id"] = str(uuid4())
                template = Template.objects.create(
                    id=template_id,
                    campaign=campaign,
                    name=str(meta.get("name") or "Template"),
                    applies_to=str(meta.get("applies_to") or "entity"),
                )
                number = int(meta.get("version") or 1)
                version = TemplateVersion.objects.create(template=template, number=number)
                document = save_document(
                    campaign,
                    "template",
                    None,
                    serialize_document(meta, body),
                    request.auth,
                    "Restored template",
                )
                version.document = document
                version.save(update_fields=["document"])

            for name, (meta, body) in sorted(parsed.items()):
                if meta.get("document_type") != "archive_item":
                    continue
                old_item_id = str(meta["id"])
                meta["campaign_id"] = str(campaign.id)
                _remap_archive_metadata(meta, id_maps)
                meta["id"] = id_maps["items"][old_item_id]
                fields = meta.get("fields")
                if isinstance(fields, dict):
                    for key, value in fields.items():
                        fields[key] = id_maps["items"].get(str(value), value)
                body = _restore_canonical_links(body, name, archive_paths, id_maps)
                item = ArchiveItem.objects.get(id=meta["id"], campaign=campaign)
                save_item_markdown(item, serialize_document(meta, body), request.auth, 0, "Restored item")

            for name, (meta, body) in sorted(parsed.items()):
                if meta.get("document_type") != "archive_view":
                    continue
                old_view_id = str(meta["id"])
                meta["campaign_id"] = str(campaign.id)
                _remap_archive_metadata(meta, id_maps)
                meta["id"] = id_maps["views"][old_view_id]
                body = _restore_canonical_links(body, name, archive_paths, id_maps)
                document = save_document(
                    campaign,
                    "archive_view",
                    None,
                    serialize_document(meta, body),
                    request.auth,
                    "Restored view",
                )
                ArchiveView.objects.create(
                    id=UUID(meta["id"]),
                    campaign=campaign,
                    document=document,
                    view_type=str(meta["view_type"]),
                    title=str(meta.get("title") or "Untitled"),
                    status=str(meta.get("status") or "active"),
                )

            campaign_metadata["campaign_id"] = str(campaign.id)
            campaign_metadata["id"] = str(campaign.id)
            _remap_archive_metadata(campaign_metadata, id_maps)
            campaign_body = _restore_canonical_links(campaign_body, campaign_file, archive_paths, id_maps)
            document = save_document(
                campaign,
                "campaign",
                None,
                serialize_document(campaign_metadata, campaign_body),
                request.auth,
                "Restored campaign",
            )
            campaign.document = document
            campaign.save(update_fields=["document"])

            restored_publications = {
                str(value["id"]): value for value in manifest.get("publications", []) if value.get("id")
            }
            for publication_id, publication_meta in restored_publications.items():
                token, token_hash = random_token()
                publication = Publication.objects.create(
                    campaign=campaign,
                    token_hash=token_hash,
                    token_value=token,
                    status=publication_meta.get("status") or "active",
                    current_version=int(publication_meta.get("current_version") or 1),
                    revoked_at=None,
                )
                for name in archive.namelist():
                    parts = name.split("/")
                    if len(parts) < 6 or parts[2] != "publications" or not name.endswith(".md"):
                        continue
                    meta, body = parse_document(archive.read(name).decode("utf-8"))
                    archived_publication_id = str(meta.get("publication_id") or parts[3])
                    if archived_publication_id != publication_id:
                        continue
                    source_id = str(meta.get("source_item_id") or "")
                    source_item_id = id_maps["items"].get(source_id)
                    if not source_item_id:
                        continue
                    item = ArchiveItem.objects.get(id=source_item_id, campaign=campaign)
                    number = int(parts[-2].lstrip("v") or 1)
                    meta.update(
                        {
                            "id": str(uuid4()),
                            "campaign_id": str(campaign.id),
                            "document_type": "publication_entry",
                            "publication_id": str(publication.id),
                            "source_item_id": source_item_id,
                            "version": number,
                        }
                    )
                    version, _ = PublicationVersion.objects.get_or_create(
                        publication=publication, number=number, defaults={"created_by": request.auth}
                    )
                    entry, _ = PublicationEntry.objects.get_or_create(version=version, item=item)
                    entry.document = save_document(
                        campaign,
                        "publication_entry",
                        None,
                        serialize_document(meta, body),
                        request.auth,
                        "Restored publication",
                    )
                    entry.save(update_fields=["document"])
            if not template_names:
                ensure_default_templates(campaign, request.auth)
    except (zipfile.BadZipFile, KeyError, StopIteration, ValueError, DocumentError) as exc:
        raise error(422, "invalid_archive", "The Markdown archive could not be validated") from exc
    return campaign_output(campaign)
