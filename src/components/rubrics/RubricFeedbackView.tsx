import type { AssignmentRubric, CriterionEvaluation } from '@/types/rubrics'

interface Props {
  rubric: AssignmentRubric
  evaluations: CriterionEvaluation[]
  overallFeedback?: string | null
  totalScore: number
}

export default function RubricFeedbackView({
  rubric,
  evaluations,
  overallFeedback,
  totalScore,
}: Props) {
  const evalMap = new Map(evaluations.map((e) => [e.criterionId, e]))
  const maxPossible = rubric.criteria.reduce((sum, c) => {
    const highest = Math.max(...c.levels.map((l) => l.points), 0)
    return sum + highest
  }, 0)

  return (
    <div className="space-y-6 border rounded-2xl p-6 bg-slate-50/50 dark:bg-slate-900/50">
      <div className="flex items-center justify-between border-b pb-4 dark:border-slate-800">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {rubric.title} Evaluation
          </h3>
          <p className="text-xs text-slate-500">
            Instructor scoring and criterion breakdown
          </p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black text-primary">
            {totalScore} / {maxPossible}
          </span>
          <p className="text-[11px] text-slate-500 font-medium">Final Rubric Score</p>
        </div>
      </div>

      {overallFeedback && (
        <div className="bg-white dark:bg-slate-800 border rounded-xl p-4 space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Instructor Comments
          </h4>
          <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
            {overallFeedback}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {rubric.criteria.map((crit) => {
          const evalItem = evalMap.get(crit.id)
          const achievedLevel = crit.levels.find((l) => l.id === evalItem?.levelId)

          return (
            <div
              key={crit.id}
              className="p-4 rounded-xl border bg-white dark:bg-slate-800 space-y-2 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {crit.title}
                  </h4>
                  {crit.description && (
                    <p className="text-xs text-slate-500 mt-0.5">{crit.description}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-bold px-2 py-1 bg-primary/10 text-primary rounded-md">
                    {evalItem ? `${evalItem.points} pts` : 'Not Scored'}
                  </span>
                </div>
              </div>

              {achievedLevel && (
                <div className="pt-2 border-t dark:border-slate-700/60 mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      Level: {achievedLevel.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {achievedLevel.description}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
