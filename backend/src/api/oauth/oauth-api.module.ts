/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Module } from '@nestjs/common';

import { OAuthModule } from '../../oauth/oauth.module';
import { OAuthController } from './oauth.controller';

@Module({
  imports: [OAuthModule],
  controllers: [OAuthController],
})
export class OAuthApiModule {}
