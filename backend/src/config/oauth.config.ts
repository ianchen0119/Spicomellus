/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { registerAs } from '@nestjs/config';
import z from 'zod';

import { parseOptionalNumber, printConfigErrorAndExit } from './utils';
import { buildErrorMessage, extractDescriptionFromZodIssue } from './zod-error-message';

const schema = z.object({
  /**
   * HS256 shared secret used to sign and verify JWT access tokens.
   * Must be at least 32 characters long.  The same value must be set on the
   * MCP service (HD_OAUTH_JWT_SECRET).
   */
  jwtSecret: z
    .string()
    .min(32, 'HD_OAUTH_JWT_SECRET must be at least 32 characters')
    .describe('HD_OAUTH_JWT_SECRET'),

  /** Lifetime of a JWT access token in seconds (default: 900 = 15 min) */
  accessTokenTtl: z
    .number()
    .positive()
    .int()
    .default(900)
    .describe('HD_OAUTH_ACCESS_TOKEN_TTL'),

  /** Lifetime of a refresh token in seconds (default: 2592000 = 30 days) */
  refreshTokenTtl: z
    .number()
    .positive()
    .int()
    .default(2592000)
    .describe('HD_OAUTH_REFRESH_TOKEN_TTL'),

  /** Lifetime of an authorization code in seconds (default: 300 = 5 min) */
  authCodeTtl: z
    .number()
    .positive()
    .int()
    .default(300)
    .describe('HD_OAUTH_AUTH_CODE_TTL'),
});

export type OAuthConfig = z.infer<typeof schema>;

export default registerAs('oauthConfig', () => {
  const result = schema.safeParse({
    jwtSecret: process.env.HD_OAUTH_JWT_SECRET,
    accessTokenTtl: parseOptionalNumber(process.env.HD_OAUTH_ACCESS_TOKEN_TTL),
    refreshTokenTtl: parseOptionalNumber(process.env.HD_OAUTH_REFRESH_TOKEN_TTL),
    authCodeTtl: parseOptionalNumber(process.env.HD_OAUTH_AUTH_CODE_TTL),
  });
  if (result.error) {
    const errorMessages = result.error.errors.map((issue) =>
      extractDescriptionFromZodIssue(issue, 'HD'),
    );
    const errorMessage = buildErrorMessage(errorMessages);
    return printConfigErrorAndExit(errorMessage);
  }
  return result.data;
});
