'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function staffEnroll(
  courseId: string,
  studentUid: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.rpc('staff_enroll_student', {
    p_course_id: courseId,
    p_uid:       studentUid,
  })

  if (error) return { error: error.message }

  revalidatePath(`/courses/${courseId}/enroll`)
  return {}
}

export async function staffUnenroll(
  courseId: string,
  studentUid: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.rpc('staff_unenroll_student', {
    p_course_id: courseId,
    p_uid:       studentUid,
  })

  if (error) return { error: error.message }

  revalidatePath(`/courses/${courseId}/enroll`)
  return {}
}
