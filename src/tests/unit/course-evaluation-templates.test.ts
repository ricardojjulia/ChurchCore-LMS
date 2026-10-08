import { describe, it, expect } from 'vitest'
import {
  getFeedbackTemplates,
  getFeedbackTemplateById,
  instantiateFeedbackTemplate,
} from '@/lib/feedback/templates'

describe('Course Evaluation & Feedback Templates Engine', () => {
  it('provides a catalog of curated feedback templates', () => {
    const templates = getFeedbackTemplates()
    expect(templates.length).toBeGreaterThanOrEqual(4)

    const categories = new Set(templates.map((t) => t.category))
    expect(categories.has('Course Evaluation')).toBe(true)
    expect(categories.has('Discipleship & Ministry')).toBe(true)
    expect(categories.has('Quick Check-in')).toBe(true)
  })

  it('instantiates end-of-course evaluation template with unique UUIDs', () => {
    const instance = instantiateFeedbackTemplate('end_of_course_eval')
    expect(instance).not.toBeNull()
    expect(instance?.title).toBe('Comprehensive Course & Faculty Evaluation')
    expect(instance?.anonymous).toBe(true)
    expect(instance?.questions).toHaveLength(6)

    // Verify all question IDs are defined and unique
    const ids = instance!.questions.map((q) => q.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)

    // Check question types
    const types = instance!.questions.map((q) => q.type)
    expect(types).toContain('scale')
    expect(types).toContain('choice')
    expect(types).toContain('text')
  })

  it('instantiates discipleship cohort feedback template', () => {
    const instance = instantiateFeedbackTemplate('discipleship_cohort')
    expect(instance).not.toBeNull()
    expect(instance?.title).toBe('Small Group & Discipleship Cohort Feedback')
    expect(instance?.anonymous).toBe(false)
    expect(instance?.questions.length).toBeGreaterThanOrEqual(4)
  })

  it('returns null for non-existent template ID', () => {
    expect(instantiateFeedbackTemplate('non_existent_template_id')).toBeNull()
    expect(getFeedbackTemplateById('non_existent_template_id')).toBeUndefined()
  })
})
