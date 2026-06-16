/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Global, Module } from '@nestjs/common';

import { OAuthAuthCodeService } from './oauth-auth-code.service';
import { OAuthClientService } from './oauth-client.service';
import { OAuthJwtService } from './oauth-jwt.service';
import { OAuthRefreshTokenService } from './oauth-refresh-token.service';

@Global()
@Module({
  providers: [
    OAuthJwtService,
    OAuthClientService,
    OAuthAuthCodeService,
    OAuthRefreshTokenService,
  ],
  exports: [
    OAuthJwtService,
    OAuthClientService,
    OAuthAuthCodeService,
    OAuthRefreshTokenService,
  ],
})
export class OAuthModule {}
