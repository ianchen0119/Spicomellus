/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import {
  FieldNameOAuthClient,
  OAuthClient,
  TableOAuthClient,
} from '@hedgedoc/database';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Knex } from 'knex';
import { InjectConnection } from 'nest-knexjs';
import { randomBytes } from 'node:crypto';

import { bufferToBase64Url, hashApiToken } from '../utils/password';
import { checkTokenEquality } from '../utils/password';

export interface RegisteredOAuthClient {
  clientId: string
  clientSecret?: string
  redirectUris: string[]
  grantTypes: string[]
  scope: string
  tokenEndpointAuthMethod: 'none' | 'client_secret_post'
}

@Injectable()
export class OAuthClientService {
  constructor(
    @InjectConnection()
    private readonly knex: Knex,
  ) {}

  async registerClient(
    name: string,
    redirectUris: string[],
    scope = '',
    tokenEndpointAuthMethod: 'none' | 'client_secret_post' = 'none',
  ): Promise<RegisteredOAuthClient> {
    const clientId = bufferToBase64Url(randomBytes(12));
    const clientSecret =
      tokenEndpointAuthMethod === 'client_secret_post' ? bufferToBase64Url(randomBytes(32)) : undefined;
    const grantTypes = ['authorization_code', 'refresh_token'];

    await this.knex<OAuthClient>(TableOAuthClient).insert({
      [FieldNameOAuthClient.id]: clientId,
      [FieldNameOAuthClient.secretHash]: clientSecret ? hashApiToken(clientSecret) : null,
      [FieldNameOAuthClient.name]: name,
      [FieldNameOAuthClient.redirectUris]: JSON.stringify(redirectUris),
      [FieldNameOAuthClient.grantTypes]: JSON.stringify(grantTypes),
      [FieldNameOAuthClient.scope]: scope,
      [FieldNameOAuthClient.createdAt]: this.knex.fn.now(),
    });

    return { clientId, clientSecret, redirectUris, grantTypes, scope, tokenEndpointAuthMethod };
  }

  async getClient(clientId: string): Promise<OAuthClient | null> {
    const row = await this.knex<OAuthClient>(TableOAuthClient)
      .where(FieldNameOAuthClient.id, clientId)
      .first();
    return row ?? null;
  }

  async ensureRedirectUriAllowed(clientId: string, redirectUri: string): Promise<void> {
    const client = await this.getClient(clientId);
    if (!client) {
      throw new UnauthorizedException('Unknown OAuth client');
    }
    const allowed = JSON.parse(client[FieldNameOAuthClient.redirectUris]) as string[];
    if (!allowed.includes(redirectUri)) {
      throw new UnauthorizedException('redirect_uri not allowed for this client');
    }
  }

  async validateClient(clientId: string, clientSecret?: string): Promise<void> {
    const client = await this.getClient(clientId);
    if (!client) {
      throw new UnauthorizedException('Unknown OAuth client');
    }

    const secretHash = client[FieldNameOAuthClient.secretHash];
    if (!secretHash) {
      return;
    }

    if (!clientSecret) {
      throw new UnauthorizedException('client_secret is required');
    }

    const isValid = await checkTokenEquality(clientSecret, secretHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid client credentials');
    }
  }
}
