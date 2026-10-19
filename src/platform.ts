import { Capacitor, registerPlugin } from '@capacitor/core';

interface HanPitPlugin {
  initialize(): Promise<{ notifications: boolean }>;
  exportSession(options: { filename: string; source: string }): Promise<{ saved: boolean }>;
}

const native = registerPlugin<HanPitPlugin>('HanPit');

export async function initializePlatform(): Promise<void> {
  if (Capacitor.getPlatform() === 'android') await native.initialize();
}

export async function exportSessionFile(source: string): Promise<boolean> {
  const filename = `hanpit-session-${new Date().toISOString().slice(0, 10)}.json`;
  if (Capacitor.getPlatform() === 'android') {
    return (await native.exportSession({ filename, source })).saved;
  }
  const url = URL.createObjectURL(new Blob([source], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
