import { createElement } from 'react'

const ROLE_NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' } as const

/** A chess piece drawn with the board's own piece set, so it never depends on system fonts. */
export function PieceIcon({ role, color, className = '' }: { role: keyof typeof ROLE_NAMES; color: 'w' | 'b'; className?: string }) {
  return (
    <span className={`cg-wrap piece-icon ${className}`} aria-hidden="true">
      {createElement('piece', { className: `${ROLE_NAMES[role]} ${color === 'w' ? 'white' : 'black'}` })}
    </span>
  )
}

export function ThemeIcon({ theme }: { theme: 'system' | 'light' | 'dark' }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, 'aria-hidden': true }
  if (theme === 'light')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  if (theme === 'dark')
    return (
      <svg {...common}>
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
      </svg>
    )
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
    </svg>
  )
}

/** Navigation arrows drawn as SVG: the ⏮ ◀ ▶ ⏭ characters turn into colored emoji on some phones. */
export function NavIcon({ dir }: { dir: 'first' | 'prev' | 'next' | 'last' }) {
  const tri = dir === 'prev' || dir === 'first' ? 'M15 5L7 12l8 7z' : 'M9 5l8 7-8 7z'
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="nav-icon">
      <path d={tri} />
      {dir === 'first' && <rect x="4" y="5" width="2.5" height="14" rx="1" />}
      {dir === 'last' && <rect x="17.5" y="5" width="2.5" height="14" rx="1" />}
    </svg>
  )
}
