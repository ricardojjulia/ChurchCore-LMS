'use client'

import Link from 'next/link'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type CourseStatus = 'draft' | 'published' | 'archived' | 'suspended'

interface Props {
  id: string
  title: string
  description?: string | null
  status?: CourseStatus
  minRequiredLevel?: number
  blueprintCode?: string
  showStatus?: boolean
  /** Extra footer links beyond the default "View →" */
  actions?: React.ReactNode
  /** When set, wraps the entire card in a link */
  href?: string
}

const STATUS_BADGE: Record<CourseStatus, { label: string; className: string }> = {
  published: { label: 'Live',      className: 'bg-emerald-950/70 text-emerald-400 border-emerald-800/70' },
  draft:     { label: 'Draft',     className: 'bg-amber-950/70 text-amber-300 border-amber-800/70' },
  archived:  { label: 'Archived',  className: 'bg-slate-900 text-slate-400 border-slate-800' },
  suspended: { label: 'Suspended', className: 'bg-rose-950/70 text-rose-400 border-rose-800/70' },
}

export default function CourseCard({
  id,
  title,
  description,
  status,
  minRequiredLevel,
  blueprintCode,
  showStatus = false,
  actions,
  href,
}: Props) {
  const Wrapper = href
    ? ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <Link href={href} className={className}>{children}</Link>
      )
    : ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <div className={className}>{children}</div>
      )

  const badgeInfo = status ? STATUS_BADGE[status] : null

  return (
    <Wrapper className="block group h-full">
      <div className={cn(
        'card-crisp h-full flex flex-col justify-between overflow-hidden transition-all duration-200',
        href && 'hover:border-indigo-500/50 hover:shadow-lg cursor-pointer'
      )}>
        <div className="p-6 flex-1">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-bold text-white leading-snug group-hover:text-amber-300 transition-colors">{title}</h3>
            {showStatus && badgeInfo && (
              <Badge
                variant="outline"
                className={cn('shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md border', badgeInfo.className)}
              >
                {badgeInfo.label}
              </Badge>
            )}
          </div>

          {blueprintCode && (
            <span className="inline-block text-[10px] font-mono font-semibold text-indigo-300 bg-indigo-950/80 border border-indigo-800/70 px-2 py-0.5 rounded-md mb-2">
              {blueprintCode}
            </span>
          )}

          {description && (
            <p className="text-sm text-slate-400 line-clamp-2 mb-3">{description}</p>
          )}

          {minRequiredLevel && minRequiredLevel > 1 && (
            <p className="text-xs font-semibold text-indigo-400">
              Requires Level {minRequiredLevel}
            </p>
          )}
        </div>

        <div className="border-t border-slate-800/80 px-6 py-3 bg-slate-950/40 flex items-center justify-between">
          <Link
            href={`/courses/${id}`}
            className="text-sm font-semibold text-amber-300 hover:text-amber-200 transition-colors flex items-center gap-1 group-hover:translate-x-0.5 transition-transform"
            onClick={(e) => e.stopPropagation()}
          >
            <span>View</span>
            <span>→</span>
          </Link>
          {actions}
        </div>
      </div>
    </Wrapper>
  )
}
