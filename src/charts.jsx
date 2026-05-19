import React, { useRef, useEffect } from 'react'
import Chart from 'chart.js/auto'
import { monthName, fmt, getChartTheme, chartOpts } from './utils'

export function TrendChart({ monthly }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()
    const t = getChartTheme()
    const ctx = canvasRef.current.getContext('2d')
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthly.map(m => monthName(m.month)),
        datasets: [
          { type: 'line', label: 'Gelir', data: monthly.map(m => m.inc), borderColor: '#10b981', backgroundColor: '#10b981', borderWidth: 2.5, tension: 0.35, pointRadius: 3, pointHoverRadius: 5, fill: false, order: 0 },
          { type: 'line', label: 'Gider', data: monthly.map(m => m.exp), borderColor: '#ef4444', backgroundColor: '#ef4444', borderWidth: 2.5, tension: 0.35, pointRadius: 3, pointHoverRadius: 5, fill: false, order: 0 },
          { type: 'bar', label: 'Net', data: monthly.map(m => m.net),
            backgroundColor: monthly.map(m => m.net >= 0 ? 'rgba(99, 102, 241, 0.25)' : 'rgba(239, 68, 68, 0.2)'),
            borderColor: monthly.map(m => m.net >= 0 ? 'rgba(99, 102, 241, 0.6)' : 'rgba(239, 68, 68, 0.4)'),
            borderWidth: 1, borderRadius: 4, order: 1 }
        ]
      },
      options: chartOpts(t, { currency: true })
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [monthly])
  return <div style={{ height: 260 }}><canvas ref={canvasRef}></canvas></div>
}

export function DailyTrendChart({ daily }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()
    const t = getChartTheme()
    const ctx = canvasRef.current.getContext('2d')
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: daily.map(d => String(d.day)),
        datasets: [
          { type: 'line', label: 'Gelir', data: daily.map(d => d.inc), borderColor: '#10b981', backgroundColor: '#10b981', borderWidth: 2, tension: 0.2, pointRadius: 2, fill: false, order: 0 },
          { type: 'line', label: 'Gider', data: daily.map(d => d.exp), borderColor: '#ef4444', backgroundColor: '#ef4444', borderWidth: 2, tension: 0.2, pointRadius: 2, fill: false, order: 0 },
          { type: 'bar', label: 'Net', data: daily.map(d => d.net),
            backgroundColor: daily.map(d => d.net >= 0 ? 'rgba(99, 102, 241, 0.2)' : 'rgba(239, 68, 68, 0.15)'),
            borderColor: daily.map(d => d.net >= 0 ? 'rgba(99, 102, 241, 0.5)' : 'rgba(239, 68, 68, 0.35)'),
            borderWidth: 1, borderRadius: 3, order: 1 }
        ]
      },
      options: chartOpts(t, { currency: true })
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [daily])
  return <div style={{ height: 260 }}><canvas ref={canvasRef}></canvas></div>
}

export function CategoryBarChart({ data, colorHex }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return
    if (chartRef.current) chartRef.current.destroy()
    const t = getChartTheme()
    const ctx = canvasRef.current.getContext('2d')
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.n),
        datasets: [{ label: 'Tutar', data: data.map(d => d.a), backgroundColor: colorHex + 'cc', borderRadius: 6, maxBarThickness: 45 }]
      },
      options: chartOpts(t, { noLegend: true, currency: true })
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [data, colorHex])
  if (data.length === 0) return <EmptyChart />
  return <div style={{ height: 260 }}><canvas ref={canvasRef}></canvas></div>
}

export function CustomerBarChart({ data }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return
    if (chartRef.current) chartRef.current.destroy()
    const t = getChartTheme()
    const ctx = canvasRef.current.getContext('2d')
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.n),
        datasets: [{ label: 'Gelir', data: data.map(d => d.a), backgroundColor: '#10b981cc', borderRadius: 6 }]
      },
      options: { ...chartOpts(t, { noLegend: true, currency: true }), indexAxis: 'y' }
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [data])
  if (data.length === 0) return null
  return <div style={{ height: Math.max(180, data.length * 38) }}><canvas ref={canvasRef}></canvas></div>
}

export function PaymentPieChart({ data }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return
    if (chartRef.current) chartRef.current.destroy()
    const t = getChartTheme()
    const colors = ['#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16']
    const ctx = canvasRef.current.getContext('2d')
    chartRef.current = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: data.map(d => d.n), datasets: [{ data: data.map(d => d.a), backgroundColor: colors.slice(0, data.length), borderColor: 'transparent', borderWidth: 3 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: { position: 'right', labels: { font: { family: "'Inter', sans-serif", size: 11 }, color: t.text, padding: 10, usePointStyle: true, pointStyle: 'circle', boxWidth: 8 } },
          tooltip: {
            backgroundColor: t.tooltipBg, padding: 10, cornerRadius: 8,
            callbacks: { label: (ctx) => {
              const total = ctx.dataset.data.reduce((s,v) => s+v, 0)
              const pct = (ctx.parsed / total) * 100
              return `${ctx.label}: ₺${fmt(ctx.parsed)} (%${pct.toFixed(1)})`
            } }
          }
        }
      }
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [data])
  if (data.length === 0) return <EmptyChart />
  return <div style={{ height: 260 }}><canvas ref={canvasRef}></canvas></div>
}

export function FatihTrendChart({ monthly }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()
    const t = getChartTheme()
    const ctx = canvasRef.current.getContext('2d')
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthly.map(m => monthName(m.month)),
        datasets: [
          { label: 'Şirket → Fatih', data: monthly.map(m => m.payouts), backgroundColor: '#ef4444cc', borderRadius: 5, stack: 'a' },
          { label: 'Fatih → Şirket', data: monthly.map(m => m.advances), backgroundColor: '#10b981cc', borderRadius: 5, stack: 'b' },
          { type: 'line', label: 'Net', data: monthly.map(m => m.net), borderColor: '#6366f1', backgroundColor: '#6366f1', borderWidth: 2.5, tension: 0.3, pointRadius: 4, fill: false }
        ]
      },
      options: chartOpts(t, { currency: true })
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [monthly])
  return <div style={{ height: 280 }}><canvas ref={canvasRef}></canvas></div>
}

export function CategoryTrendChart({ categoryData, topCategories }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()
    const t = getChartTheme()
    const colors = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']
    const ctx = canvasRef.current.getContext('2d')
    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array.from({length:12}, (_,i) => monthName(i)),
        datasets: topCategories.map((cat, i) => ({
          label: cat, data: categoryData[cat] || Array(12).fill(0),
          borderColor: colors[i], backgroundColor: colors[i] + '20',
          borderWidth: 2, tension: 0.3, pointRadius: 3, pointHoverRadius: 5, fill: false
        }))
      },
      options: chartOpts(t, { currency: true })
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [categoryData, topCategories])
  return <div style={{ height: 320 }}><canvas ref={canvasRef}></canvas></div>
}

function EmptyChart() {
  return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>Veri yok</div>
}

// Reusable card components
export function KPICard({ label, value, subtitle, icon, color, gradient, big, Icon }) {
  const colorMap = {
    green: { bg: 'var(--green-soft)', fg: 'var(--green)' },
    red: { bg: 'var(--red-soft)', fg: 'var(--red)' },
    blue: { bg: 'var(--blue-soft)', fg: 'var(--blue)' },
    amber: { bg: 'var(--amber-soft)', fg: 'var(--amber)' },
    purple: { bg: 'var(--purple-soft)', fg: 'var(--purple)' }
  }
  const c = color ? colorMap[color] : null
  return (
    <div className="card-hover glow-card" style={{
      background: gradient ? 'var(--gradient-1)' : 'var(--bg-card)',
      color: gradient ? 'white' : 'var(--ink)',
      border: gradient ? 'none' : '1px solid var(--line)',
      borderRadius: 14, padding: big ? '18px 20px' : '16px 18px',
      position: 'relative', overflow: 'hidden',
      boxShadow: gradient ? '0 8px 24px rgba(99, 102, 241, 0.25)' : 'var(--shadow-sm)'
    }}>
      {gradient && <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)' }}></div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, position: 'relative' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: gradient ? 0.85 : 0.7, fontWeight: 600, color: gradient ? 'white' : 'var(--ink-muted)' }}>{label}</div>
        {Icon && icon && (
          <div style={{ width: 30, height: 30, borderRadius: 8, background: gradient ? 'rgba(255,255,255,0.18)' : c ? c.bg : 'var(--accent-soft)', color: gradient ? 'white' : c ? c.fg : 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={15} />
          </div>
        )}
      </div>
      <div className="mono" style={{ fontSize: big ? 24 : 18, fontWeight: 700, marginBottom: subtitle ? 4 : 0, letterSpacing: '-0.02em', lineHeight: 1.15, color: gradient ? 'white' : c ? c.fg : 'var(--ink)', wordBreak: 'break-word', position: 'relative' }}>{value}</div>
      {subtitle && <div style={{ fontSize: 11, opacity: 0.75, position: 'relative' }}>{subtitle}</div>}
    </div>
  )
}

export function ChartCard({ title, subtitle, icon, children, Icon }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        {Icon && icon && (
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={14} />
          </div>
        )}
        <div>
          <h3 className="display" style={{ fontSize: 15, marginBottom: 2 }}>{title}</h3>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}
