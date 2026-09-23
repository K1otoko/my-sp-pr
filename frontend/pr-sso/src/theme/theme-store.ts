import { project } from '../project';
import { isThemePreference, themeColors, type ColorMode, type ThemePreference } from './config';

const storageKey = `my-sp-pr:${project.id}:theme`;

function mediaQuery(query: string) {
  try {
    return window.matchMedia(query);
  } catch {
    return undefined;
  }
}

const darkQuery = mediaQuery('(prefers-color-scheme: dark)');
const motionQuery = mediaQuery('(prefers-reduced-motion: reduce)');

function readPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(storageKey);
    return isThemePreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

function createSnapshot(preference: ThemePreference) {
  const mode: ColorMode = preference === 'system'
    ? darkQuery?.matches ? 'dark' : 'light'
    : preference;
  return { preference, mode, reducedMotion: motionQuery?.matches ?? false };
}

let snapshot = createSnapshot(readPreference());
const listeners = new Set<() => void>();

function syncDocument() {
  document.documentElement.dataset.theme = snapshot.mode;
  document.documentElement.style.colorScheme = snapshot.mode;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', themeColors[snapshot.mode].layout);
}

function update(preference = snapshot.preference) {
  const next = createSnapshot(preference);
  if (next.preference === snapshot.preference && next.mode === snapshot.mode
    && next.reducedMotion === snapshot.reducedMotion) return;
  snapshot = next;
  syncDocument();
  listeners.forEach((listener) => listener());
}

function onMediaChange() {
  update();
}

function onStorage(event: StorageEvent) {
  try {
    if (event.storageArea !== window.localStorage) return;
  } catch {
    return;
  }
  if (event.key === storageKey || event.key === null) {
    update(isThemePreference(event.newValue) ? event.newValue : 'system');
  }
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    darkQuery?.addEventListener('change', onMediaChange);
    motionQuery?.addEventListener('change', onMediaChange);
    window.addEventListener('storage', onStorage);
    update();
    syncDocument();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      darkQuery?.removeEventListener('change', onMediaChange);
      motionQuery?.removeEventListener('change', onMediaChange);
      window.removeEventListener('storage', onStorage);
    }
  };
}

export function getThemeSnapshot() {
  return snapshot;
}

export function setThemePreference(preference: ThemePreference) {
  update(preference);
  try {
    window.localStorage.setItem(storageKey, preference);
  } catch {
    // 存储不可用时仍保留当前标签页的选择。
  }
}
