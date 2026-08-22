/**
 * Decorative ambient layer behind the frame's columns: drifting blurred
 * orbs plus a faint pulsing node/line SVG. Always mounted, always the exact
 * same DOM — visibility is entirely CSS-token-driven (--dsh-ambient-display,
 * gradient-shadow-text.css), so this component carries no theme awareness,
 * no props, and no store/context reads. Every other theme leaves the token
 * at its `none` default, so this renders with zero layout/paint/animation
 * cost outside the nexus theme.
 */
import css from './AmbientBackground.module.css'

/** The frame-wide ambient background (see module doc). */
export function AmbientBackground() {
  return (
    <div className={css.root} aria-hidden="true">
      <div className={`${css.orb} ${css.orbA}`} />
      <div className={`${css.orb} ${css.orbB}`} />
      <div className={`${css.orb} ${css.orbC}`} />
      <svg className={css.synapse} width="100%" height="100%" preserveAspectRatio="none">
        <line x1="18%" y1="22%" x2="46%" y2="12%" />
        <line x1="46%" y1="12%" x2="72%" y2="30%" />
        <line x1="72%" y1="30%" x2="86%" y2="68%" />
        <line x1="30%" y1="70%" x2="55%" y2="82%" />
        <line x1="55%" y1="82%" x2="80%" y2="65%" />
        <circle cx="18%" cy="22%" r="2.5" />
        <circle cx="46%" cy="12%" r="2.5" />
        <circle cx="72%" cy="30%" r="2.5" />
        <circle cx="86%" cy="68%" r="2.5" />
        <circle cx="30%" cy="70%" r="2.5" />
        <circle cx="55%" cy="82%" r="2.5" />
        <circle cx="80%" cy="65%" r="2.5" />
        <path className={css.pulse} d="M 18% 22% L 46% 12% L 72% 30% L 86% 68%" fill="none" />
        <path className={css.pulse} d="M 30% 70% L 55% 82% L 80% 65%" fill="none" style={{ animationDelay: '3.2s' }} />
      </svg>
    </div>
  )
}
