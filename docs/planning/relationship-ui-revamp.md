# Relationship UI revamp

## Outcome

This increment turns the Relationship proof of concept into a production-shaped, DM-private explorer for concise relational knowledge. It reuses the shared immersive visual system and Sigma renderer while adding relationship-specific network and hierarchy layouts, exact directional wording, a semantic alternative, and a separate board editor.

[ADR 0009](../decisions/0009-sigma-relationship-board-renderer.md) accepts the renderer, layout, and viewer/editor boundary.

## Confirmed decisions

- A board contains an explicit curated set of existing Archive items.
- Semantic relationships remain canonical entries in source-item Markdown. A board never owns copied edges.
- Sigma.js and Graphology render both automatic Graphs and Relationship boards through separate experience adapters.
- Network layout uses settled ForceAtlas2. Hierarchy layout uses deterministic layered positions and no force pass.
- The DM explicitly chooses which kinds are visible and which kinds establish hierarchy levels.
- Incoming or outgoing direction is a presentation setting, not inferred from kind names.
- Cycles, cross-links, multiple parents, disconnected members, self-links, and parallel edges remain visible.
- The existing route is a read-only immersive viewer. A sibling `/edit` route owns board authoring.
- Automatic positions, camera, selection, pan, and zoom remain transient.
- The Visual and List modes expose the same filtered members and canonical relationships.
- All content remains DM-private. Player publication is outside this increment.

## Settings

Relationship view settings use this additive shape:

```yaml
settings:
  layout_mode: hierarchy
  orientation: top_to_bottom
  root_item_id: 11111111-1111-1111-1111-111111111111
  relationship_kinds:
    - parent_of
    - partner_of
  layout_relationship_kinds:
    - parent_of
  layout_direction: outgoing
```

`relationship_kinds: []` means every relationship kind between board members is visible. Existing documents without `layout_mode` remain network boards. A hierarchy root is optional; it selects the primary component and visual emphasis but does not assert fictional seniority or ancestry.

## Experience

### Viewer

The viewer keeps the campaign shell, Archive lenses, search, quick capture, and edit action available above a full-viewport stage. Compact panels provide board selection, member and relationship totals, search, Visual/List mode, layout identity, and renderer status.

Selecting a member opens an anchored DOM inspector with:

- title, kind, and status;
- a bounded plain-text summary when authorized and available;
- one row per visible incoming, outgoing, or self relationship;
- correct forward or inverse wording;
- deliberate navigation to the canonical Archive page.

The viewer does not expose membership, settings, archive-status, or relationship mutation controls.

### Hierarchy layout

Only `layout_relationship_kinds` determine levels. All other visible relationships render as contextual cross-links. `layout_direction` controls whether rank traversal follows canonical outgoing edges or their incoming inverse. `orientation` selects top-to-bottom or left-to-right placement.

The layout is deterministic under input reordering. Multiple roots form a forest. Disconnected members remain in an explicit unconnected group. Multiple parents or superiors remain a directed acyclic structure when possible. Cycles remain visible and produce a concise diagnostic instead of silently changing a fact.

### Semantic mode

The List mode is not merely a member index. It groups hierarchy levels when applicable and includes a directional adjacency list with one row per canonical edge. Search, selection, current member, archived state, and canonical navigation match the visual stage.

### Editor

The editor uses ordinary document flow and provides:

- title and description;
- member search, add, remove, and canonical-page navigation;
- network or hierarchy layout;
- orientation and optional root;
- visible relationship kinds;
- rank-defining kinds and direction;
- archive and restore;
- explicit save, busy, success, failure, stale-version, and reload states.

Removing a member never removes the item or any relationship. Relationship creation and deletion continue through the versioned source-item workflow; direct canvas edge authoring remains outside this increment.

## Technical shape

### Shared renderer boundary

- A reusable Sigma viewport owns graph construction, WebGL lifecycle, camera controls, selection reducers, context loss, and anchor coordinates.
- The automatic Graph composes ForceAtlas, clouds, depth behavior, Graph copy, and Graph actions.
- The Relationship experience composes saved kind filtering, hierarchy positions, relationship wording, diagnostics, and semantic grouping.
- Shared hooks own reduced motion, renderer failure, anchored-inspector focus, Escape, and focus return.
- Immersive stage positioning is scoped to an immersive Archive shell so embedded item graphs remain in document flow.

### Server contract

- Validate layout mode, orientation, direction, string kind lists, member positions, and root membership.
- Require rank-defining kinds to be visible when an explicit visible filter exists.
- Derive all member-to-member edges from canonical relationship projections.
- Return edges after the saved visible-kind filter and return sorted `available_relationship_kinds` for the editor.
- Preserve stable edge IDs, direction, forward label, and inverse label.
- Keep board documents versioned, conflict-checked, exportable, restorable, and workspace-readable.

### Privacy and portability

- The board remains campaign-authorized and DM-private.
- Browser logs and errors contain no titles, summaries, labels, notes, or search terms.
- Layout and renderer state never enter item Markdown or player publications.
- Campaign export and restore preserve board configuration and remap member/root identities without copying relationship facts.

## Delivery plan

### 1. Decision and contract

- Record ADR 0009 and this plan.
- Add settings validation, response filtering, available-kind metadata, API tests, OpenAPI, and client types.

**Exit:** old boards remain readable and the new settings round-trip through canonical view Markdown.

### 2. Shared graph foundation

- Separate the reusable Sigma viewport from automatic-Graph composition.
- Add explicit network and positioned layout strategies.
- Scope immersive stage CSS and preserve embedded graph behavior.

**Exit:** the automatic Graph is unchanged, embedded graphs stay embedded, and a positioned relationship fixture renders without ForceAtlas.

### 3. Relationship presentation

- Build deterministic hierarchy layout and diagnostics.
- Add relationship-specific selection summaries, exact wording, search, Visual/List modes, and semantic grouping.
- Preserve contextual and parallel edges.

**Exit:** family and organization fixtures remain concise without inferred facts.

### 4. Viewer and editor

- Promote Relationships into the immersive Archive shell.
- Add board switching and edit/view shell actions.
- Build the dedicated editor with conflict and archive handling.

**Exit:** live-play exploration contains no mutation controls and preparation supports the complete board configuration workflow.

### 5. Validation

- Run API, client, lint, type, component, build, end-to-end, and strict documentation checks.
- Exercise desktop and tablet, WebGL failure, reduced motion, keyboard-only navigation, and representative network/hierarchy fixtures.
- Record renderer timing and interaction behavior before adding relationship-specific size limits.

**Exit:** all available checks pass and the draft merge request records any measured follow-up work.

## Acceptance criteria

- Relationship viewing no longer overlaps conventional page content.
- Viewer and editor routes expose distinct exploration and authoring controls.
- Network and hierarchy modes render the same explicit canonical relationships.
- Root, orientation, visible kinds, rank-defining kinds, and direction round-trip correctly.
- Hierarchy output is stable under input reordering and handles forests, cycles, multiple parents, disconnected members, and parallel edges.
- Incoming and outgoing cards use correct inverse or forward wording.
- Visual and List modes have fact and navigation parity.
- WebGL failure leaves the semantic workflow complete.
- Keyboard, touch, reduced-motion, and supported tablet use remain operable.
- Adding or removing a board member never changes an item or relationship.
- Export, restore, stale saves, archived members, and archived boards remain recoverable.
- No player-visible representation or private-data logging is introduced.

## Follow-up measurements

Persisted manual positions, relationship-kind presets, direct board edge authoring, query-driven membership, player publication, historical or knowledge-filtered relationships, and dedicated membership projections remain separate decisions. Measure real board sizes and retrieval behavior before assigning limits or promoting those capabilities.
