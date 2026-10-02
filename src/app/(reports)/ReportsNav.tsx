'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface ReportsNavLink {
  href: string
  label: string
}

interface Props {
  links: ReportsNavLink[]
  ariaLabel: string
}

export function ReportsNav({ links, ariaLabel }: Props) {
  const pathname = usePathname()

  return (
    <nav className="no-print mt-8 space-y-1" aria-label={ariaLabel}>
      {links.map((item) => {
        const baseHref = item.href.split('#')[0]
        const active = item.href.includes('#')
          ? false
          : pathname === baseHref || pathname.startsWith(baseHref + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'block border-l-2 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-indigo-400 pl-2 text-white bg-indigo-950/40'
                : 'border-transparent text-slate-400 hover:border-slate-600 hover:bg-slate-800/40 hover:text-slate-100',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
