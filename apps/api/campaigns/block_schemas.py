"""Typed private read contract. Authored Markdown remains the write contract."""

import builtins
from typing import Any, Literal
from uuid import UUID

from ninja import Schema
from pydantic import ConfigDict


class Extensible(Schema):
    model_config = ConfigDict(extra="allow")


class BlockReference(Schema):
    item_id: UUID
    block_id: UUID


class BlockBase(Extensible):
    id: UUID
    title: str
    beat_id: UUID | None = None
    context: str | None = None
    reference: BlockReference | None = None
    source_title: str | None = None
    source_version: builtins.int | None = None
    reference_error: str | None = None


class BlockStoryDataBeatsEntry(Extensible):
    id: UUID
    title: str | None = None
    goal: str | None = None
    stakes: str | None = None
    progression: str | None = None
    outcomes: str | None = None
    next_beat_id: UUID | None = None
    scene_ids: list[UUID] | None = None
    encounter_ids: list[UUID] | None = None


class BlockStoryData(Extensible):
    summary: str | None = None
    truth: str | None = None
    beats: list[BlockStoryDataBeatsEntry] | None = None


class BlockStory(BlockBase):
    type: Literal["story"]
    data: BlockStoryData


class BlockSceneData(Extensible):
    location_id: UUID | None = None
    mood: str | None = None
    sights: str | None = None
    sounds: str | None = None
    scent: str | None = None
    lighting: str | None = None
    features: str | None = None
    read_aloud: str | None = None


class BlockScene(BlockBase):
    type: Literal["scene"]
    data: BlockSceneData


class BlockCharacterDataAbilities(Extensible):
    str: builtins.int | None = None
    dex: builtins.int | None = None
    con: builtins.int | None = None
    int: builtins.int | None = None
    wis: builtins.int | None = None
    cha: builtins.int | None = None


class BlockCharacterDataAttacksEntry(Extensible):
    id: UUID
    name: str | None = None
    range: str | None = None
    damage: str | None = None
    effect: str | None = None
    trigger: str | None = None
    usage: str | None = None
    activation: str | None = None
    attack_bonus: builtins.int | None = None
    save_dc: builtins.int | None = None


class BlockCharacterDataActionsEntry(Extensible):
    id: UUID
    name: str | None = None
    range: str | None = None
    damage: str | None = None
    effect: str | None = None
    trigger: str | None = None
    usage: str | None = None
    activation: str | None = None
    attack_bonus: builtins.int | None = None
    save_dc: builtins.int | None = None


class BlockCharacterDataBonusActionsEntry(Extensible):
    id: UUID
    name: str | None = None
    range: str | None = None
    damage: str | None = None
    effect: str | None = None
    trigger: str | None = None
    usage: str | None = None
    activation: str | None = None
    attack_bonus: builtins.int | None = None
    save_dc: builtins.int | None = None


class BlockCharacterDataReactionsEntry(Extensible):
    id: UUID
    name: str | None = None
    range: str | None = None
    damage: str | None = None
    effect: str | None = None
    trigger: str | None = None
    usage: str | None = None
    activation: str | None = None
    attack_bonus: builtins.int | None = None
    save_dc: builtins.int | None = None


class BlockCharacterDataSpecialActionsEntry(Extensible):
    id: UUID
    name: str | None = None
    range: str | None = None
    damage: str | None = None
    effect: str | None = None
    trigger: str | None = None
    usage: str | None = None
    activation: str | None = None
    attack_bonus: builtins.int | None = None
    save_dc: builtins.int | None = None


class BlockCharacterDataTraitsEntry(Extensible):
    id: UUID
    name: str | None = None
    range: str | None = None
    damage: str | None = None
    effect: str | None = None
    trigger: str | None = None
    usage: str | None = None
    activation: str | None = None
    attack_bonus: builtins.int | None = None
    save_dc: builtins.int | None = None


class BlockCharacterData(Extensible):
    ruleset: str | None = None
    species: str | None = None
    creature_type: str | None = None
    size: str | None = None
    role: str | None = None
    appearance: str | None = None
    voice: str | None = None
    motivation: str | None = None
    fear: str | None = None
    knowledge: str | None = None
    speed: str | None = None
    cr: str | None = None
    saving_throws: str | None = None
    skills: str | None = None
    resistances: str | None = None
    immunities: str | None = None
    senses: str | None = None
    languages: str | None = None
    tactics: str | None = None
    ac: builtins.int | None = None
    max_hp: builtins.int | None = None
    initiative: builtins.int | None = None
    level: builtins.int | None = None
    abilities: BlockCharacterDataAbilities | None = None
    attacks: list[BlockCharacterDataAttacksEntry] | None = None
    actions: list[BlockCharacterDataActionsEntry] | None = None
    bonus_actions: list[BlockCharacterDataBonusActionsEntry] | None = None
    reactions: list[BlockCharacterDataReactionsEntry] | None = None
    special_actions: list[BlockCharacterDataSpecialActionsEntry] | None = None
    traits: list[BlockCharacterDataTraitsEntry] | None = None


class BlockCharacter(BlockBase):
    type: Literal["character"]
    data: BlockCharacterData


class BlockConversationDataTopicsEntryEntriesEntry(Extensible):
    id: UUID
    text: str | None = None
    condition: str | None = None
    reveals: str | None = None
    kind: str | None = None


class BlockConversationDataTopicsEntry(Extensible):
    id: UUID
    label: str | None = None
    condition: str | None = None
    entries: list[BlockConversationDataTopicsEntryEntriesEntry] | None = None


class BlockConversationDataEvidenceEntry(Extensible):
    id: UUID
    title: str | None = None
    content: str | None = None
    delivery: str | None = None
    condition: str | None = None
    lead: str | None = None
    fallback: str | None = None
    required: bool | None = None


class BlockConversationData(Extensible):
    participant_ids: list[UUID] | None = None
    setup: str | None = None
    wants: str | None = None
    demeanor: str | None = None
    topics: list[BlockConversationDataTopicsEntry] | None = None
    evidence: list[BlockConversationDataEvidenceEntry] | None = None
    outcomes: str | None = None


class BlockConversation(BlockBase):
    type: Literal["conversation"]
    data: BlockConversationData


class BlockChallengeDataChecksEntry(Extensible):
    id: UUID
    approach: str | None = None
    dc: builtins.int | None = None
    effect: str | None = None
    complication: str | None = None
    successes: builtins.int | None = None
    failures: builtins.int | None = None


class BlockChallengeData(Extensible):
    mode: str | None = None
    goal: str | None = None
    success_target: builtins.int | None = None
    failure_target: builtins.int | None = None
    checks: list[BlockChallengeDataChecksEntry] | None = None
    success_result: str | None = None
    failure_result: str | None = None


class BlockChallenge(BlockBase):
    type: Literal["challenge"]
    data: BlockChallengeData


class ItemDocumentOut(Schema):
    id: UUID
    campaign_id: UUID
    kind: str
    markdown: str
    storage_key: str | None = None
    html: str
    metadata: dict[str, Any]
    title: str
    status: str
    version: int
    created_at: str
    updated_at: str
    aliases: list[str]
    tags: list[str]
    references: list[dict[str, Any]]
    backlinks: list[dict[str, Any]]
    relationships: list[dict[str, Any]]
    incoming_relationships: list[dict[str, Any]]
    resolved_blocks: list[BlockStory | BlockScene | BlockCharacter | BlockConversation | BlockChallenge]
