import { describe, it, expect } from 'vitest'
import { generatePodcastRssXml } from './podcast-feed'
import { generatePodcastToken, verifyPodcastToken } from './feed-auth'
import type { PodcastChannel } from './types'

describe('Discipleship Podcast Feed Engine', () => {
  const sampleChannel: PodcastChannel = {
    id: 'course-101',
    title: 'Pauline Epistles & Theological Foundations',
    description: 'A multi-week audio lecture series through Galatians, Romans, and Ephesians.',
    coverImageUrl: 'https://cdn.churchcore.org/covers/pauline-epistles.jpg',
    feedUrl: 'https://lms.churchcore.org/api/feeds/podcast/mock_token',
    siteUrl: 'https://lms.churchcore.org/courses/course-101',
    author: 'Grace Community Church',
    ownerName: 'Grace Community Church',
    ownerEmail: 'discipleship@grace.org',
    language: 'en',
    episodes: [
      {
        id: 'block-ep-1',
        title: 'Episode 1: Justification by Faith',
        description: 'Exposition of Romans 3 & 4 with Dr. Martin.',
        audioUrl: 'https://cdn.churchcore.org/audio/romans-3-4.mp3',
        durationSeconds: 1845,
        fileSizeBytes: 29520000,
        publishedAt: '2026-10-01T12:00:00Z',
        episodeNumber: 1,
        shownotesHtml: '<p>Key Scriptures: Romans 3:21-26, Romans 4:1-5.</p>',
      },
      {
        id: 'block-ep-2',
        title: 'Episode 2: Living in the Spirit & Freedom',
        description: 'Galatians 5 exposition and the fruit of the Holy Spirit.',
        audioUrl: 'https://cdn.churchcore.org/audio/galatians-5.mp3',
        durationSeconds: 2100,
        fileSizeBytes: 33600000,
        publishedAt: '2026-10-04T12:00:00Z',
        episodeNumber: 2,
        shownotesHtml: '<p>Key Scriptures: Galatians 5:16-25.</p>',
      },
    ],
  }

  it('generates valid Apple Podcasts & Spotify RSS 2.0 XML', () => {
    const xml = generatePodcastRssXml(sampleChannel)

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"')
    expect(xml).toContain('<title>Pauline Epistles &amp; Theological Foundations</title>')
    expect(xml).toContain('<itunes:author>Grace Community Church</itunes:author>')
    expect(xml).toContain('<itunes:category text="Religion &amp; Spirituality">')
    expect(xml).toContain('<enclosure url="https://cdn.churchcore.org/audio/romans-3-4.mp3" length="29520000" type="audio/mpeg"/>')
    expect(xml).toContain('<itunes:duration>30:45</itunes:duration>')
    expect(xml).toContain('<itunes:episode>1</itunes:episode>')
    expect(xml).toContain('churchcore-ep-block-ep-1')
  })

  it('escapes special XML characters correctly', () => {
    const channelWithSpecialChars: PodcastChannel = {
      ...sampleChannel,
      title: 'Grace & Truth: "Faith" <in Action>',
      episodes: [],
    }

    const xml = generatePodcastRssXml(channelWithSpecialChars)
    expect(xml).toContain('<title>Grace &amp; Truth: &quot;Faith&quot; &lt;in Action&gt;</title>')
  })

  it('signs and verifies HMAC podcast feed tokens', () => {
    const token = generatePodcastToken({
      enrollmentId: 'enroll-99',
      userId: 'user-44',
      courseId: 'course-101',
      orgId: 'org-1',
    })

    expect(typeof token).toBe('string')
    expect(token).toContain('.')

    const verified = verifyPodcastToken(token)
    expect(verified).not.toBeNull()
    expect(verified?.enrollmentId).toBe('enroll-99')
    expect(verified?.userId).toBe('user-44')
    expect(verified?.courseId).toBe('course-101')
  })

  it('rejects tampered or malformed tokens', () => {
    const token = generatePodcastToken({
      enrollmentId: 'enroll-99',
      userId: 'user-44',
      courseId: 'course-101',
      orgId: 'org-1',
    })

    const [payload, sig] = token.split('.')
    // Tamper with payload
    const tamperedPayload = Buffer.from(
      JSON.stringify({ enrollmentId: 'enroll-evil', userId: 'user-44', courseId: 'course-101', orgId: 'org-1' })
    ).toString('base64url')
    const tamperedToken = `${tamperedPayload}.${sig}`

    expect(verifyPodcastToken(tamperedToken)).toBeNull()
    expect(verifyPodcastToken('invalid.token.structure')).toBeNull()
    expect(verifyPodcastToken(`${payload}.invalidsig12345`)).toBeNull()
    expect(verifyPodcastToken('')).toBeNull()
  })
})
