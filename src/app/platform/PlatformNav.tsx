'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const PLATFORM_LINKS = [
  { href: '/platform', label: 'Tenants' },
  { href: '/platform/audit', label: 'Audit Log' },
]

export function PlatformNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Platform navigation" className="flex items-center gap-1 text-sm">
      {PLATFORM_LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded px-3 py-1.5 transition-colors',
              active
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white',
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
