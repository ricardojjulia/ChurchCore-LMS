'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Maximize2, Minimize2, RotateCcw, CheckCircle2, Award, Sparkles } from 'lucide-react'
import { submitH5PProgress } from '@/app/actions/learning'
import { normalizeH5PEmbedUrl } from '@/lib/h5p/parser'
import type { CourseBlock, H5PContent } from '@/types/blocks'

interface Props {
  block: CourseBlock
  submission?: {
    status: string
    score: number | null
    max_score: number | null
    grade_pct: number | null
  } | null
  onComplete?: (xpAwarded: number) => void
}

export default function H5PPlayer({ block, submission, onComplete }: Props) {
  const t = useTranslations()
  const content = (block.content ?? {}) as unknown as H5PContent
  const embedUrl = normalizeH5PEmbedUrl(content.url || content.embed_code || '')
  const packageUrl = content.package_url

  const activeSrc = embedUrl || packageUrl || ''

  const passingScorePct = content.passing_score_pct ?? 70
  const requirePassing = content.require_passing ?? true
  const aspectRatio = content.aspect_ratio ?? '16:9'

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const [scoreData, setScoreData] = useState<{
    score?: number
    maxScore?: number
    gradePct?: number
    passed?: boolean
  } | null>(
    submission?.grade_pct !== undefined && submission?.grade_pct !== null
      ? {
          score: submission.score ?? undefined,
          maxScore: submission.max_score ?? undefined,
          gradePct: submission.grade_pct,
          passed: submission.grade_pct >= passingScorePct,
        }
      : null
  )
  const [isCompleted, setIsCompleted] = useState(Boolean(submission))
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  // Listen for H5P xAPI statements posted via window postMessage
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!event.data) return

      try {
        let payload = event.data
        if (typeof payload === 'string' && payload.startsWith('{') && payload.endsWith('}')) {
          payload = JSON.parse(payload)
        }

        // H5P standard resize event
        if (payload?.context === 'h5p' && payload?.action === 'resize' && payload?.height) {
          if (iframeRef.current && aspectRatio === 'auto') {
            iframeRef.current.style.height = `${payload.height}px`
          }
        }

        // H5P xAPI statement detection
        const statement = payload?.statement || (payload?.verb ? payload : null)
        if (statement && statement.verb) {
          const verbId = statement.verb.id || ''
          const isCompletedVerb =
            verbId.includes('completed') ||
            verbId.includes('passed') ||
            verbId.includes('answered') ||
            verbId.includes('mastered')

          const result = statement.result
          let currentScore: number | undefined
          let maxScore: number | undefined
          let pct: number | undefined

          if (result?.score) {
            currentScore = result.score.raw
            maxScore = result.score.max
            if (result.score.scaled !== undefined) {
              pct = Math.round(result.score.scaled * 100)
            } else if (currentScore !== undefined && maxScore && maxScore > 0) {
              pct = Math.round((currentScore / maxScore) * 100)
            }
          }

          if (isCompletedVerb || pct !== undefined) {
            const passed = pct !== undefined ? pct >= passingScorePct : true
            setScoreData({ score: currentScore, maxScore, gradePct: pct, passed })

            // Auto-submit if passed or completed
            if (passed || !requirePassing) {
              handleProgressSubmit(currentScore, maxScore, 'completed', statement)
            }
          }
        }
      } catch {
        // Ignore unparseable non-H5P messages
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [passingScorePct, requirePassing, aspectRatio])

  function handleProgressSubmit(
    score?: number,
    maxScore?: number,
    status: 'passed' | 'completed' | 'failed' = 'completed',
    xApiStatement?: Record<string, unknown>
  ) {
    startTransition(async () => {
      const res = await submitH5PProgress({
        blockId: block.id,
        score,
        maxScore,
        completionStatus: status,
        xApiStatement,
      })

      if (res.error) {
        setMessage(res.error)
      } else {
        setIsCompleted(true)
        setMessage('Activity successfully completed! Progress saved.')
        if (res.xpAwarded) {
          onComplete?.(res.xpAwarded)
        }
      }
    })
  }

  function toggleFullscreen() {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }

  function handleRestart() {
    setIframeKey((prev) => prev + 1)
  }

  if (!activeSrc) {
    return (
      <div className="card-crisp p-8 text-center text-slate-400">
        <Sparkles className="w-8 h-8 text-fuchsia-400 mx-auto mb-2" />
        <p className="font-semibold text-white">{t('learning.h5p.badge')}</p>
        <p className="text-xs text-slate-400 mt-1">
          {t('learning.h5p.notConfigured')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Top Banner / Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-fuchsia-950/70 text-fuchsia-300 border border-fuchsia-800/70 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            {t('learning.h5p.badge')}
          </span>
          {scoreData?.gradePct !== undefined && (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                scoreData.passed
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/70'
                  : 'bg-amber-950/70 text-amber-300 border-amber-800/70'
              }`}
            >
              {t('learning.h5p.scoreTemplate', { score: scoreData.gradePct })}{' '}
              {scoreData.passed ? t('learning.h5p.passed') : t('learning.h5p.belowPassing')}
            </span>
          )}
          {isCompleted && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/70 text-emerald-300 border border-emerald-800/70 text-xs font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t('learning.h5p.completed')}
            </span>
          )}
        </div>

        {/* Toolbar buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRestart}
            title="Restart activity"
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Interactive Viewport */}
      <div
        ref={containerRef}
        className={`relative w-full rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl transition-all ${
          isFullscreen
            ? 'fixed inset-0 z-50 rounded-none border-0 h-screen p-4 flex flex-col justify-center bg-black'
            : aspectRatio === '16:9'
            ? 'aspect-video'
            : aspectRatio === '4:3'
            ? 'aspect-[4/3]'
            : aspectRatio === '1:1'
            ? 'aspect-square'
            : 'min-h-[500px]'
        }`}
      >
        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={activeSrc}
          title={block.title || 'H5P Interactive Activity'}
          className="w-full h-full border-0 rounded-xl"
          allow="autoplay; fullscreen; microphone; camera; midi; encrypted-media"
          allowFullScreen
        />
      </div>

      {/* Feedback / Manual Confirmation */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="text-xs text-slate-400">
          {requirePassing ? (
            <span>{t('learning.h5p.passingRequirementTemplate', { pct: passingScorePct })}</span>
          ) : (
            <span>{t('learning.h5p.completeToProgress')}</span>
          )}
        </div>

        {!isCompleted && (
          <button
            type="button"
            disabled={pending}
            onClick={() => handleProgressSubmit(scoreData?.score, scoreData?.maxScore, 'completed')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {pending ? 'Saving…' : t('learning.h5p.confirmCompletedButton')}
          </button>
        )}
      </div>

      {message && (
        <div className="rounded-xl border border-fuchsia-900/60 bg-fuchsia-950/40 p-3 text-xs text-fuchsia-200 flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{message}</span>
        </div>
      )}
    </div>
  )
}
