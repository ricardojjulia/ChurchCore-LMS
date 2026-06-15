import type { SupabaseClient }    from '@supabase/supabase-js'
import type { SystemHealthCheck } from '@/types/health'

export async function getHealthChecks(
  supabase: SupabaseClient,
): Promise<SystemHealthCheck[]> {
  const { data } = await supabase
    .from('system_health_checks')
    .select('id, check_name, status, message, action_url, last_checked, metadata')
    .order('last_checked', { ascending: false })

  return (data as SystemHealthCheck[] | null) ?? []
}
