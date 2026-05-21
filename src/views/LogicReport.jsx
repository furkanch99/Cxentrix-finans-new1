import React, { useState, useEffect, useMemo } from 'react'
import { Icon, fmtTL, monthName, monthFull } from '../utils'
import { fetchLogicReports, upsertLogicReport } from '../dataService'
import { useCurrency, fmtCHF } from '../CurrencyContext'
import { KPICard } from '../charts'
import { useToast } from '../Toast'

export default function LogicReport({ data }) {
  const toast = useToast()
  const { getRateAt, latestRate } = useCurrency()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReports()
  }, [])

  const loadReports = async () => {
    setLoading(true)
    try {
      const data = await fetchLogicReports()
      setReports(data)
    } catch (err) {
      console.error('Hata:', err)
    } finally {
      setLoading(false)
    }
  }

  // Seçili ayın işlemleri
  const monthTxs = useMemo(() => {
    return data.transactions.filter(t => {
      if (t.type !== 'expense') return false
      const d = new Date(t.date)
      return d.getFullYear() === year && d.getMonth() === month
    })
  }, [data.transactions, year, month])

  // Kategori bazlı toplam
  const byCategory = useMemo(() => {
    const map = {}
    monthTxs.forEach(t => {
      if (!map[t.category]) map[t.category] = { total: 0, count: 0, items: [] }
      map[t.category].total += t.amount
      map[t.category].count += 1
      map[t.category].items.push(t)
    })
    return Object.entries(map).map(([n,v]) => ({ name: n, ...v })).sort((a,b) => b.total - a.total)
  }, [monthTxs])

  const totalTry = monthTxs.reduce((s,t) => s + t.amount, 0)
  const monthEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10)
  const monthEndRate = getRateAt(monthEnd)
  const totalChf = totalTry / monthEndRate

  // Durum
  const currentReport = useMemo(() => {
    return reports.find(r => r.year === year && r.month === month)
  }, [reports, year, month])

  const availableYears = useMemo(() => {
    const ys = new Set(data.transactions.map(t => new Date(t.date).getFullYear()))
    ys.add(new Date().getFullYear())
    return Array.from(ys).sort((a,b) => b-a)
  }, [data.transactions])

  const updateStatus = async (newStatus) => {
    try {
      await upsertLogicReport(year, month, newStatus, totalTry, totalChf)
      await loadReports()
      toast.success('Rapor durumu güncellendi')
    } catch (err) {
      toast.error('Hata: ' + err.message)
    }
  }

  const statusConfig = {
    pending: { label: 'Bekliyor', color: 'var(--amber)', bg: 'var(--amber-soft)' },
    sent: { label: 'Gönderildi', color: 'var(--blue)', bg: 'var(--blue-soft)' },
    paid: { label: 'Ödendi', color: 'var(--green)', bg: 'var(--green-soft)' },
  }

  const currentStatus = currentReport?.status || 'pending'
  const stat = statusConfig[currentStatus]

  return (
    <div>
      {/* Filtre */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>Yıl</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '7px 12px', fontSize: 13, fontWeight: 500 }}>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ width: 1, height: 24, background: 'var(--line)' }}></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>Ay</span>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ padding: '7px 12px', fontSize: 13, fontWeight: 500, minWidth: 130 }}>
            {Array.from({length:12}, (_,i) => <option key={i} value={i}>{monthFull(i)}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => {
            if (month === 0) { setMonth(11); setYear(year-1) } else setMonth(month-1)
          }} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--bg-card)' }}><Icon name="arrowLeft" size={14}/></button>
          <button onClick={() => {
            if (month === 11) { setMonth(0); setYear(year+1) } else setMonth(month+1)
          }} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--bg-card)' }}><Icon name="arrowRight" size={14}/></button>
        </div>
      </div>

      {/* Bilgi kartı */}
      <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 12, padding: '12px 16px', marginBottom: 18, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 700 }}>L</div>
        <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.5 }}>
          <strong>Logic Holding Aylık Maliyet Raporu:</strong> Bu sayfada her ay için Cxentrix'in toplam giderleri özetlenir. Logic Holding tüm masrafları karşıladığı için bu rapordaki toplam, Logic'in o ay için Cxentrix'e ödemesi gereken miktardır.
        </div>
      </div>

      {/* Üst KPI - Büyük gösterge */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div className="glow-card" style={{
          background: 'var(--gradient-1)',
          color: 'white', borderRadius: 14, padding: '24px 28px',
          position: 'relative', overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(99, 102, 241, 0.25)'
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)' }}></div>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.9, fontWeight: 600, marginBottom: 12 }}>
              {monthFull(month)} {year} — Logic'in Ödemesi Gereken
            </div>
            <div className="mono" style={{ fontSize: 32, fontWeight: 700, marginBottom: 6, letterSpacing: '-0.02em' }}>{fmtCHF(totalChf)}</div>
            <div className="mono" style={{ fontSize: 16, opacity: 0.9 }}>≈ {fmtTL(totalTry)}</div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8 }}>
              {monthTxs.length} işlem · Kur: 1 CHF = {monthEndRate.toFixed(2)} TL
            </div>
          </div>
        </div>

        <KPICard label="Toplam İşlem" value={monthTxs.length.toString()} subtitle="bu ay kayıtlı gider" icon="list" color="blue" big Icon={Icon} />

        <div style={{
          background: stat.bg,
          color: stat.color,
          border: `1px solid ${stat.color}`,
          borderRadius: 14, padding: '20px 22px',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.8, fontWeight: 600, marginBottom: 8 }}>Durum</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{stat.label}</div>
            {currentReport?.sent_at && (
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>Gönderim: {new Date(currentReport.sent_at).toLocaleDateString('tr-TR')}</div>
            )}
            {currentReport?.paid_at && (
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>Ödeme: {new Date(currentReport.paid_at).toLocaleDateString('tr-TR')}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={() => updateStatus('pending')} style={{ flex: '1 0 auto', padding: '5px 8px', borderRadius: 5, fontSize: 10, background: currentStatus === 'pending' ? stat.color : 'transparent', color: currentStatus === 'pending' ? 'white' : stat.color, border: `1px solid ${stat.color}`, fontWeight: 600 }}>Beklemede</button>
            <button onClick={() => updateStatus('sent')} style={{ flex: '1 0 auto', padding: '5px 8px', borderRadius: 5, fontSize: 10, background: currentStatus === 'sent' ? 'var(--blue)' : 'transparent', color: currentStatus === 'sent' ? 'white' : 'var(--blue)', border: '1px solid var(--blue)', fontWeight: 600 }}>Gönderildi</button>
            <button onClick={() => updateStatus('paid')} style={{ flex: '1 0 auto', padding: '5px 8px', borderRadius: 5, fontSize: 10, background: currentStatus === 'paid' ? 'var(--green)' : 'transparent', color: currentStatus === 'paid' ? 'white' : 'var(--green)', border: '1px solid var(--green)', fontWeight: 600 }}>Ödendi</button>
          </div>
        </div>
      </div>

      {/* Kategori bazlı kırılım */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)', marginBottom: 14 }}>
        <h3 className="display" style={{ fontSize: 15, marginBottom: 14 }}>Kategori Bazlı Kırılım</h3>
        {byCategory.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>Bu ay için kayıtlı gider yok.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 1fr', gap: 12, padding: '10px 0', borderBottom: '2px solid var(--accent)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>
              <div>Kategori</div>
              <div style={{ textAlign: 'right' }}>İşlem</div>
              <div style={{ textAlign: 'right' }}>TL</div>
              <div style={{ textAlign: 'right' }}>CHF</div>
            </div>
            {byCategory.map((c, i) => (
              <div key={c.name} style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 1fr 1fr', gap: 12,
                padding: '12px 0', borderBottom: i < byCategory.length-1 ? '1px solid var(--line-soft)' : 'none',
                alignItems: 'center'
              }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: 12, color: 'var(--ink-muted)' }}>{c.count}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: 13, color: 'var(--red)' }}>{fmtTL(c.total)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{fmtCHF(c.total / monthEndRate)}</div>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 1fr', gap: 12, padding: '14px 0 4px', borderTop: '2px solid var(--accent)', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>TOPLAM</div>
              <div className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{monthTxs.length}</div>
              <div className="mono" style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>{fmtTL(totalTry)}</div>
              <div className="mono" style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{fmtCHF(totalChf)}</div>
            </div>
          </>
        )}
      </div>

      {/* Geçmiş raporlar listesi */}
      {reports.length > 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)' }}>
          <h3 className="display" style={{ fontSize: 15, marginBottom: 14 }}>Geçmiş Raporlar</h3>
          {reports.map(r => {
            const s = statusConfig[r.status]
            return (
              <div key={r.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px', gap: 12,
                padding: '12px 0', borderBottom: '1px solid var(--line-soft)',
                alignItems: 'center', cursor: 'pointer'
              }} onClick={() => { setYear(r.year); setMonth(r.month) }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{monthFull(r.month)} {r.year}</div>
                <div>
                  <span style={{ background: s.bg, color: s.color, padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600 }}>{s.label}</span>
                </div>
                <div className="mono" style={{ fontSize: 13, color: 'var(--red)' }}>{fmtTL(parseFloat(r.total_try || 0))}</div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', textAlign: 'right' }}>{fmtCHF(parseFloat(r.total_chf || 0))}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
