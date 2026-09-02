'use client';
import { useEffect } from 'react';

export function MobileTableSetup() {
  useEffect(() => {
    const applyResponsiveTables = () => {
      if (window.innerWidth > 768) return;
      document.querySelectorAll('table.inv-table, table.data-table, table').forEach(table => {
        if (table.closest('td') || table.classList.contains('no-responsive')) return;
        
        const ths = Array.from(table.querySelectorAll('thead th'));
        if (!ths.length) return;
        
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(tr => {
          const tds = Array.from(tr.querySelectorAll('td'));
          tds.forEach((td, i) => {
            if (ths[i] && !td.getAttribute('data-label')) {
              let text = ths[i].textContent || '';
              td.setAttribute('data-label', text.trim());
            }
          });
        });
        table.classList.add('responsive-cards');
      });
    };

    applyResponsiveTables();
    
    const observer = new MutationObserver((mutations) => {
      let shouldApply = false;
      for (const m of mutations) {
        if (m.addedNodes.length) {
          shouldApply = true;
          break;
        }
      }
      if (shouldApply) applyResponsiveTables();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', applyResponsiveTables);
    
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', applyResponsiveTables);
    };
  }, []);

  return null;
}
