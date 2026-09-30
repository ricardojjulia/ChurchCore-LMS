'use client'

import { useState } from 'react'
import { getPrebuiltRubricTemplates, saveBlockRubric } from '@/app/actions/rubrics'
import type { AssignmentRubric, RubricCriterion } from '@/types/rubrics'

interface Props {
  blockId: string
  existingRubric?: AssignmentRubric
  onSaved?: (rubric: AssignmentRubric) => void
}

export default function RubricBuilderModal({
  blockId,
  existingRubric,
  onSaved,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [rubric, setRubric] = useState<AssignmentRubric>(
    existingRubric ?? {
      title: 'Assignment Grading Rubric',
      criteria: [
        {
          id: 'c1',
          title: 'Theological & Biblical Accuracy',
          description: 'Faithful grounding in Scripture and historical doctrine.',
          levels: [
            { id: 'l4', label: 'Exemplary', points: 25, description: 'Exceptional clarity and biblical support.' },
            { id: 'l3', label: 'Proficient', points: 20, description: 'Sound theological grounding.' },
            { id: 'l2', label: 'Developing', points: 15, description: 'Needs stronger textual support.' },
            { id: 'l1', label: 'Beginning', points: 10, description: 'Lacks biblical backing.' },
          ],
        },
      ],
    }
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLoadTemplate(index: number) {
    const templates = await getPrebuiltRubricTemplates()
    if (templates[index]) {
      setRubric(templates[index])
    }
  }

  function addCriterion() {
    const newId = `crit_${Date.now()}`
    const newCrit: RubricCriterion = {
      id: newId,
      title: 'New Criterion',
      levels: [
        { id: `${newId}_4`, label: 'Exemplary', points: 25, description: '' },
        { id: `${newId}_3`, label: 'Proficient', points: 20, description: '' },
        { id: `${newId}_2`, label: 'Developing', points: 15, description: '' },
        { id: `${newId}_1`, label: 'Beginning', points: 10, description: '' },
      ],
    }
    setRubric((prev) => ({
      ...prev,
      criteria: [...prev.criteria, newCrit],
    }))
  }

  function removeCriterion(index: number) {
    setRubric((prev) => ({
      ...prev,
      criteria: prev.criteria.filter((_, i) => i !== index),
    }))
  }

  async function handleSave() {
    setError(null)
    setLoading(true)

    try {
      const res = await saveBlockRubric({
        blockId,
        rubric,
      })

      if (res.error) {
        setError(res.error)
        return
      }

      onSaved?.(rubric)
      setIsOpen(false)
    } catch {
      setError('Failed to save rubric.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors border border-indigo-200 dark:border-indigo-800"
      >
        <span>📊</span>
        <span>{existingRubric ? 'Edit Grading Rubric' : 'Attach Grading Rubric'}</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b pb-4 dark:border-slate-800">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  Grading Rubric Builder
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Define structured assessment criteria and point scales.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                ✕
              </button>
            </div>

            {error && (
              <div role="alert" className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 dark:text-red-300 text-xs rounded-xl">
                {error}
              </div>
            )}

            {/* Template Selector */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Load Preset Template:
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadTemplate(0)}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-slate-700 border text-slate-800 dark:text-slate-200 hover:bg-slate-100"
                >
                  Exegesis Paper
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadTemplate(1)}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-slate-700 border text-slate-800 dark:text-slate-200 hover:bg-slate-100"
                >
                  Expository Sermon
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Rubric Title
              </label>
              <input
                type="text"
                value={rubric.title}
                onChange={(e) => setRubric({ ...rubric, title: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Criteria List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Assessment Criteria ({rubric.criteria.length})
                </h4>
                <button
                  type="button"
                  onClick={addCriterion}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  + Add Criterion
                </button>
              </div>

              {rubric.criteria.map((crit, cIdx) => (
                <div
                  key={crit.id || cIdx}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <input
                      type="text"
                      value={crit.title}
                      onChange={(e) => {
                        const next = [...rubric.criteria]
                        next[cIdx].title = e.target.value
                        setRubric({ ...rubric, criteria: next })
                      }}
                      className="font-semibold text-sm border rounded-lg px-2.5 py-1.5 flex-1 bg-white dark:bg-slate-800"
                    />
                    {rubric.criteria.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCriterion(cIdx)}
                        className="text-xs text-rose-500 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <input
                    type="text"
                    placeholder="Criterion description (optional)"
                    value={crit.description ?? ''}
                    onChange={(e) => {
                      const next = [...rubric.criteria]
                      next[cIdx].description = e.target.value
                      setRubric({ ...rubric, criteria: next })
                    }}
                    className="text-xs border rounded-lg px-2.5 py-1.5 w-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                  />

                  {/* Levels preview */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    {crit.levels.map((lvl, lIdx) => (
                      <div
                        key={lvl.id || lIdx}
                        className="p-2.5 rounded-lg border bg-white dark:bg-slate-800 text-xs space-y-1"
                      >
                        <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200">
                          <span>{lvl.label}</span>
                          <span className="text-primary">{lvl.points} pts</span>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2">
                          {lvl.description || 'No description'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="px-5 py-2 text-sm bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? 'Saving Rubric...' : 'Save Rubric'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
