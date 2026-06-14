'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/dashboard',      label: 'Dashboard',     staffOnly: false, adminOnly: false, msgBadge: false },
  { href: '/courses',        label: 'Courses',       staffOnly: false, adminOnly: false, msgBadge: false },
  { href: '/performance',    label: 'Grades',        staffOnly: false, adminOnly: false, msgBadge: false },
  { href: '/certificates',   label: 'Certificates',  staffOnly: false, adminOnly: false, msgBadge: false },
  { href: '/leaderboard',    label: 'Leaderboard',   staffOnly: false, adminOnly: false, msgBadge: false },
  { href: '/messages',       label: 'Messages',      staffOnly: false, adminOnly: false, msgBadge: true  },
  { href: '/announcements',  label: 'Announcements', staffOnly: false, adminOnly: false, msgBadge: false },
  { href: '/calendar',       label: 'Calendar',      staffOnly: false, adminOnly: false, msgBadge: false },
  { href: '/hq',             label: 'HQ',            staffOnly: true,  adminOnly: false, msgBadge: false },
  { href: '/admin/users',    label: 'Users',         staffOnly: false, adminOnly: true,  msgBadge: false },
]

interface Props {
  isStaff:      boolean
  isAdmin:      boolean
  messageCount?: number
}

export default function NavLinks({ isStaff, isAdmin, messageCount = 0 }: Props) {
  const pathname = usePathname()

  return (
    <div className="flex items-center gap-1">
      {LINKS.filter((l) => {
        if (l.adminOnly) return isAdmin
        if (l.staffOnly) return isStaff
        return true
      }).map(({ href, label, msgBadge }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        const count  = msgBadge ? messageCount : 0

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              active
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            )}
          >
            {label}
            {count > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
