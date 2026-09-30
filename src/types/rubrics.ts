export interface RubricCriterionLevel {
  id: string
  label: string
  points: number
  description: string
}

export interface RubricCriterion {
  id: string
  title: string
  description?: string
  levels: RubricCriterionLevel[]
}

export interface AssignmentRubric {
  id?: string
  title: string
  criteria: RubricCriterion[]
}

export interface CriterionEvaluation {
  criterionId: string
  levelId: string
  points: number
  comments?: string
}

export interface RubricEvaluationResult {
  totalScore: number
  maxScore: number
  evaluations: CriterionEvaluation[]
}
