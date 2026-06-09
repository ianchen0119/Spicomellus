---
name: spicomellus-knowledge-base
description: Use the Spicomellus MCP server as a persistent, compounding knowledge base (an LLM-maintained wiki). Apply when an agent needs to ingest sources, discover, read, connect, create, refine, lint, or explicitly delete durable notes and their card-graph relationships.
---

# Spicomellus Knowledge Base

Use the Spicomellus MCP tools to preserve durable knowledge across agent sessions. Treat notes as the source of truth for reusable findings, decisions, procedures, concepts, and project context—not as a transcript or scratchpad.

## The core idea

Most LLM-and-document workflows look like RAG: relevant chunks are retrieved at query time and an answer is generated. The LLM rediscovers knowledge from scratch on every question; nothing accumulates. Spicomellus is different.

Instead of only retrieving from raw sources at query time, the LLM **incrementally builds and maintains a persistent wiki** — a structured, interlinked collection of Spicomellus notes that sits between the user and the raw sources. When a new source arrives, the LLM does not just index it for later retrieval. It reads it, extracts the key information, and integrates it into the existing knowledge base — updating entity notes, revising topic summaries, noting where new data contradicts old claims, and strengthening or challenging the evolving synthesis. Knowledge is compiled once and then *kept current*, not re-derived on every query.

This is the key difference: **the knowledge base is a persistent, compounding artifact.** The cross-references are already there. Contradictions have already been flagged. The synthesis already reflects everything that has been read. It gets richer with every source added and every question asked.

The user rarely writes notes by hand — the LLM writes and maintains all of it. The user is in charge of sourcing, exploration, and asking the right questions; the LLM does the grunt work of summarizing, cross-referencing, filing, and bookkeeping. **Spicomellus is the IDE; the LLM is the programmer; the knowledge base is the codebase.**

## Prerequisites

- A Spicomellus MCP server must be loaded and authenticated as the intended user.
- Tool names may be prefixed by the MCP client (for example, `mcp_spicomellus_note_get`). Match tools by their unprefixed names below.
- If the tools are unavailable, state that the Spicomellus MCP server must be enabled; do not pretend that knowledge was persisted.

## Architecture

There are three layers:

- **Raw sources** — the user's curated source material: articles, papers, repository files, issues, transcripts, data. These are immutable; the LLM reads from them but never modifies them. This is the source of truth.
- **The knowledge base** — the directory of LLM-generated Spicomellus notes: summaries, entity notes, concept notes, comparisons, an overview, a synthesis. The LLM owns this layer entirely. It creates notes, updates them when new sources arrive, maintains links, and keeps everything consistent. The user reads it; the LLM writes it.
- **The schema** — this SKILL.md. It tells the LLM how the knowledge base is structured, what the conventions are, and what workflows to follow when ingesting sources, answering questions, or maintaining the base. This is what makes the LLM a disciplined wiki maintainer rather than a generic chatbot. The user and the LLM co-evolve it over time.

### Card graphs and main notes

Spicomellus organizes notes into **card graphs**. Every card graph has exactly one **main note** — the canonical entry point that anchors and summarizes that graph. Supporting notes link out from the main note to elaborate details, sub-topics, sources, and related entities.

- **Only the main note of each card graph is indexed in `index.md`.** Supporting notes are reached by traversing links from their main note (`knowledge_base_read` or `note_graph_get`), not by being listed in the index. This keeps the index a clean catalog of topics rather than an exhaustive dump of every note.
- When creating a new topic, create its main note first, give it a stable kebab-case alias, register it in `index.md`, then attach supporting notes by linking them to the main note.
- When ingesting into an existing topic, route updates through the relevant main note and its connected supporting notes; do not create a parallel main note for a topic that already has one.

## Autonomous Operating Policy

Use Spicomellus without waiting for a separate request when durable knowledge would materially help the current or future task.

1. Discover before writing: call `note_list_all` and inspect `primaryAlias`, `aliases`, titles, and metadata for likely matches. Read `index.md` first to locate the right main note.
2. Read before answering or editing: call `note_get` for relevant notes. For a connected topic, prefer `knowledge_base_read` from the topic's main note.
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
| `knowledge_base_read` | Recursively load a connected knowledge neighborhood | `rootAlias`; optional `maxDepth` (0–6) | Start from a main note at depth 1–2; increase only when broader context is needed. |
| `note_graph_get` | Inspect a note's card-graph snapshot | `alias`; optional `focusOn`, `depth` (1–3) | Use for graph-focused analysis or navigation. |
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

## Operations

The knowledge base is maintained through three recurring operations: **ingest**, **query**, and **lint**.

### Ingest

When the user provides a new source (or asks to file findings):

1. Read the source and discuss the key takeaways with the user.
2. Read `index.md` and identify the relevant main note(s); decide whether this belongs to an existing card graph or needs a new one.
3. Write or update a summary note. For a new topic, create its main note, give it a stable alias, and add it to `index.md`. For an existing topic, update the main note and its connected supporting notes.
4. Update related entity and concept notes across the base, adding or revising links so the new information is reachable.
5. Append an entry to `log.md`.

A single source may touch several notes. Prefer ingesting one source at a time and staying involved—surface summaries and updates so the user can guide emphasis.

### Query

When the user asks a question against the knowledge base:

1. Read `index.md` to find the relevant main notes, then drill in with `note_get` or `knowledge_base_read` from the main note.
2. Synthesize an answer with citations to the notes and original sources, clearly distinguishing stored facts from new inference.
3. **File valuable answers back into the base.** A comparison, analysis, or newly discovered connection is durable knowledge—create or update a note for it (and register it in `index.md` if it becomes a main note) so explorations compound rather than disappearing into chat history.

### Lint

Periodically, or when asked, health-check the knowledge base. Look for:

- Contradictions between notes.
- Stale claims that newer sources have superseded.
- Orphan notes with no inbound links (often a sign they should link to a main note).
- Important concepts mentioned but lacking their own note.
- Missing cross-references between related card graphs.
- `index.md` entries that no longer resolve, or main notes missing from `index.md`.
- Data gaps that could be filled with further research.

Report findings and suggest new questions to investigate or sources to seek. Do not delete anything during a lint pass without explicit authorization.

## Indexing and logging

Two special notes help navigate the knowledge base as it grows. Maintain them as ordinary Spicomellus notes with stable aliases (`index` and `log`).

- **`index.md` is content-oriented.** It is a catalog of the **main note of every card graph**—each listed with a link (alias), a one-line summary, and optionally metadata such as date or source count. Organize by category (entities, concepts, sources, etc.). Update it on every ingest. When answering a query, read the index first to find relevant main notes, then drill into their card graphs. Do not list supporting notes here; reach them via links from their main note.
- **`log.md` is chronological.** It is an append-only record of what happened and when—ingests, queries, lint passes. Start each entry with a consistent prefix (e.g. `## [2026-04-02] ingest | Source Title`) so the log stays scannable. The log gives a timeline of the base's evolution and helps future sessions understand recent activity.

## Retrieval Workflow

For questions that may rely on persisted context:

1. Read `index.md` (and, if needed, call `note_list_all`) to discover candidate main notes.
2. Select candidates by `primaryAlias`, title, description, and tags.
3. Call `note_get` for a focused lookup on the main note.
4. If relationships matter, call `knowledge_base_read` with `maxDepth: 1` or `2` from the main note to load its card graph.
5. Answer using the retrieved content, clearly distinguishing stored facts from new inference.
6. If no relevant note exists, continue with normal investigation and persist a durable result afterward when useful.

Do not call every note individually when metadata shows it is unrelated. Do not repeatedly list notes within the same task unless writes may have changed the set.

## Writing Workflow

Before creating or updating knowledge:

1. Read `index.md` and identify the canonical destination (the topic's main note).
2. Read that note and relevant connected notes.
3. Decide whether to update an existing note or create one stable, focused note. If creating a new card graph, create its main note and register it in `index.md`.
4. Write concise Markdown with a clear title and enough context to stand alone.
5. Separate confirmed facts, decisions, open questions, and sources where applicable.
6. Create meaningful relations to existing notes—link supporting notes to their main note, and link related main notes across card graphs.
7. Append an entry to `log.md`.
8. Read back the changed note when correctness is important or the write response is insufficient to verify content.

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
- Within a card graph, link every supporting note to its main note so nothing becomes an orphan.
- Use `uni` when the source depends on, cites, implements, or leads to the target.
- Use `bid` when both notes are peers in the same concept cluster.
- Avoid duplicate links and dense low-signal graphs.
- Use `note_graph_get` or `knowledge_base_read` before adding links if the existing topology is unclear.

## Safe Destructive Workflow

Only after explicit user authorization:

1. List notes and resolve each requested note to `primaryAlias`.
2. Show or internally establish the exact deletion set; never interpret “clean up” as “delete everything.”
3. Call `note_delete` separately for each intended note, setting `keepMedia` according to the request.
4. If a deleted note was a main note, remove its entry from `index.md` and append a `log.md` entry.
5. Re-run `note_list_all` to verify the expected result.
6. Report successes and failures; do not claim success for unverified deletions.

For relation deletion, verify both aliases and remove only the requested relation.

## Failure Handling

- On authentication or connection failure, report that MCP access is unavailable and preserve the intended content in the response rather than claiming it was saved.
- On `404`, refresh with `note_list_all`; the alias may be stale or the note may have been deleted.
- On partial multi-note operations, continue only when safe, then report each failed alias and error.
- Never retry destructive operations blindly after an ambiguous timeout; verify state first.
- Never expose MCP credentials or environment variable values in notes or responses.

## Why this works

The tedious part of maintaining a knowledge base is not the reading or the thinking—it is the bookkeeping: updating cross-references, keeping summaries current, noting when new data contradicts old claims, maintaining consistency across many notes. Humans abandon wikis because the maintenance burden grows faster than the value. The LLM does not get bored, does not forget to update a cross-reference, and can touch many notes in one pass. The knowledge base stays maintained because the cost of maintenance is near zero.

The user's job is to curate sources, direct the analysis, ask good questions, and think about what it all means. The LLM's job is everything else.
