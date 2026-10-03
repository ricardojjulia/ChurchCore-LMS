import { createHash } from 'crypto'
import type {
  OpenBadgeAssertion,
  OpenBadgeClass,
  OpenBadgeIssuer,
} from './types'

/**
 * Generates an Open Badges 2.0 compliant SHA-256 identity hash for recipient privacy.
 * Standard format: "sha256$" + sha256(email + salt)
 */
export function hashRecipientEmail(email: string, salt = ''): string {
  const normalized = email.trim().toLowerCase()
  const hash = createHash('sha256')
    .update(normalized + salt)
    .digest('hex')
  return `sha256$${hash}`
}

export interface BuildAssertionParams {
  awardId: string
  awardedAt: string
  badgeId: string
  badgeTitle: string
  badgeDescription: string
  badgeImageUrl: string
  criteriaNarrative?: string
  recipientEmail: string
  orgId: string
  orgName: string
  baseUrl: string
  salt?: string
}

/**
 * Builds an Open Badges 2.0 compliant Issuer Object.
 */
export function buildOpenBadgeIssuer(
  orgId: string,
  orgName: string,
  baseUrl: string
): OpenBadgeIssuer {
  return {
    id: `${baseUrl}/api/badges/issuers/${orgId}`,
    type: 'Issuer',
    name: orgName || 'ChurchCore LMS Academy',
    url: baseUrl,
    description: `Official Church & Ministry Training Academy of ${orgName}`,
  }
}

/**
 * Builds an Open Badges 2.0 compliant BadgeClass Object.
 */
export function buildOpenBadgeClass(
  badgeId: string,
  badgeTitle: string,
  badgeDescription: string,
  badgeImageUrl: string,
  issuer: OpenBadgeIssuer,
  criteriaNarrative?: string
): OpenBadgeClass {
  return {
    id: `${issuer.url}/api/badges/classes/${badgeId}`,
    type: 'BadgeClass',
    name: badgeTitle,
    description: badgeDescription || `Digital microcredential for completing ${badgeTitle}.`,
    image: badgeImageUrl,
    criteria: {
      narrative:
        criteriaNarrative ||
        `Awarded upon fulfilling curriculum milestones and leadership requirements in ${badgeTitle}.`,
    },
    issuer,
    tags: ['churchcore', 'ministry', 'theology', 'microcredential'],
  }
}

/**
 * Builds an Open Badges 2.0 compliant Assertion Object.
 */
export function buildOpenBadgeAssertion(params: BuildAssertionParams): OpenBadgeAssertion {
  const {
    awardId,
    awardedAt,
    badgeId,
    badgeTitle,
    badgeDescription,
    badgeImageUrl,
    criteriaNarrative,
    recipientEmail,
    orgId,
    orgName,
    baseUrl,
    salt = 'churchcore-salt',
  } = params

  const issuer = buildOpenBadgeIssuer(orgId, orgName, baseUrl)
  const badgeClass = buildOpenBadgeClass(
    badgeId,
    badgeTitle,
    badgeDescription,
    badgeImageUrl,
    issuer,
    criteriaNarrative
  )

  const assertionUrl = `${baseUrl}/api/badges/assertions/${awardId}`

  return {
    '@context': 'https://w3id.org/openbadges/v2',
    id: assertionUrl,
    type: 'Assertion',
    recipient: {
      type: 'email',
      hashed: true,
      identity: hashRecipientEmail(recipientEmail, salt),
      salt,
    },
    badge: badgeClass,
    verification: {
      type: 'hosted',
      url: assertionUrl,
    },
    issuedOn: new Date(awardedAt).toISOString(),
    evidence: [
      {
        id: `${baseUrl}/verify/badge/${awardId}`,
        narrative: `Verified learner achievement on ChurchCore LMS for ${orgName}.`,
      },
    ],
  }
}

/**
 * Builds a direct 1-click "Add to LinkedIn Profile" certification URL.
 */
export function buildLinkedInCertificationUrl({
  certificationName,
  organizationName,
  issueDate,
  certUrl,
  certId,
}: {
  certificationName: string
  organizationName: string
  issueDate: string | Date
  certUrl: string
  certId?: string
}): string {
  const dateObj = typeof issueDate === 'string' ? new Date(issueDate) : issueDate
  const issueYear = !isNaN(dateObj.getFullYear()) ? dateObj.getFullYear() : new Date().getFullYear()
  const issueMonth = !isNaN(dateObj.getMonth()) ? dateObj.getMonth() + 1 : 1

  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: certificationName,
    organizationName: organizationName,
    issueYear: issueYear.toString(),
    issueMonth: issueMonth.toString(),
    certUrl: certUrl,
  })

  if (certId) {
    params.set('certId', certId)
  }

  return `https://www.linkedin.com/profile/add?${params.toString()}`
}
