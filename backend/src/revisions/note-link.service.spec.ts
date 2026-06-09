/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { describe, expect, it, beforeAll, afterEach, jest } from '@jest/globals'
import { FieldNameNoteLink, TableNoteLink } from '@hedgedoc/database'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import type { Tracker } from 'knex-mock-client'

import appConfigMock from '../config/mock/app.config.mock'
import { expectBindings } from '../database/mock/expect-bindings'
import { mockDelete, mockInsert, mockSelect } from '../database/mock/mock-queries'
import { mockKnexDb } from '../database/mock/provider'
import { LoggerModule } from '../logger/logger.module'
import { NoteLinkService } from './note-link.service'

describe('NoteLinkService', () => {
  let service: NoteLinkService
  let tracker: Tracker

  beforeAll(async () => {
    const [createdTracker, knexProvider] = mockKnexDb()
    tracker = createdTracker

    const module: TestingModule = await Test.createTestingModule({
      providers: [NoteLinkService, knexProvider],
      imports: [
        LoggerModule,
        await ConfigModule.forRoot({
          isGlobal: true,
          load: [appConfigMock],
        }),
      ],
    }).compile()

    service = module.get<NoteLinkService>(NoteLinkService)
  })

  afterEach(() => {
    tracker.reset()
    jest.resetAllMocks()
  })

  it('rebuilds link rows from fenced card content', async () => {
    const noteId = 42
    const markdown = [
      '```card id=alpha title=Alpha',
      'Alpha body',
      '-> beta',
      '```',
      '',
      '```card id=beta title=Beta',
      'Beta body',
      '<-> alpha',
      '```',
    ].join('\n')

    mockDelete(tracker, TableNoteLink, [FieldNameNoteLink.noteId], 1)
    mockInsert(
      tracker,
      TableNoteLink,
      [
        FieldNameNoteLink.noteId,
        FieldNameNoteLink.sourceCardKey,
        FieldNameNoteLink.targetCardKey,
        FieldNameNoteLink.edgeType,
        FieldNameNoteLink.createdAt,
      ],
      null,
    )

    await expect(service.syncNoteLinks(noteId, markdown)).resolves.toBeUndefined()

    expectBindings(tracker, 'delete', [[noteId]])
    expectBindings(tracker, 'insert', [
      [
        noteId,
        'alpha',
        'beta',
        'uni',
        expect.any(String),
      ],
      [
        noteId,
        'beta',
        'alpha',
        'bid',
        expect.any(String),
      ],
    ])
  })

  it('returns outgoing and backlink rows', async () => {
    const noteId = 7
    const cardId = 'alpha'
    const outgoingRows = [
      {
        [FieldNameNoteLink.noteId]: noteId,
        [FieldNameNoteLink.sourceCardKey]: cardId,
        [FieldNameNoteLink.targetCardKey]: 'beta',
        [FieldNameNoteLink.edgeType]: 'uni',
        [FieldNameNoteLink.createdAt]: '2026-06-08 12:00:00',
      },
    ]
    const backlinkRows = [
      {
        [FieldNameNoteLink.noteId]: noteId,
        [FieldNameNoteLink.sourceCardKey]: 'gamma',
        [FieldNameNoteLink.targetCardKey]: cardId,
        [FieldNameNoteLink.edgeType]: 'bid',
        [FieldNameNoteLink.createdAt]: '2026-06-08 12:00:00',
      },
    ]

    mockSelect(
      tracker,
      [
        FieldNameNoteLink.id,
        FieldNameNoteLink.noteId,
        FieldNameNoteLink.sourceCardKey,
        FieldNameNoteLink.targetCardKey,
        FieldNameNoteLink.edgeType,
        FieldNameNoteLink.createdAt,
      ],
      TableNoteLink,
      [FieldNameNoteLink.noteId, FieldNameNoteLink.sourceCardKey],
      outgoingRows,
    )
    mockSelect(
      tracker,
      [
        FieldNameNoteLink.id,
        FieldNameNoteLink.noteId,
        FieldNameNoteLink.sourceCardKey,
        FieldNameNoteLink.targetCardKey,
        FieldNameNoteLink.edgeType,
        FieldNameNoteLink.createdAt,
      ],
      TableNoteLink,
      [FieldNameNoteLink.noteId, FieldNameNoteLink.targetCardKey],
      backlinkRows,
    )

    await expect(service.getOutgoingLinks(noteId, cardId)).resolves.toEqual(outgoingRows)
    await expect(service.getBacklinks(noteId, cardId)).resolves.toEqual(backlinkRows)
    expectBindings(tracker, 'select', [[noteId, cardId], [noteId, cardId]])
  })
})