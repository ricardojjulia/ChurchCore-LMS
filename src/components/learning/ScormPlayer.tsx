'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { Maximize2, Minimize2, RotateCcw, CheckCircle2, Award, Package, ExternalLink } from 'lucide-react'
import { submitScormCommit } from '@/app/actions/scorm'
import type { CourseBlock } from '@/types/blocks'

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

export default function ScormPlayer({ block, submission, onComplete }: Props) {
  const content = (block.content ?? {}) as Record<string, any>
  const launchPath = content.launch_path || 'index.html'
  const packagePath = content.package_path
  const scormVersion = (content.version as '1.2' | '2004') || '1.2'
  const passingScorePct = content.passing_score_pct ?? 80
  const requirePassing = content.require_passing ?? true
  const aspectRatio = content.aspect_ratio ?? '16:9'

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const [scoreData, setScoreData] = useState<{
    score?: number
    gradePct?: number
    passed?: boolean
    status?: string
  } | null>(
    submission?.grade_pct !== undefined && submission?.grade_pct !== null
      ? {
          score: submission.score ?? undefined,
          gradePct: submission.grade_pct,
          passed: submission.grade_pct >= passingScorePct,
          status: submission.status,
        }
      : null
  )
  const [isCompleted, setIsCompleted] = useState(Boolean(submission))
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  const activeSrc = packagePath
    ? `/api/scorm/package/${block.id}/${launchPath}`
    : null

  // Listen for SCORM bridge postMessages from iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!event.data || event.data.type !== 'CHURCHCORE_SCORM_EVENT') return

      const { action, cmi } = event.data
      if (!cmi) return

      // Parse score and status based on 1.2 vs 2004 CMI schema
      let rawStatus =
        cmi['cmi.core.lesson_status'] ||
        cmi['cmi.completion_status'] ||
        cmi['cmi.success_status'] ||
        ''

      let scoreRaw = cmi['cmi.core.score.raw'] ?? cmi['cmi.score.raw']
      let scoreMin = cmi['cmi.core.score.min'] ?? cmi['cmi.score.min']
      let scoreMax = cmi['cmi.core.score.max'] ?? cmi['cmi.score.max']
      let scoreScaled = cmi['cmi.score.scaled']
      let sessionTime = cmi['cmi.core.session_time'] ?? cmi['cmi.session_time']
      let suspendData = cmi['cmi.suspend_data']
      let lessonLocation = cmi['cmi.core.lesson_location'] ?? cmi['cmi.location']

      if (scoreRaw !== undefined) scoreRaw = Number(scoreRaw)
      if (scoreMin !== undefined) scoreMin = Number(scoreMin)
      if (scoreMax !== undefined) scoreMax = Number(scoreMax)
      if (scoreScaled !== undefined) scoreScaled = Number(scoreScaled)

      let pct =
        scoreScaled !== undefined
          ? Math.round(scoreScaled * 100)
          : scoreRaw !== undefined && scoreMax && scoreMax > 0
          ? Math.round((scoreRaw / scoreMax) * 100)
          : undefined

      const statusLower = String(rawStatus).toLowerCase()
      const isFinished = statusLower.includes('completed') || statusLower.includes('passed')
      const passed = pct !== undefined ? pct >= passingScorePct : isFinished

      if (pct !== undefined || isFinished) {
        setScoreData({
          score: scoreRaw,
          gradePct: pct,
          passed,
          status: statusLower,
        })
      }

      // Auto-commit on COMMIT or FINISH or when completed
      if (action === 'COMMIT' || action === 'FINISH' || isFinished) {
        startTransition(async () => {
          const res = await submitScormCommit({
            blockId: block.id,
            version: scormVersion,
            cmiData: cmi,
            lessonStatus: statusLower,
            scoreRaw,
            scoreMin,
            scoreMax,
            scoreScaled,
            sessionTime: sessionTime ? String(sessionTime) : undefined,
            suspendData: suspendData ? String(suspendData) : undefined,
            lessonLocation: lessonLocation ? String(lessonLocation) : undefined,
          })

          if (res.error) {
            setMessage(res.error)
          } else {
            if (res.isFinished) {
              setIsCompleted(true)
              setMessage('SCORM Activity successfully completed! Progress saved.')
              if (res.xpAwarded) {
                onComplete?.(res.xpAwarded)
              }
            }
          }
        })
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [block.id, scormVersion, passingScorePct, onComplete])

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
        <Package className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
        <p className="font-semibold text-white">SCORM Activity</p>
        <p className="text-xs text-slate-400 mt-1">
          SCORM package has not been uploaded or configured.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Top Banner / Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/70 text-indigo-300 border border-indigo-800/70 text-xs font-bold">
            <Package className="w-3.5 h-3.5" />
            SCORM {scormVersion}
          </span>
          {content.package_filename && (
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono">
              {content.package_filename}
            </span>
          )}
          {scoreData?.gradePct !== undefined && (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                scoreData.passed
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/70'
                  : 'bg-amber-950/70 text-amber-300 border-amber-800/70'
              }`}
            >
              Score: {scoreData.gradePct}% • {scoreData.passed ? 'Passed' : 'Below Passing'}
            </span>
          )}
          {isCompleted && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/70 text-emerald-300 border border-emerald-800/70 text-xs font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Completed
            </span>
          )}
        </div>

        {/* Toolbar buttons */}
        <div className="flex items-center gap-2">
          <a
            href={activeSrc}
            target="_blank"
            rel="noopener noreferrer"
            title="Open SCORM activity in new tab"
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700 transition-colors inline-flex items-center"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
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
          title={block.title || 'SCORM Activity'}
          className="w-full h-full border-0 rounded-xl"
          allow="autoplay; fullscreen; microphone; camera; midi; encrypted-media"
          allowFullScreen
        />
      </div>

      {/* Feedback / Manual Completion Notice */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="text-xs text-slate-400">
          {requirePassing ? (
            <span>Passing requirement: {passingScorePct}% minimum score.</span>
          ) : (
            <span>Complete the interactive package to progress.</span>
          )}
        </div>

        {!isCompleted && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const res = await submitScormCommit({
                  blockId: block.id,
                  version: scormVersion,
                  cmiData: { manual_completion: true },
                  lessonStatus: 'completed',
                  scoreRaw: 100,
                  scoreMax: 100,
                  scoreScaled: 1.0,
                })
                if (!res.error) {
                  setIsCompleted(true)
                  setMessage('SCORM Activity confirmed complete! Progress saved.')
                  if (res.xpAwarded) onComplete?.(res.xpAwarded)
                }
              })
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {pending ? 'Saving…' : 'I have completed this activity'}
          </button>
        )}
      </div>

      {message && (
        <div className="rounded-xl border border-indigo-900/60 bg-indigo-950/40 p-3 text-xs text-indigo-200 flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{message}</span>
        </div>
      )}
    </div>
  )
}
