import React, { useState, useEffect, useMemo } from 'react'
import { Icon, fmtTL, monthFull } from '../utils'
import { useToast } from '../Toast'
import {
  fetchSalaryPlan,
  upsertSalaryPlan,
  fetchAdvancesForMonth,
  addAdvance,
  deleteAdvance,
} from '../dataService'

// =====================================================================
// Maaş Planı + Avans Takibi
//
// Her ay için 8 ekip üyesinin maaş planını ve verilen avansları
// görüntüler:
//   - Tam (beklenen) maaş
//   - O aya ait avanslar (toplam ve detay)
//   - Net ödenecek = tam - avans toplamı
//   - Ödendi durumu ve gerçek ödenen tutar
//
// Yeni ay seçince eğer plan kaydı yoksa, geçen ayın beklenen
// tutarları otomatik olarak default yüklenir (kullanıcı override
// edebilir).
// =====================================================================

const EMPLOYEES = [
  'Furkan', 'Onur', 'Arif', 'Nebhen',
  'Erdinç', 'Gökşin', 'Ali',
]

export default function SalaryPlan() {
  const toast = useToast()
  const now = new Date()
  // Default: önümüzdeki ay
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const [year, setYear] = useState(next.getFullYear())
  const [month, setMonth] = useState(next.getMonth())

  const [plans, setPlans] = useState({})        // employee -> plan row
  const [advances, setAdvances] = useState([])  // all advances for this period
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [showAdvanceFor, setShowAdvanceFor] = useState(null)

  const reload = async () => {
    setLoading(true)
    try {
      const [planRows, advRows] = await Promise.all([
        fetchSalaryPlan(year, month),
        fetchAdvancesForMonth(year, month),
      ])
      const planMap = {}
      planRows.forEach(p => { planMap[p.employee_name] = p })
      setPlans(planMap)
      setAdvances(advRows)
    } catch (err) {
      toast.error('Yüklenemedi: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const goPrev = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const goNext = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }
  const goNextMonth = () => {
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  // Beklenen tutarı kaydet (inline edit)
  const saveExpected = async (employee, value) => {
    const amt = value === '' ? null : parseFloat(value)
    if (value !== '' && (isNaN(amt) || amt < 0)) {
      toast.error('Geçerli bir tutar gir')
      return
    }
    setSaving(s => ({ ...s, [employee + ':exp']: true }))
    try {
      const cur = plans[employee] || {}
      const row = await upsertSalaryPlan(employee, year, month, {
        expected_amount: amt,
        is_paid: cur.is_paid || false,
        paid_amount: cur.paid_amount ?? null,
        paid_date: cur.paid_date ?? null,
      })
      setPlans(p => ({ ...p, [employee]: row }))
    } catch (err) {
      toast.error('Kaydedilemedi: ' + err.message)
    } finally {
      setSaving(s => ({ ...s, [employee + ':exp']: false }))
    }
  }

  // Ödendi toggle
  const togglePaid = async (employee, netAmount) => {
    setSaving(s => ({ ...s, [employee + ':paid']: true }))
    try {
      const cur = plans[employee] || {}
      const next = !cur.is_paid
      const row = await upsertSalaryPlan(employee, year, month, {
        expected_amount: cur.expected_amount ?? null,
        is_paid: next,
        paid_amount: next ? (cur.paid_amount ?? netAmount) : null,
        paid_date: next ? (cur.paid_date || new Date().toISOString().slice(0, 10)) : null,
      })
      setPlans(p => ({ ...p, [employee]: row }))
      toast.success(next ? `${employee} → ödendi olarak işaretlendi` : `${employee} → bekliyor`)
    } catch (err) {
      toast.error('Güncellenemedi: ' + err.message)
    } finally {
      setSaving(s => ({ ...s, [employee + ':paid']: false }))
    }
  }

  // Çalışan bazlı avans listesi
  const advancesByEmployee = useMemo(() => {
    const map = {}
    EMPLOYEES.forEach(e => { map[e] = [] })
    advances.forEach(a => {
      if (!map[a.employee_name]) map[a.employee_name] = []
      map[a.employee_name].push(a)
    })
    return map
  }, [advances])

  // Çalışan bazlı satır verisi
  const rows = useMemo(() => {
    return EMPLOYEES.map(emp => {
      const plan = plans[emp]
      const empAdvances = advancesByEmployee[emp] || []
      const expected = plan?.expected_amount != null ? Number(plan.expected_amount) : 0
      const advanceTotal = empAdvances.reduce((s, a) => s + Number(a.amount || 0), 0)
      const net = Math.max(0, expected - advanceTotal)
      return {
        employee: emp,
        plan,
        expected,
        hasExpected: plan?.expected_amount != null,
        advances: empAdvances,
        advanceTotal,
        net,
        isPaid: !!plan?.is_paid,
        paidAmount: plan?.paid_amount != null ? Number(plan.paid_amount) : null,
        paidDate: plan?.paid_date || null,
      }
    })
  }, [plans, advancesByEmployee])

  const summary = useMemo(() => {
    const totalExpected = rows.reduce((s, r) => s + r.expected, 0)
    const totalAdvance = rows.reduce((s, r) => s + r.advanceTotal, 0)
    const totalNet = rows.reduce((s, r) => s + r.net, 0)
    const totalPaid = rows.filter(r => r.isPaid).reduce((s, r) => s + (r.paidAmount ?? r.net), 0)
    const paidCount = rows.filter(r => r.isPaid).length
    return { totalExpected, totalAdvance, totalNet, totalPaid, paidCount }
  }, [rows])

  const handleAddAdvance = async (form) => {
    try {
      await addAdvance({
        employee: showAdvanceFor,
        amount: parseFloat(form.amount),
        advance_date: form.advance_date,
        target_year: year,
        target_month: month,
        notes: form.notes.trim() || null,
      })
      toast.success(`${showAdvanceFor} için avans kaydedildi`)
      setShowAdvanceFor(null)
      await reload()
    } catch (err) {
      toast.error('Avans kaydedilemedi: ' + err.message)
    }
  }

  const handleDeleteAdvance = async (advance) => {
    if (!confirm(`${advance.employee_name} için ${fmtTL(advance.amount)} avans kaydını silmek istediğine emin misin?`)) return
    try {
      await deleteAdvance(advance.id)
      toast.success('Avans silindi')
      await reload()
    } catch (err) {
      toast.error('Silinemedi: ' + err.message)
    }
  }

  return (
    <div className="fade-in">
      {/* Ay navigasyonu */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12,
        padding: 14, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'
      }}>
        <button onClick={goPrev} style={{
          width: 36, height: 36, borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
        }}>
          <Icon name="arrowLeft" size={14}/>
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{monthFull(month)} {year}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>maaş planı</div>
        </div>
        <button onClick={goNext} style={{
          width: 36, height: 36, borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
        }}>
          <Icon name="arrowRight" size={14}/>
        </button>
        <button onClick={goNextMonth} style={{
          padding: '7px 12px', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)',
          border: '1px solid var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer'
        }}>Sonraki Ay</button>
      </div>

      {/* KPI özet */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700 }}>Tam Maaş Toplamı</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{fmtTL(summary.totalExpected)}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--amber)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--amber, #d97706)', fontWeight: 700 }}>Verilen Avans</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--amber, #d97706)', marginTop: 4 }}>{fmtTL(summary.totalAdvance)}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '2px solid var(--accent)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 700 }}>Ödenecek Net</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', marginTop: 4 }}>{fmtTL(summary.totalNet)}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--green)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--green)', fontWeight: 700 }}>Ödendi</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)', marginTop: 4 }}>{summary.paidCount} / {EMPLOYEES.length}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>
          <div className="spinner" style={{ width: 30, height: 30, border: '3px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%', margin: '0 auto 12px' }}/>
          Yükleniyor...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(row => (
            <EmployeeCard
              key={row.employee}
              row={row}
              saving={saving}
              onSaveExpected={(v) => saveExpected(row.employee, v)}
              onTogglePaid={() => togglePaid(row.employee, row.net)}
              onAddAdvance={() => setShowAdvanceFor(row.employee)}
              onDeleteAdvance={handleDeleteAdvance}
            />
          ))}
        </div>
      )}

      {showAdvanceFor && (
        <AdvanceForm
          employee={showAdvanceFor}
          targetYear={year}
          targetMonth={month}
          onSave={handleAddAdvance}
          onClose={() => setShowAdvanceFor(null)}
        />
      )}
    </div>
  )
}

// ============= ÇALIŞAN KARTI =============
function EmployeeCard({ row, saving, onSaveExpected, onTogglePaid, onAddAdvance, onDeleteAdvance }) {
  const [editingExpected, setEditingExpected] = useState(false)
  const [expectedInput, setExpectedInput] = useState('')

  const startEdit = () => {
    setExpectedInput(row.expected > 0 ? String(row.expected) : '')
    setEditingExpected(true)
  }
  const finishEdit = async () => {
    setEditingExpected(false)
    await onSaveExpected(expectedInput)
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${row.isPaid ? 'var(--green)' : 'var(--line)'}`,
      borderRadius: 12,
      padding: '14px 18px',
      opacity: row.isPaid ? 0.92 : 1,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 130px 130px 140px 60px', gap: 14, alignItems: 'center' }}>
        {/* Avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'var(--gradient-1)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif"
        }}>
          {row.employee.charAt(0).toUpperCase()}
        </div>

        {/* İsim + ödendi durumu */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{row.employee}</div>
          {row.isPaid && row.paidDate && (
            <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600, marginTop: 2 }}>
              ✓ {new Date(row.paidDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long' })} tarihinde ödendi
              {row.paidAmount && ` · ${fmtTL(row.paidAmount)}`}
            </div>
          )}
        </div>

        {/* Tam maaş — inline edit */}
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 3 }}>Tam Maaş</div>
          {editingExpected ? (
            <input
              type="number" step="0.01" min="0" autoFocus
              value={expectedInput}
              onChange={e => setExpectedInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && finishEdit()}
              onBlur={finishEdit}
              placeholder="TL"
              style={{ width: '100%', padding: '6px 8px', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}
            />
          ) : (
            <button onClick={startEdit} style={{
              background: row.hasExpected ? 'transparent' : 'var(--bg-input)',
              border: row.hasExpected ? 'none' : '1px dashed var(--line)',
              color: row.hasExpected ? 'var(--ink)' : 'var(--ink-muted)',
              fontSize: 14, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
              padding: '5px 8px', borderRadius: 6, cursor: 'pointer', textAlign: 'left', width: '100%'
            }}>
              {row.hasExpected ? fmtTL(row.expected) : '+ tutar gir'}
            </button>
          )}
        </div>

        {/* Avans */}
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--amber, #d97706)', fontWeight: 700, marginBottom: 3 }}>Avans</div>
          <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: row.advanceTotal > 0 ? 'var(--amber, #d97706)' : 'var(--ink-faint)' }}>
            {row.advanceTotal > 0 ? `−${fmtTL(row.advanceTotal)}` : '—'}
          </div>
          <button onClick={onAddAdvance} style={{
            background: 'transparent', border: 'none', color: 'var(--accent)',
            fontSize: 10, fontWeight: 600, padding: 0, marginTop: 2, cursor: 'pointer'
          }}>+ Avans ekle</button>
        </div>

        {/* Net ödenecek */}
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 700, marginBottom: 3 }}>Ödenecek Net</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
            {fmtTL(row.net)}
          </div>
        </div>

        {/* Tık */}
        <button
          onClick={onTogglePaid}
          disabled={saving[row.employee + ':paid']}
          title={row.isPaid ? 'İşareti kaldır' : 'Ödendi olarak işaretle'}
          style={{
            width: 48, height: 48, borderRadius: 12,
            background: row.isPaid ? 'linear-gradient(135deg, #10b981, #059669)' : 'var(--bg-input)',
            border: `1.5px solid ${row.isPaid ? '#059669' : 'var(--line)'}`,
            color: row.isPaid ? 'white' : 'var(--ink-muted)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: row.isPaid ? '0 2px 6px rgba(16, 185, 129, 0.3)' : 'none',
          }}
        >
          <Icon name="check" size={20}/>
        </button>
      </div>

      {/* Avans detayları — kalemler */}
      {row.advances.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>
            Avans Detayı ({row.advances.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {row.advances.map(a => (
              <div key={a.id} style={{
                display: 'grid', gridTemplateColumns: '100px 1fr 120px 30px', gap: 10, alignItems: 'center',
                padding: '6px 10px', background: 'rgba(245, 158, 11, 0.08)', borderRadius: 6
              }}>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                  {new Date(a.advance_date).toLocaleDateString('tr-TR')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{a.notes || '—'}</div>
                <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber, #d97706)', textAlign: 'right' }}>
                  {fmtTL(a.amount)}
                </div>
                <button onClick={() => onDeleteAdvance(a)} style={{
                  background: 'transparent', border: 'none', color: 'var(--ink-muted)',
                  cursor: 'pointer', padding: 2
                }} title="Avansı sil">
                  <Icon name="x" size={12}/>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============= AVANS EKLE MODALI =============
function AdvanceForm({ employee, targetYear, targetMonth, onSave, onClose }) {
  const [form, setForm] = useState({
    amount: '',
    advance_date: new Date().toISOString().slice(0, 10),
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const canSave = !isNaN(parseFloat(form.amount)) && parseFloat(form.amount) > 0 && form.advance_date

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    await onSave(form)
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
        width: '100%', maxWidth: 460, boxShadow: 'var(--shadow-lg)'
      }}>
        <h2 className="display" style={{ fontSize: 20, marginBottom: 4 }}>Avans Ekle</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 20 }}>
          <strong>{employee}</strong> · <strong>{monthFull(targetMonth)} {targetYear}</strong> maaşından düşülecek
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Avans Tutarı (TL) *</label>
          <input
            type="number" step="0.01" min="0" autoFocus
            value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            placeholder="örn. 5000"
            style={{ width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Avans Tarihi *</label>
          <input
            type="date"
            value={form.advance_date}
            onChange={e => setForm(f => ({ ...f, advance_date: e.target.value }))}
            style={{ width: '100%', padding: '10px 12px', fontSize: 14 }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Not (opsiyonel)</label>
          <input
            type="text"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Açıklama"
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
            {saving ? 'Kaydediliyor...' : 'Avans Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}
