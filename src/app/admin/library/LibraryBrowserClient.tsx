'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LibraryTemplate } from '@/lib/library'
import { adoptTemplate } from '@/app/actions/library'

interface Props {
  templates: LibraryTemplate[]
  adoptedTemplateIds: string[] | Set<string>
}

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  all: { label: 'All Topics', icon: '📚', color: 'slate' },
  discipleship: { label: 'Discipleship & Foundations', icon: '✝️', color: 'indigo' },
  volunteers: { label: 'Volunteers & Hospitality', icon: '🤝', color: 'teal' },
  safety: { label: 'Child Safety & Safeguarding', icon: '🛡️', color: 'rose' },
  leadership: { label: 'Leadership & Ministry', icon: '👑', color: 'amber' },
  theology: { label: 'Biblical & Theological', icon: '📖', color: 'violet' },
}

export default function LibraryBrowserClient({ templates, adoptedTemplateIds }: Props) {
  const adoptedSet = React.useMemo(
    () => (adoptedTemplateIds instanceof Set ? adoptedTemplateIds : new Set(adoptedTemplateIds)),
    [adoptedTemplateIds]
  )
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'all' | 'courses' | 'packs'>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [previewTemplate, setPreviewTemplate] = useState<LibraryTemplate | null>(null)
  const [adoptingId, setAdoptingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const filtered = templates.filter(t => {
    if (activeTab === 'courses' && t.is_starter_pack) return false
    if (activeTab === 'packs' && !t.is_starter_pack) return false
    if (selectedCategory !== 'all' && t.category !== selectedCategory) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchTitle = t.title.toLowerCase().includes(q)
      const matchDesc = (t.description || '').toLowerCase().includes(q)
      if (!matchTitle && !matchDesc) return false
    }
    return true
  })

  const handleAdopt = async (template: LibraryTemplate, mode: 'copy' | 'linked') => {
    setAdoptingId(template.id)
    setFeedback(null)

    try {
      const res = await adoptTemplate({ templateId: template.id, mode })
      if (!res.success) throw new Error(res.error || 'Failed to adopt template')

      setFeedback({
        type: 'success',
        message: template.is_starter_pack
          ? `🎉 Starter Pack "${template.title}" adopted! Created ${res.coursesCreated || 1} course(s) and an integrated Learning Path.`
          : `🎉 Course "${template.title}" adopted! Added ${res.blocksCreated || 0} lessons to your course catalog.`,
      })
      setPreviewTemplate(null)
      router.refresh()
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Adoption failed' })
    } finally {
      setAdoptingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-sm border flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-700 text-emerald-200'
              : 'bg-rose-950/70 border-rose-700 text-rose-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-xs underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs & Search Filter Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-1">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Items ({templates.length})
          </button>
          <button
            onClick={() => setActiveTab('packs')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'packs'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            📦 Starter Packs ({templates.filter(t => t.is_starter_pack).length})
          </button>
          <button
            onClick={() => setActiveTab('courses')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'courses'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            📖 Courses ({templates.filter(t => !t.is_starter_pack).length})
          </button>
        </div>

        <div className="w-full sm:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search templates & topics..."
            className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {Object.entries(CATEGORY_META).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setSelectedCategory(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 border ${
              selectedCategory === key
                ? 'bg-indigo-950 text-indigo-200 border-indigo-600 shadow-sm'
                : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <span>{meta.icon}</span>
            <span>{meta.label}</span>
          </button>
        ))}
      </div>

      {/* Template Grid */}
      {filtered.length === 0 ? (
        <div className="p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center">
          <span className="text-4xl">🔍</span>
          <p className="text-slate-400 text-sm italic mt-2">No templates found matching your criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(template => {
            const isAdopted = adoptedSet.has(template.id)
            const cat = CATEGORY_META[template.category] || CATEGORY_META.all

            return (
              <div
                key={template.id}
                className="relative rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 p-6 flex flex-col justify-between shadow-lg hover:border-slate-700 transition-all group"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="p-2.5 rounded-xl bg-slate-800/80 text-2xl shadow-inner border border-slate-700/50">
                      {template.is_starter_pack ? '📦' : cat.icon}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {template.is_starter_pack && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800">
                          Bundle
                        </span>
                      )}
                      {isAdopted && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          ✓ Adopted
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">
                      {template.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1.5 line-clamp-3 leading-relaxed">
                      {template.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
                    <span className="capitalize">{template.category}</span>
                    <span>·</span>
                    <span className="uppercase">{template.language}</span>
                    <span>·</span>
                    <span>{template.attribution}</span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                  <button
                    onClick={() => setPreviewTemplate(template)}
                    className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    View Syllabus →
                  </button>

                  <button
                    onClick={() => handleAdopt(template, 'copy')}
                    disabled={isAdopted || adoptingId === template.id}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      isAdopted
                        ? 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-800'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'
                    }`}
                  >
                    {adoptingId === template.id
                      ? 'Adopting...'
                      : isAdopted
                      ? 'In Your Catalog'
                      : template.is_starter_pack
                      ? 'Adopt Bundle'
                      : 'Adopt Course'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Syllabus & Curriculum Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                  Curriculum Preview
                </span>
                <h3 className="text-xl font-bold text-white mt-1">{previewTemplate.title}</h3>
                <p className="text-xs text-slate-400 mt-1">{previewTemplate.description}</p>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="text-slate-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-4 pr-1 border-y border-slate-800 py-4">
              <h4 className="text-xs font-bold text-slate-300 uppercase">
                {previewTemplate.is_starter_pack ? 'Included Courses in Track' : 'Course Modules & Lessons'}
              </h4>

              {previewTemplate.is_starter_pack ? (
                <div className="space-y-2">
                  {(previewTemplate.snapshot.bundle_slugs || []).map((slug, idx) => (
                    <div key={slug} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                      <span className="font-semibold text-white">Course {idx + 1}: {slug.replace(/-/g, ' ').toUpperCase()}</span>
                      <p className="text-slate-400 text-[11px] mt-0.5">Adopted into integrated sequence on learning path.</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {(previewTemplate.snapshot.modules || []).map((mod, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <h5 className="font-bold text-white text-xs">{mod.title}</h5>
                      <div className="divide-y divide-slate-800/60 pl-2">
                        {(mod.blocks || []).map((b, bIdx) => (
                          <div key={bIdx} className="py-1.5 flex items-center justify-between text-xs">
                            <span className="text-slate-300">{b.title}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                              {b.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <p><strong>License:</strong> {previewTemplate.license}</p>
                <p><strong>Attribution:</strong> {previewTemplate.attribution}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setPreviewTemplate(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Close
              </button>

              <button
                onClick={() => handleAdopt(previewTemplate, 'copy')}
                disabled={adoptedSet.has(previewTemplate.id) || adoptingId === previewTemplate.id}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50"
              >
                {adoptingId === previewTemplate.id
                  ? 'Adopting...'
                  : adoptedSet.has(previewTemplate.id)
                  ? 'Already Adopted'
                  : 'Adopt as Editable Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
