# ADR 0009: Reuse Sigma for relationship boards

- **Status:** Accepted
- **Date:** 2026-08-15
- **Owners:** Product and Engineering

## Context

The first Relationship-board proof of concept reused the same static graph component as the automatic Archive Graph. The Graph was later promoted to an immersive Sigma.js experience, but the Relationship route continued to embed the entire Graph experience inside a conventional document page. This created conflicting viewport layouts and inherited Graph-specific copy, actions, selection behavior, and ForceAtlas layout.

Relationship boards need a calmer, more concise presentation for explicit campaign knowledge such as parentage, partnerships, faction membership, and command structures. Some boards are ordinary networks. Others need a layered hierarchy. The renderer must preserve arbitrary campaign-defined relationship kinds, directional and inverse wording, parallel edges, cycles, and disconnected members without inferring genealogy or organizational facts.

[ADR 0006](0006-archive-exploration-view-model.md) keeps membership and presentation settings in the `archive_view` document while semantic edges remain canonical in Archive-item Markdown. [ADR 0007](0007-webgl-graph-renderer.md) selects Sigma.js and Graphology for interactive graph rendering. [ADR 0008](0008-webgl-map-renderer-and-visual-system.md) establishes the shared immersive viewer and separate authoring route pattern.

## Decision drivers

- Reuse the accepted graph renderer, interaction model, and accessibility boundary.
- Support both general networks and deterministic layered hierarchies.
- Keep layout choices distinct from canonical campaign facts.
- Show exact forward or inverse relationship wording and retain parallel edges.
- Keep viewer interactions focused during live play and authoring controls deliberate.
- Preserve a complete keyboard and non-WebGL representation.
- Avoid a third rendering framework or a persistent graph store.

## Decision

### One renderer, two relationship layouts

Relationship boards use the existing client-only Sigma.js and Graphology boundary. The reusable Sigma viewport owns camera controls, picking, selection emphasis, edge programs, WebGL health, and canvas-to-DOM anchoring. The automatic Graph and Relationship boards compose that viewport with separate copy, inspectors, fallbacks, actions, and layout strategies.

Relationship boards support:

- **Network layout**, using deterministic initial positions and a bounded ForceAtlas2 settling pass.
- **Hierarchy layout**, using deterministic layered coordinates supplied before Sigma renders. ForceAtlas2 does not run in this mode.

The relationship view settings add a layout mode, orientation, optional root, visible relationship kinds, rank-defining relationship kinds, and incoming or outgoing layout direction. Existing boards without the new fields use network layout and show every canonical member-to-member relationship.

Rank-defining edges affect placement only. Other visible relationships remain contextual cross-links. Multiple roots, multiple parents or superiors, disconnected members, self-links, parallel edges, and cycles remain representable. A cycle or cross-link is reported as a layout condition; the application never deletes, reverses, or invents a semantic edge to make the picture look like a tree.

Automatic layout positions, camera state, selection, pan, and zoom remain transient. Persisted manual node positions are not part of this increment. Existing position fields remain readable for compatibility but are not promoted into canonical fictional meaning.

### Viewer and editor separation

The canonical Relationship route is an immersive, read-only explorer. It contains compact board selection and presentation controls, a full-viewport visual stage, a relationship-specific inspector, and an equivalent semantic list.

A sibling `/edit` route owns title, description, membership, root, visible kinds, rank-defining kinds, direction, orientation, archive status, and conflict recovery. Adding or removing a member never changes a relationship fact. Relationship facts continue to use the shared versioned item-document mutation path rather than canvas-local edges.

### Concise relationship knowledge

Selecting a member shows title, kind, status, a bounded authorized summary when available, and one row for every visible canonical connection. Outgoing connections use the authored forward label or kind. Incoming connections use the inverse label or an explicitly marked inverse fallback. Parallel facts are never collapsed into one count.

The semantic mode uses the same filtered presentation model. It provides member selection, a hierarchy grouping when configured, and a directional adjacency list. WebGL failure switches to this mode without discarding data or changing the board.

## Consequences

- The current graph experience is split into a reusable Sigma viewport plus Graph- and Relationship-specific composition.
- Relationship settings and document validation gain additive fields; no database or persistent graph-layout migration is required.
- The API applies saved visible-kind filters and reports the available member-to-member kinds for authoring.
- The Archive shell recognizes Relationship viewers as immersive and provides a dedicated edit/view action.
- Tests must cover deterministic layout, input ordering, orientations, direction, cycles, forests, multiple parents, parallel edges, inverse wording, WebGL fallback, reduced motion, keyboard navigation, conflicts, and canonical-data boundaries.
- Player-visible relationship boards still require a separate publication representation.

## References

- [Relationship UI revamp plan](../planning/relationship-ui-revamp.md)
- [ADR 0006: Archive exploration view model](0006-archive-exploration-view-model.md)
- [ADR 0007: Use Sigma.js for interactive Archive graphs](0007-webgl-graph-renderer.md)
- [ADR 0008: WebGL map renderer and visual system](0008-webgl-map-renderer-and-visual-system.md)
