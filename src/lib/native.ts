import { Capacitor, SystemBars, SystemBarsStyle, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { AccountRecord } from './auth';

interface DaylightNativePlugin {
  getAccount(): Promise<{ record: AccountRecord | null }>;
  setAccount(options: { record: AccountRecord }): Promise<void>;
  getCredentials(): Promise<{ token: string | null }>;
  setCredentials(options: { token: string }): Promise<void>;
  clearCredentials(): Promise<void>;
  exportBackup(options: { content: string; name: string }): Promise<{ saved: boolean }>;
  setAppearance(options: { theme: string }): Promise<void>;
  exitApp(): Promise<void>;
  addListener(event: 'resume' | 'backButton', listener: () => void): Promise<PluginListenerHandle>;
}

const native = registerPlugin<DaylightNativePlugin>('DaylightNative');
export const isNativeAndroid = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
let initialization: Promise<void> | undefined;

function handleBackButton(): void {
  // Let focused controls and custom overlays handle Escape before the native dialog.
  const target = document.activeElement ?? document;
  const escape = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
  if (!target.dispatchEvent(escape)) return;
  const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
  const dialog = dialogs.item(dialogs.length - 1);
  if (dialog) {
    if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
    return;
  }
  void native.exitApp();
}

export async function exportBackupText(content: string, name: string): Promise<boolean> {
  if (!isNativeAndroid()) throw new Error('此设备不支持 Android 文件导出。');
  return (await native.exportBackup({ content, name })).saved;
}

/** Install the same restricted credential capabilities used by the desktop app. */
export function initializeNativePlatform(): Promise<void> {
  if (!isNativeAndroid()) return Promise.resolve();
  initialization ??= (async () => {
    document.documentElement.dataset.platform = 'android';
    window.daylightDesktop = Object.freeze({
      platform: 'android',
      account: Object.freeze({
        get: async () => (await native.getAccount()).record,
        set: async (record: AccountRecord) => { await native.setAccount({ record }); },
      }),
      credentials: Object.freeze({
        get: async () => (await native.getCredentials()).token,
        set: async (token: string) => { await native.setCredentials({ token }); },
        clear: async () => { await native.clearCredentials(); },
      }),
      appearance: Object.freeze({
        set: async (theme: string) => {
          await SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
          await native.setAppearance({ theme });
        },
      }),
    });
    await native.addListener('backButton', handleBackButton);
    await native.addListener('resume', () => {
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('daylight:native-resume'));
    });
  })();
  return initialization;
}
