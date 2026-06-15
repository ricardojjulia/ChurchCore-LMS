'use client'

import { useEffect, useState } from 'react'

type Provider = 'zoom' | 'meet' | 'teams' | 'youtube' | 'other'

const PROVIDER_LABEL: Record<Provider, string> = {
  zoom:    'Zoom',
  meet:    'Google Meet',
  teams:   'Microsoft Teams',
  youtube: 'YouTube Live',
  other:   'Live Session',
}

const PROVIDER_COLOR: Record<Provider, string> = {
  zoom:    'bg-blue-600 hover:bg-blue-700',
  meet:    'bg-emerald-600 hover:bg-emerald-700',
  teams:   'bg-violet-600 hover:bg-violet-700',
  youtube: 'bg-rose-600 hover:bg-rose-700',
  other:   'bg-indigo-600 hover:bg-indigo-700',
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00'
  const totalSecs = Math.floor(ms / 1000)
  const days      = Math.floor(totalSecs / 86400)
  const hours     = Math.floor((totalSecs % 86400) / 3600)
  const minutes   = Math.floor((totalSecs % 3600) / 60)
  const secs      = totalSecs % 60
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
  return `${minutes}m ${secs}s`
}

interface Props {
  title:          string
  meetingUrl:     string
  scheduledFor?:  string | null
  durationMin?:   number | null
  provider?:      string | null
  recordingUrl?:  string | null
  description?:   string | null
}

export default function LiveSessionPlayer({
  title,
  meetingUrl,
  scheduledFor,
  durationMin,
  provider,
  recordingUrl,
  description,
}: Props) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const prov   = (provider ?? 'other') as Provider
  const label  = PROVIDER_LABEL[prov] ?? PROVIDER_LABEL.other
  const color  = PROVIDER_COLOR[prov] ?? PROVIDER_COLOR.other

  const startMs = scheduledFor ? new Date(scheduledFor).getTime() : null
  const endMs   = startMs && durationMin ? startMs + durationMin * 60_000 : null

  const msUntilStart = startMs ? startMs - now : null
  const isLive       = startMs !== null && now >= startMs && (endMs === null || now < endMs)
  const isEnded      = endMs !== null && now >= endMs
  const canJoin      = !startMs || (msUntilStart !== null && msUntilStart <= 15 * 60_000 && !isEnded)

  return (
    <div className="space-y-4">
      {/* Session card */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border-b border-border px-5 py-4 flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">🎙️</span>
          <div>
            <p className="font-bold text-foreground leading-snug">{title}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
          {isLive && (
            <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              LIVE
            </span>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">
          {description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          )}

          {/* Date/time */}
          {scheduledFor && (
            <div className="flex items-start gap-3 text-sm">
              <span className="text-lg mt-0.5" aria-hidden="true">📅</span>
              <div>
                <p className="font-semibold text-foreground">
                  {new Date(scheduledFor).toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </p>
                <p className="text-muted-foreground">
                  {new Date(scheduledFor).toLocaleTimeString('en-US', {
                    hour: '2-digit', minute: '2-digit',
                  })}
                  {durationMin ? ` · ${durationMin} min` : ''}
                </p>
              </div>
            </div>
          )}

          {/* Countdown */}
          {msUntilStart !== null && msUntilStart > 0 && !isEnded && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-center">
              <p className="text-xs text-indigo-500 font-semibold uppercase tracking-widest mb-1">
                Starting in
              </p>
              <p className="text-2xl font-extrabold text-indigo-700 tabular-nums">
                {formatCountdown(msUntilStart)}
              </p>
            </div>
          )}

          {/* Status banners */}
          {isEnded && !recordingUrl && (
            <div className="bg-slate-50 border border-border rounded-lg px-4 py-3 text-center text-sm text-muted-foreground">
              This session has ended.
            </div>
          )}

          {/* Join button */}
          {!isEnded && meetingUrl && (
            <a
              href={canJoin ? meetingUrl : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!canJoin}
              className={`
                inline-flex items-center gap-2 w-full justify-center py-3 px-5 rounded-xl
                text-white font-bold text-sm transition-colors
                ${canJoin
                  ? color
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed pointer-events-none'
                }
              `}
            >
              {isLive ? '🔴 Join Now' : canJoin ? `Join ${label}` : `Opens 15 min before start`}
            </a>
          )}

          {/* Recording */}
          {recordingUrl && (
            <a
              href={recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80 underline transition-colors"
            >
              🎬 View Recording
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
