/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { DeleteApiRequestBuilder } from '../common/api-request-builder/delete-api-request-builder'
import { GetApiRequestBuilder } from '../common/api-request-builder/get-api-request-builder'
import { PostApiRequestBuilder } from '../common/api-request-builder/post-api-request-builder'
import type {
  CardGraphInterface,
  MediaUploadInterface,
  NoteInterface,
  NoteMediaDeletionInterface,
  NoteMetadataInterface,
  NotePermissionsInterface
} from '@hedgedoc/commons'

export interface NoteLinkInterface {
  id: number
  note_id: number
  source_card_key: string
  target_card_key: string
  edge_type: 'uni' | 'bid'
  created_at: string
}

/**
 * Retrieves the content and metadata about the specified note.
 *
 * @param noteAlias The id or alias of the note.
 * @return Content and metadata of the specified note.
 * @throws {Error} when the api request wasn't successful.
 */
export const getNote = async (noteAlias: string, baseUrl?: string): Promise<NoteInterface> => {
  const response = await new GetApiRequestBuilder<NoteInterface>('notes/' + noteAlias, baseUrl).sendRequest()
  return response.asParsedJsonObject()
}

/**
 * Retrieves the metadata of the specified note.
 *
 * @param noteAlias The id or alias of the note.
 * @return Metadata of the specified note.
 */
export const getNoteMetadata = async (noteAlias: string): Promise<NoteMetadataInterface> => {
  const response = await new GetApiRequestBuilder<NoteMetadataInterface>(`notes/${noteAlias}/metadata`).sendRequest()
  return response.asParsedJsonObject()
}

/**
 * Retrieves the permissions of the specified note.
 *
 * @param noteAlias The id or alias of the note.
 * @return Permissions of the specified note.
 */
export const getNotePermissions = async (noteAlias: string): Promise<NotePermissionsInterface> => {
  const response = await new GetApiRequestBuilder<NotePermissionsInterface>(
    `notes/${noteAlias}/metadata/permissions`
  ).sendRequest()
  return response.asParsedJsonObject()
}

/**
 * Returns a list of media objects associated with the specified note.
 *
 * @param noteAlias The id or alias of the note.
 * @return List of media object metadata associated with specified note.
 * @throws {Error} when the api request wasn't successful.
 */
export const getMediaForNote = async (noteAlias: string): Promise<MediaUploadInterface[]> => {
  const response = await new GetApiRequestBuilder<MediaUploadInterface[]>(`notes/${noteAlias}/media`).sendRequest()
  return response.asParsedJsonObject()
}

/**
 * Retrieves all note link rows for the specified note.
 */
export const getNoteLinks = async (noteAlias: string): Promise<NoteLinkInterface[]> => {
  const response = await new GetApiRequestBuilder<NoteLinkInterface[]>(`notes/${noteAlias}/links`).sendRequest()
  return response.asParsedJsonObject()
}

/**
 * Retrieves all outgoing link rows for a specific card.
 */
export const getOutgoingNoteLinks = async (noteAlias: string, cardId: string): Promise<NoteLinkInterface[]> => {
  const response = await new GetApiRequestBuilder<NoteLinkInterface[]>(
    `notes/${noteAlias}/links/${cardId}/outgoing`
  ).sendRequest()
  return response.asParsedJsonObject()
}

/**
 * Retrieves all backlink rows for a specific card.
 */
export const getBacklinkNoteLinks = async (noteAlias: string, cardId: string): Promise<NoteLinkInterface[]> => {
  const response = await new GetApiRequestBuilder<NoteLinkInterface[]>(
    `notes/${noteAlias}/links/${cardId}/backlinks`
  ).sendRequest()
  return response.asParsedJsonObject()
}

/**
 * Retrieves the card graph for the specified note.
 *
 * @param noteAlias The id or alias of the note.
 * @param focusOn The focused card id, if any.
 * @return Card graph data for the note.
 */
export const getNoteGraph = async (
  noteAlias: string,
  focusOn?: string | null,
  depth = 1
): Promise<CardGraphInterface> => {
  const query = new URLSearchParams()
  if (focusOn) {
    query.set('focusOn', focusOn)
  }
  query.set('depth', String(depth))
  const queryString = query.toString()
  const response = await new GetApiRequestBuilder<CardGraphInterface>(`notes/${noteAlias}/graph${queryString ? `?${queryString}` : ''}`).sendRequest()
  return response.asParsedJsonObject()
}

/**
 * Creates a note-to-note link from the specified note to a target note.
 */
export const createNoteLink = async (noteAlias: string, targetAlias: string, edgeType: 'uni' | 'bid'): Promise<void> => {
  await new PostApiRequestBuilder(`notes/${noteAlias}/note-links`).withJsonBody({ targetAlias, edgeType }).sendRequest()
}

/**
 * Deletes a note-to-note link from the specified note to the target alias.
 */
export const deleteNoteLink = async (noteAlias: string, targetAlias: string): Promise<void> => {
  await new DeleteApiRequestBuilder(`notes/${noteAlias}/note-links/${encodeURIComponent(targetAlias)}`).sendRequest()
}

/**
 * Returns all note-link rows from other notes that point TO the specified note (cross-note backlinks).
 */
export const getCrossNoteBacklinks = async (noteAlias: string): Promise<NoteLinkInterface[]> => {
  const response = await new GetApiRequestBuilder<NoteLinkInterface[]>(`notes/${noteAlias}/cross-backlinks`).sendRequest()
  return response.asParsedJsonObject()
}

/**
 * Creates a new note with a given markdown content.
 *
 * @param markdown The content of the new note.
 * @return Content and metadata of the new note.
 * @throws {Error} when the api request wasn't successful.
 */
export const createNote = async (markdown: string): Promise<NoteInterface> => {
  const response = await new PostApiRequestBuilder<NoteInterface, void>('notes')
    .withHeader('Content-Type', 'text/markdown')
    .withBody(markdown)
    .sendRequest()
  return response.asParsedJsonObject()
}

/**
 * Creates a new note with a given markdown content and a defined primary alias.
 *
 * @param markdown The content of the new note.
 * @param primaryAlias The primary alias of the new note.
 * @return Content and metadata of the new note.
 * @throws {Error} when the api request wasn't successful.
 */
export const createNoteWithPrimaryAlias = async (markdown: string, primaryAlias: string): Promise<NoteInterface> => {
  const response = await new PostApiRequestBuilder<NoteInterface, void>('notes/' + primaryAlias)
    .withHeader('Content-Type', 'text/markdown')
    .withBody(markdown)
    .sendRequest()
  return response.asParsedJsonObject()
}

/**
 * Deletes the specified note.
 *
 * @param noteAlias The id or alias of the note to delete.
 * @param keepMedia Whether to keep the uploaded media associated with the note.
 * @throws {Error} when the api request wasn't successful.
 */
export const deleteNote = async (noteAlias: string, keepMedia: boolean): Promise<void> => {
  await new DeleteApiRequestBuilder<void, NoteMediaDeletionInterface>('notes/' + noteAlias)
    .withJsonBody({
      keepMedia
    })
    .sendRequest()
}
