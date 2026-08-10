# ADR 0008: WebGL map renderer and visual system

- **Status:** Accepted
- **Date:** 2026-08-07
- **Owners:** Product and Engineering

## Context

The Archive map proof of concept established the canonical boundary: an `archive_view` Markdown document owns a background image reference and normalized item placements, while Archive items remain the source of titles and prose. The next increment needs a richer map that can move between a conventional 2D image view and a constrained 3D presentation without creating a second map model.

The renderer must support custom graphical markers, selection summaries, pan and zoom, and a clear authoring path. It must also remain usable when WebGL is unavailable or an external image cannot be used as a GPU texture. This is especially important because the accepted proof-of-concept media model uses direct external HTTPS images, and WebGL texture uploads add a cross-origin requirement beyond ordinary image display.

The map redesign is also the first application of a more cohesive DM-private product style. That style should feel suited to adventurous play without becoming ornamental, difficult to scan during a session, or coupled to future player publications.

## Decision drivers

- Reuse the same normalized placements and background in 2D, 3D, and non-WebGL modes.
- Keep map facts, summaries, camera position, and renderer state out of competing stores.
- Make the map useful with a pointer, keyboard, touch, screen reader, or failed WebGL context.
- Keep the renderer focused on image-coordinate campaign maps rather than geographic tiles or GIS.
- Avoid maintaining separate 2D and 3D rendering stacks.
- Build on React and Three.js without hiding core behavior behind a large convenience layer.
- Give the DM a fast, legible interface during preparation and live play.

## Decision

### One Three.js renderer for two visual modes

Use [Three.js](https://threejs.org/) with [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction) for the enhanced map canvas. Do not add Drei initially. Use the Three.js [MapControls add-on](https://threejs.org/docs/#examples/en/controls/MapControls) through a small local adapter and implement the few required scene primitives directly.

One scene renders the same textured plane, normalized placements, marker identities, and selection model in both modes:

- **2D** uses an orthographic camera looking squarely at the map plane. Markers may use custom geometry, sprites, labels, and state-aware styling, but their anchors remain the canonical normalized `x` and `y` values.
- **3D** uses a constrained perspective camera over the same flat plane. Markers become three-dimensional objects positioned above their anchors. Rotation, pitch, near/far bounds, and zoom are restricted so the map cannot be lost or inverted.

Mode, camera transform, hover, selection, loaded texture, and renderer health are transient client state. Switching modes does not revise the `archive_view`. The existing map document schema and normalized placement contract are unchanged, so this decision requires no schema or data migration.

The renderer is dynamically imported and initialized only in the browser. Server rendering supplies the page shell, map metadata, editing controls, and accessible marker list without touching WebGL globals.

### Background image loading and fallback

The accepted external-image portability exception remains. A custom browser `Image` is created with `crossOrigin="anonymous"` and `referrerPolicy="no-referrer"` before its URL is assigned. The successfully loaded image becomes a Three.js texture.

An external host must therefore serve an appropriate CORS response for the image to be usable by WebGL. HTTPS alone is not sufficient. The interface explains both constraints: the host receives the browser request despite the missing referrer, and the exported campaign retains a remote URL rather than a self-contained asset.

Texture load failure, missing CORS permission, WebGL initialization failure, or context loss automatically selects a functional DOM 2D renderer. The fallback displays the image with the same no-referrer policy, overlays DOM markers using normalized coordinates, and preserves selection, item summaries, marker-list navigation, and all placement editing. A failure must never discard or rewrite placements. If the background itself is unavailable, the marker list and numeric coordinates remain fully operable and the page reports the unavailable-background state.

### Selection and item summaries

Selecting a visual marker or its marker-list entry opens a normal DOM quick-summary popup associated with that marker. The popup shows the current item title, kind or type, status, a bounded plain-text excerpt, and a link to the canonical Archive item page.

The view document does not copy the summary. On first selection, the client fetches the authorized full item and derives a bounded plain-text excerpt from the response. Results are cached in memory by item identity and current item version for the life of the page. Loading, unavailable, archived, and authorization-safe error states are explicit. Markdown or HTML is never injected into the popup.

Selection is shared between the WebGL marker, DOM fallback marker, and searchable marker list. Closing the popup returns focus to the control that opened it when that control still exists.

### Authoring interaction

Adding a placement requires an explicit **Add marker** mode. Ordinary clicks pan, inspect, or select; they never create content. While add-marker mode is active, the next valid point on the map supplies normalized, clamped coordinates for the selected Archive item, and the user confirms or cancels before saving.

Dragging an existing marker previews its position and persists only on pointer release. Numeric `x` and `y` controls, keyboard nudging, item search, remove, and open-page actions remain available in the DOM marker editor. Version conflicts stop the save and offer reload rather than attempting an automatic merge.

### Expedition console visual system

Adopt an **expedition console** direction for the DM-private application: modern ink surfaces, restrained teal for interactive and navigational state, and brass for high-value actions and selected cartographic detail. Typography, spacing, elevation, border, focus, motion, and status colors are expressed as shared semantic tokens rather than page-local literals.

The style should evoke field notes, instruments, and cartography through proportion, material, and small details rather than faux parchment, fantasy display type in body copy, or decorative clutter. Dense Archive tasks retain strong hierarchy, readable body text, visible focus, and touch-sized controls. The map may be visually immersive, but search, quick capture, utilities, warnings, and editing state remain recognizable parts of the same product.

This visual system applies across the private DM workspace. Player publication remains visually and architecturally separate; it does not inherit DM-only navigation, tokens, interaction assumptions, or private data merely because it renders an Archive item.

## Accessibility acceptance

The enhanced map is accepted only when all of the following are true:

- The canvas is supplemental. A semantic, searchable marker list exposes every marker, selection state, caption, item status, open-page action, and edit action available through the visual map.
- Mode, zoom, reset-view, add-marker, confirm, cancel, and popup-close controls are native buttons with visible names, states, and focus indicators.
- Every placement can be added, selected, moved in documented increments, assigned exact coordinates, and removed without dragging. Coordinates are announced as percentages or bounded numeric values.
- The summary popup has an accessible name, moves focus predictably when opened from the canvas, is dismissible with `Escape`, does not trap focus unnecessarily, and restores focus on close.
- Marker type, selection, archived state, and errors never rely on color, depth, hover, animation, or position alone.
- `prefers-reduced-motion` removes camera interpolation, marker bobbing, and nonessential transitions. Mode changes become immediate.
- Touch targets are at least 44 by 44 CSS pixels, and the complete workflow remains usable at the supported tablet viewport without two-dimensional page scrolling.
- A WebGL, texture, or background-image failure leaves the DOM workflow complete and announces one concise, non-repeating status message.

## Performance acceptance

Measure a production build in current Chromium on the agreed representative tablet and record the device, viewport, fixture revision, and whether the texture was warm or cold. With a 4096-by-4096 image and 250 placements:

- The page shell and marker list become interactive within 1.5 seconds at the 75th percentile on the local preview network.
- The dynamically loaded canvas reaches its first useful frame within 2.5 seconds at the 75th percentile after map metadata is available; the DOM UI remains usable while it loads.
- Pointer or keyboard selection updates visible state within 100 milliseconds at the 95th percentile, excluding the first item-summary network request.
- A cached summary opens within 100 milliseconds at the 95th percentile.
- A 2D/3D mode change produces a usable camera within 250 milliseconds, or immediately when reduced motion is enabled.
- Pan, zoom, and orbit sustain at least 30 frames per second at the 95th-percentile frame interval during the representative interaction trace.
- The renderer uses one canvas, one background texture, instanced or otherwise batched repeated marker geometry, and no continuous animation loop when the scene is idle.
- WebGL or texture failure activates the functional fallback within one second of the detected failure.

If a threshold fails, the enhanced mode remains non-default until the result is fixed or the acceptance budget is deliberately revised with measured evidence.

## Test acceptance

Automated coverage must include:

- Unit tests for normalized coordinate-to-plane conversion, clamping, camera bounds, 2D/3D mode state, keyboard nudge increments, excerpt normalization and length, summary cache keys, and add-marker state transitions.
- Component tests proving that canvas selection, DOM fallback selection, marker-list selection, popup content, canonical item links, archived state, and placement editing share the same adapter contracts.
- Failure tests for absent WebGL, context loss, image load failure, CORS/texture rejection, item-summary failure, and stale placement saves. Each verifies that editing data is retained.
- Security tests proving the summary is plain text, item fetches remain campaign-authorized, external images are never fetched by the server, and the custom image is configured for anonymous CORS with no referrer before loading.
- Playwright coverage for keyboard-only marker creation and editing, pointer selection, popup focus restoration, 2D/3D switching, reduced motion, tablet layout, fallback operation, repeat item placements, reload persistence, and archive/restore of a view.
- A production-build smoke test with real WebGL or Chromium software rendering, plus an explicit fallback test that does not depend on GPU availability.
- Visual-regression snapshots for the expedition-console shell, 2D map, 3D map, popup, loading, empty, archived, and failure states in the supported private-workspace theme.
- Performance evidence against the fixture and budgets above before the enhanced renderer becomes the default.

## Options considered

### deck.gl

[deck.gl](https://deck.gl/) provides high-performance, GPU-accelerated data layers and integrates well with geographic basemaps. Its layer model is stronger than this increment needs, while the core requirement is one authored image plane with custom 2D and 3D objects. Adopting it now would add abstractions aimed at large geospatial datasets without removing the need to model our scene and authoring behavior.

### PixiJS

[PixiJS](https://pixijs.com/) is an excellent WebGL-powered 2D renderer and would fit the orthographic map. It does not supply the desired perspective scene and 3D marker model. Pairing it with Three.js would create two renderers, two interaction stacks, and mode-parity work.

### MapLibre GL JS

[MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) is a strong open-source renderer for geographic maps, vector tiles, projections, and map-style layers. DM HQ currently uses normalized coordinates on arbitrary illustrations, building plans, and world images, not geographic coordinates or tiles. Forcing those images into a geographic abstraction would add complexity without advancing the accepted model.

### Babylon.js

[Babylon.js](https://www.babylonjs.com/) offers a comprehensive 3D engine, GUI systems, tooling, physics, and asset support. Those capabilities are valuable for a game scene but broader than a constrained textured plane and marker renderer. Three.js plus React Three Fiber fits the existing React application with a smaller conceptual surface.

### Separate 2D and 3D renderers

A hybrid such as PixiJS for 2D and Three.js for 3D could optimize each mode independently. It was rejected because camera behavior, marker appearance, hit testing, accessibility synchronization, and selection would have to be implemented and tested twice. One Three.js scene can express both cameras while the DOM remains the single accessible control surface.

### Drei from the outset

[Drei](https://github.com/pmndrs/drei) supplies useful React Three Fiber helpers. The first renderer needs only a small number of primitives and MapControls. Deferring Drei keeps ownership and bundle cost visible. It may be adopted later when several well-tested helpers would replace meaningful local complexity.

### Continue with only the simple DOM or SVG map

The current implementation is a valuable no-WebGL fallback and accessibility surface, but it cannot provide the selected 3D presentation or richer GPU-rendered markers. It is superseded as the primary map renderer, not removed.

## Delivery stages

1. Define expedition-console tokens and restyle the shared private shell, preserving current routes and workflows.
2. Extract a library-neutral map controller for normalized coordinates, selection, editing, summary loading, and renderer health.
3. Deliver the complete DOM 2D renderer and searchable marker editor as the baseline and automatic fallback.
4. Add the dynamically loaded Three.js and React Three Fiber scene, orthographic 2D camera, texture loader, and MapControls adapter.
5. Add constrained perspective 3D, shared custom markers, selection ray-casting, and mode controls.
6. Add explicit placement authoring, version-conflict handling, context-loss recovery, reduced motion, and polished empty/error states.
7. Complete automated acceptance, production-build performance evidence, accessibility review, OSS attribution, and representative tablet validation.

Each stage must leave the DOM workflow operable. The WebGL stage does not change canonical documents, APIs, or publication behavior.

## Consequences

- The web application gains `three` and `@react-three/fiber` as production dependencies and owns a small MapControls adapter.
- WebGL backgrounds have a stricter external-host requirement than ordinary images. Some existing URLs will use the DOM fallback until their hosts allow anonymous CORS.
- A shared controller and DOM surface are prerequisites, not post-release remediation.
- Item summaries introduce authorized lazy reads but no new canonical content or persistent cache.
- The visual redesign needs shared semantic tokens and component migration rather than map-only CSS.
- Uploaded, proxied, or bundled map assets remain a separate portability decision.

## References

- [ADR 0005: Markdown files as the canonical campaign-content format](0005-markdown-canonical-campaign-documents.md)
- [ADR 0006: Archive exploration view model](0006-archive-exploration-view-model.md)
- [Archive exploration views plan](../planning/archive-exploration-views.md)
- [Three.js](https://threejs.org/)
- [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction)
- [Three.js MapControls](https://threejs.org/docs/#examples/en/controls/MapControls)
