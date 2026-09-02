export function KpiCard({ label, value, sub, accent = '#1a5c38', href, icon }) {
  const content = (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${accent ? accent + '33' : '#e2e8f0'}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 12,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        cursor: href ? 'pointer' : 'default',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        {icon && <span style={{ fontSize: '1.1rem' }}>{icon}</span>}
      </div>
      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: accent, lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{sub}</div>}
    </div>
  );

  if (href) {
    return (
      <a href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
        {content}
      </a>
    );
  }

  return content;
}
