// Nexus "Hex N" mark: a hexagonal node frame with the initial built into it —
// the network-hub reading of "nexus" as one flat currentColor shape, sized
// for a 24px sidebar row down to a 16px favicon. Placeholder pending final
// brand art (see the package README): swapping the artwork later means
// editing only this file — every consumer goes through NexusBrandMark /
// NexusBrandName, never the raw markup.

import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

type NexusBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

/**
 * Render the Nexus mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the Nexus hex-node mark.
 */
export function NexusBrandMark({ size, className }: NexusBrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 1.6 21 6.8V17.2L12 22.4 3 17.2V6.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8.4 8V16M15.6 8V16M8.4 8L15.6 16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Render the "Nexus" wordmark as styled text — deliberately not custom
 * letterforms, so it inherits the shell's own typography and needs no art
 * update when the display face changes; only the mark is placeholder art.
 * @returns the Nexus name.
 */
export function NexusBrandName() {
  return <span style={{ fontWeight: 600, letterSpacing: '-0.01em' }}>Nexus</span>
}
