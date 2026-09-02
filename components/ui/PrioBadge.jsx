const PRIO_COLORS = {
  'Çok Yüksek': { bg: '#fef2f2', text: '#dc2626' },
  'Çok sıcak':   { bg: '#fef2f2', text: '#dc2626' },
  'Yüksek':     { bg: '#fff7ed', text: '#ea580c' },
  'Orta':       { bg: '#eff6ff', text: '#2563eb' },
  'Düşük':      { bg: '#f0fdf4', text: '#16a34a' },
};

export function PrioBadge({ priority, p }) {
  const val = priority || p || 'Orta';
  const c = PRIO_COLORS[val] || PRIO_COLORS['Orta'];
  return (
    <span
      style={{
        fontSize: '0.72rem',
        fontWeight: 700,
        color: c.text,
        background: c.bg,
        borderRadius: 6,
        padding: '3px 8px',
        whiteSpace: 'nowrap',
        display: 'inline-block',
      }}
    >
      {priority}
    </span>
  );
}
