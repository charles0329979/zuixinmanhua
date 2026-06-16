// ============================================================
// apps/mobile/src/database/index.ts
// SQLite stub — expo-sqlite unavailable in Node v24 CLI context
// Falls back to Zustand in-memory via useLibraryStore
// TODO: re-enable when Node/expo-sqlite ESM/CJS resolution is fixed
// ============================================================

const UNSUPPORTED_MSG = 'SQLite unavailable (Node v24 ESM resolution issue). Using in-memory fallback.';

export async function getDatabase(): Promise<any> {
  console.warn('[DB]', UNSUPPORTED_MSG);
  throw new Error(UNSUPPORTED_MSG);
}

export async function closeDatabase(): Promise<void> {
  // no-op
}
