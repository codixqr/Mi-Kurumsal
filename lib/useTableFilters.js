import { useState, useEffect, useCallback } from 'react';

/**
 * CRM Tablo ve Liste sayfaları için ortak filtre yönetim hook'u.
 * URL arama parametreleri ile filtre taslağını senkronize eder.
 */
export function useTableFilters(getDefaultFilters) {
  const [filters, setFilters] = useState(getDefaultFilters);
  const [filterDraft, setFilterDraft] = useState(getDefaultFilters);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      let hasFilters = false;
      const initial = typeof getDefaultFilters === 'function' ? getDefaultFilters() : getDefaultFilters;
      const newFilters = { ...initial };

      for (const key of Object.keys(initial)) {
        if (sp.has(key)) {
          newFilters[key] = sp.get(key);
          hasFilters = true;
        }
      }

      if (hasFilters) {
        setFilters(newFilters);
        setFilterDraft(newFilters);
      }
    }
  }, [getDefaultFilters]);

  const applyFilters = useCallback(() => {
    setFilters({ ...filterDraft });
  }, [filterDraft]);

  const resetFilters = useCallback(() => {
    const d = typeof getDefaultFilters === 'function' ? getDefaultFilters() : getDefaultFilters;
    setFilters(d);
    setFilterDraft(d);
  }, [getDefaultFilters]);

  return {
    filters,
    setFilters,
    filterDraft,
    setFilterDraft,
    applyFilters,
    resetFilters,
  };
}
