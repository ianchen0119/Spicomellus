/*
 * SPDX-FileCopyrightText: 2024 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import type { PropsWithChildren } from 'react'
import { useCallback } from 'react'
import React, { Fragment } from 'react'
import { BaseAppBar } from '../../../../../components/layout/app-bar/base-app-bar'
import { ButtonGroup } from 'react-bootstrap'
import { Eye as IconEye, FileText as IconFileText, WindowSplit as IconWindowSplit, Diagram3 as IconDiagram3 } from 'react-bootstrap-icons'
import { IconButton } from '../../../../../components/common/icon-button/icon-button'
import { setEditorSplitPosition, setEditorCardMode } from '../../../../../redux/editor-config/methods'
import { useApplicationState } from '../../../../../hooks/common/use-application-state'
import { useTranslatedText } from '../../../../../hooks/common/use-translated-text'

/**
 * Extended AppBar for the editor mode that includes buttons to switch between the different editor modes
 */
export const EditorModeExtendedAppBar: React.FC<PropsWithChildren> = ({ children }) => {
  const splitValue = useApplicationState((state) => state.editorConfig.splitPosition)
  const cardMode = useApplicationState((state) => state.editorConfig.cardMode)

  const onClickEditorOnly = useCallback(() => {
    setEditorCardMode(false)
    setEditorSplitPosition(100)
  }, [])

  const onClickBothViews = useCallback(() => {
    setEditorCardMode(false)
    setEditorSplitPosition(50)
  }, [])

  const onClickViewOnly = useCallback(() => {
    setEditorCardMode(false)
    setEditorSplitPosition(0)
  }, [])

  const onClickCardMode = useCallback(() => {
    setEditorCardMode(!cardMode)
  }, [cardMode])

  const titleEditorOnly = useTranslatedText('editor.viewMode.edit')
  const titleBothViews = useTranslatedText('editor.viewMode.both')
  const titleViewOnly = useTranslatedText('editor.viewMode.view')
  const titleCardMode = 'Note graph'

  return (
    <BaseAppBar
      additionalContentLeft={
        <Fragment>
          <ButtonGroup>
            <IconButton
              icon={IconFileText}
              title={titleEditorOnly}
              onClick={onClickEditorOnly}
              variant={!cardMode && splitValue === 100 ? 'secondary' : 'outline-secondary'}
            />
            <IconButton
              icon={IconWindowSplit}
              title={titleBothViews}
              onClick={onClickBothViews}
              variant={!cardMode && splitValue > 0 && splitValue < 100 ? 'secondary' : 'outline-secondary'}
            />
            <IconButton
              icon={IconEye}
              title={titleViewOnly}
              onClick={onClickViewOnly}
              variant={!cardMode && splitValue === 0 ? 'secondary' : 'outline-secondary'}
            />
            <IconButton
              icon={IconDiagram3}
              title={titleCardMode}
              onClick={onClickCardMode}
              variant={cardMode ? 'secondary' : 'outline-secondary'}
            />
          </ButtonGroup>
        </Fragment>
      }>
      {children}
    </BaseAppBar>
  )
}
