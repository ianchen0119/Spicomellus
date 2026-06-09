/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

const CreateNoteLinkSchema = z.object({
  targetAlias: z.string(),
  edgeType: z.enum(['uni', 'bid']),
})

export class CreateNoteLinkDto extends createZodDto(CreateNoteLinkSchema) {}
