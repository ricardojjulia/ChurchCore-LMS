'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { CourseBlock, BlockTypeId, BlockFormData } from '@/types/blocks'
import { BLOCK_TYPE_META } from '@/types/blocks'
import AssetLibrary from './AssetLibrary'
import NodeForm from './NodeForm'

interface Props {
  courseId: string
  initialBlocks: CourseBlock[]
}

function nextSortOrder(items: CourseBlock[]): number {
  if (items.length === 0) return 1000
  return Math.max(...items.map((b) => b.sort_order)) + 1000
}

export default function CourseBuilder({ courseId, initialBlocks }: Props) {
  const [blocks, setBlocks] = useState<CourseBlock[]>(initialBlocks)
  const [activeModuleId, setActiveModuleId] = useState<string | null>(
    initialBlocks.find((b) => b.block_type_id === 'module_header')?.id ?? null
  )
  const [showLibrary, setShowLibrary] = useState(false)
  const [selectedType, setSelectedType] = useState<BlockTypeId | null>(null)
  const [editingBlock, setEditingBlock] = useState<CourseBlock | null>(null)
  const [addingModule, setAddingModule] = useState(false)
  const [newModuleTitle, setNewModuleTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  const moduleHeaders = blocks
    .filter((b) => b.block_type_id === 'module_header' && !b.parent_block_id)
    .sort((a, b) => a.sort_order - b.sort_order)

  const activeModuleItems = activeModuleId
    ? blocks.filter((b) => b.parent_block_id === activeModuleId).sort((a, b) => a.sort_order - b.sort_order)
    : []

  // ─── Module operations ──────────────────────────────────────────────────────

  async function handleAddModule(e: React.FormEvent) {
    e.preventDefault()
    if (!newModuleTitle.trim()) return
    setSaving(true)

    const { data, error } = await supabase
      .from('course_blocks')
      .insert({
        course_id: courseId,
        block_type_id: 'module_header',
        title: newModuleTitle.trim(),
        sort_order: nextSortOrder(moduleHeaders),
      })
      .select()
      .single()

    setSaving(false)
    if (error || !data) return
    setBlocks((prev) => [...prev, data as CourseBlock])
    setActiveModuleId(data.id)
    setNewModuleTitle('')
    setAddingModule(false)
  }

  async function handleDeleteModule(moduleId: string) {
    if (!confirm('Delete this module and all its content?')) return
    await supabase.from('course_blocks').delete().eq('id', moduleId)
    setBlocks((prev) => prev.filter((b) => b.id !== moduleId && b.parent_block_id !== moduleId))
    if (activeModuleId === moduleId) {
      setActiveModuleId(moduleHeaders.find((m) => m.id !== moduleId)?.id ?? null)
    }
  }

  // ─── Item operations ────────────────────────────────────────────────────────

  function handleLibrarySelect(typeId: BlockTypeId) {
    setShowLibrary(false)
    setSelectedType(typeId)
    setEditingBlock(null)
  }

  async function handleSaveBlock(data: BlockFormData) {
    if (!activeModuleId) return
    setSaving(true)

    if (editingBlock) {
      const { data: updated, error } = await supabase
        .from('course_blocks')
        .update({ title: data.title, content: data.content, gamification: data.gamification ?? {} })
        .eq('id', editingBlock.id)
        .select()
        .single()

      setSaving(false)
      if (error || !updated) return
      setBlocks((prev) => prev.map((b) => (b.id === editingBlock.id ? (updated as CourseBlock) : b)))
    } else {
      const { data: inserted, error } = await supabase
        .from('course_blocks')
        .insert({
          course_id: courseId,
          parent_block_id: activeModuleId,
          block_type_id: selectedType!,
          title: data.title,
          content: data.content,
          gamification: data.gamification ?? {},
          sort_order: nextSortOrder(activeModuleItems),
        })
        .select()
        .single()

      setSaving(false)
      if (error || !inserted) return
      setBlocks((prev) => [...prev, inserted as CourseBlock])
    }

    setSelectedType(null)
    setEditingBlock(null)
  }

  function handleEditBlock(block: CourseBlock) {
    setEditingBlock(block)
    setSelectedType(block.block_type_id)
    setShowLibrary(false)
  }

  async function handleDeleteBlock(blockId: string) {
    await supabase.from('course_blocks').delete().eq('id', blockId)
    setBlocks((prev) => prev.filter((b) => b.id !== blockId))
    if (editingBlock?.id === blockId) {
      setSelectedType(null)
      setEditingBlock(null)
    }
  }

  async function handleMoveBlock(blockId: string, dir: 'up' | 'down') {
    const items = [...activeModuleItems]
    const idx = items.findIndex((b) => b.id === blockId)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= items.length) return

    const [a, b] = [items[idx], items[swapIdx]]
    await Promise.all([
      supabase.from('course_blocks').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('course_blocks').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    setBlocks((prev) =>
      prev.map((block) => {
        if (block.id === a.id) return { ...block, sort_order: b.sort_order }
        if (block.id === b.id) return { ...block, sort_order: a.sort_order }
        return block
      })
    )
  }

  const showForm = !!selectedType

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Module sidebar ─────────────────────────────────────────────── */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Modules</span>
          <button
            onClick={() => setAddingModule(true)}
            className="text-indigo-400 hover:text-indigo-300 text-lg leading-none transition-colors"
            title="Add module"
            type="button"
          >
            +
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {moduleHeaders.map((m) => (
            <div
              key={m.id}
              className={`group flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                activeModuleId === m.id
                  ? 'bg-indigo-900/40 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
              onClick={() => {
                setActiveModuleId(m.id)
                setSelectedType(null)
                setEditingBlock(null)
              }}
            >
              <span className="text-sm font-medium truncate">{m.title}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleDeleteModule(m.id) }}
                className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-400 transition-all text-xs ml-2"
              >
                ✕
              </button>
            </div>
          ))}

          {addingModule && (
            <form onSubmit={handleAddModule} className="px-4 py-3">
              <input
                autoFocus
                value={newModuleTitle}
                onChange={(e) => setNewModuleTitle(e.target.value)}
                placeholder="Module title…"
                title="New module title"
                className="w-full bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              />
              <div className="flex gap-2 mt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 text-xs bg-indigo-600 text-white rounded-lg py-1.5 font-bold hover:bg-indigo-500 transition-colors disabled:opacity-50">
                  {saving ? '…' : 'Add'}
                </button>
                <button type="button" onClick={() => setAddingModule(false)}
                  className="flex-1 text-xs bg-slate-700 text-slate-300 rounded-lg py-1.5 hover:bg-slate-600 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </aside>

      {/* ── Main content area ───────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Items list */}
        <div className={`flex flex-col overflow-hidden transition-all ${showForm ? 'w-1/2' : 'flex-1'}`}>
          {activeModuleId ? (
            <>
              <div className="px-8 py-5 border-b border-slate-800 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-white font-bold text-lg">
                    {moduleHeaders.find((m) => m.id === activeModuleId)?.title}
                  </h2>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {activeModuleItems.length} item{activeModuleItems.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowLibrary(true); setSelectedType(null); setEditingBlock(null) }}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-500 transition-colors"
                >
                  + Add Content
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-3">
                {activeModuleItems.length === 0 ? (
                  <div className="text-center py-20">
                    <p className="text-slate-600 text-sm mb-4">No content yet.</p>
                    <button
                      type="button"
                      onClick={() => setShowLibrary(true)}
                      className="px-5 py-2.5 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-sm font-semibold rounded-xl transition-colors"
                    >
                      + Add your first item
                    </button>
                  </div>
                ) : (
                  activeModuleItems.map((block, idx) => {
                    const meta = BLOCK_TYPE_META[block.block_type_id]
                    const isEditing = editingBlock?.id === block.id
                    return (
                      <div
                        key={block.id}
                        className={`group flex items-center gap-4 p-4 bg-slate-900 border rounded-xl transition-all ${
                          isEditing ? 'border-indigo-500' : 'border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <span className="text-xl shrink-0">{meta?.icon ?? '📦'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-sm truncate">{block.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-500">{meta?.label ?? block.block_type_id}</span>
                            {block.gamification?.base_xp_reward ? (
                              <span className="text-xs text-indigo-400 font-bold">
                                +{block.gamification.base_xp_reward} XP
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button type="button" onClick={() => handleMoveBlock(block.id, 'up')} disabled={idx === 0}
                            title="Move up"
                            className="p-1.5 text-slate-500 hover:text-white disabled:opacity-20 transition-colors text-xs">▲</button>
                          <button type="button" onClick={() => handleMoveBlock(block.id, 'down')} disabled={idx === activeModuleItems.length - 1}
                            title="Move down"
                            className="p-1.5 text-slate-500 hover:text-white disabled:opacity-20 transition-colors text-xs">▼</button>
                          <button type="button" onClick={() => handleEditBlock(block)}
                            className="p-1.5 text-slate-500 hover:text-indigo-400 transition-colors text-xs font-bold">Edit</button>
                          <button type="button" onClick={() => handleDeleteBlock(block.id)}
                            title="Delete"
                            className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors text-xs">✕</button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-slate-600 text-sm mb-3">No module selected.</p>
                <button
                  type="button"
                  onClick={() => setAddingModule(true)}
                  className="text-sm text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
                >
                  + Add your first module
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Node form panel */}
        {showForm && selectedType && (
          <div className="w-1/2 border-l border-slate-800 bg-slate-900 flex flex-col overflow-hidden">
            <NodeForm
              blockTypeId={selectedType}
              initial={editingBlock ?? undefined}
              onSave={handleSaveBlock}
              onCancel={() => { setSelectedType(null); setEditingBlock(null) }}
            />
          </div>
        )}
      </div>

      {/* Asset library modal */}
      {showLibrary && (
        <AssetLibrary
          onSelect={handleLibrarySelect}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  )
}
