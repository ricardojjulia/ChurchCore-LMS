'use client'

import { useState } from 'react'
import GradeForm from './GradeForm'

interface SubmissionRow {
  submission_id: string
  block_title:   string
  block_type:    string
  student_name:  string | null
  student_email: string | null
  status:        string
  content:       Record<string, unknown>
  score:         number | null
  max_score:     number | null
  grade_pct:     number | null
  feedback:      string | null
  submitted_at:  string | null
  graded_at:     string | null
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'unknown'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const STATUS_STYLE: Record<string, string> = {
  submitted: 'bg-amber-100 text-amber-700 border-amber-200',
  graded:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  returned:  'bg-sky-100 text-sky-700 border-sky-200',
  draft:     'bg-slate-100 text-slate-600 border-slate-200',
}

export default function SubmissionCard({ row }: { row: SubmissionRow }) {
  const [expanded,  setExpanded]  = useState(false)
  const [grading,   setGrading]   = useState(false)
  const [localDone, setLocalDone] = useState(false)

  const statusClass = STATUS_STYLE[row.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'
  const needsGrade  = row.status === 'submitted' && !localDone
  const gradeColor  = row.grade_pct === null ? 'text-muted-foreground'
    : row.grade_pct >= 90 ? 'text-emerald-700'
    : row.grade_pct >= 70 ? 'text-amber-700'
    : 'text-rose-700'

  return (
    <div className={`border rounded-xl overflow-hidden ${needsGrade ? 'border-amber-200' : 'border-border'}`}>
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
        aria-expanded={expanded}
        aria-label={`${row.student_name ?? 'Student'} — ${row.block_title}`}
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-indigo-700">
            {(row.student_name ?? '?')[0]?.toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {row.student_name ?? 'Unknown student'}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {row.block_title} · submitted {timeAgo(row.submitted_at)}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {(row.grade_pct !== null || localDone) && (
            <span className={`text-sm font-bold ${gradeColor}`}>
              {row.score}/{row.max_score} ({row.grade_pct}%)
            </span>
          )}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusClass} capitalize`}>
            {localDone ? 'graded' : row.status}
          </span>
          <span className="text-slate-400 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-border bg-slate-50/50">
          {row.student_email && (
            <p className="text-xs text-muted-foreground mt-3 mb-2">{row.student_email}</p>
          )}

          {/* Submission content */}
          {!!row.content?.text && (
            <div className="bg-white border border-border rounded-lg p-4 mt-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                Submission
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{row.content.text as string}</p>
            </div>
          )}

          {/* Quiz answers */}
          {!!row.content?.answers && (
            <div className="bg-white border border-border rounded-lg p-4 mt-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                Quiz — auto-graded
              </p>
              <p className="text-sm text-muted-foreground">
                Score: {row.score} / {row.max_score} ({row.grade_pct}%)
              </p>
            </div>
          )}

          {/* Existing feedback */}
          {row.feedback && !grading && (
            <div className="mt-3 bg-white border border-border rounded-lg p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Feedback</p>
              <p className="text-sm text-foreground italic">{row.feedback}</p>
            </div>
          )}

          {/* Grade form */}
          {grading ? (
            <GradeForm
              submissionId={row.submission_id}
              maxScore={row.max_score}
              currentScore={row.score}
              feedback={row.feedback}
              onDone={() => { setGrading(false); setLocalDone(true) }}
            />
          ) : (
            <div className="mt-3 flex gap-2">
              {needsGrade && (
                <button
                  onClick={() => setGrading(true)}
                  className="text-sm font-semibold text-white bg-primary px-4 py-1.5 rounded-lg hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  Grade →
                </button>
              )}
              {row.status === 'graded' && !localDone && (
                <button
                  onClick={() => setGrading(true)}
                  className="text-sm font-semibold text-muted-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-white transition-colors"
                >
                  Update grade
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
