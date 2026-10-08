'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { adoptLibraryTemplate, type AdoptionResult } from '@/lib/library'

export async function adoptTemplate({
  templateId,
  mode = 'copy',
}: {
  templateId: string
  mode?: 'copy' | 'linked'
}): Promise<AdoptionResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('uid, org_id, role')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) return { success: false, error: 'Profile not found' }
    if (!['admin', 'manager', 'platform_admin'].includes(profile.role)) {
      return { success: false, error: 'Insufficient permissions to adopt curriculum templates' }
    }

    const result = await adoptLibraryTemplate(supabase, {
      orgId: profile.org_id,
      templateId,
      mode,
      adminUid: profile.uid,
    })

    if (result.success) {
      revalidatePath('/admin/library')
      revalidatePath('/courses')
      revalidatePath('/paths')
    }

    return result
  } catch (err: any) {
    console.error('Server action adoptTemplate error:', err)
    return { success: false, error: err?.message || 'Failed to adopt template' }
  }
}

export async function publishTemplate(data: {
  slug: string
  title: string
  description?: string
  category: any
  audience?: string
  language?: string
  license?: string
  attribution?: string
  snapshot: any
  isStarterPack?: boolean
}): Promise<{ success: boolean; templateId?: string; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('auth_id', user.id)
      .single()

    if (profile?.role !== 'platform_admin') {
      return { success: false, error: 'Only platform administrators can publish library templates' }
    }

    const { data: template, error } = await supabase
      .from('library_templates')
      .upsert(
        {
          slug: data.slug,
          title: data.title,
          description: data.description || '',
          category: data.category,
          audience: data.audience || 'all',
          language: data.language || 'en',
          license: data.license || 'cc-by-nc-4.0',
          attribution: data.attribution || 'ChurchCore Theological Curriculum Council',
          snapshot: data.snapshot,
          is_starter_pack: Boolean(data.isStarterPack),
          is_published: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'slug' }
      )
      .select('id')
      .single()

    if (error || !template) {
      return { success: false, error: error?.message || 'Failed to publish template' }
    }

    revalidatePath('/admin/library')
    return { success: true, templateId: template.id }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Server error publishing template' }
  }
}
