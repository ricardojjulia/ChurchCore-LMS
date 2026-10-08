import type { SurveyQuestion } from '@/types/blocks'

export interface FeedbackTemplate {
  id: string
  title: string
  category: 'Course Evaluation' | 'Discipleship & Ministry' | 'Workshop & Training' | 'Quick Check-in'
  description: string
  icon: string
  defaultAnonymous: boolean
  questions: Array<Omit<SurveyQuestion, 'id'> & { id?: string }>
}

export const FEEDBACK_TEMPLATES: FeedbackTemplate[] = [
  {
    id: 'end_of_course_eval',
    title: 'Comprehensive Course & Faculty Evaluation',
    category: 'Course Evaluation',
    description: 'Standard end-of-term survey covering course satisfaction, instructor effectiveness, spiritual depth, and workload.',
    icon: '🎓',
    defaultAnonymous: true,
    questions: [
      {
        text: 'Overall, how would you rate this course experience?',
        type: 'scale',
      },
      {
        text: 'The instructor explained theological and practical concepts clearly and effectively.',
        type: 'scale',
      },
      {
        text: 'How impactful were the course materials, readings, and scripture studies to your spiritual growth?',
        type: 'scale',
      },
      {
        text: 'How was the pacing and workload balance of the assignments?',
        type: 'choice',
        options: ['Too demanding / Fast-paced', 'Just right / Well-balanced', 'Too light / Needed more depth'],
      },
      {
        text: 'What was the most valuable lesson, reading, or discussion in this course?',
        type: 'text',
      },
      {
        text: 'What suggestions do you have to improve this course for future cohorts?',
        type: 'text',
      },
    ],
  },
  {
    id: 'mid_course_pulse',
    title: 'Mid-Course Check-in & Pulse Survey',
    category: 'Quick Check-in',
    description: 'Fast formative survey during week 2 or 3 to address student roadblocks before finals.',
    icon: '⏱️',
    defaultAnonymous: true,
    questions: [
      {
        text: 'How well are you keeping up with the course lessons and readings so far?',
        type: 'scale',
      },
      {
        text: 'Are the assignments and study expectations clear?',
        type: 'choice',
        options: ['Very clear', 'Mostly clear', 'A bit confusing', 'Unclear'],
      },
      {
        text: 'What topic or concept from the past weeks would you like more clarification on?',
        type: 'text',
      },
    ],
  },
  {
    id: 'discipleship_cohort',
    title: 'Small Group & Discipleship Cohort Feedback',
    category: 'Discipleship & Ministry',
    description: 'Evaluates small-group dynamics, leader facilitation, prayer community, and personal accountability.',
    icon: '🤝',
    defaultAnonymous: false,
    questions: [
      {
        text: 'Our cohort provided a safe, supportive, and spiritually uplifting environment.',
        type: 'scale',
      },
      {
        text: 'The group leader facilitated discussions effectively and encouraged participation.',
        type: 'scale',
      },
      {
        text: 'How has participating in this group strengthened your prayer life and discipleship walk?',
        type: 'scale',
      },
      {
        text: 'Share a testimony or highlight from your small group discussions:',
        type: 'text',
      },
      {
        text: 'How can the ministry team better support your discipleship journey?',
        type: 'text',
      },
    ],
  },
  {
    id: 'speaker_sermon_eval',
    title: 'Guest Speaker & Workshop Evaluation',
    category: 'Workshop & Training',
    description: 'Collect feedback on guest lectures, weekend seminars, or leadership workshops.',
    icon: '🎙️',
    defaultAnonymous: true,
    questions: [
      {
        text: 'The speaker presented the message with clarity, biblically sound exegesis, and passion.',
        type: 'scale',
      },
      {
        text: 'The practical takeaways were actionable for my leadership or personal ministry.',
        type: 'scale',
      },
      {
        text: 'Would you recommend this workshop / speaker to other leaders?',
        type: 'choice',
        options: ['Definitely Yes', 'Probably Yes', 'Neutral', 'No'],
      },
      {
        text: 'What key insight resonated most with you today?',
        type: 'text',
      },
    ],
  },
  {
    id: 'quick_exit_ticket',
    title: 'Lesson Exit Ticket (2-Minute Feedback)',
    category: 'Quick Check-in',
    description: 'Quick 2-item reflection at the end of a specific module or lesson.',
    icon: '⚡',
    defaultAnonymous: false,
    questions: [
      {
        text: 'How confident do you feel applying today\'s lesson in practice?',
        type: 'scale',
      },
      {
        text: 'In one sentence, what is your biggest takeaway from today?',
        type: 'text',
      },
    ],
  },
]

export function getFeedbackTemplates(): FeedbackTemplate[] {
  return FEEDBACK_TEMPLATES
}

export function getFeedbackTemplateById(id: string): FeedbackTemplate | undefined {
  return FEEDBACK_TEMPLATES.find((t) => t.id === id)
}

export function instantiateFeedbackTemplate(templateId: string): {
  title: string
  anonymous: boolean
  questions: SurveyQuestion[]
} | null {
  const t = getFeedbackTemplateById(templateId)
  if (!t) return null

  return {
    title: t.title,
    anonymous: t.defaultAnonymous,
    questions: t.questions.map((q) => ({
      id: crypto.randomUUID(),
      text: q.text,
      type: q.type,
      options: q.options ? [...q.options] : undefined,
    })),
  }
}
