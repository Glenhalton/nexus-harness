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
 * Precision vector geometry with nexus network vertices and currentColor support.
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
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="nexus-mark-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--dsw-alias-brand-primary, #34d399)" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      {/* Outer Hexagonal Structure */}
      <path
        d="M12 2.2L20.5 7.1V16.9L12 21.8L3.5 16.9V7.1L12 2.2Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      {/* Interconnected Neural Core Vector Matrix */}
      <path
        d="M8 7.5V16.5M16 7.5V16.5M8 7.5L16 16.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Hub Vertices with dynamic glowing accents */}
      <circle cx="8" cy="7.5" r="1.25" fill="var(--dsw-alias-brand-primary, currentColor)" />
      <circle cx="16" cy="16.5" r="1.25" fill="var(--dsw-alias-brand-primary, currentColor)" />
      <circle cx="12" cy="12" r="1.4" fill="url(#nexus-mark-glow)" />
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
