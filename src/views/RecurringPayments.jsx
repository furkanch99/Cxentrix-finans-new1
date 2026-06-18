import React, { useState, useEffect, useMemo } from 'react'
import { Icon, fmtTL, monthFull } from '../utils'
import { useToast } from '../Toast'
import {
  fetchRecurringPayments,
  fetchRecurringPaymentStatusForMonth,
  setRecurringPaymentStatus,
  addRecurringPayment,
  updateRecurringPayment,
  deleteRecurringPayment,
} from '../dataService'

// =====================================================================
// Aylık Sabit Ödeme Hatırlatıcısı
//
// Sabit kalemler (Kira, Aidat, SGK, Kredi Kartı) için her ay ödedin mi
// işaretlemek üzere basit bir takvim/checklist. Kalemler DB'de seed
// edilmiştir; bu ekrandan yeni kalem eklenmiyor — odak: hatırlatıcı.
// =====================================================================

export default function RecurringPayments() {
  const toast = useToast()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [items, setItems] = useState([])
  const [statusByItem, setStatusByItem] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [editAmountFor, setEditAmountFor] = useState(null)
  const [amountInput, setAmountInput] = useState('')
  const [showFormFor, setShowFormFor] = useState(null) // 'new' | item object | null

  const loadItems = async () => {
    try {
      const list = await fetchRecurringPayments()
      setItems(list)
    } catch (err) {
      toast.error('Sabit ödemeler yüklenemedi: ' + err.message)
    }
  }

  // İlk yükleme: kalem listesi
  useEffect(() => {
    loadItems()
  }, [])

  const handleSaveItem = async (form, existingId) => {
    try {
      if (existingId) {
        await updateRecurringPayment(existingId, {
          name: form.name.trim(),
          amount: form.amount === '' ? null : parseFloat(form.amount),
          payment_day: parseInt(form.payment_day, 10),
          notes: form.notes.trim() || null,
        })
        toast.success(`${form.name} güncellendi`)
      } else {
        await addRecurringPayment({
          name: form.name.trim(),
          amount: form.amount === '' ? null : parseFloat(form.amount),
          payment_day: parseInt(form.payment_day, 10),
          notes: form.notes.trim() || null,
          category: null,
        })
        toast.success(`${form.name} eklendi`)
      }
      setShowFormFor(null)
      await loadItems()
    } catch (err) {
      toast.error('Kaydedilemedi: ' + err.message)
    }
  }

  const handleDeleteItem = async (item) => {
    if (!confirm(`"${item.name}" kalemini silmek istediğine emin misin? Bu kalem için tüm aylık ödendi/bekliyor kayıtları da silinecek.`)) return
    try {
      await deleteRecurringPayment(item.id)
      toast.success(`${item.name} silindi`)
      await loadItems()
    } catch (err) {
      toast.error('Silinemedi: ' + err.message)
    }
  }

  // Ay/yıl değişince durumları yeniden çek
  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      try {
        const rows = await fetchRecurringPaymentStatusForMonth(year, month)
        const map = {}
        rows.forEach(r => { map[r.recurring_id] = r })
        if (alive) setStatusByItem(map)
      } catch (err) {
        toast.error('Durumlar yüklenemedi: ' + err.message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [year, month])

  const goPrev = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const goNext = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()) }

  const toggle = async (item) => {
    const cur = statusByItem[item.id]
    const next = !(cur && cur.is_paid)
    setSaving(s => ({ ...s, [item.id]: true }))
    try {
      const row = await setRecurringPaymentStatus(item.id, year, month, {
        is_paid: next,
        paid_date: next ? new Date().toISOString().slice(0, 10) : null,
        paid_amount: cur?.paid_amount ?? null,
        notes: cur?.notes ?? null,
      })
      setStatusByItem(s => ({ ...s, [item.id]: row }))
      toast.success(next ? `${item.name} → ödendi` : `${item.name} → bekliyor`)
    } catch (err) {
      toast.error('Güncellenemedi: ' + err.message)
    } finally {
      setSaving(s => ({ ...s, [item.id]: false }))
    }
  }

  const saveAmount = async (item) => {
    const amt = parseFloat(amountInput)
    if (isNaN(amt) || amt < 0) {
      toast.error('Geçerli bir tutar gir')
      return
    }
    setSaving(s => ({ ...s, [item.id]: true }))
    try {
      const cur = statusByItem[item.id]
      const row = await setRecurringPaymentStatus(item.id, year, month, {
        is_paid: true,
        paid_date: cur?.paid_date || new Date().toISOString().slice(0, 10),
        paid_amount: amt,
        notes: cur?.notes ?? null,
      })
      setStatusByItem(s => ({ ...s, [item.id]: row }))
      setEditAmountFor(null)
      setAmountInput('')
      toast.success(`${item.name} tutarı kaydedildi`)
    } catch (err) {
      toast.error('Güncellenemedi: ' + err.message)
    } finally {
      setSaving(s => ({ ...s, [item.id]: false }))
    }
  }

  // KPI hesapları
  const summary = useMemo(() => {
    let paidCount = 0
    let dueCount = 0
    let paidAmount = 0
    items.forEach(it => {
      const st = statusByItem[it.id]
      if (st?.is_paid) {
        paidCount++
        paidAmount += Number(st.paid_amount) || Number(it.amount) || 0
      } else {
        dueCount++
      }
    })
    return { paidCount, dueCount, paidAmount, total: items.length }
  }, [items, statusByItem])

  // Bugün ile karşılaştır: o ayın günü gelince "vade geldi"
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  return (
    <div className="fade-in">
      {/* Ay navigasyonu */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12,
        padding: 14, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'
      }}>
        <button onClick={goPrev} title="Önceki ay" style={{
          width: 36, height: 36, borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
        }}>
          <Icon name="arrowLeft" size={14}/>
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{monthFull(month)} {year}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>
            {summary.paidCount}/{summary.total} ödendi {summary.dueCount > 0 ? `· ${summary.dueCount} bekliyor` : ''}
          </div>
        </div>
        <button onClick={goNext} title="Sonraki ay" style={{
          width: 36, height: 36, borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
        }}>
          <Icon name="arrowRight" size={14}/>
        </button>
        {!isCurrentMonth && (
          <button onClick={goToday} style={{
            padding: '7px 12px', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)',
            border: '1px solid var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer'
          }}>Bu Ay</button>
        )}
      </div>

      {/* Yeni kalem ekle butonu */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          onClick={() => setShowFormFor('new')}
          style={{
            background: 'var(--gradient-1)', color: 'white',
            padding: '10px 18px', borderRadius: 10,
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            border: 'none', display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)'
          }}
        >
          <Icon name="plus" size={14}/> Yeni Kalem Ekle
        </button>
      </div>

      {/* KPI özet */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--green)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--green)', fontWeight: 700, marginBottom: 6 }}>Ödenenler</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>{summary.paidCount} / {summary.total}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>{fmtTL(summary.paidAmount)}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: `1px solid ${summary.dueCount > 0 ? 'var(--red)' : 'var(--line)'}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: summary.dueCount > 0 ? 'var(--red)' : 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Bekleyenler</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: summary.dueCount > 0 ? 'var(--red)' : 'var(--ink-muted)' }}>{summary.dueCount}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>{summary.dueCount > 0 ? 'Halen ödenmedi' : 'Hepsi tamam ✓'}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Dönem</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{monthFull(month)} {year}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>{daysInMonth} gün</div>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>
          <div className="spinner" style={{ width: 30, height: 30, border: '3px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%', margin: '0 auto 12px' }}/>
          Yükleniyor...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => {
            const st = statusByItem[item.id]
            const paid = !!st?.is_paid
            const due = item.payment_day
            const dueDate = new Date(year, month, Math.min(due, daysInMonth))
            const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))
            const isOverdue = !paid && isCurrentMonth && daysUntil < 0
            const isUpcoming = !paid && isCurrentMonth && daysUntil >= 0 && daysUntil <= 5

            return (
              <div key={item.id} style={{
                background: 'var(--bg-card)',
                border: `1px solid ${paid ? 'var(--green)' : isOverdue ? 'var(--red)' : isUpcoming ? 'var(--amber)' : 'var(--line)'}`,
                borderRadius: 12,
                padding: '14px 18px',
                display: 'grid',
                gridTemplateColumns: '50px 1fr auto auto auto',
                gap: 16,
                alignItems: 'center',
                opacity: paid ? 0.85 : 1,
                transition: 'all 0.2s'
              }}>
                {/* Gün rozeti — büyük rakam */}
                <div style={{
                  width: 50, height: 50, borderRadius: 10,
                  background: paid ? 'var(--green-soft)' : isOverdue ? 'var(--red-soft)' : isUpcoming ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-input)',
                  color: paid ? 'var(--green)' : isOverdue ? 'var(--red)' : isUpcoming ? 'var(--amber, #d97706)' : 'var(--ink-soft)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Space Grotesk', sans-serif"
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{due}</div>
                  <div style={{ fontSize: 9, letterSpacing: '0.1em', marginTop: 1 }}>GÜN</div>
                </div>

                {/* İsim + alt bilgi */}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                    {item.notes || `Her ayın ${due}'i`}
                  </div>
                  {paid && st.paid_date && (
                    <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 3, fontWeight: 600 }}>
                      ✓ {new Date(st.paid_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })} tarihinde ödendi
                      {st.paid_amount > 0 && ` · ${fmtTL(st.paid_amount)}`}
                    </div>
                  )}
                  {!paid && isCurrentMonth && (
                    <div style={{ fontSize: 10, marginTop: 3, fontWeight: 600,
                      color: isOverdue ? 'var(--red)' : isUpcoming ? 'var(--amber, #d97706)' : 'var(--ink-muted)'
                    }}>
                      {isOverdue
                        ? `⚠ ${-daysUntil} gün gecikti`
                        : daysUntil === 0
                          ? '⏰ Bugün ödenmeli'
                          : `📅 ${daysUntil} gün sonra`}
                    </div>
                  )}
                </div>

                {/* Tutar girişi (sadece kredi kartı için anlamlı) */}
                {paid ? (
                  editAmountFor === item.id ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="number"
                        autoFocus
                        value={amountInput}
                        onChange={e => setAmountInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveAmount(item)}
                        placeholder="TL"
                        style={{ width: 110, padding: '7px 10px', fontSize: 13 }}
                      />
                      <button onClick={() => saveAmount(item)} style={{
                        padding: '7px 10px', borderRadius: 6, background: 'var(--green)', color: 'white',
                        border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer'
                      }}>✓</button>
                      <button onClick={() => { setEditAmountFor(null); setAmountInput('') }} style={{
                        padding: '7px 10px', borderRadius: 6, background: 'var(--bg-input)', color: 'var(--ink-muted)',
                        border: '1px solid var(--line)', fontSize: 11, cursor: 'pointer'
                      }}>×</button>
                    </div>
                  ) : (
                    <button onClick={() => {
                      setEditAmountFor(item.id)
                      setAmountInput(st?.paid_amount?.toString() || item.amount?.toString() || '')
                    }} style={{
                      padding: '6px 10px', borderRadius: 6, background: 'var(--bg-input)', border: '1px solid var(--line)',
                      fontSize: 11, color: 'var(--ink-soft)', cursor: 'pointer'
                    }}>
                      {st?.paid_amount > 0 ? fmtTL(st.paid_amount) : '+ tutar gir'}
                    </button>
                  )
                ) : (
                  <div></div>
                )}

                {/* Tık butonu */}
                <button
                  onClick={() => toggle(item)}
                  disabled={saving[item.id]}
                  title={paid ? 'İşareti kaldır' : 'Ödendi olarak işaretle'}
                  style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: paid ? 'linear-gradient(135deg, #10b981, #059669)' : 'var(--bg-input)',
                    border: `1.5px solid ${paid ? '#059669' : 'var(--line)'}`,
                    color: paid ? 'white' : 'var(--ink-muted)',
                    cursor: saving[item.id] ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: paid ? '0 2px 6px rgba(16, 185, 129, 0.3)' : 'none',
                    transition: 'all 0.2s',
                    opacity: saving[item.id] ? 0.6 : 1,
                  }}
                >
                  <Icon name="check" size={20}/>
                </button>

                {/* Düzenle / Sil */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button
                    onClick={() => setShowFormFor(item)}
                    title="Düzenle"
                    style={{
                      width: 28, height: 22, borderRadius: 5,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <Icon name="edit" size={13}/>
                  </button>
                  <button
                    onClick={() => handleDeleteItem(item)}
                    title="Sil"
                    style={{
                      width: 28, height: 22, borderRadius: 5,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <Icon name="trash" size={13}/>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div style={{
          background: 'var(--bg-card)', border: '1px dashed var(--line)',
          borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--ink-muted)'
        }}>
          Sabit ödeme kalemi bulunamadı. Üstteki "Yeni Kalem Ekle" butonu ile başla.
        </div>
      )}

      {showFormFor && (
        <ItemForm
          existing={showFormFor === 'new' ? null : showFormFor}
          onSave={handleSaveItem}
          onClose={() => setShowFormFor(null)}
        />
      )}
    </div>
  )
}

// ============= YENİ / DÜZENLE FORM MODALI =============
function ItemForm({ existing, onSave, onClose }) {
  const [form, setForm] = useState({
    name: existing?.name || '',
    payment_day: existing?.payment_day || 1,
    amount: existing?.amount != null ? String(existing.amount) : '',
    notes: existing?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const canSave = form.name.trim().length > 0 &&
                  form.payment_day >= 1 && form.payment_day <= 31

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    await onSave(form, existing?.id)
    setSaving(false)
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 17, 23, 0.6)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 20
    }}>
      <div onClick={e => e.stopPropagation()} className="fade-in" style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <h2 className="display" style={{ fontSize: 20, marginBottom: 4 }}>
          {existing ? 'Kalemi Düzenle' : 'Yeni Sabit Ödeme Kalemi'}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 20 }}>
          {existing ? 'Bilgileri güncelle' : 'Her ay tekrarlanacak bir ödeme kalemi ekle'}
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Kalem Adı *</label>
          <input
            type="text" autoFocus
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Örn: İnternet, Telefon, Servis"
            style={{ width: '100%', padding: '10px 12px', fontSize: 14, fontWeight: 500 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Ödeme Günü *</label>
            <input
              type="number" min="1" max="31"
              value={form.payment_day}
              onChange={e => setForm(f => ({ ...f, payment_day: e.target.value }))}
              placeholder="1-31"
              style={{ width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}
            />
            <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 4 }}>
              Her ayın hangi günü? (örn. 1, 15, 28)
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Tutar (TL)</label>
            <input
              type="number" step="0.01" min="0"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="Opsiyonel"
              style={{ width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}
            />
            <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 4 }}>
              Her ay aynıysa gir, değişiyorsa boş bırak
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Not (opsiyonel)</label>
          <input
            type="text"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Hatırlatıcı bilgi"
            style={{ width: '100%', padding: '10px 12px', fontSize: 13 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '10px 18px', borderRadius: 8,
            background: 'var(--bg-input)', border: '1px solid var(--line)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer'
          }}>İptal</button>
          <button onClick={handleSave} disabled={!canSave || saving} style={{
            padding: '10px 20px', borderRadius: 8,
            background: 'var(--gradient-1)', color: 'white',
            border: 'none', fontSize: 12, fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer',
            opacity: (!canSave || saving) ? 0.5 : 1
          }}>
            {saving ? 'Kaydediliyor...' : existing ? 'Güncelle' : 'Ekle'}
          </button>
        </div>
      </div>
    </div>
  )
}
