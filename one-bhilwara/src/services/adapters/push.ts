import { isConfigured } from '@/services/integrations';

export type PushState = 'unsupported' | 'not_configured' | 'default' | 'granted' | 'denied';

export function pushState(): PushState {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (!isConfigured('push')) return 'not_configured';
  return Notification.permission as PushState;
}

/**
 * Asks for permission only after the user explicitly opts in from Settings. Subscribing also
 * requires a push server to store the subscription; until that exists we stop after permission.
 */
export async function requestPush(): Promise<PushState> {
  const s = pushState();
  if (s === 'unsupported' || s === 'not_configured') return s;
  const result = await Notification.requestPermission();
  return result as PushState;
}
