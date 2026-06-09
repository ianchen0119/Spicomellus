/*
 * SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { MarkdownToReact } from '../../../components/markdown-renderer/markdown-to-react/markdown-to-react'
import { buildCardGraph } from '@hedgedoc/commons'
import React, { useMemo } from 'react'
import { Badge } from 'react-bootstrap'
import { useUrlParamState } from '../../../hooks/common/use-url-param-state'

export interface CardFrameProps {
  code: string
  parameters: string
}

const parseParameters = (parameters: string): { id: string; title: string } => {
  const entries: Record<string, string> = {}
  const parameterMatcher = /([\w-]+)=("[^"]*"|'[^']*'|[^\s]+)(?:\s+|$)/g
  let match: RegExpExecArray | null
  while ((match = parameterMatcher.exec(parameters)) !== null) {
    entries[match[1]] = (match[2] ?? '').replace(/^['"]|['"]$/g, '')
  }
  const id = entries['id'] ?? 'card'
  return { id, title: entries['title'] ?? id }
}

export const CardFrame: React.FC<CardFrameProps> = ({ code, parameters }) => {
  const { id, title } = useMemo(() => parseParameters(parameters), [parameters])
  const [, setFocusOn] = useUrlParamState<string | null>('focus_on', null)
  const graph = useMemo(
    () => buildCardGraph(['```card ' + parameters, code, '```'].join('\n'), id),
    [code, id, parameters]
  )

  const bodyLines = useMemo(
    () => code.split('\n').filter((line) => !/^\s*(<->|->)\s*[\w.-]+\s*$/.test(line)),
    [code]
  )

  return (
    <div className={'card shadow-sm my-2'}>
      <div className={'card-header d-flex justify-content-between align-items-center'}>
        <div className={'fw-semibold'}>{title}</div>
        <Badge bg={'secondary'}>{id}</Badge>
      </div>
      <div className={'card-body'}>
        <MarkdownToReact markdownContentLines={bodyLines} markdownRenderExtensions={[]} allowHtml={true} />
        {graph.edges.length > 0 && (
          <div className={'mt-3 d-flex flex-wrap gap-2'}>
            {graph.edges.map((edge, index) => (
              <Badge
                key={`${edge.source}-${edge.target}-${index}`}
                role={'button'}
                bg={edge.edgeType === 'bid' ? 'info' : 'primary'}
                onClick={() => setFocusOn(edge.target)}>
                {edge.edgeType === 'bid' ? '↔' : '→'} {edge.target}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}