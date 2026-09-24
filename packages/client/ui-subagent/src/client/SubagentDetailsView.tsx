import { useEffect, useState } from 'react'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ConversationNode, UiConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { DetailsSubagentOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'

export type SubagentDetailsViewProps =
  & PropsRuntime<'conversation.details.subagent'>
  & PropsLocale<typeof NS>
  & DetailsSubagentOwnerProps
  & {
    open: (id: SessionId) => void
    sessions: ISessions
    uiConversation?: UiConversation
  }

function renderNodeContent(node: ConversationNode) {
  if (node.kind === 'assistant') {
    return node.blocks.map((block, i) => {
      if (block.kind === 'text' || block.kind === 'reasoning') return <p key={i}>{block.text}</p>
      if (block.kind === 'tool-call') return <div key={i}><em>Uses tool: {block.name}</em></div>
      return null
    })
  }
  if (node.kind === 'user' || node.kind === 'steering' || node.kind === 'context') {
    return node.content.map((block, i) => {
      if (block.type === 'text') return <p key={i}>{block.text}</p>
      return null
    })
  }
  return <em>{node.kind} event</em>
}

export function SubagentDetailsView({ sessionId, open, sessions, uiConversation }: SubagentDetailsViewProps) {
  const [nodes, setNodes] = useState<readonly ConversationNode[] | null>(null)

  useEffect(() => {
    if (!uiConversation) return
    let bound: ReturnType<UiConversation['binding']> | undefined
    try {
      bound = uiConversation.binding(sessionId)
    } catch {
      return
    }
    if (!bound) return
    const chatSource = bound.target('chat')
    const update = () => {
      const snap = chatSource.getSnapshot()
      if (snap) {
        setNodes(snap.legacy.nodes)
      }
    }
    update()
    const off = chatSource.subscribe(update)
    return off
  }, [sessionId, uiConversation])

  const summary = sessions.list.getSnapshot().byId[sessionId]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid var(--dsw-alias-border-l3)' }}>
        <h2 style={{ fontSize: '16px', margin: '0 0 8px 0' }}>{summary?.title || sessionId}</h2>
        <button
          onClick={() => open(sessionId)}
          style={{
            padding: '8px 16px',
            background: 'var(--dsw-alias-state-business-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 500,
            width: '100%',
          }}
        >
          Interact with Sub Agent
        </button>
      </div>

      <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {nodes?.map((node, index) => (
          <div
            key={index}
            style={{
              background: node.kind === 'user' ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
              padding: '12px',
              borderRadius: '8px',
              border: node.kind === 'user' ? 'none' : '1px solid var(--dsw-alias-border-l3)',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', marginBottom: '4px' }}>
              {node.kind.charAt(0).toUpperCase() + node.kind.slice(1)}
            </div>
            <div style={{ fontSize: '14px', lineHeight: 1.5, wordBreak: 'break-word' }}>
              {renderNodeContent(node)}
            </div>
          </div>
        ))}
        {!nodes && <div style={{ padding: '16px' }}>Loading conversation...</div>}
      </div>
    </div>
  )
}
