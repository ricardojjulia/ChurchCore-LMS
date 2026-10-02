import type { SupabaseClient } from '@supabase/supabase-js'
import type { LibraryTemplate, LibraryTemplateSnapshot, AdoptionResult } from './types'

export type { AdoptionResult }

export async function adoptLibraryTemplate(
  supabase: SupabaseClient,
  {
    orgId,
    templateId,
    mode = 'copy',
    adminUid,
  }: {
    orgId: string
    templateId: string
    mode?: 'copy' | 'linked'
    adminUid: string
  }
): Promise<AdoptionResult> {
  try {
    // 1. Fetch template
    const { data: template, error: tmplErr } = await supabase
      .from('library_templates')
      .select('*')
      .eq('id', templateId)
      .single()

    if (tmplErr || !template) {
      return { success: false, error: 'Library template not found' }
    }

    // If template is a starter pack bundle, delegate to bundle adoption
    if (template.is_starter_pack) {
      return await adoptStarterPackBundle(supabase, {
        orgId,
        template,
        adminUid,
      })
    }

    // 2. Check if already adopted in this org
    const { data: existingAdoption } = await supabase
      .from('library_adoptions')
      .select('id, course_id')
      .eq('org_id', orgId)
      .eq('template_id', templateId)
      .maybeSingle()

    if (existingAdoption) {
      return {
        success: true,
        courseId: existingAdoption.course_id,
        error: 'Template is already adopted in this organization.',
      }
    }

    // 3. Create course in org
    const { data: newCourse, error: courseErr } = await supabase
      .from('courses')
      .insert({
        org_id: orgId,
        title: template.title,
        description: template.description || '',
        status: 'published',
        owner_id: adminUid,
        cover_image_url: template.cover_image_url || null,
        language: template.language || 'en',
      })
      .select('id')
      .single()

    if (courseErr || !newCourse) {
      return { success: false, error: `Failed to create course: ${courseErr?.message}` }
    }

    const snapshot = template.snapshot as LibraryTemplateSnapshot
    const modules = snapshot.modules || []
    let totalBlocks = 0
    let totalModules = 0

    // 4. Create modules and blocks
    let moduleOrder = 1000
    for (const mod of modules) {
      const moduleId = crypto.randomUUID()
      const { error: modErr } = await supabase.from('course_blocks').insert({
        id: moduleId,
        course_id: newCourse.id,
        org_id: orgId,
        block_type_id: 'module_header',
        title: mod.title,
        content: {},
        sort_order: moduleOrder,
      })

      if (modErr) {
        console.error('Error inserting module block:', modErr)
        continue
      }
      moduleOrder += 1000
      totalModules++
      totalBlocks++

      let itemOrder = 1000
      for (const block of mod.blocks || []) {
        const typeId = block.type || 'page'
        await supabase.from('course_blocks').insert({
          course_id: newCourse.id,
          org_id: orgId,
          parent_block_id: moduleId,
          block_type_id: typeId,
          title: block.title,
          content: block.content || {},
          sort_order: itemOrder,
        })
        itemOrder += 1000
        totalBlocks++
      }
    }

    // 5. Record adoption
    await supabase.from('library_adoptions').insert({
      org_id: orgId,
      template_id: template.id,
      version: template.version || '1.0.0',
      mode,
      course_id: newCourse.id,
      adopted_by: adminUid,
    })

    return {
      success: true,
      courseId: newCourse.id,
      coursesCreated: 1,
      modulesCreated: totalModules,
      blocksCreated: totalBlocks,
    }
  } catch (err: any) {
    console.error('Unexpected error adopting template:', err)
    return { success: false, error: err?.message || 'Failed to adopt template' }
  }
}

export async function adoptStarterPackBundle(
  supabase: SupabaseClient,
  {
    orgId,
    template,
    adminUid,
  }: {
    orgId: string
    template: LibraryTemplate
    adminUid: string
  }
): Promise<AdoptionResult> {
  try {
    const snapshot = template.snapshot as LibraryTemplateSnapshot
    const bundleSlugs = snapshot.bundle_slugs || []

    if (bundleSlugs.length === 0) {
      return { success: false, error: 'Starter pack contains no course items.' }
    }

    // Fetch individual templates
    const { data: itemTemplates, error: itemsErr } = await supabase
      .from('library_templates')
      .select('*')
      .in('slug', bundleSlugs)

    if (itemsErr || !itemTemplates || itemTemplates.length === 0) {
      return { success: false, error: 'Failed to load bundle templates.' }
    }

    const createdCourseIds: string[] = []
    let totalBlocks = 0

    // Adopt each course in bundle
    for (const itemTmpl of itemTemplates) {
      const res = await adoptLibraryTemplate(supabase, {
        orgId,
        templateId: itemTmpl.id,
        mode: 'copy',
        adminUid,
      })

      if (res.success && res.courseId) {
        createdCourseIds.push(res.courseId)
        totalBlocks += res.blocksCreated || 0
      }
    }

    // Create learning path grouping these courses
    const pathTitle = snapshot.path_title || template.title
    const pathDesc = snapshot.path_description || template.description || ''

    const { data: newPath, error: pathErr } = await supabase
      .from('learning_paths')
      .insert({
        org_id: orgId,
        title: pathTitle,
        description: pathDesc,
        status: 'published',
        created_by: adminUid,
      })
      .select('id')
      .single()

    if (pathErr || !newPath) {
      console.error('Failed to create learning path for starter pack:', pathErr)
    } else {
      // Add courses to path
      for (let i = 0; i < createdCourseIds.length; i++) {
        await supabase.from('learning_path_courses').insert({
          learning_path_id: newPath.id,
          course_id: createdCourseIds[i],
          sort_order: (i + 1) * 1000,
        })
      }

      // Record adoption for starter pack
      await supabase.from('library_adoptions').insert({
        org_id: orgId,
        template_id: template.id,
        version: template.version || '1.0.0',
        mode: 'copy',
        path_id: newPath.id,
        adopted_by: adminUid,
      })
    }

    return {
      success: true,
      pathId: newPath?.id,
      coursesCreated: createdCourseIds.length,
      blocksCreated: totalBlocks,
    }
  } catch (err: any) {
    console.error('Unexpected error adopting starter pack:', err)
    return { success: false, error: err?.message || 'Failed to adopt starter pack' }
  }
}
