'use client'

import { useState } from 'react'
import type { BlockFormData } from '@/types/blocks'
import { FormShell, Field, XpField } from './FormShell'

const PROVIDERS = [
  { value: 'zoom',    label: 'Zoom' },
  { value: 'meet',    label: 'Google Meet' },
  { value: 'teams',   label: 'Microsoft Teams' },
  { value: 'youtube', label: 'YouTube Live' },
  { value: 'other',   label: 'Other' },
]

interface Props {
  initial?: {
    title?:         string
    description?:   string
    provider?:      string
    meeting_url?:   string
    scheduled_for?: string | null
    duration_min?:  number | null
    recording_url?: string | null
    gamification?:  { base_xp_reward?: number }
  }
  onSave:   (data: BlockFormData) => void
  onCancel: () => void
}

export default function LiveSessionForm({ initial, onSave, onCancel }: Props) {
  const [title,        setTitle]        = useState(initial?.title ?? '')
  const [description,  setDescription]  = useState(initial?.description ?? '')
  const [provider,     setProvider]     = useState(initial?.provider ?? 'zoom')
  const [meetingUrl,   setMeetingUrl]   = useState(initial?.meeting_url ?? '')
  const [scheduledFor, setScheduledFor] = useState(initial?.scheduled_for ?? '')
  const [durationMin,  setDurationMin]  = useState(initial?.duration_min ?? 60)
  const [recordingUrl, setRecordingUrl] = useState(initial?.recording_url ?? '')
  const [xp,           setXp]           = useState(initial?.gamification?.base_xp_reward ?? 0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !meetingUrl.trim()) return
    onSave({
      title: title.trim(),
      content: {
        provider,
        meeting_url:   meetingUrl.trim(),
        description:   description.trim() || null,
        scheduled_for: scheduledFor || null,
        duration_min:  durationMin || null,
        recording_url: recordingUrl.trim() || null,
      },
      gamification: { base_xp_reward: xp },
    })
  }

  return (
    <FormShell title="Live Session" icon="🎙️" onCancel={onCancel} onSubmit={handleSubmit}>
      <Field label="Title" required>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Weekly Bible Study — Week 3"
          className="input"
          required
        />
      </Field>

      <Field label="Description" hint="Optional context shown to students.">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Bring your Bible and notebook…"
          rows={3}
          className="input resize-y"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Platform">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            title="Platform"
            className="input"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Duration (minutes)">
          <input
            type="number"
            min={1}
            max={480}
            value={durationMin ?? ''}
            title="Duration in minutes"
            onChange={(e) => setDurationMin(Number(e.target.value))}
            className="input"
          />
        </Field>
      </div>

      <Field label="Meeting URL" required hint="Zoom join link, Meet URL, Teams link, etc.">
        <input
          type="url"
          value={meetingUrl}
          onChange={(e) => setMeetingUrl(e.target.value)}
          placeholder="https://zoom.us/j/..."
          className="input"
          required
        />
      </Field>

      <Field label="Scheduled For" hint="Optional — shows a countdown and enables the join button 15 min before.">
        <input
          type="datetime-local"
          value={scheduledFor ?? ''}
          title="Scheduled date and time"
          onChange={(e) => setScheduledFor(e.target.value)}
          className="input"
        />
      </Field>

      <Field label="Recording URL" hint="Optional — shown after the session with a 'View Recording' link.">
        <input
          type="url"
          value={recordingUrl ?? ''}
          onChange={(e) => setRecordingUrl(e.target.value)}
          placeholder="https://..."
          className="input"
        />
      </Field>

      <XpField value={xp} onChange={setXp} />
    </FormShell>
  )
}
