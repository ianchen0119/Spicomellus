/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Redirect,
  Req,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import appConfig from '../../config/app.config';
import oauthConfig from '../../config/oauth.config';
import { CsrfExempt } from '../utils/decorators/csrf-exempt.decorator';
import { RequestWithSession } from '../utils/request.type';
import { OAuthAuthCodeService } from '../../oauth/oauth-auth-code.service';
import { OAuthClientService } from '../../oauth/oauth-client.service';
import { OAuthJwtService } from '../../oauth/oauth-jwt.service';
import { OAuthRefreshTokenService } from '../../oauth/oauth-refresh-token.service';

@Controller()
export class OAuthController {
  constructor(
    @Inject(appConfig.KEY)
    private readonly appCfg: ConfigType<typeof appConfig>,
    @Inject(oauthConfig.KEY)
    private readonly oauthCfg: ConfigType<typeof oauthConfig>,
    private readonly oauthClientService: OAuthClientService,
    private readonly oauthAuthCodeService: OAuthAuthCodeService,
    private readonly oauthJwtService: OAuthJwtService,
    private readonly oauthRefreshTokenService: OAuthRefreshTokenService,
  ) {}

  @Get('/authorize')
  @Redirect()
  async authorize(
    @Req() request: RequestWithSession,
    @Query('client_id') clientId?: string,
    @Query('redirect_uri') redirectUri?: string,
    @Query('response_type') responseType?: string,
    @Query('scope') scope = '',
    @Query('state') state?: string,
    @Query('code_challenge') codeChallenge?: string,
    @Query('code_challenge_method') codeChallengeMethod?: string,
  ): Promise<{ url: string }> {
    if (!clientId || !redirectUri || !responseType || !state || !codeChallenge) {
      throw new BadRequestException('Missing OAuth authorize parameters');
    }
    if (responseType !== 'code') {
      throw new BadRequestException('Only response_type=code is supported');
    }
    if ((codeChallengeMethod ?? 'S256') !== 'S256') {
      throw new BadRequestException('Only code_challenge_method=S256 is supported');
    }

    if (!request.session?.userId) {
      const authorizeUrl = `${this.appCfg.baseUrl}/api/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256`;
      const q = new URLSearchParams({
        redirectBackTo: authorizeUrl,
      });
      return { url: `/login?${q.toString()}` };
    }

    await this.oauthClientService.ensureRedirectUriAllowed(clientId, redirectUri);
    const code = await this.oauthAuthCodeService.createCode(
      request.session.userId,
      clientId,
      redirectUri,
      scope,
      codeChallenge,
      'S256',
    );

    const cb = new URL(redirectUri);
    cb.searchParams.set('code', code);
    cb.searchParams.set('state', state);
    return { url: cb.toString() };
  }

  @Post('/token')
  @CsrfExempt()
  @HttpCode(200)
  async token(
    @Body('grant_type') grantType?: string,
    @Body('client_id') clientId?: string,
    @Body('client_secret') clientSecret?: string,
    @Body('redirect_uri') redirectUri?: string,
    @Body('code') code?: string,
    @Body('code_verifier') codeVerifier?: string,
    @Body('refresh_token') refreshToken?: string,
    @Body('scope') requestedScope?: string,
  ): Promise<Record<string, unknown>> {
    if (!grantType || !clientId) {
      throw new BadRequestException('grant_type and client_id are required');
    }

    if (grantType === 'authorization_code') {
      if (!code || !redirectUri || !codeVerifier) {
        throw new BadRequestException('code, redirect_uri and code_verifier are required');
      }
      await this.oauthClientService.validateClient(clientId, clientSecret);
      await this.oauthClientService.ensureRedirectUriAllowed(clientId, redirectUri);
      const { userId, scope } = await this.oauthAuthCodeService.consumeAndValidateCode(
        code,
        clientId,
        redirectUri,
        codeVerifier,
      );
      const finalScope = requestedScope ?? scope ?? '';
      const accessToken = await this.oauthJwtService.signAccessToken(userId, finalScope, `${this.appCfg.baseUrl}/mcp`);
      const newRefreshToken = await this.oauthRefreshTokenService.createRefreshToken(userId, clientId, finalScope);
      return {
        token_type: 'Bearer',
        access_token: accessToken,
        expires_in: this.oauthCfg.accessTokenTtl,
        refresh_token: newRefreshToken,
        scope: finalScope,
      };
    }

    if (grantType === 'refresh_token') {
      if (!refreshToken) {
        throw new BadRequestException('refresh_token is required');
      }
      await this.oauthClientService.validateClient(clientId, clientSecret);
      const rotated = await this.oauthRefreshTokenService.rotateRefreshToken(refreshToken, clientId);
      const accessToken = await this.oauthJwtService.signAccessToken(
        rotated.userId,
        rotated.scope,
        `${this.appCfg.baseUrl}/mcp`,
      );
      return {
        token_type: 'Bearer',
        access_token: accessToken,
        expires_in: this.oauthCfg.accessTokenTtl,
        refresh_token: rotated.refreshToken,
        scope: rotated.scope,
      };
    }

    throw new BadRequestException('Unsupported grant_type');
  }

  @Post('/register')
  @CsrfExempt()
  @HttpCode(201)
  async register(
    @Body('client_name') clientName?: string,
    @Body('redirect_uris') redirectUris?: string[] | string,
    @Body('redirect_uri') redirectUri?: string,
    @Body('token_endpoint_auth_method') tokenEndpointAuthMethod?: string,
    @Body('scope') scope = '',
  ): Promise<Record<string, unknown>> {
    const normalizedRedirectUris = Array.isArray(redirectUris)
      ? redirectUris
      : typeof redirectUris === 'string'
        ? [redirectUris]
        : typeof redirectUri === 'string'
          ? [redirectUri]
          : [];

    if (normalizedRedirectUris.length === 0) {
      throw new BadRequestException('redirect_uris is required');
    }

    const authMethod = tokenEndpointAuthMethod ?? 'none';
    if (authMethod !== 'none' && authMethod !== 'client_secret_post') {
      throw new BadRequestException('Unsupported token_endpoint_auth_method');
    }

    const reg = await this.oauthClientService.registerClient(
      clientName ?? 'VS Code MCP Client',
      normalizedRedirectUris,
      scope,
      authMethod,
    );
    const clientIdIssuedAt = Math.floor(Date.now() / 1000);
    return {
      client_id: reg.clientId,
      client_id_issued_at: clientIdIssuedAt,
      redirect_uris: reg.redirectUris,
      grant_types: reg.grantTypes,
      response_types: ['code'],
      token_endpoint_auth_method: reg.tokenEndpointAuthMethod,
      scope: reg.scope,
      ...(reg.clientSecret
        ? {
            client_secret: reg.clientSecret,
            client_secret_expires_at: 0,
          }
        : {}),
    };
  }

  @Get('/whoami')
  async whoami(@Req() request: RequestWithSession): Promise<Record<string, unknown>> {
    return {
      userId: request.session?.userId ?? null,
      authProviderType: request.session?.loginAuthProviderType ?? null,
      loggedIn: Boolean(request.session?.userId),
    };
  }
}
