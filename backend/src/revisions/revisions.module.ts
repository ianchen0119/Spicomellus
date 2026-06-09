/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Module } from '@nestjs/common';

import { AliasModule } from '../alias/alias.module';
import { NoteLinkService } from './note-link.service';
import { RevisionsService } from './revisions.service';

@Module({
  imports: [AliasModule],
  providers: [RevisionsService, NoteLinkService],
  exports: [RevisionsService, NoteLinkService],
})
export class RevisionsModule {}
