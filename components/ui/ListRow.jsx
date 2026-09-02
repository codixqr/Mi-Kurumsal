import { PrioBadge } from './PrioBadge';

export function ListRow({ left, right, sub, badge, accent, href, onAction }) {
  const content = (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 18px',
        borderBottom: '1px solid #f8fafc',
        gap: 8,
        cursor: href ? 'pointer' : 'default',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            color: href ? '#1a5c38' : '#334155',
            fontSize: '0.875rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {left}
        </div>
        {sub && <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {badge && <PrioBadge priority={badge} />}
        {right && (
          <span style={{ fontSize: '0.8rem', color: accent || '#64748b', fontWeight: 500 }}>
            {right}
          </span>
        )}
        {onAction && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAction();
            }}
            style={{
              marginLeft: 8,
              fontSize: '0.75rem',
              padding: '4px 8px',
              background: '#16a34a',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Tamamla
          </button>
        )}
      </div>
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
