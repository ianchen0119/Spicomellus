/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* oxlint-disable */
const {
  FieldNameNote,
  FieldNameNoteLink,
  TableNote,
  TableNoteLink,
} = require('@hedgedoc/database');

const up = async function (knex) {
  await knex.schema.createTable(TableNoteLink, (table) => {
    table.increments(FieldNameNoteLink.id).primary();
    table
      .integer(FieldNameNoteLink.noteId)
      .unsigned()
      .notNullable()
      .references(FieldNameNote.id)
      .inTable(TableNote)
      .onDelete('CASCADE');
    table.string(FieldNameNoteLink.sourceCardKey).notNullable();
    table.string(FieldNameNoteLink.targetCardKey).notNullable();
    table
      .enu(FieldNameNoteLink.edgeType, ['uni', 'bid'], {
        useNative: true,
        enumName: FieldNameNoteLink.edgeType,
      })
      .notNullable();
    table.timestamp(FieldNameNoteLink.createdAt, { useTz: false, precision: 3 }).notNullable();

    table.index([FieldNameNoteLink.noteId], 'idx_note_link_note_id');
    table.index([FieldNameNoteLink.sourceCardKey], 'idx_note_link_source_card_key');
    table.index([FieldNameNoteLink.targetCardKey], 'idx_note_link_target_card_key');
    table.unique(
      [
        FieldNameNoteLink.noteId,
        FieldNameNoteLink.sourceCardKey,
        FieldNameNoteLink.targetCardKey,
        FieldNameNoteLink.edgeType,
      ],
      {
        indexName: 'uq_note_link_dedup',
        useConstraint: true,
      },
    );
  });
};

const down = async function (knex) {
  await knex.schema.dropTableIfExists(TableNoteLink);
};

module.exports = { up, down };