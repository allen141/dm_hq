from uuid import UUID

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.db import DatabaseError, connection, transaction
from django.http import HttpRequest
from django.middleware.csrf import CsrfViewMiddleware, get_token
from ninja import NinjaAPI, Schema
from ninja.errors import HttpError
from ninja.security import django_auth

from .models import Campaign, CampaignMembership

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
        raise HttpError(404, "Campaign not found") from exc


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
    return {
        "status": "ok",
        "version": settings.BUILD_VERSION,
        "pr": settings.BUILD_PR_NUMBER,
    }


def enforce_csrf(request: HttpRequest) -> None:
    middleware = CsrfViewMiddleware(lambda current_request: None)
    rejection = middleware.process_view(request, None, (), {})
    if rejection is not None:
        raise HttpError(403, "CSRF verification failed")


@api.get("auth/csrf", auth=None)
def csrf_token(request: HttpRequest) -> dict[str, str]:
    return {"csrfToken": get_token(request)}


@api.post("auth/login", auth=None, response=UserOut)
def auth_login(request: HttpRequest, credentials: Credentials) -> UserOut:
    enforce_csrf(request)
    user = authenticate(request, username=credentials.username, password=credentials.password)
    if user is None:
        raise HttpError(401, "Invalid username or password")
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
    name = payload.name.strip()
    if not name:
        raise HttpError(422, "Campaign name cannot be empty")
    campaign = Campaign.objects.create(name=name, owner=request.auth)
    CampaignMembership.objects.create(campaign=campaign, user=request.auth, role=CampaignMembership.Role.OWNER)
    return campaign_output(campaign)


@api.get("campaigns/{campaign_id}", auth=django_auth, response=CampaignOut)
def campaign_detail(request: HttpRequest, campaign_id: UUID) -> dict[str, object]:
    return campaign_output(get_member_campaign(request, campaign_id))
