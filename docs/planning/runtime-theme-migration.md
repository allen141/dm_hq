# Runtime theme migration

**Status:** Proposed delivery plan for accepted [ADR 0010](../decisions/0010-runtime-private-workspace-themes.md).

## Goal

Move every private DM workflow onto the five-theme dark runtime without changing routes, campaign data, authorization, document behavior, or player-publication output.

## Confirmed decisions

- Emberkeep, Astral Codex, Verdant Ruins, Obsidian Scriptorium, and Night Cartographer are the supported private themes.
- Night Cartographer is the default.
- The initial selection persists in the allowlisted `dmhq_theme` device cookie.
- Theme state is excluded from campaign documents, revisions, exports, restores, and local workspaces.
- A typed registry supplies semantic CSS, Sigma.js, Three.js, DOM, and SVG palettes.
- Player publications use a fixed independent dark palette.
- Account synchronization is deferred.

## Current gap

The production stylesheet starts from a light color scheme. Standard pages, forms, tables, and editors use pale surfaces, while Archive chrome and immersive visualization routes use separate dark colors. Graph, map, and relationship renderers also retain palette literals outside the shared CSS tokens. The style lab demonstrates the five directions, but its route-selected CSS modules are review artifacts rather than the production runtime contract.

## Proposed delivery

### 1. Establish the runtime contract

- Create the typed registry with the stable keys and Night Cartographer fallback from ADR 0010.
- Define semantic roles for canvas, surfaces, text, borders, actions, focus, status, privacy, charts, and renderer states.
- Read and validate `dmhq_theme` before rendering the private shell; update the private root and cookie synchronously when the choice changes.
- Scope private tokens so the style lab and public publication route cannot inherit the selected theme.
- Keep the style lab URL-driven and non-persistent while it remains a comparison tool.

### 2. Migrate document and application surfaces

- Convert the campaign list, Archive shell, Wiki, item modes, forms, cards, tables, notices, dialogs, and build marker to semantic tokens.
- Remove the light/dark split from map and relationship editors and from accessible visualization fallbacks.
- Preserve typography hierarchy, 44-pixel touch targets, visible focus, and current responsive layouts.
- Keep privacy and publication states explicit in text and structure rather than encoding them only in color.

### 3. Migrate visual renderers

- Pass the selected typed palette into automatic Graph and relationship Sigma adapters, reducers, labels, contours, selection, and archived/draft/canon treatments.
- Pass the same registry entry into Three.js stage, lighting, map markers, selection, and fallback marker styles.
- Apply semantic theme roles to the relationship hierarchy SVG and every DOM fallback.
- Recolor or rebuild active renderers on a theme change without losing selection, focus, camera state, filters, or unsaved edits.

### 4. Add selection and harden the system

- Add an accessible private-workspace theme chooser with the five names and a clear selected state.
- Verify missing, invalid, expired, and removed cookie values fall back to Night Cartographer without an error loop or light flash.
- Add visual-regression fixtures for common document surfaces and representative Graph, Map, and Relationship states in every theme.
- Verify the public publication surface is identical under every private-theme cookie value.
- Record desktop and tablet review evidence before removing the style lab.

## Acceptance checks

- Every private route renders a dark background and usable native controls before hydration.
- Reloading on the same browser retains the chosen theme; clearing or corrupting the cookie selects Night Cartographer.
- Changing themes does not issue campaign mutations, create Markdown revisions, or alter export and workspace payloads.
- Campaign list, Wiki, item reading/editing/source/history/publishing, Graph, Graph table, Map viewer/editor, and Relationship viewer/editor retain their current workflows.
- Normal text meets a 4.5:1 contrast ratio; large text, focus indicators, and meaningful component boundaries meet at least 3:1 in each theme.
- Keyboard-only, touch, reduced-motion, and forced-colors operation remains complete.
- Graph, map, and relationship meaning continues to use labels, shapes, line styles, wording, or structure in addition to color.
- A public handout has the same fixed palette, content, and controls regardless of the device's private theme.
- Existing unit, component, end-to-end, strict documentation, and production build checks pass.

## Rollback

The initial rollout adds no persistent server data. A faulty theme can be removed from the registry and its cookie value will fall back to Night Cartographer. A broader rollback can make Night Cartographer the only registered private theme while retaining the semantic token and renderer contracts. Campaign content, exports, and workspaces require no migration or repair.

## Deferred work

The following are not part of this migration:

- synchronizing the preference through a user account;
- campaign-specific or per-view branding;
- selectable or campaign-derived player-publication themes;
- a light or operating-system-following theme;
- offline application data or service-worker support; and
- changing Archive, Dashboard, or Battlefield workflows to fit a visual direction.

