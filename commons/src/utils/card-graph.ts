/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type CardEdgeType = 'uni' | 'bid'

export interface CardGraphLink {
  target: string
  edgeType: CardEdgeType
}

export interface CardGraphBlock {
  id: string
  title: string
  info: string
  content: string
  body: string
  links: CardGraphLink[]
  startIndex: number
  endIndex: number
}

export interface CardGraphNode {
  id: string
  title: string
  body: string
}

export interface CardGraphEdge {
  source: string
  target: string
  edgeType: CardEdgeType
}

export interface CardGraphDto {
  focusOn: string | null
  cards: CardGraphNode[]
  edges: CardGraphEdge[]
  backlinks: CardGraphNode[]
}

const cardFenceStart = /^```card(?:\s+(.*))?\s*$/
const cardFenceEnd = /^```\s*$/
const cardLinkLine = /^\s*(<->|->)\s*([\w.-]+)\s*$/
const cardParameterMatcher = /([\w-]+)=("[^"]*"|'[^']*'|[^\s]+)(?:\s+|$)/g

const parseCardParameters = (info: string): { id?: string; title?: string } => {
  const parameters: Record<string, string> = {}
  let match: RegExpExecArray | null
  while ((match = cardParameterMatcher.exec(info)) !== null) {
    const rawValue = match[2] ?? ''
    parameters[match[1]] = rawValue.replace(/^['"]|['"]$/g, '')
  }
  cardParameterMatcher.lastIndex = 0
  return {
    id: parameters['id'],
    title: parameters['title']
  }
}

const createGeneratedCardId = (cardIndex: number): string => `card-${cardIndex + 1}`

export const extractCardBlocks = (markdown: string): CardGraphBlock[] => {
  const lines = markdown.split('\n')
  const blocks: CardGraphBlock[] = []

  let currentBlockStartLine = -1
  let currentBlockInfo = ''
  let currentBlockLines: string[] = []

  const pushCurrentBlock = (closingLineIndex: number): void => {
    const parsedParameters = parseCardParameters(currentBlockInfo)
    const id = parsedParameters.id ?? createGeneratedCardId(blocks.length)
    const title = parsedParameters.title ?? id
    const content = currentBlockLines.join('\n')
    const linkLines: CardGraphLink[] = []
    const bodyLines: string[] = []

    currentBlockLines.forEach((line) => {
      const parsedLink = cardLinkLine.exec(line)
      cardLinkLine.lastIndex = 0
      if (!parsedLink) {
        bodyLines.push(line)
        return
      }
      linkLines.push({ target: parsedLink[2], edgeType: parsedLink[1] === '<->' ? 'bid' : 'uni' })
    })

    const startIndex = lines.slice(0, currentBlockStartLine).reduce((total, currentLine) => total + currentLine.length + 1, 0)
    const endIndex = lines
      .slice(0, closingLineIndex + 1)
      .reduce((total, currentLine) => total + currentLine.length + 1, 0)

    blocks.push({
      id,
      title,
      info: currentBlockInfo,
      content,
      body: bodyLines.join('\n'),
      links: linkLines,
      startIndex,
      endIndex
    })
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    if (currentBlockStartLine === -1) {
      const startMatch = cardFenceStart.exec(line)
      if (!startMatch) {
        continue
      }
      currentBlockStartLine = lineIndex
      currentBlockInfo = startMatch[1] ?? ''
      currentBlockLines = []
      continue
    }

    if (cardFenceEnd.test(line)) {
      pushCurrentBlock(lineIndex)
      currentBlockStartLine = -1
      currentBlockInfo = ''
      currentBlockLines = []
      continue
    }

    currentBlockLines.push(line)
  }

  return blocks
}

export const findCardBlock = (markdown: string, cardId: string): CardGraphBlock | undefined => {
  return extractCardBlocks(markdown).find((block) => block.id === cardId)
}

export const buildCardGraph = (markdown: string, focusOn: string | null = null, depth = 1): CardGraphDto => {
  const blocks = extractCardBlocks(markdown)
  const cards = blocks.map<CardGraphNode>((block) => ({
    id: block.id,
    title: block.title,
    body: block.body
  }))
  const edges = blocks.flatMap<CardGraphEdge>((block) =>
    block.links.map((link) => ({ source: block.id, target: link.target, edgeType: link.edgeType }))
  )

  const allowedNodes = new Set<string>()
  if (focusOn === null) {
    cards.forEach((card) => allowedNodes.add(card.id))
  } else {
    allowedNodes.add(focusOn)
    for (let currentDepth = 0; currentDepth < depth; currentDepth += 1) {
      const currentNodes = Array.from(allowedNodes)
      edges.forEach((edge) => {
        if (currentNodes.includes(edge.source) || currentNodes.includes(edge.target)) {
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
    backlinks
  }
}