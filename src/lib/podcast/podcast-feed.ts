import type { PodcastChannel, PodcastEpisode } from './types'

function escapeXml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function formatRfc822Date(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString()
}

/**
 * Builds an Apple Podcasts & Spotify standard compliant RSS 2.0 XML document.
 */
export function generatePodcastRssXml(channel: PodcastChannel): string {
  const channelTitle = escapeXml(channel.title)
  const channelDesc = escapeXml(channel.description)
  const author = escapeXml(channel.author || 'ChurchCore LMS')
  const ownerName = escapeXml(channel.ownerName || author)
  const ownerEmail = escapeXml(channel.ownerEmail || 'support@churchcore.org')
  const language = escapeXml(channel.language || 'en')
  const copyright = escapeXml(channel.copyright || `© ${new Date().getFullYear()} ${author}`)
  const coverImage = escapeXml(channel.coverImageUrl)
  const feedUrl = escapeXml(channel.feedUrl)
  const siteUrl = escapeXml(channel.siteUrl)

  const itemsXml = channel.episodes
    .map((ep, idx) => {
      const epTitle = escapeXml(ep.title)
      const epDesc = escapeXml(ep.description)
      const audioUrl = escapeXml(ep.audioUrl)
      const pubDate = formatRfc822Date(ep.publishedAt)
      const duration = formatDuration(ep.durationSeconds)
      const length = ep.fileSizeBytes || 1024 * 1024 * 10 // Fallback 10MB
      const epNum = ep.episodeNumber || idx + 1
      const shownotes = ep.shownotesHtml ? `<![CDATA[${ep.shownotesHtml}]]>` : `<![CDATA[<p>${epDesc}</p>]]>`

      return `    <item>
      <title>${epTitle}</title>
      <description>${epDesc}</description>
      <content:encoded>${shownotes}</content:encoded>
      <enclosure url="${audioUrl}" length="${length}" type="audio/mpeg"/>
      <guid isPermaLink="false">churchcore-ep-${escapeXml(ep.id)}</guid>
      <pubDate>${pubDate}</pubDate>
      <itunes:author>${author}</itunes:author>
      <itunes:summary>${epDesc}</itunes:summary>
      <itunes:duration>${duration}</itunes:duration>
      <itunes:episode>${epNum}</itunes:episode>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>no</itunes:explicit>
    </item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${channelTitle}</title>
    <link>${siteUrl}</link>
    <description>${channelDesc}</description>
    <language>${language}</language>
    <copyright>${copyright}</copyright>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <itunes:subtitle>${channelTitle}</itunes:subtitle>
    <itunes:author>${author}</itunes:author>
    <itunes:summary>${channelDesc}</itunes:summary>
    <itunes:owner>
      <itunes:name>${ownerName}</itunes:name>
      <itunes:email>${ownerEmail}</itunes:email>
    </itunes:owner>
    <itunes:image href="${coverImage}"/>
    <itunes:category text="Religion &amp; Spirituality">
      <itunes:category text="Christianity"/>
    </itunes:category>
    <itunes:explicit>no</itunes:explicit>
${itemsXml}
  </channel>
</rss>`
}
