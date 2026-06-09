/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { TestMarkdownRenderer } from '../../../components/markdown-renderer/test-utils/test-markdown-renderer'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { CardFenceMarkdownExtension } from './card-fence-markdown-extension'

describe('Card fence markdown extension', () => {
  it('renders a fenced card as a visible card block', () => {
    render(
      <TestMarkdownRenderer
        extensions={[new CardFenceMarkdownExtension()]}
        content={'```card id=alpha title=Alpha\nHello world\n-> beta\n```'}
      />
    )

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByText('→ beta')).toBeInTheDocument()
  })
})