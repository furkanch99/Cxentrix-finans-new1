import React, { useState, useEffect, useMemo } from 'react'
import { Icon, fmtTL, monthFull, FALLBACK_RATE } from '../utils'
import { fmtCHF } from '../CurrencyContext'
import { fetchFatihSalaries, fetchTugbaSalaries } from '../dataService'
import { KPICard } from '../charts'
import EmptyState from '../EmptyState'

// =====================================================================
// Maaşlar — tüm çalışanlara ödenen maaşların tek noktadan görüntülenmesi
//
// Kaynaklar:
//   1. fatih_monthly_salaries → Fatih Karakaş'ın aylık tahakkukları
//   2. tugba_monthly_salaries → Tuğba Karakaş'ın aylık ödemeleri
//   3. transactions (kategori "Çalışan Giderleri") → diğer çalışan
//      maaşları (Furkan, Gökşin, Şaban, Onur vs.) — açıklamadan ad
//      ayıklanır
// =====================================================================

// Açıklamadan çalışan adı çıkar (heuristik):
//   "2025 Aralık ayı maaş Gökşin"  → "Gökşin"
//   "Aralık 2025 Fatih Karakaş Maaş" → "Fatih Karakaş"
//   Bulamazsa açıklamanın kendisini döner.
function extractEmployee(description) {
  const desc = String(description || '').trim()
  if (!desc) return 'Diğer'
  // "maaş NAME" veya "maas NAME" → son kelime
  const matchAfter = desc.match(/maa[sş]\s+([A-ZÇĞİÖŞÜa-zçğıöşü\s]+?)\s*$/i)
  if (matchAfter && matchAfter[1]) {
    return matchAfter[1].trim()
  }
  // Tek kelime olabilir
  return desc.split(/\s+/).slice(-2).join(' ').trim() || desc
}

export default function Salaries({ data }) {
  const [fatihSalaries, setFatihSalaries] = useState([])
  const [tugbaSalaries, setTugbaSalaries] = useState([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [fatih, tugba] = await Promise.all([
        fetchFatihSalaries().catch(() => []),
        fetchTugbaSalaries().catch(() => []),
      ])
      setFatihSalaries(fatih || [])
      setTugbaSalaries(tugba || [])
    } finally {
      setLoading(false)
    }
  }

  const availableYears = useMemo(() => {
    const ys = new Set()
    fatihSalaries.forEach(s => { if (s.year != null) ys.add(s.year) })
    tugbaSalaries.forEach(s => { if (s.year != null) ys.add(s.year) })
    data.transactions.forEach(t => {
      const y = new Date(t.date).getFullYear()
      if (!isNaN(y)) ys.add(y)
    })
    ys.add(new Date().getFullYear())
    return Array.from(ys).sort((a, b) => b - a)
  }, [fatihSalaries, tugbaSalaries, data.transactions])

  // Tüm maaş kayıtlarını ortak bir şekle dönüştür
  const allRecords = useMemo(() => {
    const recs = []

    // Fatih
    fatihSalaries.forEach(s => {
      recs.push({
        id: 'f-' + s.id,
        employee: 'Fatih Karakaş',
        kind: 'fatih',
        year: s.year,
        month: s.month,
        date: `${s.year}-${String(s.month + 1).padStart(2, '0')}-01`,
        amount_try: Number(s.amount_try) || 0,
        amount_chf: Number(s.amount_chf) || 0,
        rate: Number(s.chf_to_try_rate) || FALLBACK_RATE,
        type: 'Tahakkuk',
        source: 'Maaş tahakkuk',
      })
    })

    // Tuğba
    tugbaSalaries.forEach(s => {
      recs.push({
        id: 't-' + s.id,
        employee: 'Tuğba Karakaş',
        kind: 'tugba',
        year: s.year,
        month: s.month,
        date: `${s.year}-${String(s.month + 1).padStart(2, '0')}-01`,
        amount_try: Number(s.amount_try) || 0,
        amount_chf: Number(s.amount_chf) || 0,
        rate: Number(s.chf_to_try_rate) || FALLBACK_RATE,
        type: 'Tahakkuk',
        source: 'Tuğba maaş kaydı',
        notes: s.notes || '',
      })
    })

    // Çalışan Giderleri kategorisindeki transaction'lar
    data.transactions.forEach(t => {
      const cat = String(t.category || '').toLowerCase()
      if (!cat.includes('çalışan') && !cat.includes('calisan')) return
      const d = new Date(t.date)
      if (isNaN(d.getFullYear())) return
      const emp = extractEmployee(t.description)
      recs.push({
        id: 'x-' + t.id,
        employee: emp,
        kind: 'employee',
        year: d.getFullYear(),
        month: d.getMonth(),
        date: t.date,
        amount_try: Number(t.amount) || 0,
        amount_chf: Number(t.amount) / FALLBACK_RATE,
        rate: FALLBACK_RATE,
        type: t.paymentType || 'Banka',
        source: t.description || t.category,
        rawDescription: t.description,
      })
    })

    return recs
  }, [fatihSalaries, tugbaSalaries, data.transactions])

  // Filtre uygula
  const filtered = useMemo(() => {
    return allRecords.filter(r => {
      if (year !== 'all' && r.year !== year) return false
      if (month !== 'all' && r.month !== month) return false
      if (search) {
        const s = search.toLowerCase()
        if (!r.employee.toLowerCase().includes(s) &&
            !(r.source || '').toLowerCase().includes(s)) return false
      }
      return true
    }).sort((a, b) => b.date.localeCompare(a.date))
  }, [allRecords, year, month, search])

  // Çalışana göre grupla
  const groupedByEmployee = useMemo(() => {
    const map = new Map()
    filtered.forEach(r => {
      if (!map.has(r.employee)) map.set(r.employee, { total: 0, count: 0, records: [] })
      const g = map.get(r.employee)
      g.total += r.amount_try
      g.count += 1
      g.records.push(r)
    })
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [filtered])

  const grandTotal = filtered.reduce((s, r) => s + r.amount_try, 0)
  const periodLabel = month === 'all' ? `${year}` : `${monthFull(month)} ${year}`

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>
        <div className="spinner" style={{ width: 30, height: 30, border: '3px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%', margin: '0 auto 12px' }}/>
        Maaş verileri yükleniyor...
      </div>
    )
  }

  return (
    <div className="fade-in">
      {/* Filtre bar */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12,
        padding: 12, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700 }}>Yıl</span>
          <select value={year} onChange={e => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            style={{ padding: '7px 10px', fontSize: 12, fontWeight: 600 }}>
            <option value="all">Tümü</option>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700 }}>Ay</span>
          <select value={month} onChange={e => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            style={{ padding: '7px 10px', fontSize: 12, fontWeight: 600 }}>
            <option value="all">Tüm yıl</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i}>{monthFull(i)}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, position: 'relative', minWidth: 180 }}>
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }}>
            <Icon name="search" size={14}/>
          </div>
          <input placeholder="İsim veya açıklama ile ara..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 14px 9px 38px', fontSize: 13 }}/>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
          <strong style={{ color: 'var(--ink)' }}>{filtered.length}</strong> kayıt
        </div>
      </div>

      {/* KPI kartları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        <KPICard label={`${periodLabel} Toplam`} value={fmtTL(grandTotal)} subtitle={`${filtered.length} kayıt`} icon="wallet" color="purple" big Icon={Icon} />
        <KPICard label="Çalışan Sayısı" value={String(groupedByEmployee.length)} icon="users" color="blue" big Icon={Icon} />
        <KPICard label="Ortalama Maaş" value={fmtTL(groupedByEmployee.length > 0 ? grandTotal / groupedByEmployee.length : 0)} icon="trending" color="green" big Icon={Icon} />
        <KPICard label="Toplam CHF" value={fmtCHF(grandTotal / FALLBACK_RATE)} icon="spark" gradient big Icon={Icon} />
      </div>

      {/* Çalışana göre gruplandırılmış liste */}
      {groupedByEmployee.length === 0 ? (
        <EmptyState
          icon="users"
          title="Bu dönem için maaş kaydı yok"
          subtitle="Yıl/ay filtresini değiştir veya Fatih hesabı sekmesinden yeni maaş ekle."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groupedByEmployee.map(g => {
            const isOpen = expanded === g.name
            const pct = grandTotal > 0 ? (g.total / grandTotal) * 100 : 0
            return (
              <div key={g.name} style={{
                background: 'var(--bg-card)', border: '1px solid ' + (isOpen ? 'var(--accent)' : 'var(--line)'),
                borderRadius: 12, overflow: 'hidden', transition: 'border 0.2s'
              }}>
                <button onClick={() => setExpanded(isOpen ? null : g.name)}
                  style={{
                    width: '100%', padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer',
                    display: 'grid', gridTemplateColumns: '36px 1fr 130px 130px 30px', gap: 14, alignItems: 'center', textAlign: 'left'
                  }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'var(--gradient-1)', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif"
                  }}>
                    {(g.name.split(' ').map(w => w[0]).join('') || '?').toUpperCase().slice(0, 2)}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                      {g.count} kayıt · %{pct.toFixed(1)}
                    </div>
                    <div style={{ marginTop: 5, height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: 'var(--gradient-1)' }}/>
                    </div>
                  </div>
                  <div className="mono" style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{fmtTL(g.total)}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{fmtCHF(g.total / FALLBACK_RATE)}</div>
                  </div>
                  <div className="mono" style={{ textAlign: 'right', fontSize: 11, color: 'var(--ink-muted)' }}>
                    En son<br/>
                    <span style={{ fontWeight: 600, color: 'var(--ink-soft)' }}>
                      {new Date(g.records[0].date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <div style={{ color: 'var(--ink-muted)', textAlign: 'center' }}>
                    <Icon name={isOpen ? 'arrowUp' : 'arrowDown'} size={14}/>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--line)', background: 'var(--bg-elevated)', padding: '8px 18px 14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 100px 130px 130px', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700 }}>
                      <div>Tarih</div>
                      <div>Açıklama</div>
                      <div>Tip</div>
                      <div style={{ textAlign: 'right' }}>TL</div>
                      <div style={{ textAlign: 'right' }}>CHF</div>
                    </div>
                    {g.records.map(r => (
                      <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 100px 130px 130px', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line-soft)', alignItems: 'center', fontSize: 12 }}>
                        <div className="mono" style={{ color: 'var(--ink-muted)' }}>
                          {new Date(r.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.source}>
                          {r.source}
                          {r.notes && <div style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{r.notes}</div>}
                        </div>
                        <div>
                          <span style={{
                            background: r.kind === 'fatih' ? 'var(--green-soft)' : r.kind === 'tugba' ? 'rgba(244, 63, 94, 0.15)' : 'var(--accent-soft)',
                            color: r.kind === 'fatih' ? 'var(--green)' : r.kind === 'tugba' ? '#e11d48' : 'var(--accent)',
                            padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700
                          }}>{r.type}</span>
                        </div>
                        <div className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTL(r.amount_try)}</div>
                        <div className="mono" style={{ textAlign: 'right', color: 'var(--ink-muted)' }}>{fmtCHF(r.amount_chf)}</div>
                      </div>
                    ))}
                    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 100px 130px 130px', gap: 12, padding: '12px 0 4px', borderTop: '2px solid var(--accent)', alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
                      <div style={{ color: 'var(--accent)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Toplam</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontWeight: 400 }}>{g.count} kayıt</div>
                      <div></div>
                      <div className="mono" style={{ textAlign: 'right' }}>{fmtTL(g.total)}</div>
                      <div className="mono" style={{ textAlign: 'right', color: 'var(--ink-muted)' }}>{fmtCHF(g.total / FALLBACK_RATE)}</div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Genel toplam */}
          <div style={{
            background: 'var(--accent-soft)', border: '2px solid var(--accent)', borderRadius: 12,
            padding: '14px 18px', marginTop: 4,
            display: 'grid', gridTemplateColumns: '36px 1fr 130px 130px 30px', gap: 14, alignItems: 'center'
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 6, background: 'var(--accent)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Icon name="wallet" size={16}/>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Genel Toplam — {periodLabel}
            </div>
            <div className="mono" style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{fmtTL(grandTotal)}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{fmtCHF(grandTotal / FALLBACK_RATE)}</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', textAlign: 'right' }}>{filtered.length} kayıt</div>
            <div/>
          </div>
        </div>
      )}
    </div>
  )
}
