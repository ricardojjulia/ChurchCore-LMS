/** Returns 0–100 percent rounded to nearest integer. Returns 0 on zero maxScore. */
export function calculatePercentage(score: number, maxScore: number): number {
  if (maxScore === 0) return 0
  return Math.round((score / maxScore) * 100)
}

/** Maps a score to a letter grade using standard 10-point scale. */
export function calculateLetterGrade(score: number, maxScore: number): string {
  const pct = calculatePercentage(score, maxScore)
  if (pct >= 90) return 'A'
  if (pct >= 80) return 'B'
  if (pct >= 70) return 'C'
  if (pct >= 60) return 'D'
  return 'F'
}

/** True when all required items are submitted and score is passing (≥ 70%). */
export function isPassing(score: number, maxScore: number, passingThreshold = 70): boolean {
  return calculatePercentage(score, maxScore) >= passingThreshold
}
