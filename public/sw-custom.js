// Custom Service Worker for PWA Notifications
// Handles notification clicks, badge management, and navigation

// Badge counter state
let badgeCount = 0;

// Initialize badge on install
self.addEventListener('install', (event) => {
  console.log('[SW] Service worker installing...');
  self.skipWaiting(); // Activate immediately
});

// Activate service worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activating...');
  event.waitUntil(self.clients.claim()); // Take control of all pages
});

// Handle notification click - navigate to appropriate page
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.data);
  
  event.notification.close(); // Close the notification
  
  const data = event.notification.data || {};
  const deviceId = data.deviceId;
  const eventType = data.eventType;
  
  // Decrement badge when notification is clicked
  if (badgeCount > 0) {
    badgeCount--;
    updateBadge(badgeCount);
  }
  
  // Determine navigation URL
  let url = '/';
  if (deviceId) {
    url = `/owner/chat/${deviceId}`;
  } else if (eventType) {
    url = '/notifications';
  }
  
  // Focus existing window or open new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window/tab open with the target URL
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // If no existing window, open a new one
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Handle notification close/dismiss - decrement badge
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification dismissed:', event.notification.data);
  
  // Decrement badge when notification is dismissed
  if (badgeCount > 0) {
    badgeCount--;
    updateBadge(badgeCount);
  }
});

// Handle messages from main app (for badge management)
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  const { type, count } = event.data || {};
  
  switch (type) {
    case 'UPDATE_BADGE':
      badgeCount = Math.max(0, count || 0);
      updateBadge(badgeCount);
      break;
      
    case 'INCREMENT_BADGE':
      badgeCount++;
      updateBadge(badgeCount);
      break;
      
    case 'CLEAR_BADGE':
      badgeCount = 0;
      updateBadge(0);
      break;
      
    default:
      console.log('[SW] Unknown message type:', type);
  }
});

// Update badge counter using Badge API
function updateBadge(count) {
  if ('setAppBadge' in self.registration) {
    if (count > 0) {
      self.registration.setAppBadge(count).then(() => {
        console.log('[SW] Badge updated to:', count);
      }).catch((err) => {
        console.error('[SW] Error updating badge:', err);
      });
    } else {
      self.registration.clearAppBadge().then(() => {
        console.log('[SW] Badge cleared');
      }).catch((err) => {
        console.error('[SW] Error clearing badge:', err);
      });
    }
  } else {
    console.log('[SW] Badge API not supported');
  }
}

// Handle push events (for future web push integration)
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received:', event);
  
  // Future: Handle web push notifications here
  // For now, notifications are triggered from the main app
  
  if (event.data) {
    try {
      const data = event.data.json();
      console.log('[SW] Push data:', data);
      
      // Increment badge on push
      badgeCount++;
      updateBadge(badgeCount);
      
      // Show notification
      event.waitUntil(
        self.registration.showNotification(data.title || 'New Alert', {
          body: data.body || '',
          icon: data.icon || '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: data.tag,
          data: data.data || {},
          silent: false,
          vibrate: data.vibrate || [200, 100, 200],
          requireInteraction: data.requireInteraction || false,
          renotify: true,
          timestamp: Date.now()
        })
      );
    } catch (err) {
      console.error('[SW] Error parsing push data:', err);
    }
  }
});

// Initialize badge on service worker activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    clients.matchAll().then((clientList) => {
      // Sync badge count from main app if needed
      console.log('[SW] Service worker activated, badge count:', badgeCount);
    })
  );
});

console.log('[SW] Custom service worker loaded');
