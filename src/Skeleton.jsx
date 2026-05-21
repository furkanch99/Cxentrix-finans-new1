import React from 'react'

// Subtle shimmer-style placeholder; usable as block, row, or text line.
// Usage:
//   <Skeleton h={20} w={140} />
//   <SkeletonRow cols={[40, '1fr', 100]} h={48} />
//   <SkeletonText lines={3} />

const baseStyle = {
  background: 'linear-gradient(90deg, var(--line) 0%, var(--line-soft) 50%, var(--line) 100%)',
  backgroundSize: '200% 100%',
  borderRadius: 8,
  animation: 'skeleton-shimmer 1.4s ease-in-out infinite',
}

export function Skeleton({ w = '100%', h = 16, radius = 8, style }) {
  return (
    <div style={{ ...baseStyle, width: w, height: h, borderRadius: radius, ...style }}>
      <style>{`@keyframes skeleton-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  )
}

export function SkeletonRow({ cols = ['40px', '1fr', '120px', '120px'], h = 48, gap = 12 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols.join(' '), gap, padding: '10px 12px', alignItems: 'center', borderBottom: '1px solid var(--line-soft)' }}>
      {cols.map((_, i) => <Skeleton key={i} h={h - 28} />)}
    </div>
  )
}

export function SkeletonText({ lines = 3, w = '100%' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} h={12} w={i === lines - 1 ? '60%' : w} />
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 6 }) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
      {Array.from({ length: rows }, (_, i) => <SkeletonRow key={i} />)}
    </div>
  )
}
