// Unified push notification service for Web (FCM) and Native (Capacitor)
import { api } from '@/lib/api';

/**
 * Detects if running inside a Capacitor native shell (Android/iOS)
 */
function isNativePlatform(): boolean {
  return typeof (window as any)?.Capacitor !== 'undefined' &&
    (window as any)?.Capacitor?.isNativePlatform?.() === true;
}

/**
 * Initialize push notifications — picks native or web path automatically.
 */
export async function initPushNotifications(): Promise<boolean> {
  if (isNativePlatform()) {
    return initNativePush();
  }
  return initWebPush();
}

// ── Native (Capacitor) ──────────────────────────────────────────────

async function initNativePush(): Promise<boolean> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Request permission
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      console.warn('Push notification permission denied on native');
      return false;
    }

    // Register with APNs / FCM
    await PushNotifications.register();

    // Listen for registration token
    PushNotifications.addListener('registration', async (token) => {
      console.log('Native push token:', token.value);
      try {
        const platform = (window as any)?.Capacitor?.getPlatform?.() || 'unknown';
        await api.post('/notifications/register-device', {
          fcm_token: token.value,
          platform,
        });
      } catch {
        console.warn('Failed to register native push token with backend');
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Native push registration error:', err);
    });

    // Foreground notification received
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received in foreground:', notification);
      // You could show an in-app toast here
    });

    // User tapped notification
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification.data;
      if (data?.url) {
        window.location.href = data.url;
      }
    });

    return true;
  } catch (err) {
    console.warn('Native push init failed:', err);
    return false;
  }
}

// ── Web (Firebase Cloud Messaging) ──────────────────────────────────

async function initWebPush(): Promise<boolean> {
  try {
    const { initFirebaseMessaging } = await import('@/lib/firebase-messaging');
    return await initFirebaseMessaging();
  } catch {
    return false;
  }
}
