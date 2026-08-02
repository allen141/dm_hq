export type User = { id: number; username: string };
export type Campaign = { id: string; name: string; owner_id: number; created_at: string; updated_at: string };
export type ItemKind = "note" | "entity" | "session";
export type ItemStatus = "draft" | "canon" | "archived";
export type TemplateField = { key: string; label: string; type: string; required?: boolean; options?: string[] };
export type ArchiveItem = {
  id: string; campaign_id: string; kind: ItemKind; markdown: string; html: string; metadata: Record<string, unknown>;
  title: string; status: ItemStatus; version: number; created_at: string; updated_at: string;
  aliases: string[]; tags: string[]; references: Array<{ id: number; target_id: string; label: string }>;
  backlinks: Array<{ id: number; source_id: string; label: string }>;
  relationships: Array<{ id: number; target_id: string; kind: string; label: string; notes: string }>;
  incoming_relationships: Array<{ id: number; source_id: string; kind: string; label: string; notes: string }>;
};
export type ItemSummary = Pick<ArchiveItem, "id" | "campaign_id" | "kind" | "title" | "status" | "version" | "created_at" | "updated_at">;
export type Template = { id: string; name: string; applies_to: string; versions: Array<{ number: number; markdown: string; fields: TemplateField[] }> };
export type PublicationSummary = { id: string; status: string; version: number; created_at: string; updated_at: string; url?: string | null; item_ids: string[] };
export type Publication = { id: string; status: string; version: number; token?: string; url?: string; entries: Array<{ item_id: string; markdown: string; title: string; body: string; html: string; metadata: Record<string, unknown> }> };
export type WorkspaceChange = { document_id: string; storage_key: string; version: number; hash: string; operation: "upsert" | "delete" };
export type WorkspaceSnapshot = { manifest: { format: string; version: number; cursor: number }; files: Array<{ document_id: string; storage_key: string; version: number; hash: string; markdown: string }> };

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
    relationship: (itemId: string, payload: Record<string, unknown>) => request<Record<string, unknown>>(`/api/v1/items/${itemId}/relationships`, { method: "POST", body: JSON.stringify(payload) }),
    sessionLink: (itemId: string, targetId: string) => request<Record<string, unknown>>(`/api/v1/items/${itemId}/session-links`, { method: "POST", body: JSON.stringify({ item_id: targetId }) }),
    revisions: (itemId: string) => request<{ revisions: Array<{ number: number; reason: string; created_at: string; markdown: string; content_hash: string }> }>(`/api/v1/items/${itemId}/revisions`),
    restore: (itemId: string, payload: { revision: number; version: number; reason?: string }) => request<ArchiveItem>(`/api/v1/items/${itemId}/restore`, { method: "POST", body: JSON.stringify(payload) }),
    createPublication: (campaignId: string, entries: Array<{ item_id: string; markdown: string }>) => request<Publication>(`/api/v1/campaigns/${campaignId}/publications`, { method: "POST", body: JSON.stringify({ entries }) }),
    publications: (campaignId: string) => request<{ publications: PublicationSummary[] }>(`/api/v1/campaigns/${campaignId}/publications`),
    publication: (publicationId: string) => request<Publication>(`/api/v1/publications/${publicationId}`),
    revokePublication: (publicationId: string) => request<{ status: string }>(`/api/v1/publications/${publicationId}/revoke`, { method: "POST" }),
    publicPublication: (token: string) => request<Publication | { status: string }>(`/api/v1/publications/public/${token}`),
    exportCampaign: async (campaignId: string) => { const response = await fetcher(`/api/v1/campaigns/${campaignId}/exports`, { credentials: "include" }); if (!response.ok) throw new ApiError(response.status, "Export failed."); return response.blob(); },
    restoreCampaign: (file: File) => { const form = new FormData(); form.append("archive", file); return request<Campaign>("/api/v1/exports/restore", { method: "POST", body: form }); },
    workspaceSnapshot: (campaignId: string) => request<WorkspaceSnapshot>(`/api/v1/campaigns/${campaignId}/workspace/snapshot`),
    workspaceChanges: (campaignId: string, cursor = 0) => request<{ cursor: number; changes: WorkspaceChange[] }>(`/api/v1/campaigns/${campaignId}/workspace/changes?after=${cursor}`),
    workspaceApply: (campaignId: string, payload: { document_id: string; version: number; markdown: string; reason?: string }) => request<ArchiveItem>(`/api/v1/campaigns/${campaignId}/workspace/apply`, { method: "POST", body: JSON.stringify(payload) }),
  };
}
