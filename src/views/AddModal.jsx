import React, { useState, useEffect } from 'react'
import { Icon, fmtTL, todayStr, monthFull } from '../utils'
import { addTransaction, addInstallmentTransaction } from '../dataService'
import { useToast } from '../Toast'

export default function AddModal({ data, reload, onClose }) {
  const toast = useToast()
  const [form, setForm] = useState({
    type: 'expense', date: todayStr(), amount: '',
    category: '', customer: '',
    paymentType: data.paymentTypes[0] || '', description: ''
  })
  const [isInstallment, setIsInstallment] = useState(false)
  const [installmentCount, setInstallmentCount] = useState(3)
  const [saving, setSaving] = useState(false)

  const avail = data.categories.filter(c => c.type === form.type)
  useEffect(() => {
    if (avail.length > 0 && !avail.find(c => c.name === form.category)) {
      setForm(f => ({...f, category: avail[0].name}))
    }
  }, [form.type])

  // Gelir seçilince taksit kapatılsın
  useEffect(() => {
    if (form.type === 'income') setIsInstallment(false)
  }, [form.type])

  const submit = async () => {
    if (!form.amount || !form.category) {
      toast.error('Tutar ve kategori zorunlu.')
      return
    }
    setSaving(true)
    try {
      if (isInstallment && installmentCount >= 2) {
        await addInstallmentTransaction({
          ...form,
          amount: parseFloat(form.amount)
        }, installmentCount)
        toast.success(`${installmentCount} taksitli işlem eklendi`)
      } else {
        await addTransaction({
          ...form,
          amount: parseFloat(form.amount)
        })
        toast.success('İşlem eklendi')
      }
      await reload()
      onClose()
    } catch (err) {
      toast.error('Kaydetme hatası: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Taksit ön izleme
  const installmentPreview = () => {
    const amount = parseFloat(form.amount) || 0
    if (!amount || installmentCount < 2) return []
    const perInstallment = Math.round((amount / installmentCount) * 100) / 100
    const baseDate = new Date(form.date)
    const preview = []
    for (let i = 0; i < installmentCount; i++) {
      const d = new Date(baseDate)
      d.setMonth(baseDate.getMonth() + i)
      if (d.getDate() !== baseDate.getDate()) d.setDate(0)
      preview.push({
        no: i + 1,
        date: d,
        amount: perInstallment
      })
    }
    return preview
  }

  const preview = installmentPreview()

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 17, 23, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className="fade-in" style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 className="display" style={{ fontSize: 22, marginBottom: 2 }}>Yeni İşlem</h2>
          <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Gelir veya gider kaydı oluştur</p>
        </div>

        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-input)', padding: 3, borderRadius: 10, marginBottom: 16 }}>
          {[{v:'expense',l:'Gider',c:'var(--red)'},{v:'income',l:'Gelir',c:'var(--green)'}].map(t => (
            <button key={t.v} onClick={() => setForm({...form, type: t.v})} style={{ flex: 1, padding: '9px', borderRadius: 7, fontSize: 13, fontWeight: 600, background: form.type === t.v ? t.c : 'transparent', color: form.type === t.v ? 'white' : 'var(--ink-soft)' }}>{t.l}</button>
          ))}
        </div>

        <Field label="Tarih">
          <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} style={inputStyle} />
        </Field>

        <Field label={isInstallment ? "Toplam Tutar (₺)" : "Tutar (₺)"}>
          <input type="number" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="0.00" style={inputStyle} />
        </Field>

        <Field label="Kategori">
          <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} style={inputStyle}>
            {avail.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </Field>

        {form.type === 'income' && (
          <Field label="Müşteri / Proje">
            <input value={form.customer} onChange={e => setForm({...form, customer: e.target.value})} placeholder="Örn: ABC Ltd." style={inputStyle} />
          </Field>
        )}

        <Field label="Ödeme Türü">
          <select value={form.paymentType} onChange={e => setForm({...form, paymentType: e.target.value})} style={inputStyle}>
            {data.paymentTypes.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>

        <Field label="Açıklama">
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Örn: Laptop alımı" rows={2} style={{...inputStyle, resize: 'vertical'}} />
        </Field>

        {/* TAKSİT BÖLÜMÜ - sadece gider için */}
        {form.type === 'expense' && (
          <div style={{
            background: isInstallment ? 'var(--accent-soft)' : 'var(--bg-input)',
            border: `1px solid ${isInstallment ? 'var(--accent)' : 'var(--line)'}`,
            borderRadius: 10, padding: 14, marginBottom: 14, marginTop: 4
          }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              userSelect: 'none'
            }}>
              <input
                type="checkbox"
                checked={isInstallment}
                onChange={e => setIsInstallment(e.target.checked)}
                style={{
                  width: 18, height: 18, accentColor: 'var(--accent)',
                  cursor: 'pointer'
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: isInstallment ? 'var(--accent)' : 'var(--ink)' }}>
                  Taksitli ödeme
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>
                  Toplam tutarı aylık taksitlere böl
                </div>
              </div>
            </label>

            {isInstallment && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--accent)' }}>
                <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 6, fontWeight: 600 }}>
                  Taksit Sayısı
                </label>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
                  {[2, 3, 4, 6, 9, 12].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setInstallmentCount(n)}
                      style={{
                        padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        background: installmentCount === n ? 'var(--accent)' : 'var(--bg-card)',
                        color: installmentCount === n ? 'white' : 'var(--ink-soft)',
                        border: `1px solid ${installmentCount === n ? 'var(--accent)' : 'var(--line)'}`
                      }}
                    >
                      {n}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="2"
                    max="36"
                    value={installmentCount}
                    onChange={e => setInstallmentCount(Math.max(2, parseInt(e.target.value) || 2))}
                    style={{ width: 60, padding: '6px 10px', fontSize: 12, textAlign: 'center' }}
                  />
                </div>

                {/* Önizleme */}
                {preview.length > 0 && (
                  <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 10, border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600, marginBottom: 6 }}>
                      Ön İzleme — {installmentCount} taksit × {fmtTL(preview[0].amount)}
                    </div>
                    <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                      {preview.map(p => (
                        <div key={p.no} style={{
                          display: 'flex', justifyContent: 'space-between',
                          padding: '4px 0', fontSize: 11,
                          borderBottom: p.no < preview.length ? '1px dashed var(--line-soft)' : 'none'
                        }}>
                          <span style={{ color: 'var(--ink-soft)' }}>
                            <span style={{ display: 'inline-block', width: 32, color: 'var(--ink-muted)' }}>{p.no}/{installmentCount}</span>
                            {p.date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="mono" style={{ fontWeight: 600 }}>{fmtTL(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--bg-input)', border: '1px solid var(--line)' }}>İptal</button>
          <button onClick={submit} disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--gradient-1)', color: 'white', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Kaydediliyor...' : isInstallment ? `${installmentCount} Taksit Olarak Kaydet` : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '9px 12px', fontSize: 13 }

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 5, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  )
}
