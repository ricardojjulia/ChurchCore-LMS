'use client'

import { useEffect, useState } from 'react'

import { createClient } from '@/utils/supabase/client'
import type { GenerationStatus } from '@/types/reporting'

type ArtifactStatusState = {
  status: GenerationStatus | null
  error: string | null
}

type ArtifactStatusPayload = {
  generation_status?: GenerationStatus
  error_message?: string | null
}

export function useReportArtifactStatus(artifactId: string | null): ArtifactStatusState {
  const [state, setState] = useState<ArtifactStatusState>({ status: null, error: null })

  useEffect(() => {
    if (!artifactId) {
      setState({ status: null, error: null })
      return
    }

    const supabase = createClient()
    const channel = supabase
      .channel(`report-artifact-status:${artifactId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'report_artifacts',
          filter: `id=eq.${artifactId}`,
        },
        (payload) => {
          const row = payload.new as ArtifactStatusPayload
          setState({
            status: row.generation_status ?? null,
            error: row.error_message ?? null,
          })
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setState((current) => ({
            ...current,
            error: 'Live report status is unavailable. Check Your Reports for updates.',
          }))
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [artifactId])

  return state
}
