/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { AuthProviderType } from '@hedgedoc/commons';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';

import { ApiTokenService } from '../../../api-token/api-token.service';
import appConfig from '../../../config/app.config';
import { NotInDBError, TokenNotValidError } from '../../../errors/errors';
import { ConsoleLoggerService } from '../../../logger/console-logger.service';
import { OAuthJwtService } from '../../../oauth/oauth-jwt.service';
import { CompleteRequest } from '../request.type';

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(
    private readonly logger: ConsoleLoggerService,
    private readonly apiTokenService: ApiTokenService,
    private readonly oauthJwtService: OAuthJwtService,
    @Inject(appConfig.KEY)
    private readonly appCfg: ConfigType<typeof appConfig>,
  ) {
    this.logger.setContext(ApiTokenGuard.name);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: CompleteRequest = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return false;
    }
    const [method, token] = authHeader.trim().split(' ');
    if (method !== 'Bearer' || !token) {
      return false;
    }
    const bearer = token.trim();
    try {
      if (bearer.startsWith('hd2.')) {
        request.userId = await this.apiTokenService.getUserIdForToken(bearer);
        request.authProviderType = AuthProviderType.TOKEN;
        return true;
      }

      const payload = await this.oauthJwtService.verifyAccessToken(
        bearer,
        `${this.appCfg.baseUrl}/mcp`,
      );
      request.userId = Number(payload.sub);
      request.authProviderType = AuthProviderType.TOKEN;
      return true;
    } catch (error) {
      if (!(error instanceof TokenNotValidError || error instanceof NotInDBError)) {
        this.logger.error(
          `Unknown Error during API token validation: ${String(error)}`,
          undefined,
          'canActivate',
        );
      }
      return false;
    }
  }
}
