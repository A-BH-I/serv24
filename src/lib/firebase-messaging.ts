// Firebase Cloud Messaging setup for push notifications

import { api } from '@/lib/api';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

let messagingInstance: unknown = null;

export async function initFirebaseMessaging(): Promise<boolean> {
  if (!FIREBASE_CONFIG.apiKey || !VAPID_KEY) {
    console.warn('Firebase config not set. Push notifications disabled.');
    return false;
  }

  try {
    const { initializeApp } = await import('firebase/app');
    const { getMessaging, getToken, onMessage } = await import('firebase/messaging');

    const app = initializeApp(FIREBASE_CONFIG);
    const messaging = getMessaging(app);
    messagingInstance = messaging;

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission denied');
      return false;
    }

    // Get FCM token
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      // Send token to backend for storage
      try {
        await api.post('/notifications/register-device', { fcm_token: token, platform: 'web' });
      } catch {
        console.warn('Failed to register FCM token with backend');
      }
    }

    // Handle foreground messages
    onMessage(messaging, (payload) => {
      const { title, body } = payload.notification || {};
      if (title) {
        // Show a native notification
        new Notification(title, {
          body: body || '',
          icon: '/icons/icon-192x192.png',
        });
      }
    });

    return true;
  } catch (err) {
    console.warn('Firebase messaging init failed:', err);
    return false;
  }
}

export function getMessagingInstance() {
  return messagingInstance;
}
