'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

async function requireStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role)) {
    throw new Error('Forbidden')
  }
  return { supabase, profile }
}

export async function createPage(
  courseId: string
): Promise<{ id?: string; error?: string }> {
  const { supabase, profile } = await requireStaff()

  const { data, error } = await supabase
    .from('content_pages')
    .insert({
      course_id:  courseId,
      title:      'Untitled Page',
      body:       { type: 'doc', content: [] },
      created_by: profile.uid,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/courses/${courseId}/pages`)
  return { id: data.id }
}

export async function updatePageTitle(
  pageId:  string,
  title:   string
): Promise<{ error?: string }> {
  const { supabase } = await requireStaff()
  if (!title.trim()) return { error: 'Title is required.' }

  const { error } = await supabase
    .from('content_pages')
    .update({ title: title.trim() })
    .eq('id', pageId)

  if (error) return { error: error.message }
  return {}
}

export async function updatePageContent(
  pageId:  string,
  content: object
): Promise<{ error?: string }> {
  const { supabase } = await requireStaff()

  const { error } = await supabase
    .from('content_pages')
    .update({ body: content })
    .eq('id', pageId)

  if (error) return { error: error.message }
  return {}
}

export async function publishPage(
  pageId:   string,
  courseId: string
): Promise<{ error?: string; embeddingStatus?: string }> {
  const { supabase } = await requireStaff()

  const { error } = await supabase
    .from('content_pages')
    .update({
      status:       'published',
      published_at: new Date().toISOString(),
    })
    .eq('id', pageId)

  if (error) return { error: error.message }

  // Trigger embedding generation (best-effort; never blocks publish)
  let embeddingStatus: string | undefined
  try {
    const { generatePageEmbedding } = await import('./embedding')
    const result = await generatePageEmbedding(pageId)
    embeddingStatus = result.status
  } catch {
    // Embedding failure must never fail the publish action
  }

  revalidatePath(`/courses/${courseId}/pages`)
  revalidatePath(`/courses/${courseId}/pages/${pageId}/edit`)
  return { embeddingStatus }
}

export async function unpublishPage(
  pageId:   string,
  courseId: string
): Promise<{ error?: string }> {
  const { supabase } = await requireStaff()

  const { error } = await supabase
    .from('content_pages')
    .update({ status: 'draft', published_at: null })
    .eq('id', pageId)

  if (error) return { error: error.message }
  revalidatePath(`/courses/${courseId}/pages`)
  return {}
}

export async function deletePage(
  pageId:   string,
  courseId: string
): Promise<void> {
  const { supabase } = await requireStaff()

  await supabase
    .from('content_pages')
    .update({ status: 'archived' })
    .eq('id', pageId)

  revalidatePath(`/courses/${courseId}/pages`)
  redirect(`/courses/${courseId}/pages`)
}

export async function createPageAndRedirect(courseId: string): Promise<void> {
  const result = await createPage(courseId)
  if (result.id) redirect(`/courses/${courseId}/pages/${result.id}/edit`)
}
