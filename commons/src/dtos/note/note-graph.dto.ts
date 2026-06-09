/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod'

export const CardGraphNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string()
})

export const CardGraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  edgeType: z.union([z.literal('uni'), z.literal('bid')])
})

export const CardGraphSchema = z.object({
  focusOn: z.string().nullable(),
  cards: z.array(CardGraphNodeSchema),
  edges: z.array(CardGraphEdgeSchema),
  backlinks: z.array(CardGraphNodeSchema)
})

export type CardGraphNodeInterface = z.infer<typeof CardGraphNodeSchema>
export type CardGraphEdgeInterface = z.infer<typeof CardGraphEdgeSchema>
export type CardGraphInterface = z.infer<typeof CardGraphSchema>