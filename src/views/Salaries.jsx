import React, { useState, useMemo } from 'react'
import { Icon, fmtTL, monthFull } from '../utils'
import { KPICard } from '../charts'
import EmptyState from '../EmptyState'

// =====================================================================
// Maaşlar — Cxentrix çalışanlarının (Fatih ve Tuğba HARİÇ) aylık
// maaş ödemelerinin ay-bazlı görüntüsü.
//
// Filtre kuralı:
//   1. type = expense
//   2. açıklamada "maaş" geçmeli (Multinet, prim, vs. dışarıda)
//   3. açıklamada aşağıdaki adlardan biri geçmeli
// =====================================================================

const EMPLOYEES = [
  'Furkan', 'Onur', 'Arif', 'Nebhen',
  'Erdinç', 'Gökşin', 'Ali', 'Şaban',
]

// Türkçe karakterleri sadeleştirip eşleştirme için normalize.
function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/ş/g, 's').replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ğ/g, 'g').replace(/ç/g, 'c')
    .replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
}

const NORMALIZED_EMPLOYEES = EMPLOYEES.map(e => ({ name: e, norm: normalize(e) }))

// Açıklamadan çalışan adı tespit et — açıklamada hem "maaş"
// hem de listedeki bir ad olmalı.
function detectEmployee(description) {
  const norm = normalize(description)
  if (!norm.includes('maas')) return null
  for (const e of NORMALIZED_EMPLOYEES) {
    if (norm.includes(e.norm)) return e.name
  }
  return null
}

// Tahakkuk mantığı: ödeme tarihinden 1 ay öncesini "hakediş ayı" olarak
// kabul et. Şubat 1'de yapılan ödeme Ocak'ın maaşıdır.
function accrualMonthFor(dateStr) {
  const d = new Date(dateStr)
  let m = d.getMonth() - 1
  let y = d.getFullYear()
  if (m < 0) {
    m = 11
    y -= 1
  }
  return { year: y, month: m }
}

// Renk paleti — kişilere stabil renk atayalım (hash-based).
const PALETTE = [
  { bg: 'rgba(99, 102, 241, 0.14)', fg: '#6366f1' },
  { bg: 'rgba(16, 185, 129, 0.14)', fg: '#059669' },
  { bg: 'rgba(245, 158, 11, 0.16)', fg: '#d97706' },
  { bg: 'rgba(239, 68, 68, 0.14)',  fg: '#dc2626' },
  { bg: 'rgba(168, 85, 247, 0.14)', fg: '#9333ea' },
  { bg: 'rgba(14, 165, 233, 0.14)', fg: '#0284c7' },
  { bg: 'rgba(236, 72, 153, 0.14)', fg: '#db2777' },
  { bg: 'rgba(20, 184, 166, 0.14)', fg: '#0d9488' },
]
function colorFor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export default function Salaries({ data }) {
  const [year, setYear] = useState(new Date().getFullYear())

  // Ay/yıl filtresi — accrual mantığıyla: ödeme tarihi - 1 ay = hakediş ayı
  const filtered = useMemo(() => {
    const list = []
    data.transactions.forEach(t => {
      if (t.type !== 'expense') return
      const emp = detectEmployee(t.description)
      if (!emp) return
      const d = new Date(t.date)
      if (isNaN(d.getFullYear())) return
      const acc = accrualMonthFor(t.date)
      if (year !== 'all' && acc.year !== year) return
      list.push({
        id: t.id,
        employee: emp,
        date: t.date,
        // accrualMonth/accrualYear: kayıtın AİT olduğu hakediş dönemi
        month: acc.month,
        year: acc.year,
        amount: Number(t.amount) || 0,
        paymentType: t.paymentType || '',
        description: t.description || '',
      })
    })
    return list.sort((a, b) => b.date.localeCompare(a.date))
  }, [data.transactions, year])

  const availableYears = useMemo(() => {
    const ys = new Set()
    data.transactions.forEach(t => {
      if (t.type !== 'expense') return
      if (!detectEmployee(t.description)) return
      const acc = accrualMonthFor(t.date)
      ys.add(acc.year)
    })
    ys.add(new Date().getFullYear())
    return Array.from(ys).sort((a, b) => b - a)
  }, [data.transactions])

  // Ay'a göre grupla — newest first
  const byMonth = useMemo(() => {
    const map = new Map()
    filtered.forEach(r => {
      const key = `${r.year}-${String(r.month).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, { year: r.year, month: r.month, records: [], total: 0 })
      const g = map.get(key)
      g.records.push(r)
      g.total += r.amount
    })
    // Her ayın içinde isme göre sırala (alfabetik, sabit sıra)
    map.forEach(g => g.records.sort((a, b) => a.employee.localeCompare(b.employee, 'tr')))
    return Array.from(map.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year
      return b.month - a.month
    })
  }, [filtered])

  // Çalışan bazlı yıllık özet
  const byEmployee = useMemo(() => {
    const map = new Map()
    filtered.forEach(r => {
      if (!map.has(r.employee)) map.set(r.employee, { total: 0, count: 0 })
      const g = map.get(r.employee)
      g.total += r.amount
      g.count += 1
    })
    return EMPLOYEES.map(name => ({
      name,
      ...(map.get(name) || { total: 0, count: 0 }),
    })).filter(e => e.count > 0)
      .sort((a, b) => b.total - a.total)
  }, [filtered])

  const grandTotal = filtered.reduce((s, r) => s + r.amount, 0)
  const monthsCount = byMonth.length

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
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-muted)' }}>
          <strong style={{ color: 'var(--ink)' }}>{filtered.length}</strong> ödeme · <strong style={{ color: 'var(--ink)' }}>{byEmployee.length}</strong> çalışan · <strong style={{ color: 'var(--ink)' }}>{monthsCount}</strong> ay
        </div>
      </div>

      {/* KPI'lar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
        <KPICard label={`${year === 'all' ? 'Tüm yıllar' : year} Toplam Maaş`} value={fmtTL(grandTotal)} subtitle={`${filtered.length} ödeme`} icon="wallet" color="purple" big Icon={Icon} />
        <KPICard label="Aylık Ortalama" value={fmtTL(monthsCount > 0 ? grandTotal / monthsCount : 0)} subtitle={`${monthsCount} ay`} icon="trending" color="blue" big Icon={Icon} />
        <KPICard label="Çalışan Sayısı" value={String(byEmployee.length)} subtitle={`/ ${EMPLOYEES.length} listede`} icon="users" color="green" big Icon={Icon} />
      </div>

      {/* Çalışan bazlı yıllık özet (üstte küçük şerit) */}
      {byEmployee.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 10 }}>
            Çalışan Bazlı Toplam — {year === 'all' ? 'Tüm yıllar' : year}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {byEmployee.map(e => {
              const c = colorFor(e.name)
              return (
                <div key={e.name} style={{
                  background: c.bg, color: c.fg,
                  padding: '8px 12px', borderRadius: 10,
                  display: 'flex', alignItems: 'center', gap: 8,
                  minWidth: 150
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: c.fg, color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif"
                  }}>
                    {e.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{e.name}</div>
                    <div className="mono" style={{ fontSize: 11, opacity: 0.85 }}>{fmtTL(e.total)} · {e.count} ay</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Ay-bazlı liste */}
      {byMonth.length === 0 ? (
        <EmptyState
          icon="users"
          title="Bu dönem için maaş kaydı yok"
          subtitle="Yıl filtresini değiştir veya İşlemler ekranından maaş kayıtlarını gir."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {byMonth.map(m => (
            <div key={`${m.year}-${m.month}`} style={{
              background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden'
            }}>
              {/* Ay başlığı — hakediş ayı (ödeme genelde 1 ay sonra yapılır) */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 18px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--line)'
              }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {monthFull(m.month)} {m.year} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)', marginLeft: 6 }}>maaşı</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>
                    {m.records.length} kişiye ödendi
                  </div>
                </div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
                  {fmtTL(m.total)}
                </div>
              </div>

              {/* Çalışan ödemeleri */}
              <div style={{ padding: '8px 0' }}>
                {m.records.map(r => {
                  const c = colorFor(r.employee)
                  return (
                    <div key={r.id} style={{
                      display: 'grid', gridTemplateColumns: '32px 1fr 130px 140px 100px',
                      gap: 14, alignItems: 'center', padding: '10px 18px',
                      borderBottom: '1px solid var(--line-soft)'
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: c.fg, color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif"
                      }}>
                        {r.employee.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{r.employee}</div>
                        <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }} title={r.description}>
                          {r.description}
                        </div>
                      </div>
                      <div className="mono" style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
                        <div style={{ fontSize: 9, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 1 }}>Ödendi</div>
                        {new Date(r.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.paymentType}>
                        {r.paymentType || '—'}
                      </div>
                      <div className="mono" style={{ fontSize: 15, fontWeight: 700, textAlign: 'right', color: 'var(--ink)' }}>
                        {fmtTL(r.amount)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Genel toplam */}
          <div style={{
            background: 'var(--accent-soft)', border: '2px solid var(--accent)', borderRadius: 12,
            padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--accent)' }}>
                Genel Toplam — {year === 'all' ? 'Tüm yıllar' : year}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
                {filtered.length} ödeme · {monthsCount} ay · {byEmployee.length} çalışan
              </div>
            </div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>
              {fmtTL(grandTotal)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
