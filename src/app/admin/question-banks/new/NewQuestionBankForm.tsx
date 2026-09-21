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
        <label htmlFor="qb-name" className="block text-sm font-medium text-foreground mb-1">
          Name <span aria-hidden="true" className="text-red-500">*</span>
        </label>
        <input
          id="qb-name"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Old Testament Survey"
          className="input w-full"
        />
      </div>

      <div>
        <label htmlFor="qb-description" className="block text-sm font-medium text-foreground mb-1">
          Description <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          id="qb-description"
          rows={3}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What kind of questions belong in this bank?"
          className="input w-full resize-none"
        />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.push('/admin/question-banks')}
          className="btn btn-outline"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="btn btn-primary"
        >
          {pending ? 'Creating…' : 'Create Bank'}
        </button>
      </div>
    </form>
  )
}
