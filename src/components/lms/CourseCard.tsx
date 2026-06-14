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
  showStatus?: boolean
  /** Extra footer links beyond the default "View →" */
  actions?: React.ReactNode
  /** When set, wraps the entire card in a link */
  href?: string
}

const STATUS_BADGE: Record<CourseStatus, { label: string; className: string }> = {
  published: { label: 'Live',      className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  draft:     { label: 'Draft',     className: 'bg-amber-50 text-amber-700 border-amber-200' },
  archived:  { label: 'Archived',  className: 'bg-slate-100 text-slate-500 border-slate-200' },
  suspended: { label: 'Suspended', className: 'bg-rose-50 text-rose-700 border-rose-200' },
}

export default function CourseCard({
  id,
  title,
  description,
  status,
  minRequiredLevel,
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
    <Wrapper className="block group">
      <Card className={cn(
        'h-full overflow-hidden transition-all duration-150',
        href && 'hover:border-primary/40 hover:shadow-md cursor-pointer'
      )}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-bold text-foreground leading-snug">{title}</h3>
            {showStatus && badgeInfo && (
              <Badge
                variant="outline"
                className={cn('shrink-0 text-xs font-bold', badgeInfo.className)}
              >
                {badgeInfo.label}
              </Badge>
            )}
          </div>

          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{description}</p>
          )}

          {minRequiredLevel && minRequiredLevel > 1 && (
            <p className="text-xs font-semibold text-primary">
              Requires Level {minRequiredLevel}
            </p>
          )}
        </CardContent>

        <CardFooter className="border-t border-border px-6 py-3 bg-muted/30 flex gap-3">
          <Link
            href={`/courses/${id}`}
            className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            View →
          </Link>
          {actions}
        </CardFooter>
      </Card>
    </Wrapper>
  )
}
