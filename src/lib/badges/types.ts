/**
 * Open Badges 2.0 / 3.0 Standard Types (1EdTech / IMS Global & W3C Verifiable Credentials)
 * https://www.imsglobal.org/spec/ob/v2p0/
 */

export interface OpenBadgeIssuer {
  id: string
  type: 'Issuer'
  name: string
  url: string
  email?: string
  description?: string
  image?: string
}

export interface OpenBadgeClass {
  id: string
  type: 'BadgeClass'
  name: string
  description: string
  image: string
  criteria: {
    narrative: string
  }
  issuer: OpenBadgeIssuer | string
  tags?: string[]
  alignment?: Array<{
    targetName: string
    targetUrl: string
    targetDescription?: string
  }>
}

export interface OpenBadgeIdentity {
  type: 'email'
  hashed: boolean
  identity: string // sha256$hashedEmail
  salt?: string
}

export interface OpenBadgeVerification {
  type: 'hosted'
  url: string
}

export interface OpenBadgeAssertion {
  '@context': 'https://w3id.org/openbadges/v2'
  id: string
  type: 'Assertion'
  recipient: OpenBadgeIdentity
  badge: OpenBadgeClass
  verification: OpenBadgeVerification
  issuedOn: string // ISO 8601
  expires?: string
  evidence?: Array<{
    id: string
    narrative?: string
  }>
}

export type BadgeFrame = 'shield' | 'circle' | 'hexagon' | 'rosette' | 'star'
export type BadgeTheme = 'gold' | 'silver' | 'bronze' | 'indigo' | 'emerald' | 'crimson'
export type BadgeIcon = 'cross' | 'bible' | 'flame' | 'crown' | 'dove' | 'shepherd' | 'heart' | 'star'

export interface BadgeGraphicOptions {
  title: string
  frame?: BadgeFrame
  theme?: BadgeTheme
  icon?: BadgeIcon
  accentColor?: string
  issuerName?: string
}
