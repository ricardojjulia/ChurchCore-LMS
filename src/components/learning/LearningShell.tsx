'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { BLOCK_TYPE_META } from '@/types/blocks'
import BlockPlayer from './BlockPlayer'
import { markBlockViewed } from '@/app/actions/learning'
import type { CourseBlock } from '@/types/blocks'

interface Submission {
  blockId:   string
  status:    string
  content:   Record<string, unknown>
  score:     number | null
  max_score: number | null
  grade_pct: number | null
  feedback:  string | null
}

interface Module {
  id:    string
  title: string
}

interface Props {
  courseId:        string
  courseTitle:     string
  modules:         Module[]
  blocks:          CourseBlock[]
  submissions:     Submission[]
  initialBlockId:  string | null
  progressPercent: number
  isStaff:         boolean
}

const CONTENT_TYPES = new Set(['page', 'video_stream', 'resource_file', 'external_url'])

export default function LearningShell({
  courseId, courseTitle, modules, blocks, submissions, initialBlockId, progressPercent, isStaff,
}: Props) {
  const publishedBlocks = blocks.filter((b) => b.is_published || isStaff)

  const findFirst = () =>
    publishedBlocks.find((b) => b.parent_block_id !== null && b.block_type_id !== 'module_header')
    ?? publishedBlocks[0]
    ?? null

  // Pre-populate completed set from server-side submission data
  const initialCompleted = new Set(
    submissions.filter((s) => s.status !== 'draft').map((s) => s.blockId)
  )

  const [currentId,       setCurrentId]      = useState<string | null>(initialBlockId ?? findFirst()?.id ?? null)
  const [sidebarOpen,     setSidebarOpen]    = useState(true)
  const [xpToast,         setXpToast]        = useState<number | null>(null)
  const [completedIds,    setCompletedIds]   = useState<Set<string>>(initialCompleted)
  const [, startTransition] = useTransition()
  const router = useRouter()

  const current = publishedBlocks.find((b) => b.id === currentId)

  const moduleHeaders = publishedBlocks.filter((b) => b.block_type_id === 'module_header')
  const childBlocks   = (moduleId: string) =>
    publishedBlocks.filter((b) => b.parent_block_id === moduleId)

  const navBlocks    = publishedBlocks.filter((b) => b.block_type_id !== 'module_header')
  const currentIndex = navBlocks.findIndex((b) => b.id === currentId)
  const prevBlock    = currentIndex > 0 ? navBlocks[currentIndex - 1] : null
  const nextBlock    = currentIndex < navBlocks.length - 1 ? navBlocks[currentIndex + 1] : null

  function showXpToast(amount: number) {
    setXpToast(amount)
    setTimeout(() => setXpToast(null), 3000)
  }

  function trackCurrentBlock(viewedIndexAfter: number) {
    if (!current) return
    if (CONTENT_TYPES.has(current.block_type_id)) {
      const blockXp = (current.gamification as any)?.base_xp_reward ?? 0
      startTransition(async () => {
        const res = await markBlockViewed(courseId, current.id, navBlocks.length, viewedIndexAfter, blockXp)
        if (res.xpAwarded > 0) showXpToast(res.xpAwarded)
        setCompletedIds((prev) => new Set(prev).add(current.id))
      })
    }
  }

  // Called by QuizPlayer/AssignmentPlayer when a submission is accepted
  function handleBlockComplete(xpAwarded: number) {
    if (!current) return
    setCompletedIds((prev) => new Set(prev).add(current.id))
    if (xpAwarded > 0) showXpToast(xpAwarded)
    // Update enrollment progress without re-awarding XP (pass blockXp=0)
    startTransition(async () => {
      await markBlockViewed(courseId, current.id, navBlocks.length, currentIndex + 1, 0)
    })
  }

  function navigate(blockId: string) {
    const viewedAfter = currentIndex + 1
    trackCurrentBlock(viewedAfter)
    setCurrentId(blockId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function finishCourse() {
    const viewedAfter = navBlocks.length
    startTransition(async () => {
      const res = await markBlockViewed(
        courseId,
        current!.id,
        navBlocks.length,
        viewedAfter,
        (current!.gamification as any)?.base_xp_reward ?? 0
      )
      if (res.xpAwarded > 0) showXpToast(res.xpAwarded)
      router.push(`/courses/${courseId}/complete`)
    })
  }

  const subMap     = new Map(submissions.map((s) => [s.blockId, s]))
  const currentSub = current ? subMap.get(current.id) ?? null : null

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden relative">

      {/* XP toast */}
      {xpToast !== null && (
        <div className="fixed top-20 right-6 z-50 animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-lg">
            +{xpToast} XP ✨
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-200 shrink-0 overflow-hidden',
          sidebarOpen ? 'w-72' : 'w-0'
        )}
        aria-label="Course outline"
      >
        <div className="px-4 py-3 border-b border-slate-800">
          <Link
            href={`/courses/${courseId}`}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            ← {courseTitle}
          </Link>
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Progress</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-400 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2" aria-label="Course modules">
          {moduleHeaders.length === 0 ? (
            <div className="px-2 py-1">
              {navBlocks.map((block) => (
                <SidebarItem
                  key={block.id}
                  block={block}
                  active={block.id === currentId}
                  completed={completedIds.has(block.id)}
                  onClick={() => navigate(block.id)}
                />
              ))}
            </div>
          ) : (
            moduleHeaders.map((mod) => {
              const children = childBlocks(mod.id)
              return (
                <div key={mod.id} className="mb-1">
                  <div className="px-4 py-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">
                      {mod.title}
                    </p>
                  </div>
                  {children.map((block) => (
                    <SidebarItem
                      key={block.id}
                      block={block}
                      active={block.id === currentId}
                      completed={completedIds.has(block.id)}
                      onClick={() => navigate(block.id)}
                    />
                  ))}
                </div>
              )
            })
          )}
        </nav>
      </aside>

      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        className="absolute top-[calc(16px)] z-10 bg-slate-800 text-slate-400 hover:text-white border border-slate-700 rounded-r-lg px-1.5 py-3 text-[10px] transition-all"
        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        style={{ left: sidebarOpen ? '18rem' : '0' }}
      >
        {sidebarOpen ? '‹' : '›'}
      </button>

      {/* Main content */}
      <main id="main-content" className="flex-1 overflow-y-auto bg-slate-50">
        {!current ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-xl font-bold text-foreground mb-2">Welcome to {courseTitle}</p>
              <p className="text-muted-foreground text-sm">
                {navBlocks.length === 0
                  ? 'No published content yet.'
                  : 'Select a lesson from the sidebar to begin.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-8 px-6">
            {/* Block header */}
            <div className="mb-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <span>{BLOCK_TYPE_META[current.block_type_id]?.icon}</span>
                <span className="font-medium uppercase tracking-wide">
                  {BLOCK_TYPE_META[current.block_type_id]?.label ?? current.block_type_id}
                </span>
                {(current.gamification as any)?.base_xp_reward > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-indigo-500 font-semibold">
                      +{(current.gamification as any).base_xp_reward} XP
                    </span>
                  </>
                )}
                <span className="ml-auto text-[10px]">
                  {currentIndex + 1}/{navBlocks.length}
                </span>
              </div>
              <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
                {current.title}
              </h1>
            </div>

            {/* Block content */}
            <BlockPlayer block={current} submission={currentSub as any} onComplete={handleBlockComplete} />

            {/* Navigation */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-border">
              {prevBlock ? (
                <button
                  onClick={() => navigate(prevBlock.id)}
                  className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={`Previous: ${prevBlock.title}`}
                >
                  ← {prevBlock.title.length > 30 ? prevBlock.title.slice(0, 30) + '…' : prevBlock.title}
                </button>
              ) : <div />}

              {nextBlock ? (
                <button
                  onClick={() => navigate(nextBlock.id)}
                  className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
                  aria-label={`Next: ${nextBlock.title}`}
                >
                  {nextBlock.title.length > 30 ? nextBlock.title.slice(0, 30) + '…' : nextBlock.title} →
                </button>
              ) : !isStaff ? (
                <button
                  onClick={finishCourse}
                  className="flex items-center gap-2 bg-emerald-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Complete course 🎓
                </button>
              ) : (
                <Link
                  href={`/courses/${courseId}`}
                  className="flex items-center gap-2 bg-slate-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-slate-600 transition-colors"
                >
                  Back to course
                </Link>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function SidebarItem({
  block, active, completed, onClick,
}: {
  block:     CourseBlock
  active:    boolean
  completed: boolean
  onClick:   () => void
}) {
  const meta = BLOCK_TYPE_META[block.block_type_id]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors rounded-lg mx-1',
        active
          ? 'bg-indigo-600 text-white'
          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      )}
    >
      <span className="text-base shrink-0" aria-hidden="true">{meta?.icon ?? '📦'}</span>
      <span className="flex-1 truncate">{block.title}</span>
      {completed && (
        <span className="shrink-0 text-emerald-400 text-xs font-bold" aria-label="Completed">✓</span>
      )}
    </button>
  )
}
