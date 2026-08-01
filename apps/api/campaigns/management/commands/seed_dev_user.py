import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create an explicitly configured development or preview account."

    def handle(self, *args: object, **options: object) -> None:
        if os.environ.get("ALLOW_SEED_USER") != "1":
            raise CommandError("Refusing to seed an account unless ALLOW_SEED_USER=1")

        username = os.environ.get("SEED_USERNAME", "dm").strip()
        password = os.environ.get("SEED_PASSWORD", "")
        if not username or not password:
            raise CommandError("SEED_USERNAME and SEED_PASSWORD must both be set")

        user_model = get_user_model()
        user, created = user_model.objects.get_or_create(username=username, defaults={"is_active": True})
        update_fields: list[str] = []
        if created or os.environ.get("RESET_SEED_PASSWORD") == "1" or not user.has_usable_password():
            user.set_password(password)
            update_fields.append("password")
        if not user.is_active:
            user.is_active = True
            update_fields.append("is_active")
        if update_fields:
            user.save(update_fields=update_fields)
        self.stdout.write(self.style.SUCCESS(f"Seed account ready: {username}"))
