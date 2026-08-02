import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Campaign(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="owned_campaigns")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "id"]

    def __str__(self) -> str:
        return self.name


class CampaignMembership(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="campaign_memberships")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.OWNER)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["campaign", "user"], name="unique_campaign_membership")]

    def __str__(self) -> str:
        return f"{self.user} owns {self.campaign}"


class ArchiveItem(models.Model):
    class Kind(models.TextChoices):
        NOTE = "note", "Note"
        ENTITY = "entity", "Entity"
        SESSION = "session", "Session"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        CANON = "canon", "Canon"
        ARCHIVED = "archived", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="archive_items")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    title = models.CharField(max_length=240)
    body = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at", "id"]
        indexes = [models.Index(fields=["campaign", "kind", "status"]), models.Index(fields=["campaign", "updated_at"])]

    def archive(self) -> None:
        self.status = self.Status.ARCHIVED
        self.archived_at = timezone.now()


class Template(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="templates")
    name = models.CharField(max_length=160)
    applies_to = models.CharField(max_length=20, default="entity")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["campaign", "name"], name="unique_campaign_template_name")]


class TemplateVersion(models.Model):
    template = models.ForeignKey(Template, on_delete=models.CASCADE, related_name="versions")
    number = models.PositiveIntegerField()
    fields = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["template", "number"], name="unique_template_version")]
        ordering = ["template", "-number"]


class EntityDetail(models.Model):
    item = models.OneToOneField(ArchiveItem, on_delete=models.CASCADE, related_name="entity_detail")
    subject_type = models.CharField(max_length=20, default="person")
    template_version = models.ForeignKey(TemplateVersion, null=True, blank=True, on_delete=models.PROTECT)
    field_values = models.JSONField(default=dict)


class SessionDetail(models.Model):
    item = models.OneToOneField(ArchiveItem, on_delete=models.CASCADE, related_name="session_detail")
    template_version = models.ForeignKey(TemplateVersion, null=True, blank=True, on_delete=models.PROTECT)
    field_values = models.JSONField(default=dict)
    # These columns remain as compatibility projections for the initial API/export shape.
    scheduled_for = models.DateField(null=True, blank=True)
    session_status = models.CharField(max_length=20, default="planned")
    outcome_text = models.TextField(blank=True)


class Alias(models.Model):
    item = models.ForeignKey(ArchiveItem, on_delete=models.CASCADE, related_name="aliases")
    value = models.CharField(max_length=160)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["item", "value"], name="unique_item_alias")]


class Tag(models.Model):
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="tags")
    name = models.CharField(max_length=80)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["campaign", "name"], name="unique_campaign_tag")]


class ItemTag(models.Model):
    item = models.ForeignKey(ArchiveItem, on_delete=models.CASCADE, related_name="item_tags")
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE, related_name="tagged_items")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["item", "tag"], name="unique_item_tag")]


class Reference(models.Model):
    source = models.ForeignKey(ArchiveItem, on_delete=models.CASCADE, related_name="outgoing_references")
    target = models.ForeignKey(ArchiveItem, on_delete=models.CASCADE, related_name="incoming_references")
    label = models.CharField(max_length=160, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["source", "target", "label"], name="unique_item_reference")]


class Relationship(models.Model):
    source = models.ForeignKey(ArchiveItem, on_delete=models.CASCADE, related_name="outgoing_relationships")
    target = models.ForeignKey(ArchiveItem, on_delete=models.CASCADE, related_name="incoming_relationships")
    kind = models.CharField(max_length=80)
    reciprocal_label = models.CharField(max_length=80, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["source", "target", "kind"], name="unique_item_relationship")]


class SessionLink(models.Model):
    session = models.ForeignKey(ArchiveItem, on_delete=models.CASCADE, related_name="session_links")
    item = models.ForeignKey(ArchiveItem, on_delete=models.CASCADE, related_name="linked_sessions")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["session", "item"], name="unique_session_item_link")]


class ItemRevision(models.Model):
    item = models.ForeignKey(ArchiveItem, on_delete=models.CASCADE, related_name="revisions")
    number = models.PositiveIntegerField()
    snapshot = models.JSONField()
    reason = models.CharField(max_length=240, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["item", "number"], name="unique_item_revision")]
        ordering = ["-number"]


class Publication(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="publications")
    token_hash = models.CharField(max_length=64, unique=True)
    # Retained only for authenticated owner link recovery; never exported or logged.
    token_value = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(max_length=20, default="active")
    current_version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    revoked_at = models.DateTimeField(null=True, blank=True)


class PublicationVersion(models.Model):
    publication = models.ForeignKey(Publication, on_delete=models.CASCADE, related_name="versions")
    number = models.PositiveIntegerField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["publication", "number"], name="unique_publication_version")]


class PublicationEntry(models.Model):
    version = models.ForeignKey(PublicationVersion, on_delete=models.CASCADE, related_name="entries")
    item = models.ForeignKey(ArchiveItem, on_delete=models.PROTECT)
    safe_title = models.CharField(max_length=240)
    safe_body = models.TextField(blank=True)
    safe_fields = models.JSONField(default=dict)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["version", "item"], name="unique_publication_entry")]
