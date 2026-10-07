'use client'

import { useState, useEffect } from 'react'
import { Maximize2, Minimize2, Type, Sun, Moon, BookOpen, PenTool, Check, X } from 'lucide-react'

interface FocusModeReaderProps {
  title: string
  courseTitle?: string
  contentHtml: string
  isOpen: boolean
  onClose: () => void
}

type ReaderTheme = 'dark' | 'parchment' | 'clean-light' | 'sepia'
type ReaderFont = 'serif' | 'sans' | 'mono'
type FontSize = 'sm' | 'md' | 'lg' | 'xl'

export function FocusModeReader({
  title,
  courseTitle,
  contentHtml,
  isOpen,
  onClose,
}: FocusModeReaderProps) {
  const [theme, setTheme] = useState<ReaderTheme>('dark')
  const [font, setFont] = useState<ReaderFont>('serif')
  const [fontSize, setFontSize] = useState<FontSize>('md')
  const [showNotes, setShowNotes] = useState(false)
  const [personalNotes, setPersonalNotes] = useState('')
  const [savedStatus, setSavedStatus] = useState(false)

  // Load notes from local storage on mount
  useEffect(() => {
    if (isOpen && title) {
      const saved = localStorage.getItem(`focus_notes_${title}`)
      if (saved) setPersonalNotes(saved)
    }
  }, [isOpen, title])

  // ESC key to exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleNotesChange = (val: string) => {
    setPersonalNotes(val)
    if (title) {
      localStorage.setItem(`focus_notes_${title}`, val)
      setSavedStatus(true)
      setTimeout(() => setSavedStatus(false), 2000)
    }
  }

  if (!isOpen) return null

  const themeStyles: Record<ReaderTheme, { bg: string; text: string; border: string; accent: string }> = {
    dark: {
      bg: 'bg-zinc-950',
      text: 'text-zinc-200',
      border: 'border-zinc-800',
      accent: 'text-indigo-400',
    },
    parchment: {
      bg: 'bg-[#fbf7ee]',
      text: 'text-[#2c2621]',
      border: 'border-[#ebdcc3]',
      accent: 'text-amber-800',
    },
    'clean-light': {
      bg: 'bg-white',
      text: 'text-zinc-900',
      border: 'border-zinc-200',
      accent: 'text-indigo-600',
    },
    sepia: {
      bg: 'bg-[#f4ecd8]',
      text: 'text-[#433422]',
      border: 'border-[#ded1b4]',
      accent: 'text-amber-900',
    },
  }

  const fontClasses: Record<ReaderFont, string> = {
    serif: 'font-serif',
    sans: 'font-sans',
    mono: 'font-mono',
  }

  const sizeClasses: Record<FontSize, string> = {
    sm: 'text-base leading-relaxed',
    md: 'text-lg leading-loose',
    lg: 'text-xl leading-loose',
    xl: 'text-2xl leading-loose',
  }

  const currentTheme = themeStyles[theme]

  return (
    <div
      className={`fixed inset-0 z-50 overflow-y-auto ${currentTheme.bg} ${currentTheme.text} transition-colors duration-200 animate-in fade-in`}
    >
      {/* Top Floating Control Bar */}
      <div className={`sticky top-0 z-10 flex items-center justify-between px-6 py-3.5 backdrop-blur-md bg-opacity-90 border-b ${currentTheme.border}`}>
        <div className="flex items-center gap-2">
          <BookOpen className={`w-4 h-4 ${currentTheme.accent}`} />
          <span className="text-xs font-semibold uppercase tracking-wider opacity-75">
            {courseTitle || 'Focus Mode'}
          </span>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-3">
          {/* Themes */}
          <div className="flex items-center p-1 rounded-xl bg-black/10 dark:bg-white/10 gap-1 text-xs">
            <button
              onClick={() => setTheme('dark')}
              className={`p-1.5 rounded-lg ${theme === 'dark' ? 'bg-zinc-800 text-white' : 'opacity-60 hover:opacity-100'}`}
              title="Deep Dark"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setTheme('parchment')}
              className={`px-2 py-0.5 rounded-lg font-serif text-[11px] ${theme === 'parchment' ? 'bg-amber-200/80 text-amber-950 font-bold' : 'opacity-60 hover:opacity-100'}`}
              title="Parchment"
            >
              Parchment
            </button>
            <button
              onClick={() => setTheme('clean-light')}
              className={`p-1.5 rounded-lg ${theme === 'clean-light' ? 'bg-white text-zinc-900 shadow-sm' : 'opacity-60 hover:opacity-100'}`}
              title="Clean White"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Typography Selector */}
          <div className="flex items-center p-1 rounded-xl bg-black/10 dark:bg-white/10 gap-1 text-xs">
            {(['serif', 'sans', 'mono'] as ReaderFont[]).map((f) => (
              <button
                key={f}
                onClick={() => setFont(f)}
                className={`px-2 py-0.5 rounded-lg text-[11px] capitalize ${font === f ? 'bg-indigo-600 text-white font-bold' : 'opacity-60 hover:opacity-100'}`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Font Size Selector */}
          <div className="flex items-center p-1 rounded-xl bg-black/10 dark:bg-white/10 gap-1 text-xs">
            <Type className="w-3 h-3 opacity-50 ml-1" />
            {(['sm', 'md', 'lg', 'xl'] as FontSize[]).map((s) => (
              <button
                key={s}
                onClick={() => setFontSize(s)}
                className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${fontSize === s ? 'bg-indigo-600 text-white font-bold' : 'opacity-60 hover:opacity-100'}`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Reflection Notes Toggle */}
          <button
            onClick={() => setShowNotes((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              showNotes ? 'bg-indigo-600 text-white' : 'bg-black/10 dark:bg-white/10 hover:bg-black/20'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">My Notes</span>
          </button>

          {/* Exit Button */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-black/10 dark:bg-white/10 hover:bg-red-500 hover:text-white transition"
            title="Exit Focus Mode (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Reading Container & Split Notes */}
      <div className={`max-w-5xl mx-auto px-6 py-12 flex flex-col md:flex-row gap-8 ${fontClasses[font]}`}>
        {/* Lesson Article */}
        <div className={`flex-1 transition-all ${showNotes ? 'md:w-3/5' : 'max-w-3xl mx-auto'}`}>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-8">
            {title}
          </h1>

          <div
            className={`prose max-w-none ${sizeClasses[fontSize]} ${
              theme === 'dark' ? 'prose-invert' : ''
            }`}
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </div>

        {/* Personal Notes Sidebar */}
        {showNotes && (
          <div className={`md:w-2/5 p-5 rounded-2xl border ${currentTheme.border} bg-black/5 dark:bg-white/5 h-fit sticky top-20`}>
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-3">
              <span className="text-xs font-bold uppercase tracking-wider">Reflection Journal</span>
              {savedStatus && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                  <Check className="w-3 h-3" /> Saved
                </span>
              )}
            </div>
            <textarea
              placeholder="Record your personal reflections, prayer points, and application insights here..."
              value={personalNotes}
              onChange={(e) => handleNotesChange(e.target.value)}
              rows={12}
              className="w-full bg-transparent resize-none text-sm focus:outline-none placeholder-zinc-400 font-sans"
            />
          </div>
        )}
      </div>
    </div>
  )
}
