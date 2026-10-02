import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mapChurchCoreRoleToLms,
  isPrivilegedRoleChange,
  validateAndSanitizeInboundPayload,
  computeStagingDiff,
  buildSignedDeliveryMessage,
  verifySignedDelivery,
  signOutboundPayload,
  type ChurchCoreInboundPayload,
} from '@/lib/churchcore-connect'
import { generateKeyPairSync } from 'node:crypto'

describe('COUNCIL-2026-038: ChurchCore Connect Integration', () => {
  describe('Role Mapping & Privilege Guards', () => {
    it('maps church roles to LMS counterparts correctly', () => {
      expect(mapChurchCoreRoleToLms('church_admin')).toBe('admin')
      expect(mapChurchCoreRoleToLms('pastor')).toBe('manager')
      expect(mapChurchCoreRoleToLms('ministry_leader')).toBe('teacher')
      expect(mapChurchCoreRoleToLms('secretary')).toBe('manager')
      expect(mapChurchCoreRoleToLms('member')).toBe('student')
    })

    it('forces minor members to student role regardless of church role', () => {
      expect(mapChurchCoreRoleToLms('church_admin', true)).toBe('student')
      expect(mapChurchCoreRoleToLms('ministry_leader', true)).toBe('student')
    })

    it('identifies privileged role elevations that require manual review', () => {
      expect(isPrivilegedRoleChange('admin', 'student')).toBe(true)
      expect(isPrivilegedRoleChange('manager', 'teacher')).toBe(true)
      expect(isPrivilegedRoleChange('admin', 'admin')).toBe(false)
      expect(isPrivilegedRoleChange('teacher', 'student')).toBe(false)
      expect(isPrivilegedRoleChange('student', 'teacher')).toBe(false)
    })
  })

  describe('Payload Validation & Data Safeguards (Amendments 3 & 4)', () => {
    it('rejects payloads containing prohibited pastoral/care fields', () => {
      const dirtyPayload = {
        version: 'churchcore-connect/v1',
        type: 'snapshot',
        timestamp: new Date().toISOString(),
        members: [
          {
            id: 'm-1',
            first_name: 'John',
            last_name: 'Doe',
            church_role: 'member',
            pastoral_notes: 'Confidential counseling session notes',
          },
        ],
      }

      const result = validateAndSanitizeInboundPayload(dirtyPayload)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Disallowed sensitive field'))).toBe(true)
    })

    it('strips contact information for minors without explicit guardian consent', () => {
      const payload = {
        version: 'churchcore-connect/v1',
        type: 'snapshot',
        timestamp: new Date().toISOString(),
        members: [
          {
            id: 'child-1',
            first_name: 'Timmy',
            last_name: 'Smith',
            email: 'timmy@example.com',
            phone: '555-1234',
            date_of_birth: '2015-05-10', // under 18
            church_role: 'member',
            guardian_consent: false,
          },
          {
            id: 'adult-1',
            first_name: 'Sarah',
            last_name: 'Smith',
            email: 'sarah@example.com',
            phone: '555-5678',
            date_of_birth: '1985-02-20',
            church_role: 'member',
          },
        ],
      }

      const result = validateAndSanitizeInboundPayload(payload)
      expect(result.valid).toBe(true)
      const sanitizedChild = result.sanitizedPayload?.members?.find(m => m.id === 'child-1')
      expect(sanitizedChild?.is_minor).toBe(true)
      expect(sanitizedChild?.email).toBeUndefined()
      expect(sanitizedChild?.phone).toBeUndefined()

      const sanitizedAdult = result.sanitizedPayload?.members?.find(m => m.id === 'adult-1')
      expect(sanitizedAdult?.email).toBe('sarah@example.com')
      expect(sanitizedAdult?.phone).toBe('555-5678')
    })
  })

  describe('Ed25519 Cryptographic Signing & Verification', () => {
    it('signs and verifies payload signatures accurately', () => {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      })

      const message = buildSignedDeliveryMessage({
        connectionId: 'conn-123',
        deliveryId: 'del-456',
        deliveredAt: '2026-10-02T12:00:00Z',
        payloadHash: 'abc123hash',
      })

      const signature = signOutboundPayload({
        privateKeyPem: privateKey,
        message,
      })

      const isValid = verifySignedDelivery({
        publicKeyPem: publicKey,
        signature,
        message,
      })

      expect(isValid).toBe(true)

      const isInvalid = verifySignedDelivery({
        publicKeyPem: publicKey,
        signature,
        message: message + 'tampered',
      })

      expect(isInvalid).toBe(false)
    })
  })

  describe('Staging Diff Computation', () => {
    it('computes creates, updates, and flags privilege changes for review', () => {
      const payload: ChurchCoreInboundPayload = {
        version: 'churchcore-connect/v1',
        type: 'snapshot',
        timestamp: new Date().toISOString(),
        members: [
          {
            id: 'm-new',
            first_name: 'Alice',
            last_name: 'Cooper',
            church_role: 'member',
          },
          {
            id: 'm-promote',
            first_name: 'Bob',
            last_name: 'Jones',
            church_role: 'church_admin', // Privilege change from student -> admin
          },
        ],
        groups: [
          {
            id: 'grp-1',
            name: 'Youth Ministry Small Group',
            member_ids: ['m-new'],
          },
        ],
      }

      const existingProfilesByExt = new Map([
        ['m-promote', { uid: 'u-bob', role: 'student' as const, full_name: 'Bob Jones' }],
      ])

      const diff = computeStagingDiff(payload, {
        profilesByExternalId: existingProfilesByExt,
        profilesByEmail: new Map(),
        existingCohortExternalIds: new Set(),
      })

      expect(diff.summary.total_creates).toBe(1)
      expect(diff.summary.total_updates).toBe(1)
      expect(diff.summary.total_reviews_required).toBe(1) // Bob's admin promotion
      expect(diff.summary.can_auto_apply).toBe(false)

      const bobDiff = diff.members.find(m => m.id === 'm-promote')
      expect(bobDiff?.needs_review).toBe(true)
      expect(bobDiff?.warning).toContain('requires admin review')
    })
  })

  describe('Delivery Application Execution', () => {
    it('applies members, creates cohorts, and marks delivery applied', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'external_entity_links') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              upsert: vi.fn().mockResolvedValue({ error: null }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            }
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { uid: 'new-uid-123' }, error: null }),
                }),
              }),
              update: vi.fn().mockReturnThis(),
            }
          }
          if (table === 'profile_roles') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
              upsert: vi.fn().mockResolvedValue({ error: null }),
            }
          }
          if (table === 'cohorts') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'cohort-123' }, error: null }),
                }),
              }),
              update: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
            }
          }
          if (table === 'cohort_members') {
            return {
              upsert: vi.fn().mockResolvedValue({ error: null }),
            }
          }
          if (table === 'churchcore_deliveries') {
            return {
              update: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
            }
          }
          return {}
        }),
      }

      const { applyChurchCoreDelivery } = await import('@/lib/churchcore-connect')

      const result = await applyChurchCoreDelivery(mockSupabase as any, {
        deliveryId: 'del-1',
        orgId: 'org-1',
        connectionId: 'conn-1',
        adminUid: 'admin-1',
        payload: {
          version: 'churchcore-connect/v1',
          type: 'snapshot',
          timestamp: new Date().toISOString(),
          members: [
            {
              id: 'm-1',
              first_name: 'Grace',
              last_name: 'Hopper',
              church_role: 'member',
              email: 'grace@example.com',
            },
          ],
          groups: [
            {
              id: 'grp-1',
              name: 'Leadership Team',
              member_ids: ['m-1'],
            },
          ],
        },
      })

      expect(result.success).toBe(true)
      expect(result.appliedCounts.profilesCreated).toBe(1)
      expect(result.appliedCounts.cohortsSynced).toBe(1)
    })
  })
})

