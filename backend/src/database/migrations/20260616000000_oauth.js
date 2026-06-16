/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* oxlint-disable */
const {
  FieldNameOAuthClient,
  FieldNameOAuthAuthCode,
  FieldNameOAuthRefreshToken,
  TableOAuthClient,
  TableOAuthAuthCode,
  TableOAuthRefreshToken,
  FieldNameUser,
  TableUser,
} = require('@hedgedoc/database');

const up = async function (knex) {
  // ── oauth_client ─────────────────────────────────────────────────────────
  await knex.schema.createTable(TableOAuthClient, (table) => {
    table.string(FieldNameOAuthClient.id).primary();
    table.string(FieldNameOAuthClient.secretHash).nullable();
    table.string(FieldNameOAuthClient.name).notNullable();
    table.text(FieldNameOAuthClient.redirectUris).notNullable().defaultTo('[]');
    table.text(FieldNameOAuthClient.grantTypes).notNullable().defaultTo('["authorization_code","refresh_token"]');
    table.string(FieldNameOAuthClient.scope).notNullable().defaultTo('');
    table.timestamp(FieldNameOAuthClient.createdAt, { useTz: false, precision: 3 }).notNullable();
  });

  // ── oauth_auth_code ───────────────────────────────────────────────────────
  await knex.schema.createTable(TableOAuthAuthCode, (table) => {
    table.string(FieldNameOAuthAuthCode.id).primary();
    table
      .string(FieldNameOAuthAuthCode.clientId)
      .notNullable()
      .references(FieldNameOAuthClient.id)
      .inTable(TableOAuthClient)
      .onDelete('CASCADE');
    table
      .integer(FieldNameOAuthAuthCode.userId)
      .unsigned()
      .notNullable()
      .references(FieldNameUser.id)
      .inTable(TableUser)
      .onDelete('CASCADE');
    table.text(FieldNameOAuthAuthCode.redirectUri).notNullable();
    table.string(FieldNameOAuthAuthCode.scope).notNullable().defaultTo('');
    table.string(FieldNameOAuthAuthCode.codeChallenge).notNullable();
    table.string(FieldNameOAuthAuthCode.codeChallengeMethod).notNullable().defaultTo('S256');
    table.timestamp(FieldNameOAuthAuthCode.expiresAt, { useTz: false, precision: 3 }).notNullable();
    table.boolean(FieldNameOAuthAuthCode.used).notNullable().defaultTo(false);
    table.timestamp(FieldNameOAuthAuthCode.createdAt, { useTz: false, precision: 3 }).notNullable();

    table.index([FieldNameOAuthAuthCode.clientId], 'idx_oauth_auth_code_client_id');
    table.index([FieldNameOAuthAuthCode.userId], 'idx_oauth_auth_code_user_id');
    table.index([FieldNameOAuthAuthCode.expiresAt], 'idx_oauth_auth_code_expires_at');
  });

  // ── oauth_refresh_token ───────────────────────────────────────────────────
  await knex.schema.createTable(TableOAuthRefreshToken, (table) => {
    table.string(FieldNameOAuthRefreshToken.id, 11).primary();
    table
      .integer(FieldNameOAuthRefreshToken.userId)
      .unsigned()
      .notNullable()
      .references(FieldNameUser.id)
      .inTable(TableUser)
      .onDelete('CASCADE');
    table
      .string(FieldNameOAuthRefreshToken.clientId)
      .notNullable()
      .references(FieldNameOAuthClient.id)
      .inTable(TableOAuthClient)
      .onDelete('CASCADE');
    table.string(FieldNameOAuthRefreshToken.secretHash).notNullable();
    table.string(FieldNameOAuthRefreshToken.scope).notNullable().defaultTo('');
    table.timestamp(FieldNameOAuthRefreshToken.expiresAt, { useTz: false, precision: 3 }).notNullable();
    table.boolean(FieldNameOAuthRefreshToken.revoked).notNullable().defaultTo(false);
    table.string(FieldNameOAuthRefreshToken.replacedBy, 11).nullable();
    table.timestamp(FieldNameOAuthRefreshToken.createdAt, { useTz: false, precision: 3 }).notNullable();

    table.index([FieldNameOAuthRefreshToken.userId], 'idx_oauth_refresh_token_user_id');
    table.index([FieldNameOAuthRefreshToken.clientId], 'idx_oauth_refresh_token_client_id');
    table.index([FieldNameOAuthRefreshToken.expiresAt], 'idx_oauth_refresh_token_expires_at');
  });
};

const down = async function (knex) {
  await knex.schema.dropTableIfExists(TableOAuthRefreshToken);
  await knex.schema.dropTableIfExists(TableOAuthAuthCode);
  await knex.schema.dropTableIfExists(TableOAuthClient);
};

module.exports = { up, down };
