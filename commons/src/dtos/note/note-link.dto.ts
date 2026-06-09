/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { z } from 'zod'

export const CreateNoteLinkSchema = z
  .object({
    targetAlias: z.string().describe('The primary alias of the target note'),
    edgeType: z.enum(['uni', 'bid']).describe('The relation type: uni = one-way, bid = bidirectional'),
  })
  .describe('DTO for creating a note-to-note link')

export type CreateNoteLinkInterface = z.infer<typeof CreateNoteLinkSchema>
