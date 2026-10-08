/**
 * Discipleship Podcast & Audio Feed Engine (COUNCIL-2026-044)
 * Type definitions for secure, tokenized RSS 2.0 / iTunes compliant feeds.
 */

export interface PodcastEpisode {
  id: string
  title: string
  description: string
  audioUrl: string
  durationSeconds?: number
  fileSizeBytes?: number
  publishedAt: string | Date
  episodeNumber?: number
  seasonNumber?: number
  scriptureReferences?: string[]
  shownotesHtml?: string
}

export interface PodcastChannel {
  id: string
  title: string
  description: string
  coverImageUrl: string
  feedUrl: string
  siteUrl: string
  author: string
  ownerName: string
  ownerEmail: string
  language?: string
  copyright?: string
  category?: string
  subcategory?: string
  episodes: PodcastEpisode[]
}

export interface PodcastTokenPayload {
  enrollmentId: string
  userId: string
  courseId: string
  orgId: string
  issuedAt: number
}
