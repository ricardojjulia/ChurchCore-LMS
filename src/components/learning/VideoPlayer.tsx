'use client'

import { useState, useTransition } from 'react'
import { markVideoWatched } from '@/app/actions/learning'

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m?.[1] ?? null
}

function extractVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(\d+)/)
  return m?.[1] ?? null
}

interface Props {
  url:              string
  title:            string
  blockId?:         string
  durationMinutes?: number
  mustView?:        boolean
  existingSub?:     { status: string } | null
  onComplete?:      (xpAwarded: number) => void
}

export default function VideoPlayer({ url, title, blockId, durationMinutes, mustView, existingSub, onComplete }: Props) {
  const ytId    = extractYouTubeId(url)
  const vimeoId = extractVimeoId(url)

  const alreadyWatched = !!existingSub
  const [watched,  setWatched]  = useState(alreadyWatched)
  const [error,    setError]    = useState<string | null>(null)
  const [pending,  startTransition] = useTransition()

  function handleMarkWatched() {
    if (!blockId) return
    startTransition(async () => {
      const res = await markVideoWatched(blockId)
      if (res.error) { setError(res.error); return }
      setWatched(true)
      onComplete?.(0)
    })
  }

  const embed = ytId ? (
    <div className="aspect-video w-full rounded-xl overflow-hidden border border-border">
      <iframe
        src={`https://www.youtube.com/embed/${ytId}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full"
      />
    </div>
  ) : vimeoId ? (
    <div className="aspect-video w-full rounded-xl overflow-hidden border border-border">
      <iframe
        src={`https://player.vimeo.com/video/${vimeoId}`}
        title={title}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        className="w-full h-full"
      />
    </div>
  ) : (
    <div className="rounded-xl overflow-hidden border border-border">
      <video src={url} controls className="w-full" title={title} />
    </div>
  )

  return (
    <div className="space-y-3">
      {embed}

      {/* Duration + must_view meta */}
      {(durationMinutes || mustView) && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {durationMinutes && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true">⏱</span> ~{durationMinutes} min
            </span>
          )}
          {mustView && !watched && (
            <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
              <span aria-hidden="true">👁</span> Watch required to mark complete
            </span>
          )}
          {mustView && watched && (
            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
              <span aria-hidden="true">✅</span> Watched
            </span>
          )}
        </div>
      )}

      {/* Mark as Watched button — only shown when mustView=true and not yet confirmed */}
      {mustView && !watched && blockId && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={handleMarkWatched}
            disabled={pending}
            className="self-start inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {pending ? 'Saving…' : '✓ Mark as Watched'}
          </button>
          {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}
        </div>
      )}
    </div>
  )
}
