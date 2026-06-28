// ============================================================
// packages/ui-shared/src/hooks/useSearch.ts
// Shared search hook — calls the search orchestrator (local or server)
// ============================================================

import { useCallback, useState } from './useReact';
import type { DisplayResult, SearchState } from '../types';

// Stub React hooks — platform provides real implementation
const { useCallback: useCb, useState: useSt } = (() => {
  try {
    const React = require('react');
    return { useCallback: React.useCallback, useState: React.useState };
  } catch {
    return {
      useCallback: (fn: any) => fn,
      useState: (init: any) => [init, (v: any) => v],
    };
  }
})();

export function useSearch(
  searchFn: (q: string) => Promise<{ results: DisplayResult[]; summary: SearchState['summary'] }>,
) {
  const [state, setState] = useState<SearchState>({
    query: '', results: [], loading: false, error: '',
    summary: { totalResults: 0, sourcesSearched: 0, sourcesFailed: 0, ruleSources: 0, hardcodedSources: 0 },
  });

  const search = useCallback(async (query: string) => {
    setState(s => ({ ...s, loading: true, error: '', query }));
    try {
      const { results, summary } = await searchFn(query);
      setState(s => ({ ...s, loading: false, results, summary }));
    } catch (e: any) {
      setState(s => ({ ...s, loading: false, error: e.message || 'Search failed' }));
    }
  }, [searchFn]);

  return { ...state, search };
}
