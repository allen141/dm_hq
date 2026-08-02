"use client";

import type { PublicationSummary } from "@dm-hq/api-client";

type HandoutListProps = {
  publications: PublicationSummary[];
  title: string;
  onRevoke?: (id: string) => void;
  getTitle?: (publication: PublicationSummary) => string;
};

function HandoutRow({ publication, onRevoke, getTitle }: { publication: PublicationSummary; onRevoke?: (id: string) => void; getTitle?: (publication: PublicationSummary) => string }) {
  const title = getTitle?.(publication) ?? "Player handout";
  return <div className="revision-row" key={publication.id}>
    <span className="handout-label"><strong>{title}</strong><span className="meta">v{publication.version} · {publication.status}</span></span>
    <span>{publication.url ? <a href={publication.url}>Open handout</a> : <span className="meta">Republish to create a recoverable link</span>}</span>
    {publication.status === "active" && onRevoke && <button type="button" className="secondary" onClick={() => onRevoke(publication.id)}>Revoke</button>}
  </div>;
}

export default function HandoutList({ publications, title, onRevoke, getTitle }: HandoutListProps) {
  if (!publications.length) return null;
  const active = publications.filter((publication) => publication.status !== "revoked");
  const revoked = publications.filter((publication) => publication.status === "revoked");
  return <div className="revision-list">
    <div className="eyebrow">{title}</div>
    {active.map((publication) => <HandoutRow key={publication.id} publication={publication} onRevoke={onRevoke} getTitle={getTitle} />)}
    {revoked.length > 0 && <details className="handout-history">
      <summary className="revision-row"><span className="meta">Revoked handouts ({revoked.length})</span><span className="meta">Expand history</span></summary>
      <div className="handout-history-list">{revoked.map((publication) => <div className="revision-row" key={publication.id}><span className="handout-label"><strong>{getTitle?.(publication) ?? "Player handout"}</strong><span className="meta">v{publication.version} · revoked</span></span><span className="meta">Unavailable</span></div>)}</div>
    </details>}
  </div>;
}
