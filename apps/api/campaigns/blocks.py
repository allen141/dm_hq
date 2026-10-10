"""Portable, DM-private session blocks. Item IDs are campaign scoped; entry IDs are document scoped."""

from copy import deepcopy
from uuid import UUID

ACTION = {key: str for key in ("name", "range", "damage", "effect", "trigger", "usage", "activation")}
ACTION.update(attack_bonus=int, save_dc=int)
SCHEMAS = {
    "story": dict(
        summary=str,
        truth=str,
        beats=[
            dict(
                title=str,
                goal=str,
                stakes=str,
                progression=str,
                outcomes=str,
                next_beat_id="uuid",
                scene_ids="uuids",
                encounter_ids="uuids",
            )
        ],
    ),
    "scene": dict(
        location_id="uuid",
        **{key: str for key in ("mood", "sights", "sounds", "scent", "lighting", "features", "read_aloud")},
    ),
    "character": dict(
        **{
            key: str
            for key in (
                "ruleset",
                "species",
                "creature_type",
                "size",
                "role",
                "appearance",
                "voice",
                "motivation",
                "fear",
                "knowledge",
                "speed",
                "cr",
                "saving_throws",
                "skills",
                "resistances",
                "immunities",
                "senses",
                "languages",
                "tactics",
            )
        },
        **{key: int for key in ("ac", "max_hp", "initiative", "level")},
        abilities={key: int for key in ("str", "dex", "con", "int", "wis", "cha")},
        **{key: [ACTION] for key in ("attacks", "actions", "bonus_actions", "reactions", "special_actions", "traits")},
    ),
    "conversation": dict(
        participant_ids="uuids",
        setup=str,
        wants=str,
        demeanor=str,
        topics=[dict(label=str, condition=str, entries=[dict(text=str, condition=str, reveals=str, kind=str)])],
        evidence=[dict(title=str, content=str, delivery=str, condition=str, lead=str, fallback=str, required=bool)],
        outcomes=str,
    ),
    "challenge": dict(
        mode=str,
        goal=str,
        success_target=int,
        failure_target=int,
        checks=[dict(approach=str, dc=int, effect=str, complication=str, successes=int, failures=int)],
        success_result=str,
        failure_result=str,
    ),
}


def uuid_value(value):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("Block identifiers must be UUIDs") from exc


def entries(metadata):
    collection = metadata.get("blocks")
    rows = collection.get("entries", []) if isinstance(collection, dict) else []
    return rows if isinstance(rows, list) else []


def _unique(value, seen):
    value = uuid_value(value)
    if value in seen:
        raise ValueError("Block and nested entry IDs must be unique within a document")
    seen.add(value)


def _shape(value, schema, path, seen):
    if isinstance(schema, dict):
        if not isinstance(value, dict):
            raise ValueError(f"{path} must be an object")
        for key, rule in schema.items():
            if key in value:
                _shape(value[key], rule, f"{path}.{key}", seen)
    elif isinstance(schema, list):
        if not isinstance(value, list) or len(value) > 200:
            raise ValueError(f"{path} must be a list with at most 200 entries")
        for row in value:
            if not isinstance(row, dict):
                raise ValueError(f"{path} entries must be objects")
            _unique(row.get("id"), seen)
            _shape(row, schema[0], path, seen)
    elif schema == "uuid":
        uuid_value(value)
    elif schema == "uuids":
        if not isinstance(value, list) or len(value) > 200:
            raise ValueError(f"{path} must be a list of UUIDs")
        for identifier in value:
            uuid_value(identifier)
    elif type(value) is not schema:
        raise ValueError(f"{path} must be {schema.__name__}")
    elif schema is str and len(value) > 100000:
        raise ValueError(f"{path} is too long")


def item_references(block):
    reference = block.get("reference") or {}
    if reference.get("item_id"):
        yield reference["item_id"]
    data = block.get("data") or {}
    if data.get("location_id"):
        yield data["location_id"]
    yield from data.get("participant_ids", [])


def _target(reference, campaign_id):
    from .documents import parse_document, read_current
    from .models import ArchiveItem

    target = (
        ArchiveItem.objects.filter(id=reference["item_id"], campaign_id=campaign_id).select_related("document").first()
    )
    if not target or not target.document_id:
        raise ValueError("Referenced block item does not exist in this campaign")
    target_meta, _ = parse_document(read_current(target.document))
    selected = next((row for row in entries(target_meta) if row["id"] == reference["block_id"]), None)
    if not selected or selected.get("reference"):
        raise ValueError("Reference must select a concrete block; chained references are not supported")
    return target, selected


def validate_blocks(metadata, campaign_id):
    if "blocks" not in metadata:
        return
    from .models import ArchiveItem

    collection = metadata["blocks"]
    if metadata.get("document_type") != "archive_item":
        raise ValueError("Blocks belong to Archive items")
    if not isinstance(collection, dict) or type(collection.get("version")) is not int or collection["version"] != 1:
        raise ValueError("Unsupported block schema version; expected version 1")
    blocks = collection.get("entries")
    if not isinstance(blocks, list) or len(blocks) > 200:
        raise ValueError("blocks.entries must be a list with at most 200 blocks")
    seen = set()
    beats = set()
    for block in blocks:
        if not isinstance(block, dict) or block.get("type") not in SCHEMAS or not isinstance(block.get("title"), str):
            raise ValueError("Each block needs id, supported type and title")
        _unique(block.get("id"), seen)
        _shape(block.get("data"), SCHEMAS[block["type"]], block["title"], seen)
        if block["type"] == "story":
            beats.update(row["id"] for row in block.get("data", {}).get("beats", []))
        if "context" in block and not isinstance(block["context"], str):
            raise ValueError("Block context must be text")
        if "reference" in block and not isinstance(block["reference"], dict):
            raise ValueError("Block reference must be an object")
        if block.get("reference"):
            if block["type"] not in ("scene", "character"):
                raise ValueError("Only Scene and Character blocks can reuse canonical definitions")
            reference = block["reference"]
            _shape(reference, dict(item_id="uuid", block_id="uuid"), "reference", seen)
            if not reference.get("item_id") or not reference.get("block_id"):
                raise ValueError("Block reference requires item_id and block_id")
            if str(reference["item_id"]) == str(metadata["id"]):
                raise ValueError("References must select another Archive item")
            _, selected = _target(reference, campaign_id)
            if selected["type"] != block["type"]:
                raise ValueError("Referenced block type must match")
            if block.get("data"):
                raise ValueError("Reference blocks use canonical data; keep session additions in context")
        for identifier in item_references(block):
            uuid_value(identifier)
            if not ArchiveItem.objects.filter(id=identifier, campaign_id=campaign_id).exists():
                raise ValueError("Block item reference does not exist in this campaign")
        data = block.get("data", {})
        mechanics = {
            "ac",
            "max_hp",
            "initiative",
            "level",
            "speed",
            "cr",
            "abilities",
            "saving_throws",
            "skills",
            "resistances",
            "immunities",
            "senses",
            "languages",
            "attacks",
            "actions",
            "bonus_actions",
            "reactions",
            "special_actions",
            "traits",
        }
        if (
            block["type"] == "character"
            and any(key in data for key in mechanics)
            and data.get("ruleset") != "dnd_5e_2014"
        ):
            raise ValueError("Character mechanics require the explicit dnd_5e_2014 ruleset")
        if block["type"] == "character" and data.get("ruleset") not in (None, "", "dnd_5e_2014"):
            raise ValueError("Supported character ruleset: dnd_5e_2014; omit for system-neutral characters")
        if block["type"] == "challenge":
            if data.get("mode", "individual_checks") not in ("individual_checks", "threshold"):
                raise ValueError("Challenge mode must be individual_checks or threshold")
            if data.get("mode") == "threshold" and any(
                type(data.get(key)) is not int or data[key] <= 0 for key in ("success_target", "failure_target")
            ):
                raise ValueError("Threshold challenges need positive success and failure targets")
    by_id = {block["id"]: block for block in blocks}
    for block in blocks:
        if block.get("beat_id") and block["beat_id"] not in beats:
            raise ValueError("Block beat_id must select a Story beat in this document")
        for beat in block.get("data", {}).get("beats", []) if block["type"] == "story" else []:
            if beat.get("next_beat_id") and beat["next_beat_id"] not in beats:
                raise ValueError("Story next_beat_id must select a beat in this document")
            for key, kinds in (("scene_ids", {"scene"}), ("encounter_ids", {"conversation", "challenge"})):
                if any(
                    identifier not in by_id or by_id[identifier]["type"] not in kinds
                    for identifier in beat.get(key, [])
                ):
                    raise ValueError(f"Story {key} must select matching blocks in this document")


def block_strings(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key not in ("id", "item_id", "block_id", "beat_id", "ruleset", "type", "mode", "reference"):
                yield from block_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from block_strings(child)
    elif isinstance(value, str):
        try:
            UUID(value)
        except ValueError:
            yield value


def block_links(metadata):
    from .documents import canonical_document_links

    result = []
    for block in entries(metadata):
        for identifier in item_references(block):
            result.append(
                dict(
                    label=block["title"],
                    target_type="item",
                    target_identifier=UUID(identifier),
                    context=block.get("context", "") or block["title"],
                    authored_position=len(result),
                )
            )
        for value in block_strings(block):
            for link in canonical_document_links(value):
                link["authored_position"] = len(result)
                result.append(link)
    return result


def resolved_blocks(metadata, campaign_id):
    result = deepcopy(entries(metadata))
    for block in result:
        if not block.get("reference"):
            continue
        try:
            target, selected = _target(block["reference"], campaign_id)
            if selected["type"] != block["type"]:
                raise ValueError("Referenced block type changed")
            block["data"] = deepcopy(selected.get("data", {}))
            block["source_title"] = target.title
            block["source_version"] = target.document.current_version
        except (ValueError, OSError):
            block["reference_error"] = "Referenced block is unavailable. Repair the reference in Edit."
    return result


def remap_block_items(metadata, item_ids, campaign_ids):
    from .documents import CANONICAL_LINK_PATTERN

    def rewrite(value):
        if isinstance(value, dict):
            return {
                key: item_ids.get(str(child), child)
                if key in ("item_id", "location_id")
                else [item_ids.get(str(identifier), identifier) for identifier in child]
                if key == "participant_ids"
                else rewrite(child)
                for key, child in value.items()
            }
        if isinstance(value, list):
            return [rewrite(child) for child in value]
        if isinstance(value, str):

            def replace(match):
                mapping = item_ids if match[2] == "item" else campaign_ids
                return f"[{match[1]}](dmhq://{match[2]}/{mapping.get(match[3], match[3])})"

            return CANONICAL_LINK_PATTERN.sub(
                replace,
                value,
            )
        return value

    if "blocks" in metadata:
        metadata["blocks"] = rewrite(metadata["blocks"])
