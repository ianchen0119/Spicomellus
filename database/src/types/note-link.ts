/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Stores a link between two cards in a note.
 */
export interface NoteLink {
  /** The unique id of the link row. */
  [FieldNameNoteLink.id]: number

  /** The id of the note this link belongs to. */
  [FieldNameNoteLink.noteId]: number

  /** The source card identifier within the note. */
  [FieldNameNoteLink.sourceCardKey]: string

  /** The target card identifier within the note. */
  [FieldNameNoteLink.targetCardKey]: string

  /** The relation type. */
  [FieldNameNoteLink.edgeType]: 'uni' | 'bid'

  /** Timestamp when the link was created. */
  [FieldNameNoteLink.createdAt]: string
}

export enum FieldNameNoteLink {
  id = 'id',
  noteId = 'note_id',
  sourceCardKey = 'source_card_key',
  targetCardKey = 'target_card_key',
  edgeType = 'edge_type',
  createdAt = 'created_at',
}

export const TableNoteLink = 'note_link'

export type TypeInsertNoteLink = Omit<NoteLink, FieldNameNoteLink.id>