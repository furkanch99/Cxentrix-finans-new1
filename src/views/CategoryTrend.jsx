import React, { useState, useMemo } from 'react'
import { Icon, fmtTL, monthName, monthFull } from '../utils'
import { CategoryTrendChart, KPICard, ChartCard } from '../charts'
import { isFatihTransferTx } from '../fatihHelper'

export default function CategoryTrend({ data }) {
  const availableYears = useMemo(() => {
    const ys = new Set(data.transactions.map(t => new Date(t.date).getFullYear()))
    ys.add(new Date().getFullYear())
    return Array.from(ys).sort((a,b) => b-a)
  }, [data.transactions])

  const [year, setYear] = useState(new Date().getFullYear())
  const [type, setType] = useState('expense')

  // Yıl işlemleri - Fatih kategorisi hariç
  const yearTxs = useMemo(() =>
    data.transactions.filter(t => {
      if (new Date(t.date).getFullYear() !== year) return false
      if (t.type !== type) return false
      if (type === 'expense' && isFatihTransferTx(t)) return false
      return true
    }), [data.transactions, year, type])

  const availableMonths = useMemo(() => {
    const ms = new Set(yearTxs.map(t => new Date(t.date).getMonth()))
    return Array.from(ms).sort((a,b) => a-b)
  }, [yearTxs])

  const defaultM1 = availableMonths.length >= 2 ? availableMonths[availableMonths.length-2] : (availableMonths[0] ?? 0)
  const defaultM2 = availableMonths.length >= 1 ? availableMonths[availableMonths.length-1] : 0
  const [month1, setMonth1] = useState(defaultM1)
  const [month2, setMonth2] = useState(defaultM2)

  const comparison = useMemo(() => {
    const cat1 = {}
    const cat2 = {}
    yearTxs.forEach(t => {
      const m = new Date(t.date).getMonth()
      if (m === month1) cat1[t.category] = (cat1[t.category] || 0) + t.amount
      if (m === month2) cat2[t.category] = (cat2[t.category] || 0) + t.amount
    })
    const allCats = new Set([...Object.keys(cat1), ...Object.keys(cat2)])
    const result = Array.from(allCats).map(c => {
      const a1 = cat1[c] || 0
      const a2 = cat2[c] || 0
      const diff = a2 - a1
      const pct = a1 === 0 ? (a2 === 0 ? 0 : 100) : ((a2 - a1) / a1) * 100
      return { category: c, a1, a2, diff, pct }
    })
    return result.sort((a,b) => Math.abs(b.diff) - Math.abs(a.diff))
  }, [yearTxs, month1, month2])

  const allMonthsByCategory = useMemo(() => {
    const map = {}
    yearTxs.forEach(t => {
      const m = new Date(t.date).getMonth()
      if (!map[t.category]) map[t.category] = Array(12).fill(0)
      map[t.category][m] += t.amount
    })
    return map
  }, [yearTxs])

  const topCategories = useMemo(() => {
    const totals = Object.entries(allMonthsByCategory).map(([c, arr]) => ({ c, total: arr.reduce((s,v) => s+v, 0) }))
    return totals.sort((a,b) => b.total - a.total).slice(0, 6).map(t => t.c)
  }, [allMonthsByCategory])

  const totalDiff = comparison.reduce((s,c) => s + c.diff, 0)
  const totalA1 = comparison.reduce((s,c) => s + c.a1, 0)
  const totalA2 = comparison.reduce((s,c) => s + c.a2, 0)
  const totalPct = totalA1 === 0 ? 0 : ((totalA2 - totalA1) / totalA1) * 100

  return (
    <div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>Yıl</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '7px 12px', fontSize: 13, fontWeight: 500 }}>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ width: 1, height: 24, background: 'var(--line)' }}></div>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-input)', padding: 3, borderRadius: 8 }}>
          {['expense','income'].map(t => (
            <button key={t} onClick={() => setType(t)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: type === t ? 'var(--accent)' : 'transparent', color: type === t ? 'white' : 'var(--ink-soft)' }}>{t === 'expense' ? 'Giderler' : 'Gelirler'}</button>
          ))}
        </div>
        <div style={{ width: 1, height: 24, background: 'var(--line)' }}></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>Karşılaştır</span>
          <select value={month1} onChange={e => setMonth1(Number(e.target.value))} style={{ padding: '7px 12px', fontSize: 13, fontWeight: 500 }}>
            {Array.from({length:12}, (_,i) => <option key={i} value={i}>{monthFull(i)}</option>)}
          </select>
          <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>→</span>
          <select value={month2} onChange={e => setMonth2(Number(e.target.value))} style={{ padding: '7px 12px', fontSize: 13, fontWeight: 500 }}>
            {Array.from({length:12}, (_,i) => <option key={i} value={i}>{monthFull(i)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <KPICard label={`${monthFull(month1)} Toplam`} value={fmtTL(totalA1)} color="blue" big Icon={Icon} />
        <KPICard label={`${monthFull(month2)} Toplam`} value={fmtTL(totalA2)} color="purple" big Icon={Icon} />
        <KPICard
          label="Değişim"
          value={`${totalDiff >= 0 ? '+' : ''}${fmtTL(totalDiff)}`}
          subtitle={`${totalDiff >= 0 ? '↑' : '↓'} %${Math.abs(totalPct).toFixed(1)}`}
          color={totalDiff >= 0 ? (type === 'expense' ? 'red' : 'green') : (type === 'expense' ? 'green' : 'red')}
          big Icon={Icon}
        />
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)', marginBottom: 16 }}>
        <h3 className="display" style={{ fontSize: 15, marginBottom: 4 }}>{monthFull(month1)} vs {monthFull(month2)} — Kategori Karşılaştırması</h3>
        <p style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 14 }}>
          {type === 'expense' ? 'Gider' : 'Gelir'} kategorileri için ay bazlı değişim. {type === 'expense' && 'Fatih Karakaş cari hesap hareketleri dahil değildir.'}
        </p>
        {comparison.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>Bu dönemler için veri yok.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 130px 100px', gap: 12, padding: '10px 0', borderBottom: '2px solid var(--accent)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>
              <div>Kategori</div>
              <div style={{ textAlign: 'right' }}>{monthName(month1)}</div>
              <div style={{ textAlign: 'right' }}>{monthName(month2)}</div>
              <div style={{ textAlign: 'right' }}>Fark</div>
              <div style={{ textAlign: 'right' }}>Değişim %</div>
            </div>
            {comparison.map((c, i) => {
              const isUp = c.diff > 0
              const isDown = c.diff < 0
              const isBad = type === 'expense' ? isUp : isDown
              const isGood = type === 'expense' ? isDown : isUp
              const arrow = isUp ? '↑' : isDown ? '↓' : '—'
              const color = isGood ? 'var(--green)' : isBad ? 'var(--red)' : 'var(--ink-muted)'
              return (
                <div key={c.category} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 130px 100px', gap: 12, padding: '12px 0', borderBottom: i < comparison.length-1 ? '1px solid var(--line-soft)' : 'none', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{c.category}</div>
                  <div className="mono" style={{ textAlign: 'right', fontSize: 13, color: 'var(--ink-soft)' }}>{c.a1 > 0 ? fmtTL(c.a1) : '—'}</div>
                  <div className="mono" style={{ textAlign: 'right', fontSize: 13, color: 'var(--ink-soft)' }}>{c.a2 > 0 ? fmtTL(c.a2) : '—'}</div>
                  <div className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color }}>{c.diff === 0 ? '—' : `${c.diff > 0 ? '+' : ''}${fmtTL(c.diff)}`}</div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ background: c.diff === 0 ? 'transparent' : (isGood ? 'var(--green-soft)' : 'var(--red-soft)'), color, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                      {c.diff === 0 ? '—' : `${arrow} %${Math.abs(c.pct).toFixed(1)}`}
                    </span>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      <ChartCard title="Kategori Trendi (12 ay)" subtitle={`${year} — En çok ${type === 'expense' ? 'harcanan' : 'gelir getiren'} 6 kategori`} icon="trending" Icon={Icon}>
        <CategoryTrendChart categoryData={allMonthsByCategory} topCategories={topCategories} />
      </ChartCard>
    </div>
  )
}
