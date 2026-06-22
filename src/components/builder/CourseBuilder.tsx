'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { CourseBlock, BlockTypeId, BlockFormData } from '@/types/blocks'
import { BLOCK_TYPE_META } from '@/types/blocks'
import AssetLibrary from './AssetLibrary'
import NodeForm from './NodeForm'
import OutlineGeneratorModal from './OutlineGeneratorModal'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { reorderCourseBlocks } from '@/app/actions/learning'

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
  const [saving,        setSaving]        = useState(false)
  const [reorderState,  setReorderState]  = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showOutline,   setShowOutline]   = useState(false)

  const supabase = createClient()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const items     = [...activeModuleItems]
    const oldIndex  = items.findIndex((b) => b.id === active.id)
    const newIndex  = items.findIndex((b) => b.id === over.id)
    const reordered = arrayMove(items, oldIndex, newIndex)

    // Optimistic UI update
    const reorderedIds = reordered.map((b) => b.id)
    setBlocks((prev) => {
      const otherBlocks = prev.filter((b) => b.parent_block_id !== active.id && !reorderedIds.includes(b.id)
        || b.parent_block_id !== items[0]?.parent_block_id)
      // Replace items in the active module with the reordered list (with updated sort_order)
      const reorderedWithOrder = reordered.map((b, i) => ({ ...b, sort_order: i + 1 }))
      return prev.map((b) => {
        const updated = reorderedWithOrder.find((r) => r.id === b.id)
        return updated ?? b
      })
    })

    setReorderState('saving')
    const result = await reorderCourseBlocks({ courseId, reorderedIds })
    if (result.error) {
      // Revert optimistic update on error
      setBlocks(blocks)
      setReorderState('error')
    } else {
      setReorderState('saved')
    }
    setTimeout(() => setReorderState('idle'), 2000)
  }

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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowOutline(true)}
              className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
              title="Generate outline with AI"
            >
              ✨ AI
            </button>
            <button
              onClick={() => setAddingModule(true)}
              className="text-indigo-400 hover:text-indigo-300 text-lg leading-none transition-colors"
              title="Add module"
              type="button"
            >
              +
            </button>
          </div>
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
                <div className="flex items-center gap-3">
                  {reorderState === 'saving' && (
                    <span className="text-xs text-slate-400 animate-pulse">Saving…</span>
                  )}
                  {reorderState === 'saved' && (
                    <span className="text-xs text-emerald-400">Saved ✓</span>
                  )}
                  {reorderState === 'error' && (
                    <span className="text-xs text-rose-400">Save failed — reverted</span>
                  )}
                  <button
                    type="button"
                    onClick={() => { setShowLibrary(true); setSelectedType(null); setEditingBlock(null) }}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-500 transition-colors"
                  >
                    + Add Content
                  </button>
                </div>
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
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={activeModuleItems.map((b) => b.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {activeModuleItems.map((block, idx) => (
                        <SortableBlockRow
                          key={block.id}
                          block={block}
                          idx={idx}
                          total={activeModuleItems.length}
                          isEditing={editingBlock?.id === block.id}
                          onEdit={() => handleEditBlock(block)}
                          onDelete={() => handleDeleteBlock(block.id)}
                          onMove={(dir) => handleMoveBlock(block.id, dir)}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
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

      {/* AI Outline Generator modal */}
      {showOutline && (
        <OutlineGeneratorModal
          courseId={courseId}
          onClose={() => setShowOutline(false)}
          onOutlineAccepted={() => {
            setShowOutline(false)
            // Reload the page to show the newly created blocks
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}

function SortableBlockRow({
  block, idx, total, isEditing, onEdit, onDelete, onMove,
}: {
  block:     CourseBlock
  idx:       number
  total:     number
  isEditing: boolean
  onEdit:    () => void
  onDelete:  () => void
  onMove:    (dir: 'up' | 'down') => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const meta = BLOCK_TYPE_META[block.block_type_id]

  return (
    <div
      ref={setNodeRef}
      // transform and transition are dynamic values from @dnd-kit — cannot be static CSS
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-3 p-4 bg-slate-900 border rounded-xl transition-colors ${
        isEditing ? 'border-indigo-500' : 'border-slate-800 hover:border-slate-600'
      } ${isDragging ? 'opacity-50' : 'opacity-100'}`}
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-slate-600 hover:text-slate-300 transition-colors shrink-0 touch-none"
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        ⠿
      </button>

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
        <button type="button" onClick={() => onMove('up')} disabled={idx === 0}
          title="Move up"
          className="p-1.5 text-slate-500 hover:text-white disabled:opacity-20 transition-colors text-xs">▲</button>
        <button type="button" onClick={() => onMove('down')} disabled={idx === total - 1}
          title="Move down"
          className="p-1.5 text-slate-500 hover:text-white disabled:opacity-20 transition-colors text-xs">▼</button>
        <button type="button" onClick={onEdit}
          className="p-1.5 text-slate-500 hover:text-indigo-400 transition-colors text-xs font-bold">Edit</button>
        <button type="button" onClick={onDelete}
          title="Delete"
          className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors text-xs">✕</button>
      </div>
    </div>
  )
}
