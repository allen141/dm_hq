"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createApiClient, type Publication } from "@dm-hq/api-client";

const client = createApiClient();

export default function PublicPublicationPage() {
  const params = useParams<{ token: string }>();
  const [publication, setPublication] = useState<Publication | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { void client.publicPublication(params.token).then((result) => { if ("status" in result) setMissing(true); else setPublication(result); }).catch(() => setMissing(true)); }, [params.token]);
  if (missing) return <main className="public-shell"><h1>Publication unavailable</h1><p>This player page has been revoked or does not exist.</p></main>;
  if (!publication) return <main className="public-shell"><p>Loading publication…</p></main>;
  return <main className="public-shell"><div className="eyebrow">The Archive · player view</div><h1>Campaign notes</h1>{publication.entries.map((entry) => <article className="public-entry" key={entry.item_id}><h2>{entry.title}</h2><div dangerouslySetInnerHTML={{ __html: entry.html }} />{Object.entries(entry.fields).map(([key, value]) => <p className="public-field" key={key}><strong>{key.replaceAll("_", " ")}</strong> {String(value)}</p>)}</article>)}</main>;
}
