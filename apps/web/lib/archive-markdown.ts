import { parseDocument } from "yaml";
import type { ItemKind } from "@dm-hq/api-client";

export type Frontmatter = Record<string, unknown>;

export function newItemMarkdown(campaignId: string, kind: ItemKind, title: string, body: string) {
  const id = globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}`;
  const metadata = { document_type: "archive_item", schema_version: 1, id, campaign_id: campaignId, kind, title, status: "draft", aliases: [], tags: [], references: [], relationships: [], ...(kind === "session" ? { session_links: [] } : {}) };
  return withFrontmatter(body, metadata);
}

export function frontmatter(markdown: string): Frontmatter {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n\r?\n)?/);
  if (!match) {
    if (/^---(?:\r?\n|$)/.test(markdown)) throw new Error("Frontmatter has no closing delimiter.");
    return {};
  }
  const document = parseDocument(match[1], { uniqueKeys: true });
  if (document.errors.length) throw new Error(`Invalid frontmatter: ${document.errors[0].message}`);
  const value: unknown = document.toJS({ maxAliasCount: 50 });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Frontmatter must be an object.");
  return value as Frontmatter;
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
