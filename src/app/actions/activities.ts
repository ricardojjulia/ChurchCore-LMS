'use server'

// Survey and checklist actions (COUNCIL-2026-044). Authorization and survey
// anonymity are enforced in the database (RLS, can_respond_to_block, the
// stamping triggers); these actions validate input against the block's own
// content and return generic errors only.
import { createClient } from '@/utils/supabase/server'
import type { ChecklistContent, SurveyContent } from '@/types/blocks'

type ActivityState = { responded?: boolean; checked?: string[] }

async function loadBlock(blockId: string, type: 'survey' | 'checklist') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const }
  const { data: block } = await supabase
    .from('course_blocks')
    .select('id, block_type_id, content')
    .eq('id', blockId)
    .eq('block_type_id', type)
    .maybeSingle()
  if (!block) return { error: 'Not found' as const }
  return { supabase, block }
}

export async function submitSurvey(
  blockId: string,
  answers: Record<string, string | number>,
): Promise<{ error?: string }> {
  const ctx = await loadBlock(blockId, 'survey')
  if ('error' in ctx) return { error: ctx.error }
  const { questions = [] } = (ctx.block.content ?? {}) as Partial<SurveyContent>

  // Keep only answers to this survey's questions, typed per question.
  const clean: Record<string, string | number> = {}
  for (const q of questions) {
    const value = answers[q.id]
    if (value === undefined || value === '') continue
    if (q.type === 'scale') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1 || n > 5) return { error: 'Please choose a value from 1 to 5.' }
      clean[q.id] = n
    } else if (q.type === 'choice') {
      if (!(q.options ?? []).includes(String(value))) return { error: 'Please choose one of the options.' }
      clean[q.id] = String(value)
    } else {
      clean[q.id] = String(value).slice(0, 2000)
    }
  }
  if (Object.keys(clean).length === 0) return { error: 'Please answer at least one question.' }

  const { error } = await ctx.supabase.rpc('submit_survey', { p_block_id: blockId, p_answers: clean })
  if (error?.code === '23505') return { error: 'You have already responded to this survey.' }
  if (error) return { error: 'Could not save your response. Please try again.' }
  return {}
}

export async function saveChecklistProgress(
  blockId: string,
  checkedIds: string[],
): Promise<{ error?: string; complete?: boolean }> {
  const ctx = await loadBlock(blockId, 'checklist')
  if ('error' in ctx) return { error: ctx.error }
  const { items = [] } = (ctx.block.content ?? {}) as Partial<ChecklistContent>
  const known = new Set(items.map((i) => i.id))
  const checked = [...new Set(checkedIds)].filter((id) => known.has(id))

  const { error } = await ctx.supabase
    .from('checklist_progress')
    .upsert({ block_id: blockId, checked, updated_at: new Date().toISOString() }, { onConflict: 'block_id,user_uid' })
  if (error) return { error: 'Could not save your progress. Please try again.' }

  const complete = items.filter((i) => i.required).every((i) => checked.includes(i.id))
  return { complete }
}

export async function getMyActivityState(blockId: string): Promise<ActivityState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}
  // Staff can read every learner's rows, so scope to the caller explicitly.
  const { data: me } = await supabase.from('profiles').select('uid').eq('auth_id', user.id).maybeSingle()
  if (!me) return {}
  const [{ data: participation }, { data: progress }] = await Promise.all([
    supabase.from('survey_participation').select('block_id').eq('block_id', blockId).eq('user_uid', me.uid).maybeSingle(),
    supabase.from('checklist_progress').select('checked').eq('block_id', blockId).eq('user_uid', me.uid).maybeSingle(),
  ])
  return {
    responded: !!participation,
    checked: Array.isArray(progress?.checked) ? (progress!.checked as string[]) : [],
  }
}
