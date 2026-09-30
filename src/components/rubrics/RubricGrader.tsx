'use client'

import { useState } from 'react'
import { gradeWithRubric } from '@/app/actions/rubrics'
import type { AssignmentRubric, CriterionEvaluation } from '@/types/rubrics'

interface Props {
  submissionId: string
  rubric: AssignmentRubric
  initialEvaluations?: CriterionEvaluation[]
  initialFeedback?: string
  onGraded?: (score: number) => void
}

export default function RubricGrader({
  submissionId,
  rubric,
  initialEvaluations,
  initialFeedback = '',
  onGraded,
}: Props) {
  const [evaluations, setEvaluations] = useState<Record<string, { levelId: string; points: number; comments?: string }>>(
    () => {
      const map: Record<string, { levelId: string; points: number; comments?: string }> = {}
      initialEvaluations?.forEach((ev) => {
        map[ev.criterionId] = { levelId: ev.levelId, points: ev.points, comments: ev.comments }
      })
      return map
    }
  )
  const [overallFeedback, setOverallFeedback] = useState(initialFeedback)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const totalCalculatedScore = Object.values(evaluations).reduce((sum, e) => sum + (e.points || 0), 0)
  const maxPossibleScore = rubric.criteria.reduce((sum, c) => {
    const highest = Math.max(...c.levels.map((l) => l.points), 0)
    return sum + highest
  }, 0)

  function selectLevel(criterionId: string, levelId: string, points: number) {
    setEvaluations((prev) => ({
      ...prev,
      [criterionId]: {
        ...(prev[criterionId] ?? {}),
        levelId,
        points,
      },
    }))
  }

  async function handleGradeSubmit() {
    setError(null)
    setSuccess(false)
    setLoading(true)

    const evalList: CriterionEvaluation[] = Object.entries(evaluations).map(([criterionId, ev]) => ({
      criterionId,
      levelId: ev.levelId,
      points: ev.points,
      comments: ev.comments,
    }))

    try {
      const res = await gradeWithRubric({
        submissionId,
        evaluations: evalList,
        overallFeedback,
      })

      if (res.error) {
        setError(res.error)
        return
      }

      setSuccess(true)
      if (res.totalScore !== undefined) {
        onGraded?.(res.totalScore)
      }
    } catch {
      setError('Failed to submit rubric grade.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 border rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 dark:border-slate-800">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            {rubric.title}
          </h3>
          <p className="text-xs text-slate-500">
            Click a level per criterion to score this submission.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-primary">
            {totalCalculatedScore} / {maxPossibleScore}
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Calculated Rubric Score
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 text-xs rounded-xl">
          {error}
        </div>
      )}

      {success && (
        <div role="status" className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-700 text-xs rounded-xl">
          Grade successfully recorded!
        </div>
      )}

      {/* Criteria Breakdown */}
      <div className="space-y-5">
        {rubric.criteria.map((crit) => {
          const selected = evaluations[crit.id]
          return (
            <div key={crit.id} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {crit.title}
                </h4>
                {selected && (
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    {selected.points} pts awarded
                  </span>
                )}
              </div>
              {crit.description && (
                <p className="text-xs text-slate-500">{crit.description}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
                {crit.levels.map((lvl) => {
                  const isSelected = selected?.levelId === lvl.id
                  return (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => selectLevel(crit.id, lvl.id, lvl.points)}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/10 ring-2 ring-primary text-slate-900 dark:text-white shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold text-xs mb-1">
                        <span>{lvl.label}</span>
                        <span className="text-primary font-mono">{lvl.points} pts</span>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">
                        {lvl.description}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Overall Feedback */}
      <div className="pt-2 border-t dark:border-slate-800">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
          Overall Instructor Feedback
        </label>
        <textarea
          rows={3}
          value={overallFeedback}
          onChange={(e) => setOverallFeedback(e.target.value)}
          placeholder="Excellent exegesis and textual analysis. Consider expanding on the pastoral implications in section 3..."
          className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary shadow-sm"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleGradeSubmit}
          disabled={loading || Object.keys(evaluations).length === 0}
          className="px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 text-sm shadow-md"
        >
          {loading ? 'Submitting Grade...' : `Submit Rubric Grade (${totalCalculatedScore} pts)`}
        </button>
      </div>
    </div>
  )
}
