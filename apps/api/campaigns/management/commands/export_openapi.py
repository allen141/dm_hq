import json
from pathlib import Path

from django.core.management.base import BaseCommand

from campaigns.api import api


class Command(BaseCommand):
    help = "Write the deterministic Django Ninja OpenAPI contract."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--output", required=True)

    def handle(self, *args: object, **options: object) -> None:
        output = Path(options["output"])
        output.parent.mkdir(parents=True, exist_ok=True)
        contract = json.dumps(api.get_openapi_schema(), indent=2, sort_keys=True) + "\n"
        output.write_text(contract, encoding="utf-8")
        self.stdout.write(str(output))
