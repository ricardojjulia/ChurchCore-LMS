'use client'

import { useState } from 'react'
import type { BlockFormData } from '@/types/blocks'
import { FormShell, Field, XpField, Toggle } from './FormShell'
import { parseScormPackage } from '@/lib/scorm/parser'

interface Props {
  initial?: {
    title?: string
    package_path?: string
    package_filename?: string
    version?: '1.2' | '2004'
    launch_path?: string
    passing_score_pct?: number
    require_passing?: boolean
    aspect_ratio?: '16:9' | '4:3' | '1:1' | 'auto'
    gamification?: { base_xp_reward?: number }
  }
  onSave: (data: BlockFormData) => void
  onCancel: () => void
}

export default function ScormForm({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [packageFileName, setPackageFileName] = useState(initial?.package_filename ?? '')
  const [packagePath, setPackagePath] = useState(initial?.package_path ?? '')
  const [scormVersion, setScormVersion] = useState<'1.2' | '2004'>(initial?.version ?? '1.2')
  const [launchPath, setLaunchPath] = useState(initial?.launch_path ?? '')
  const [passingScore, setPassingScore] = useState<number | string>(
    initial?.passing_score_pct ?? 80
  )
  const [requirePassing, setRequirePassing] = useState(
    initial?.require_passing ?? true
  )
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '4:3' | '1:1' | 'auto'>(
    initial?.aspect_ratio ?? '16:9'
  )
  const [xp, setXp] = useState(initial?.gamification?.base_xp_reward ?? 50)
  const [isParsing, setIsParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setIsParsing(true)

    try {
      const buffer = await file.arrayBuffer()
      const parsed = await parseScormPackage(buffer)

      if (!parsed.valid || !parsed.metadata) {
        setError(parsed.error || 'Could not parse SCORM ZIP package.')
        setIsParsing(false)
        return
      }

      setPackageFileName(file.name)
      setScormVersion(parsed.metadata.version)
      setLaunchPath(parsed.metadata.launchPath)

      if (!title.trim() && parsed.metadata.title) {
        setTitle(parsed.metadata.title)
      }

      if (parsed.metadata.masteryScore !== undefined) {
        setPassingScore(parsed.metadata.masteryScore)
      }

      // Upload package to server storage
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload/scorm', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || 'Failed to upload SCORM package.')
      } else {
        setPackagePath(data.path)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error reading SCORM file.')
    } finally {
      setIsParsing(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !packagePath) return

    onSave({
      title: title.trim(),
      content: {
        package_path: packagePath,
        package_filename: packageFileName,
        version: scormVersion,
        launch_path: launchPath,
        passing_score_pct: passingScore ? Number(passingScore) : 80,
        require_passing: requirePassing,
        aspect_ratio: aspectRatio,
      },
      gamification: { base_xp_reward: xp },
    })
  }

  return (
    <FormShell title="SCORM E-Learning Package" icon="📦" onCancel={onCancel} onSubmit={handleSubmit}>
      <Field label="Activity Title" required>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Child Protection & Safety Standards"
          className="input"
          required
        />
      </Field>

      <Field
        label="Upload SCORM Package (.zip)"
        required={!packagePath}
        hint="Select a SCORM 1.2 or SCORM 2004 ZIP archive (e.g. from Articulate Storyline, Adobe Captivate, or iSpring)."
      >
        <div className="flex flex-col gap-2">
          <input
            type="file"
            accept=".zip"
            onChange={handleFileUpload}
            className="file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-950 file:text-indigo-300 hover:file:bg-indigo-900 text-xs text-slate-300"
          />
          {isParsing && (
            <p className="text-xs text-slate-400 animate-pulse">Analyzing SCORM manifest & structure…</p>
          )}
          {error && <p className="text-xs text-rose-400">{error}</p>}
          {packageFileName && (
            <div className="rounded-lg border border-indigo-900/50 bg-indigo-950/20 p-3 text-xs flex items-center justify-between">
              <div>
                <p className="font-semibold text-indigo-200">{packageFileName}</p>
                <p className="text-slate-400 mt-0.5 font-mono text-[11px]">
                  Format: SCORM {scormVersion} • Launch: {launchPath || 'index.html'}
                </p>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold">
                Valid Manifest
              </span>
            </div>
          )}
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Passing Score (%)"
          hint="Minimum score percentage required to pass this SCORM module."
        >
          <input
            type="number"
            min={0}
            max={100}
            value={passingScore}
            onChange={(e) => setPassingScore(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Display Aspect Ratio">
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as any)}
            className="input"
          >
            <option value="16:9">16:9 (Widescreen)</option>
            <option value="4:3">4:3 (Standard)</option>
            <option value="1:1">1:1 (Square)</option>
            <option value="auto">Auto Height</option>
          </select>
        </Field>
      </div>

      <Toggle
        label="Require passing grade to complete"
        hint="Students must meet the passing score before this block is marked complete."
        value={requirePassing}
        onChange={setRequirePassing}
      />

      <XpField value={xp} onChange={setXp} />
    </FormShell>
  )
}
