'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  BookOpen,
  Sparkles,
  Award,
  Layers,
  BarChart3,
  Headphones,
  Settings,
  MessageSquare,
  FileUp,
  X,
  Compass,
} from 'lucide-react'

export interface PaletteActionItem {
  id: string
  title: string
  subtitle?: string
  category: 'Navigation' | 'AI Tools' | 'Actions' | 'Learning'
  icon: React.ReactNode
  href?: string
  action?: () => void
  keywords?: string[]
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const defaultActions: PaletteActionItem[] = [
    {
      id: 'nav-dashboard',
      title: 'Dashboard',
      subtitle: 'Overview of courses, streak, and recent progress',
      category: 'Navigation',
      icon: <Compass className="w-4 h-4 text-indigo-500" />,
      href: '/dashboard',
    },
    {
      id: 'nav-courses',
      title: 'Course Catalog & Learning',
      subtitle: 'Browse enrolled and published courses',
      category: 'Navigation',
      icon: <BookOpen className="w-4 h-4 text-emerald-500" />,
      href: '/courses',
    },
    {
      id: 'nav-paths',
      title: 'Discipleship Pathways',
      subtitle: 'Multi-course progression tracks',
      category: 'Navigation',
      icon: <Layers className="w-4 h-4 text-purple-500" />,
      href: '/paths',
    },
    {
      id: 'ai-synthesizer',
      title: 'Synthesize Course from Documents (Word/PPTX/PDF)',
      subtitle: 'Batch convert slides and notes into a published course',
      category: 'AI Tools',
      icon: <FileUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />,
      action: () => {
        setIsOpen(false)
        window.dispatchEvent(new CustomEvent('open-doc-synthesizer'))
      },
      keywords: ['upload', 'powerpoint', 'slides', 'docx', 'notes', 'curriculum', 'import'],
    },
    {
      id: 'ai-sermon',
      title: 'Pulpit-to-Pathway (Sermon-to-Curriculum)',
      subtitle: 'Transform sermon manuscripts into small-group devotionals',
      category: 'AI Tools',
      icon: <Sparkles className="w-4 h-4 text-amber-500" />,
      href: '/courses/new',
      keywords: ['sermon', 'pastor', 'devotional', 'small group'],
    },
    {
      id: 'nav-badges',
      title: 'Open Badges & Verifiable Credentials',
      subtitle: 'View earned 1EdTech microcredentials and certifications',
      category: 'Learning',
      icon: <Award className="w-4 h-4 text-amber-500" />,
      href: '/admin/badges',
      keywords: ['certificate', 'badge', 'linkedin', 'credential'],
    },
    {
      id: 'nav-podcast',
      title: 'Discipleship Podcast Feed',
      subtitle: 'Subscribe in Apple Podcasts, Spotify, or Overcast',
      category: 'Learning',
      icon: <Headphones className="w-4 h-4 text-purple-500" />,
      action: () => {
        setIsOpen(false)
        window.dispatchEvent(new CustomEvent('open-podcast-modal'))
      },
      keywords: ['audio', 'rss', 'apple', 'spotify', 'listen'],
    },
    {
      id: 'nav-gradebook',
      title: 'Gradebook & Rubric Matrix',
      subtitle: 'Evaluate submissions, rubrics, and gradebook scores',
      category: 'Navigation',
      icon: <BarChart3 className="w-4 h-4 text-blue-500" />,
      href: '/courses',
    },
    {
      id: 'nav-messages',
      title: 'Messages & Guardian Threads',
      subtitle: 'Direct conversations with teachers and guardians',
      category: 'Navigation',
      icon: <MessageSquare className="w-4 h-4 text-pink-500" />,
      href: '/messages',
    },
    {
      id: 'nav-settings',
      title: 'Organization & Account Settings',
      subtitle: 'Manage profile, integrations, and preferences',
      category: 'Actions',
      icon: <Settings className="w-4 h-4 text-zinc-500" />,
      href: '/admin/settings',
    },
  ]

  // Global Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    const handleCustomOpen = () => setIsOpen(true)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('open-command-palette', handleCustomOpen)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('open-command-palette', handleCustomOpen)
    }
  }, [isOpen])

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setSelectedIndex(0)
    } else {
      setQuery('')
    }
  }, [isOpen])

  // Filter items
  const filtered = defaultActions.filter((item) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      item.title.toLowerCase().includes(q) ||
      item.subtitle?.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.keywords?.some((k) => k.toLowerCase().includes(q))
    )
  })

  // Keyboard navigation within list
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[selectedIndex]
      if (item) {
        executeItem(item)
      }
    }
  }

  const executeItem = (item: PaletteActionItem) => {
    setIsOpen(false)
    if (item.action) {
      item.action()
    } else if (item.href) {
      router.push(item.href)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800 gap-3">
          <Search className="w-5 h-5 text-zinc-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command, search courses, or tools..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleInputKeyDown}
            className="w-full bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 text-sm focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded border border-zinc-200 dark:border-zinc-700">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No matching commands or courses found for &quot;{query}&quot;.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex
              return (
                <div
                  key={item.id}
                  onClick={() => executeItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition text-xs ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-100 border border-indigo-200 dark:border-indigo-800/80'
                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/70 text-zinc-700 dark:text-zinc-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex-shrink-0">
                      {item.icon}
                    </div>
                    <div className="truncate">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm truncate">
                        {item.title}
                      </p>
                      {item.subtitle && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex-shrink-0">
                    {item.category}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-950/50 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-2">
            <span>Navigate <kbd className="font-mono bg-zinc-200 dark:bg-zinc-800 px-1 rounded">↑</kbd><kbd className="font-mono bg-zinc-200 dark:bg-zinc-800 px-1 rounded">↓</kbd></span>
            <span>Select <kbd className="font-mono bg-zinc-200 dark:bg-zinc-800 px-1.5 rounded">↵</kbd></span>
          </div>
          <span>ChurchCore Spotlight</span>
        </div>
      </div>
    </div>
  )
}
