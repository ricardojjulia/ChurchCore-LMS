'use client'

import { useState, useTransition, useMemo, useRef } from 'react'
import { setGradeCell } from '@/app/actions/gradebook'
import ExportCsvButton from '@/app/courses/[id]/analytics/ExportCsvButton'
import type { GradebookGridRow } from '@/types/reporting'

// ── Grade helpers (matching GradebookTable.tsx convention) ───────────────────

function gradeLetter(pct: number | null): string {
  if (pct === null) return '—'
  if (pct >= 90) return 'A'
  if (pct >= 80) return 'B'
  if (pct >= 70) return 'C'
  if (pct >= 60) return 'D'
  return 'F'
}

// ── Types ────────────────────────────────────────────────────────────────────

interface CellState {
  score:    number | null
  feedback: string
  status:   string | null
}

interface BlockMeta {
  id:        string
  title:     string
  sort_order: number
  max_score:  number | null
}

interface StudentRow {
  uid:  string
  name: string
}

interface Props {
  courseId:    string
  courseTitle: string
  initialRows: GradebookGridRow[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GradebookGrid({ courseId, courseTitle, initialRows }: Props) {

  // ── Derive unique students and blocks from the flat rows ──────────────────
  const { students, blocks } = useMemo(() => {
    const studentMap = new Map<string, StudentRow>()
    const blockMap   = new Map<string, BlockMeta>()

    for (const row of initialRows) {
      if (!studentMap.has(row.student_uid)) {
        studentMap.set(row.student_uid, { uid: row.student_uid, name: row.student_name })
      }
      if (!blockMap.has(row.block_id)) {
        blockMap.set(row.block_id, {
          id:         row.block_id,
          title:      row.block_title,
          sort_order: row.sort_order,
          max_score:  row.max_score,
        })
      }
    }

    const students = [...studentMap.values()]
    const blocks   = [...blockMap.values()].sort((a, b) => a.sort_order - b.sort_order)
    return { students, blocks }
  }, [initialRows])

  // ── Optimistic cell state keyed by `${blockId}:${studentUid}` ────────────
  const [cells, setCells] = useState<Map<string, CellState>>(() => {
    const m = new Map<string, CellState>()
    for (const row of initialRows) {
      m.set(`${row.block_id}:${row.student_uid}`, {
        score:    row.score,
        feedback: row.feedback ?? '',
        status:   row.status,
      })
    }
    return m
  })

  // ── Per-cell error bubbles ────────────────────────────────────────────────
  const [errors, setErrors] = useState<Map<string, string>>(new Map())

  function setError(key: string, msg: string) {
    setErrors((prev) => new Map(prev).set(key, msg))
    setTimeout(() => {
      setErrors((prev) => { const n = new Map(prev); n.delete(key); return n })
    }, 4000)
  }

  // ── Feedback popover state (one cell open at a time) ─────────────────────
  const [feedbackCell, setFeedbackCell] = useState<string | null>(null)
  const [feedbackDraft, setFeedbackDraft] = useState('')

  // ── Transition for async saves ────────────────────────────────────────────
  const [, startTransition] = useTransition()

  // ── Track the committed value for each input (for blur "did it change?") ──
  // We store refs so we can compare on blur without triggering re-renders.
  const committedScores = useRef<Map<string, string>>((() => {
    const m = new Map<string, string>()
    for (const row of initialRows) {
      m.set(`${row.block_id}:${row.student_uid}`, row.score != null ? String(row.score) : '')
    }
    return m
  })())

  // ── Save a score on blur ──────────────────────────────────────────────────
  function handleScoreBlur(
    studentUid: string,
    blockId:    string,
    rawValue:   string,
    maxScore:   number | null,
  ) {
    const key = `${blockId}:${studentUid}`
    const committed = committedScores.current.get(key) ?? ''

    if (rawValue === committed) return // nothing changed

    const trimmed = rawValue.trim()
    if (trimmed === '') return // don't save an empty score cell

    const parsed = Number(trimmed)
    if (isNaN(parsed) || parsed < 0) {
      setError(key, 'Score must be a non-negative number')
      return
    }
    if (maxScore !== null && parsed > maxScore) {
      setError(key, `Score cannot exceed ${maxScore}`)
      return
    }

    const currentFeedback = cells.get(key)?.feedback ?? ''

    // Optimistic update
    committedScores.current.set(key, rawValue)
    setCells((prev) => {
      const next = new Map(prev)
      next.set(key, { score: parsed, feedback: currentFeedback, status: 'graded' })
      return next
    })

    startTransition(async () => {
      const res = await setGradeCell({
        courseId,
        studentUid,
        blockId,
        score:    parsed,
        feedback: currentFeedback,
      })
      if (res.error) {
        // Roll back optimistic update
        committedScores.current.set(key, committed)
        setCells((prev) => {
          const next = new Map(prev)
          const prev_ = next.get(key)
          if (prev_) next.set(key, { ...prev_, score: committed ? Number(committed) : null, status: committed ? 'graded' : null })
          return next
        })
        setError(key, res.error)
      }
    })
  }

  // ── Save feedback from the popover ───────────────────────────────────────
  function handleFeedbackSave(studentUid: string, blockId: string) {
    const key = `${blockId}:${studentUid}`
    const cell = cells.get(key)
    const score = cell?.score

    if (score == null) {
      setError(key, 'Enter a score before saving feedback')
      setFeedbackCell(null)
      return
    }

    const newFeedback = feedbackDraft

    // Optimistic update
    setCells((prev) => {
      const next = new Map(prev)
      next.set(key, { score, feedback: newFeedback, status: 'graded' })
      return next
    })
    setFeedbackCell(null)

    startTransition(async () => {
      const res = await setGradeCell({
        courseId,
        studentUid,
        blockId,
        score,
        feedback: newFeedback,
      })
      if (res.error) {
        // Roll back
        setCells((prev) => {
          const next = new Map(prev)
          if (cell) next.set(key, cell)
          return next
        })
        setError(key, res.error)
      }
    })
  }

  // ── Per-student running average across graded cells ───────────────────────
  function studentAverage(studentUid: string): { pct: number | null; letter: string } {
    let totalScore = 0, totalMax = 0, hasAny = false

    for (const block of blocks) {
      const cell = cells.get(`${block.id}:${studentUid}`)
      if (cell?.score != null && block.max_score != null && block.max_score > 0) {
        totalScore += cell.score
        totalMax   += block.max_score
        hasAny = true
      }
    }

    if (!hasAny || totalMax === 0) return { pct: null, letter: '—' }
    const pct = (totalScore / totalMax) * 100
    return { pct, letter: gradeLetter(pct) }
  }

  // ── CSV export rows ───────────────────────────────────────────────────────
  const csvRows = useMemo(() => {
    return students.map((s) => {
      const row: Record<string, string | number> = { Student: s.name }
      for (const b of blocks) {
        const cell = cells.get(`${b.id}:${s.uid}`)
        row[b.title] = cell?.score ?? ''
      }
      const avg = studentAverage(s.uid)
      row['Average'] = avg.pct != null ? `${avg.pct.toFixed(1)}%` : ''
      row['Grade']   = avg.letter
      return row
    })
    // studentAverage closes only over `cells` and `blocks`, both already listed below —
    // the lint rule can't see that through the function reference, false positive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, blocks, cells])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {students.length} student{students.length !== 1 ? 's' : ''} · {blocks.length} graded block{blocks.length !== 1 ? 's' : ''}
        </p>
        {students.length > 0 && blocks.length > 0 && (
          <ExportCsvButton
            rows={csvRows}
            filename={`${courseTitle.replace(/\s+/g, '-').toLowerCase()}-gradebook.csv`}
          />
        )}
      </div>

      <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Gradebook grid for {courseTitle}</caption>
            <thead>
              <tr className="border-b border-border bg-slate-50/50">
                {/* Sticky student column header */}
                <th
                  scope="col"
                  className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky left-0 bg-slate-50/50 min-w-[200px]"
                >
                  Student / Avg
                </th>
                {blocks.map((b) => (
                  <th
                    key={b.id}
                    scope="col"
                    className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground min-w-[130px]"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-foreground truncate max-w-[120px]">{b.title}</span>
                      {b.max_score != null && (
                        <span className="text-muted-foreground font-normal">{b.max_score} pts</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {students.length === 0 && (
                <tr>
                  <td
                    colSpan={blocks.length + 1}
                    className="text-center py-10 text-muted-foreground text-sm italic"
                  >
                    No active students enrolled.
                  </td>
                </tr>
              )}

              {students.map((student) => {
                const avg = studentAverage(student.uid)

                return (
                  <tr key={student.uid} className="hover:bg-slate-50/50 transition-colors">
                    {/* Sticky first column: name + running average */}
                    <td className="px-4 py-3 sticky left-0 bg-white">
                      <p className="font-medium text-foreground leading-snug">{student.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {avg.pct != null ? `${avg.pct.toFixed(1)}% · ${avg.letter}` : 'No grades yet'}
                      </p>
                    </td>

                    {blocks.map((block) => {
                      const key  = `${block.id}:${student.uid}`
                      const cell = cells.get(key)
                      const err  = errors.get(key)
                      const isFeedbackOpen = feedbackCell === key

                      return (
                        <td key={block.id} className="px-3 py-3 text-center relative">
                          {/* Per-cell error bubble */}
                          {err && (
                            <p
                              className="absolute -top-8 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap z-10 pointer-events-none"
                              role="alert"
                            >
                              {err}
                            </p>
                          )}

                          <div className="flex flex-col items-center gap-1">
                            {/* Score input */}
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={block.max_score ?? undefined}
                                step={0.5}
                                defaultValue={cell?.score ?? ''}
                                placeholder="—"
                                aria-label={`Score for ${student.name} on ${block.title}`}
                                className="w-20 text-sm text-center border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                                onBlur={(e) =>
                                  handleScoreBlur(student.uid, block.id, e.target.value, block.max_score)
                                }
                              />

                              {/* Feedback toggle button */}
                              <button
                                type="button"
                                title={cell?.feedback ? 'Edit feedback' : 'Add feedback'}
                                aria-label={`${cell?.feedback ? 'Edit' : 'Add'} feedback for ${student.name} on ${block.title}`}
                                aria-expanded={isFeedbackOpen}
                                onClick={() => {
                                  if (isFeedbackOpen) {
                                    setFeedbackCell(null)
                                  } else {
                                    setFeedbackDraft(cell?.feedback ?? '')
                                    setFeedbackCell(key)
                                  }
                                }}
                                className={`text-xs rounded-md px-1.5 py-1.5 border transition-colors ${
                                  cell?.feedback
                                    ? 'border-primary/40 text-primary bg-primary/5 hover:bg-primary/10'
                                    : 'border-border text-muted-foreground hover:border-primary/30 hover:text-primary'
                                }`}
                              >
                                {/* Message-bubble icon */}
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-3.5 w-3.5"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  aria-hidden="true"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </button>
                            </div>

                            {/* Feedback popover */}
                            {isFeedbackOpen && (
                              <div className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-border rounded-xl shadow-lg p-3 min-w-[220px] text-left">
                                <label
                                  htmlFor={`fb-${key}`}
                                  className="text-xs font-semibold text-foreground block mb-1"
                                >
                                  Feedback (optional)
                                </label>
                                <textarea
                                  id={`fb-${key}`}
                                  value={feedbackDraft}
                                  onChange={(e) => setFeedbackDraft(e.target.value)}
                                  rows={3}
                                  placeholder="Write feedback for the student…"
                                  className="w-full text-sm border border-border rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  aria-label={`Feedback for ${student.name} on ${block.title}`}
                                  // eslint-disable-next-line jsx-a11y/no-autofocus
                                  autoFocus
                                />
                                <div className="flex items-center gap-2 mt-2">
                                  <button
                                    type="button"
                                    onClick={() => handleFeedbackSave(student.uid, block.id)}
                                    className="text-xs font-semibold bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setFeedbackCell(null)}
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {students.length > 0 && (
          <div className="border-t border-border px-6 py-3 text-xs text-muted-foreground">
            Tab through score cells to grade quickly. Click the message icon to add per-cell feedback.
          </div>
        )}
      </div>
    </div>
  )
}
