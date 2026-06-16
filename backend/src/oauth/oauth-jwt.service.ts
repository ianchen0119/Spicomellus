/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';

import appConfig from '../config/app.config';
import oauthConfig from '../config/oauth.config';

export interface AccessTokenPayload {
  sub: string
  scope: string
  aud: string
  iss: string
  iat: number
  exp: number
}

@Injectable()
export class OAuthJwtService {
  private readonly secretKey: Uint8Array;

  constructor(
    @Inject(appConfig.KEY)
    private readonly appCfg: ConfigType<typeof appConfig>,
    @Inject(oauthConfig.KEY)
    private readonly oauthCfg: ConfigType<typeof oauthConfig>,
  ) {
    this.secretKey = new TextEncoder().encode(this.oauthCfg.jwtSecret);
  }

  async signAccessToken(userId: number, scope: string, audience: string): Promise<string> {
    return await new SignJWT({ scope })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(String(userId))
      .setAudience(audience)
      .setIssuer(this.appCfg.baseUrl)
      .setIssuedAt()
      .setExpirationTime(`${this.oauthCfg.accessTokenTtl}s`)
      .sign(this.secretKey);
  }

  async verifyAccessToken(token: string, expectedAudience: string): Promise<AccessTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secretKey, {
        issuer: this.appCfg.baseUrl,
        audience: expectedAudience,
      });
      if (!payload.sub) {
        throw new UnauthorizedException('Token subject is missing');
      }
      return payload as unknown as AccessTokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
