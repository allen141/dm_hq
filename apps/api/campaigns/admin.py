from django.contrib import admin

from .models import Campaign, CampaignMembership


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "created_at", "updated_at")
    search_fields = ("name", "owner__username")


@admin.register(CampaignMembership)
class CampaignMembershipAdmin(admin.ModelAdmin):
    list_display = ("campaign", "user", "role", "created_at")
    list_filter = ("role",)
