import React from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import type { LibraryTemplate } from '@/lib/library'
import LibraryBrowserClient from './LibraryBrowserClient'

export const dynamic = 'force-dynamic'

export default async function AdminLibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, org_id, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile?.org_id) redirect('/dashboard')

  // Fetch all published templates
  const { data: rawTemplates } = await supabase
    .from('library_templates')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false })

  const templates: LibraryTemplate[] = (rawTemplates || []).map(t => ({
    id: t.id,
    slug: t.slug,
    title: t.title,
    description: t.description || '',
    category: t.category,
    audience: t.audience || 'all',
    language: t.language || 'en',
    license: t.license || 'cc-by-nc-4.0',
    attribution: t.attribution || 'ChurchCore Theological Curriculum Council',
    version: t.version || '1.0.0',
    is_starter_pack: Boolean(t.is_starter_pack),
    is_published: Boolean(t.is_published),
    snapshot: t.snapshot || {},
    created_at: t.created_at,
    updated_at: t.updated_at,
  }))

  // Fetch adopted template ids for this org
  const { data: adoptions } = await supabase
    .from('library_adoptions')
    .select('template_id')
    .eq('org_id', profile.org_id)

  const adoptedTemplateIds: string[] = (adoptions || []).map(a => a.template_id)

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Curriculum Commons
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-400">Theological & Ministry Starter Packs</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              📚
            </span>
            Starter Content Library
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Browse theological foundations, ministry training, child safety, and leadership starter packs curated by ChurchCore. Adopt templates directly into your catalog as editable courses or organized learning tracks.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/courses"
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-all flex items-center gap-2"
          >
            <span>My Courses</span>
            <span>→</span>
          </Link>
          <Link
            href="/paths"
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-all flex items-center gap-2"
          >
            <span>Learning Paths</span>
            <span>→</span>
          </Link>
        </div>
      </div>

      {/* Main Interactive Browser */}
      <LibraryBrowserClient
        templates={templates}
        adoptedTemplateIds={adoptedTemplateIds}
      />
    </div>
  )
}
