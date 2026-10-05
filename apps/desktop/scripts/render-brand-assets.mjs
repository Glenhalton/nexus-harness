/**
 * Regenerate Nexus Harness icons and installer artwork from the Nexus "Hex N" mark
 * (packages/client/ui-brand-nexus/src/client/Brand.tsx). Run after changing the mark:
 *   node apps/desktop/scripts/render-brand-assets.mjs
 * Writes resources/icon*.svg|png, renderer/assets/welcome-brand.svg and installer/assets/*.png.
 * Requires `sharp`; set SHARP_MODULE to its entry file when it is not resolvable from apps/desktop.
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'

// sharp is not a desktop dependency; SHARP_MODULE may name any installed copy's entry file.
const { default: sharp } = await import(process.env.SHARP_MODULE === undefined ? 'sharp' : pathToFileURL(process.env.SHARP_MODULE).href)

const root = new URL('..', import.meta.url)
const path = relative => fileURLToPath(new URL(relative, root))
const FONT = 'Montserrat, -apple-system, \'Segoe UI\', \'Helvetica Neue\', Arial, sans-serif'

/**
 * The Hex N mark on its 24-unit grid.
 * @param {string} color - Stroke color.
 * @param {string} accent - Vertex color.
 * @returns {string} SVG fragment.
 */
function mark(color, accent) {
  return [
    `<path d="M12 2.2L20.5 7.1V16.9L12 21.8L3.5 16.9V7.1L12 2.2Z" stroke="${color}" stroke-width="1.75" stroke-linejoin="round"/>`,
    `<path d="M8 7.5V16.5M16 7.5V16.5M8 7.5L16 16.5" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<circle cx="8" cy="7.5" r="1.25" fill="${accent}"/>`,
    `<circle cx="16" cy="16.5" r="1.25" fill="${accent}"/>`,
    `<circle cx="12" cy="12" r="1.4" fill="${accent}"/>`,
  ].join('\n    ')
}

/**
 * Square application icon: dark tile with the emerald mark.
 * @param {number} inset - Transparent margin; macOS uses its 824-pixel icon grid.
 * @param {number} radius - Tile corner radius.
 * @returns {string} 1024-pixel SVG.
 */
function icon(inset, radius) {
  const size = 1024 - inset * 2
  const scale = (size * 0.62) / 24
  const offset = inset + (size - 24 * scale) / 2
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111827"/>
      <stop offset="1" stop-color="#05070a"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6ee7b7"/>
      <stop offset="1" stop-color="#10b981"/>
    </linearGradient>
  </defs>
  <rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${radius}" fill="url(#tile)"/>
  <rect x="${inset + 4}" y="${inset + 4}" width="${size - 8}" height="${size - 8}" rx="${radius - 4}" stroke="#34d399" stroke-opacity="0.18" stroke-width="8"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    ${mark('url(#glow)', '#34d399')}
  </g>
</svg>
`
}

/**
 * Installer welcome artwork: mark and product name on a transparent page.
 * @param {string} text - Text and stroke color.
 * @returns {string} 600x196 SVG.
 */
function installerBrand(text) {
  return `<svg width="600" height="196" viewBox="0 0 600 196" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(88 62) scale(3)">
    ${mark(text, '#10b981')}
  </g>
  <text x="180" y="116" font-family="${FONT}" font-size="44" font-weight="500" fill="${text}">Nexus Harness</text>
</svg>
`
}

const icons = { 'icon': icon(0, 230), 'icon-macos': icon(100, 185), 'icon-windows': icon(32, 192) }
for (const [name, svg] of Object.entries(icons)) {
  await writeFile(path(`resources/${name}.svg`), svg)
  await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(path(`resources/${name}.png`))
}

// The welcome window wordmark follows the page palette through the inherited CSS variable.
await writeFile(path('renderer/assets/welcome-brand.svg'), `<svg width="472" height="40" viewBox="0 0 472 40" fill="none" xmlns="http://www.w3.org/2000/svg">
<style>
  :root { --dsw-alias-label-primary: #0f1115; }
  @media (prefers-color-scheme: dark) { :root { --dsw-alias-label-primary: #f9fafb; } }
</style>
<g transform="translate(118 4) scale(1.3333)">
  ${mark('var(--dsw-alias-label-primary)', '#10b981')}
</g>
<text x="162" y="29" font-family="${FONT}" font-size="25" font-weight="500" fill="var(--dsw-alias-label-primary)">Nexus Harness</text>
</svg>
`)

for (const [name, text] of [['brand', '#0f1115'], ['brand-dark', '#f9fafb']]) {
  const svg = Buffer.from(installerBrand(text))
  await sharp(svg).resize(600, 196).png().toFile(path(`installer/assets/${name}.png`))
  await sharp(svg, { density: 144 }).resize(1200, 392).png().toFile(path(`installer/assets/${name}-2x.png`))
}

await sharp(Buffer.from(`<svg width="164" height="314" viewBox="0 0 164 314" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#111827"/><stop offset="1" stop-color="#05070a"/></linearGradient></defs>
  <rect width="164" height="314" fill="url(#bg)"/>
  <g transform="translate(42 40) scale(3.3333)" fill="none">
    ${mark('#34d399', '#6ee7b7')}
  </g>
  <text x="82" y="160" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="17" font-weight="600" fill="#f9fafb">Nexus Harness</text>
</svg>`)).flatten({ background: '#05070a' }).png().toFile(path('installer/assets/uninstaller-sidebar.png'))
