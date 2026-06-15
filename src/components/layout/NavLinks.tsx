'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/dashboard',          label: 'Dashboard',       staffOnly: false, adminOnly: false, guardianOnly: false, msgBadge: false, healthBadge: false },
  { href: '/courses',            label: 'Courses',         staffOnly: false, adminOnly: false, guardianOnly: false, msgBadge: false, healthBadge: false },
  { href: '/performance',        label: 'Grades',          staffOnly: false, adminOnly: false, guardianOnly: false, msgBadge: false, healthBadge: false },
  { href: '/certificates',       label: 'Certificates',    staffOnly: false, adminOnly: false, guardianOnly: false, msgBadge: false, healthBadge: false },
  { href: '/leaderboard',        label: 'Leaderboard',     staffOnly: false, adminOnly: false, guardianOnly: false, msgBadge: false, healthBadge: false },
  { href: '/messages',           label: 'Messages',        staffOnly: false, adminOnly: false, guardianOnly: false, msgBadge: true,  healthBadge: false },
  { href: '/announcements',      label: 'Announcements',   staffOnly: false, adminOnly: false, guardianOnly: false, msgBadge: false, healthBadge: false },
  { href: '/calendar',           label: 'Calendar',        staffOnly: false, adminOnly: false, guardianOnly: false, msgBadge: false, healthBadge: false },
  { href: '/my-groups',          label: 'My Groups',       staffOnly: false, adminOnly: false, guardianOnly: false, msgBadge: false, healthBadge: false },
  { href: '/guardian',           label: 'Guardian Portal', staffOnly: false, adminOnly: false, guardianOnly: true,  msgBadge: false, healthBadge: false },
  { href: '/hq',                 label: 'HQ',              staffOnly: true,  adminOnly: false, guardianOnly: false, msgBadge: false, healthBadge: false },
  { href: '/admin/users',        label: 'Users',           staffOnly: false, adminOnly: true,  guardianOnly: false, msgBadge: false, healthBadge: false },
  { href: '/admin/cohorts',      label: 'Cohorts',         staffOnly: false, adminOnly: true,  guardianOnly: false, msgBadge: false, healthBadge: false },
  { href: '/admin/sections',     label: 'Sections',        staffOnly: false, adminOnly: true,  guardianOnly: false, msgBadge: false, healthBadge: false },
  { href: '/admin/terms',        label: 'Terms',           staffOnly: false, adminOnly: true,  guardianOnly: false, msgBadge: false, healthBadge: false },
  { href: '/admin/blueprints',   label: 'Blueprints',      staffOnly: false, adminOnly: true,  guardianOnly: false, msgBadge: false, healthBadge: false },
  { href: '/admin/ai-analytics', label: 'AI Analytics',    staffOnly: false, adminOnly: true,  guardianOnly: false, msgBadge: false, healthBadge: false },
  { href: '/admin/health',       label: 'System Health',   staffOnly: false, adminOnly: true,  guardianOnly: false, msgBadge: false, healthBadge: true  },
]

interface Props {
  isStaff:           boolean
  isAdmin:           boolean
  isGuardian?:       boolean
  messageCount?:     number
  healthErrorCount?: number
}

export default function NavLinks({
  isStaff,
  isAdmin,
  isGuardian       = false,
  messageCount     = 0,
  healthErrorCount = 0,
}: Props) {
  const pathname = usePathname()

  return (
    <div className="flex items-center gap-1">
      {LINKS.filter((l) => {
        if (l.adminOnly)    return isAdmin
        if (l.staffOnly)    return isStaff
        if (l.guardianOnly) return isGuardian
        return true
      }).map(({ href, label, msgBadge, healthBadge }) => {
        const active     = pathname === href || pathname.startsWith(href + '/')
        const badgeCount = msgBadge ? messageCount : healthBadge ? healthErrorCount : 0

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
            {badgeCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
