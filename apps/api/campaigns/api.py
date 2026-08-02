import hashlib
import io
import json
import zipfile
from typing import Any
from uuid import UUID, uuid4

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.db import DatabaseError, connection, transaction
from django.db.models import Q
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.middleware.csrf import CsrfViewMiddleware, get_token
from django.utils import timezone
from ninja import NinjaAPI, Schema
from ninja.errors import HttpError
from ninja.security import django_auth

from .documents import (
    DocumentError,
    content_hash,
    current_markdown_for_item,
    item_document_output,
    markdown_html,
    parse_document,
    project_item,
    read_current,
    save_document,
    serialize_document,
    storage_root,
)
from .models import (
    ArchiveItem,
    Campaign,
    CampaignDocument,
    CampaignMembership,
    EntityDetail,
    ItemRevision,
    Publication,
    PublicationEntry,
    PublicationVersion,
    SessionDetail,
    Template,
    TemplateVersion,
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
    target_id: UUID
    kind: str
    reciprocal_label: str = ""
    notes: str = ""


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


class WorkspaceApplyPayload(Schema):
    document_id: UUID
    version: int
    markdown: str
    reason: str = "Workspace update"


def error(status: int, code: str, message: str) -> HttpError:
    return HttpError(status, f"{code}: {message}")


def enforce_csrf(request: HttpRequest) -> None:
    middleware = CsrfViewMiddleware(lambda current_request: None)
    if middleware.process_view(request, None, (), {}) is not None:
        raise HttpError(403, "csrf_failed: CSRF verification failed")


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
        f"campaigns/{campaign.id}/campaign.md",
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


def ensure_template_document(version: TemplateVersion, user) -> None:
    if version.document_id:
        return
    fields = []
    metadata = {
        "document_type": "template",
        "id": str(uuid4()),
        "campaign_id": str(version.template.campaign_id),
        "template_id": str(version.template_id),
        "version": version.number,
        "name": version.template.name,
        "applies_to": version.template.applies_to,
        "fields": fields,
    }
    doc = save_document(
        version.template.campaign,
        "template",
        f"campaigns/{version.template.campaign_id}/templates/{version.template_id}/v{version.number}.md",
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
    for template, _fields in ((person, person_fields), (session, session_fields)):
        version, _ = TemplateVersion.objects.get_or_create(template=template, number=1)
        ensure_template_document(version, user)


def template_fields(version: TemplateVersion | None) -> list[dict[str, Any]]:
    if not version:
        return []
    if version.document_id:
        metadata, _ = parse_document(read_current(version.document))
        return metadata.get("fields", [])
    return []


def record_legacy_revision(item: ArchiveItem, user, markdown: str, reason: str) -> None:
    digest = content_hash(markdown)
    ItemRevision.objects.update_or_create(
        item=item,
        number=item.document.current_version if item.document_id else item.version,
        defaults={"markdown": markdown, "content_hash": digest, "created_by": user, "reason": reason},
    )


def save_item_markdown(item: ArchiveItem, markdown: str, user, expected_version: int, reason: str) -> dict[str, Any]:
    try:
        metadata, _ = parse_document(markdown)
        if metadata.get("kind") != item.kind:
            raise DocumentError("Document kind does not match item")
        doc = save_document(
            item.campaign,
            "archive_item",
            f"campaigns/{item.campaign_id}/items/{item.id}.md",
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
    record_legacy_revision(item, user, doc.versions.get(number=doc.current_version).markdown, reason)
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


@api.get("campaigns", auth=django_auth, response=list[CampaignOut])
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
        f"campaigns/{campaign.id}/campaign.md",
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


@api.get("campaigns/{campaign_id}/items", auth=django_auth)
def item_list(request: HttpRequest, campaign_id: UUID, kind: str | None = None, status: str | None = None):
    campaign = get_member_campaign(request, campaign_id)
    items = campaign.archive_items.all()
    if kind:
        items = items.filter(kind=kind)
    if status:
        items = items.filter(status=status)
    return {"items": [item_summary(item) for item in items], "next_cursor": None}


@api.get("campaigns/{campaign_id}/sessions", auth=django_auth)
def session_list(request: HttpRequest, campaign_id: UUID):
    campaign = get_member_campaign(request, campaign_id)
    return {"sessions": [item_summary(i) for i in campaign.archive_items.filter(kind="session")]}


@api.post("campaigns/{campaign_id}/sessions", auth=django_auth)
@transaction.atomic
def session_create(request: HttpRequest, campaign_id: UUID, payload: ItemCreate):
    return item_create(request, campaign_id, payload.model_copy(update={"kind": "session"}))


@api.post("campaigns/{campaign_id}/items", auth=django_auth)
@transaction.atomic
def item_create(request: HttpRequest, campaign_id: UUID, payload: ItemCreate):
    enforce_csrf(request)
    campaign = get_member_campaign(request, campaign_id)
    validate_kind(payload.kind)
    try:
        metadata, _ = parse_document(payload.markdown)
    except DocumentError as exc:
        raise error(422, "invalid_markdown", str(exc)) from exc
    if metadata.get("document_type") != "archive_item" or metadata.get("kind") != payload.kind:
        raise error(422, "invalid_markdown", "Frontmatter document_type and kind must match the request")
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
    result = save_item_markdown(item, payload.markdown, request.auth, 0, "Created")
    return result


@api.get("items/{item_id}", auth=django_auth)
def item_detail(request: HttpRequest, item_id: UUID):
    return item_document_output(get_member_item(request, item_id))


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
        f"campaigns/{campaign.id}/templates/{template.id}/v1.md",
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
        f"campaigns/{template.campaign_id}/templates/{template.id}/v{number}.md",
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
):
    campaign = get_member_campaign(request, campaign_id)
    items = campaign.archive_items.filter(status__in=["draft", "canon"])
    if kind:
        items = items.filter(kind=kind)
    if q:
        items = items.filter(Q(document__search_text__icontains=q) | Q(title__icontains=q))
    if tag:
        items = items.filter(item_tags__tag__name=tag)
    if alias:
        items = items.filter(aliases__value__icontains=alias)
    return {"items": [item_summary(i) for i in items.distinct()], "next_cursor": None}


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


@api.post("items/{item_id}/relationships", auth=django_auth)
@transaction.atomic
def add_relationship(request: HttpRequest, item_id: UUID, payload: RelationshipPayload):
    enforce_csrf(request)
    target = get_member_item(request, payload.target_id)
    source = get_member_item(request, item_id)
    if source.campaign_id != target.campaign_id:
        raise error(404, "not_found", "Target item not found")
    result = mutate_frontmatter(
        request,
        item_id,
        lambda m: m.setdefault("relationships", []).append(
            {
                "target_id": str(target.id),
                "kind": payload.kind,
                "reciprocal_label": payload.reciprocal_label,
                "notes": payload.notes,
            }
        ),
        "Added relationship",
    )
    return {
        "item": result,
        "target_id": target.id,
        "kind": payload.kind,
        "label": payload.reciprocal_label,
        "notes": payload.notes,
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
        metadata, body = parse_document(selected.markdown)
        metadata["document_type"] = "publication_entry"
        metadata["id"] = str(uuid4())
        metadata["source_item_id"] = str(item.id)
        metadata.pop("relationships", None)
        metadata.pop("references", None)
        entry = PublicationEntry.objects.create(version=version, item=item)
        doc = save_document(
            campaign,
            "publication_entry",
            f"campaigns/{campaign.id}/publications/{publication.id}/v1/{item.id}.md",
            serialize_document(metadata, body),
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


def export_campaign(campaign, user=None) -> bytes:
    if not campaign.document_id and user is not None:
        ensure_campaign_document(campaign, user)
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "manifest.json",
            json.dumps(
                {
                    "format": "dm-hq-markdown-archive",
                    "version": 2,
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
        for doc in campaign.documents.all():
            if doc.document_type == "publication_entry" and not doc.storage_key.startswith(f"campaigns/{campaign.id}/"):
                continue
            path = storage_root() / doc.storage_key
            if path.exists():
                archive.write(path, doc.storage_key)
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


@api.get("campaigns/{campaign_id}/workspace/snapshot", auth=django_auth)
def workspace_snapshot(request: HttpRequest, campaign_id: UUID):
    campaign = get_member_campaign(request, campaign_id)
    files = []
    for doc in campaign.documents.all().order_by("storage_key"):
        files.append(
            {
                "document_id": str(doc.id),
                "storage_key": doc.storage_key,
                "version": doc.current_version,
                "hash": doc.content_hash,
                "markdown": read_current(doc),
            }
        )
    cursor = max([0, *[file["version"] for file in files]])
    return {
        "manifest": {"format": "dm-hq-workspace", "version": 1, "campaign_id": str(campaign.id), "cursor": cursor},
        "files": files,
    }


@api.get("campaigns/{campaign_id}/workspace/changes", auth=django_auth)
def workspace_changes(request: HttpRequest, campaign_id: UUID, after: int = 0):
    campaign = get_member_campaign(request, campaign_id)
    changes = []
    for doc in campaign.documents.all():
        if doc.current_version > after:
            changes.append(
                {
                    "document_id": str(doc.id),
                    "storage_key": doc.storage_key,
                    "version": doc.current_version,
                    "hash": doc.content_hash,
                    "operation": "upsert",
                }
            )
    return {"cursor": max([after, *[change["version"] for change in changes]]), "changes": changes}


@api.post("campaigns/{campaign_id}/workspace/apply", auth=django_auth)
@transaction.atomic
def workspace_apply(request: HttpRequest, campaign_id: UUID, payload: WorkspaceApplyPayload):
    enforce_csrf(request)
    campaign = get_member_campaign(request, campaign_id)
    doc = CampaignDocument.objects.filter(id=payload.document_id, campaign=campaign).first()
    if not doc:
        raise error(404, "not_found", "Document not found")
    try:
        metadata, _ = parse_document(payload.markdown)
        if doc.document_type == "archive_item":
            item = ArchiveItem.objects.filter(document=doc, campaign=campaign).first()
            if not item:
                raise error(404, "not_found", "Archive item not found")
            return save_item_markdown(item, payload.markdown, request.auth, payload.version, payload.reason)
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
        return {
            "document_id": str(updated.id),
            "markdown": payload.markdown,
            "version": updated.current_version,
            "hash": updated.content_hash,
        }
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
            campaign_file = next(
                name for name in archive.namelist() if name.endswith("/campaign.md") or name == "campaign.md"
            )
            campaign_metadata, campaign_body = parse_document(archive.read(campaign_file).decode("utf-8"))
            campaign = Campaign.objects.create(
                name=str(campaign_metadata.get("title") or "Restored campaign"), owner=request.auth
            )
            CampaignMembership.objects.create(campaign=campaign, user=request.auth, role=CampaignMembership.Role.OWNER)
            campaign_metadata["id"] = str(campaign.id)
            campaign_metadata["campaign_id"] = str(campaign.id)
            doc = save_document(
                campaign,
                "campaign",
                f"campaigns/{campaign.id}/campaign.md",
                serialize_document(campaign_metadata, campaign_body),
                request.auth,
                "Restored campaign",
            )
            campaign.document = doc
            campaign.save(update_fields=["document"])
            template_names = [name for name in archive.namelist() if "/templates/" in name and name.endswith(".md")]
            for name in archive.namelist():
                if not name.startswith("campaigns/") or not name.endswith(".md") or name.endswith("/campaign.md"):
                    continue
                raw = archive.read(name).decode("utf-8")
                meta, body = parse_document(raw)
                if meta.get("document_type") == "template":
                    template_id = UUID(str(meta.get("template_id"))) if meta.get("template_id") else uuid4()
                    template, _ = Template.objects.get_or_create(
                        id=template_id,
                        campaign=campaign,
                        defaults={
                            "name": str(meta.get("name") or "Template"),
                            "applies_to": str(meta.get("applies_to") or "entity"),
                        },
                    )
                    number = int(meta.get("version") or 1)
                    version, _ = TemplateVersion.objects.get_or_create(template=template, number=number)
                    meta["campaign_id"] = str(campaign.id)
                    document = save_document(
                        campaign,
                        "template",
                        f"campaigns/{campaign.id}/templates/{template.id}/v{number}.md",
                        serialize_document(meta, body),
                        request.auth,
                        "Restored template",
                    )
                    version.document = document
                    version.save(update_fields=["document"])
                    continue
                if meta.get("document_type") != "archive_item":
                    continue
                meta["campaign_id"] = str(campaign.id)
                item_id = UUID(str(meta["id"])) if meta.get("id") else UUID(int=0)
                item = ArchiveItem.objects.create(
                    id=item_id,
                    campaign=campaign,
                    kind=str(meta.get("kind") or "note"),
                    title=str(meta.get("title") or "Untitled"),
                    status=str(meta.get("status") or "draft"),
                )
                if item.kind == "entity":
                    EntityDetail.objects.create(item=item)
                if item.kind == "session":
                    SessionDetail.objects.create(item=item)
                save_item_markdown(item, serialize_document(meta, body), request.auth, 0, "Restored item")
            restored_publications = {
                str(value["id"]): value for value in manifest.get("publications", []) if value.get("id")
            }
            for publication_id, publication_meta in restored_publications.items():
                restored_id = uuid4()
                token, token_hash = random_token()
                publication = Publication.objects.create(
                    id=restored_id,
                    campaign=campaign,
                    token_hash=token_hash,
                    token_value=token,
                    status=publication_meta.get("status") or "active",
                    current_version=int(publication_meta.get("current_version") or 1),
                    revoked_at=None,
                )
                for name in archive.namelist():
                    parts = name.split("/")
                    if (
                        len(parts) < 6
                        or parts[2] != "publications"
                        or parts[3] != publication_id
                        or not name.endswith(".md")
                    ):
                        continue
                    raw = archive.read(name).decode("utf-8")
                    meta, body = parse_document(raw)
                    meta["campaign_id"] = str(campaign.id)
                    meta["document_type"] = "publication_entry"
                    try:
                        source_item_id = UUID(str(meta.get("source_item_id") or parts[-1][:-3]))
                    except ValueError:
                        continue
                    item = ArchiveItem.objects.filter(id=source_item_id, campaign=campaign).first()
                    if not item:
                        continue
                    number = int(parts[-2].lstrip("v") or 1)
                    version, _ = PublicationVersion.objects.get_or_create(
                        publication=publication, number=number, defaults={"created_by": request.auth}
                    )
                    entry, _ = PublicationEntry.objects.get_or_create(version=version, item=item)
                    document = save_document(
                        campaign,
                        "publication_entry",
                        f"campaigns/{campaign.id}/publications/{publication.id}/v{number}/{item.id}.md",
                        serialize_document(meta, body),
                        request.auth,
                        "Restored publication",
                    )
                    entry.document = document
                    entry.save(update_fields=["document"])
            if not template_names:
                ensure_default_templates(campaign, request.auth)
    except (zipfile.BadZipFile, KeyError, ValueError, DocumentError) as exc:
        raise error(422, "invalid_archive", "The Markdown archive could not be validated") from exc
    return campaign_output(campaign)
