/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Represents a dynamically-registered OAuth 2.0 / RFC 7591 client.
 * Public clients (e.g. VS Code MCP plugin) have a null secret_hash.
 */
export interface OAuthClient {
  [FieldNameOAuthClient.id]: string
  [FieldNameOAuthClient.secretHash]: string | null
  [FieldNameOAuthClient.name]: string
  /** JSON-encoded string[]: allowed redirect URIs */
  [FieldNameOAuthClient.redirectUris]: string
  /** JSON-encoded string[]: allowed grant types */
  [FieldNameOAuthClient.grantTypes]: string
  [FieldNameOAuthClient.scope]: string
  [FieldNameOAuthClient.createdAt]: string
}

export enum FieldNameOAuthClient {
  id = 'id',
  secretHash = 'secret_hash',
  name = 'name',
  redirectUris = 'redirect_uris',
  grantTypes = 'grant_types',
  scope = 'scope',
  createdAt = 'created_at',
}

export const TableOAuthClient = 'oauth_client'
