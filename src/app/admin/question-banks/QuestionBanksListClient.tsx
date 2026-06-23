'use client'

import { useState } from 'react'
import Link from 'next/link'
import { deleteQuestionBank } from '@/app/actions/admin'

interface QuestionBank {
  id:             string
  name:           string
  description:    string | null
  created_at:     string
  question_count: number
}

export default function QuestionBanksListClient({ initialBanks }: { initialBanks: QuestionBank[] }) {
  const [banks,   setBanks]   = useState(initialBanks)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  async function handleDelete(bankId: string) {
    if (!confirm('Delete this question bank and all its questions? This cannot be undone.')) return
    setDeleting(bankId)
    const res = await deleteQuestionBank(bankId)
    setDeleting(null)
    if (res.error) { setError(res.error); return }
    setBanks((prev) => prev.filter((b) => b.id !== bankId))
  }

  if (!banks.length) {
    return (
      <div className="bg-white border border-border rounded-xl p-12 text-center">
        <p className="text-3xl mb-3">🗂️</p>
        <p className="font-semibold text-foreground">No question banks yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Create a bank to start adding reusable questions.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2" role="alert">
          {error}
        </p>
      )}
      {banks.map((bank) => (
        <div
          key={bank.id}
          className="bg-white border border-border rounded-xl px-5 py-4 flex items-center gap-4"
        >
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{bank.name}</p>
            {bank.description && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{bank.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {bank.question_count} question{bank.question_count !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/admin/question-banks/${bank.id}`}
              className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              Edit
            </Link>
            <span className="text-border">|</span>
            <button
              type="button"
              onClick={() => handleDelete(bank.id)}
              disabled={deleting === bank.id}
              className="text-sm font-semibold text-rose-500 hover:text-rose-700 transition-colors disabled:opacity-50"
            >
              {deleting === bank.id ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
