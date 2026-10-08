// ChurchCore LMS Service Worker (COUNCIL-2026-040)
// Web Push Notifications & Deep Link Routing

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload = {
    title: 'ChurchCore LMS',
    body: 'You have a new notification.',
    deep_link: '/dashboard',
    icon: '/icons/icon-192x192.png',
  }

  try {
    const data = event.data.json()
    payload = {
      title: data.title || payload.title,
      body: data.body || payload.body,
      deep_link: data.deep_link || data.url || payload.deep_link,
      icon: data.icon || payload.icon,
    }
  } catch {
    payload.body = event.data.text()
  }

  const options = {
    body: payload.body,
    icon: payload.icon,
    badge: '/icons/badge-72x72.png',
    data: {
      url: payload.deep_link,
    },
    vibrate: [100, 50, 100],
    tag: 'churchcore-push',
    renotify: true,
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window client is already open, focus it and navigate
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})
