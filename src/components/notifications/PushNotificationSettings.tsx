'use client'

import React, { useState, useEffect } from 'react'
import type { PushNotificationPrefs } from '@/lib/push'
import { DEFAULT_PUSH_PREFS } from '@/lib/push'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export default function PushNotificationSettings() {
  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefs, setPrefs] = useState<PushNotificationPrefs>(DEFAULT_PUSH_PREFS)
  const [testStatus, setTestStatus] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
        setIsSupported(true)
        setPermission(Notification.permission)

        try {
          // Register service worker if not already registered
          const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
          const sub = await reg.pushManager.getSubscription()
          setIsSubscribed(Boolean(sub))
        } catch (err) {
          console.warn('Service worker registration check error:', err)
        }
      }

      // Fetch user preferences
      try {
        const res = await fetch('/api/push/preferences')
        if (res.ok) {
          const data = await res.json()
          if (data.preferences) setPrefs(data.preferences)
        }
      } catch (err) {
        console.error('Error fetching push prefs:', err)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  const handleToggleSubscription = async () => {
    setErrorMessage(null)
    setLoading(true)

    try {
      const reg = await navigator.serviceWorker.ready

      if (isSubscribed) {
        // Unsubscribe
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await sub.unsubscribe()
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          })
        }
        setIsSubscribed(false)
      } else {
        // Subscribe
        const perm = await Notification.requestPermission()
        setPermission(perm)

        if (perm !== 'granted') {
          setErrorMessage('Push notification permission was denied or dismissed.')
          setLoading(false)
          return
        }

        const vapidRes = await fetch('/api/push/vapid-key')
        const { publicKey } = await vapidRes.json()

        const convertedKey = urlBase64ToUint8Array(publicKey)
        const newSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey,
        })

        const rawKey = newSub.getKey ? newSub.getKey('p256dh') : null
        const rawAuth = newSub.getKey ? newSub.getKey('auth') : null

        const p256dh = rawKey ? btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawKey)))) : ''
        const auth = rawAuth ? btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawAuth)))) : ''

        const subRes = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: newSub.endpoint,
            keys: { p256dh, auth },
          }),
        })

        if (!subRes.ok) throw new Error('Failed to save subscription')
        setIsSubscribed(true)
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error configuring push notifications')
    } finally {
      setLoading(false)
    }
  }

  const handlePrefChange = async (key: keyof PushNotificationPrefs, value: boolean) => {
    const updated = { ...prefs, [key]: value }
    setPrefs(updated)
    setSavingPrefs(true)

    try {
      await fetch('/api/push/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      })
    } catch (err) {
      console.error('Failed to update push preference:', err)
    } finally {
      setSavingPrefs(false)
    }
  }

  const handleSendTestPush = async () => {
    setTestStatus('Sending test notification...')
    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'test' }),
      })
      if (res.ok) {
        setTestStatus('Test notification sent to your device!')
        setTimeout(() => setTestStatus(null), 4000)
      } else {
        setTestStatus('Failed to deliver test notification')
      }
    } catch {
      setTestStatus('Failed to deliver test notification')
    }
  }

  if (!isSupported) {
    return (
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
        <p className="font-semibold text-slate-300">Push Notifications Unavailable</p>
        <p className="mt-1">
          Your current browser or device does not support Web Push notifications.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🔔</span> Web Push Notifications
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Receive instant alerts on your mobile device or desktop for course updates, grades, and messages.
          </p>
        </div>

        <button
          onClick={handleToggleSubscription}
          disabled={loading}
          className={`px-4 py-2 rounded-xl text-xs font-semibold shadow-md transition-all ${
            isSubscribed
              ? 'bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
          }`}
        >
          {loading ? 'Updating...' : isSubscribed ? 'Disable on This Device' : 'Enable on This Device'}
        </button>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-950/60 border border-red-700 text-xs text-red-200">
          {errorMessage}
        </div>
      )}

      {isSubscribed && (
        <div className="space-y-4 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Notification Preferences
            </h4>
            {savingPrefs && <span className="text-[11px] text-indigo-400 animate-pulse">Saving...</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={prefs.announcement}
                onChange={e => handlePrefChange('announcement', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-indigo-600 bg-slate-900 border-slate-700"
              />
              <div>
                <span className="font-semibold text-white">Course Announcements</span>
                <p className="text-[11px] text-slate-400 mt-0.5">New updates posted by instructors</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={prefs.grade_posted}
                onChange={e => handlePrefChange('grade_posted', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-indigo-600 bg-slate-900 border-slate-700"
              />
              <div>
                <span className="font-semibold text-white">Grades & Rubric Feedback</span>
                <p className="text-[11px] text-slate-400 mt-0.5">When assignments & quizzes are evaluated</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={prefs.new_message}
                onChange={e => handlePrefChange('new_message', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-indigo-600 bg-slate-900 border-slate-700"
              />
              <div>
                <span className="font-semibold text-white">Direct & Guardian Messages</span>
                <p className="text-[11px] text-slate-400 mt-0.5">Private conversations with teachers & guardians</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={prefs.course_completed}
                onChange={e => handlePrefChange('course_completed', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-indigo-600 bg-slate-900 border-slate-700"
              />
              <div>
                <span className="font-semibold text-white">Course & Path Completions</span>
                <p className="text-[11px] text-slate-400 mt-0.5">Certificates and graduation milestones</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={prefs.live_session_starting}
                onChange={e => handlePrefChange('live_session_starting', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-indigo-600 bg-slate-900 border-slate-700"
              />
              <div>
                <span className="font-semibold text-white">Live Session Reminders</span>
                <p className="text-[11px] text-slate-400 mt-0.5">15 minutes before scheduled classes start</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={prefs.streak_reminder}
                onChange={e => handlePrefChange('streak_reminder', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-indigo-600 bg-slate-900 border-slate-700"
              />
              <div>
                <span className="font-semibold text-white">Daily Streak Reminder</span>
                <p className="text-[11px] text-slate-400 mt-0.5">Gentle nudge to maintain daily study streak</p>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleSendTestPush}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
            >
              📲 Send Test Push
            </button>
            {testStatus && <span className="text-xs text-indigo-300 font-medium">{testStatus}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
