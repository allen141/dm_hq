"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import type { StyleTheme } from "@/app/style-lab/theme-data";
import styles from "./style-lab.module.css";
import themeStyles from "./style-lab-themes.module.css";

type ArchivePage = {
  title: string;
  kind: "Entity" | "Place" | "Faction" | "Session" | "Note";
  detail: string;
  scope: "Private" | "Player safe";
};

const initialPages: ArchivePage[] = [
  { title: "Marra Venn", kind: "Entity", detail: "Harbor oracle · v6", scope: "Private" },
  { title: "The Drowned Observatory", kind: "Place", detail: "Glass Coast · v3", scope: "Private" },
  { title: "The Lantern Court", kind: "Faction", detail: "Uncertain ally · v4", scope: "Private" },
  { title: "Session 18 — A Bell Below", kind: "Session", detail: "Next session · v2", scope: "Private" },
  { title: "Saltspire player guide", kind: "Note", detail: "Published · v5", scope: "Player safe" },
];

const viewCopy = {
  Wiki: {
    eyebrow: "Campaign home · campaign.md",
    title: "The Glass Coast",
    text: "A storm-broken archipelago where drowned roads surface at low tide and old promises still carry weight.",
  },
  Graph: {
    eyebrow: "Knowledge graph · 42 records",
    title: "Threads of the coast",
    text: "Follow references and relationships without losing the campaign record that gave them meaning.",
  },
  Maps: {
    eyebrow: "Campaign atlas · 3 maps",
    title: "The Shattered Reach",
    text: "Places, discoveries, and travel notes remain connected to their canonical Archive pages.",
  },
  Relationships: {
    eyebrow: "Relationship board · active powers",
    title: "Courts and conspirators",
    text: "A curated view of loyalties, debts, and suspicions across the factions of the Glass Coast.",
  },
} as const;

type ViewName = keyof typeof viewCopy;

function Sigil({ children }: { children: React.ReactNode }) {
  return <span className={styles.sigil} aria-hidden="true"><span>{children}</span></span>;
}

export default function StyleLab({ theme, themes }: { theme: StyleTheme; themes: StyleTheme[] }) {
  const [activeView, setActiveView] = useState<ViewName>("Wiki");
  const [pages, setPages] = useState(initialPages);
  const [selectedPage, setSelectedPage] = useState("Campaign home");
  const [query, setQuery] = useState("");
  const [captureTitle, setCaptureTitle] = useState("");
  const [captureKind, setCaptureKind] = useState<ArchivePage["kind"]>("Note");
  const [captureBody, setCaptureBody] = useState("");
  const [captureMessage, setCaptureMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [campaignText, setCampaignText] = useState<string>(viewCopy.Wiki.text);
  const [draftText, setDraftText] = useState<string>(campaignText);

  const filteredPages = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return pages;
    return pages.filter((page) => `${page.title} ${page.kind} ${page.detail}`.toLocaleLowerCase().includes(normalized));
  }, [pages, query]);

  function capturePage(event: FormEvent) {
    event.preventDefault();
    const title = captureTitle.trim();
    if (!title) return;
    setPages((current) => [{ title, kind: captureKind, detail: "Just captured · v1", scope: "Private" }, ...current]);
    setSelectedPage(title);
    setCaptureTitle("");
    setCaptureBody("");
    setCaptureMessage(`${title} added to the private Archive.`);
  }

  function saveHome(event: FormEvent) {
    event.preventDefault();
    setCampaignText(draftText.trim() || campaignText);
    setEditing(false);
  }

  const copy = viewCopy[activeView];

  return (
    <main className={`${styles.lab} ${styles[theme.slug] ?? ""} ${themeStyles[theme.slug] ?? ""}`}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <header className={styles.reviewBar}>
        <div className={styles.reviewIntro}>
          <span className={styles.reviewKicker}>DM HQ · Style studies</span>
          <strong>{theme.index}. {theme.name}</strong>
          <span>{theme.subtitle}</span>
        </div>
        <nav className={styles.themePicker} aria-label="Choose a visual concept">
          {themes.map((option) => (
            <Link
              key={option.slug}
              href={`/style-lab/${option.slug}`}
              aria-current={option.slug === theme.slug ? "page" : undefined}
              className={option.slug === theme.slug ? styles.currentTheme : undefined}
              title={option.description}
            >
              <span>{option.index}</span>
              <b>{option.name}</b>
            </Link>
          ))}
        </nav>
      </header>

      <div className={styles.appFrame}>
        <header className={styles.campaignHeader}>
          <div className={styles.brandBlock}>
            <Sigil>DM</Sigil>
            <div>
              <div className={styles.eyebrow}>DM HQ · The Archive</div>
              <h1>The Glass Coast</h1>
              <p>Session 18 approaches · Last scribed 12 minutes ago</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.privacyBadge}><span aria-hidden="true">◆</span> DM private</span>
            <button type="button" className={styles.quietButton}><span aria-hidden="true">⌕</span> Search</button>
            <button type="button" className={styles.quietButton}><span aria-hidden="true">＋</span> Quick capture</button>
            <button type="button" className={styles.primaryButton}>New view <span aria-hidden="true">↗</span></button>
          </div>
        </header>

        <nav className={styles.viewTabs} aria-label="Archive views">
          {(Object.keys(viewCopy) as ViewName[]).map((view, index) => (
            <button
              type="button"
              key={view}
              onClick={() => setActiveView(view)}
              aria-pressed={activeView === view}
              className={activeView === view ? styles.activeView : undefined}
            >
              <span aria-hidden="true">{["W", "G", "M", "R"][index]}</span>{view}
            </button>
          ))}
        </nav>

        <div className={styles.workspace}>
          <aside className={styles.archiveNav} aria-label="Wiki navigation">
            <div className={styles.sectionHeading}>
              <span>Archive index</span>
              <button type="button" aria-label="Add section">＋</button>
            </div>
            <button
              type="button"
              className={`${styles.treeItem} ${selectedPage === "Campaign home" ? styles.selectedTreeItem : ""}`}
              onClick={() => setSelectedPage("Campaign home")}
            >
              <span aria-hidden="true">◇</span>Campaign home
            </button>
            <div className={styles.treeGroup}>
              <span>Tonight</span>
              {pages.slice(0, 2).map((page) => (
                <button
                  type="button"
                  key={`tonight-${page.title}`}
                  className={`${styles.treeItem} ${selectedPage === page.title ? styles.selectedTreeItem : ""}`}
                  onClick={() => setSelectedPage(page.title)}
                >
                  <span aria-hidden="true">·</span>{page.title}
                </button>
              ))}
            </div>
            <div className={styles.treeGroup}>
              <span>World</span>
              <button type="button" className={styles.treeItem}><span aria-hidden="true">·</span>People</button>
              <button type="button" className={styles.treeItem}><span aria-hidden="true">·</span>Places</button>
              <button type="button" className={styles.treeItem}><span aria-hidden="true">·</span>Factions</button>
            </div>
            <div className={styles.treeGroup}>
              <span>Chronicle</span>
              <button type="button" className={styles.treeItem}><span aria-hidden="true">·</span>Sessions</button>
              <button type="button" className={styles.treeItem}><span aria-hidden="true">·</span>Open threads</button>
            </div>
            <div className={styles.navFooter}>
              <span><i className={styles.statusDot} /> Archive synchronized</span>
              <button type="button">Export campaign</button>
            </div>
          </aside>

          <section className={styles.document} aria-live="polite">
            <div className={styles.documentTopline}>
              <div>
                <div className={styles.eyebrow}>{copy.eyebrow}</div>
                <h2>{selectedPage === "Campaign home" ? copy.title : selectedPage}</h2>
              </div>
              <button type="button" className={styles.quietButton} onClick={() => setEditing((value) => !value)}>
                {editing ? "Cancel" : "Edit home"}
              </button>
            </div>

            {editing ? (
              <form className={styles.editForm} onSubmit={saveHome}>
                <label htmlFor="campaign-overview">Campaign overview</label>
                <textarea id="campaign-overview" rows={8} value={draftText} onChange={(event) => setDraftText(event.target.value)} />
                <div><button className={styles.primaryButton}>Save campaign.md</button></div>
              </form>
            ) : (
              <>
                <p className={styles.intro}>{activeView === "Wiki" ? campaignText : copy.text}</p>
                <div className={styles.rule}><span aria-hidden="true">✦</span></div>
                <section className={styles.sessionBrief}>
                  <div className={styles.briefHeading}>
                    <div>
                      <span className={styles.eyebrow}>Tonight&apos;s thread</span>
                      <h3>A bell beneath the tide</h3>
                    </div>
                    <span className={styles.sessionChip}>Session 18 · Prepared</span>
                  </div>
                  <p>The party reaches the drowned observatory at moonrise. Marra has offered safe passage, but the Lantern Court expects a debt to be named before the inner door opens.</p>
                  <aside className={styles.secretNote}>
                    <span><span aria-hidden="true">◆</span> DM secret</span>
                    The bell is not an alarm. It is counting the promises the party has broken since crossing the Glass Coast.
                  </aside>
                </section>

                <section className={styles.threadSection}>
                  <div className={styles.sectionTitleRow}>
                    <h3>Open threads</h3>
                    <button type="button">View all 7 <span aria-hidden="true">→</span></button>
                  </div>
                  <div className={styles.threadGrid}>
                    <article>
                      <span className={styles.cardGlyph} aria-hidden="true">I</span>
                      <div><b>The oracle&apos;s price</b><p>Marra will guide them below, but has not named what she wants returned.</p></div>
                      <span className={styles.riskHigh}>At risk</span>
                    </article>
                    <article>
                      <span className={styles.cardGlyph} aria-hidden="true">II</span>
                      <div><b>Lanterns in the fog</b><p>Three Court ships wait beyond the harbor chain with their lights extinguished.</p></div>
                      <span className={styles.riskWatch}>Watch</span>
                    </article>
                  </div>
                </section>
              </>
            )}

            <section className={styles.pagesSection}>
              <div className={styles.sectionTitleRow}>
                <div><span className={styles.eyebrow}>Canonical records</span><h3>Recent pages</h3></div>
                <span>{filteredPages.length} shown</span>
              </div>
              <div className={styles.pageList}>
                {filteredPages.map((page) => (
                  <button type="button" key={page.title} onClick={() => setSelectedPage(page.title)}>
                    <span className={styles.pageKind}>{page.kind.slice(0, 1)}</span>
                    <span><b>{page.title}</b><small>{page.kind} · {page.detail}</small></span>
                    <em className={page.scope === "Private" ? styles.privateScope : styles.publicScope}>{page.scope}</em>
                    <span aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            </section>
          </section>

          <aside className={styles.tools}>
            <section className={styles.toolCard}>
              <div className={styles.toolHeading}><span className={styles.toolGlyph} aria-hidden="true">⌕</span><div><span className={styles.eyebrow}>Find knowledge</span><h3>Search Archive</h3></div></div>
              <label htmlFor="archive-search">People, places, notes…</label>
              <div className={styles.searchField}><input id="archive-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try ‘lantern’" /><kbd>⌘ K</kbd></div>
              <div className={styles.filterRow}><button type="button" className={styles.activeFilter}>All</button><button type="button">People</button><button type="button">Places</button></div>
              {query && <p className={styles.helperText}>{filteredPages.length} matching record{filteredPages.length === 1 ? "" : "s"}</p>}
            </section>

            <form className={`${styles.toolCard} ${styles.captureCard}`} onSubmit={capturePage}>
              <div className={styles.toolHeading}><span className={styles.toolGlyph} aria-hidden="true">＋</span><div><span className={styles.eyebrow}>Quick capture</span><h3>Catch the thought</h3></div></div>
              <label htmlFor="capture-title">Title</label>
              <input id="capture-title" value={captureTitle} onChange={(event) => { setCaptureTitle(event.target.value); setCaptureMessage(""); }} placeholder="A name, place, or clue" />
              <label htmlFor="capture-kind">Kind</label>
              <select id="capture-kind" value={captureKind} onChange={(event) => setCaptureKind(event.target.value as ArchivePage["kind"])}>
                <option>Note</option><option>Entity</option><option>Place</option><option>Faction</option><option>Session</option>
              </select>
              <label htmlFor="capture-body">What should you remember?</label>
              <textarea id="capture-body" rows={4} value={captureBody} onChange={(event) => setCaptureBody(event.target.value)} placeholder="Rough is fine. Structure can come later." />
              <div className={styles.captureMeta}><span><span aria-hidden="true">◆</span> Private by default</span><span>Markdown</span></div>
              <button className={styles.primaryButton} disabled={!captureTitle.trim()}>Capture page <span aria-hidden="true">↗</span></button>
              {captureMessage && <p className={styles.captureSuccess} role="status">{captureMessage}</p>}
            </form>

            <section className={`${styles.toolCard} ${styles.sessionCard}`}>
              <span className={styles.eyebrow}>At the table</span>
              <h3>Session ready</h3>
              <p>6 linked records · 2 unresolved threads</p>
              <button type="button" className={styles.quietButton}>Open session brief <span aria-hidden="true">→</span></button>
            </section>
          </aside>
        </div>
      </div>

      <footer className={styles.conceptFooter}>
        <span>{theme.name}</span>
        <p>{theme.description}</p>
        <span>Style prototype · local data only</span>
      </footer>
    </main>
  );
}
