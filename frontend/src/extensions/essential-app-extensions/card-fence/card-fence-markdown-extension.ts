/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { CodeBlockMarkdownRendererExtension } from '../../../components/markdown-renderer/extensions/_base-classes/code-block-markdown-extension/code-block-markdown-renderer-extension'
import type { ComponentReplacer } from '../../../components/markdown-renderer/replace-components/component-replacer'
import { CardCodeBlockReplacer } from './card-code-block-replacer'

export class CardFenceMarkdownExtension extends CodeBlockMarkdownRendererExtension {
  public buildReplacers(): ComponentReplacer[] {
    return [new CardCodeBlockReplacer()]
  }
}