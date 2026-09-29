'use server'

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { revalidatePath } from 'next/cache'
import { applyGradeSideEffects } from './learning'
import type { AssignmentRubric, CriterionEvaluation } from '@/types/rubrics'

async function requireStaffRole() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role ?? '')) {
    throw new Error('Forbidden')
  }

  return { supabase, profile }
}

export async function getPrebuiltRubricTemplates(): Promise<AssignmentRubric[]> {
  return [
    {
      title: 'Theological Exegesis Paper Rubric',
      criteria: [
        {
          id: 'exegesis',
          title: 'Historical-Grammatical Exegesis',
          description: 'Faithful analysis of the original text, historical context, and literary genre.',
          levels: [
            { id: 'e4', label: 'Exemplary', points: 25, description: 'Deep, accurate analysis of original language, historical setting, and structural syntax.' },
            { id: 'e3', label: 'Proficient', points: 20, description: 'Sound analysis of historical setting and main textual themes.' },
            { id: 'e2', label: 'Developing', points: 15, description: 'Basic historical context provided but lacks linguistic or structural depth.' },
            { id: 'e1', label: 'Beginning', points: 10, description: 'Superficial treatment or inaccurate eisegesis.' },
          ],
        },
        {
          id: 'theology',
          title: 'Theological Synthesis & Orthodoxy',
          description: 'Alignment with biblical theology and historic Christian doctrine.',
          levels: [
            { id: 't4', label: 'Exemplary', points: 25, description: 'Nuanced integration with broader canonical themes and historical theology.' },
            { id: 't3', label: 'Proficient', points: 20, description: 'Clear and orthodox theological conclusions supported by Scripture.' },
            { id: 't2', label: 'Developing', points: 15, description: 'Theological claims made without sufficient biblical grounding.' },
            { id: 't1', label: 'Beginning', points: 10, description: 'Unclear or contradictory theological positions.' },
          ],
        },
        {
          id: 'structure',
          title: 'Academic Structure & Clarity',
          description: 'Logical progression, citations, grammar, and scholarly tone.',
          levels: [
            { id: 's4', label: 'Exemplary', points: 25, description: 'Flawless structure, compelling thesis, and excellent citation formatting.' },
            { id: 's3', label: 'Proficient', points: 20, description: 'Clear thesis and logical flow with minor citation or mechanical errors.' },
            { id: 's2', label: 'Developing', points: 15, description: 'Disorganized sections or frequent grammatical lapses.' },
            { id: 's1', label: 'Beginning', points: 10, description: 'Lacks coherent structure or academic tone.' },
          ],
        },
        {
          id: 'application',
          title: 'Practical Ministry Application',
          description: 'Relevance to church life, spiritual formation, and pastoral discipleship.',
          levels: [
            { id: 'a4', label: 'Exemplary', points: 25, description: 'Transformative, actionable insights for contemporary church ministry.' },
            { id: 'a3', label: 'Proficient', points: 20, description: 'Clear, relevant application to personal life and congregation.' },
            { id: 'a2', label: 'Developing', points: 15, description: 'Generic applications that do not flow directly from the passage.' },
            { id: 'a1', label: 'Beginning', points: 10, description: 'No practical application provided.' },
          ],
        },
      ],
    },
    {
      title: 'Expository Sermon Preparation Rubric',
      criteria: [
        {
          id: 'text_fidelity',
          title: 'Textual Fidelity & Main Idea',
          description: 'Does the sermon proclaim the main point of the chosen passage?',
          levels: [
            { id: 'tf4', label: 'Exemplary', points: 30, description: 'The sermon thesis and main points arise organically from the text.' },
            { id: 'tf3', label: 'Proficient', points: 24, description: 'Faithful to the text with clear central proposition.' },
            { id: 'tf2', label: 'Developing', points: 18, description: 'Loosely connected to the text.' },
            { id: 'tf1', label: 'Beginning', points: 10, description: 'Text is used only as a springboard for unrelated topics.' },
          ],
        },
        {
          id: 'delivery',
          title: 'Illustration & Application',
          description: 'Engaging illustrations and pastoral application to diverse listeners.',
          levels: [
            { id: 'd4', label: 'Exemplary', points: 35, description: 'Compelling illustrations and convicting, gospel-centered applications.' },
            { id: 'd3', label: 'Proficient', points: 28, description: 'Effective illustrations and clear calls to obedience.' },
            { id: 'd2', label: 'Developing', points: 20, description: 'Abstract applications or distracting illustrations.' },
            { id: 'd1', label: 'Beginning', points: 10, description: 'Lacks practical relevance.' },
          ],
        },
        {
          id: 'gospel_focus',
          title: 'Christ-Centered & Gospel Focus',
          description: 'Connecting the text to the person and work of Jesus Christ.',
          levels: [
            { id: 'gf4', label: 'Exemplary', points: 35, description: 'Masterful Christological connection avoiding moralism.' },
            { id: 'gf3', label: 'Proficient', points: 28, description: 'Clear presentation of the gospel and grace.' },
            { id: 'gf2', label: 'Developing', points: 20, description: 'Moralistic tone with tacked-on gospel conclusion.' },
            { id: 'gf1', label: 'Beginning', points: 10, description: 'No mention of Christ or the gospel.' },
          ],
        },
      ],
    },
  ]
}

export async function saveBlockRubric({
  blockId,
  rubric,
}: {
  blockId: string
  rubric: AssignmentRubric
}): Promise<{ error?: string }> {
  const { supabase, profile } = await requireStaffRole()

  if (!rubric.title?.trim()) {
    return { error: 'Rubric title is required.' }
  }

  if (!rubric.criteria || rubric.criteria.length === 0) {
    return { error: 'Rubric must contain at least one criterion.' }
  }

  const service = createServiceClient()
  const { data: block } = await service
    .from('course_blocks')
    .select('id, content, courses!inner(org_id, owner_id)')
    .eq('id', blockId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase nested join
  const blockCourse = (block?.courses as any)
  if (!block || blockCourse?.org_id !== profile.org_id) {
    return { error: 'Block not found.' }
  }

  if (profile.role === 'teacher' && blockCourse?.owner_id !== profile.uid) {
    return { error: 'You can only edit rubrics for your own courses.' }
  }

  const updatedContent = {
    ...(block.content ?? {}),
    rubric,
  }

  const { error: updateErr } = await supabase
    .from('course_blocks')
    .update({ content: updatedContent })
    .eq('id', blockId)

  if (updateErr) {
    return { error: 'Failed to save rubric.' }
  }

  revalidatePath('/courses/[id]/edit', 'page')
  return {}
}

export async function gradeWithRubric({
  submissionId,
  evaluations,
  overallFeedback,
}: {
  submissionId: string
  evaluations: CriterionEvaluation[]
  overallFeedback?: string
}): Promise<{ error?: string; totalScore?: number }> {
  const { supabase, profile } = await requireStaffRole()

  if (!evaluations || evaluations.length === 0) {
    return { error: 'Please score at least one rubric criterion.' }
  }

  const totalScore = evaluations.reduce((sum, item) => sum + (Number(item.points) || 0), 0)

  // Verify submission belongs to caller's org and instructor is authorized
  const service = createServiceClient()
  const { data: sub } = await service
    .from('block_submissions')
    .select('id, block_id, user_id, max_score, org_id, content, course_blocks!inner(courses!inner(org_id, owner_id))')
    .eq('id', submissionId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join
  const course = (sub?.course_blocks as any)?.courses
  if (!sub || course?.org_id !== profile.org_id) {
    return { error: 'Submission not found.' }
  }

  if (profile.role === 'teacher' && course?.owner_id !== profile.uid) {
    return { error: 'Unauthorized to grade this submission.' }
  }

  const updatedContent = {
    ...(sub.content ?? {}),
    rubric_evaluations: evaluations,
    overall_feedback: overallFeedback?.trim() || null,
  }

  const feedbackText = overallFeedback?.trim() || 'Graded with rubric criteria.'

  const { error: gradeErr } = await supabase
    .from('block_submissions')
    .update({
      score: totalScore,
      status: 'graded',
      feedback: feedbackText,
      graded_by: profile.uid,
      graded_at: new Date().toISOString(),
      content: updatedContent,
    })
    .eq('id', submissionId)

  if (gradeErr) {
    return { error: 'Failed to record rubric grade.' }
  }

  await applyGradeSideEffects(sub, totalScore, feedbackText)

  revalidatePath('/courses/[id]/submissions', 'page')
  revalidatePath('/courses/[id]/gradebook', 'page')

  return { totalScore }
}
