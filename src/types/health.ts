export type HealthStatus = 'ok' | 'warning' | 'error' | 'unknown'

export interface SystemHealthCheck {
  id:           string
  check_name:   string
  status:       HealthStatus
  message:      string | null
  action_url:   string | null
  last_checked: string
  metadata:     Record<string, unknown>
}

export interface HealthCheckResponse {
  checks:       SystemHealthCheck[]
  timestamp:    string
  triggered_by: 'manual' | 'scheduled'
}
