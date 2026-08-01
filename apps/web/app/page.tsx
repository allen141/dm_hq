"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createApiClient, type Campaign, type User } from "@dm-hq/api-client";

const client = createApiClient();

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  async function refresh() {
    try { const current = await client.me(); setUser(current); setCampaigns(await client.campaigns()); }
    catch { setUser(null); }
  }

  useEffect(() => { void client.csrf().then(refresh).finally(() => setReady(true)); }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const current = await client.login(username, password); setUser(current); setCampaigns(await client.campaigns()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sign-in failed."); }
    finally { setBusy(false); }
  }

  async function createCampaign(event: FormEvent) {
    event.preventDefault(); if (!campaignName.trim()) return;
    setBusy(true); setError("");
    try { const campaign = await client.createCampaign(campaignName); setCampaigns((current) => [campaign, ...current]); setCampaignName(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Campaign creation failed."); }
    finally { setBusy(false); }
  }

  async function signOut() { await client.logout(); setUser(null); setCampaigns([]); }

  return <main className="shell">
    <header className="masthead"><div><div className="eyebrow">The Archive · Release 1</div><h1>Keep the thread.</h1></div><p className="lede">A quiet home for campaign knowledge. Capture rough ideas, give them structure, and find them again when play is moving quickly.</p></header>
    <div className="workspace">
      <section className="panel" aria-labelledby="campaigns-heading">
        <div className="panel-heading"><div><div className="eyebrow">Private workspace</div><h2 id="campaigns-heading">Campaigns</h2></div>{user && <div className="userbar"><span>{user.username}</span><button className="secondary" onClick={signOut}>Sign out</button></div>}</div>
        {!user ? <p className="empty">Sign in to open your campaign workspace.</p> : campaigns.length === 0 ? <p className="empty">No campaigns yet. Give the first one a name.</p> : <div className="campaign-list">{campaigns.map((campaign) => <article className="campaign" key={campaign.id}><div className="campaign-main"><span className="campaign-name">{campaign.name}</span><span className="campaign-date">Updated {new Date(campaign.updated_at).toLocaleDateString()}</span></div><Link className="button secondary" href={`/campaigns/${campaign.id}`}>Open {campaign.name}</Link></article>)}</div>}
      </section>
      <aside className="panel">
        {!user ? <><div className="eyebrow">Owner access</div><h2>Sign in</h2><form onSubmit={signIn} style={{ marginTop: 18 }}><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label><label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" /></label><button disabled={busy || !ready}>{!ready ? "Preparing…" : busy ? "Opening…" : "Open workspace"}</button></form><p className="meta">Use the owner account configured for this environment.</p></> : <><div className="eyebrow">New campaign</div><h2>Name the world</h2><form onSubmit={createCampaign} style={{ marginTop: 18 }}><label>Campaign name<input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="The Glass Coast" /></label><button disabled={busy || !campaignName.trim()}>{busy ? "Saving…" : "Create campaign"}</button></form></>}
        {error && <p className="error" role="alert" style={{ marginTop: 14 }}>{error}</p>}
      </aside>
    </div>
  </main>;
}
