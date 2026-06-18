'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createClient } from '@/utils/supabase/client'
import type { ReportArtifact } from '@/types/reporting'

type ArtifactsResponse = {
  artifacts: ReportArtifact[]
  userId: string
}

function mergeArtifacts(current: ReportArtifact[], incoming: ReportArtifact): ReportArtifact[] {
  const existingIndex = current.findIndex((artifact) => artifact.id === incoming.id)
  if (existingIndex === -1) {
    return [incoming, ...current].sort(
      (a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
    )
  }

  const next = [...current]
  next[existingIndex] = { ...next[existingIndex], ...incoming }
  return next
}

export function useReportsDrawer() {
  const [artifacts, setArtifacts] = useState<ReportArtifact[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const fetchAbortRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    fetchAbortRef.current?.abort()
    const abortController = new AbortController()
    fetchAbortRef.current = abortController
    setIsLoading(true)

    try {
      const response = await fetch('/api/reports/artifacts', {
        cache: 'no-store',
        signal: abortController.signal,
      })
      if (!response.ok) throw new Error('Unable to load report artifacts')
      const payload = (await response.json()) as ArtifactsResponse
      setArtifacts(payload.artifacts)
      setUserId(payload.userId)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setArtifacts([])
    } finally {
      if (fetchAbortRef.current === abortController) {
        setIsLoading(false)
        fetchAbortRef.current = null
      }
    }
  }, [])

  const openDrawer = useCallback(() => {
    setIsOpen(true)
    void refresh()
  }, [refresh])

  const closeDrawer = useCallback(() => {
    setIsOpen(false)
  }, [])

  useEffect(() => {
    if (!isOpen || !userId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`reports-drawer:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'report_artifacts',
          filter: `generated_by=eq.${userId}`,
        },
        (payload) => {
          setArtifacts((current) => mergeArtifacts(current, payload.new as ReportArtifact))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'report_artifacts',
          filter: `generated_by=eq.${userId}`,
        },
        (payload) => {
          setArtifacts((current) => mergeArtifacts(current, payload.new as ReportArtifact))
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [isOpen, userId])

  useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort()
    }
  }, [])

  return useMemo(
    () => ({ artifacts, isLoading, isOpen, openDrawer, closeDrawer, refresh }),
    [artifacts, closeDrawer, isLoading, isOpen, openDrawer, refresh]
  )
}
