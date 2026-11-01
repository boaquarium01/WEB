/* 水博館水族：網頁推播背景程式（只處理推播，不做離線快取） */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		data = { title: '水博館水族', body: event.data ? event.data.text() : '' };
	}
	const title = data.title || '水博館水族';
	event.waitUntil(
		self.registration.showNotification(title, {
			body: data.body || '',
			icon: data.icon || '/web-app-manifest-192x192.png',
			badge: data.badge || '/favicon-96x96.png',
			tag: data.tag || undefined,
			renotify: Boolean(data.tag),
			data: { url: data.url || '/account/orders' },
		}),
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
			for (const client of windows) {
				if (client.url === target && 'focus' in client) return client.focus();
			}
			return self.clients.openWindow(target);
		}),
	);
});
