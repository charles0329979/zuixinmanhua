// ============================================================
// apps/mobile/src/store/useSettingsStore.ts
// Zustand — 应用设置
// ============================================================

import { create } from 'zustand';

type Theme = 'system' | 'light' | 'dark';
type ReaderMode = 'long-strip' | 'paged';

interface SettingsState {
  theme: Theme;
  brightness: number;
  readerMode: ReaderMode;
  autoNextChapter: boolean;

  setTheme: (theme: Theme) => void;
  setBrightness: (v: number) => void;
  setReaderMode: (mode: ReaderMode) => void;
  setAutoNextChapter: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'dark',
  brightness: 100,
  readerMode: 'long-strip',
  autoNextChapter: true,

  setTheme: (theme) => set({ theme }),
  setBrightness: (brightness) => set({ brightness }),
  setReaderMode: (readerMode) => set({ readerMode }),
  setAutoNextChapter: (autoNextChapter) => set({ autoNextChapter }),
}));
