import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NexusPlanGlyph } from './definition.tsx'

export function NexusPlanTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
  const { tab } = useTabInfo()
  return (
    <>
      <span style={{ marginRight: 6, display: 'inline-flex', verticalAlign: 'middle' }}>
        <NexusPlanGlyph size={16} />
      </span>
      <span>{tab.title}</span>
    </>
  )
}
