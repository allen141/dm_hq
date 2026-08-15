# Graph UI revamp

## Outcome

This increment turns the Archive Graph proof of concept into a production-shaped campaign atlas. It adds a rich 2D WebGL explorer, concise node summaries, connected-node highlighting, responsive information overlays, and a modern product visual system while preserving the existing canonical-data, authorization, portability, and accessibility boundaries.

[ADR 0007](../decisions/0007-webgl-graph-renderer.md) accepts the Sigma.js and Graphology stack. This plan is approved for implementation.

## Confirmed decisions

- The automatic Graph remains a derived, read-only, DM-private view of canonical Archive documents and projections.
- Sigma.js v3 renders the graph through WebGL; Graphology represents the transient client graph.
- ForceAtlas2 runs in a worker and settles rather than continuously moving during play.
- Clicking a node selects it and opens a summary card. Navigation is a deliberate action inside that card.
- Selection emphasizes the immediate neighborhood and dims unrelated content without hiding it.
- Short node summaries are bounded server-derived previews, not copied or separately authored campaign data.
- The relationship table/list remains an equivalent keyboard-operable experience and the WebGL failure fallback.
- Focus, filters, selection, pan, zoom, and layout positions remain transient interface state.
- The visual direction is an editorial campaign atlas: warm reading surfaces, a deep technical graph stage, restrained verdigris and amber accents, and modern UI typography.
- Player-visible graphs remain outside this increment and require a separate publication artifact.

## Package review

| Option | Strengths | Why it is or is not selected |
| --- | --- | --- |
| [Sigma.js](https://www.sigmajs.org/docs/) + [Graphology](https://graphology.github.io/) | Purpose-built 2D WebGL graph rendering, typed picking events, reducers, React bindings, worker layouts, official visual programs, MIT | Selected. It covers graph rendering and interaction without introducing a scene engine or custom graph framework. |
| [Cytoscape.js](https://js.cytoscape.org/) | Mature graph API, large layout ecosystem, rich selectors and events, MIT | Strong fallback, but its [WebGL renderer is provisional](https://blog.js.cytoscape.org/2025/01/13/webgl-preview/) and currently limits visual styling. |
| [react-force-graph](https://github.com/vasturiano/react-force-graph) | Quick force-graph prototyping, dragging, click events, directional particles, MIT | Not selected because its 2D mode uses Canvas and its WebGL path is a Three.js 3D scene. |
| [PixiJS](https://github.com/pixijs/pixijs) | Fast WebGL/WebGPU 2D engine, effects, touch, optional DOM accessibility overlay, MIT | Not selected because graph traversal, layout, edge routing, and graph semantics would become application code. |
| [deck.gl](https://github.com/visgl/deck.gl) | High-performance WebGL layers, picking, effects, React integration, MIT | Not selected because it has no graph model or force layout and is better suited to geospatial or pre-positioned networks. |

The initial dependency set is `sigma`, `graphology`, `@react-sigma/core`, `@react-sigma/layout-forceatlas2`, `graphology-layout-forceatlas2`, `@sigma/node-border`, `@sigma/edge-curve`, `@sigma/layer-webgl`, and `@floating-ui/react`. Dependencies remain isolated to the graph experience. Optional visual programs may be removed if compatibility, bundle, or performance measurements do not justify them.

## Shared visualization dependency boundary

The merged Graph MR establishes a deliberate two-renderer boundary rather than a second competing graphics framework:

- `@floating-ui/react` is the shared DOM overlay primitive. Graph inspectors, map marker summaries, and future relationship-board cards should use the same anchored positioning, collision handling, focus return, and tablet bottom-sheet adapter.
- `graphology` is the shared transient graph data model. The automatic Graph uses it today; Relationship boards may use it for membership filtering, adjacency, and cycle-safe traversal while keeping board membership and manual positions canonical in Markdown.
- GraphResponse, PageIdentity, selection, renderer-health, and DOM-fallback contracts are shared application adapters. WebGL capability checks, dynamic client-only loading, reduced-motion behavior, and semantic list/table fallbacks should be implemented once at that boundary.
- Sigma remains graph-specific: it supplies graph WebGL rendering, picking, reducers, and ForceAtlas2 integration.
- Three.js and React Three Fiber remain map-specific: they supply the textured image plane, orthographic/perspective cameras, and custom 3D markers. They do not replace Sigma, and Sigma is not used to render the map.

Do not add a third renderer or duplicate camera/overlay stack for Relationship boards until measured interaction evidence requires it. Keep all renderer packages client-only and review their licenses and bundle cost together.

## Experience design

### Application shell

The shared shell should feel like one product rather than a collection of prototypes.

- Keep the campaign title, private-workspace signal, Archive lenses, search, and quick capture visible.
- Use semantic global tokens for warm reading surfaces, elevated panels, deep graph surfaces, inverse text, action color, adventure accent, borders, focus, and status.
- Reserve the display serif for campaign and section titles. Controls, tables, metadata, labels, and graph text use a legible system sans-serif stack.
- Keep decoration atmospheric: large-scale radial light, subtle grid or contour texture, and shallow material depth. Avoid ornamental fantasy controls.
- Use the new tokens across the home page, Archive shell, forms, cards, tables, public pages, and build marker so the style reads as a site system.

### Graph workspace

The graph becomes a full-width atlas workspace with three responsibilities:

1. A compact explorer and toolbar provide an unfocused overview or focused one-hop/two-hop depth, connection filters, legend, fit, zoom, and relayout.
2. The WebGL stage prioritizes pan, zoom, focus, and selection while showing node kind, status, edge class, and direction through more than color alone.
3. A selected-node card provides kind, status, summary, connection count, connected pages, an **Open page** action, and an **Explore neighborhood** action.

Clicking empty space closes the card. Escape closes it and returns focus to the selection control when practical. Search and the semantic node list can select and focus a node without pointer input. A live region announces selection changes.

### Motion and effects

- Animate camera focus and selection emphasis for roughly 160–220 milliseconds.
- Stop force layout once the graph settles.
- Use a short focus halo or contour around the active neighborhood and restrained edge brightening.
- Use near-static atmospheric stage texture rather than perpetual particles or continuously moving edges.
- Disable camera tweening, layout animation, halos, shimmer, and nonessential transitions for `prefers-reduced-motion`.

### Responsive behavior

- Wide desktop layouts may show explorer, graph, and inspector simultaneously.
- At tablet widths the graph remains primary; filters collapse and the inspector becomes a side or bottom sheet.
- Touch targets are at least 44 pixels and no critical behavior depends on hover.
- Narrow layouts favor inspection and the semantic list over dense manipulation.

## Technical shape

### Server contract

The existing campaign-authorized graph endpoint remains the only graph-data source. After it selects the bounded neighborhood, it adds a `summary` to each returned node:

- campaign summary from the canonical campaign document body;
- item summary from the current canonical Archive item body;
- Markdown and HTML stripped to normalized plain text;
- a fixed maximum length with an ellipsis when truncated; and
- an empty, useful fallback when a document is unavailable.

No graph positions or preview copy are stored. The endpoint continues to return its safety limits and truncation flags.

### Client boundaries

- `ArchiveGraphPage` owns loading, error, depth, edge filters, focus queries, and the returned graph.
- `GraphExperience` owns transient selection, search, WebGL capability, fallback mode, and the inspector.
- A pure adapter maps `GraphResponse` into a directed multi-Graphology graph with visual attributes.
- A client-only Sigma renderer owns the WebGL instance, ForceAtlas2 worker, camera, and render reducers.
- `GraphInspector` and the graph table/list remain normal React DOM.
- The renderer loads dynamically with server rendering disabled and has explicit loading and failure states.

### Privacy and portability

- The backend authorizes campaign membership before resolving any node or preview.
- The frontend never logs graph data, summaries, labels, notes, or search terms.
- The browser receives only the bounded private graph requested by the owner.
- WebGL state is disposable and never enters campaign export, workspace sync, or canonical Markdown.
- Filtering a private graph never creates player-safe content.

## Delivery plan

### 1. Architecture and product system

- Record the renderer decision and package review.
- Add site-wide visual tokens and update the shared application and Archive shell.
- Define graph workspace, inspector, responsive, motion, and fallback states.

**Exit:** the accepted decision and this plan build under strict documentation validation.

### 2. Preview contract

- Add bounded summaries after server-side neighborhood selection.
- Update API tests, OpenAPI, and generated TypeScript types.
- Preserve authorization, edge semantics, limits, and deterministic output.

**Exit:** a graph response contains useful short previews without full Markdown or new persistent data.

### 3. WebGL graph foundation

- Install the selected MIT-licensed dependencies.
- Build the Graphology adapter and client-only renderer.
- Add seeded initial positions, worker-based ForceAtlas2, fit, zoom, pan, touch, and relayout.
- Preserve parallel edge identity and directional semantics.

**Exit:** the current bounded fixture renders responsively in WebGL and the Next.js server build does not evaluate browser globals.

### 4. Selection and overlays

- Add pointer, touch, search, and list selection.
- Add neighborhood reducers and active-node visual effects.
- Add the semantic summary card, connected-page list, open action, and explore-neighborhood action.
- Add node and edge legends plus visible truncation guidance.

**Exit:** a DM can select a page, understand why it is connected, open it, or refocus the graph without losing context.

### 5. Progressive enhancement

- Keep the semantic relationship table/list present and selectable.
- Detect WebGL initialization failure and switch to list/table mode without crashing.
- Add reduced-motion behavior, live announcements, Escape/focus behavior, and visible keyboard focus.
- Complete desktop and tablet layouts.

**Exit:** keyboard-only, reduced-motion, and WebGL-unavailable use retain the same facts and navigation.

### 6. Validation and handoff

- Run API, generated-client, lint, type, component, build, end-to-end, and strict documentation checks.
- Exercise 100 nodes and 250 edges, parallel edges, empty graphs, truncation, failed WebGL, reduced motion, and a tablet viewport.
- Review the dependency tree and licenses.
- Update the draft pull request with scope, decisions, screenshots if available, checks, and known follow-up work.

**Exit:** the branch is pushed, the draft pull request contains the completed implementation, and all available checks pass.

## Acceptance criteria

- A focused graph loads as a responsive 2D WebGL scene with pan, zoom, fit, and settled force layout.
- Pointer, touch, search, and keyboard/list interaction can select a node.
- Selection visibly distinguishes the active node, connected nodes, connecting edges, and unrelated context.
- The selected-node card shows a bounded summary, metadata, connected pages, and canonical navigation.
- Depth and edge-class controls update the server-backed graph and preserve clear loading, error, empty, and truncation states.
- WebGL failure leaves a useful selectable relationship list/table with no uncaught error.
- Reduced-motion users receive immediate state changes without nonessential movement.
- The graph and all summaries remain DM-private; no player mode is inferred from client filtering.
- The redesigned site is coherent across the campaign list, Archive shell, graph workspace, forms, cards, tables, and public reading surface.
- The strict documentation build, application checks, and representative browser flow pass.

## Follow-up measurements

The existing 100-node and 250-edge limits remain hypotheses. Record API time, layout time, time to first interaction, selection latency, and frame responsiveness on representative desktop and tablet hardware. Optimize server traversal or reconsider optional visual layers only from measured evidence. A graph database, persistent automatic-graph positions, and player-visible graph remain separate decisions.
