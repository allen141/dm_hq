import hashlib
import json
from datetime import date
from typing import Any
from uuid import UUID

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.db import DatabaseError, connection, transaction
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.middleware.csrf import CsrfViewMiddleware, get_token
from django.utils import timezone
from ninja import NinjaAPI, Schema
from ninja.errors import HttpError
from ninja.security import django_auth

from .models import (
    Alias,
    ArchiveItem,
    Campaign,
    CampaignMembership,
    EntityDetail,
    ItemRevision,
    ItemTag,
    Publication,
    PublicationEntry,
    PublicationVersion,
    Reference,
    Relationship,
    SessionDetail,
    SessionLink,
    Tag,
    Template,
    TemplateVersion,
)
from .services import (
    clean_markdown,
    ensure_person_template,
    export_campaign,
    item_snapshot,
    markdown_html,
    publication_output,
    random_publication_token,
    read_export,
    record_revision,
)

api = NinjaAPI(title="DM HQ API", version="1.0.0")


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
    title: str
    body: str = ""
    status: str = "draft"
    subject_type: str | None = None
    template_id: UUID | None = None
    fields: dict[str, Any] = {}
    aliases: list[str] = []
    tags: list[str] = []
    scheduled_for: date | None = None
    session_status: str = "planned"
    outcome_text: str = ""


class ItemUpdate(Schema):
    version: int
    title: str | None = None
    body: str | None = None
    status: str | None = None
    subject_type: str | None = None
    fields: dict[str, Any] | None = None
    aliases: list[str] | None = None
    tags: list[str] | None = None
    scheduled_for: date | None = None
    session_status: str | None = None
    outcome_text: str | None = None


class PromotePayload(Schema):
    version: int
    subject_type: str = "person"
    template_id: UUID | None = None


class VersionPayload(Schema):
    version: int
    reason: str = ""


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
    title: str | None = None
    body: str | None = None
    fields: dict[str, Any] = {}


class PublicationPayload(Schema):
    entries: list[PublicationEntryPayload]


class RestorePayload(Schema):
    revision: int
    version: int
    reason: str = "Restored revision"


def error(status: int, code: str, message: str) -> HttpError:
    return HttpError(status, f"{code}: {message}")


def campaign_output(campaign: Campaign) -> dict[str, object]:
    return {
        "id": campaign.id,
        "name": campaign.name,
        "owner_id": campaign.owner_id,
        "created_at": campaign.created_at.isoformat(),
        "updated_at": campaign.updated_at.isoformat(),
    }


def get_member_campaign(request: HttpRequest, campaign_id: UUID) -> Campaign:
    try:
        return Campaign.objects.get(id=campaign_id, memberships__user=request.auth)
    except Campaign.DoesNotExist as exc:
        raise error(404, "not_found", "Campaign not found") from exc


def get_member_item(request: HttpRequest, item_id: UUID) -> ArchiveItem:
    try:
        return ArchiveItem.objects.select_related("campaign", "entity_detail", "session_detail").get(
            id=item_id, campaign__memberships__user=request.auth
        )
    except ArchiveItem.DoesNotExist as exc:
        raise error(404, "not_found", "Archive item not found") from exc


def enforce_csrf(request: HttpRequest) -> None:
    middleware = CsrfViewMiddleware(lambda current_request: None)
    rejection = middleware.process_view(request, None, (), {})
    if rejection is not None:
        raise HttpError(403, "csrf_failed: CSRF verification failed")


def validate_status(status: str) -> None:
    if status not in {choice.value for choice in ArchiveItem.Status}:
        raise error(422, "validation", "Unknown item status")


def validate_kind(kind: str) -> None:
    if kind not in {choice.value for choice in ArchiveItem.Kind}:
        raise error(422, "validation", "Unknown item kind")


def validate_canon(item: ArchiveItem, fields: dict[str, Any]) -> None:
    if item.kind == ArchiveItem.Kind.ENTITY and hasattr(item, "entity_detail") and item.entity_detail.template_version:
        required = [field["key"] for field in item.entity_detail.template_version.fields if field.get("required")]
        missing = [key for key in required if fields.get(key) in (None, "")]
        if missing:
            raise error(422, "validation", f"Required fields missing: {', '.join(missing)}")


def item_output(item: ArchiveItem) -> dict[str, Any]:
    aliases = list(item.aliases.values_list("value", flat=True))
    tags = list(item.item_tags.select_related("tag").values_list("tag__name", flat=True))
    data: dict[str, Any] = {
        "id": item.id,
        "campaign_id": item.campaign_id,
        "kind": item.kind,
        "title": item.title,
        "body": item.body,
        "html": markdown_html(item.body),
        "status": item.status,
        "version": item.version,
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
        "aliases": aliases,
        "tags": tags,
        "references": [
            {"id": reference.id, "target_id": reference.target_id, "label": reference.label}
            for reference in item.outgoing_references.all()
        ],
        "backlinks": [
            {"id": reference.id, "source_id": reference.source_id, "label": reference.label}
            for reference in item.incoming_references.all()
        ],
        "relationships": [
            {"id": relationship.id, "target_id": relationship.target_id, "kind": relationship.kind, "label": relationship.reciprocal_label, "notes": relationship.notes}
            for relationship in item.outgoing_relationships.all()
        ],
        "incoming_relationships": [
            {"id": relationship.id, "source_id": relationship.source_id, "kind": relationship.kind, "label": relationship.reciprocal_label, "notes": relationship.notes}
            for relationship in item.incoming_relationships.all()
        ],
    }
    if item.kind == ArchiveItem.Kind.ENTITY and hasattr(item, "entity_detail"):
        data["entity"] = {
            "subject_type": item.entity_detail.subject_type,
            "template_id": item.entity_detail.template_version.template_id if item.entity_detail.template_version else None,
            "template_version": item.entity_detail.template_version.number if item.entity_detail.template_version else None,
            "fields": item.entity_detail.field_values,
        }
    if item.kind == ArchiveItem.Kind.SESSION and hasattr(item, "session_detail"):
        data["session"] = {
            "scheduled_for": item.session_detail.scheduled_for.isoformat() if item.session_detail.scheduled_for else None,
            "session_status": item.session_detail.session_status,
            "outcome_text": item.session_detail.outcome_text,
            "linked_item_ids": list(item.session_links.values_list("item_id", flat=True)),
        }
    return data


def summary_output(item: ArchiveItem) -> dict[str, Any]:
    return {key: getattr(item, key) for key in ("id", "campaign_id", "kind", "title", "status", "version", "created_at", "updated_at")}


def set_aliases_tags(item: ArchiveItem, aliases: list[str] | None, tags: list[str] | None) -> None:
    if aliases is not None:
        item.aliases.all().delete()
        Alias.objects.bulk_create([Alias(item=item, value=value.strip()) for value in dict.fromkeys(aliases) if value.strip()])
    if tags is not None:
        item.item_tags.all().delete()
        for name in dict.fromkeys(tag.strip().lower() for tag in tags if tag.strip()):
            tag, _ = Tag.objects.get_or_create(campaign=item.campaign, name=name)
            ItemTag.objects.create(item=item, tag=tag)


@api.get("health/live", auth=None)
def health_live(request: HttpRequest) -> dict[str, str]:
    return {"status": "ok"}


@api.get("health/ready", auth=None)
def health_ready(request: HttpRequest):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except DatabaseError:
        return 503, {"status": "unavailable"}
    return {"status": "ok"}


@api.get("health/version", auth=None)
def health_version(request: HttpRequest) -> dict[str, str]:
    return {"status": "ok", "version": settings.BUILD_VERSION, "pr": settings.BUILD_PR_NUMBER}


@api.get("auth/csrf", auth=None)
def csrf_token(request: HttpRequest) -> dict[str, str]:
    return {"csrfToken": get_token(request)}


@api.post("auth/login", auth=None, response=UserOut)
def auth_login(request: HttpRequest, credentials: Credentials) -> UserOut:
    enforce_csrf(request)
    user = authenticate(request, username=credentials.username, password=credentials.password)
    if user is None:
        raise error(401, "invalid_credentials", "Invalid username or password")
    login(request, user)
    return {"id": user.id, "username": user.username}


@api.post("auth/logout", auth=django_auth)
def auth_logout(request: HttpRequest) -> dict[str, str]:
    logout(request)
    return {"status": "ok"}


@api.get("auth/me", auth=django_auth, response=UserOut)
def auth_me(request: HttpRequest) -> UserOut:
    return {"id": request.auth.id, "username": request.auth.username}


@api.get("campaigns", auth=django_auth, response=list[CampaignOut])
def campaign_list(request: HttpRequest) -> list[dict[str, object]]:
    return [campaign_output(campaign) for campaign in Campaign.objects.filter(memberships__user=request.auth)]


@api.post("campaigns", auth=django_auth, response=CampaignOut)
@transaction.atomic
def campaign_create(request: HttpRequest, payload: CampaignCreate) -> dict[str, object]:
    enforce_csrf(request)
    name = payload.name.strip()
    if not name:
        raise error(422, "validation", "Campaign name cannot be empty")
    campaign = Campaign.objects.create(name=name, owner=request.auth)
    CampaignMembership.objects.create(campaign=campaign, user=request.auth, role=CampaignMembership.Role.OWNER)
    ensure_person_template(campaign)
    return campaign_output(campaign)


@api.get("campaigns/{campaign_id}", auth=django_auth, response=CampaignOut)
def campaign_detail(request: HttpRequest, campaign_id: UUID) -> dict[str, object]:
    return campaign_output(get_member_campaign(request, campaign_id))


@api.get("campaigns/{campaign_id}/items", auth=django_auth)
def item_list(request: HttpRequest, campaign_id: UUID, kind: str | None = None, status: str | None = None):
    campaign = get_member_campaign(request, campaign_id)
    items = ArchiveItem.objects.filter(campaign=campaign)
    if kind:
        items = items.filter(kind=kind)
    if status:
        items = items.filter(status=status)
    return {"items": [summary_output(item) for item in items], "next_cursor": None}


@api.post("campaigns/{campaign_id}/items", auth=django_auth)
@transaction.atomic
def item_create(request: HttpRequest, campaign_id: UUID, payload: ItemCreate):
    enforce_csrf(request)
    campaign = get_member_campaign(request, campaign_id)
    validate_kind(payload.kind)
    validate_status(payload.status)
    if not payload.title.strip():
        raise error(422, "validation", "Item title cannot be empty")
    item = ArchiveItem.objects.create(campaign=campaign, kind=payload.kind, title=payload.title.strip(), body=clean_markdown(payload.body), status=payload.status)
    if item.kind == ArchiveItem.Kind.ENTITY:
        template_version = None
        if payload.template_id:
            template_version = TemplateVersion.objects.filter(template_id=payload.template_id, template__campaign=campaign).order_by("-number").first()
            if not template_version:
                raise error(422, "validation", "Template not found")
        EntityDetail.objects.create(item=item, subject_type=payload.subject_type or "person", template_version=template_version, field_values=payload.fields)
        validate_canon(item, payload.fields)
    elif item.kind == ArchiveItem.Kind.SESSION:
        SessionDetail.objects.create(item=item, scheduled_for=payload.scheduled_for, session_status=payload.session_status, outcome_text=payload.outcome_text)
    set_aliases_tags(item, payload.aliases, payload.tags)
    record_revision(item, request.auth, "Created")
    return item_output(item)


@api.get("items/{item_id}", auth=django_auth)
def item_detail(request: HttpRequest, item_id: UUID):
    return item_output(get_member_item(request, item_id))


@api.patch("items/{item_id}", auth=django_auth)
@transaction.atomic
def item_update(request: HttpRequest, item_id: UUID, payload: ItemUpdate):
    enforce_csrf(request)
    item = get_member_item(request, item_id)
    if payload.version != item.version:
        raise error(409, "stale_version", "The item changed since it was opened")
    fields = payload.fields if payload.fields is not None else (item.entity_detail.field_values if hasattr(item, "entity_detail") else {})
    if payload.title is not None:
        item.title = payload.title.strip()
    if payload.body is not None:
        item.body = clean_markdown(payload.body)
    if payload.status is not None:
        validate_status(payload.status)
        item.status = payload.status
    if item.status == ArchiveItem.Status.CANON:
        validate_canon(item, fields)
    item.version += 1
    item.save()
    if item.kind == ArchiveItem.Kind.ENTITY and hasattr(item, "entity_detail"):
        detail = item.entity_detail
        if payload.subject_type is not None:
            detail.subject_type = payload.subject_type
        if payload.fields is not None:
            detail.field_values = payload.fields
        detail.save()
    if item.kind == ArchiveItem.Kind.SESSION and hasattr(item, "session_detail"):
        detail = item.session_detail
        if payload.scheduled_for is not None:
            detail.scheduled_for = payload.scheduled_for
        if payload.session_status is not None:
            detail.session_status = payload.session_status
        if payload.outcome_text is not None:
            detail.outcome_text = payload.outcome_text
        detail.save()
    set_aliases_tags(item, payload.aliases, payload.tags)
    record_revision(item, request.auth, "Updated")
    return item_output(item)


@api.post("items/{item_id}/promote", auth=django_auth)
@transaction.atomic
def item_promote(request: HttpRequest, item_id: UUID, payload: PromotePayload):
    enforce_csrf(request)
    item = get_member_item(request, item_id)
    if item.kind != ArchiveItem.Kind.NOTE:
        raise error(422, "validation", "Only notes can be promoted")
    if payload.version != item.version:
        raise error(409, "stale_version", "The item changed since it was opened")
    template_version = None
    if payload.template_id:
        template_version = TemplateVersion.objects.filter(template_id=payload.template_id, template__campaign=item.campaign).order_by("-number").first()
    item.kind = ArchiveItem.Kind.ENTITY
    item.version += 1
    item.save()
    EntityDetail.objects.create(item=item, subject_type=payload.subject_type, template_version=template_version, field_values={})
    record_revision(item, request.auth, "Promoted note to entity")
    return item_output(item)


@api.post("items/{item_id}/archive", auth=django_auth)
@transaction.atomic
def item_archive(request: HttpRequest, item_id: UUID, payload: VersionPayload):
    enforce_csrf(request)
    item = get_member_item(request, item_id)
    if payload.version != item.version:
        raise error(409, "stale_version", "The item changed since it was opened")
    item.archive()
    item.version += 1
    item.save()
    record_revision(item, request.auth, "Archived")
    return item_output(item)


@api.get("campaigns/{campaign_id}/templates", auth=django_auth)
def template_list(request: HttpRequest, campaign_id: UUID):
    campaign = get_member_campaign(request, campaign_id)
    if not campaign.templates.exists():
        ensure_person_template(campaign)
    return {"templates": [{"id": template.id, "name": template.name, "applies_to": template.applies_to, "versions": list(template.versions.values("number", "fields"))} for template in campaign.templates.prefetch_related("versions")]}


@api.post("campaigns/{campaign_id}/templates", auth=django_auth)
@transaction.atomic
def template_create(request: HttpRequest, campaign_id: UUID, payload: dict[str, Any]):
    enforce_csrf(request)
    campaign = get_member_campaign(request, campaign_id)
    name = str(payload.get("name", "")).strip()
    if not name:
        raise error(422, "validation", "Template name cannot be empty")
    template = Template.objects.create(campaign=campaign, name=name, applies_to=payload.get("applies_to", "entity"))
    TemplateVersion.objects.create(template=template, number=1, fields=payload.get("fields", []))
    return {"id": template.id, "name": template.name, "applies_to": template.applies_to, "versions": list(template.versions.values("number", "fields"))}


@api.get("campaigns/{campaign_id}/search", auth=django_auth)
def search(request: HttpRequest, campaign_id: UUID, q: str = "", kind: str | None = None, tag: str | None = None, alias: str | None = None):
    campaign = get_member_campaign(request, campaign_id)
    items = ArchiveItem.objects.filter(campaign=campaign, status__in=[ArchiveItem.Status.DRAFT, ArchiveItem.Status.CANON])
    if kind:
        items = items.filter(kind=kind)
    if q:
        from django.db.models import Q
        items = items.filter(Q(title__icontains=q) | Q(body__icontains=q) | Q(aliases__value__icontains=q) | Q(item_tags__tag__name__icontains=q)).distinct()
    if tag:
        items = items.filter(item_tags__tag__name=tag)
    if alias:
        items = items.filter(aliases__value__icontains=alias)
    if q:
        from django.db.models import Case, IntegerField, Value, When
        items = items.annotate(_title_match=Case(When(title__icontains=q, then=Value(0)), default=Value(1), output_field=IntegerField())).order_by("_title_match", "title", "id")
    return {"items": [summary_output(item) for item in items.distinct()], "next_cursor": None}


@api.post("items/{item_id}/references", auth=django_auth)
@transaction.atomic
def add_reference(request: HttpRequest, item_id: UUID, payload: ReferencePayload):
    enforce_csrf(request)
    source = get_member_item(request, item_id)
    target = get_member_item(request, payload.target_id)
    if source.campaign_id != target.campaign_id:
        raise error(404, "not_found", "Target item not found")
    reference, _ = Reference.objects.get_or_create(source=source, target=target, label=payload.label.strip())
    return {"id": reference.id, "target_id": reference.target_id, "label": reference.label}


@api.post("items/{item_id}/relationships", auth=django_auth)
@transaction.atomic
def add_relationship(request: HttpRequest, item_id: UUID, payload: RelationshipPayload):
    enforce_csrf(request)
    source = get_member_item(request, item_id)
    target = get_member_item(request, payload.target_id)
    if source.campaign_id != target.campaign_id:
        raise error(404, "not_found", "Target item not found")
    relationship, _ = Relationship.objects.get_or_create(source=source, target=target, kind=payload.kind, defaults={"reciprocal_label": payload.reciprocal_label, "notes": payload.notes})
    return {"id": relationship.id, "target_id": target.id, "kind": relationship.kind, "label": relationship.reciprocal_label, "notes": relationship.notes}


@api.post("items/{item_id}/session-links", auth=django_auth)
@transaction.atomic
def add_session_link(request: HttpRequest, item_id: UUID, payload: SessionLinkPayload):
    enforce_csrf(request)
    session = get_member_item(request, item_id)
    item = get_member_item(request, payload.item_id)
    if session.kind != ArchiveItem.Kind.SESSION or session.campaign_id != item.campaign_id:
        raise error(422, "validation", "A session can only link items in its campaign")
    link, _ = SessionLink.objects.get_or_create(session=session, item=item)
    return {"session_id": link.session_id, "item_id": link.item_id}


@api.get("items/{item_id}/revisions", auth=django_auth)
def revisions(request: HttpRequest, item_id: UUID):
    item = get_member_item(request, item_id)
    return {"revisions": [{"number": revision.number, "reason": revision.reason, "created_at": revision.created_at.isoformat(), "snapshot": revision.snapshot} for revision in item.revisions.all()]}


@api.post("items/{item_id}/restore", auth=django_auth)
@transaction.atomic
def restore_revision(request: HttpRequest, item_id: UUID, payload: RestorePayload):
    enforce_csrf(request)
    item = get_member_item(request, item_id)
    if item.version != payload.version:
        raise error(409, "stale_version", "The item changed since it was opened")
    revision = item.revisions.filter(number=payload.revision).first()
    if not revision:
        raise error(404, "not_found", "Revision not found")
    snapshot = revision.snapshot
    item.title = snapshot["title"]
    item.body = snapshot["body"]
    item.status = snapshot["status"]
    item.version += 1
    item.save()
    if item.kind == ArchiveItem.Kind.ENTITY and hasattr(item, "entity_detail") and snapshot.get("entity"):
        item.entity_detail.field_values = snapshot["entity"].get("fields", {})
        item.entity_detail.subject_type = snapshot["entity"].get("subject_type", "person")
        item.entity_detail.save()
    record_revision(item, request.auth, payload.reason)
    return item_output(item)


@api.post("campaigns/{campaign_id}/publications", auth=django_auth)
@transaction.atomic
def publication_create(request: HttpRequest, campaign_id: UUID, payload: PublicationPayload):
    enforce_csrf(request)
    campaign = get_member_campaign(request, campaign_id)
    if not payload.entries:
        raise error(422, "validation", "A publication needs at least one item")
    token, token_hash = random_publication_token()
    publication = Publication.objects.create(campaign=campaign, token_hash=token_hash)
    version = PublicationVersion.objects.create(publication=publication, number=1, created_by=request.auth)
    for selected in payload.entries:
        item = get_member_item(request, selected.item_id)
        if item.campaign_id != campaign.id:
            raise error(404, "not_found", "Publication item not found")
        PublicationEntry.objects.create(version=version, item=item, safe_title=(selected.title or item.title).strip(), safe_body=clean_markdown(selected.body if selected.body is not None else item.body), safe_fields=selected.fields)
    response = publication_output(publication, token)
    response["url"] = f"/p/{token}"
    return response


@api.get("campaigns/{campaign_id}/publications", auth=django_auth)
def publication_list(request: HttpRequest, campaign_id: UUID):
    campaign = get_member_campaign(request, campaign_id)
    return {"publications": [{"id": publication.id, "status": publication.status, "version": publication.current_version, "created_at": publication.created_at.isoformat(), "updated_at": publication.updated_at.isoformat()} for publication in campaign.publications.all()]}


@api.get("publications/{publication_id}", auth=django_auth)
def publication_detail(request: HttpRequest, publication_id: UUID):
    try:
        publication = Publication.objects.get(id=publication_id, campaign__memberships__user=request.auth)
    except Publication.DoesNotExist as exc:
        raise error(404, "not_found", "Publication not found") from exc
    return publication_output(publication)


@api.post("publications/{publication_id}/versions", auth=django_auth)
@transaction.atomic
def publication_version(request: HttpRequest, publication_id: UUID, payload: PublicationPayload):
    enforce_csrf(request)
    try:
        publication = Publication.objects.get(id=publication_id, campaign__memberships__user=request.auth)
    except Publication.DoesNotExist as exc:
        raise error(404, "not_found", "Publication not found") from exc
    version_number = publication.current_version + 1
    version = PublicationVersion.objects.create(publication=publication, number=version_number, created_by=request.auth)
    for selected in payload.entries:
        item = get_member_item(request, selected.item_id)
        if item.campaign_id != publication.campaign_id:
            raise error(404, "not_found", "Publication item not found")
        PublicationEntry.objects.create(version=version, item=item, safe_title=(selected.title or item.title).strip(), safe_body=clean_markdown(selected.body if selected.body is not None else item.body), safe_fields=selected.fields)
    publication.current_version = version_number
    publication.save(update_fields=["current_version", "updated_at"])
    return publication_output(publication)


@api.post("publications/{publication_id}/revoke", auth=django_auth)
@transaction.atomic
def publication_revoke(request: HttpRequest, publication_id: UUID):
    enforce_csrf(request)
    try:
        publication = Publication.objects.get(id=publication_id, campaign__memberships__user=request.auth)
    except Publication.DoesNotExist as exc:
        raise error(404, "not_found", "Publication not found") from exc
    publication.status = "revoked"
    publication.revoked_at = timezone.now()
    publication.save(update_fields=["status", "revoked_at", "updated_at"])
    return {"status": publication.status}


@api.get("publications/public/{token}", auth=None)
def public_publication(request: HttpRequest, token: str):
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    publication = Publication.objects.filter(token_hash=token_hash, status="active").first()
    response = JsonResponse({"status": "not_found"} if publication is None else publication_output(publication))
    response["Cache-Control"] = "no-store"
    response["Referrer-Policy"] = "no-referrer"
    return response


@api.get("campaigns/{campaign_id}/exports", auth=django_auth)
def campaign_export(request: HttpRequest, campaign_id: UUID):
    campaign = get_member_campaign(request, campaign_id)
    response = HttpResponse(export_campaign(campaign), content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="{campaign.name.replace(" ", "-").lower()}-archive.zip"'
    response["Cache-Control"] = "no-store"
    return response


@api.post("exports/restore", auth=django_auth)
@transaction.atomic
def campaign_restore(request: HttpRequest):
    enforce_csrf(request)
    uploaded = request.FILES.get("archive")
    if not uploaded:
        raise error(422, "validation", "Upload an archive file")
    try:
        data = read_export(uploaded.read())
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        raise error(422, "invalid_archive", "The archive could not be validated") from exc
    campaign = Campaign.objects.create(name=f"{data['campaign']['name']} (restored)", owner=request.auth)
    CampaignMembership.objects.create(campaign=campaign, user=request.auth, role=CampaignMembership.Role.OWNER)
    ensure_person_template(campaign)
    mapping: dict[str, UUID] = {}
    for raw in data.get("items", []):
        item = ArchiveItem.objects.create(campaign=campaign, kind=raw["kind"], title=raw["title"], body=raw.get("body", ""), status=raw.get("status", "draft"), version=raw.get("version", 1))
        mapping[raw["id"]] = item.id
        if item.kind == ArchiveItem.Kind.ENTITY and raw.get("entity"):
            EntityDetail.objects.create(item=item, subject_type=raw["entity"].get("subject_type", "person"), field_values=raw["entity"].get("fields", {}))
        if item.kind == ArchiveItem.Kind.SESSION and raw.get("session"):
            SessionDetail.objects.create(item=item, session_status=raw["session"].get("session_status", "planned"), outcome_text=raw["session"].get("outcome_text", ""), scheduled_for=raw["session"].get("scheduled_for") or None)
        set_aliases_tags(item, raw.get("aliases", []), raw.get("tags", []))
    for raw in data.get("relationships", []):
        if str(raw["source_id"]) in mapping and str(raw["target_id"]) in mapping:
            Relationship.objects.create(source_id=mapping[str(raw["source_id"])], target_id=mapping[str(raw["target_id"])], kind=raw["kind"], reciprocal_label=raw.get("reciprocal_label", ""), notes=raw.get("notes", ""))
    for raw in data.get("sessions", []):
        if str(raw["session_id"]) in mapping and str(raw["item_id"]) in mapping:
            SessionLink.objects.create(session_id=mapping[str(raw["session_id"])], item_id=mapping[str(raw["item_id"])])
    return campaign_output(campaign)
