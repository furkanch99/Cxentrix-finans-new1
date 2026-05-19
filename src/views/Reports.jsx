import React, { useState, useMemo } from 'react'
import { fmtTL, monthFull } from '../utils'
import { isFatihTransferTx } from '../fatihHelper'

export default function Reports({ data }) {
  const [year, setYear] = useState(new Date().getFullYear())

  // Yıl içindeki tüm işlemleri al ama Fatih transferlerini çıkar
  const yearTxs = useMemo(() =>
    data.transactions.filter(t => {
      if (new Date(t.date).getFullYear() !== year) return false
      if (isFatihTransferTx(t)) return false
      return true
    }), [data.transactions, year])

  const monthly = useMemo(() => {
    const arr = Array.from({length: 12}, (_,i) => ({ month: i, inc: 0, exp: 0 }))
    yearTxs.forEach(t => {
      const m = new Date(t.date).getMonth()
      arr[m][t.type === 'income' ? 'inc' : 'exp'] += t.amount
    })
    return arr
  }, [yearTxs])

  const total = monthly.reduce((a,m) => ({ inc: a.inc+m.inc, exp: a.exp+m.exp }), { inc: 0, exp: 0 })
  const years = useMemo(() => { const ys = new Set(data.transactions.map(t => new Date(t.date).getFullYear())); ys.add(new Date().getFullYear()); return Array.from(ys).sort((a,b) => b-a) }, [data.transactions])

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '8px 14px', fontSize: 13, fontWeight: 500 }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
          Fatih Karakaş cari hesap hareketleri rapora dahil edilmemiştir
        </div>
      </div>
      <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)' }}>
        <h3 className="display" style={{ fontSize: 16, marginBottom: 16 }}>Aylık Kar/Zarar Tablosu — {year}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 90px', gap: 12, padding: '10px 0', borderBottom: '2px solid var(--accent)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>
          <div>Ay</div><div style={{ textAlign: 'right' }}>Gelir</div><div style={{ textAlign: 'right' }}>Gider</div><div style={{ textAlign: 'right' }}>Net</div><div style={{ textAlign: 'right' }}>Marj</div>
        </div>
        {monthly.map((m, i) => {
          const net = m.inc - m.exp
          const margin = m.inc > 0 ? (net / m.inc) * 100 : 0
          const empty = m.inc === 0 && m.exp === 0
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 90px', gap: 12, padding: '10px 0', borderBottom: i < 11 ? '1px solid var(--line-soft)' : 'none', alignItems: 'center', opacity: empty ? 0.4 : 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{monthFull(i)}</div>
              <div className="mono" style={{ textAlign: 'right', color: 'var(--green)', fontSize: 13 }}>{m.inc > 0 ? fmtTL(m.inc) : '—'}</div>
              <div className="mono" style={{ textAlign: 'right', color: 'var(--red)', fontSize: 13 }}>{m.exp > 0 ? fmtTL(m.exp) : '—'}</div>
              <div className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: net > 0 ? 'var(--green)' : net < 0 ? 'var(--red)' : 'var(--ink-muted)' }}>{empty ? '—' : `${net >= 0 ? '+' : ''}${fmtTL(net)}`}</div>
              <div className="mono" style={{ textAlign: 'right', fontSize: 12, color: 'var(--ink-muted)' }}>{empty || m.inc === 0 ? '—' : `%${margin.toFixed(1)}`}</div>
            </div>
          )
        })}
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 90px', gap: 12, padding: '14px 0 4px', borderTop: '2px solid var(--accent)', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Toplam</div>
          <div className="mono" style={{ textAlign: 'right', color: 'var(--green)', fontSize: 14, fontWeight: 700 }}>{fmtTL(total.inc)}</div>
          <div className="mono" style={{ textAlign: 'right', color: 'var(--red)', fontSize: 14, fontWeight: 700 }}>{fmtTL(total.exp)}</div>
          <div className="mono" style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: total.inc-total.exp >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtTL(total.inc - total.exp)}</div>
          <div className="mono" style={{ textAlign: 'right', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>{total.inc > 0 ? `%${((total.inc-total.exp)/total.inc*100).toFixed(1)}` : '—'}</div>
        </div>
      </div>
    </div>
  )
}
