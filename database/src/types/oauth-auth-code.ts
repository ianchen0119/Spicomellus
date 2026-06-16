/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * A single-use, short-lived OAuth 2.0 authorization code bound to a PKCE
 * challenge.  Created by the authorize endpoint and consumed by the token
 * endpoint.
 */
export interface OAuthAuthCode {
  /** Random base64url-encoded code value (also serves as PK) */
  [FieldNameOAuthAuthCode.id]: string
  [FieldNameOAuthAuthCode.clientId]: string
  [FieldNameOAuthAuthCode.userId]: number
  [FieldNameOAuthAuthCode.redirectUri]: string
  [FieldNameOAuthAuthCode.scope]: string
  [FieldNameOAuthAuthCode.codeChallenge]: string
  [FieldNameOAuthAuthCode.codeChallengeMethod]: string
  [FieldNameOAuthAuthCode.expiresAt]: string
  [FieldNameOAuthAuthCode.used]: boolean
  [FieldNameOAuthAuthCode.createdAt]: string
}

export enum FieldNameOAuthAuthCode {
  id = 'id',
  clientId = 'client_id',
  userId = 'user_id',
  redirectUri = 'redirect_uri',
  scope = 'scope',
  codeChallenge = 'code_challenge',
  codeChallengeMethod = 'code_challenge_method',
  expiresAt = 'expires_at',
  used = 'used',
  createdAt = 'created_at',
}

export const TableOAuthAuthCode = 'oauth_auth_code'
