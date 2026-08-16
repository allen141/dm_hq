export type UiThemeTokens = Readonly<{
  fontDisplay: string;
  fontBody: string;
  fontUi: string;
  surfacePage: string;
  surfaceDeep: string;
  surfacePanel: string;
  surfaceRaised: string;
  surfaceSoft: string;
  surfaceOverlay: string;
  surfaceInput: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  borderSubtle: string;
  borderDefault: string;
  borderStrong: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  onAccent: string;
  highlight: string;
  highlightHover: string;
  highlightSoft: string;
  onHighlight: string;
  link: string;
  linkHover: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  focus: string;
  selection: string;
  onSelection: string;
  shadowSm: string;
  shadowMd: string;
  shadowDeep: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  radiusPill: string;
}>;

export type VisualizationPalette = Readonly<{
  background: string;
  surface: string;
  grid: string;
  text: string;
  textMuted: string;
  selection: string;
  neighbor: string;
  dimmedNode: string;
  dimmedEdge: string;
  contour: string;
  statusArchived: string;
  statusDraft: string;
  statusCanon: string;
  nodeCampaign: string;
  nodeNote: string;
  nodeEntity: string;
  nodeSession: string;
  edgeDocument: string;
  edgeReference: string;
  edgeRelationship: string;
  mapNote: string;
  mapEntity: string;
  mapSession: string;
  mapArchived: string;
  mapSelection: string;
  hierarchyStructural: string;
  hierarchyContext: string;
}>;

type ThemeDefinitionShape = Readonly<{
  id: string;
  name: string;
  description: string;
  ui: UiThemeTokens;
  visualization: VisualizationPalette;
}>;

const serifDisplay = 'Georgia, "Times New Roman", serif';
const bookDisplay = '"Iowan Old Style", Baskerville, "Palatino Linotype", Georgia, serif';
const verdantDisplay = '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const uiFont = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const themeDefinitions = [
  {
    id: "emberkeep",
    name: "Emberkeep",
    description: "Blackened iron, warm brass, banked coals, and decisive high-contrast controls.",
    ui: {
      fontDisplay: serifDisplay,
      fontBody: serifDisplay,
      fontUi: uiFont,
      surfacePage: "#0b0a09",
      surfaceDeep: "#060606",
      surfacePanel: "#151310",
      surfaceRaised: "#1c1915",
      surfaceSoft: "#211d18",
      surfaceOverlay: "rgb(11 10 9 / 92%)",
      surfaceInput: "#0f0d0b",
      textPrimary: "#f4ecdc",
      textSecondary: "#c3b8a5",
      textMuted: "#918574",
      textInverse: "#241306",
      borderSubtle: "#2e271f",
      borderDefault: "#4a3a27",
      borderStrong: "#6b4d2c",
      accent: "#dc9845",
      accentHover: "#efaa55",
      accentSoft: "rgb(220 152 69 / 14%)",
      onAccent: "#241306",
      highlight: "#f5c270",
      highlightHover: "#ffd58e",
      highlightSoft: "rgb(245 194 112 / 13%)",
      onHighlight: "#241306",
      link: "#efad5e",
      linkHover: "#ffd79b",
      success: "#81b99b",
      successSoft: "rgb(129 185 155 / 14%)",
      warning: "#e0a856",
      warningSoft: "rgb(224 168 86 / 14%)",
      danger: "#e06f4f",
      dangerSoft: "rgb(224 111 79 / 14%)",
      focus: "#ffd083",
      selection: "#f5c270",
      onSelection: "#241306",
      shadowSm: "0 8px 24px rgb(0 0 0 / 28%)",
      shadowMd: "0 20px 52px rgb(0 0 0 / 40%)",
      shadowDeep: "0 28px 80px rgb(0 0 0 / 54%)",
      radiusSm: "2px",
      radiusMd: "4px",
      radiusLg: "8px",
      radiusPill: "999px",
    },
    visualization: {
      background: "#080706",
      surface: "#17130f",
      grid: "#4f3822",
      text: "#f4ecdc",
      textMuted: "#a99b86",
      selection: "#f5c270",
      neighbor: "#ed9e4d",
      dimmedNode: "#352b22",
      dimmedEdge: "#413326",
      contour: "#dc9845",
      statusArchived: "#82796c",
      statusDraft: "#d99a4a",
      statusCanon: "#81b99b",
      nodeCampaign: "#f5c270",
      nodeNote: "#dc9845",
      nodeEntity: "#83b39d",
      nodeSession: "#ad83c6",
      edgeDocument: "#7f9ba0",
      edgeReference: "#dba14e",
      edgeRelationship: "#a77abd",
      mapNote: "#e2a450",
      mapEntity: "#81b99b",
      mapSession: "#ad83c6",
      mapArchived: "#82796c",
      mapSelection: "#ffe0a3",
      hierarchyStructural: "#d49345",
      hierarchyContext: "#9e75b2",
    },
  },
  {
    id: "astral",
    name: "Astral Codex",
    description: "Smoked indigo crystal, moonlit type, and restrained arcs of amethyst and cyan.",
    ui: {
      fontDisplay: bookDisplay,
      fontBody: bookDisplay,
      fontUi: uiFont,
      surfacePage: "#080813",
      surfaceDeep: "#05050d",
      surfacePanel: "#111023",
      surfaceRaised: "#19172f",
      surfaceSoft: "#201e39",
      surfaceOverlay: "rgb(8 8 19 / 92%)",
      surfaceInput: "#0c0b1c",
      textPrimary: "#f0efff",
      textSecondary: "#c5c2df",
      textMuted: "#9691b5",
      textInverse: "#100c2a",
      borderSubtle: "#292644",
      borderDefault: "#39345d",
      borderStrong: "#5b5483",
      accent: "#9d7cf5",
      accentHover: "#b69bff",
      accentSoft: "rgb(157 124 245 / 15%)",
      onAccent: "#100c2a",
      highlight: "#69d3e7",
      highlightHover: "#95e8f5",
      highlightSoft: "rgb(105 211 231 / 13%)",
      onHighlight: "#08151d",
      link: "#b8a5ff",
      linkHover: "#d8d1ff",
      success: "#69d3e7",
      successSoft: "rgb(105 211 231 / 13%)",
      warning: "#e4b96d",
      warningSoft: "rgb(228 185 109 / 14%)",
      danger: "#ed80ab",
      dangerSoft: "rgb(237 128 171 / 14%)",
      focus: "#d4ddff",
      selection: "#9d7cf5",
      onSelection: "#0d0922",
      shadowSm: "0 8px 24px rgb(1 0 16 / 30%)",
      shadowMd: "0 22px 58px rgb(1 0 16 / 46%)",
      shadowDeep: "0 28px 90px rgb(1 0 16 / 64%)",
      radiusSm: "10px",
      radiusMd: "16px",
      radiusLg: "22px",
      radiusPill: "999px",
    },
    visualization: {
      background: "#070711",
      surface: "#15132b",
      grid: "#40396c",
      text: "#f0efff",
      textMuted: "#aaa5c8",
      selection: "#d4ddff",
      neighbor: "#69d3e7",
      dimmedNode: "#292642",
      dimmedEdge: "#343052",
      contour: "#9d7cf5",
      statusArchived: "#77738b",
      statusDraft: "#e1b064",
      statusCanon: "#69d3e7",
      nodeCampaign: "#d4ddff",
      nodeNote: "#69d3e7",
      nodeEntity: "#9d7cf5",
      nodeSession: "#ed80ab",
      edgeDocument: "#69d3e7",
      edgeReference: "#d9b467",
      edgeRelationship: "#b491ff",
      mapNote: "#d9b467",
      mapEntity: "#69d3e7",
      mapSession: "#b491ff",
      mapArchived: "#77738b",
      mapSelection: "#eef1ff",
      hierarchyStructural: "#76d7e7",
      hierarchyContext: "#b491ff",
    },
  },
  {
    id: "verdant",
    name: "Verdant Ruins",
    description: "Forest-black stone, moss wayfinding, aged copper, and an organic but focused rhythm.",
    ui: {
      fontDisplay: verdantDisplay,
      fontBody: verdantDisplay,
      fontUi: uiFont,
      surfacePage: "#080d0a",
      surfaceDeep: "#050806",
      surfacePanel: "#0e1712",
      surfaceRaised: "#162019",
      surfaceSoft: "#1d2a20",
      surfaceOverlay: "rgb(8 13 10 / 92%)",
      surfaceInput: "#0a120d",
      textPrimary: "#e8eadb",
      textSecondary: "#c1c9b3",
      textMuted: "#929f86",
      textInverse: "#111707",
      borderSubtle: "#263129",
      borderDefault: "#354237",
      borderStrong: "#52624e",
      accent: "#91ad60",
      accentHover: "#a8c474",
      accentSoft: "rgb(145 173 96 / 15%)",
      onAccent: "#111707",
      highlight: "#c5844c",
      highlightHover: "#d99b62",
      highlightSoft: "rgb(197 132 76 / 14%)",
      onHighlight: "#211106",
      link: "#adc777",
      linkHover: "#d8d49a",
      success: "#77b69a",
      successSoft: "rgb(119 182 154 / 14%)",
      warning: "#d0a35a",
      warningSoft: "rgb(208 163 90 / 14%)",
      danger: "#d66f5d",
      dangerSoft: "rgb(214 111 93 / 14%)",
      focus: "#d8d49a",
      selection: "#91ad60",
      onSelection: "#111707",
      shadowSm: "0 8px 24px rgb(0 5 2 / 25%)",
      shadowMd: "0 22px 54px rgb(0 5 2 / 40%)",
      shadowDeep: "0 28px 82px rgb(0 5 2 / 58%)",
      radiusSm: "12px 4px",
      radiusMd: "18px 5px",
      radiusLg: "26px 6px",
      radiusPill: "999px",
    },
    visualization: {
      background: "#060b08",
      surface: "#121d16",
      grid: "#334536",
      text: "#e8eadb",
      textMuted: "#a4b097",
      selection: "#d8d49a",
      neighbor: "#91ad60",
      dimmedNode: "#263028",
      dimmedEdge: "#303b31",
      contour: "#78944f",
      statusArchived: "#747d6d",
      statusDraft: "#c69251",
      statusCanon: "#77b69a",
      nodeCampaign: "#d8d49a",
      nodeNote: "#91ad60",
      nodeEntity: "#77b69a",
      nodeSession: "#c5844c",
      edgeDocument: "#77b69a",
      edgeReference: "#c5844c",
      edgeRelationship: "#9c7bab",
      mapNote: "#c5844c",
      mapEntity: "#91ad60",
      mapSession: "#9c7bab",
      mapArchived: "#747d6d",
      mapSelection: "#e7e2aa",
      hierarchyStructural: "#91ad60",
      hierarchyContext: "#b17882",
    },
  },
  {
    id: "scriptorium",
    name: "Obsidian Scriptorium",
    description: "Charcoal leather, wine-red bookmarks, antique gold rules, and intimate bookish typography.",
    ui: {
      fontDisplay: bookDisplay,
      fontBody: bookDisplay,
      fontUi: uiFont,
      surfacePage: "#0c0909",
      surfaceDeep: "#070505",
      surfacePanel: "#151010",
      surfaceRaised: "#1e1715",
      surfaceSoft: "#28201a",
      surfaceOverlay: "rgb(12 9 9 / 93%)",
      surfaceInput: "#100c0b",
      textPrimary: "#f0e5d2",
      textSecondary: "#c7b9a3",
      textMuted: "#a0907c",
      textInverse: "#271803",
      borderSubtle: "#332920",
      borderDefault: "#4b3a2d",
      borderStrong: "#654c36",
      accent: "#9a3651",
      accentHover: "#b34a66",
      accentSoft: "rgb(154 54 81 / 16%)",
      onAccent: "#fff4df",
      highlight: "#c79a4e",
      highlightHover: "#e0bd76",
      highlightSoft: "rgb(199 154 78 / 14%)",
      onHighlight: "#271803",
      link: "#d6ad64",
      linkHover: "#efd394",
      success: "#7fa487",
      successSoft: "rgb(127 164 135 / 14%)",
      warning: "#c79a4e",
      warningSoft: "rgb(199 154 78 / 14%)",
      danger: "#b85a70",
      dangerSoft: "rgb(184 90 112 / 15%)",
      focus: "#e3c883",
      selection: "#7f273e",
      onSelection: "#fff3de",
      shadowSm: "0 8px 24px rgb(0 0 0 / 30%)",
      shadowMd: "0 22px 56px rgb(0 0 0 / 46%)",
      shadowDeep: "0 30px 88px rgb(0 0 0 / 62%)",
      radiusSm: "3px",
      radiusMd: "5px",
      radiusLg: "8px",
      radiusPill: "999px",
    },
    visualization: {
      background: "#080606",
      surface: "#1a1210",
      grid: "#49392c",
      text: "#f0e5d2",
      textMuted: "#ad9d87",
      selection: "#e3c883",
      neighbor: "#c79a4e",
      dimmedNode: "#30241f",
      dimmedEdge: "#3a2d26",
      contour: "#7f273e",
      statusArchived: "#80756a",
      statusDraft: "#c79a4e",
      statusCanon: "#7fa487",
      nodeCampaign: "#e3c883",
      nodeNote: "#c79a4e",
      nodeEntity: "#9a3651",
      nodeSession: "#8f73a3",
      edgeDocument: "#8ca0a2",
      edgeReference: "#c79a4e",
      edgeRelationship: "#a05c75",
      mapNote: "#c79a4e",
      mapEntity: "#9a3651",
      mapSession: "#8f73a3",
      mapArchived: "#80756a",
      mapSelection: "#f0dcae",
      hierarchyStructural: "#c79a4e",
      hierarchyContext: "#a05c75",
    },
  },
  {
    id: "cartographer",
    name: "Night Cartographer",
    description: "Deep ocean ink, brass survey marks, cool teal signals, and a clear expedition-console hierarchy.",
    ui: {
      fontDisplay: serifDisplay,
      fontBody: serifDisplay,
      fontUi: uiFont,
      surfacePage: "#071014",
      surfaceDeep: "#040b0e",
      surfacePanel: "#0b1b21",
      surfaceRaised: "#10262c",
      surfaceSoft: "#163139",
      surfaceOverlay: "rgb(7 16 20 / 92%)",
      surfaceInput: "#08171c",
      textPrimary: "#e8f0eb",
      textSecondary: "#bccbc5",
      textMuted: "#8aa4a0",
      textInverse: "#041a1a",
      borderSubtle: "#1d373c",
      borderDefault: "#2c4b50",
      borderStrong: "#46686c",
      accent: "#3bb5a8",
      accentHover: "#57c9bc",
      accentSoft: "rgb(59 181 168 / 14%)",
      onAccent: "#041a1a",
      highlight: "#d8b467",
      highlightHover: "#e7c77e",
      highlightSoft: "rgb(216 180 103 / 14%)",
      onHighlight: "#201505",
      link: "#67cfc3",
      linkHover: "#a8e6dd",
      success: "#65bf9d",
      successSoft: "rgb(101 191 157 / 14%)",
      warning: "#d8b467",
      warningSoft: "rgb(216 180 103 / 14%)",
      danger: "#df7869",
      dangerSoft: "rgb(223 120 105 / 14%)",
      focus: "#f0c778",
      selection: "#d8b467",
      onSelection: "#071014",
      shadowSm: "0 8px 24px rgb(0 6 9 / 22%)",
      shadowMd: "0 22px 54px rgb(0 6 9 / 38%)",
      shadowDeep: "0 26px 78px rgb(0 6 9 / 54%)",
      radiusSm: "8px",
      radiusMd: "12px",
      radiusLg: "16px",
      radiusPill: "999px",
    },
    visualization: {
      background: "#061116",
      surface: "#0d232a",
      grid: "#28464c",
      text: "#e8f0eb",
      textMuted: "#9eb5b1",
      selection: "#f0c778",
      neighbor: "#62d5c8",
      dimmedNode: "#20383d",
      dimmedEdge: "#294147",
      contour: "#3bb5a8",
      statusArchived: "#788784",
      statusDraft: "#d3a65e",
      statusCanon: "#65bf9d",
      nodeCampaign: "#d8b467",
      nodeNote: "#6fa9c8",
      nodeEntity: "#9b7bc1",
      nodeSession: "#5eb7a5",
      edgeDocument: "#6689a2",
      edgeReference: "#c59d52",
      edgeRelationship: "#9675b8",
      mapNote: "#e2b96b",
      mapEntity: "#61d7c5",
      mapSession: "#aa82e8",
      mapArchived: "#87918f",
      mapSelection: "#fff1b8",
      hierarchyStructural: "#7cb7b1",
      hierarchyContext: "#a982bd",
    },
  },
] as const satisfies readonly ThemeDefinitionShape[];

export type ThemeId = (typeof themeDefinitions)[number]["id"];

export type ThemeDefinition = Omit<ThemeDefinitionShape, "id"> & Readonly<{ id: ThemeId }>;

export const THEMES: readonly ThemeDefinition[] = themeDefinitions;
export const THEME_IDS: readonly ThemeId[] = themeDefinitions.map(({ id }) => id);
export const DEFAULT_THEME_ID: ThemeId = "cartographer";

export const THEME_REGISTRY: Readonly<Record<ThemeId, ThemeDefinition>> = Object.freeze(
  Object.fromEntries(themeDefinitions.map((theme) => [theme.id, theme])) as Record<ThemeId, ThemeDefinition>,
);

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && Object.hasOwn(THEME_REGISTRY, value);
}

export function resolveThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}

export function resolveTheme(value: unknown): ThemeDefinition {
  return THEME_REGISTRY[resolveThemeId(value)];
}
