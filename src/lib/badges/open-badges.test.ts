import { describe, it, expect } from 'vitest'
import {
  hashRecipientEmail,
  buildOpenBadgeIssuer,
  buildOpenBadgeClass,
  buildOpenBadgeAssertion,
  buildLinkedInCertificationUrl,
} from './open-badges'
import { generateBadgeSvg } from './svg-builder'

describe('Open Badges 2.0 & Microcredentials Specification Engine', () => {
  describe('hashRecipientEmail', () => {
    it('generates standard sha256$ prefixed hash with salt and case normalization', () => {
      const hash1 = hashRecipientEmail('Student@ChurchCore.org', 'test-salt')
      const hash2 = hashRecipientEmail('student@churchcore.org', 'test-salt')
      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^sha256\$[a-f0-9]{64}$/)
    })
  })

  describe('buildOpenBadgeIssuer', () => {
    it('creates compliant Issuer schema with ID and URL', () => {
      const issuer = buildOpenBadgeIssuer('org-101', 'Grace Theological Seminary', 'https://lms.test')
      expect(issuer.type).toBe('Issuer')
      expect(issuer.name).toBe('Grace Theological Seminary')
      expect(issuer.id).toBe('https://lms.test/api/badges/issuers/org-101')
      expect(issuer.url).toBe('https://lms.test')
    })
  })

  describe('buildOpenBadgeClass', () => {
    it('creates compliant BadgeClass schema with criteria and image', () => {
      const issuer = buildOpenBadgeIssuer('org-1', 'Grace Church', 'https://lms.test')
      const badgeClass = buildOpenBadgeClass(
        'badge-42',
        'Youth Ministry Specialist',
        'Certified youth discipleship leader',
        'https://lms.test/badges/42.svg',
        issuer
      )

      expect(badgeClass.type).toBe('BadgeClass')
      expect(badgeClass.name).toBe('Youth Ministry Specialist')
      expect(badgeClass.image).toBe('https://lms.test/badges/42.svg')
      expect(badgeClass.criteria.narrative).toContain('Youth Ministry Specialist')
      expect(badgeClass.tags).toContain('ministry')
    })
  })

  describe('buildOpenBadgeAssertion', () => {
    it('creates standard Open Badges 2.0 assertion JSON-LD with hashed identity and evidence', () => {
      const assertion = buildOpenBadgeAssertion({
        awardId: 'award-999',
        awardedAt: '2026-10-01T12:00:00Z',
        badgeId: 'b-1',
        badgeTitle: 'Spiritual Formation Milestone',
        badgeDescription: 'Mastery of spiritual disciplines',
        badgeImageUrl: 'https://lms.test/api/badges/image/b-1',
        recipientEmail: 'pastor.john@test.com',
        orgId: 'org-7',
        orgName: 'Faith Community Academy',
        baseUrl: 'https://lms.test',
      })

      expect(assertion['@context']).toBe('https://w3id.org/openbadges/v2')
      expect(assertion.type).toBe('Assertion')
      expect(assertion.id).toBe('https://lms.test/api/badges/assertions/award-999')
      expect(assertion.recipient.type).toBe('email')
      expect(assertion.recipient.hashed).toBe(true)
      expect(assertion.recipient.identity).toMatch(/^sha256\$/)
      expect(assertion.badge.name).toBe('Spiritual Formation Milestone')
      expect(assertion.evidence?.[0]?.id).toBe('https://lms.test/verify/badge/award-999')
    })
  })

  describe('buildLinkedInCertificationUrl', () => {
    it('generates standard LinkedIn Add-to-Profile certification URL with all parameters', () => {
      const url = buildLinkedInCertificationUrl({
        certificationName: 'Biblical Counseling Certificate',
        organizationName: 'ChurchCore Academy',
        issueDate: '2026-10-01',
        certUrl: 'https://lms.test/verify/badge/award-123',
        certId: 'award-123',
      })

      expect(url).toContain('https://www.linkedin.com/profile/add?')
      expect(url).toContain('name=Biblical+Counseling+Certificate')
      expect(url).toContain('organizationName=ChurchCore+Academy')
      expect(url).toContain('issueYear=2026')
      expect(url).toContain('certId=award-123')
      expect(url).toContain(encodeURIComponent('https://lms.test/verify/badge/award-123'))
    })
  })

  describe('generateBadgeSvg', () => {
    it('renders valid SVG vector markup with frame, theme, and theological icon', () => {
      const svg = generateBadgeSvg({
        title: 'Master of Ministry',
        frame: 'shield',
        theme: 'gold',
        icon: 'cross',
        issuerName: 'Grace Seminary',
      })

      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
      expect(svg).toContain('viewBox="0 0 200 200"')
      expect(svg).toContain('linearGradient id="bgGrad"')
      expect(svg).toContain('#f59e0b') // gold gradStart
      expect(svg).toContain('GRACE SEMINARY')
      expect(svg).toContain('</svg>')
    })

    it('escapes XML special characters safely in SVG output', () => {
      const svg = generateBadgeSvg({
        title: 'Faith & Works <Advanced>',
        issuerName: 'St. Peter & Paul Church',
      })

      expect(svg).not.toContain('<Advanced>')
      expect(svg).toContain('&lt;Advanced&gt;')
      expect(svg).toContain('ST. PETER &amp; PAUL CHURCH')
    })
  })
})
