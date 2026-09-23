'use client'

// COUNCIL-2026-029: Learning Paths / Discipleship Tracks

import Link from 'next/link'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { LearningPathWithProgress } from '@/types/learning-path'

interface Props {
  path: LearningPathWithProgress
  /** Org slug — used to build the public path URL. Pass undefined for authenticated learner view. */
  orgSlug?: string
}

export default function LearningPathCard({ path, orgSlug }: Props) {
  const href = orgSlug
    ? `/join/${orgSlug}/paths/${path.id}`
    : `/paths/${path.id}`

  const progressPercent =
    path.totalCount > 0
      ? Math.round((path.completedCount / path.totalCount) * 100)
      : 0

  return (
    <Link href={href} className="block group">
      <Card className="h-full transition-shadow group-hover:shadow-md">
        {path.cover_image_url && (
          <div className="w-full h-36 overflow-hidden rounded-t-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={path.cover_image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <CardContent className="pt-4 pb-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-base leading-snug">{path.title}</h3>
            {!path.is_published && (
              <Badge variant="outline" className="shrink-0 text-xs bg-amber-50 text-amber-700 border-amber-200">
                Draft
              </Badge>
            )}
          </div>
          {path.description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{path.description}</p>
          )}

          {path.totalCount > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{path.completedCount} of {path.totalCount} courses complete</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary rounded-full h-1.5 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="pt-0 pb-4">
          <span className="text-sm text-primary group-hover:underline">
            {path.completedCount === path.totalCount && path.totalCount > 0
              ? '✓ Complete — view path →'
              : path.completedCount > 0
              ? 'Continue →'
              : 'Start path →'}
          </span>
        </CardFooter>
      </Card>
    </Link>
  )
}
