'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { upsertQuestionBank } from '@/app/actions/admin'

export default function NewQuestionBankForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setPending(true)
    setError(null)

    const res = await upsertQuestionBank({ name, description })
    setPending(false)

    if (res.error) { setError(res.error); return }
    router.push(`/admin/question-banks/${res.id}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="qb-name" className="block text-sm font-semibold text-slate-200 mb-1.5">
          Name <span aria-hidden="true" className="text-rose-400">*</span>
        </label>
        <input
          id="qb-name"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Old Testament Survey"
          className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="qb-description" className="block text-sm font-semibold text-slate-200 mb-1.5">
          Description <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="qb-description"
          rows={3}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What kind of questions belong in this bank?"
          className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.push('/admin/question-banks')}
          className="font-semibold px-4 py-2 rounded-xl text-sm border border-slate-700 hover:bg-slate-800 transition-colors text-slate-300"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create Bank'}
        </button>
      </div>
    </form>
  )
}
