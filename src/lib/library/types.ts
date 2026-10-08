// Content Library Types (COUNCIL-2026-043)

export type LibraryCategory =
  | 'discipleship'
  | 'leadership'
  | 'volunteers'
  | 'ministry'
  | 'theology'
  | 'safety'

export interface LibraryTemplateBlock {
  title: string
  type: string
  content: Record<string, unknown>
}

export interface LibraryTemplateModule {
  title: string
  blocks: LibraryTemplateBlock[]
}

export interface LibraryTemplateSnapshot {
  modules?: LibraryTemplateModule[]
  bundle_slugs?: string[]
  path_title?: string
  path_description?: string
  [key: string]: unknown
}

export interface LibraryTemplate {
  id: string
  slug: string
  title: string
  description?: string
  category: LibraryCategory
  audience: string
  language: string
  license: string
  attribution: string
  cover_image_url?: string
  version: string
  snapshot: LibraryTemplateSnapshot
  is_starter_pack: boolean
  is_published: boolean
  created_at: string
}

export interface LibraryAdoption {
  id: string
  org_id: string
  template_id: string
  version: string
  mode: 'copy' | 'linked'
  course_id?: string
  path_id?: string
  adopted_by?: string
  adopted_at: string
}

export interface AdoptionResult {
  success: boolean
  courseId?: string
  pathId?: string
  coursesCreated?: number
  modulesCreated?: number
  blocksCreated?: number
  error?: string
}

