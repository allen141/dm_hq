# ADR 0010: Runtime themes for the private workspace

- **Status:** Accepted
- **Date:** 2026-08-16
- **Owners:** Product and Engineering

## Context

DM HQ currently mixes light reading and editing surfaces with dark Archive chrome and immersive visualization workspaces. The style studies established five dark fantasy directions that can share the existing information architecture and workflows. The production application needs one runtime theme contract that applies those directions consistently without turning a display preference into campaign content or weakening the boundary between private DM work and player publications.

[ADR 0008](0008-webgl-map-renderer-and-visual-system.md) selected an expedition-console visual system for the first private map and graph work. This decision expands that single private palette into a selectable family of dark themes. It supersedes only the single-palette portion of ADR 0008; its map renderer, accessibility, performance, and viewer/editor decisions remain accepted.

## Decision drivers

- Present one coherent dark experience across writing, editing, tables, maps, graphs, and relationship views.
- Preserve fast scanning, visible focus, and low distraction during live play.
- Let a DM choose a visual treatment without revising, exporting, or synchronizing campaign documents.
- Apply the selected palette before first paint and retain it when the application is temporarily unreachable.
- Keep CSS, Sigma.js, and Three.js colors aligned through one typed contract.
- Keep unauthenticated player publications visually and architecturally separate from the private workspace.
- Avoid adding account-preference APIs before cross-device synchronization is demonstrated to be useful.

## Options considered

### One fixed dark theme

A single Night Cartographer theme would minimize implementation and testing cost. It would discard four reviewed directions and would make later runtime selection another migration.

### Device-persisted private themes

The browser stores one allowlisted theme key in a same-origin cookie. The server-rendered private shell can read the cookie before first paint, while the choice remains independent of campaign documents and backend availability. The preference does not automatically follow the user to another device.

### Account-persisted private themes

A user-preference record and API would synchronize the choice across devices. The current Django user model and API have no preference surface, so this option adds a migration, endpoints, generated client changes, and reconciliation with a first-paint cache before its value has been validated.

### Campaign-persisted themes

A campaign field or `campaign.md` frontmatter could make a theme shared campaign configuration. That would make a personal display choice part of campaign revisions, conflicts, export, restore, and local agent workspaces. It would also leave the campaign list without one unambiguous theme and create pressure to apply private styling to player publications.

## Decision

### Private theme catalog

The private DM workspace supports exactly five selectable dark themes in the first runtime release:

| Stable key | Display name | Direction |
| --- | --- | --- |
| `emberkeep` | Emberkeep | Blackened iron, warm brass, and banked coals. |
| `astral` | Astral Codex | Smoked indigo, moonlit type, amethyst, and cyan. |
| `verdant` | Verdant Ruins | Forest-black stone, moss, and aged copper. |
| `scriptorium` | Obsidian Scriptorium | Charcoal leather, wine red, and antique gold. |
| `cartographer` | Night Cartographer | Deep ocean ink, brass survey marks, and teal signals. |

Night Cartographer (`cartographer`) is the default when no valid choice is available. Every theme uses a dark color scheme; a light or operating-system-following mode is outside this decision.

### Device persistence and first paint

The initial runtime stores the selected stable key in a client-readable, same-origin `dmhq_theme` cookie. The cookie is device and browser scoped, uses `Path=/` and `SameSite=Lax`, has a long but finite lifetime, and is `Secure` in hosted HTTPS environments. It contains no user, campaign, publication, or authentication identifier.

The private application shell reads and validates the cookie before rendering themed content. Missing, expired, unknown, or removed values select Night Cartographer. Choosing a theme updates both the private root and the cookie immediately. Clearing browser data resets the choice. Account synchronization is deferred and the initial release requires no database or API migration.

### Presentation data is not campaign data

The selected theme and its registry are application presentation state. They are not stored in `Campaign`, `campaign.md`, Archive items, Archive views, templates, publications, or Markdown frontmatter. They do not appear in campaign exports, restore manifests, workspace snapshots, change streams, or local agent workspaces. Selecting a theme never creates a campaign revision or changes campaign authorization.

### One typed theme registry

A typed frontend registry is the source of truth for valid keys, labels, semantic UI tokens, and renderer palettes. The selected registry entry:

- exposes semantic CSS custom properties on the private workspace root;
- provides Sigma.js node, edge, label, selection, status, and contour colors;
- provides Three.js stage, light, marker, selection, and status colors; and
- supplies equivalent colors to DOM and SVG fallbacks.

Pages and renderers consume semantic roles rather than branching on theme names or retaining page-local color literals. A runtime change must recolor or rebuild an active canvas without changing its data, selection, camera, or document state.

### Player publication palette

The unauthenticated player-publication surface uses one fixed independent dark palette. It neither reads nor inherits `dmhq_theme`, private theme tokens, DM navigation, or private interaction assumptions. Opening the same publication with different private-theme cookies must produce the same player presentation.

A future campaign-branded or publication-selectable player theme would require its own safe, versioned publication decision. It must not be inferred from a DM preference or from client-side filtering.

### Shared accessibility requirements

All themes retain the existing keyboard, touch-target, reduced-motion, forced-colors, and semantic-fallback requirements. Text, focus, controls, statuses, and graph or map meaning must not depend on color, texture, hover, or animation alone. Theme selection changes presentation only; routes, labels, control order, and workflows remain stable.

## Consequences

- DMs can choose among five dark directions while Night Cartographer gives every new or reset device a predictable default.
- The choice works before authentication and remains locally available without a preference API, but it does not follow the same user to another browser or device.
- Cookie validation and a default fallback make removing or renaming a theme recoverable, though stable keys should be treated as durable once released.
- The private CSS system and WebGL/SVG renderers must migrate from local color literals to the shared registry.
- Visual, contrast, interaction, and renderer regression coverage expands across five private themes plus the fixed player palette.
- Campaign exports and local workspaces remain portable content archives rather than carriers of application appearance settings.
- Account synchronization, campaign branding, light themes, and player-selectable themes remain separate future decisions.

## References

- [Runtime theme migration plan](../planning/runtime-theme-migration.md)
- [ADR 0008: WebGL map renderer and visual system](0008-webgl-map-renderer-and-visual-system.md)
- [Product vision](../product/vision.md)

