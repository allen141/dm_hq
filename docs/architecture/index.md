# Architecture overview

No implementation architecture has been accepted. [ADR 0002](../decisions/0002-archive-application-architecture.md) proposes an Archive application architecture for review, and the [Archive implementation plan](../planning/archive-implementation-plan.md) applies it to Release 1.

## Conceptual shape

DM HQ is one product with three task-focused experiences over shared campaign data:

```text
+------------------+     +------------------+     +------------------+
|   The Archive    | <-> |  The Dashboard   | <-> | The Battlefield  |
+------------------+     +------------------+     +------------------+
          \____________________|____________________/
                         shared campaign model
                                   |
                            player portal
```

This diagram is conceptual and does not prescribe separate deployable services. A modular monolith is a reasonable starting hypothesis because the workflows share data and the project is young, but it must be evaluated and recorded in an architecture decision record.

## Proposed boundaries

- **Campaign knowledge:** durable content and relationships.
- **Session planning and runtime:** planned material, current focus, and session notes.
- **Encounters:** definitions, combatants, and temporary combat state.
- **Publishing:** deliberate projection of safe content for players.
- **Identity and access:** users, campaign membership, roles, and authorization.
- **Search:** discovery across content the requesting user may see.

## Cross-cutting requirements

- Authorization must prevent private content from entering player responses, indexes, caches, logs, and exports.
- Campaign data must support backup, export, and restoration.
- Live-session actions need responsive interaction and graceful error recovery.
- Important mutations should support undo or an understandable history.
- Accessibility and keyboard operation should be designed in.
- Observability should avoid recording campaign prose or secrets.

## Decisions still required

1. Accept or revise the proposed Archive application architecture.
2. Select the first production-hosting target.
3. Validate the database and search strategy against representative campaign data.
4. Authentication and campaign authorization.
5. Content format and version history.
6. Live updates and offline expectations.
7. Backup and export guarantees.
