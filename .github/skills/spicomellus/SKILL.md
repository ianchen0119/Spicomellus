---
name: spicomellus-knowledge-base
description: Use the Spicomellus MCP server as a persistent knowledge base. Apply when an agent needs to discover, read, connect, create, refine, or explicitly delete durable notes and their graph relationships.
---

# Spicomellus Knowledge Base

Use the Spicomellus MCP tools to preserve durable knowledge across agent sessions. Treat notes as the source of truth for reusable findings, decisions, procedures, concepts, and project context—not as a transcript or scratchpad.

## Prerequisites

- A Spicomellus MCP server must be loaded and authenticated as the intended user.
- Tool names may be prefixed by the MCP client (for example, `mcp_spicomellus_note_get`). Match tools by their unprefixed names below.
- If the tools are unavailable, state that the Spicomellus MCP server must be enabled; do not pretend that knowledge was persisted.

## Autonomous Operating Policy

Use Spicomellus without waiting for a separate request when durable knowledge would materially help the current or future task.

1. Discover before writing: call `note_list_all` and inspect `primaryAlias`, `aliases`, titles, and metadata for likely matches.
2. Read before answering or editing: call `note_get` for relevant notes. For a connected topic, prefer `knowledge_base_read` from the best root note.
3. Reuse before creating: update an existing canonical note rather than creating a duplicate.
4. Preserve intent: retain valid existing content when updating; merge new facts, decisions, and links coherently.
5. Persist only durable value: store verified findings, decisions with rationale, stable procedures, architecture, vocabulary, and source references.
6. Avoid low-value memory: do not store secrets, credentials, tokens, personal data, temporary logs, speculative claims presented as facts, or routine conversational chatter.
7. Report persistence briefly: identify aliases created, updated, linked, or deleted.

Read operations (`note_list_all`, `note_get`, `note_graph_get`, `knowledge_base_read`) may be performed proactively. Create, update, and link operations may be performed when they clearly support the user's task. Never delete a note or relation unless the user explicitly asks for that destructive action.

## Tool Contract

| Tool | Purpose | Required input | Key behavior |
| --- | --- | --- | --- |
| `note_list_all` | Discover the authenticated user's notes | none | Notes expose their canonical identifier as `primaryAlias`; `aliases` may contain alternatives. |
| `note_get` | Read one note and its metadata, content, graph, links, and backlinks | `alias` | Use before modifying a note. |
| `knowledge_base_read` | Recursively load a connected knowledge neighborhood | `rootAlias`; optional `maxDepth` (0–6) | Start at depth 1–2; increase only when broader context is needed. |
| `note_graph_get` | Inspect a note's graph snapshot | `alias`; optional `focusOn`, `depth` (1–3) | Use for graph-focused analysis or navigation. |
| `note_create` | Create a Markdown note | `content`; optional `alias` | Prefer a stable explicit alias for durable knowledge. |
| `note_update` | Replace an existing note's Markdown content | `alias`, `content` | Read first and submit the complete merged document. |
| `note_link_create` | Relate two notes | `alias`, `targetAlias`, `edgeType` (`uni` or `bid`) | Use `uni` for directional dependency/reference and `bid` for symmetric association. |
| `note_link_delete` | Remove relations between notes | `alias`, `targetAlias` | Destructive; requires explicit user intent. |
| `note_delete` | Delete one note | `alias`; optional `keepMedia` | Destructive; requires explicit user intent. Media is deleted by default. |

Legacy `node_*` aliases may exist, but always prefer the canonical `note_*` tools.

## Identifier Rules

- From `note_list_all`, use `primaryAlias` as the canonical argument to other tools.
- If `primaryAlias` is absent, use the first non-empty value in `aliases`; use `alias` only as a compatibility fallback.
- Use lowercase kebab-case aliases that remain meaningful over time, such as `project-auth-architecture`.
- Do not infer an alias from a title when metadata already provides one.
- Treat aliases as stable identifiers; avoid renaming by duplication unless the user asks for a migration.

## Retrieval Workflow

For questions that may rely on persisted context:

1. Call `note_list_all` once to discover candidate notes.
2. Select candidates by `primaryAlias`, title, description, and tags.
3. Call `note_get` for a focused lookup.
4. If relationships matter, call `knowledge_base_read` with `maxDepth: 1` or `2`.
5. Answer using the retrieved content, clearly distinguishing stored facts from new inference.
6. If no relevant note exists, continue with normal investigation and persist a durable result afterward when useful.

Do not call every note individually when metadata shows it is unrelated. Do not repeatedly list notes within the same task unless writes may have changed the set.

## Writing Workflow

Before creating or updating knowledge:

1. List notes and identify the canonical destination.
2. Read that note and relevant connected notes.
3. Decide whether to update an existing note or create one stable, focused note.
4. Write concise Markdown with a clear title and enough context to stand alone.
5. Separate confirmed facts, decisions, open questions, and sources where applicable.
6. Create meaningful relations to existing notes.
7. Read back the changed note when correctness is important or the write response is insufficient to verify content.

Recommended note shape (adapt as needed):

```markdown
# Topic

## Summary
A concise statement of durable knowledge.

## Details
Verified context, constraints, and implications.

## Decisions
- Decision — rationale and consequences.

## Open Questions
- Unresolved item.

## Sources
- Repository path, issue, URL, or other provenance.
```

Do not force empty sections into every note.

## Linking Guidance

- Link notes when the relationship improves future discovery, not merely because both were touched in one session.
- Use `uni` when the source depends on, cites, implements, or leads to the target.
- Use `bid` when both notes are peers in the same concept cluster.
- Avoid duplicate links and dense low-signal graphs.
- Use `note_graph_get` or `knowledge_base_read` before adding links if the existing topology is unclear.

## Safe Destructive Workflow

Only after explicit user authorization:

1. List notes and resolve each requested note to `primaryAlias`.
2. Show or internally establish the exact deletion set; never interpret “clean up” as “delete everything.”
3. Call `note_delete` separately for each intended note, setting `keepMedia` according to the request.
4. Re-run `note_list_all` to verify the expected result.
5. Report successes and failures; do not claim success for unverified deletions.

For relation deletion, verify both aliases and remove only the requested relation.

## Failure Handling

- On authentication or connection failure, report that MCP access is unavailable and preserve the intended content in the response rather than claiming it was saved.
- On `404`, refresh with `note_list_all`; the alias may be stale or the note may have been deleted.
- On partial multi-note operations, continue only when safe, then report each failed alias and error.
- Never retry destructive operations blindly after an ambiguous timeout; verify state first.
- Never expose MCP credentials or environment variable values in notes or responses.
