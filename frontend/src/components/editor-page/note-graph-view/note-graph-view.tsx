/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { getCrossNoteBacklinks, getNoteLinks, getNote, type NoteLinkInterface } from '../../../api/notes'
import { useApplicationState } from '../../../hooks/common/use-application-state'
import { useDarkModeState } from '../../../hooks/dark-mode/use-dark-mode-state'
import { useRouter } from 'next/navigation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ZoomIn as IconZoomIn,
  ZoomOut as IconZoomOut,
  ArrowsFullscreen as IconReset,
  ArrowClockwise as IconRefresh,
  Download as IconDownload,
  X as IconClose,
} from 'react-bootstrap-icons'
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

// ── Module-level caches ────────────────────────────────────────────────────
// Persist across component mounts — prevents redundant network calls when
// the user switches card mode off and back on within the same page session.

type NoteData = Awaited<ReturnType<typeof getNote>>

/** Keyed by note alias */
const notePromiseCache = new Map<string, Promise<NoteData>>()
/** Keyed by note alias */
const graphLinksCache = new Map<
  string,
  { outgoing: NoteLinkInterface[]; incoming: NoteLinkInterface[] }
>()

function fetchNoteCached(id: string): Promise<NoteData> {
  const existing = notePromiseCache.get(id)
  if (existing) return existing
  const p = getNote(id)
  notePromiseCache.set(id, p)
  return p
}

async function fetchGraphCached(
  alias: string,
): Promise<{ outgoing: NoteLinkInterface[]; incoming: NoteLinkInterface[] }> {
  const existing = graphLinksCache.get(alias)
  if (existing) return existing
  const [outgoing, incoming] = await Promise.all([
    getNoteLinks(alias),
    getCrossNoteBacklinks(alias),
  ])
  const result = { outgoing, incoming }
  graphLinksCache.set(alias, result)
  return result
}

const HEADER_H = 36
const MIN_ORBIT = 480
/** Minimum gap (px) kept between card edges after overlap separation */
const CARD_GAP = 60
/** Fallback dimensions used before ResizeObserver reports actual card size */
const FALLBACK_W = 320
const FALLBACK_H = 200

interface CardSize {
  w: number
  h: number
}

// ------------------------------------------------------------------
// Layout helpers
// ------------------------------------------------------------------

function buildPositions(currentId: string, others: string[]): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>()
  map.set(currentId, { x: 0, y: 0 })
  const n = others.length
  if (n === 0) return map
  const radius = Math.max(MIN_ORBIT, n * 140)
  others.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    map.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
  })
  return map
}

function buildGraphPositions(
  focusId: string,
  nodes: NodeItem[],
  edges: RawEdge[],
  mode: GraphMode,
): Map<string, { x: number; y: number }> {
  // Build undirected adjacency
  const adjacency = new Map<string, Set<string>>()
  for (const edge of edges) {
    const addN = (a: string, b: string): void => {
      const s = adjacency.get(a) ?? new Set<string>()
      s.add(b)
      adjacency.set(a, s)
    }
    addN(edge.source, edge.target)
    addN(edge.target, edge.source)
  }

  const allowedDepth = mode === 'direct' ? 1 : Number.POSITIVE_INFINITY
  const nodeSet = new Set(nodes.map((n) => n.id))

  // BFS with parent tracking → build a spanning tree for sector layout.
  // Child nodes are placed in an angular sub-sector of their parent so that
  // connected nodes are always geometrically close to each other.
  const childrenOf = new Map<string, string[]>([[focusId, []]])
  const bfsDepth = new Map<string, number>([[focusId, 0]])
  const bfsQueue: string[] = [focusId]
  while (bfsQueue.length > 0) {
    const cur = bfsQueue.shift()!
    const d = bfsDepth.get(cur)!
    if (d >= allowedDepth) continue
    for (const nb of adjacency.get(cur) ?? []) {
      if (!bfsDepth.has(nb) && nodeSet.has(nb)) {
        bfsDepth.set(nb, d + 1)
        childrenOf.set(nb, [])
        childrenOf.get(cur)!.push(nb)
        bfsQueue.push(nb)
      }
    }
  }

  // Subtree leaf-count drives proportional sector sizing
  const subSize = new Map<string, number>()
  const computeSize = (id: string): number => {
    const ch = childrenOf.get(id) ?? []
    const s = ch.length === 0 ? 1 : ch.reduce((acc, c) => acc + computeSize(c), 0)
    subSize.set(id, s)
    return s
  }
  computeSize(focusId)

  const positions = new Map<string, { x: number; y: number }>([[focusId, { x: 0, y: 0 }]])

  // Pre-order traversal: divide the angular sector proportionally among children
  const assign = (id: string, secStart: number, secEnd: number, depthLevel: number): void => {
    const ch = childrenOf.get(id) ?? []
    if (ch.length === 0) return
    const total = subSize.get(id) ?? 1
    let cursor = secStart
    for (const child of ch) {
      const cSize = subSize.get(child) ?? 1
      const arc = (secEnd - secStart) * (cSize / total)
      const angle = cursor + arc / 2
      const r = depthLevel * MIN_ORBIT
      positions.set(child, { x: Math.cos(angle) * r, y: Math.sin(angle) * r })
      assign(child, cursor, cursor + arc, depthLevel + 1)
      cursor += arc
    }
  }
  assign(focusId, -Math.PI, Math.PI, 1)

  return positions
}

/**
 * Iteratively push apart any overlapping cards using AABB collision.
 * The `pinnedId` card (current note) stays fixed; all others are free to move.
 * Runs at most `maxIter` passes and stops early once no movement is needed.
 */
function separateOverlaps(
  raw: Map<string, { x: number; y: number }>,
  sizes: Map<string, CardSize>,
  pinnedId: string,
  maxIter = 200,
): Map<string, { x: number; y: number }> {
  const pos = new Map(Array.from(raw.entries()).map(([k, v]) => [k, { x: v.x, y: v.y }]))
  const ids = Array.from(pos.keys())

  const hw = (id: string): number => (sizes.get(id)?.w ?? FALLBACK_W) / 2
  const hh = (id: string): number => (sizes.get(id)?.h ?? FALLBACK_H) / 2

  for (let iter = 0; iter < maxIter; iter++) {
    let anyMoved = false
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const ai = ids[i]
        const aj = ids[j]
        const pi = pos.get(ai)!
        const pj = pos.get(aj)!
        const dx = pj.x - pi.x
        const dy = pj.y - pi.y
        const minX = hw(ai) + hw(aj) + CARD_GAP
        const minY = hh(ai) + hh(aj) + CARD_GAP
        const overlapX = minX - Math.abs(dx)
        const overlapY = minY - Math.abs(dy)
        if (overlapX > 0 && overlapY > 0) {
          let pushX = 0
          let pushY = 0
          if (overlapX <= overlapY) {
            pushX = (overlapX / 2 + 0.5) * (dx >= 0 ? 1 : -1)
            if (dx === 0) pushX = overlapX / 2 + 0.5
          } else {
            pushY = (overlapY / 2 + 0.5) * (dy >= 0 ? 1 : -1)
            if (dy === 0) pushY = overlapY / 2 + 0.5
          }
          if (ai === pinnedId) {
            pj.x += pushX * 2
            pj.y += pushY * 2
          } else if (aj === pinnedId) {
            pi.x -= pushX * 2
            pi.y -= pushY * 2
          } else {
            pi.x -= pushX
            pi.y -= pushY
            pj.x += pushX
            pj.y += pushY
          }
          anyMoved = true
        }
      }
    }
    if (!anyMoved) break
  }
  return pos
}

function clipToCard(
  cx: number, cy: number,
  tx: number, ty: number,
  w: number, h: number,
): { x: number; y: number } {
  const dx = tx - cx
  const dy = ty - cy
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return { x: cx, y: cy }
  const ux = dx / len
  const uy = dy / len
  const tByX = ux !== 0 ? (w / 2) / Math.abs(ux) : Infinity
  const tByY = uy !== 0 ? (h / 2) / Math.abs(uy) : Infinity
  const t = Math.min(tByX, tByY)
  return { x: cx + ux * t, y: cy + uy * t }
}

// ------------------------------------------------------------------
// Markdown renderer (singleton)
// ------------------------------------------------------------------
const md = new MarkdownIt('default', { breaks: true, linkify: false, html: false })

function renderMarkdown(src: string): string {
  return DOMPurify.sanitize(md.render(src), { USE_PROFILES: { html: true }, FORBID_TAGS: ['script', 'style'] })
}

// ------------------------------------------------------------------
// Card component
// ------------------------------------------------------------------
interface NoteCardProps {
  id: string
  isCurrent: boolean
  /** World-space centre position */
  pos: { x: number; y: number }
  dark: boolean
  /** Called on mousedown — parent decides click vs drag */
  onCardMouseDown: (id: string, e: React.MouseEvent) => void
  /** Reports actual rendered dimensions via ResizeObserver */
  onSize: (id: string, size: CardSize) => void
  /** Reports fetched note data to parent (used for SVG export) */
  onData: (id: string, note: NoteData) => void
  /** Increment to force re-fetch; parent must clear the cache entry first */
  forceRefresh: number
}

const NoteCard: React.FC<NoteCardProps> = ({ id, isCurrent, pos, dark, onCardMouseDown, onSize, onData, forceRefresh }) => {
  const cardRef = useRef<HTMLDivElement>(null)
  const [note, setNote] = useState<NoteData | null>(null)

  // Uses module-level cache to avoid re-fetching on remount.
  // When forceRefresh increments, the parent has already deleted the cache entry.
  useEffect(() => {
    let cancelled = false
    fetchNoteCached(id)
      .then((n) => {
        if (!cancelled) {
          setNote(n)
          onData(id, n)
        }
      })
      .catch(() => {
        if (!cancelled) setNote(null)
      })
    return () => {
      cancelled = true
    }
  }, [id, onData, forceRefresh])

  const html = useMemo(() => {
    if (!note?.content) return ''
    return renderMarkdown(note.content)
  }, [note?.content])

  const title = note?.metadata?.title || id

  // Report actual rendered size whenever dimensions change
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          onSize(id, { w: Math.ceil(width), h: Math.ceil(height) })
        }
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [id, onSize])

  const cardBg = isCurrent ? (dark ? '#1a3a6e' : '#dbeafe') : (dark ? '#1e1e32' : '#ffffff')
  const cardBorder = isCurrent ? '#3b82f6' : (dark ? '#3a3a5c' : '#dee2e6')
  const headerBg = isCurrent ? (dark ? '#1d4ed8' : '#3b82f6') : (dark ? '#252540' : '#f8f9fa')
  const titleColor = isCurrent ? '#ffffff' : (dark ? '#e9ecef' : '#212529')
  const bodyColor = dark ? '#c9d1d9' : '#24292f'

  return (
    <div
      ref={cardRef}
      data-card="true"
      onMouseDown={(e) => { e.stopPropagation(); onCardMouseDown(id, e) }}
      style={{
        position: 'absolute',
        // Centered on pos via CSS transform — no need to know size upfront
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, -50%)',
        // No fixed width — card expands to fit content (images, wide tables, etc.)
        width: 'max-content',
        minWidth: 240,
        background: cardBg,
        border: `${isCurrent ? 2 : 1}px solid ${cardBorder}`,
        borderRadius: 10,
        boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.12)',
        overflow: 'hidden',
        cursor: 'grab',
        userSelect: 'none',
      }}>
      {/* Header */}
      <div
        style={{
          height: HEADER_H,
          background: headerBg,
          borderBottom: `1px solid ${cardBorder}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          gap: 6,
          flexShrink: 0,
        }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: titleColor,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            fontFamily: 'system-ui, sans-serif',
          }}>
          {title}
        </span>
        {isCurrent && (
          <span
            style={{
              fontSize: 9,
              background: 'rgba(255,255,255,0.25)',
              color: '#fff',
              borderRadius: 4,
              padding: '1px 5px',
              flexShrink: 0,
              fontFamily: 'system-ui, sans-serif',
            }}>
            current
          </span>
        )}
      </div>
      {/* Body — auto-height, no overflow hidden */}
      <div
        style={{
          padding: '8px 10px',
          fontSize: 11,
          lineHeight: 1.6,
          color: bodyColor,
          fontFamily: 'system-ui, sans-serif',
          pointerEvents: 'none',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

// ------------------------------------------------------------------
// Graph data types
// ------------------------------------------------------------------
interface RawEdge {
  id: string
  source: string
  target: string
  type: 'uni' | 'bid'
}

interface NodeItem {
  id: string
  isCurrent: boolean
}

type GraphMode = 'direct' | 'indirect'

interface EdgeSeg {
  key: string
  /** SVG path data — quadratic Bézier arc */
  d: string
  color: string
  markerEnd: string
}

// ------------------------------------------------------------------
// Main view
// ------------------------------------------------------------------
export const NoteGraphView: React.FC = () => {
  const noteAlias = useApplicationState((state) => state.noteDetails?.primaryAlias ?? '')
  const dark = useDarkModeState()
  const router = useRouter()

  const containerRef = useRef<HTMLDivElement>(null)
  const [tx, setTx] = useState(400)
  const [ty, setTy] = useState(300)
  const [scale, setScale] = useState(1)
  const draggingRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })
  /** Per-card positional offsets applied on top of the computed layout positions. */
  const [cardOffsets, setCardOffsets] = useState<Map<string, { x: number; y: number }>>(() => new Map())
  /** Tracks which card (if any) is currently being dragged by the user. */
  const draggingCardRef = useRef<{ id: string; lastX: number; lastY: number; moved: number } | null>(null)

  // Actual rendered card sizes reported by ResizeObserver inside NoteCard
  const [cardSizes, setCardSizes] = useState<Map<string, CardSize>>(() => new Map())
  const [graphMode, setGraphMode] = useState<GraphMode>('direct')

  const handleCardSize = useCallback((id: string, size: CardSize) => {
    setCardSizes((prev) => {
      const cur = prev.get(id)
      if (cur?.w === size.w && cur?.h === size.h) return prev
      const next = new Map(prev)
      next.set(id, size)
      return next
    })
  }, [])

  const [graphNodes, setGraphNodes] = useState<NodeItem[]>([])
  const [graphEdges, setGraphEdges] = useState<RawEdge[]>([])
  const [loading, setLoading] = useState(true)
  // Increment to trigger a fresh graph fetch (parent clears cache first)
  const [graphRefreshKey, setGraphRefreshKey] = useState(0)
  // Note content data reported by each NoteCard (used for SVG export)
  const [noteDataMap, setNoteDataMap] = useState<Map<string, NoteData>>(() => new Map())
  // Increment to tell all NoteCards to re-fetch (parent clears per-note cache first)
  const [cardRefreshKey, setCardRefreshKey] = useState(0)
  // Single-click focused reading mode
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null)
  const readerRef = useRef<HTMLDivElement>(null)

  // Fetch graph data — direct mode loads one hop; indirect mode expands the full connected component.
  useEffect(() => {
    if (!noteAlias) return
    let cancelled = false
    setLoading(true)
    const run = async (): Promise<void> => {
      try {
        const nodeMap = new Map<string, NodeItem>()
        const edgeMap = new Map<string, RawEdge>()
        const visited = new Set<string>()

        /**
         * Inserts an edge with deduplication logic:
         * - `bid` edges use a canonical sorted key so that A:B:bid and B:A:bid
         *   (returned by different nodes' link lists in indirect mode) are merged.
         * - Two opposing `uni` edges (A→B and B→A) are automatically upgraded to
         *   a single `bid` edge to avoid visually overlapping anti-parallel lines.
         */
        const addEdge = (source: string, target: string, edgeType: 'uni' | 'bid'): void => {
          const [a, b] = [source, target].sort()
          const canonBidKey = `${a}:${b}:bid`
          if (edgeType === 'bid') {
            // Always use canonical key; overwrite any stale uni edges for this pair.
            edgeMap.set(canonBidKey, { id: canonBidKey, source: a, target: b, type: 'bid' })
            edgeMap.delete(`${source}:${target}:uni`)
            edgeMap.delete(`${target}:${source}:uni`)
          } else {
            // Uni edge — skip if a bid edge already covers this pair.
            if (edgeMap.has(canonBidKey)) return
            const reverseKey = `${target}:${source}:uni`
            if (edgeMap.has(reverseKey)) {
              // Opposite uni found → upgrade both to a single bid edge.
              edgeMap.delete(reverseKey)
              edgeMap.set(canonBidKey, { id: canonBidKey, source: a, target: b, type: 'bid' })
            } else {
              edgeMap.set(`${source}:${target}:uni`, { id: `${source}:${target}:uni`, source, target, type: 'uni' })
            }
          }
        }

        const addLinkBatch = (sourceAlias: string, outgoing: NoteLinkInterface[], incoming: NoteLinkInterface[]): void => {
          nodeMap.set(sourceAlias, { id: sourceAlias, isCurrent: sourceAlias === noteAlias })
          for (const link of [...outgoing, ...incoming]) {
            const source = link.source_card_key
            const target = link.target_card_key
            nodeMap.set(source, { id: source, isCurrent: source === noteAlias })
            nodeMap.set(target, { id: target, isCurrent: target === noteAlias })
            addEdge(source, target, link.edge_type)
          }
        }

        if (graphMode === 'direct') {
          const { outgoing, incoming } = await fetchGraphCached(noteAlias)
          addLinkBatch(noteAlias, outgoing, incoming)
        } else {
          let frontier = [noteAlias]
          visited.add(noteAlias)
          while (frontier.length > 0) {
            const batch = Array.from(new Set(frontier))
            frontier = []
            const results = await Promise.all(
              batch.map(async (alias) => {
                try {
                  return { alias, ...(await fetchGraphCached(alias)) }
                } catch {
                  return null
                }
              })
            )
            for (const result of results) {
              if (!result) continue
              addLinkBatch(result.alias, result.outgoing, result.incoming)
              for (const link of [...result.outgoing, ...result.incoming]) {
                for (const alias of [link.source_card_key, link.target_card_key]) {
                  if (!visited.has(alias)) {
                    visited.add(alias)
                    frontier.push(alias)
                  }
                }
              }
            }
          }
        }

        if (cancelled) return
        setGraphNodes(Array.from(nodeMap.values()))
        setGraphEdges(Array.from(edgeMap.values()))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [noteAlias, graphMode, graphRefreshKey])

  // Centre on mount
  useEffect(() => {
    const el = containerRef.current
    if (el) {
      setTx(el.clientWidth / 2)
      setTy(el.clientHeight / 2)
    }
  }, [])

  const { nodes, rawEdges, basePositions } = useMemo(() => {
    if (!noteAlias) return { nodes: [], rawEdges: [], basePositions: new Map<string, { x: number; y: number }>() }

    const nodes = graphNodes.length > 0 ? graphNodes : [{ id: noteAlias, isCurrent: true }]
    const rawEdges = graphEdges
    const basePositions = buildGraphPositions(noteAlias, nodes, rawEdges, graphMode)
    return { nodes, rawEdges, basePositions }
  }, [noteAlias, graphNodes, graphEdges, graphMode])

  // Refined positions: parent-aware radial layout as base, then AABB push-apart.
  // Re-runs whenever cardSizes updates (after each card finishes rendering).
  const positions = useMemo(
    () => separateOverlaps(basePositions, cardSizes, noteAlias),
    [basePositions, cardSizes, noteAlias],
  )

  // Final rendered positions = layout positions + per-card drag offsets.
  const finalPositions = useMemo(() => {
    if (cardOffsets.size === 0) return positions
    const result = new Map(positions)
    for (const [id, offset] of cardOffsets) {
      const base = result.get(id)
      if (base) result.set(id, { x: base.x + offset.x, y: base.y + offset.y })
    }
    return result
  }, [positions, cardOffsets])

  // ── Events ──────────────────────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()

    // Zoom only with Ctrl/Cmd + wheel
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY < 0 ? 1.12 : 0.88
      setScale((s) => Math.min(3, Math.max(0.15, s * factor)))
      return
    }

    // Plain wheel pans the canvas.
    // - deltaY: vertical pan
    // - deltaX: horizontal pan (trackpad / horizontal wheel)
    // - Shift+wheel fallback: treat vertical wheel as horizontal pan
    const unit = e.deltaMode === 1 ? 16 : 1
    const dx = (e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX) * unit
    const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY * unit
    setTx((v) => v - dx)
    setTy((v) => v - dy)
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Card mousedown uses stopPropagation so this only fires on the canvas background.
    draggingRef.current = true
    lastPosRef.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    // Card drag takes priority over canvas pan
    if (draggingCardRef.current) {
      const dc = draggingCardRef.current
      const dx = e.clientX - dc.lastX
      const dy = e.clientY - dc.lastY
      dc.moved += Math.sqrt(dx * dx + dy * dy)
      dc.lastX = e.clientX
      dc.lastY = e.clientY
      // Convert screen delta to world-space delta
      const worldDx = dx / scale
      const worldDy = dy / scale
      setCardOffsets((prev) => {
        const next = new Map(prev)
        const cur = next.get(dc.id) ?? { x: 0, y: 0 }
        next.set(dc.id, { x: cur.x + worldDx, y: cur.y + worldDy })
        return next
      })
      return
    }
    if (!draggingRef.current) return
    setTx((v) => v + e.clientX - lastPosRef.current.x)
    setTy((v) => v + e.clientY - lastPosRef.current.y)
    lastPosRef.current = { x: e.clientX, y: e.clientY }
  }, [scale])

  /** Handles mouseup: small-movement card press → focus; else finalize drag. */
  const onMouseUp = useCallback(() => {
    if (draggingCardRef.current) {
      const dc = draggingCardRef.current
      if (dc.moved < 5) setFocusedCardId(dc.id)
      draggingCardRef.current = null
      return
    }
    draggingRef.current = false
  }, [])

  const stopDrag = useCallback(() => {
    draggingCardRef.current = null
    draggingRef.current = false
  }, [])

  const resetView = useCallback(() => {
    const el = containerRef.current
    if (el) { setTx(el.clientWidth / 2); setTy(el.clientHeight / 2) }
    setScale(1)
  }, [])

  // When switching between direct/indirect modes, recentre the canvas so newly
  // revealed cards are not left outside the current viewport.
  useEffect(() => {
    if (loading) return
    setCardOffsets(new Map())
    resetView()
  }, [graphMode, graphNodes.length, graphEdges.length, loading, resetView])

  const handleNodeFocus = useCallback((id: string) => {
    setFocusedCardId(id)
  }, [])

  /** Called when the user presses the mouse button on a card. */
  const handleCardMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    draggingCardRef.current = { id, lastX: e.clientX, lastY: e.clientY, moved: 0 }
    e.preventDefault()
  }, [])

  const handleNoteData = useCallback((id: string, note: NoteData) => {
    setNoteDataMap((prev) => {
      if (prev.get(id) === note) return prev
      const next = new Map(prev)
      next.set(id, note)
      return next
    })
  }, [])

  // Ensure focused note data exists even when graph cards are hidden by reader overlay
  useEffect(() => {
    if (!focusedCardId || noteDataMap.has(focusedCardId)) return
    let cancelled = false
    fetchNoteCached(focusedCardId)
      .then((n) => {
        if (cancelled) return
        setNoteDataMap((prev) => {
          const next = new Map(prev)
          next.set(focusedCardId, n)
          return next
        })
      })
      .catch(() => {
        // ignore
      })
    return () => {
      cancelled = true
    }
  }, [focusedCardId, noteDataMap])

  const focusedNote = focusedCardId ? (noteDataMap.get(focusedCardId) ?? null) : null
  const focusedTitle = focusedCardId ? (focusedNote?.metadata?.title || focusedCardId) : ''
  const focusedHtml = useMemo(() => {
    if (!focusedNote?.content) return ''
    return renderMarkdown(focusedNote.content)
  }, [focusedNote?.content])

  // Reader wheel behavior: vertical + horizontal pan for full-content reading
  const onReaderWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = readerRef.current
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    const unit = e.deltaMode === 1 ? 16 : 1
    const dx = (e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX) * unit
    const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY * unit
    el.scrollLeft += dx
    el.scrollTop += dy
  }, [])

  // Clears module-level caches and forces a full re-fetch of all graph data
  const handleRefresh = useCallback(() => {
    graphLinksCache.delete(noteAlias)
    nodes.forEach((n) => notePromiseCache.delete(n.id))
    setNoteDataMap(new Map())
    setCardOffsets(new Map())
    setGraphRefreshKey((k) => k + 1)
    setCardRefreshKey((k) => k + 1)
  }, [noteAlias, nodes])

  // Build and download a standalone SVG representing the current graph.
  // Card bodies are embedded as <foreignObject> HTML so they render exactly as
  // they appear in the browser — no more raw-markdown artefacts.
  const handleExportSvg = useCallback(() => {
    if (nodes.length === 0) return
    const PAD = 60
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    nodes.forEach(({ id }) => {
      const pos = finalPositions.get(id)
      if (!pos) return
      const w = cardSizes.get(id)?.w ?? FALLBACK_W
      const h = cardSizes.get(id)?.h ?? FALLBACK_H
      minX = Math.min(minX, pos.x - w / 2)
      minY = Math.min(minY, pos.y - h / 2)
      maxX = Math.max(maxX, pos.x + w / 2)
      maxY = Math.max(maxY, pos.y + h / 2)
    })
    if (minX === Infinity) return
    const W = maxX - minX + PAD * 2
    const H = maxY - minY + PAD * 2
    const offX = -minX + PAD
    const offY = -minY + PAD
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const bgColor = dark ? '#0d1117' : '#f0f2f5'
    const uniColor = '#9ca3af'
    const bidColor = '#0dcaf0'
    const CURVE = 48
    const mkBez = (x1: number, y1: number, x2: number, y2: number, c: number): string => {
      const dx = x2 - x1; const dy = y2 - y1
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 1) return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`
      const qx = (x1 + x2) / 2 + (-dy / len) * c
      const qy = (y1 + y2) / 2 + (dx / len) * c
      return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`
    }
    const lines: string[] = [
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" width="${W.toFixed()}" height="${H.toFixed()}">`,
      `<defs>`,
      `  <marker id="uni" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="${uniColor}"/></marker>`,
      `  <marker id="bid" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="${bidColor}"/></marker>`,
      `</defs>`,
      `<rect width="${W.toFixed()}" height="${H.toFixed()}" fill="${bgColor}"/>`,
    ]
    // Edges first (behind cards), using same Bézier arcs as the live view
    rawEdges.forEach((e) => {
      const sp = finalPositions.get(e.source)
      const tp = finalPositions.get(e.target)
      if (!sp || !tp) return
      const sw = cardSizes.get(e.source)?.w ?? FALLBACK_W
      const sh = cardSizes.get(e.source)?.h ?? FALLBACK_H
      const tw = cardSizes.get(e.target)?.w ?? FALLBACK_W
      const th = cardSizes.get(e.target)?.h ?? FALLBACK_H
      const fW = clipToCard(sp.x, sp.y, tp.x, tp.y, sw, sh)
      const tW = clipToCard(tp.x, tp.y, sp.x, sp.y, tw, th)
      const x1 = fW.x + offX, y1 = fW.y + offY
      const x2 = tW.x + offX, y2 = tW.y + offY
      if (e.type === 'bid') {
        lines.push(
          `<path d="${mkBez(x1, y1, x2, y2, +CURVE)}" stroke="${bidColor}" stroke-width="1.5" fill="none" marker-end="url(#bid)"/>`,
          `<path d="${mkBez(x2, y2, x1, y1, +CURVE)}" stroke="${bidColor}" stroke-width="1.5" fill="none" marker-end="url(#bid)"/>`,
        )
      } else {
        lines.push(`<path d="${mkBez(x1, y1, x2, y2, CURVE)}" stroke="${uniColor}" stroke-width="1.5" fill="none" marker-end="url(#uni)"/>`)
      }
    })
    // SVG requires valid XML. renderMarkdown produces HTML (e.g. <br> void elements),
    // which is NOT valid XML and will break the SVG parser if injected as raw string.
    // We use XMLSerializer to convert the rendered HTML DOM to proper XHTML (all void
    // elements self-closed, entities encoded) so the resulting SVG file is valid XML.
    const htmlToXhtml = (html: string, style: string): string => {
      if (!html) return `<div xmlns="http://www.w3.org/1999/xhtml" style="${style}"/>`
      const tmp = document.createElement('div')
      tmp.setAttribute('style', style)
      tmp.innerHTML = html
      // serializeToString produces proper XHTML: self-closes void elements (<br/> etc.),
      // adds the xmlns declaration, and encodes special characters.
      return new XMLSerializer().serializeToString(tmp)
    }

    // Cards on top of edges
    nodes.forEach(({ id, isCurrent }) => {
      const pos = finalPositions.get(id)
      if (!pos) return
      const size = cardSizes.get(id) ?? { w: FALLBACK_W, h: FALLBACK_H }
      const nd = noteDataMap.get(id)
      const title = nd?.metadata?.title || id
      const { w, h } = size
      const cx = pos.x + offX
      const cy = pos.y + offY
      const rx = (cx - w / 2).toFixed(1)
      const ry = (cy - h / 2).toFixed(1)
      const cardBg = isCurrent ? (dark ? '#1a3a6e' : '#dbeafe') : (dark ? '#1e1e32' : '#ffffff')
      const cardBorder = isCurrent ? '#3b82f6' : (dark ? '#3a3a5c' : '#dee2e6')
      const headerBg = isCurrent ? (dark ? '#1d4ed8' : '#3b82f6') : (dark ? '#252540' : '#f8f9fa')
      const titleColor = isCurrent ? '#ffffff' : (dark ? '#e9ecef' : '#212529')
      const bodyColor = dark ? '#c9d1d9' : '#24292f'
      const bodyH = Math.max(0, h - HEADER_H)
      const renderedHtml = nd ? renderMarkdown(nd.content) : ''
      const bodyStyle = `padding:8px 10px;font-size:11px;line-height:1.6;font-family:system-ui,sans-serif;color:${bodyColor};overflow:hidden;height:100%;box-sizing:border-box;`
      lines.push(
        `<rect x="${rx}" y="${ry}" width="${w}" height="${h}" rx="10" fill="${cardBg}" stroke="${cardBorder}" stroke-width="${isCurrent ? 2 : 1}"/>`,
        `<rect x="${rx}" y="${ry}" width="${w}" height="${HEADER_H}" rx="10" fill="${headerBg}"/>`,
        `<rect x="${rx}" y="${(cy - h / 2 + HEADER_H / 2).toFixed(1)}" width="${w}" height="${(HEADER_H / 2).toFixed(1)}" fill="${headerBg}"/>`,
        `<text x="${(cx - w / 2 + 10).toFixed(1)}" y="${(cy - h / 2 + 24).toFixed(1)}" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="${titleColor}">${esc(title.substring(0, 60))}</text>`,
        `<foreignObject x="${rx}" y="${(cy - h / 2 + HEADER_H).toFixed(1)}" width="${w}" height="${bodyH.toFixed(1)}">`,
        htmlToXhtml(renderedHtml, bodyStyle),
        `</foreignObject>`,
      )
    })
    lines.push(`</svg>`)
    const blob = new Blob([lines.join('\n')], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${noteAlias || 'graph'}-note-graph.svg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [nodes, rawEdges, finalPositions, cardSizes, noteDataMap, dark, noteAlias])

  // ── Edge segments in screen space ────────────────────────────────
  // World coords → screen: screenX = tx + worldX * scale.
  // Edges are rendered as quadratic Bézier arcs so they bow away from the
  // straight-line path between cards, preventing them from visually cutting
  // through unrelated cards and making the topology easier to read.
  // Bidirectional edges use two arcs that curve to opposite sides.
  const edgeSegs = useMemo<EdgeSeg[]>(() => {
    /**
     * Build a quadratic Bézier SVG path from (x1,y1) to (x2,y2).
     * The control point is at the midpoint, offset perpendicularly by
     * `curvature` pixels (positive = left of the A→B direction).
     */
    const makeBezier = (
      x1: number, y1: number,
      x2: number, y2: number,
      curvature: number,
    ): string => {
      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 1) return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`
      // Left-perpendicular unit vector × curvature → control-point offset
      const px = (-dy / len) * curvature
      const py = (dx / len) * curvature
      const cx = (x1 + x2) / 2 + px
      const cy = (y1 + y2) / 2 + py
      return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`
    }

    // Fixed perpendicular offset in screen pixels; stays readable at all zoom levels.
    const CURVE = 48

    return rawEdges.flatMap((e) => {
      const sp = finalPositions.get(e.source)
      const tp = finalPositions.get(e.target)
      if (!sp || !tp) return []

      const sw = cardSizes.get(e.source)?.w ?? FALLBACK_W
      const sh = cardSizes.get(e.source)?.h ?? FALLBACK_H
      const tw = cardSizes.get(e.target)?.w ?? FALLBACK_W
      const th = cardSizes.get(e.target)?.h ?? FALLBACK_H

      // Clip endpoints to card boundaries (world space)
      const fW = clipToCard(sp.x, sp.y, tp.x, tp.y, sw, sh)
      const tW = clipToCard(tp.x, tp.y, sp.x, sp.y, tw, th)

      // Convert to screen space
      const fx = tx + fW.x * scale
      const fy = ty + fW.y * scale
      const ex = tx + tW.x * scale
      const ey = ty + tW.y * scale

      if (e.type === 'bid') {
        // Two arcs on opposite sides: forward curves left, backward curves left
        // of its own direction (= right of the A→B axis) — they never overlap.
        return [
          { key: e.id + '_fwd', d: makeBezier(fx, fy, ex, ey, +CURVE), color: '#0dcaf0', markerEnd: 'url(#ngv-bid)' },
          { key: e.id + '_bwd', d: makeBezier(ex, ey, fx, fy, +CURVE), color: '#0dcaf0', markerEnd: 'url(#ngv-bid)' },
        ]
      }
      return [{ key: e.id, d: makeBezier(fx, fy, ex, ey, CURVE), color: '#9ca3af', markerEnd: 'url(#ngv-uni)' }]
    })
  }, [rawEdges, finalPositions, cardSizes, tx, ty, scale])

  // ── Colours ─────────────────────────────────────────────────────
  const bg = dark ? '#0d1117' : '#f0f2f5'
  const subColor = dark ? '#8888a8' : '#6c757d'
  const btnBg = dark ? '#21213a' : '#ffffff'
  const btnBorder = dark ? '#3a3a5c' : '#dee2e6'
  const btnColor = dark ? '#e9ecef' : '#212529'

  const btnStyle: React.CSSProperties = {
    background: btnBg, color: btnColor, border: `1px solid ${btnBorder}`,
    borderRadius: 6, width: 32, height: 32, display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
  }

  const pillStyle: React.CSSProperties = {
    background: btnBg,
    color: btnColor,
    border: `1px solid ${btnBorder}`,
    borderRadius: 999,
    height: 32,
    padding: '0 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
    fontSize: 12,
    fontWeight: 600,
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: bg,
        cursor: focusedCardId ? 'default' : draggingRef.current ? 'grabbing' : 'grab',
      }}
      onWheel={focusedCardId ? undefined : onWheel}
      onMouseDown={focusedCardId ? undefined : onMouseDown}
      onMouseMove={focusedCardId ? undefined : onMouseMove}
      onMouseUp={focusedCardId ? undefined : onMouseUp}
      onMouseLeave={focusedCardId ? undefined : stopDrag}>

      {/* Graph mode switch */}
      <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', gap: 8, zIndex: 20 }}>
        <button
          style={{ ...pillStyle, background: graphMode === 'direct' ? btnBorder : btnBg }}
          title={'Show only direct links'}
          onClick={() => setGraphMode('direct')}>
          Direct
        </button>
        <button
          style={{ ...pillStyle, background: graphMode === 'indirect' ? btnBorder : btnBg }}
          title={'Show the full connected graph'}
          onClick={() => setGraphMode('indirect')}>
          Indirect
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: subColor }}>
          Loading graph…
        </div>
      )}

      {/* Empty state */}
      {!loading && nodes.length <= 1 && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none', color: subColor }}>
          <div style={{ fontSize: 16, marginBottom: 6 }}>No connections yet</div>
          <div style={{ fontSize: 12 }}>Use the Note Graph sidebar to link notes together.</div>
        </div>
      )}

      {/* ── SVG edge overlay — screen space, BELOW cards ─────────────────────
           Lives at container level (not inside the transformed world div) so
           it is never clipped by any overflow on a parent element. Edges are
           computed in world space and converted to screen coords in edgeSegs. */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1,
        }}>
        <defs>
          <marker id={'ngv-uni'} markerWidth={9} markerHeight={7} refX={9} refY={3.5} orient={'auto'}>
            <path d={'M0,0 L0,7 L9,3.5 z'} fill={'#9ca3af'} />
          </marker>
          <marker id={'ngv-bid'} markerWidth={9} markerHeight={7} refX={9} refY={3.5} orient={'auto'}>
            <path d={'M0,0 L0,7 L9,3.5 z'} fill={'#0dcaf0'} />
          </marker>
        </defs>
        {edgeSegs.map((seg) => (
          <path
            key={seg.key}
            d={seg.d}
            stroke={seg.color}
            strokeWidth={1.5}
            fill={'none'}
            markerEnd={seg.markerEnd}
          />
        ))}
      </svg>

      {/* ── World transform — cards only ─────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '0 0',
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          zIndex: 2,
        }}>
        {nodes.map((node) => {
          const pos = finalPositions.get(node.id)
          if (!pos) return null
          return (
            <NoteCard
              key={node.id}
              id={node.id}
              isCurrent={node.isCurrent}
              pos={pos}
              dark={dark}
              onCardMouseDown={handleCardMouseDown}
              onSize={handleCardSize}
              onData={handleNoteData}
              forceRefresh={cardRefreshKey}
            />
          )
        })}
      </div>

      {/* Focused reading mode (single-click on card) */}
      {focusedCardId && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 30,
            background: dark ? 'rgba(13,17,23,0.95)' : 'rgba(240,242,245,0.96)',
            display: 'flex',
            flexDirection: 'column',
          }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderBottom: `1px solid ${btnBorder}`,
              background: dark ? '#161b22' : '#ffffff',
            }}>
            <button
              style={{ ...btnStyle, width: 'auto', padding: '0 10px' }}
              onClick={() => setFocusedCardId(null)}>
              Back to Graph
            </button>
            <button
              style={{ ...btnStyle, width: 'auto', padding: '0 10px' }}
              onClick={() => {
                if (!focusedCardId) return
                void router.push(`/n/${focusedCardId}`)
              }}>
              Open Note
            </button>
            <div
              style={{
                marginLeft: 8,
                fontWeight: 700,
                color: btnColor,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}>
              {focusedTitle}
            </div>
          </div>
          <div
            ref={readerRef}
            onWheel={onReaderWheel}
            style={{
              flex: 1,
              overflow: 'auto',
              padding: 24,
              color: dark ? '#c9d1d9' : '#24292f',
              fontFamily: 'system-ui, sans-serif',
            }}>
            {focusedNote ? (
              <div
                style={{
                  width: 'max-content',
                  minWidth: '100%',
                  lineHeight: 1.7,
                }}
                dangerouslySetInnerHTML={{ __html: focusedHtml }}
              />
            ) : (
              <div style={{ color: subColor }}>Loading note content…</div>
            )}
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button style={btnStyle} title={'Zoom in'} onClick={() => setScale((s) => Math.min(3, s * 1.2))}>
          <IconZoomIn size={14} />
        </button>
        <button style={btnStyle} title={'Zoom out'} onClick={() => setScale((s) => Math.max(0.15, s * 0.8))}>
          <IconZoomOut size={14} />
        </button>
        <button style={btnStyle} title={'Reset view'} onClick={resetView}>
          <IconReset size={14} />
        </button>
        <button style={btnStyle} title={'Refresh graph data'} onClick={handleRefresh}>
          <IconRefresh size={14} />
        </button>
        <button style={btnStyle} title={'Export as SVG'} onClick={handleExportSvg}>
          <IconDownload size={14} />
        </button>
      </div>

      {/* Hint */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, fontSize: 11, color: subColor, pointerEvents: 'none' }}>
        Click card to focus read · Ctrl/Cmd + Scroll to zoom · Scroll to pan · Drag to pan
      </div>
    </div>
  )
}
