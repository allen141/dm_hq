export type User = { id: number; username: string };
export type AgentToken = { id: string; name: string; created_at: string; last_used_at?: string | null; expires_at?: string | null; revoked_at?: string | null };
export type AgentTokenCreated = AgentToken & { token: string };
export type Campaign = { id: string; name: string; owner_id: number; created_at: string; updated_at: string };
export type PageIdentity = { id: string; title: string; kind: string; status: string };
export type DocumentLink = { id: string; source_id: string; source_type?: string; target_id: string; label: string; context?: string };
export type RelationshipProjection = {
  id: string; source_id: string; target_id: string; kind: string; label: string; inverse_label: string; notes: string;
  authored_position: number; source_version: number; source?: PageIdentity; target?: PageIdentity;
};
export type GraphNode = { id: string; node_type: "campaign" | "item"; title: string; kind: string; status: string; summary?: string };
export type GraphEdge = { id: string; edge_class: "document_link" | "reference" | "relationship"; source_id: string; target_id: string; kind: string; label: string; inverse_label: string };
export type GraphResponse = {
  focus_id: string | null; depth: number; nodes: GraphNode[]; edges: GraphEdge[];
  limits: { max_nodes: number; max_edges: number }; truncated: { nodes: boolean; edges: boolean };
};
export type ArchiveHome = { markdown: string; html: string; version: number; metadata: Record<string, unknown>; backlinks: DocumentLink[] };
export type MapPlacement = { id: string; item_id: string; x: number; y: number; caption: string; item?: PageIdentity };
export type RelationshipMember = { id: string; item_id: string; position?: { x: number; y: number } | null; item?: PageIdentity };
export type RelationshipViewSettings = {
  layout_mode: "network" | "hierarchy";
  orientation: "top_to_bottom" | "left_to_right";
  root_item_id: string | null;
  relationship_kinds: string[];
  layout_relationship_kinds: string[];
  layout_direction: "outgoing" | "incoming";
  show_level_labels: boolean;
  level_labels: string[];
};
export type ArchiveViewSummary = { id: string; campaign_id: string; view_type: "map" | "relationship"; title: string; slug: string; status: "active" | "archived"; version: number; updated_at: string };
export type ArchiveViewDocument = ArchiveViewSummary & {
  markdown: string; html: string; description?: string;
  background?: { url: string; alt: string };
  placements: MapPlacement[];
  members: RelationshipMember[];
  settings?: RelationshipViewSettings;
  edges?: GraphEdge[];
  available_relationship_kinds?: string[];
};
export type ArchiveViewPayload = {
  version?: number; view_type: "map" | "relationship"; title: string; description?: string;
  background?: { url: string; alt: string };
  placements?: Array<Omit<MapPlacement, "item">>;
  members?: Array<Omit<RelationshipMember, "item">>;
  settings?: Partial<RelationshipViewSettings>;
};
export type ItemKind = "note" | "entity" | "session";
export type ItemStatus = "draft" | "canon" | "archived";
export type TemplateField = { key: string; label: string; type: string; required?: boolean; options?: string[] };
export type ArchiveItem = {
  id: string; campaign_id: string; kind: ItemKind; markdown: string; storage_key?: string | null; html: string; metadata: Record<string, unknown>;
  title: string; status: ItemStatus; version: number; created_at: string; updated_at: string;
  aliases: string[]; tags: string[]; references: Array<{ id: number; target_id: string; label: string }>;
  backlinks: Array<{ id: string | number; source_id: string; source_type?: string; label: string; context?: string }>;
  relationships: RelationshipProjection[];
  incoming_relationships: RelationshipProjection[];
};
export type ItemSummary = Pick<ArchiveItem, "id" | "campaign_id" | "kind" | "title" | "status" | "version" | "created_at" | "updated_at">;
export type Template = { id: string; name: string; applies_to: string; versions: Array<{ number: number; markdown: string; fields: TemplateField[] }> };
export type PublicationSummary = { id: string; status: string; version: number; created_at: string; updated_at: string; url?: string | null; item_ids: string[] };
export type Publication = { id: string; status: string; version: number; token?: string; url?: string; entries: Array<{ item_id: string; markdown: string; title: string; body: string; html: string; metadata: Record<string, unknown> }> };
export type WorkspaceChange = { document_id: string; previous_storage_key?: string | null; storage_key: string; version: number | null; hash: string; operation: "upsert" | "move" | "delete"; markdown: string | null };
export type WorkspaceDocument = { document_id: string; previous_storage_key?: string | null; storage_key: string; version: number; hash: string; markdown: string };
export type WorkspaceSnapshot = { manifest: { format: string; version: number; campaign_id: string; cursor: number; next_after: string | null; has_more: boolean }; files: WorkspaceDocument[] };

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = "ApiError"; }
}
function cookie(name: string): string {
  if (typeof document === "undefined") return "";
  return document.cookie.split("; ").find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}
export function createApiClient(fetcher: typeof fetch = (...args) => fetch(...args)) {
  let csrfToken = "";
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = init.method?.toUpperCase() ?? "GET"; const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("X-CSRFToken", cookie("csrftoken") || csrfToken);
    const response = await fetcher(path, { ...init, credentials: "include", headers });
    if (!response.ok) { const body = (await response.json().catch(() => null)) as { detail?: string } | null; throw new ApiError(response.status, body?.detail ?? "The request could not be completed."); }
    return response.json() as Promise<T>;
  }
  return {
    csrf: async () => { const response = await request<{ csrfToken: string }>("/api/v1/auth/csrf"); csrfToken = response.csrfToken; return response; },
    agentTokens: () => request<AgentToken[]>("/api/v1/auth/agent-tokens"),
    createAgentToken: (name: string, expires_at?: string) => request<AgentTokenCreated>("/api/v1/auth/agent-tokens", { method: "POST", body: JSON.stringify({ name, expires_at }) }),
    revokeAgentToken: (tokenId: string) => request<AgentToken>(`/api/v1/auth/agent-tokens/${tokenId}/revoke`, { method: "POST", body: JSON.stringify({}) }),
    me: () => request<User>("/api/v1/auth/me"),
    login: (username: string, password: string) => request<User>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
    logout: () => request<{ status: string }>("/api/v1/auth/logout", { method: "POST" }),
    campaigns: () => request<Campaign[]>("/api/v1/campaigns"),
    campaign: (campaignId: string) => request<Campaign>(`/api/v1/campaigns/${campaignId}`),
    createCampaign: (name: string) => request<Campaign>("/api/v1/campaigns", { method: "POST", body: JSON.stringify({ name }) }),
    templates: (campaignId: string) => request<{ templates: Template[] }>(`/api/v1/campaigns/${campaignId}/templates`),
    items: (campaignId: string, params: string | { cursor?: string; limit?: number } = "") => { const query = typeof params === "string" ? params : new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined) as [string, string][]).toString(); return request<{ items: ItemSummary[]; next_cursor: string | null }>(`/api/v1/campaigns/${campaignId}/items${query ? `?${query.replace(/^\?/, "")}` : ""}`); },
    item: (itemId: string) => request<ArchiveItem>(`/api/v1/items/${itemId}`),
    createItem: (campaignId: string, payload: { kind: ItemKind; markdown: string }) => request<ArchiveItem>(`/api/v1/campaigns/${campaignId}/items`, { method: "POST", body: JSON.stringify(payload) }),
    updateItem: (itemId: string, payload: { version: number; markdown: string; reason?: string }) => request<ArchiveItem>(`/api/v1/items/${itemId}`, { method: "PATCH", body: JSON.stringify(payload) }),
    promote: (itemId: string, payload: { version: number; subject_type?: string; template_id?: string }) => request<ArchiveItem>(`/api/v1/items/${itemId}/promote`, { method: "POST", body: JSON.stringify(payload) }),
    search: (campaignId: string, query: string, params: { cursor?: string; limit?: number } = {}) => { const searchParams = new URLSearchParams({ q: query }); Object.entries(params).forEach(([key, value]) => { if (value !== undefined) searchParams.set(key, String(value)); }); return request<{ items: ItemSummary[]; next_cursor: string | null }>(`/api/v1/campaigns/${campaignId}/search?${searchParams.toString()}`); },
    createRelationship: (itemId: string, payload: { version: number; target_id: string; kind: string; label?: string; inverse_label?: string; notes?: string }) => request<{ relationship: RelationshipProjection; item: ArchiveItem }>(`/api/v1/items/${itemId}/relationships`, { method: "POST", body: JSON.stringify(payload) }),
    updateRelationship: (itemId: string, edgeId: string, payload: { version: number; target_id: string; kind: string; label?: string; inverse_label?: string; notes?: string }) => request<{ relationship: RelationshipProjection; item: ArchiveItem }>(`/api/v1/items/${itemId}/relationships/${edgeId}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteRelationship: (itemId: string, edgeId: string, version: number) => request<{ item: ArchiveItem }>(`/api/v1/items/${itemId}/relationships/${edgeId}`, { method: "DELETE", body: JSON.stringify({ version }) }),
    relationship: (itemId: string, payload: Record<string, unknown>) => request<Record<string, unknown>>(`/api/v1/items/${itemId}/relationships`, { method: "POST", body: JSON.stringify(payload) }),
    archiveHome: (campaignId: string) => request<ArchiveHome>(`/api/v1/campaigns/${campaignId}/archive/home`),
    updateArchiveHome: (campaignId: string, payload: { version: number; markdown: string }) => request<ArchiveHome>(`/api/v1/campaigns/${campaignId}/archive/home`, { method: "PATCH", body: JSON.stringify(payload) }),
    archiveGraph: (campaignId: string, params: { focus_id?: string; depth?: 1 | 2; edge_classes?: string[]; relationship_kinds?: string[] } = {}) => { const query = new URLSearchParams(); if (params.focus_id) query.set("focus_id", params.focus_id); if (params.depth) query.set("depth", String(params.depth)); if (params.edge_classes?.length) query.set("edge_classes", params.edge_classes.join(",")); if (params.relationship_kinds?.length) query.set("relationship_kinds", params.relationship_kinds.join(",")); return request<GraphResponse>(`/api/v1/campaigns/${campaignId}/archive/graph${query.size ? `?${query}` : ""}`); },
    archiveViews: (campaignId: string, includeArchived = false) => request<{ views: ArchiveViewSummary[] }>(`/api/v1/campaigns/${campaignId}/archive/views${includeArchived ? "?include_archived=true" : ""}`),
    archiveView: (campaignId: string, viewId: string) => request<ArchiveViewDocument>(`/api/v1/campaigns/${campaignId}/archive/views/${viewId}`),
    createArchiveView: (campaignId: string, payload: ArchiveViewPayload) => request<ArchiveViewDocument>(`/api/v1/campaigns/${campaignId}/archive/views`, { method: "POST", body: JSON.stringify(payload) }),
    updateArchiveView: (campaignId: string, viewId: string, payload: ArchiveViewPayload) => request<ArchiveViewDocument>(`/api/v1/campaigns/${campaignId}/archive/views/${viewId}`, { method: "PATCH", body: JSON.stringify(payload) }),
    archiveArchiveView: (campaignId: string, viewId: string, version: number) => request<ArchiveViewDocument>(`/api/v1/campaigns/${campaignId}/archive/views/${viewId}/archive`, { method: "POST", body: JSON.stringify({ version }) }),
    restoreArchiveView: (campaignId: string, viewId: string, version: number) => request<ArchiveViewDocument>(`/api/v1/campaigns/${campaignId}/archive/views/${viewId}/restore`, { method: "POST", body: JSON.stringify({ version }) }),
    sessionLink: (itemId: string, targetId: string) => request<Record<string, unknown>>(`/api/v1/items/${itemId}/session-links`, { method: "POST", body: JSON.stringify({ item_id: targetId }) }),
    revisions: (itemId: string) => request<{ revisions: Array<{ number: number; reason: string; created_at: string; markdown: string; content_hash: string }> }>(`/api/v1/items/${itemId}/revisions`),
    revisionCompare: (itemId: string, revision: number, against?: number) => request<{ revision: number; against: number | null; markdown: string; previous_markdown: string | null }>(`/api/v1/items/${itemId}/revisions/${revision}${against ? `?against=${against}` : ""}`),
    restore: (itemId: string, payload: { revision: number; version: number; reason?: string }) => request<ArchiveItem>(`/api/v1/items/${itemId}/restore`, { method: "POST", body: JSON.stringify(payload) }),
    createPublication: (campaignId: string, entries: Array<{ item_id: string; markdown: string }>) => request<Publication>(`/api/v1/campaigns/${campaignId}/publications`, { method: "POST", body: JSON.stringify({ entries }) }),
    publications: (campaignId: string) => request<{ publications: PublicationSummary[] }>(`/api/v1/campaigns/${campaignId}/publications`),
    publication: (publicationId: string) => request<Publication>(`/api/v1/publications/${publicationId}`),
    revokePublication: (publicationId: string) => request<{ status: string }>(`/api/v1/publications/${publicationId}/revoke`, { method: "POST" }),
    publicPublication: (token: string) => request<Publication | { status: string }>(`/api/v1/publications/public/${token}`),
    exportCampaign: async (campaignId: string) => { const response = await fetcher(`/api/v1/campaigns/${campaignId}/exports`, { credentials: "include" }); if (!response.ok) throw new ApiError(response.status, "Export failed."); return response.blob(); },
    restoreCampaign: (file: File) => { const form = new FormData(); form.append("archive", file); return request<Campaign>("/api/v1/exports/restore", { method: "POST", body: form }); },
    workspaceSnapshot: (campaignId: string, params: { after?: string; limit?: number; cursor?: number } = {}) => { const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined) as [string, string][]).toString(); return request<WorkspaceSnapshot>(`/api/v1/campaigns/${campaignId}/workspace/snapshot${query ? `?${query}` : ""}`); },
    workspaceChanges: (campaignId: string, cursor = 0, limit = 100) => request<{ cursor: number; has_more: boolean; changes: WorkspaceChange[] }>(`/api/v1/campaigns/${campaignId}/workspace/changes?after=${cursor}&limit=${limit}`),
    workspaceDocument: (campaignId: string, documentId: string) => request<WorkspaceDocument>(`/api/v1/campaigns/${campaignId}/workspace/documents/${documentId}`),
    workspaceApply: (campaignId: string, payload: { document_id: string; version: number; hash: string; markdown: string; reason?: string }) => request<WorkspaceDocument>(`/api/v1/campaigns/${campaignId}/workspace/apply`, { method: "POST", body: JSON.stringify(payload) }),
  };
}
