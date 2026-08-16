import type { ThemeId } from "./registry";

export type GraphPalette = Readonly<{
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
  parchmentLight: string;
  parchmentDark: string;
}>;

export const GRAPH_PALETTE_REGISTRY: Readonly<Record<ThemeId, GraphPalette>> = Object.freeze({
  emberkeep: {
    background: "#c6aa78", surface: "#d5bd91", grid: "#735234", text: "#26150b", textMuted: "#62472f",
    selection: "#7d2e18", neighbor: "#315b52", dimmedNode: "#9d8767", dimmedEdge: "#887354", contour: "#9a4b24",
    statusArchived: "#6f6659", statusDraft: "#8b551e", statusCanon: "#315b52",
    nodeCampaign: "#70420e", nodeNote: "#8b3d19", nodeEntity: "#315b52", nodeSession: "#603d70",
    edgeDocument: "#3f5d62", edgeReference: "#80511c", edgeRelationship: "#6c3f69",
    parchmentLight: "#e0cca4", parchmentDark: "#76502d",
  },
  astral: {
    background: "#c4bed0", surface: "#d6d0df", grid: "#665d78", text: "#21182f", textMuted: "#5a5068",
    selection: "#522f87", neighbor: "#256474", dimmedNode: "#9a92aa", dimmedEdge: "#81778e", contour: "#70519b",
    statusArchived: "#6d6872", statusDraft: "#76511f", statusCanon: "#256474",
    nodeCampaign: "#694d17", nodeNote: "#256474", nodeEntity: "#59348f", nodeSession: "#843f63",
    edgeDocument: "#386574", edgeReference: "#78571d", edgeRelationship: "#644087",
    parchmentLight: "#e2ddec", parchmentDark: "#776987",
  },
  verdant: {
    background: "#b8b991", surface: "#cbcca7", grid: "#5b6848", text: "#1b2519", textMuted: "#4f5947",
    selection: "#3e5c26", neighbor: "#735126", dimmedNode: "#909274", dimmedEdge: "#77795f", contour: "#627a3c",
    statusArchived: "#62685d", statusDraft: "#795020", statusCanon: "#285c49",
    nodeCampaign: "#654617", nodeNote: "#3e5c26", nodeEntity: "#285c49", nodeSession: "#7b472b",
    edgeDocument: "#356253", edgeReference: "#755025", edgeRelationship: "#66466f",
    parchmentLight: "#d8d8b5", parchmentDark: "#69714d",
  },
  scriptorium: {
    background: "#c9b48e", surface: "#dbc7a0", grid: "#75583e", text: "#28170f", textMuted: "#624b39",
    selection: "#7f273e", neighbor: "#356052", dimmedNode: "#9d8768", dimmedEdge: "#887258", contour: "#7f273e",
    statusArchived: "#6d665d", statusDraft: "#7e511b", statusCanon: "#356052",
    nodeCampaign: "#74500f", nodeNote: "#81501a", nodeEntity: "#7f273e", nodeSession: "#5d416d",
    edgeDocument: "#3f5f63", edgeReference: "#80551d", edgeRelationship: "#77394f",
    parchmentLight: "#ead7ae", parchmentDark: "#755134",
  },
  cartographer: {
    background: "#b8b19a", surface: "#cec7ae", grid: "#536a66", text: "#10282d", textMuted: "#485d5d",
    selection: "#775016", neighbor: "#1e665e", dimmedNode: "#8f8b79", dimmedEdge: "#747566", contour: "#2c7068",
    statusArchived: "#626b68", statusDraft: "#7b531b", statusCanon: "#1e665e",
    nodeCampaign: "#715017", nodeNote: "#315e72", nodeEntity: "#5d4772", nodeSession: "#286759",
    edgeDocument: "#3d5f6c", edgeReference: "#76531c", edgeRelationship: "#60486f",
    parchmentLight: "#d9d2b8", parchmentDark: "#5d716a",
  },
});
