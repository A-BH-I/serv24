// Native app features: back button, splash screen, status bar, network detection
// Only activates inside Capacitor native shell

import { toast } from 'sonner';

function isNative(): boolean {
  return typeof (window as any)?.Capacitor !== 'undefined' &&
    (window as any)?.Capacitor?.isNativePlatform?.() === true;
}

let lastBackPress = 0;

export async function initNativeApp(): Promise<void> {
  if (!isNative()) return;

  // ── Status Bar ──
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: '#ffffff' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch { /* not available */ }

  // ── Splash Screen ──
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    // Auto-hide after 2s (native splash configured in Android/iOS projects)
    setTimeout(() => SplashScreen.hide({ fadeOutDuration: 300 }), 2000);
  } catch { /* not available */ }

  // ── Hardware Back Button ──
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        // Double-tap to exit
        const now = Date.now();
        if (now - lastBackPress < 2000) {
          App.exitApp();
        } else {
          lastBackPress = now;
          toast('Press back again to exit', { duration: 2000 });
        }
      }
    });
  } catch { /* not available */ }

  // ── Network Detection ──
  try {
    const { Network } = await import('@capacitor/network');
    const status = await Network.getStatus();
    if (!status.connected) {
      showOfflineUI(true);
    }
    Network.addListener('networkStatusChange', (s) => {
      showOfflineUI(!s.connected);
    });
  } catch { /* not available */ }
}

function showOfflineUI(offline: boolean) {
  const id = 'native-offline-banner';
  const existing = document.getElementById(id);

  if (offline && !existing) {
    const banner = document.createElement('div');
    banner.id = id;
    banner.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:99999;background:#ef4444;color:#fff;' +
      'text-align:center;padding:10px 16px;font-size:14px;font-weight:600;' +
      'font-family:system-ui,sans-serif;';
    banner.textContent = 'No internet connection';
    document.body.prepend(banner);
    // Push content down
    document.body.style.paddingTop = '40px';
  } else if (!offline && existing) {
    existing.remove();
    document.body.style.paddingTop = '';
    toast.success('Back online!', { duration: 2000 });
  }
}
