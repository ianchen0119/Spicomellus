/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import {
  FieldNameOAuthAuthCode,
  OAuthAuthCode,
  TableOAuthAuthCode,
} from '@hedgedoc/database';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Knex } from 'knex';
import { InjectConnection } from 'nest-knexjs';
import { createHash, randomBytes } from 'node:crypto';

import oauthConfig from '../config/oauth.config';
import { bufferToBase64Url } from '../utils/password';

@Injectable()
export class OAuthAuthCodeService {
  constructor(
    @InjectConnection()
    private readonly knex: Knex,
    @Inject(oauthConfig.KEY)
    private readonly oauthCfg: ConfigType<typeof oauthConfig>,
  ) {}

  async createCode(
    userId: number,
    clientId: string,
    redirectUri: string,
    scope: string,
    codeChallenge: string,
    codeChallengeMethod = 'S256',
  ): Promise<string> {
    const code = bufferToBase64Url(randomBytes(32));
    await this.knex<OAuthAuthCode>(TableOAuthAuthCode).insert({
      [FieldNameOAuthAuthCode.id]: code,
      [FieldNameOAuthAuthCode.clientId]: clientId,
      [FieldNameOAuthAuthCode.userId]: userId,
      [FieldNameOAuthAuthCode.redirectUri]: redirectUri,
      [FieldNameOAuthAuthCode.scope]: scope,
      [FieldNameOAuthAuthCode.codeChallenge]: codeChallenge,
      [FieldNameOAuthAuthCode.codeChallengeMethod]: codeChallengeMethod,
      [FieldNameOAuthAuthCode.expiresAt]: this.knex.raw(`NOW() + INTERVAL '${this.oauthCfg.authCodeTtl} seconds'`) as unknown as string,
      [FieldNameOAuthAuthCode.used]: false,
      [FieldNameOAuthAuthCode.createdAt]: this.knex.fn.now(),
    });
    return code;
  }

  async consumeAndValidateCode(
    code: string,
    clientId: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<{ userId: number; scope: string }> {
    return await this.knex.transaction(async (trx) => {
      const row = await trx<OAuthAuthCode>(TableOAuthAuthCode)
        .where(FieldNameOAuthAuthCode.id, code)
        .first();

      if (!row || row[FieldNameOAuthAuthCode.used]) {
        throw new UnauthorizedException('Invalid authorization code');
      }
      if (String(row[FieldNameOAuthAuthCode.clientId]) !== clientId) {
        throw new UnauthorizedException('Authorization code client mismatch');
      }
      if (row[FieldNameOAuthAuthCode.redirectUri] !== redirectUri) {
        throw new UnauthorizedException('Authorization code redirect_uri mismatch');
      }
      const expiresAt = new Date(row[FieldNameOAuthAuthCode.expiresAt]);
      if (expiresAt.getTime() < Date.now()) {
        throw new UnauthorizedException('Authorization code expired');
      }

      const digest = createHash('sha256').update(codeVerifier).digest('base64url');
      const challenge = row[FieldNameOAuthAuthCode.codeChallenge];
      if (digest !== challenge) {
        throw new UnauthorizedException('Invalid PKCE verifier');
      }

      await trx<OAuthAuthCode>(TableOAuthAuthCode)
        .where(FieldNameOAuthAuthCode.id, code)
        .update(FieldNameOAuthAuthCode.used, true);

      return {
        userId: row[FieldNameOAuthAuthCode.userId],
        scope: row[FieldNameOAuthAuthCode.scope],
      };
    });
  }
}
