'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, BookOpen, BarChart3, BarChart2, Award, Trophy,
  MessageCircle, Megaphone, Calendar, Users, Shield, Zap,
  UserCog, Layers, Clock, FileText, Sparkles, Activity,
  ChevronLeft, ChevronRight, GitBranch, CreditCard,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebar } from './SidebarContext'
import NotificationBell from './NotificationBell'
import GlobalSearch from './GlobalSearch'
import SignOutButton from './SignOutButton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface NavLink {
  href:              string
  label:             string
  Icon:              LucideIcon
  staffOnly?:        boolean
  adminOnly?:        boolean
  guardianOnly?:     boolean
  platformAdminOnly?: boolean
  msgBadge?:         boolean
  healthBadge?:      boolean
  featureGate?:      string
}

const LINKS: NavLink[] = [
  { href: '/dashboard',          label: 'Dashboard',       Icon: LayoutDashboard },
  { href: '/courses',            label: 'Courses',         Icon: BookOpen },
  { href: '/performance',        label: 'Grades',          Icon: BarChart3 },
  { href: '/reports',            label: 'Reports',         Icon: BarChart2,  featureGate: 'reporting' },
  { href: '/certificates',       label: 'Certificates',    Icon: Award },
  { href: '/leaderboard',        label: 'Leaderboard',     Icon: Trophy,     featureGate: 'leaderboard' },
  { href: '/messages',           label: 'Messages',        Icon: MessageCircle, msgBadge: true },
  { href: '/announcements',      label: 'Announcements',   Icon: Megaphone },
  { href: '/calendar',           label: 'Calendar',        Icon: Calendar },
  { href: '/my-groups',          label: 'My Groups',       Icon: Users },
  { href: '/guardian',           label: 'Guardian Portal', Icon: Shield,         guardianOnly: true,    featureGate: 'guardian_portal' },
  { href: '/hq',                 label: 'HQ',              Icon: Zap,            staffOnly: true,       featureGate: 'hq' },
  { href: '/admin/users',        label: 'Users',           Icon: UserCog,        adminOnly: true },
  { href: '/admin/cohorts',      label: 'Cohorts',         Icon: Users,          adminOnly: true },
  { href: '/admin/sections',     label: 'Sections',        Icon: Layers,         adminOnly: true },
  { href: '/admin/terms',        label: 'Terms',           Icon: Clock,          adminOnly: true },
  { href: '/admin/program-tracks', label: 'Program Tracks', Icon: GitBranch,     adminOnly: true },
  { href: '/admin/blueprints',   label: 'Blueprints',      Icon: FileText,       adminOnly: true },
  { href: '/admin/ai-analytics', label: 'AI Analytics',    Icon: Sparkles,       adminOnly: true,       featureGate: 'ai_tutor' },
  { href: '/admin/billing',      label: 'Billing',         Icon: CreditCard,     adminOnly: true },
  { href: '/admin/health',       label: 'System Health',   Icon: Activity,       adminOnly: true,       healthBadge: true },
  { href: '/platform',           label: 'Platform Admin',  Icon: Shield,         platformAdminOnly: true },
]

interface Props {
  isStaff:          boolean
  isAdmin:          boolean
  isGuardian:       boolean
  isPlatformAdmin:  boolean
  uid:              string | null
  initial:          string
  displayName:      string | null
  messageCount:     number
  healthErrorCount: number
  features:         Record<string, boolean>
}

function NavItem({
  link, collapsed, pathname, messageCount, healthErrorCount,
}: {
  link:             NavLink
  collapsed:        boolean
  pathname:         string
  messageCount:     number
  healthErrorCount: number
}) {
  const { href, label, Icon, msgBadge, healthBadge } = link
  const active     = pathname === href || pathname.startsWith(href + '/')
  const badgeCount = msgBadge ? messageCount : healthBadge ? healthErrorCount : 0

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors relative',
        active
          ? 'bg-slate-800 text-white'
          : 'text-slate-400 hover:text-white hover:bg-slate-800',
        collapsed && 'justify-center gap-0 px-2',
      )}
    >
      <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />

      <span className={cn(
        'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200',
        collapsed ? 'max-w-0 opacity-0' : 'max-w-[160px] opacity-100',
      )}>
        {label}
      </span>

      {badgeCount > 0 && (
        <span className={cn(
          'min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold',
          'flex items-center justify-center leading-none',
          collapsed ? 'absolute top-0.5 right-0.5' : 'ml-auto shrink-0',
        )}>
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </Link>
  )
}

function SectionDivider({ label, collapsed }: { label: string; collapsed: boolean }) {
  return (
    <div className={cn('pt-3 pb-1', collapsed ? 'px-2' : 'px-2')}>
      {collapsed
        ? <div className="border-t border-slate-800" />
        : <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 px-0">{label}</p>
      }
    </div>
  )
}

export default function SidebarClient({
  isStaff, isAdmin, isGuardian, isPlatformAdmin, uid, initial, displayName,
  messageCount, healthErrorCount, features,
}: Props) {
  const { collapsed, toggle } = useSidebar()
  const pathname = usePathname()

  const visible = (l: NavLink) => !l.featureGate || features[l.featureGate] !== false

  const main      = LINKS.filter(l => !l.adminOnly && !l.staffOnly && !l.guardianOnly && !l.platformAdminOnly && visible(l))
  const guardian  = LINKS.filter(l => l.guardianOnly && isGuardian && visible(l))
  const staff     = LINKS.filter(l => l.staffOnly    && isStaff    && visible(l))
  const admin     = LINKS.filter(l => l.adminOnly    && isAdmin     && visible(l))
  const platform  = LINKS.filter(l => l.platformAdminOnly && isPlatformAdmin)

  const linkProps = { collapsed, pathname, messageCount, healthErrorCount }

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col',
        'fixed left-0 top-0 bottom-0 z-40',
        'bg-slate-900 border-r border-slate-800',
        'transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      {/* Header: logo + toggle */}
      <div className={cn(
        'flex items-center h-14 shrink-0 border-b border-slate-800',
        collapsed ? 'justify-center px-2' : 'px-3 gap-2',
      )}>
        {!collapsed && (
          <Link
            href="/dashboard"
            className="flex-1 min-w-0"
          >
            <img
              src="/assets/brand/logo-horizontal-dark.svg"
              alt="ChurchCore LMS"
              className="h-9 w-auto"
            />
          </Link>
        )}
        <button
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'shrink-0 flex items-center justify-center rounded-lg transition-colors',
            'text-slate-500 hover:text-white hover:bg-slate-800',
            collapsed ? 'w-10 h-10' : 'w-7 h-7',
          )}
        >
          {collapsed
            ? <ChevronRight className="w-4 h-4" />
            : <ChevronLeft  className="w-4 h-4" />
          }
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5" aria-label="Main navigation">
        {main.map(link => <NavItem key={link.href} link={link} {...linkProps} />)}

        {guardian.length > 0 && (
          <>
            <SectionDivider label="Guardian" collapsed={collapsed} />
            {guardian.map(link => <NavItem key={link.href} link={link} {...linkProps} />)}
          </>
        )}

        {staff.length > 0 && (
          <>
            <SectionDivider label="Staff" collapsed={collapsed} />
            {staff.map(link => <NavItem key={link.href} link={link} {...linkProps} />)}
          </>
        )}

        {admin.length > 0 && (
          <>
            <SectionDivider label="Admin" collapsed={collapsed} />
            {admin.map(link => <NavItem key={link.href} link={link} {...linkProps} />)}
          </>
        )}

        {platform.length > 0 && (
          <>
            <SectionDivider label="Platform" collapsed={collapsed} />
            {platform.map(link => <NavItem key={link.href} link={link} {...linkProps} />)}
          </>
        )}
      </nav>

      {/* Bottom tray: search, notifications, profile */}
      <div className="border-t border-slate-800 px-2 py-3 space-y-1 shrink-0">
        <GlobalSearch variant="sidebar" collapsed={collapsed} />

        {uid && (
          <NotificationBell userId={uid} sidebar collapsed={collapsed} />
        )}

        {/* Profile + sign out */}
        <div className={cn(
          'flex items-center rounded-lg transition-colors',
          'text-slate-400 hover:text-white hover:bg-slate-800',
          collapsed ? 'justify-center p-2' : 'gap-2 px-2 py-1.5',
        )}>
          <Link
            href="/profile"
            title={collapsed ? 'Profile' : undefined}
            className={cn('flex items-center gap-2 min-w-0', !collapsed && 'flex-1')}
          >
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                {initial}
              </AvatarFallback>
            </Avatar>
            <span className={cn(
              'overflow-hidden whitespace-nowrap text-xs font-medium text-white transition-[max-width,opacity] duration-200',
              collapsed ? 'max-w-0 opacity-0' : 'max-w-[120px] opacity-100',
            )}>
              {displayName ?? 'Profile'}
            </span>
          </Link>

          {!collapsed && <SignOutButton />}
        </div>
      </div>
    </aside>
  )
}
