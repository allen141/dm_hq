# AI agent integration plan

**Status:** Proposed  
**Date:** 2026-08-02  
**Scope:** DM-facing campaign development assistance built on the Markdown-canonical Archive

## Decision in brief

DM HQ will own a provider-neutral agent gateway. The gateway exposes campaign-scoped search, Markdown retrieval, synchronization, proposal, preview, and version-safe write operations. Model hosts are adapters around that contract:

- A private Custom GPT Action is the first Plus-based pilot.
- A local sync bridge is the fast-indexing option for development and advanced users.
- An MCP server is the long-term interoperability surface for supported ChatGPT workspaces and other MCP clients.
- An embedded Responses API assistant is the future DM HQ-paid product.

The model never becomes the source of truth. DM HQ Markdown documents remain authoritative; local indexes, uploaded files, and vector stores are derived caches.

## Goals

- Let a DM use an AI assistant to develop, revise, and add campaign content.
- Give the assistant versioned guidance about DM HQ concepts, permissions, document grammar, and safe write behavior.
- Support the developer’s existing ChatGPT Plus subscription during the pilot.
- Support users who have no ChatGPT subscription through local clients, other model providers, or a future DM HQ-hosted tier.
- Keep the same tool contract usable for future monetization.
- Make repeated campaign queries fast through a local Markdown cache without weakening server authority.
- Preserve campaign isolation, private DM content, publication boundaries, optimistic concurrency, and auditability.

## Non-goals

- Giving an agent direct PostgreSQL or filesystem access.
- Treating an OpenAI vector store, ChatGPT conversation, or local index as canonical storage.
- Assuming ChatGPT Plus can be used as an API credential or API credit balance.
- Building a ChatGPT-specific data model that cannot support other clients.
- Allowing an assistant to publish player content or mark records canon without explicit approval.

## Product surfaces and hosting choices

### Plus pilot: Custom GPT Action

A private Custom GPT can call an HTTPS DM HQ agent API described by an OpenAPI schema. The Action uses OAuth or a scoped bearer token and exposes read/search tools first, followed by approval-gated writes.

This is the fastest way to test the workflow with the developer’s Plus subscription. It does not provide a persistent local filesystem or automatic campaign synchronization inside the ChatGPT conversation. Action requests still cross the network, although the API can answer from a server-side derived index.

Reference: [Configuring Actions in GPTs](https://help.openai.com/en/articles/9442513).

### Native MCP app

DM HQ will provide a remote MCP server as the long-term adapter. It can expose focused tools, structured results, safety annotations, and optional UI. A supported ChatGPT workspace can connect the app with OAuth and require confirmation for mutating actions.

Current OpenAI documentation describes full custom MCP app support, including write actions, as available for Business, Enterprise, and Edu workspaces during rollout. Plus access should not be assumed to include this surface.

References: [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server), [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461).

### Local sync bridge

A local companion process maintains an authorized Markdown working set and local search index. It can expose the same agent tools over a local MCP server or a small localhost API. If a ChatGPT-hosted client must reach it, use a supported secure tunnel; never expose the database or document volume directly.

ChatGPT does not automatically mount arbitrary local files. The bridge is a separate process that must be running and must authenticate to DM HQ.

### Embedded DM HQ assistant

A future DM HQ assistant will call the Responses API from the DM HQ backend and use the same gateway tools. Users authenticate only to DM HQ; DM HQ owns the model-provider account, usage limits, billing, and assistant UI.

ChatGPT Plus does not include API usage. ChatGPT and API billing are separate: [billing guidance](https://help.openai.com/en/articles/9039756-billing-settings-in-chatgpt-vs-platform).

## Agent contract

The agent gateway is a thin, campaign-scoped layer over the existing workspace service. It must never bypass the document service.

### Read tools

- `list_campaigns`
- `get_campaign`
- `search_archive`
- `get_document`
- `get_relationship_context`
- `get_session_context`
- `get_revision`
- `get_publication_preview`
- `get_workspace_snapshot`
- `get_workspace_changes`

Read responses should include stable IDs, document type, storage key where useful, current version, content hash, title, and enough Markdown or metadata for the model to answer without another unnecessary call.

### Proposal tools

- `propose_new_document`
- `propose_document_update`
- `propose_relationship`
- `propose_session_link`
- `propose_publication`

Proposals return complete canonical Markdown or a Markdown-aware diff, the target document ID, base version, validation results, and an explanation of affected projections. Proposals do not mutate the campaign.

### Mutating tools

- `apply_document`
- `apply_relationship`
- `apply_session_link`
- `create_draft_document`
- `publish_snapshot`

All mutations must:

1. Require campaign-scoped authorization.
2. Accept a complete Markdown document or a validated document mutation.
3. Include a base version and preferably a content hash.
4. Reuse the existing parser, validator, projection, version, and atomic-file service.
5. Return the new version and hash.
6. Return a conflict without overwriting newer content.
7. Be auditable by user, client, campaign, document, operation, and result.

Read tools should be annotated as read-only. Draft writes may be lower-friction; canon changes, relationship changes, publication, and destructive operations require explicit confirmation.

## Local cache and synchronization design

The local cache is a materialized working set, not a second source of truth.

```text
DM HQ current Markdown + SQL versions
                │
        authenticated snapshot
                │
       local Markdown working set
                │
        local FTS/embedding index
                │
     agent reads and proposes edits
                │
  complete Markdown + base version/hash
                │
        DM HQ validates and commits
```

### Initial synchronization

1. Authenticate the user and select one campaign.
2. Request a snapshot manifest and current authorized files.
3. Verify each document ID, version, and hash.
4. Store exact Markdown files locally.
5. Parse frontmatter locally for filters and navigation.
6. Build a local full-text index over body prose and selected metadata.
7. Optionally build a semantic index over the same authorized files.

### Incremental synchronization

1. Persist the server cursor with the cache.
2. Request changes after the cursor.
3. Fetch changed documents by document ID.
4. Verify version and hash before replacing the local file.
5. Process deletion events when present.
6. Advance the cursor only after all changes are committed locally.
7. Rebuild affected search entries.

### Write synchronization

1. Read from the local cache.
2. Generate a complete Markdown replacement or explicit proposal.
3. Send document ID, base version, base hash, and Markdown to DM HQ.
4. On success, update the local file and index from the server response.
5. On conflict, fetch the newer document and present a merge proposal.
6. Never silently overwrite a newer server version.

### Workspace API extensions required

The current workspace protocol provides a full snapshot, change cursor, and apply endpoint. Before relying on it for a durable local cache, add:

- `GET /campaigns/{id}/workspace/documents/{document_id}`.
- Paginated or streamed snapshots for large campaigns.
- Explicit `delete` operations in the change feed.
- A synchronization token scoped to campaign and authorized user.
- Separate private-source and publication-safe document scopes.
- Optional `include_markdown` behavior for changes to reduce round trips.
- Cache invalidation behavior for revoked access or removed campaign membership.

## DM workflows

### Archive exploration

The assistant searches the archive, retrieves relevant documents, follows relationships, and answers with document IDs and versions as evidence.

### Session preparation

The assistant creates a session brief from the session document, linked entities, recent revisions, unresolved relationships, and open threads. It should propose additions as drafts rather than silently changing canon.

### Campaign expansion

The assistant proposes NPCs, locations, factions, rumors, relationships, and plot threads as Markdown documents. The DM reviews the proposed Markdown and accepts or edits it before creation.

### At-table capture

The DM supplies an observation or outcome in natural language. The assistant identifies the likely source document, shows the proposed Markdown change, applies it against the current version, and reports a conflict if another edit occurred.

### Publication preparation

The assistant generates a safe Markdown snapshot, displays the exact title and body that players will receive, and requires confirmation before publication. Private aliases, tags, fields, relationships, references, and session links must not cross the publication boundary.

## Skills and guidance

DM HQ skills should be versioned with the repository or agent gateway and remain provider-neutral. They should describe:

- The Archive domain model.
- Markdown frontmatter and body grammar.
- Canon, draft, and publication semantics.
- Campaign and document authorization rules.
- Required tool sequences.
- When to search, retrieve, propose, apply, or ask for confirmation.
- How to cite document IDs and versions.
- How to handle conflicts and incomplete information.
- How to avoid inventing canon.

The agent should receive concise tool descriptions plus a short global instruction. Detailed guidance belongs in versioned skill resources rather than repeated in every tool schema.

## Authentication and security

- Add OAuth or scoped bearer-token authentication for agent clients; browser session cookies are not sufficient.
- Bind every token to a user and campaign permissions are evaluated server-side.
- Do not issue a shared campaign token to a public GPT.
- Keep private source and player-safe publication scopes separate.
- Never expose database credentials, filesystem paths, bearer publication tokens, or arbitrary query execution.
- Log tool calls, document IDs, versions, authorization results, and mutations without logging full private Markdown unnecessarily.
- Apply response size limits and rate limits.
- Treat retrieved Markdown as untrusted content that may contain prompt-injection text.
- Require confirmation for canon, publication, relationship, and bulk operations.
- Revoke local cache access when membership or token access is revoked.

## Delivery phases

### Phase 1: Agent contract and Plus pilot

- Define the agent gateway schemas and tool names.
- Add OAuth or scoped bearer tokens.
- Produce a small OpenAPI Action surface.
- Build a private Custom GPT for read-only campaign exploration.
- Add proposal and approval instructions.
- Test search, document retrieval, session preparation, and draft creation.

**Exit:** the developer can use a Plus Custom GPT to search a campaign and propose valid Markdown drafts without bypassing DM HQ authorization.

### Phase 2: Local cache bridge

- Implement the snapshot and incremental sync client.
- Add local exact-Markdown storage and FTS indexing.
- Add conflict-aware write queue.
- Add document fetch and deletion semantics to the workspace API.
- Expose the local cache through a local agent interface.
- Evaluate latency and stale-read behavior against server-only calls.

**Exit:** repeated reads are served locally, changes converge safely, and stale writes produce actionable conflicts.

### Phase 3: MCP server and optional UI

- Implement the remote MCP gateway over the same service layer.
- Add structured outputs and read/write safety annotations.
- Add optional Markdown preview and diff UI.
- Test with a supported ChatGPT workspace and at least one non-ChatGPT MCP client.
- Add secure-tunnel guidance for private development environments.

**Exit:** the same agent contract works through MCP without changing campaign semantics.

### Phase 4: Embedded paid assistant

- Integrate the Responses API or another approved model provider.
- Add server-side conversation state and streaming.
- Add per-user and per-campaign quotas.
- Add usage metering, cost controls, and plan entitlements.
- Reuse the same skills, tools, authorization, proposals, and write service.
- Add provider failover or bring-your-own-key only if product research supports it.

**Exit:** a DM can pay DM HQ for assistant usage, with clear limits and auditable campaign changes.

## Testing and evaluation

### Authorization and safety

- Cross-campaign reads and writes are rejected.
- Revoked membership invalidates cache synchronization.
- Private Markdown never appears in publication or player responses.
- Shared or malformed tokens cannot access documents.
- Prompt-injection text in a document cannot change tool authorization.

### Synchronization

- Snapshot round trips preserve Markdown byte content or documented normalization.
- Incremental changes converge after multiple documents change at different rates.
- Deletes and revoked access remove local cache entries.
- Duplicate change delivery is idempotent.
- Stale writes return conflicts and never overwrite newer versions.
- Interrupted sync resumes from the last committed cursor.

### Agent behavior

- The agent searches before inventing campaign facts.
- It cites source document IDs and versions.
- It proposes changes before applying them.
- It preserves frontmatter and body content.
- It keeps draft and canon semantics distinct.
- It previews publication content before publishing.

### Operational evaluation

- Measure server-only versus local-cache latency.
- Measure snapshot size and incremental change volume across representative campaigns.
- Track model tool-call count and unnecessary retrievals.
- Test API and model cost with and without semantic indexing.
- Validate backup, restore, reconciliation, and cache rebuild procedures.

## Decisions to confirm before implementation

- Whether the first Plus pilot should use Custom GPT Actions or wait for a supported ChatGPT MCP workspace.
- Whether DM HQ will provide a local bridge or document a third-party/local MCP client first.
- Whether semantic indexing is needed for the first campaign sizes.
- Whether users may bring their own API keys for the future embedded assistant.
- The free-tier budget and monthly usage caps.
- Whether publication documents should be excluded from the default agent cache.
- The retention and deletion policy for any OpenAI-hosted vector or conversation state.
