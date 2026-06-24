// Firebase Messaging Service Worker
// This file MUST be at the root of the hosting directory (public/firebase-messaging-sw.js)
// It handles background push notifications when the app tab is not focused.

importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js');

const params = new URL(location).searchParams;
firebase.initializeApp({
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  storageBucket: params.get("storageBucket"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId")
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);

  const { title, body } = payload.notification || {};
  const data = payload.data || {};
  const type = data.type; // 'call' or 'message'

  const notificationOptions = {
    body: body || 'У вас новое уведомление',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: type === 'call' ? `call-${data.callId}` : `msg-${data.chatId}`,
    vibrate: type === 'call' ? [200, 100, 200] : undefined,
    silent: false,
    data: data, // Pass data to notificationclick handler
    actions: type === 'call' ? [
      { action: 'accept', title: '📞 Принять' },
      { action: 'decline', title: '❌ Отклонить' }
    ] : [
      { action: 'open', title: '💬 Открыть' }
    ]
  };

  self.registration.showNotification(title || '📬 Post Messenger', notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action;
  const type = data.type;

  let url = self.location.origin;

  if (type === 'call') {
    if (action === 'decline') {
      // Decline the call silently — fetch to update Firestore status
      // (Can't use Firebase SDK here without full init, use fetch to Cloud Function)
      // For now, just close notification
      return;
    }
    // action === 'accept' or direct click → open app with call params
    url = `${self.location.origin}/?callId=${data.callId}&callAction=accept&callType=${data.callType || 'audio'}`;
  } else if (type === 'message' && data.chatId) {
    url = `${self.location.origin}/?openChat=${data.chatId}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If app is already open, focus it and navigate
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_ACTION', action, data });
          return;
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
