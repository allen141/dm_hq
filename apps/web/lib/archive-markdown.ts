import type { ItemKind } from "@dm-hq/api-client";

export type Frontmatter = Record<string, unknown>;

export function newItemMarkdown(campaignId: string, kind: ItemKind, title: string, body: string) {
  const id = globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}`;
  const metadata = { document_type: "archive_item", schema_version: 1, id, campaign_id: campaignId, kind, title, status: "draft", aliases: [], tags: [], references: [], relationships: [], ...(kind === "session" ? { session_links: [] } : {}) };
  return withFrontmatter(body, metadata);
}

export function frontmatter(markdown: string): Frontmatter {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n\r?\n)?/);
  if (!match) return {};
  try { return JSON.parse(match[1]) as Frontmatter; } catch { return {}; }
}

export function markdownBody(markdown: string) {
  return markdown.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n\r?\n)?([\s\S]*)$/)?.[1] ?? markdown;
}

export function withFrontmatter(markdownOrBody: string, metadata: Frontmatter) {
  const body = markdownBody(markdownOrBody).trim();
  return `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n${body}\n`;
}

export function publicationMarkdown(title: string, body: string) {
  return withFrontmatter(body, { document_type: "publication_entry", title });
}
