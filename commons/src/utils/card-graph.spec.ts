/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { describe, expect, it } from '@jest/globals'
import { buildCardGraph, extractCardBlocks } from './card-graph.js'

describe('card graph parser', () => {
  it('extracts cards and link edges from fenced blocks', () => {
    const markdown = [
      '```card id=alpha title=Alpha',
      'Alpha body',
      '-> beta',
      '```',
      '',
      '```card id=beta title=Beta',
      'Beta body',
      '<-> alpha',
      '```'
    ].join('\n')

    const blocks = extractCardBlocks(markdown)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.id).toBe('alpha')
    expect(blocks[0]?.links).toEqual([{ target: 'beta', edgeType: 'uni' }])

    const graph = buildCardGraph(markdown, 'alpha', 1)
    expect(graph.cards.map((card) => card.id)).toEqual(['alpha', 'beta'])
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { source: 'alpha', target: 'beta', edgeType: 'uni' },
        { source: 'beta', target: 'alpha', edgeType: 'bid' }
      ])
    )
    expect(graph.backlinks.map((card) => card.id)).toEqual(['beta'])
  })

  it('limits traversal depth', () => {
    const markdown = [
      '```card id=alpha',
      '-> beta',
      '```',
      '```card id=beta',
      '-> gamma',
      '```',
      '```card id=gamma',
      'gamma body',
      '```'
    ].join('\n')

    const depthOne = buildCardGraph(markdown, 'alpha', 1)
    const depthTwo = buildCardGraph(markdown, 'alpha', 2)

    expect(depthOne.cards.map((card) => card.id)).toEqual(['alpha', 'beta'])
    expect(depthTwo.cards.map((card) => card.id)).toEqual(['alpha', 'beta', 'gamma'])
  })
})