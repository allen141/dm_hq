# ADR 0007: Use Sigma.js for interactive Archive graphs

- **Status:** Accepted
- **Date:** 2026-08-07
- **Owners:** Product and Engineering

## Context

The Archive proof of concept renders its bounded relationship graph as a static SVG grid. That implementation validates the read-model and privacy boundaries in [ADR 0006](0006-archive-exploration-view-model.md), but it does not support the interaction quality expected from a production graph explorer: force-directed layout, fluid pan and zoom, node selection, connected-node emphasis, concise information overlays, or a dense graph that remains responsive on a tablet.

The requested product direction also establishes a more polished visual language for DM HQ. The graph should feel like an adventurous campaign atlas while remaining calm enough for live play. It must not turn visual layout into campaign canon, weaken the DM-private publication boundary, or make WebGL the only way to navigate the information.

## Decision drivers

- Render a bounded 2D knowledge graph through WebGL without writing a graphics engine.
- Support typed node, edge, pointer, and touch interactions.
- Highlight a selected node and its immediate neighborhood without losing graph context.
- Settle automatic layout quickly rather than leaving the graph in perpetual motion.
- Keep React overlays, navigation, and accessible alternatives in the DOM.
- Preserve parallel, directional edge semantics from the existing graph response.
- Work with Next.js 16 and React 19 without evaluating browser-only code during server rendering.
- Use permissively licensed, actively maintained open-source packages.
- Keep the renderer replaceable behind a small application adapter.

## Options considered

### Sigma.js and Graphology

[Sigma.js](https://www.sigmajs.org/docs/) is a graph-specific WebGL renderer built on [Graphology](https://graphology.github.io/). It provides typed node, edge, touch, and stage [events](https://www.sigmajs.org/docs/advanced/events/), render reducers for transient emphasis, and official programs for richer node and edge rendering. [React Sigma](https://sim51.github.io/react-sigma/docs/start-introduction/) provides React lifecycle bindings and declares support for React 18 and 19. Graphology supplies a [ForceAtlas2 worker](https://graphology.github.io/standard-library/layout-forceatlas2.html) so layout work does not need to block the interface.

Sigma v4 is currently alpha, so it is not selected for this increment. The stable v3 packages are MIT licensed.

### Cytoscape.js

[Cytoscape.js](https://js.cytoscape.org/) has an excellent graph model, event system, layouts, and mature styling API. Its core and first-party extensions are MIT licensed. Its WebGL renderer is still described as a [preview with rendering limitations](https://blog.js.cytoscape.org/2025/01/13/webgl-preview/), which makes it a less suitable foundation for a graphics-led production surface today.

### react-force-graph

[react-force-graph](https://github.com/vasturiano/react-force-graph) offers a fast prototype path with force layout, picking, dragging, and animated directional particles. Its two-dimensional renderer uses HTML Canvas; WebGL is provided by the Three.js-based three-dimensional renderer. A 3D scene would reduce label clarity and increase navigation cost for live information retrieval.

### PixiJS

[PixiJS](https://github.com/pixijs/pixijs) is an excellent general WebGL/WebGPU 2D engine and offers an opt-in [accessibility overlay](https://pixijs.com/8.x/guides/components/accessibility). It does not provide graph storage, traversal, layout, edge routing, or graph-specific selection semantics. Adopting it would move too much graph behavior into DM HQ code.

### deck.gl

[deck.gl](https://github.com/visgl/deck.gl) provides high-performance WebGL layers, React integration, picking, transitions, and effects. It is strongest for geospatial or already-positioned data and does not supply a graph model or force layout. It would require a custom graph coordination layer for this use case.

## Decision

DM HQ will use the stable Sigma.js v3 ecosystem for the automatic Archive graph:

- `sigma` for WebGL rendering, camera control, picking, and transient render state;
- `graphology` for the client-side graph model and neighborhood traversal;
- `@react-sigma/core` for React lifecycle integration;
- `@react-sigma/layout-forceatlas2` and `graphology-layout-forceatlas2` for automatic layout in a worker;
- official Sigma satellite programs such as `@sigma/node-border`, `@sigma/edge-curve`, and `@sigma/layer-webgl` only where they provide a measured visual or semantic benefit; and
- `@floating-ui/react` for a DOM information card anchored to the selected canvas position.

The renderer is a client-only component loaded through a dynamic import with server rendering disabled. Application code owns an adapter that maps the existing `GraphResponse` to Graphology attributes. Canonical graph data and relationships remain server-owned read models; Graphology positions, camera state, selection, filters, and effects remain transient interface state.

ForceAtlas2 runs only long enough to settle a new result. It stops after the initial layout and after explicit relayout actions. Reduced-motion mode skips animated rearrangement and nonessential effects. Selection uses reducers to brighten the active node, its neighbors, and connecting edges while dimming unrelated elements without removing them.

The graph response will add a bounded, plain-text `summary` for each included node. The API derives this preview from the current authorized canonical document only after the bounded neighborhood is selected, strips markup, normalizes whitespace, and limits its length. This avoids shipping full Markdown for every node or issuing a full-document request on every click. The browser must not log preview text, edge labels, or relationship notes.

Node summaries and actions render in semantic React DOM. On desktop the selected-node card is anchored within the graph stage or presented as an inspector; on tablet it may become a bottom sheet. The existing relationship table evolves into an equivalent selectable list/table and remains available whenever WebGL is unavailable. Canvas labels, color, animation, or pointer hover are never the sole carriers of information.

All graph views remain DM-private and campaign-authorized. A player-visible graph still requires a separate publication representation; client-side hiding or filtering is not a publication boundary.

## Consequences

- The web bundle gains a client-only visualization chunk and several MIT-licensed dependencies.
- The graph UI gains performant pan, zoom, touch, selection, neighborhood emphasis, and richer visual programs without a custom renderer.
- The graph API and generated client gain a bounded node-preview field but no database migration or persistent graph layout.
- Parallel edges remain distinct in Graphology and in the accessible relationship table; curved rendering may separate them visually.
- Tests must cover server rendering, WebGL failure, reduced motion, keyboard/list navigation, selection overlays, graph limits, and private-data boundaries.
- The current endpoint still gathers campaign projections before applying output caps. Server-side traversal optimization remains a follow-up if representative large-campaign measurements show it is needed.
- Sigma is isolated behind an adapter so the renderer can be replaced if stable WebGPU or another graph engine materially outperforms it later.

## References

- [Graph UI revamp plan](../planning/graph-ui-revamp.md)
- [ADR 0006: Archive exploration view model](0006-archive-exploration-view-model.md)
- [Archive exploration views](../planning/archive-exploration-views.md)
- [The Archive](../product/archive.md)
