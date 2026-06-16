import { describe, it, expect } from 'vitest'
import { calculatePercentage, calculateLetterGrade, isPassing } from './grading'

describe('calculatePercentage', () => {
  it('returns 90 for 90/100', () => {
    expect(calculatePercentage(90, 100)).toBe(90)
  })

  it('returns 0 for 0/100', () => {
    expect(calculatePercentage(0, 100)).toBe(0)
  })

  it('returns 100 for perfect score', () => {
    expect(calculatePercentage(50, 50)).toBe(100)
  })

  it('returns 0 when maxScore is 0 (division by zero guard)', () => {
    expect(calculatePercentage(10, 0)).toBe(0)
  })

  it('rounds to nearest integer', () => {
    expect(calculatePercentage(1, 3)).toBe(33) // 33.33...
  })
})

describe('calculateLetterGrade', () => {
  it('returns A for 90/100', () => {
    expect(calculateLetterGrade(90, 100)).toBe('A')
  })

  it('returns F for 0/100', () => {
    expect(calculateLetterGrade(0, 100)).toBe('F')
  })

  it('returns B for 80/100', () => {
    expect(calculateLetterGrade(80, 100)).toBe('B')
  })

  it('returns C for 70/100', () => {
    expect(calculateLetterGrade(70, 100)).toBe('C')
  })

  it('returns D for 60/100', () => {
    expect(calculateLetterGrade(60, 100)).toBe('D')
  })

  it('returns F for 59/100', () => {
    expect(calculateLetterGrade(59, 100)).toBe('F')
  })
})

describe('isPassing', () => {
  it('returns true when score meets default threshold of 70%', () => {
    expect(isPassing(70, 100)).toBe(true)
  })

  it('returns false when score is below default threshold', () => {
    expect(isPassing(69, 100)).toBe(false)
  })

  it('respects a custom passing threshold', () => {
    expect(isPassing(60, 100, 60)).toBe(true)
    expect(isPassing(59, 100, 60)).toBe(false)
  })

  it('returns false on zero maxScore', () => {
    expect(isPassing(0, 0)).toBe(false)
  })
})
