import React from 'react'
import { Icon } from './utils'

// Friendly empty-state block. Replaces the inline "Kayıt bulunamadı." text.
//
// <EmptyState icon="list" title="Henüz işlem yok"
//   subtitle="Yeni İşlem butonuna basarak başla"
//   action={<button onClick={...}>Yeni İşlem</button>} />

export default function EmptyState({ icon = 'spark', title, subtitle, action, compact = false }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px dashed var(--line)',
      borderRadius: 14,
      padding: compact ? '24px 18px' : '56px 24px',
      textAlign: 'center',
      color: 'var(--ink-muted)',
    }}>
      <div style={{
        width: compact ? 40 : 60,
        height: compact ? 40 : 60,
        borderRadius: '50%',
        background: 'var(--accent-soft)',
        color: 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 14px',
      }}>
        <Icon name={icon} size={compact ? 18 : 24} />
      </div>
      {title && (
        <div className="display" style={{ fontSize: compact ? 14 : 17, color: 'var(--ink)', marginBottom: 4 }}>
          {title}
        </div>
      )}
      {subtitle && (
        <div style={{ fontSize: 12, color: 'var(--ink-muted)', maxWidth: 360, margin: '0 auto' }}>
          {subtitle}
        </div>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}
