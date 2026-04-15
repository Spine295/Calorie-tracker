const CACHE_NAME = 'food-tracker-v3';
const DB_NAME = 'food-db';
const STORE_NAME = 'calories';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/192.png',
    '/512.png'
];

// INSTALL
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// ACTIVATE
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// -------- IndexedDB --------
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = () => {
            request.result.createObjectStore(STORE_NAME);
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getCalories() {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get('total');

        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => resolve(0);
    });
}

async function setCalories(val) {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(val, 'total');
        tx.oncomplete = resolve;
    });
}

// -------- Broadcast to UI --------
async function broadcast(value) {
    const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    });

    for (const client of clients) {
        client.postMessage({
            type: 'CURRENT_CALORIES',
            value
        });
    }
}

// -------- Messages --------
self.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) return;

    if (data.type === 'GET_CALORIES') {
        event.waitUntil(
            getCalories().then(total => broadcast(total))
        );
    }

    if (data.type === 'ADD_CALORIES') {
        event.waitUntil((async () => {
            const current = await getCalories();
            const updated = current + data.value;
            await setCalories(updated);
            await broadcast(updated);
        })());
    }

    if (data.type === 'RESET_CALORIES') {
        event.waitUntil((async () => {
            await setCalories(0);
            await broadcast(0);
        })());
    }
});

// -------- Fetch (offline) --------
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then(res => res || fetch(event.request))
    );
});
