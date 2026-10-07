'use client'

import { useState } from 'react'
import { Sparkles, BookOpen, Languages, HelpCircle, Loader2 } from 'lucide-react'

interface EditorAiCoPilotBubbleProps {
  selectedText: string
  onInsertResult: (content: string) => void
}

export function EditorAiCoPilotBubble({
  selectedText,
  onInsertResult,
}: EditorAiCoPilotBubbleProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [activeTask, setActiveTask] = useState<string | null>(null)

  if (!selectedText || selectedText.trim().length < 10) return null

  const handleTriggerAction = async (task: 'quiz' | 'scripture' | 'translate-es' | 'translate-pt' | 'reflection') => {
    setIsLoading(true)
    setActiveTask(task)

    try {
      if (task === 'quiz') {
        const res = await fetch('/api/ai/material-generator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: `Create 2 multiple choice quiz questions based on this text:\n\n${selectedText}`,
            materialType: 'study_guide',
          }),
        })
        const data = await res.json()
        if (data.material?.body) {
          onInsertResult(`\n\n### 📝 Quick Knowledge Check\n${data.material.body}`)
        }
      } else if (task === 'scripture') {
        const res = await fetch('/api/ai/socratic-exegesis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            passageReference: selectedText.slice(0, 100),
            studentQuestion: 'Provide 3 key Scripture cross-references and their contextual theological significance for this concept.',
          }),
        })
        const data = await res.json()
        if (data.exegesis?.patristic_citations || data.exegesis?.hermeneutical_analysis) {
          onInsertResult(`\n\n> 📖 **Scripture Cross-References**\n> ${data.exegesis.hermeneutical_analysis || selectedText}`)
        }
      } else if (task === 'translate-es' || task === 'translate-pt') {
        const targetLang = task === 'translate-es' ? 'Spanish' : 'Portuguese'
        const res = await fetch('/api/ai/translate-discussion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: selectedText,
            targetLanguage: targetLang,
          }),
        })
        const data = await res.json()
        if (data.translatedContent) {
          onInsertResult(`\n\n*(${targetLang})* ${data.translatedContent}`)
        }
      } else if (task === 'reflection') {
        onInsertResult(`\n\n> 💭 **Reflection Question:** How does this truth apply to your personal walk with Christ this week?`)
      }
    } catch (err) {
      console.error('Co-pilot execution error:', err)
    } finally {
      setIsLoading(false)
      setActiveTask(null)
    }
  }

  return (
    <div className="flex items-center gap-1 p-1.5 rounded-2xl bg-zinc-900/95 text-white shadow-2xl border border-zinc-700/80 backdrop-blur-md text-xs animate-in fade-in zoom-in-95">
      <div className="flex items-center gap-1.5 px-2 py-1 text-indigo-400 font-semibold border-r border-zinc-800 pr-2">
        <Sparkles className="w-3.5 h-3.5" />
        <span className="text-[11px]">AI Co-Pilot</span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 px-3 py-1 text-zinc-300">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
          <span className="text-[11px] capitalize">Generating {activeTask}...</span>
        </div>
      ) : (
        <>
          <button
            onClick={() => handleTriggerAction('quiz')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl hover:bg-zinc-800 text-zinc-300 hover:text-white transition text-[11px]"
            title="Generate 2 Quiz Questions"
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Quiz</span>
          </button>

          <button
            onClick={() => handleTriggerAction('scripture')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl hover:bg-zinc-800 text-zinc-300 hover:text-white transition text-[11px]"
            title="Find Scripture Cross-References"
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span>Scripture</span>
          </button>

          <button
            onClick={() => handleTriggerAction('translate-es')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl hover:bg-zinc-800 text-zinc-300 hover:text-white transition text-[11px]"
            title="Translate to Spanish"
          >
            <Languages className="w-3.5 h-3.5 text-sky-400" />
            <span>ES</span>
          </button>

          <button
            onClick={() => handleTriggerAction('translate-pt')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl hover:bg-zinc-800 text-zinc-300 hover:text-white transition text-[11px]"
            title="Translate to Portuguese"
          >
            <Languages className="w-3.5 h-3.5 text-emerald-400" />
            <span>PT</span>
          </button>
        </>
      )}
    </div>
  )
}
