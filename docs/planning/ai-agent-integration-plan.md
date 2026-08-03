# AI agent integration plan

**Status:** Proposed  
**Date:** 2026-08-02  
**Scope:** DM-facing campaign development assistance built on the Markdown-canonical Archive

## Decision in brief

DM HQ will own a provider-neutral agent gateway. The gateway exposes campaign-scoped search, Markdown retrieval, synchronization, proposal, preview, and version-safe write operations. Model hosts are adapters around that contract:

- A repo-native local agent workspace is the primary pilot and fast-indexing workflow.
- Codex or another local agent operates on an exact Markdown cache and local search index supplied by the workspace tools.
- A private Custom GPT Action is an optional Plus-based adapter, not the primary storage or execution surface.
- An MCP server is an interoperability adapter for supported ChatGPT workspaces and other MCP clients.
- An embedded Responses API assistant is the future DM HQ-paid product.

The model never becomes the source of truth. DM HQ Markdown documents remain authoritative; local indexes, uploaded files, and vector stores are derived caches.

The repository distributes the workspace client, local indexing tools, agent skills, and setup guidance. Campaign content is kept in a separate local workspace and is never committed to Git.

## Goals

- Let a DM use an AI assistant to develop, revise, and add campaign content.
- Give the assistant versioned guidance about DM HQ concepts, permissions, document grammar, and safe write behavior.
- Support the developer’s existing ChatGPT Plus subscription during the pilot through Codex/local workflows and, where available, a Custom GPT Action or Project used for conversation context.
- Support users who have no ChatGPT subscription through local clients, other model providers, or a future DM HQ-hosted tier.
- Keep the same tool contract usable for future monetization.
- Make repeated campaign queries fast through a local Markdown cache without weakening server authority.
- Preserve campaign isolation, private DM content, publication boundaries, optimistic concurrency, and auditability.

## Non-goals

- Giving an agent direct PostgreSQL or DM HQ server-filesystem access.
- Treating an OpenAI vector store, ChatGPT conversation, or local index as canonical storage.
- Assuming ChatGPT Plus can be used as an API credential or API credit balance.
- Assuming a ChatGPT Project or Custom GPT provides a durable local filesystem or can execute the repository workspace client by itself.
- Building a ChatGPT-specific data model that cannot support other clients.
- Allowing an assistant to publish player content or mark records canon without explicit approval.

## Product surfaces and hosting choices

### Primary pilot: repo-native local agent workspace

The repository will provide a small workspace suite that a DM can clone and run locally. It will:

- Authenticate to DM HQ with a user-scoped credential.
- Download a campaign-scoped snapshot of authorized Markdown documents.
- Materialize exact Markdown files in a separate, ignored workspace directory.
- Maintain a local full-text index, with optional semantic indexing later.
- Track synchronization cursors, versions, hashes, and authorization scope.
- Validate and push complete Markdown documents through the DM HQ workspace API.
- Detect conflicts and stage merge proposals instead of overwriting newer server content.

Codex or another local agent can then use ordinary filesystem search and editing against the local Markdown corpus. The local workspace is a materialized working set, never a second source of truth.

The repository should ship provider-neutral guidance through `AGENTS.md`, versioned skill resources, command examples, and a setup/check workflow. Client-specific installation instructions may copy or register those skills for Codex, an IDE agent, or another local MCP-capable client.

### Optional Plus adapter: Custom GPT Action

A private Custom GPT can call an HTTPS DM HQ agent API described by an OpenAPI schema. The Action uses OAuth or a scoped bearer token and exposes read/search tools first, followed by approval-gated writes.

This can provide a ChatGPT Plus-facing experiment, but it does not provide a persistent local filesystem or automatic campaign synchronization inside the ChatGPT conversation. Action requests still cross the network. A local bridge can sit behind the Action, but that remains an optional and more complex adapter to the primary workspace workflow.

Reference: [Configuring Actions in GPTs](https://help.openai.com/en/articles/9442513).

### Native MCP app

DM HQ will provide a remote MCP server as the long-term adapter. It can expose focused tools, structured results, safety annotations, and optional UI. A supported ChatGPT workspace can connect the app with OAuth and require confirmation for mutating actions.

Current OpenAI documentation describes full custom MCP app support, including write actions, as available for Business, Enterprise, and Edu workspaces during rollout. Plus access should not be assumed to include this surface.

References: [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server), [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461).

### Local sync bridge

A local companion process maintains the authorized Markdown working set and local search index described above. It exposes the same agent tools over a local CLI, local MCP server, or small localhost API. The first implementation should optimize for the CLI/filesystem path used by Codex and IDE agents; a tunnelled ChatGPT connection is optional.

ChatGPT does not automatically mount arbitrary local files. The bridge is a separate process that must be running and must authenticate to DM HQ. A ChatGPT Project may hold instructions or uploaded reference material, but it is not the local cache executor.

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

### Repository workspace suite

The repository should provide a small, provider-neutral local workspace package with:

- A `dmhq` workspace CLI for authentication, campaign selection, snapshot, incremental sync, validation, status, and push.
- A separate workspace root selected by configuration, never the Git checkout itself.
- A `.dmhq` directory containing sync state, campaign scope, content hashes, and local index metadata.
- Exact Markdown materialization under campaign-scoped directories.
- A disposable SQLite full-text index over authorized Markdown and selected frontmatter metadata.
- A conflict queue or merge workspace for documents rejected because their server version advanced.
- Credential storage through the operating system credential store where available, with environment-variable fallback for development.
- Versioned `AGENTS.md`, skill resources, and client setup guidance that teach local-first reads and server-authoritative writes.

Campaign data, sync tokens, indexes, and credentials must be excluded from version control. The tool may offer an explicit encrypted export or backup, but it must not silently add the working set to the repository.

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

### Phase 1: Local workspace foundation

- Define the provider-neutral agent gateway schemas and tool names.
- Add OAuth or scoped bearer tokens and campaign-scoped authorization.
- Implement the local workspace CLI and configuration.
- Implement snapshot download, exact Markdown materialization, cursor persistence, and local indexing.
- Add validation, status, incremental sync, and conflict-aware push commands.
- Package `AGENTS.md`, skills, examples, and setup/check guidance for Codex and IDE agents.
- Test search, document retrieval, session preparation, draft creation, and stale-write handling from the local workspace.

**Exit:** the developer can clone the repository, authenticate, sync a campaign, use a local agent against the Markdown files, and safely push validated changes without bypassing DM HQ authorization.

### Phase 2: ChatGPT Plus and local-client adapters

- Produce a small OpenAPI Action surface over the same gateway.
- Build a private Custom GPT for read-only exploration and proposal workflows where the user has Plus access.
- Document that Actions still use network retrieval and do not create a durable local filesystem.
- Optionally expose the running local workspace through a secure bridge for clients that can reach it; never expose the database or document volume directly.
- Add client-specific setup instructions without changing the workspace or server contract.
- Evaluate local-first latency and model tool-call count against server-only Action retrieval.

**Exit:** the local workflow remains complete without ChatGPT, while a Plus user can use a Custom GPT as an optional conversational adapter with the same authorization and write semantics.

### Phase 3: Remote MCP server and optional UI

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
- Verify that the local agent can discover the skill guidance and operate without a ChatGPT subscription.
- Test API and model cost with and without semantic indexing.
- Validate backup, restore, reconciliation, and cache rebuild procedures.

## Decisions to confirm before implementation

- Whether the first local client should use the CLI only or also expose a local MCP interface.
- Whether DM HQ will provide a tunnelled bridge for ChatGPT Actions or document that adapter as an advanced setup.
- Whether semantic indexing is needed for the first campaign sizes.
- Which operating-system credential stores and local workspace platforms are supported in the first release.
- Whether users may bring their own API keys for the future embedded assistant.
- The free-tier budget and monthly usage caps.
- Whether publication documents should be excluded from the default agent cache.
- The retention and deletion policy for any OpenAI-hosted vector or conversation state.
