/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import {
  FieldNameNoteLink,
  NoteLink,
  TableNoteLink,
  TypeInsertNoteLink,
} from '@hedgedoc/database'
import { CardGraphEdge, CardGraphInterface, CardGraphNode, extractCardBlocks } from '@hedgedoc/commons'
import { Injectable } from '@nestjs/common'
import { Knex } from 'knex'
import { InjectConnection } from 'nest-knexjs'

import { ConsoleLoggerService } from '../logger/console-logger.service'
import { dateTimeToDB, getCurrentDateTime } from '../utils/datetime'

@Injectable()
export class NoteLinkService {
  constructor(
    private readonly logger: ConsoleLoggerService,
    @InjectConnection()
    private readonly knex: Knex,
  ) {
    this.logger.setContext(NoteLinkService.name)
  }

  async syncNoteLinks(noteId: number, noteContent: string, transaction?: Knex): Promise<void> {
    const dbActor = transaction ?? this.knex
    const blocks = extractCardBlocks(noteContent)
    const links: TypeInsertNoteLink[] = []
    const createdAt = dateTimeToDB(getCurrentDateTime())

    blocks.forEach((block) => {
      block.links.forEach((link) => {
        links.push({
          [FieldNameNoteLink.noteId]: noteId,
          [FieldNameNoteLink.sourceCardKey]: block.id,
          [FieldNameNoteLink.targetCardKey]: link.target,
          [FieldNameNoteLink.edgeType]: link.edgeType,
          [FieldNameNoteLink.createdAt]: createdAt,
        })
      })
    })

    await dbActor(TableNoteLink).where(FieldNameNoteLink.noteId, noteId).delete()
    if (links.length === 0) {
      this.logger.debug(`No note links found for note '${noteId}'`, 'syncNoteLinks')
      return
    }
    await dbActor(TableNoteLink).insert(links)
    this.logger.debug(`Synced ${links.length} note links for note '${noteId}'`, 'syncNoteLinks')
  }

  async getNoteLinks(noteId: number, transaction?: Knex): Promise<NoteLink[]> {
    const dbActor = transaction ?? this.knex
    return await dbActor(TableNoteLink).select().where(FieldNameNoteLink.noteId, noteId)
  }

  async getOutgoingLinks(
    noteId: number,
    sourceCardKey: string,
    transaction?: Knex,
  ): Promise<NoteLink[]> {
    const dbActor = transaction ?? this.knex
    return await dbActor(TableNoteLink)
      .select()
      .where(FieldNameNoteLink.noteId, noteId)
      .andWhere(FieldNameNoteLink.sourceCardKey, sourceCardKey)
  }

  async getBacklinks(
    noteId: number,
    targetCardKey: string,
    transaction?: Knex,
  ): Promise<NoteLink[]> {
    const dbActor = transaction ?? this.knex
    return await dbActor(TableNoteLink)
      .select()
      .where(FieldNameNoteLink.noteId, noteId)
      .andWhere(FieldNameNoteLink.targetCardKey, targetCardKey)
  }

  /**
   * Creates a note-to-note link. The source alias is the primary alias of the current note;
   * the target alias is the primary alias of the note to link to.
   * Duplicate entries are silently ignored.
   */
  async createNoteToNoteLink(
    noteId: number,
    sourceAlias: string,
    targetAlias: string,
    edgeType: 'uni' | 'bid',
    transaction?: Knex,
  ): Promise<void> {
    const dbActor = transaction ?? this.knex
    const createdAt = dateTimeToDB(getCurrentDateTime())
    await dbActor(TableNoteLink)
      .insert({
        [FieldNameNoteLink.noteId]: noteId,
        [FieldNameNoteLink.sourceCardKey]: sourceAlias,
        [FieldNameNoteLink.targetCardKey]: targetAlias,
        [FieldNameNoteLink.edgeType]: edgeType,
        [FieldNameNoteLink.createdAt]: createdAt,
      })
      .onConflict([
        FieldNameNoteLink.noteId,
        FieldNameNoteLink.sourceCardKey,
        FieldNameNoteLink.targetCardKey,
        FieldNameNoteLink.edgeType,
      ])
      .ignore()
    this.logger.debug(
      `Created note-to-note link from '${sourceAlias}' to '${targetAlias}' (${edgeType})`,
      'createNoteToNoteLink',
    )
  }

  /**
   * Deletes all note-to-note links from the given note to the given target alias.
   */
  async deleteNoteToNoteLink(
    noteId: number,
    targetAlias: string,
    transaction?: Knex,
  ): Promise<void> {
    const dbActor = transaction ?? this.knex
    await dbActor(TableNoteLink)
      .where(FieldNameNoteLink.noteId, noteId)
      .andWhere(FieldNameNoteLink.targetCardKey, targetAlias)
      .delete()
    this.logger.debug(
      `Deleted note-to-note link to '${targetAlias}' for note '${noteId}'`,
      'deleteNoteToNoteLink',
    )
  }

  /**
   * Returns all note-link rows from ANY note whose target_card_key matches the given alias.
   * Used to find which other notes link TO the current note (cross-note backlinks).
   */
  async getCrossNoteBacklinks(targetAlias: string, transaction?: Knex): Promise<NoteLink[]> {
    const dbActor = transaction ?? this.knex
    return await dbActor(TableNoteLink)
      .select()
      .where(FieldNameNoteLink.targetCardKey, targetAlias)
  }

  async getGraphSnapshot(
    noteId: number,
    noteContent: string,
    focusOn: string | null = null,
    depth = 1,
    transaction?: Knex,
  ): Promise<CardGraphInterface> {
    const blocks = extractCardBlocks(noteContent)
    const links = await this.getNoteLinks(noteId, transaction)

    const cards = blocks.map<CardGraphNode>((block) => ({
      id: block.id,
      title: block.title,
      body: block.body,
    }))
    const edges = links.map<CardGraphEdge>((link) => ({
      source: link[FieldNameNoteLink.sourceCardKey],
      target: link[FieldNameNoteLink.targetCardKey],
      edgeType: link[FieldNameNoteLink.edgeType],
    }))

    const allowedNodes = new Set<string>()
    if (focusOn === null) {
      cards.forEach((card) => allowedNodes.add(card.id))
    } else {
      allowedNodes.add(focusOn)
      for (let currentDepth = 0; currentDepth < depth; currentDepth += 1) {
        const frontier = Array.from(allowedNodes)
        edges.forEach((edge) => {
          if (frontier.includes(edge.source) || frontier.includes(edge.target)) {
            allowedNodes.add(edge.source)
            allowedNodes.add(edge.target)
          }
        })
      }
    }

    const filteredCards = cards.filter((card) => allowedNodes.has(card.id))
    const filteredEdges = edges.filter((edge) => allowedNodes.has(edge.source) && allowedNodes.has(edge.target))
    const backlinks =
      focusOn === null
        ? []
        : filteredCards.filter((card) => filteredEdges.some((edge) => edge.target === focusOn && edge.source === card.id))

    return {
      focusOn,
      cards: filteredCards,
      edges: filteredEdges,
      backlinks,
    }
  }
}