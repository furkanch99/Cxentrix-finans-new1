import React, { useState, useMemo } from 'react'
import { Icon, fmtTL, monthFull } from '../utils'
import { KPICard } from '../charts'
import { setPaymentStatus, bulkSetPaymentStatus } from '../dataService'
import { useToast } from '../Toast'

export default function PersonnelReport({ data, reload }) {
  const toast = useToast()
  const COMPANY_PAYMENT_KEYWORDS = [
    'kuveyttürk',
    'banka',
    'kart',
    'havale',
    'nakit',
    'çek',
    'diğer'
  ]

  const isCompanyPayment = (pt) => {
    const lower = (pt || '').toLowerCase()
    return COMPANY_PAYMENT_KEYWORDS.some(kw => lower.includes(kw))
  }

  const availableYears = useMemo(() => {
    const ys = new Set(
      data.transactions.map(t => new Date(t.date).getFullYear())
    )

    ys.add(new Date().getFullYear())

    return Array.from(ys).sort((a, b) => b - a)
  }, [data.transactions])

  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('all')
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [selectedTxIds, setSelectedTxIds] = useState(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [filterMode, setFilterMode] = useState('all')

  const paymentMap = useMemo(() => {
    const map = {}

    ;(data.paymentStatuses || []).forEach(ps => {
      map[ps.transaction_id] = ps
    })

    return map
  }, [data.paymentStatuses])

  // TÜM ZAMANLARDAKİ BEKLEYEN ÖDEMELER
  const globalPending = useMemo(() => {
    const allPersonalTxs = data.transactions.filter(t => {
      if (t.type !== 'expense') return false

      // ÖNCELİKLE category kontrol
      const cat = (t.category || '').toLowerCase()
      if (cat.includes('fatih') || cat.includes('french team'))
        return false

      if (isCompanyPayment(t.paymentType) || !t.paymentType)
        return false

      return true
    })

    const unpaid = allPersonalTxs.filter(
      t => !paymentMap[t.id]?.is_paid
    )

    const byPerson = {}

    unpaid.forEach(t => {
      byPerson[t.paymentType] =
        (byPerson[t.paymentType] || 0) + t.amount
    })

    const sorted = Object.entries(byPerson)
      .map(([name, total]) => ({
        name,
        total
      }))
      .sort((a, b) => b.total - a.total)

    return {
      total: unpaid.reduce((s, t) => s + t.amount, 0),
      count: unpaid.length,
      people: sorted,
      topPerson: sorted[0]
    }
  }, [data.transactions, paymentMap])

  // YIL / AY FİLTRELİ
  const yearTxs = useMemo(() => {
    return data.transactions.filter(t => {
      const d = new Date(t.date)
      if (d.getFullYear() !== year) return false
      if (t.type !== 'expense') return false

      // ÖNCELİKLE category kontrol
      const cat = (t.category || '').toLowerCase()
      if (cat.includes('fatih') || cat.includes('french team'))
        return false

      if (isCompanyPayment(t.paymentType) || !t.paymentType)
        return false

      if (month !== 'all' && d.getMonth() !== month)
        return false

      return true
    })
  }, [data.transactions, year, month])

  const personnel = useMemo(() => {
    const map = {}

    yearTxs.forEach(t => {
      if (!map[t.paymentType]) {
        map[t.paymentType] = {
          total: 0,
          count: 0,
          unpaidTotal: 0,
          paidTotal: 0,
          monthlyData: {}
        }
      }

      map[t.paymentType].total += t.amount
      map[t.paymentType].count += 1

      const m = new Date(t.date).getMonth()

      map[t.paymentType].monthlyData[m] =
        (map[t.paymentType].monthlyData[m] || 0) + t.amount

      const ps = paymentMap[t.id]

      if (ps && ps.is_paid) {
        map[t.paymentType].paidTotal += t.amount
      } else {
        map[t.paymentType].unpaidTotal += t.amount
      }
    })

    return Object.entries(map)
      .map(([name, v]) => ({
        name,
        ...v
      }))
      .sort((a, b) => b.unpaidTotal - a.unpaidTotal)
  }, [yearTxs, paymentMap])

  const grandTotal = personnel.reduce((s, p) => s + p.total, 0)
  const grandUnpaid = personnel.reduce((s, p) => s + p.unpaidTotal, 0)
  const grandPaid = personnel.reduce((s, p) => s + p.paidTotal, 0)
  const totalCount = personnel.reduce((s, p) => s + p.count, 0)

  const personTxs = useMemo(() => {
    if (!selectedPerson) return []

    let txs = yearTxs.filter(
      t => t.paymentType === selectedPerson
    )

    if (filterMode === 'unpaid') {
      txs = txs.filter(t => !paymentMap[t.id]?.is_paid)
    }

    if (filterMode === 'paid') {
      txs = txs.filter(t => paymentMap[t.id]?.is_paid)
    }

    return txs.sort((a, b) =>
      b.date.localeCompare(a.date)
    )
  }, [yearTxs, selectedPerson, filterMode, paymentMap])

  const handleTogglePaid = async (
    txId,
    currentlyPaid
  ) => {
    try {
      await setPaymentStatus(
        txId,
        !currentlyPaid,
        null,
        null
      )

      if (reload) await reload()
    } catch (err) {
      toast.error('Hata: ' + err.message)
    }
  }

  const handleBulkMark = async (markAsPaid) => {
    if (selectedTxIds.size === 0) {
      toast.error('Önce işlem seçin.')
      return
    }

    if (
      !confirm(
        `${selectedTxIds.size} işlemi ${
          markAsPaid ? 'ÖDENDİ' : 'ÖDENMEDİ'
        } olarak işaretlemek üzeresin. Onaylıyor musun?`
      )
    )
      return

    setBulkLoading(true)

    try {
      await bulkSetPaymentStatus(
        Array.from(selectedTxIds),
        markAsPaid,
        null
      )

      setSelectedTxIds(new Set())

      if (reload) await reload()
    } catch (err) {
      toast.error('Hata: ' + err.message)
    } finally {
      setBulkLoading(false)
    }
  }

  const toggleSelectTx = (txId) => {
    const newSet = new Set(selectedTxIds)

    if (newSet.has(txId)) {
      newSet.delete(txId)
    } else {
      newSet.add(txId)
    }

    setSelectedTxIds(newSet)
  }

  const periodLabel = month === 'all' ? `${year}` : `${monthFull(month)} ${year}`

  return (
    <div className="fade-in">
      {/* Filtre bar */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>Yıl</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '7px 12px', fontSize: 13, fontWeight: 500 }}>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ width: 1, height: 24, background: 'var(--line)' }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>Ay</span>
          <select value={month} onChange={e => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))} style={{ padding: '7px 12px', fontSize: 13, fontWeight: 500 }}>
            <option value="all">Tüm yıl</option>
            {Array.from({length: 12}, (_, i) => (
              <option key={i} value={i}>{monthFull(i)}</option>
            ))}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-muted)' }}>
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{periodLabel}</span> — {personnel.length} ödeyen · {totalCount} işlem
        </div>
      </div>

      {/* Tüm-zamanlar bekleyen borç banner */}
      {globalPending.total > 0 && (
        <div style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.10), rgba(239, 68, 68, 0.02))', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: 12, padding: 16, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.18)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="arrowUp" size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--red)', fontWeight: 700 }}>Tüm Zamanlar — Açık Borç</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--red)' }}>{fmtTL(globalPending.total)}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
              {globalPending.count} ödenmemiş işlem
              {globalPending.topPerson && <> · en yüksek <strong style={{ color: 'var(--ink)' }}>{globalPending.topPerson.name}</strong> ({fmtTL(globalPending.topPerson.total)})</>}
            </div>
          </div>
        </div>
      )}

      {/* KPI kartları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KPICard label={`${periodLabel} Toplam Ödeme`} value={fmtTL(grandTotal)} subtitle={`${totalCount} işlem`} icon="wallet" color="purple" big Icon={Icon} />
        <KPICard label={`${periodLabel} Açık Borç`} value={fmtTL(grandUnpaid)} subtitle="Henüz ödenmedi" icon="arrowUp" color="red" big Icon={Icon} />
        <KPICard label={`${periodLabel} Ödenmiş`} value={fmtTL(grandPaid)} subtitle="Tamamlandı" icon="trending" color="green" big Icon={Icon} />
        <KPICard label="Ödeyen Kişi" value={personnel.length.toString()} icon="users" color="blue" big Icon={Icon} />
      </div>

      {personnel.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>
          <Icon name="users" size={28} />
          <div style={{ marginTop: 12, fontSize: 13 }}>{periodLabel} için kayıt yok.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: 18, alignItems: 'start' }}>
          {/* Sol: ödeyenler listesi */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
            <div style={{ padding: '4px 8px 10px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700 }}>Ödeyenler</div>
            {personnel.map(p => {
              const active = selectedPerson === p.name
              const pct = p.total > 0 ? (p.unpaidTotal / p.total) * 100 : 0
              return (
                <button
                  key={p.name}
                  onClick={() => { setSelectedPerson(p.name); setSelectedTxIds(new Set()); setFilterMode('all') }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 9,
                    background: active ? 'var(--accent-soft)' : 'transparent',
                    border: active ? '1px solid var(--accent)' : '1px solid transparent',
                    marginBottom: 4, cursor: 'pointer', transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{p.name}</div>
                    <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{fmtTL(p.total)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
                    <span>{p.count} işlem</span>
                    <span style={{ color: 'var(--red)' }}>Açık: {fmtTL(p.unpaidTotal)}</span>
                    <span style={{ color: 'var(--green)' }}>Ödenmiş: {fmtTL(p.paidTotal)}</span>
                  </div>
                  <div style={{ marginTop: 6, height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${100 - pct}%`, height: '100%', background: 'var(--green)' }}/>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Sağ: detay panel */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16, minHeight: 200 }}>
            {!selectedPerson ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
                Detayı görmek için soldan bir kişi seç.
              </div>
            ) : (
              <PersonDetail
                person={selectedPerson}
                personnel={personnel}
                personTxs={personTxs}
                paymentMap={paymentMap}
                filterMode={filterMode}
                setFilterMode={setFilterMode}
                selectedTxIds={selectedTxIds}
                toggleSelectTx={toggleSelectTx}
                handleTogglePaid={handleTogglePaid}
                handleBulkMark={handleBulkMark}
                bulkLoading={bulkLoading}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PersonDetail({ person, personnel, personTxs, paymentMap, filterMode, setFilterMode, selectedTxIds, toggleSelectTx, handleTogglePaid, handleBulkMark, bulkLoading }) {
  const p = personnel.find(x => x.name === person)
  if (!p) return null

  const allIds = personTxs.map(t => t.id)
  const allSelected = allIds.length > 0 && allIds.every(id => selectedTxIds.has(id))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>Ödeyen</div>
          <h3 className="display" style={{ fontSize: 18, marginTop: 2 }}>{person}</h3>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, background: 'var(--bg-input)', border: '1px solid var(--line)', borderRadius: 8, padding: 3 }}>
          {[['all', `Tümü (${p.count})`], ['unpaid', 'Açık'], ['paid', 'Ödenmiş']].map(([k, label]) => (
            <button key={k} onClick={() => setFilterMode(k)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: filterMode === k ? 'var(--accent)' : 'transparent',
              color: filterMode === k ? 'white' : 'var(--ink-muted)',
              border: 'none', cursor: 'pointer'
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
        <Stat label="Dönem Toplam" value={fmtTL(p.total)} color="var(--ink)"/>
        <Stat label="Açık Borç" value={fmtTL(p.unpaidTotal)} color="var(--red)"/>
        <Stat label="Ödenmiş" value={fmtTL(p.paidTotal)} color="var(--green)"/>
      </div>

      {/* Toplu işaretleme */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => {
              if (allSelected) {
                // hepsini bırak
                allIds.forEach(id => { if (selectedTxIds.has(id)) toggleSelectTx(id) })
              } else {
                allIds.forEach(id => { if (!selectedTxIds.has(id)) toggleSelectTx(id) })
              }
            }}
          />
          Tümünü seç
        </label>
        <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{selectedTxIds.size} seçili</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => handleBulkMark(true)} disabled={bulkLoading || selectedTxIds.size === 0} style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--green)', color: 'white', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: (bulkLoading || selectedTxIds.size === 0) ? 0.4 : 1 }}>
            {bulkLoading ? '...' : 'Seçilenleri ÖDENDİ Yap'}
          </button>
          <button onClick={() => handleBulkMark(false)} disabled={bulkLoading || selectedTxIds.size === 0} style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--bg-input)', color: 'var(--ink)', border: '1px solid var(--line)', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: (bulkLoading || selectedTxIds.size === 0) ? 0.4 : 1 }}>
            ÖDENMEDİ Yap
          </button>
        </div>
      </div>

      {/* İşlem listesi */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 720 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '32px 90px 1fr 140px 110px 130px', gap: 8, padding: '8px 10px', background: 'var(--gradient-1)', color: 'white', borderRadius: 8, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>
            <div></div>
            <div>Tarih</div>
            <div>Açıklama</div>
            <div>Kategori</div>
            <div style={{ textAlign: 'right' }}>Tutar</div>
            <div style={{ textAlign: 'center' }}>Durum</div>
          </div>

          {personTxs.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 12 }}>
              Bu filtrede işlem yok.
            </div>
          ) : (
            personTxs.map((t, i) => {
              const ps = paymentMap[t.id]
              const isPaid = !!ps?.is_paid
              const checked = selectedTxIds.has(t.id)
              return (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '32px 90px 1fr 140px 110px 130px', gap: 8, padding: '10px 10px', background: i % 2 === 0 ? 'var(--bg-elevated)' : 'transparent', borderRadius: 6, alignItems: 'center', borderLeft: isPaid ? '3px solid var(--green)' : '3px solid var(--red)' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleSelectTx(t.id)} />
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    {new Date(t.date).toLocaleDateString('tr-TR')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.description}>
                    {t.description || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{t.category}</div>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{fmtTL(t.amount)}</div>
                  <div style={{ textAlign: 'center' }}>
                    <button onClick={() => handleTogglePaid(t.id, isPaid)} style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                      background: isPaid ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: isPaid ? 'var(--green)' : 'var(--red)',
                      border: `1px solid ${isPaid ? 'var(--green)' : 'var(--red)'}`,
                      cursor: 'pointer'
                    }}>
                      {isPaid ? '✓ ÖDENDİ' : '✗ AÇIK'}
                    </button>
                    {isPaid && ps?.paid_date && (
                      <div style={{ fontSize: 9, color: 'var(--ink-muted)', marginTop: 2 }}>
                        {new Date(ps.paid_date).toLocaleDateString('tr-TR')}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700 }}>{label}</div>
      <div className="mono" style={{ fontSize: 15, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}
