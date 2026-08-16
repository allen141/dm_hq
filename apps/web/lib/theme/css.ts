import { THEMES, type UiThemeTokens, type VisualizationPalette } from "./registry";

export const UI_THEME_PROPERTIES = {
  fontDisplay: "--theme-font-display",
  fontBody: "--theme-font-body",
  fontUi: "--theme-font-ui",
  surfacePage: "--theme-surface-page",
  surfaceDeep: "--theme-surface-deep",
  surfacePanel: "--theme-surface-panel",
  surfaceRaised: "--theme-surface-raised",
  surfaceSoft: "--theme-surface-soft",
  surfaceOverlay: "--theme-surface-overlay",
  surfaceInput: "--theme-surface-input",
  textPrimary: "--theme-text-primary",
  textSecondary: "--theme-text-secondary",
  textMuted: "--theme-text-muted",
  textInverse: "--theme-text-inverse",
  borderSubtle: "--theme-border-subtle",
  borderDefault: "--theme-border-default",
  borderStrong: "--theme-border-strong",
  accent: "--theme-accent",
  accentHover: "--theme-accent-hover",
  accentSoft: "--theme-accent-soft",
  onAccent: "--theme-on-accent",
  highlight: "--theme-highlight",
  highlightHover: "--theme-highlight-hover",
  highlightSoft: "--theme-highlight-soft",
  onHighlight: "--theme-on-highlight",
  link: "--theme-link",
  linkHover: "--theme-link-hover",
  success: "--theme-success",
  successSoft: "--theme-success-soft",
  warning: "--theme-warning",
  warningSoft: "--theme-warning-soft",
  danger: "--theme-danger",
  dangerSoft: "--theme-danger-soft",
  focus: "--theme-focus",
  selection: "--theme-selection",
  onSelection: "--theme-on-selection",
  shadowSm: "--theme-shadow-sm",
  shadowMd: "--theme-shadow-md",
  shadowDeep: "--theme-shadow-deep",
  radiusSm: "--theme-radius-sm",
  radiusMd: "--theme-radius-md",
  radiusLg: "--theme-radius-lg",
  radiusPill: "--theme-radius-pill",
} as const satisfies Record<keyof UiThemeTokens, `--theme-${string}`>;

export const VISUALIZATION_PROPERTIES = {
  background: "--viz-background",
  surface: "--viz-surface",
  grid: "--viz-grid",
  text: "--viz-text",
  textMuted: "--viz-text-muted",
  selection: "--viz-selection",
  neighbor: "--viz-neighbor",
  dimmedNode: "--viz-dimmed-node",
  dimmedEdge: "--viz-dimmed-edge",
  contour: "--viz-contour",
  statusArchived: "--viz-status-archived",
  statusDraft: "--viz-status-draft",
  statusCanon: "--viz-status-canon",
  nodeCampaign: "--viz-node-campaign",
  nodeNote: "--viz-node-note",
  nodeEntity: "--viz-node-entity",
  nodeSession: "--viz-node-session",
  edgeDocument: "--viz-edge-document",
  edgeReference: "--viz-edge-reference",
  edgeRelationship: "--viz-edge-relationship",
  mapNote: "--viz-map-note",
  mapEntity: "--viz-map-entity",
  mapSession: "--viz-map-session",
  mapArchived: "--viz-map-archived",
  mapSelection: "--viz-map-selection",
  hierarchyStructural: "--viz-hierarchy-structural",
  hierarchyContext: "--viz-hierarchy-context",
} as const satisfies Record<keyof VisualizationPalette, `--viz-${string}`>;

type ThemeValues = UiThemeTokens | VisualizationPalette;
type PropertyMap = Readonly<Record<string, `--${string}`>>;

function declarations(values: ThemeValues, properties: PropertyMap): string[] {
  return Object.entries(properties).map(([key, property]) => `  ${property}: ${values[key as keyof ThemeValues]};`);
}

export function generateThemeCss(): string {
  return THEMES.map((theme) => [
    `[data-theme="${theme.id}"] {`,
    "  color-scheme: dark;",
    ...declarations(theme.ui, UI_THEME_PROPERTIES),
    ...declarations(theme.visualization, VISUALIZATION_PROPERTIES),
    "}",
  ].join("\n")).join("\n\n");
}

export const THEME_CSS = generateThemeCss();
