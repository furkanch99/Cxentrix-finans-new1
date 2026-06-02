import React, { useState, useEffect } from 'react'
import { Icon } from './utils'

// =====================================================================
// Inline SVG bayraklar — Windows default font'unda country flag
// emoji'leri yok. Aynı bayrakların her OS'ta tutarlı görünmesi için
// küçük SVG bileşenleri kullanıyoruz.
// =====================================================================
const FLAG_W = 22, FLAG_H = 15
const flagWrapStyle = { borderRadius: 3, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(0,0,0,0.08)', display: 'inline-block', lineHeight: 0, flexShrink: 0 }

function FlagUS() {
  return (
    <span style={flagWrapStyle}>
      <svg width={FLAG_W} height={FLAG_H} viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="16" fill="#b22234"/>
        <g fill="#fff">
          {[1, 3, 5, 7, 9, 11].map(i => (
            <rect key={i} y={(i * 16) / 13} width="24" height={16 / 13}/>
          ))}
        </g>
        <rect width="9.6" height={(7 * 16) / 13} fill="#3c3b6e"/>
      </svg>
    </span>
  )
}

function FlagEU() {
  // 12 yıldız simgesi yerine basit altın daire dizilimi
  const dots = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * 2 * Math.PI - Math.PI / 2
    return { cx: 12 + 5.2 * Math.cos(angle), cy: 8 + 5.2 * Math.sin(angle) }
  })
  return (
    <span style={flagWrapStyle}>
      <svg width={FLAG_W} height={FLAG_H} viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="16" fill="#003399"/>
        <g fill="#ffcc00">
          {dots.map((d, i) => <circle key={i} cx={d.cx} cy={d.cy} r="0.8"/>)}
        </g>
      </svg>
    </span>
  )
}

function FlagGB() {
  return (
    <span style={flagWrapStyle}>
      <svg width={FLAG_W} height={FLAG_H} viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg">
        <clipPath id="t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath>
        <rect width="60" height="30" fill="#012169"/>
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/>
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#t)" stroke="#c8102e" strokeWidth="4"/>
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10"/>
        <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6"/>
      </svg>
    </span>
  )
}

function FlagCH() {
  // İsviçre bayrağı tabi ki kare; ufak letterbox tolere edip aynı boy
  return (
    <span style={flagWrapStyle}>
      <svg width={FLAG_H} height={FLAG_H} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" fill="#da291c"/>
        <rect x="13" y="6" width="6" height="20" fill="#fff"/>
        <rect x="6" y="13" width="20" height="6" fill="#fff"/>
      </svg>
    </span>
  )
}

export default function CurrencyTicker() {
  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)

  useEffect(() => {
    fetchRates()
    // Her 5 dakikada bir güncelle
    const interval = setInterval(fetchRates, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchRates = async () => {
    try {
      // exchangerate-api ücretsiz endpoint
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/TRY')
      const data = await response.json()

      if (data && data.rates) {
        // İstediğimiz dövizler için TRY karşılığı hesapla
        // API TRY -> X şeklinde veriyor, biz X -> TRY için 1/rate alıyoruz
        const newRates = [
          { code: 'USD', symbol: '$', name: 'Dolar',          rate: 1 / data.rates.USD, Flag: FlagUS },
          { code: 'EUR', symbol: '€', name: 'Euro',           rate: 1 / data.rates.EUR, Flag: FlagEU },
          { code: 'GBP', symbol: '£', name: 'Sterlin',        rate: 1 / data.rates.GBP, Flag: FlagGB },
          { code: 'CHF', symbol: '₣', name: 'İsviçre Frangı', rate: 1 / data.rates.CHF, Flag: FlagCH },
        ]

        // Önceki değerlerle karşılaştır - trend hesaplaması için
        setRates(prev => {
          return newRates.map(r => {
            const old = prev.find(p => p.code === r.code)
            const change = old ? ((r.rate - old.rate) / old.rate) * 100 : 0
            return { ...r, change, oldRate: old?.rate || r.rate }
          })
        })
        setLastUpdate(new Date())
      }
    } catch (err) {
      console.error('Kur çekme hatası:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{
        height: 42, background: 'var(--bg-card)', borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: 'var(--ink-muted)', letterSpacing: '0.1em'
      }}>
        Döviz kurları yükleniyor...
      </div>
    )
  }

  // İki kere render et ki sonsuz akış olsun
  const tickerItems = [...rates, ...rates, ...rates]

  return (
    <div className="ticker-container" style={{
      height: 42,
      background: 'linear-gradient(90deg, var(--bg-card) 0%, var(--bg-sidebar) 50%, var(--bg-card) 100%)',
      borderBottom: '1px solid var(--line)',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center'
    }}>
      {/* Sol gradient gölge */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 60,
        background: 'linear-gradient(to right, var(--bg-card), transparent)',
        zIndex: 2, pointerEvents: 'none'
      }}/>

      {/* Sağ gradient gölge */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 60,
        background: 'linear-gradient(to left, var(--bg-card), transparent)',
        zIndex: 2, pointerEvents: 'none'
      }}/>

      {/* Sol etiket - LIVE */}
      <div style={{
        position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
        zIndex: 3, display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--bg-card)', padding: '4px 10px', borderRadius: 6,
        border: '1px solid var(--accent)',
        boxShadow: '0 0 12px rgba(99, 102, 241, 0.3)'
      }}>
        <div className="pulse-dot" style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#ef4444',
          boxShadow: '0 0 6px #ef4444'
        }}/>
        <span style={{
          fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase',
          fontWeight: 700, color: 'var(--accent)'
        }}>CANLI KUR</span>
      </div>

      {/* Kayan içerik */}
      <div className="ticker-track" style={{
        display: 'flex',
        gap: 40,
        paddingLeft: 140,
        animation: 'tickerScroll 45s linear infinite',
        whiteSpace: 'nowrap'
      }}>
        {tickerItems.map((rate, i) => {
          const isUp = rate.change > 0
          const isDown = rate.change < 0
          const Flag = rate.Flag
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              flexShrink: 0
            }}>
              {Flag && <Flag />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)',
                  letterSpacing: '0.05em'
                }}>{rate.code}/TRY</span>
                <span className="mono" style={{
                  fontSize: 14, fontWeight: 700,
                  color: 'var(--ink)',
                  textShadow: '0 0 8px rgba(99, 102, 241, 0.1)'
                }}>{rate.rate.toFixed(4)}</span>
                {rate.change !== 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    padding: '2px 6px', borderRadius: 4,
                    background: isUp ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: isUp ? '#10b981' : '#ef4444',
                    display: 'flex', alignItems: 'center', gap: 2
                  }}>
                    {isUp ? '▲' : '▼'} {Math.abs(rate.change).toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        .ticker-track:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  )
}
