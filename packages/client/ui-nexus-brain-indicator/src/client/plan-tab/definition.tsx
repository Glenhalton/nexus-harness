import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

export const NEXUS_PLAN_KIND = 'nexus-plan'
export const NEXUS_PLAN_ID = '@deepseek-ai/dsh-client-ui-nexus-brain-indicator/plan'

export function NexusPlanGlyph({ size = 16, className }: IconProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  )
}

export function nexusPlanDefinition(t: TranslateNS<'nexusBrainIndicator'>): SidebarRightTabDefinition {
  return {
    id: NEXUS_PLAN_ID,
    kind: NEXUS_PLAN_KIND,
    priority: 'builtin',
    title: () => t('tab.title'),
    guide: [{
      id: 'nexus-plan-guide',
      order: 5,
      title: () => t('tab.guide.title'),
      description: () => t('tab.guide.description'),
      icon: NexusPlanGlyph,
    }],
  }
}
