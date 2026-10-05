import { NextRequest } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'
import { verifyPodcastToken } from '@/lib/podcast/feed-auth'
import { generatePodcastRssXml } from '@/lib/podcast/podcast-feed'
import type { PodcastChannel, PodcastEpisode } from '@/lib/podcast/types'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params

  const payload = verifyPodcastToken(token)
  if (!payload) {
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><error>Invalid or expired podcast feed token</error>',
      {
        status: 401,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      }
    )
  }

  const supabase = createServiceClient()

  // Verify enrollment still active
  const { data: enrollment, error: enrollError } = await supabase
    .from('enrollments')
    .select('id, status, courses(id, title, description, image_url, organization_id, organizations(name))')
    .eq('id', payload.enrollmentId)
    .single()

  if (enrollError || !enrollment || enrollment.status !== 'active') {
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><error>Enrollment is inactive or not found</error>',
      {
        status: 403,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      }
    )
  }

  const courseData = Array.isArray(enrollment.courses) ? enrollment.courses[0] : enrollment.courses
  const courseTitle = courseData?.title || 'Discipleship Course'
  const courseDesc = courseData?.description || 'Audio lessons and devotionals.'
  const orgName = (courseData?.organizations as any)?.name || 'ChurchCore LMS'
  const coverImage = courseData?.image_url || 'https://lms.churchcore.org/images/default-podcast-cover.jpg'

  // Fetch audio/video blocks from this course
  const { data: blocks } = await supabase
    .from('blocks')
    .select('id, title, type, content, sequence, updated_at')
    .eq('course_id', payload.courseId)
    .in('type', ['audio', 'video', 'page'])
    .order('sequence', { ascending: true })

  const episodes: PodcastEpisode[] = []

  if (blocks && blocks.length > 0) {
    blocks.forEach((b, index) => {
      const audioUrl = b.content?.audio_url || b.content?.media_url || b.content?.podcast_url
      // Only include blocks that have playable media or rich devotionals
      if (audioUrl) {
        episodes.push({
          id: b.id,
          title: b.title || `Lesson ${index + 1}`,
          description: b.content?.summary || b.content?.description || `Audio lecture for ${b.title}`,
          audioUrl,
          durationSeconds: b.content?.duration_seconds || 900,
          publishedAt: b.updated_at || new Date().toISOString(),
          episodeNumber: index + 1,
          shownotesHtml: b.content?.body || b.content?.transcript,
        })
      }
    })
  }

  // If no audio blocks yet, provide an introductory episode
  if (episodes.length === 0) {
    episodes.push({
      id: `intro-${payload.courseId}`,
      title: `Welcome to ${courseTitle}`,
      description: `Orientation and introduction to ${courseTitle}. New audio lessons will appear here automatically.`,
      audioUrl: 'https://cdn.churchcore.org/audio/intro-welcome.mp3',
      durationSeconds: 120,
      publishedAt: new Date().toISOString(),
      episodeNumber: 1,
      shownotesHtml: `<p>Welcome to <strong>${courseTitle}</strong>. Listen along on your daily commute or during devotional time.</p>`,
    })
  }

  const origin = req.nextUrl.origin
  const feedUrl = `${origin}/api/feeds/podcast/${token}`
  const siteUrl = `${origin}/courses/${payload.courseId}`

  const channel: PodcastChannel = {
    id: payload.courseId,
    title: `${courseTitle} — Audio Discipleship`,
    description: courseDesc,
    coverImageUrl: coverImage,
    feedUrl,
    siteUrl,
    author: orgName,
    ownerName: orgName,
    ownerEmail: 'podcast@churchcore.org',
    language: 'en',
    episodes,
  }

  const xml = generatePodcastRssXml(channel)

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
