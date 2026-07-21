'use client';
import { useState, useRef, useEffect } from 'react';

/**
 * useColumnVisibility(storageKey, defaultCols)
 * Returns [visible, toggleCol]
 * visible = { colKey: boolean, ... }
 */
export function useColumnVisibility(storageKey, defaultCols) {
  const [visible, setVisible] = useState(() => {
    try {
      const saved = localStorage.getItem('cols_' + storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults so new cols appear visible by default
        return { ...defaultCols, ...parsed };
      }
    } catch {}
    return defaultCols;
  });

  const toggleCol = (key, val) => {
    setVisible((prev) => {
      const next = { ...prev, [key]: val };
      try { localStorage.setItem('cols_' + storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  return [visible, toggleCol];
}

/**
 * ColumnPicker component
 * Props:
 *   columns: [{ key: string, label: string }]
 *   visible: { [key]: boolean }
 *   onChange: (key, boolean) => void
 */
export function ColumnPicker({ columns, visible, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const visibleCount = columns.filter((c) => visible[c.key] !== false).length;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          border: '1px solid #cbd5e1',
          background: open ? '#f0fdf4' : '#f8fafc',
          borderRadius: 8,
          padding: '7px 12px',
          cursor: 'pointer',
          fontSize: '0.85rem',
          fontWeight: 600,
          color: '#1e3a2f',
          transition: 'all .15s',
          whiteSpace: 'nowrap',
        }}
      >
        ⚙ Sütunlar
        <span style={{
          background: '#0f766e',
          color: '#fff',
          borderRadius: 99,
          fontSize: '0.7rem',
          padding: '1px 6px',
          fontWeight: 700,
        }}>
          {visibleCount}/{columns.length}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 6px)',
          zIndex: 1000,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '12px 16px',
          minWidth: 200,
          maxWidth: 260,
          boxShadow: '0 8px 30px rgba(0,0,0,.14)',
        }}>
          <div style={{
            fontWeight: 700,
            fontSize: '0.82rem',
            color: '#0f766e',
            marginBottom: 10,
            paddingBottom: 8,
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>Sütunları Seç</span>
            <button
              type="button"
              onClick={() => columns.forEach((c) => onChange(c.key, true))}
              style={{ border: 'none', background: 'none', color: '#0f766e', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
            >
              Tümü
            </button>
          </div>

          {columns.map((col) => (
            <label
              key={col.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '5px 0',
                cursor: 'pointer',
                fontSize: '0.88rem',
                color: '#334155',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={visible[col.key] !== false}
                onChange={(e) => onChange(col.key, e.target.checked)}
                style={{ width: 15, height: 15, accentColor: '#0f766e', cursor: 'pointer' }}
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
