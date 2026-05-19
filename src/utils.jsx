import React from 'react'

// Logo URL'leri - Vercel public klasöründen çekiliyor
export const LOGO_URL = '/logo-icon.png'
export const LOGO_FULL_URL = '/logo-full.png'

// === FORMAT YARDIMCILARI ===
export const fmt = (n) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
export const fmtTL = (n) => '₺' + fmt(n)
export const todayStr = () => new Date().toISOString().slice(0, 10)
export const monthName = (m) => ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'][m]
export const monthFull = (m) => ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][m]

// === GRAFİK TEMA YARDIMCILARI ===
export const getChartTheme = () => {
  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
  return {
    isDark,
    textColor: isDark ? '#c4c9d5' : '#3a3f4e',
    gridColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,17,23,0.06)',
  }
}

// chartOpts: bir fonksiyondur - tema ve opsiyonları alır, Chart.js options objesi döner
export const chartOpts = (theme, opts = {}) => {
  const t = theme || getChartTheme()
  const isCurrency = opts.currency === true
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          font: { family: "'Inter', sans-serif", size: 11 },
          color: t.textColor,
          usePointStyle: true,
          padding: 12,
          boxWidth: 8,
          boxHeight: 8,
        }
      },
      tooltip: {
        backgroundColor: t.isDark ? 'rgba(20, 22, 30, 0.95)' : 'rgba(15, 17, 23, 0.95)',
        titleColor: '#fff',
        bodyColor: '#fff',
        padding: 10,
        cornerRadius: 8,
        titleFont: { size: 12, weight: 600 },
        bodyFont: { size: 11 },
        callbacks: isCurrency ? {
          label: (ctx) => {
            const v = ctx.parsed.y ?? ctx.parsed
            return `${ctx.dataset.label}: ${fmtTL(v)}`
          }
        } : {}
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: t.gridColor, drawBorder: false },
        ticks: {
          color: t.textColor,
          font: { size: 10 },
          callback: isCurrency ? (v) => (v >= 1000000 ? '₺' + (v/1000000).toFixed(1) + 'M' : v >= 1000 ? '₺' + (v/1000).toFixed(0) + 'K' : '₺' + v) : undefined,
        }
      },
      x: {
        grid: { display: false },
        ticks: { color: t.textColor, font: { size: 10 } }
      }
    }
  }
}

// === SVG İKON KOMPONENTİ ===
const ICON_PATHS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  list: 'M3 5h18M3 12h18M3 19h18',
  chart: 'M3 3v18h18M7 14l4-4 4 4 6-6',
  pie: 'M11 2a10 10 0 1011 11h-11V2z',
  wallet: 'M3 7v12a2 2 0 002 2h14a2 2 0 002-2V7m-2 0V5a2 2 0 00-2-2H5a2 2 0 00-2 2v2m18 0H3m15 5a2 2 0 11-4 0 2 2 0 014 0z',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75',
  trending: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
  spark: 'M13 10V3L4 14h7v7l9-11h-7z',
  download: 'M12 4v12m0 0l-4-4m4 4l4-4M4 20h16',
  upload: 'M12 20V8m0 0l-4 4m4-4l4 4M4 4h16',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M6 18L18 6',
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  sun: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
  moon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  arrowDown: 'M19 14l-7 7m0 0l-7-7m7 7V3',
  arrowUp: 'M5 10l7-7m0 0l7 7m-7-7v18',
  arrowLeft: 'M19 12H5m0 0l7 7m-7-7l7-7',
  arrowRight: 'M5 12h14m0 0l-7-7m7 7l-7 7',
  trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3',
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
}

export function Icon({ name, size = 16, color, stroke = 2 }) {
  const d = ICON_PATHS[name]
  if (!d) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  )
}
