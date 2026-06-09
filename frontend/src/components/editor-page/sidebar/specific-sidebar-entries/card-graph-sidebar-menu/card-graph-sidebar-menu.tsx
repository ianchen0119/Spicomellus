/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { createNoteLink, deleteNoteLink, getCrossNoteBacklinks, getNoteLinks, type NoteLinkInterface } from '../../../../../api/notes'
import { getExplorePageEntries } from '../../../../../api/explore'
import { useApplicationState } from '../../../../../hooks/common/use-application-state'
import { concatCssClasses } from '../../../../../utils/concat-css-classes'
import { SidebarButton } from '../../sidebar-button/sidebar-button'
import { SidebarMenu } from '../../sidebar-menu/sidebar-menu'
import type { SpecificSidebarMenuProps } from '../../types'
import { DocumentSidebarMenuSelection } from '../../types'
import { Mode } from '../../../../explore-page/mode-selection/mode'
import { SortMode } from '@hedgedoc/commons'
import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft as IconArrowLeft, Diagram3 as IconDiagram3, Trash as IconTrash } from 'react-bootstrap-icons'
import { Trans, useTranslation } from 'react-i18next'
import { useAsync } from 'react-use'
import styles from '../../sidebar-button/sidebar-button.module.scss'

export const CardGraphSidebarMenu: React.FC<SpecificSidebarMenuProps> = ({
  className,
  menuId,
  onClick,
  selectedMenuId
}) => {
  useTranslation()
  const noteAlias = useApplicationState((state) => state.noteDetails?.primaryAlias ?? '')

  const hide = selectedMenuId !== DocumentSidebarMenuSelection.NONE && selectedMenuId !== menuId
  const expand = selectedMenuId === menuId
  const onClickHandler = useCallback(() => onClick(menuId), [menuId, onClick])

  // refetch trigger
  const [refetchKey, setRefetchKey] = useState(0)
  const refetch = useCallback(() => setRefetchKey((k) => k + 1), [])

  // Add-link form state
  const [showAddLink, setShowAddLink] = useState(false)
  const [pendingTarget, setPendingTarget] = useState('')
  const [pendingEdge, setPendingEdge] = useState<'uni' | 'bid'>('uni')
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300)
    return () => clearTimeout(timer)
  }, [searchText])

  // Load outgoing links declared by this note
  const { value: outgoing, loading, error } = useAsync(async () => {
    if (!expand || !noteAlias) return []
    return await getNoteLinks(noteAlias)
  }, [noteAlias, expand, refetchKey])

  // Load cross-note backlinks (other notes pointing to this note)
  const { value: backlinks } = useAsync(async () => {
    if (!expand || !noteAlias) return []
    return await getCrossNoteBacklinks(noteAlias)
  }, [noteAlias, expand, refetchKey])

  // Search for notes to link to
  const alreadyLinked = useMemo(() => new Set(outgoing?.map((l) => l.target_card_key) ?? []), [outgoing])

  const { value: searchResults } = useAsync(async () => {
    if (!debouncedSearch || !showAddLink) return []
    const results = await getExplorePageEntries(Mode.MY_NOTES, SortMode.UPDATED_AT_DESC, debouncedSearch, null, 1)
    return results.filter((n) => n.primaryAlias !== noteAlias && !alreadyLinked.has(n.primaryAlias))
  }, [debouncedSearch, showAddLink, noteAlias, alreadyLinked])

  const handleCreateLink = useCallback(async () => {
    if (!pendingTarget || !noteAlias) return
    await createNoteLink(noteAlias, pendingTarget, pendingEdge)
    setPendingTarget('')
    setSearchText('')
    setDebouncedSearch('')
    setShowAddLink(false)
    refetch()
  }, [noteAlias, pendingTarget, pendingEdge, refetch])

  const handleDeleteLink = useCallback(
    async (targetAlias: string) => {
      if (!noteAlias) return
      await deleteNoteLink(noteAlias, targetAlias)
      refetch()
    },
    [noteAlias, refetch]
  )

  const closeAddLink = useCallback(() => {
    setShowAddLink(false)
    setPendingTarget('')
    setSearchText('')
    setDebouncedSearch('')
  }, [])

  return (
    <Fragment>
      <SidebarButton
        hide={hide}
        icon={expand ? IconArrowLeft : IconDiagram3}
        className={concatCssClasses(className, { [styles.main]: expand })}
        onClick={onClickHandler}>
        <Trans i18nKey={'editor.noteInfo.title'} />
      </SidebarButton>
      <SidebarMenu expand={expand}>
        <div className={'p-2'}>
          <div className={'fw-semibold mb-2'}>Note Graph</div>
          {loading && <div className={'text-muted small'}>Loading...</div>}
          {error && <div className={'text-danger small'}>{String(error)}</div>}

          {outgoing && outgoing.length > 0 && (
            <div className={'mb-2'}>
              <div className={'text-muted small mb-1'}>Linked notes</div>
              {outgoing.map((link: NoteLinkInterface) => (
                <div key={link.id} className={'d-flex align-items-center gap-1 mb-1'}>
                  <span
                    className={`badge me-1 ${link.edge_type === 'bid' ? 'bg-info text-dark' : 'bg-primary'}`}
                    style={{ fontSize: '0.7rem' }}>
                    {link.edge_type === 'bid' ? '\u2194' : '\u2192'}
                  </span>
                  <span className={'small flex-fill text-truncate'}>{link.target_card_key}</span>
                  <button
                    className={'btn btn-sm btn-outline-danger py-0 px-1 border-0'}
                    title={'Remove link'}
                    onClick={() => void handleDeleteLink(link.target_card_key)}>
                    <IconTrash size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {backlinks && backlinks.length > 0 && (
            <div className={'mb-2'}>
              <div className={'text-muted small mb-1'}>Referenced by</div>
              {backlinks.map((link: NoteLinkInterface) => (
                <div key={link.id} className={'d-flex align-items-center gap-1 mb-1'}>
                  <span className={'badge bg-secondary me-1'} style={{ fontSize: '0.7rem' }}>
                    \u2190
                  </span>
                  <span className={'small text-muted text-truncate'}>{link.source_card_key}</span>
                </div>
              ))}
            </div>
          )}

          {!loading && !error && (!outgoing || outgoing.length === 0) && (!backlinks || backlinks.length === 0) && (
            <div className={'text-muted small mb-2'}>No connections yet.</div>
          )}

          {!showAddLink ? (
            <button className={'btn btn-sm btn-outline-secondary w-100'} onClick={() => setShowAddLink(true)}>
              + Add link
            </button>
          ) : (
            <div className={'border-top pt-2'}>
              <div className={'text-muted small mb-1'}>Link to another note</div>
              <input
                type={'text'}
                className={'form-control form-control-sm mb-1'}
                placeholder={'Search notes...'}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
              {searchResults && searchResults.length > 0 && (
                <div className={'list-group mb-1'} style={{ maxHeight: 150, overflowY: 'auto' }}>
                  {searchResults.map((note) => (
                    <button
                      key={note.primaryAlias}
                      className={`list-group-item list-group-item-action py-1 px-2 small ${pendingTarget === note.primaryAlias ? 'active' : ''}`}
                      onClick={() => setPendingTarget(note.primaryAlias)}>
                      {note.title || note.primaryAlias}
                      <span className={'text-muted ms-1'} style={{ fontSize: '0.7rem' }}>
                        {note.primaryAlias}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {searchText && searchResults && searchResults.length === 0 && (
                <div className={'text-muted small mb-1'}>No notes found.</div>
              )}
              {pendingTarget && (
                <div className={'mb-1'}>
                  <div className={'text-muted small mb-1'}>Direction</div>
                  <div className={'d-flex gap-1 mb-1'}>
                    <button
                      className={`btn btn-sm flex-fill ${pendingEdge === 'uni' ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setPendingEdge('uni')}>
                      \u2192 uni
                    </button>
                    <button
                      className={`btn btn-sm flex-fill ${pendingEdge === 'bid' ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setPendingEdge('bid')}>
                      \u2194 bid
                    </button>
                  </div>
                  <div className={'small text-muted mb-1'}>
                    {pendingEdge === 'bid' ? '\u2194' : '\u2192'} {pendingTarget}
                  </div>
                </div>
              )}
              <div className={'d-flex gap-1'}>
                <button
                  className={'btn btn-sm btn-success flex-fill'}
                  disabled={!pendingTarget}
                  onClick={() => void handleCreateLink()}>
                  Add
                </button>
                <button className={'btn btn-sm btn-outline-secondary'} onClick={closeAddLink}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </SidebarMenu>
    </Fragment>
  )
}
