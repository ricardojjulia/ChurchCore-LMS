import type { PushEventType, PushPayload } from './types'

// Strict privacy rule (COUNCIL-2026-040 Amendment 1):
// Push payloads carry NO PII, no message content, no grades, and no minor names.
// Generic text prompts the user to securely open the LMS.

export function buildSanitizedPushPayload(
  eventType: PushEventType,
  deepLink: string,
  hintContext?: { courseTitle?: string }
): PushPayload {
  let title = 'ChurchCore LMS'
  let body = 'You have a new update in ChurchCore LMS.'

  switch (eventType) {
    case 'announcement':
      title = 'New Announcement'
      body = hintContext?.courseTitle
        ? `A new announcement was posted in ${hintContext.courseTitle}.`
        : 'A new announcement has been posted.'
      break

    case 'grade_posted':
      title = 'Assignment Graded'
      body = 'Your assignment submission has been evaluated. Tap to view feedback.'
      break

    case 'new_message':
      title = 'New Message'
      body = 'You have received a new message. Tap to open the conversation.'
      break

    case 'course_completed':
      title = 'Course Completed!'
      body = hintContext?.courseTitle
        ? `Congratulations! You have completed ${hintContext.courseTitle}.`
        : 'Congratulations! You have completed your course and earned a certificate.'
      break

    case 'live_session_starting':
      title = 'Live Session Starting Soon'
      body = 'A live scheduled class session is starting in 15 minutes.'
      break

    case 'streak_reminder':
      title = 'Keep Your Learning Streak!'
      body = 'Complete a lesson today to maintain your daily learning streak.'
      break

    case 'test_push':
      title = 'ChurchCore Notifications Connected'
      body = 'Push notifications are active and configured for this device.'
      break
  }

  return {
    title,
    body,
    deep_link: deepLink || '/dashboard',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
  }
}
