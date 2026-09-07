import { useEffect, useState } from 'react'
import type { SessionId, ConversationSnapshot, ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'
import { CodeBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DetailsSubagentOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'

export type SubagentDetailsViewProps = 
  & PropsRuntime<'conversation.details.subagent'>
  & PropsLocale<typeof NS>
  & DetailsSubagentOwnerProps
  & {
    open: (id: SessionId) => void
    sessions: any
  }

function renderNodeContent(node: ConversationNode) {
  if (node.role === 'assistant') {
    return node.content.map((block, i) => {
      if (block.type === 'text') return <p key={i}>{block.text}</p>
      if (block.type === 'tool_calls') {
        return <div key={i}><em>Uses tool: {block.calls.map(c => c.name).join(', ')}</em></div>
      }
      return null
    })
  }
  if (node.role === 'user') {
    return node.content.map((block, i) => {
      if (block.type === 'text') return <p key={i}>{block.text}</p>
      return null
    })
  }
  return <em>{node.role} message</em>
}

export function SubagentDetailsView({ sessionId, open, sessions, t }: SubagentDetailsViewProps) {
  const [snapshot, setSnapshot] = useState<ConversationSnapshot | null>(null)

  useEffect(() => {
    const binding = sessions.binding(sessionId)
    if (!binding) return
    const session = binding.session
    if (!session) return

    setSnapshot(session.snapshot)
    const off = session.subscribe(() => {
      setSnapshot(session.snapshot)
    })
    return off
  }, [sessionId, sessions])

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
            width: '100%'
          }}
        >
          Interact with Sub Agent
        </button>
      </div>
      
      <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {snapshot?.nodes.map((node, index) => (
          <div 
            key={index} 
            style={{ 
              background: node.role === 'user' ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
              padding: '12px',
              borderRadius: '8px',
              border: node.role === 'user' ? 'none' : '1px solid var(--dsw-alias-border-l3)',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', marginBottom: '4px' }}>
              {node.role.charAt(0).toUpperCase() + node.role.slice(1)}
            </div>
            <div style={{ fontSize: '14px', lineHeight: 1.5, wordBreak: 'break-word' }}>
              {renderNodeContent(node)}
            </div>
          </div>
        ))}
        {!snapshot && <div style={{ padding: '16px' }}>Loading conversation...</div>}
      </div>
    </div>
  )
}
