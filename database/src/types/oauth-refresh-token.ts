/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * A refresh token for the OAuth 2.0 flow.  The plaintext secret is returned
 * once on creation and never stored — only its SHA-512 hash is persisted.
 * Tokens are rotated on every use: the new token records the id of the token
 * it replaced in `replaced_by`, and the old token is marked revoked.
 */
export interface OAuthRefreshToken {
  /** Base64url-encoded random key-id (11 chars, like ApiToken) */
  [FieldNameOAuthRefreshToken.id]: string
  [FieldNameOAuthRefreshToken.userId]: number
  [FieldNameOAuthRefreshToken.clientId]: string
  [FieldNameOAuthRefreshToken.secretHash]: string
  [FieldNameOAuthRefreshToken.scope]: string
  [FieldNameOAuthRefreshToken.expiresAt]: string
  [FieldNameOAuthRefreshToken.revoked]: boolean
  /** Id of the token that superseded this one (rotation chain) */
  [FieldNameOAuthRefreshToken.replacedBy]: string | null
  [FieldNameOAuthRefreshToken.createdAt]: string
}

export enum FieldNameOAuthRefreshToken {
  id = 'id',
  userId = 'user_id',
  clientId = 'client_id',
  secretHash = 'secret_hash',
  scope = 'scope',
  expiresAt = 'expires_at',
  revoked = 'revoked',
  replacedBy = 'replaced_by',
  createdAt = 'created_at',
}

export const TableOAuthRefreshToken = 'oauth_refresh_token'
