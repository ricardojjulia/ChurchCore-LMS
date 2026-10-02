import type { ChurchCoreInboundPayload, ChurchCoreMember } from './types'

// Strictly prohibited fields from pastoral and internal care domains (Amendment 4)
const PROHIBITED_KEYS = [
  'pastoral_notes',
  'pastoral_note',
  'elder_notes',
  'elder_note',
  'care_assignments',
  'care_notes',
  'prayer_requests',
  'prayer_request',
  'counseling_notes',
  'giving_records',
  'donations',
  'children_sensitive_data',
  'profile_sensitive_fields',
]

export interface ValidationResult {
  valid: boolean
  errors: string[]
  sanitizedPayload?: ChurchCoreInboundPayload
}

export function validateAndSanitizeInboundPayload(raw: unknown): ValidationResult {
  const errors: string[] = []

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Payload must be a non-null object'] }
  }

  const payload = raw as Record<string, unknown>

  // Check for prohibited keys anywhere in the top-level or objects
  const payloadStr = JSON.stringify(payload)
  for (const prohibited of PROHIBITED_KEYS) {
    if (new RegExp(`"${prohibited}"`, 'i').test(payloadStr)) {
      errors.push(`Disallowed sensitive field detected: "${prohibited}". Excluded by security policy.`)
    }
  }

  // Check version
  if (payload.version !== 'churchcore-connect/v1') {
    errors.push(`Unsupported payload version: "${payload.version}". Expected "churchcore-connect/v1".`)
  }

  // Check type
  if (payload.type !== 'snapshot' && payload.type !== 'delta') {
    errors.push(`Invalid payload type: "${payload.type}". Expected "snapshot" or "delta".`)
  }

  // Check timestamp
  if (!payload.timestamp || typeof payload.timestamp !== 'string') {
    errors.push('Missing or invalid timestamp')
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  // Sanitize members (apply minor privacy rules - Amendment 3)
  const sanitizedMembers: ChurchCoreMember[] = []
  if (Array.isArray(payload.members)) {
    for (let i = 0; i < payload.members.length; i++) {
      const m = payload.members[i]
      if (!m || typeof m !== 'object') continue

      if (!m.id || typeof m.id !== 'string') {
        errors.push(`Member at index ${i} is missing required string "id"`)
        continue
      }
      if (!m.first_name || typeof m.first_name !== 'string') {
        errors.push(`Member ${m.id} is missing required string "first_name"`)
        continue
      }
      if (!m.last_name || typeof m.last_name !== 'string') {
        errors.push(`Member ${m.id} is missing required string "last_name"`)
        continue
      }

      // Check minor status
      let isMinor = Boolean(m.is_minor)
      if (m.date_of_birth && typeof m.date_of_birth === 'string') {
        const dob = new Date(m.date_of_birth)
        if (!isNaN(dob.getTime())) {
          const ageDiffMs = Date.now() - dob.getTime()
          const ageDate = new Date(ageDiffMs)
          const age = Math.abs(ageDate.getUTCFullYear() - 1970)
          if (age < 18) isMinor = true
        }
      }

      const guardianConsent = Boolean(m.guardian_consent)
      let sanitizedEmail = typeof m.email === 'string' ? m.email.trim() : undefined
      let sanitizedPhone = typeof m.phone === 'string' ? m.phone.trim() : undefined

      // Minors without explicit guardian consent cannot have email/phone synced
      if (isMinor && !guardianConsent) {
        sanitizedEmail = undefined
        sanitizedPhone = undefined
      }

      sanitizedMembers.push({
        id: m.id,
        first_name: m.first_name.trim(),
        last_name: m.last_name.trim(),
        email: sanitizedEmail,
        phone: sanitizedPhone,
        date_of_birth: typeof m.date_of_birth === 'string' ? m.date_of_birth : undefined,
        preferred_language: typeof m.preferred_language === 'string' ? m.preferred_language : undefined,
        church_role: m.church_role ?? 'member',
        is_minor: isMinor,
        guardian_consent: guardianConsent,
        active: m.active !== false,
      })
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  const sanitized: ChurchCoreInboundPayload = {
    version: 'churchcore-connect/v1',
    timestamp: payload.timestamp as string,
    type: payload.type as 'snapshot' | 'delta',
    members: sanitizedMembers,
    families: Array.isArray(payload.families) ? (payload.families as any) : undefined,
    groups: Array.isArray(payload.groups) ? (payload.groups as any) : undefined,
    ministries: Array.isArray(payload.ministries) ? (payload.ministries as any) : undefined,
    onboarding_templates: Array.isArray(payload.onboarding_templates)
      ? (payload.onboarding_templates as any)
      : undefined,
  }

  return {
    valid: true,
    errors: [],
    sanitizedPayload: sanitized,
  }
}
