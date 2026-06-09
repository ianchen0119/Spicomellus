/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import type { NodeReplacement } from '../../../components/markdown-renderer/replace-components/component-replacer'
import { ComponentReplacer, DO_NOT_REPLACE } from '../../../components/markdown-renderer/replace-components/component-replacer'
import type { Element } from 'domhandler'
import React from 'react'
import { CardFrame } from './card-frame'

const cardLanguage = 'card'

export class CardCodeBlockReplacer extends ComponentReplacer {
  replace(node: Element): NodeReplacement {
    if (node.name !== 'code' || node.attribs['data-highlight-language'] !== cardLanguage || !node.children[0]) {
      return DO_NOT_REPLACE
    }

    const code = ComponentReplacer.extractTextChildContent(node)
    const parameters = node.attribs['data-extra'] ?? ''
    return React.createElement(CardFrame, { code, parameters })
  }
}