import React, { useState, useEffect, useMemo } from 'react'
import { Icon, fmtTL, monthName, monthFull } from '../utils'
import { useCurrency, fmtCHF, FALLBACK_RATE } from '../CurrencyContext'
import { fetchCommissions, addCommission, updateCommission, deleteCommission, getRateForDate } from '../dataService'
import { useToast } from '../Toast'

export default function FrenchTeam({ reload }) {
  const toast = useToast()
  const { getRateAt } = useCurrency()
  const [commissions, setCommissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await fetchCommissions()
      setCommissions(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id, label) => {
    if (!confirm(`${label} priminin silinmesini onaylıyor musun? İlişkili gider kaydı da silinecek.`)) return
    try {
      await deleteCommission(id)
      await loadData()
      if (reload) await reload()
      toast.success(`${label} primi silindi`)
    } catch (err) {
      toast.error('Hata: ' + err.message)
    }
  }

  // Yıllık özet
  const yearlyStats = useMemo(() => {
    const byYear = {}
    commissions.forEach(c => {
      if (!byYear[c.year]) byYear[c.year] = { totalChf: 0, totalSales: 0, totalRetention: 0, count: 0 }
      byYear[c.year].totalChf += parseFloat(c.total_chf || 0)
      byYear[c.year].totalSales += parseInt(c.sales_count || 0)
      byYear[c.year].totalRetention += parseInt(c.retention_count || 0)
      byYear[c.year].count += 1
    })
    return Object.entries(byYear).sort((a,b) => b[0] - a[0]).map(([y, v]) => ({ year: y, ...v }))
  }, [commissions])

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>
      <div className="spinner" style={{ width: 30, height: 30, border: '3px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%', margin: '0 auto 12px' }}></div>
      Yükleniyor...
    </div>
  }

  return (
    <div>
      <div style={{
        background: 'var(--accent-soft)', border: '1px solid var(--accent)',
        borderRadius: 12, padding: '12px 16px', marginBottom: 18,
        display: 'flex', alignItems: 'flex-start', gap: 12
      }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="spark" size={13}/>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.5 }}>
          <strong>French Team Primi:</strong> Sales × 10 CHF + Retention × 3 CHF formülü ile aylık prim hesaplanır.
          Otomatik kur dolu gelir, <strong>istersen elden değiştirebilirsin</strong>. Prim Fatih cari hesabına eklenir.
        </div>
      </div>

      {/* YILLIK ÖZET */}
      {yearlyStats.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(yearlyStats.length, 4)}, 1fr)`, gap: 12, marginBottom: 18 }}>
          {yearlyStats.slice(0, 4).map(s => (
            <div key={s.year} style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>{s.year} Toplam</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{fmtCHF(s.totalChf)}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
                {s.count} ay · {s.totalSales} sales + {s.totalRetention} retention
              </div>
            </div>
          ))}
        </div>
      )}

      {/* EKLE BUTONU */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setShowAdd(true)} style={{
          background: 'var(--gradient-1)', color: 'white',
          padding: '10px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)'
        }}>
          <Icon name="plus" size={14}/> Yeni Prim Ekle
        </button>
      </div>

      {/* PRİM TABLOSU */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)' }}>
        <h3 className="display" style={{ fontSize: 15, marginBottom: 14 }}>Aylık Prim Geçmişi</h3>

        {commissions.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
            Henüz prim kaydı yok. "Yeni Prim Ekle" ile başla.
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 80px 80px 110px 110px 1fr 72px', gap: 12, padding: '10px 0', borderBottom: '2px solid var(--accent)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>
              <div>Ay</div>
              <div style={{ textAlign: 'center' }}>Sales</div>
              <div style={{ textAlign: 'center' }}>Retention</div>
              <div style={{ textAlign: 'right' }}>Toplam CHF</div>
              <div style={{ textAlign: 'right' }}>TL Karşılığı</div>
              <div>Not</div>
              <div></div>
            </div>
            {commissions.map(c => {
              const monthEndDate = new Date(c.year, c.month + 1, 0).toISOString().slice(0, 10)
              const rate = getRateAt(monthEndDate) || FALLBACK_RATE
              const tl = parseFloat(c.total_chf) * rate
              return (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '120px 80px 80px 110px 110px 1fr 72px', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line-soft)', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{monthFull(c.month)} {c.year}</div>
                  <div style={{ textAlign: 'center', fontSize: 12 }}>
                    <span style={{ background: 'var(--blue-soft)', color: 'var(--blue)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{c.sales_count}</span>
                  </div>
                  <div style={{ textAlign: 'center', fontSize: 12 }}>
                    <span style={{ background: 'var(--green-soft)', color: 'var(--green)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{c.retention_count}</span>
                  </div>
                  <div className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{fmtCHF(c.total_chf)}</div>
                  <div className="mono" style={{ textAlign: 'right', fontSize: 12, color: 'var(--ink-muted)' }}>{fmtTL(tl)}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{c.notes || '—'}</div>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditTarget(c)} title="Düzenle" style={{ width: 26, height: 26, borderRadius: 6, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                      <Icon name="edit" size={13}/>
                    </button>
                    <button onClick={() => handleDelete(c.id, `${monthFull(c.month)} ${c.year}`)} title="Sil" style={{ width: 26, height: 26, borderRadius: 6, color: 'var(--ink-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                      <Icon name="trash" size={13}/>
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* EKLEME MODAL */}
      {showAdd && (
        <CommissionModal
          mode="add"
          onClose={() => setShowAdd(false)}
          onSuccess={async () => { await loadData(); if (reload) await reload(); setShowAdd(false) }}
        />
      )}
      {/* DÜZENLEME MODAL */}
      {editTarget && (
        <CommissionModal
          mode="edit"
          existing={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={async () => { await loadData(); if (reload) await reload(); setEditTarget(null) }}
        />
      )}
    </div>
  )
}

function CommissionModal({ mode = 'add', existing = null, onClose, onSuccess }) {
  const toast = useToast()
  const now = new Date()
  const isEdit = mode === 'edit' && existing != null
  const [year, setYear] = useState(isEdit ? existing.year : now.getFullYear())
  const [month, setMonth] = useState(isEdit ? existing.month : now.getMonth())
  const [salesCount, setSalesCount] = useState(isEdit ? existing.sales_count : 0)
  const [retentionCount, setRetentionCount] = useState(isEdit ? existing.retention_count : 0)
  const [rate, setRate] = useState('')
  const [autoRate, setAutoRate] = useState(null)
  const [loadingRate, setLoadingRate] = useState(false)
  const [notes, setNotes] = useState(isEdit ? (existing.notes || '') : '')
  const [saving, setSaving] = useState(false)

  // Otomatik kur çek (ay sonu)
  useEffect(() => {
    const fetchAutoRate = async () => {
      setLoadingRate(true)
      try {
        const monthEndDate = new Date(year, month + 1, 0).toISOString().slice(0, 10)
        const rateData = await getRateForDate(monthEndDate)
        if (rateData && rateData.chf_to_try) {
          const v = parseFloat(rateData.chf_to_try)
          setAutoRate(v)
          setRate(v.toFixed(4))
        } else {
          setAutoRate(null)
          setRate('36.0000')
        }
      } catch (err) {
        setAutoRate(null)
        setRate('36.0000')
      } finally {
        setLoadingRate(false)
      }
    }
    fetchAutoRate()
  }, [year, month])

  const totalChf = (salesCount * 10) + (retentionCount * 3)
  const rateNum = parseFloat(rate) || 0
  const totalTry = totalChf * rateNum
  const isRateManual = autoRate !== null && Math.abs(rateNum - autoRate) > 0.001

  const handleSave = async () => {
    if (totalChf === 0) {
      toast.error('Sales veya Retention sayısı 0 olamaz.')
      return
    }
    if (!rateNum || rateNum <= 0) {
      toast.error('Geçerli bir kur girin.')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        await updateCommission(existing.id, {
          year, month, salesCount, retentionCount, notes,
          manualRate: isRateManual ? rateNum : null,
        })
        toast.success(`${monthFull(month)} ${year} primi güncellendi`)
      } else {
        await addCommission(year, month, salesCount, retentionCount, notes, isRateManual ? rateNum : null)
        toast.success('French Team primi eklendi')
      }
      onSuccess()
    } catch (err) {
      toast.error('Hata: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const resetToAuto = () => {
    if (autoRate) setRate(autoRate.toFixed(4))
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 17, 23, 0.6)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 20
    }}>
      <div onClick={e => e.stopPropagation()} className="fade-in" style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <h2 className="display gradient-text" style={{ fontSize: 22, marginBottom: 4 }}>
          {isEdit ? 'Primi Düzenle' : 'Yeni French Team Primi'}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 20 }}>
          {isEdit
            ? 'Sales / retention / kur / not değerlerini güncelle. Bağlı gider kaydı da otomatik güncellenir.'
            : 'Aylık prim ekle — kur otomatik gelir, istersen değiştirebilirsin'}
        </p>

        {/* AY VE YIL */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Yıl</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: '100%', padding: '10px 12px', fontSize: 13 }}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Ay</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ width: '100%', padding: '10px 12px', fontSize: 13 }}>
              {Array.from({length: 12}, (_, i) => <option key={i} value={i}>{monthFull(i)}</option>)}
            </select>
          </div>
        </div>

        {/* SAYILAR */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Sales (×10 CHF)</label>
            <input type="number" min="0" value={salesCount} onChange={e => setSalesCount(Number(e.target.value) || 0)} style={{ width: '100%', padding: '10px 12px', fontSize: 13 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Retention (×3 CHF)</label>
            <input type="number" min="0" value={retentionCount} onChange={e => setRetentionCount(Number(e.target.value) || 0)} style={{ width: '100%', padding: '10px 12px', fontSize: 13 }} />
          </div>
        </div>

        {/* KUR - MANUEL DÜZENLENEBILIR */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>
            <span>CHF → TL Kuru {isRateManual && <span style={{ background: 'var(--amber)', color: 'white', padding: '2px 6px', borderRadius: 4, marginLeft: 6, letterSpacing: 'normal', textTransform: 'none' }}>MANUEL</span>}</span>
            {autoRate && isRateManual && (
              <button onClick={resetToAuto} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 10, cursor: 'pointer', textTransform: 'none', letterSpacing: 'normal' }}>
                ↶ Otomatik Kura Dön ({autoRate.toFixed(4)})
              </button>
            )}
          </label>
          <input
            type="number" step="0.0001" min="0"
            value={rate}
            onChange={e => setRate(e.target.value)}
            placeholder={loadingRate ? 'Yükleniyor...' : '36.0000'}
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14,
              fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
              border: isRateManual ? '2px solid var(--amber)' : '1px solid var(--line)',
              background: isRateManual ? 'var(--amber-soft, #fef3c7)' : 'var(--bg-input)'
            }}
          />
          <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 4 }}>
            {loadingRate ? 'Otomatik kur yükleniyor...' :
              autoRate ? `Sistem kuru: ${autoRate.toFixed(4)} TL (${monthFull(month)} ${year} ay sonu) · İstersen değiştir` :
              'Sistem kuru bulunamadı, lütfen elden gir'}
          </div>
        </div>

        {/* NOT */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Not (Opsiyonel)</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ekstra açıklama..." style={{ width: '100%', padding: '10px 12px', fontSize: 13 }} />
        </div>

        {/* HESAPLAMA ÖZETI */}
        <div style={{
          background: 'var(--accent-soft)', border: '1px solid var(--accent)',
          borderRadius: 12, padding: '14px 16px', marginBottom: 18
        }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 700, marginBottom: 8 }}>Hesaplama</div>
          <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--ink-muted)' }}>{salesCount} sales × 10 CHF</span>
              <span className="mono">{(salesCount * 10).toFixed(2)} CHF</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--ink-muted)' }}>{retentionCount} retention × 3 CHF</span>
              <span className="mono">{(retentionCount * 3).toFixed(2)} CHF</span>
            </div>
            <div style={{ borderTop: '1px solid var(--accent)', paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>Toplam CHF</span>
              <span className="mono" style={{ color: 'var(--accent)' }}>{fmtCHF(totalChf)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
              <span>TL Karşılığı</span>
              <span className="mono" style={{ color: 'var(--green)' }}>{fmtTL(totalTry)}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink-muted)', textAlign: 'right', marginTop: 4 }}>
              Kur: 1 CHF = {rateNum.toFixed(4)} TL {isRateManual ? '(manuel)' : '(otomatik)'}
            </div>
          </div>
        </div>

        {/* BUTONLAR */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--line)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>İptal</button>
          <button onClick={handleSave} disabled={saving || totalChf === 0} style={{
            padding: '10px 20px', borderRadius: 8,
            background: 'var(--gradient-1)', color: 'white',
            border: 'none', fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
            opacity: (saving || totalChf === 0) ? 0.6 : 1
          }}>
            {saving ? 'Kaydediliyor...' : isEdit ? 'Değişiklikleri Kaydet' : 'Primi Ekle'}
          </button>
        </div>
      </div>
    </div>
  )
}
