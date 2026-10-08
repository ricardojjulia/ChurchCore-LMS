import type { BadgeGraphicOptions, BadgeFrame, BadgeTheme, BadgeIcon } from './types'

const THEME_PALETTES: Record<
  BadgeTheme,
  { gradStart: string; gradEnd: string; border: string; accent: string; text: string }
> = {
  gold: {
    gradStart: '#f59e0b',
    gradEnd: '#b45309',
    border: '#fde68a',
    accent: '#78350f',
    text: '#ffffff',
  },
  silver: {
    gradStart: '#94a3b8',
    gradEnd: '#475569',
    border: '#e2e8f0',
    accent: '#1e293b',
    text: '#ffffff',
  },
  bronze: {
    gradStart: '#d97706',
    gradEnd: '#78350f',
    border: '#fed7aa',
    accent: '#451a03',
    text: '#ffffff',
  },
  indigo: {
    gradStart: '#6366f1',
    gradEnd: '#3730a3',
    border: '#c7d2fe',
    accent: '#1e1b4b',
    text: '#ffffff',
  },
  emerald: {
    gradStart: '#10b981',
    gradEnd: '#065f46',
    border: '#a7f3d0',
    accent: '#022c22',
    text: '#ffffff',
  },
  crimson: {
    gradStart: '#f43f5e',
    gradEnd: '#9f1239',
    border: '#fecdd3',
    accent: '#4c0519',
    text: '#ffffff',
  },
}

function getIconPath(icon: BadgeIcon): string {
  switch (icon) {
    case 'cross':
      return `<path d="M90 60h20v25h25v20h-25v55H90v-55H65V85h25V60z" fill="currentColor" />`
    case 'bible':
      return `<path d="M60 70c15-8 30-5 40 5 10-10 25-13 40-5v65c-15-8-30-5-40 5-10-10-25-13-40-5V70zm40 10v60" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" />`
    case 'flame':
      return `<path d="M100 55c5 15 25 30 25 55 0 20-15 35-25 35s-25-15-25-35c0-20 15-35 25-55z" fill="currentColor" />`
    case 'crown':
      return `<path d="M65 130h70l10-50-25 20-20-35-20 35-25-20 10 50z" fill="currentColor" />`
    case 'dove':
      return `<path d="M65 95c10-20 35-25 50-10 15-15 30-5 25 15-5 15-20 25-40 25-15 0-30-10-35-30z" fill="currentColor" />`
    case 'heart':
      return `<path d="M100 135l-25-25c-15-15-15-35 0-50s35-15 50 0c15-15 35-15 50 0s15 35 0 50l-75 75z" fill="currentColor" />`
    case 'shepherd':
      return `<path d="M110 65c-15-10-30 0-30 15v65" stroke="currentColor" stroke-width="8" fill="none" stroke-linecap="round" />`
    case 'star':
    default:
      return `<polygon points="100,55 112,85 145,85 118,105 128,135 100,115 72,135 82,105 55,85 88,85" fill="currentColor" />`
  }
}

function getFramePath(frame: BadgeFrame): string {
  switch (frame) {
    case 'circle':
      return `<circle cx="100" cy="100" r="82" fill="url(#bgGrad)" stroke="url(#borderGrad)" stroke-width="8" filter="url(#dropShadow)" />`
    case 'hexagon':
      return `<polygon points="100,18 175,60 175,140 100,182 25,140 25,60" fill="url(#bgGrad)" stroke="url(#borderGrad)" stroke-width="8" filter="url(#dropShadow)" />`
    case 'rosette':
      return `<path d="M100 15 L120 25 L145 20 L155 42 L178 50 L178 75 L195 90 L185 112 L195 135 L178 150 L170 175 L145 180 L130 195 L100 185 L70 195 L55 180 L30 175 L22 150 L5 135 L15 112 L5 90 L22 75 L22 50 L45 42 L55 20 L80 25 Z" fill="url(#bgGrad)" stroke="url(#borderGrad)" stroke-width="6" filter="url(#dropShadow)" />`
    case 'shield':
    default:
      return `<path d="M100 18 L170 42 C170 115 145 160 100 185 C55 160 30 115 30 42 Z" fill="url(#bgGrad)" stroke="url(#borderGrad)" stroke-width="8" filter="url(#dropShadow)" />`
  }
}

/**
 * Generates an SVG string representation of the badge graphic.
 */
export function generateBadgeSvg(options: BadgeGraphicOptions): string {
  const {
    title,
    frame = 'shield',
    theme = 'gold',
    icon = 'cross',
    issuerName = 'ChurchCore LMS',
  } = options

  const palette = THEME_PALETTES[theme] || THEME_PALETTES.gold
  const iconPath = getIconPath(icon)
  const framePath = getFramePath(frame)

  // Escape XML characters in title
  const safeTitle = (title || 'Badge')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  const safeIssuer = (issuerName || '')
    .toUpperCase()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%" aria-label="${safeTitle}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.gradStart}" />
      <stop offset="100%" stop-color="${palette.gradEnd}" />
    </linearGradient>
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.border}" />
      <stop offset="50%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="${palette.border}" />
    </linearGradient>
    <filter id="dropShadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.45" />
    </filter>
  </defs>

  <!-- Base Frame -->
  ${framePath}

  <!-- Inner Ribbon/Banner -->
  <g color="${palette.text}">
    ${iconPath}
  </g>

  <!-- Micro-Emboss Ring -->
  <circle cx="100" cy="100" r="42" fill="none" stroke="${palette.border}" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.6" />

  ${
    safeIssuer
      ? `<text x="100" y="165" font-family="system-ui, -apple-system, sans-serif" font-size="8" font-weight="700" fill="${palette.border}" text-anchor="middle" letter-spacing="1" opacity="0.85">${safeIssuer}</text>`
      : ''
  }
</svg>`
}
