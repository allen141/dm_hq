const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntity(entity: string) {
  if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
  if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
  return HTML_ENTITIES[entity] ?? `&${entity};`;
}

/** Convert canonical Markdown to a compact, inert excerpt for map marker details. */
export function markdownExcerpt(markdown: string, maximumLength = 240) {
  const limit = Math.max(1, maximumLength);
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?/, "");
  const plain = body
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s+/gm, "")
    .replace(/[*_~]+/g, "")
    .replace(/&(#x?[\da-f]+|[a-z]+);/gi, (_, entity: string) => decodeEntity(entity.toLowerCase()))
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length <= limit) return plain;
  if (limit === 1) return "…";
  const candidate = plain.slice(0, limit - 1).trimEnd();
  const lastSpace = candidate.lastIndexOf(" ");
  const bounded = lastSpace >= Math.floor(limit * 0.6) ? candidate.slice(0, lastSpace) : candidate;
  return `${bounded.trimEnd()}…`;
}
