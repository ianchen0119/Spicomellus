/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import {
  FieldNameOAuthRefreshToken,
  OAuthRefreshToken,
  TableOAuthRefreshToken,
} from '@hedgedoc/database';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Knex } from 'knex';
import { InjectConnection } from 'nest-knexjs';
import { randomBytes } from 'node:crypto';

import oauthConfig from '../config/oauth.config';
import { bufferToBase64Url, checkTokenEquality, hashApiToken } from '../utils/password';

export const REFRESH_TOKEN_PREFIX = 'hdrt';

@Injectable()
export class OAuthRefreshTokenService {
  constructor(
    @InjectConnection()
    private readonly knex: Knex,
    @Inject(oauthConfig.KEY)
    private readonly oauthCfg: ConfigType<typeof oauthConfig>,
  ) {}

  async createRefreshToken(userId: number, clientId: string, scope: string): Promise<string> {
    const secret = bufferToBase64Url(randomBytes(64));
    const keyId = bufferToBase64Url(randomBytes(8));
    const fullToken = `${REFRESH_TOKEN_PREFIX}.${keyId}.${secret}`;

    await this.knex<OAuthRefreshToken>(TableOAuthRefreshToken).insert({
      [FieldNameOAuthRefreshToken.id]: keyId,
      [FieldNameOAuthRefreshToken.userId]: userId,
      [FieldNameOAuthRefreshToken.clientId]: clientId,
      [FieldNameOAuthRefreshToken.secretHash]: hashApiToken(secret),
      [FieldNameOAuthRefreshToken.scope]: scope,
      [FieldNameOAuthRefreshToken.expiresAt]: this.knex.raw(
        `NOW() + INTERVAL '${this.oauthCfg.refreshTokenTtl} seconds'`,
      ) as unknown as string,
      [FieldNameOAuthRefreshToken.revoked]: false,
      [FieldNameOAuthRefreshToken.replacedBy]: null,
      [FieldNameOAuthRefreshToken.createdAt]: this.knex.fn.now(),
    });

    return fullToken;
  }

  async rotateRefreshToken(token: string, clientId: string): Promise<{ userId: number; scope: string; refreshToken: string }> {
    const [prefix, keyId, secret, ...rest] = token.split('.');
    if (prefix !== REFRESH_TOKEN_PREFIX || !keyId || !secret || rest.length > 0) {
      throw new UnauthorizedException('Invalid refresh token format');
    }

    return await this.knex.transaction(async (trx) => {
      const row = await trx<OAuthRefreshToken>(TableOAuthRefreshToken)
        .where(FieldNameOAuthRefreshToken.id, keyId)
        .first();

      if (!row || row[FieldNameOAuthRefreshToken.revoked]) {
        throw new UnauthorizedException('Refresh token is invalid');
      }
      if (row[FieldNameOAuthRefreshToken.clientId] !== clientId) {
        throw new UnauthorizedException('Refresh token client mismatch');
      }
      const expiresAt = new Date(row[FieldNameOAuthRefreshToken.expiresAt]);
      if (expiresAt.getTime() < Date.now()) {
        throw new UnauthorizedException('Refresh token expired');
      }

      const isValidSecret = await checkTokenEquality(secret, row[FieldNameOAuthRefreshToken.secretHash]);
      if (!isValidSecret) {
        throw new UnauthorizedException('Refresh token is invalid');
      }

      const newSecret = bufferToBase64Url(randomBytes(64));
      const newKeyId = bufferToBase64Url(randomBytes(8));
      const newFullToken = `${REFRESH_TOKEN_PREFIX}.${newKeyId}.${newSecret}`;

      await trx<OAuthRefreshToken>(TableOAuthRefreshToken).insert({
        [FieldNameOAuthRefreshToken.id]: newKeyId,
        [FieldNameOAuthRefreshToken.userId]: row[FieldNameOAuthRefreshToken.userId],
        [FieldNameOAuthRefreshToken.clientId]: row[FieldNameOAuthRefreshToken.clientId],
        [FieldNameOAuthRefreshToken.secretHash]: hashApiToken(newSecret),
        [FieldNameOAuthRefreshToken.scope]: row[FieldNameOAuthRefreshToken.scope],
        [FieldNameOAuthRefreshToken.expiresAt]: this.knex.raw(
          `NOW() + INTERVAL '${this.oauthCfg.refreshTokenTtl} seconds'`,
        ) as unknown as string,
        [FieldNameOAuthRefreshToken.revoked]: false,
        [FieldNameOAuthRefreshToken.replacedBy]: null,
        [FieldNameOAuthRefreshToken.createdAt]: this.knex.fn.now(),
      });

      await trx<OAuthRefreshToken>(TableOAuthRefreshToken)
        .where(FieldNameOAuthRefreshToken.id, keyId)
        .update({
          [FieldNameOAuthRefreshToken.revoked]: true,
          [FieldNameOAuthRefreshToken.replacedBy]: newKeyId,
        });

      return {
        userId: row[FieldNameOAuthRefreshToken.userId],
        scope: row[FieldNameOAuthRefreshToken.scope],
        refreshToken: newFullToken,
      };
    });
  }
}
