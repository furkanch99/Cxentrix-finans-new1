import React, { useState, useEffect, useMemo } from 'react'
import { Icon, monthFull } from './utils'
import { fetchYearlyRates, upsertExchangeRate, deleteExchangeRate } from './dataService'
import { useToast } from './Toast'

export default function MonthlyRates({ reload }) {
  const toast = useToast()
  const [year, setYear] = useState(new Date().getFullYear())
  const [rates, setRates] = useState({})  // { '2026-01-31': 36.50, ... }
  const [inputs, setInputs] = useState({})  // { 0: '36.50', 1: '37.20', ... } - editable inputs
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)  // hangi ay kaydediliyor
  const [savedMonth, setSavedMonth] = useState(null)  // başarı feedback
  const [bulkSaving, setBulkSaving] = useState(false)

  useEffect(() => {
    loadRates()
  }, [year])

  const loadRates = async () => {
    setLoading(true)
    try {
      const data = await fetchYearlyRates(year)
      const map = {}
      const inputMap = {}

      // Her ay sonu için kuru ara
      for (let m = 0; m < 12; m++) {
        const monthEnd = getMonthEndDate(year, m)
        const found = data.find(r => r.date === monthEnd)
        if (found) {
          map[m] = parseFloat(found.chf_to_try)
          inputMap[m] = parseFloat(found.chf_to_try).toFixed(4)
        } else {
          inputMap[m] = ''
        }
      }

      setRates(map)
      setInputs(inputMap)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getMonthEndDate = (y, m) => {
    return new Date(y, m + 1, 0).toISOString().slice(0, 10)
  }

  const handleInputChange = (month, value) => {
    setInputs(prev => ({ ...prev, [month]: value }))
  }

  const handleSave = async (month) => {
    const value = parseFloat(inputs[month])
    if (!value || value <= 0) {
      toast.error('Geçerli bir kur girin (ör: 54.00)')
      return
    }
    setSaving(month)
    try {
      const dateStr = getMonthEndDate(year, month)
      await upsertExchangeRate(dateStr, value, 'manual')
      setRates(prev => ({ ...prev, [month]: value }))
      setSavedMonth(month)
      setTimeout(() => setSavedMonth(null), 1500)
      // Tüm uygulamayı yenile - kurlar değişti
      if (reload) await reload()
    } catch (err) {
      toast.error('Hata: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  const handleDelete = async (month) => {
    if (!rates[month]) return
    if (!confirm(`${monthFull(month)} ${year} ay sonu kuru silinecek. Emin misin?`)) return
    setSaving(month)
    try {
      const dateStr = getMonthEndDate(year, month)
      await deleteExchangeRate(dateStr)
      setRates(prev => {
        const n = { ...prev }
        delete n[month]
        return n
      })
      setInputs(prev => ({ ...prev, [month]: '' }))
      if (reload) await reload()
    } catch (err) {
      toast.error('Hata: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  const handleBulkSave = async () => {
    const toSave = []
    for (let m = 0; m < 12; m++) {
      const value = parseFloat(inputs[m])
      if (value && value > 0 && value !== rates[m]) {
        toSave.push({ month: m, value })
      }
    }
    if (toSave.length === 0) {
      toast.info('Kaydedilecek değişiklik yok.')
      return
    }
    if (!confirm(`${toSave.length} ay için kur kaydedilecek. Emin misin?`)) return
    setBulkSaving(true)
    try {
      for (const { month, value } of toSave) {
        const dateStr = getMonthEndDate(year, month)
        await upsertExchangeRate(dateStr, value, 'manual')
      }
      await loadRates()
      if (reload) await reload()
      toast.success(`${toSave.length} kur başarıyla kaydedildi`)
    } catch (err) {
      toast.error('Hata: ' + err.message)
    } finally {
      setBulkSaving(false)
    }
  }

  // Pending değişiklik sayısı
  const pendingChanges = useMemo(() => {
    let count = 0
    for (let m = 0; m < 12; m++) {
      const value = parseFloat(inputs[m])
      if (value && value > 0 && value !== rates[m]) count++
    }
    return count
  }, [inputs, rates])

  const availableYears = [2023, 2024, 2025, 2026, 2027, 2028]
  const filledMonths = Object.keys(rates).length

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>
      <div className="spinner" style={{ width: 30, height: 30, border: '3px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%', margin: '0 auto 12px' }}></div>
      Kurlar yükleniyor...
    </div>
  }

  return (
    <div>
      {/* AÇIKLAMA */}
      <div style={{
        background: 'var(--accent-soft)', border: '1px solid var(--accent)',
        borderRadius: 12, padding: '14px 16px', marginBottom: 18,
        display: 'flex', alignItems: 'flex-start', gap: 12
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="settings" size={14}/>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.6 }}>
          <strong>Aylık Kurlar (CHF/TL):</strong> Her ayın sonundaki kuru elle girin. Bu kurlar tüm uygulamada (Logic Holding, Fatih Hesabı, raporlar) CHF hesaplamak için kullanılır.<br/>
          <span style={{ color: 'var(--ink-muted)' }}>Boş bıraktığınız aylar için sistem varsayılan 36 TL kullanır.</span>
        </div>
      </div>

      {/* YIL SEÇİCİ + ÖZET */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>Yıl</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '7px 12px', fontSize: 13, fontWeight: 500 }}>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ width: 1, height: 24, background: 'var(--line)' }}></div>
        <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{filledMonths}/12 ay</span> dolu
        </div>
        {pendingChanges > 0 && (
          <>
            <div style={{ width: 1, height: 24, background: 'var(--line)' }}></div>
            <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700 }}>
              ⚠ {pendingChanges} kaydedilmemiş değişiklik
            </span>
            <button onClick={handleBulkSave} disabled={bulkSaving} style={{
              padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700,
              background: 'var(--gradient-1)', color: 'white', border: 'none', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)'
            }}>
              {bulkSaving ? 'Kaydediliyor...' : '💾 Tümünü Kaydet'}
            </button>
          </>
        )}
      </div>

      {/* AYLIK KURLAR TABLOSU */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 20, border: '1px solid var(--line)' }}>
        <h3 className="display" style={{ fontSize: 15, marginBottom: 14 }}>
          {year} Yılı Aylık Kurlar (CHF/TL)
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {Array.from({length: 12}, (_, m) => {
            const isSaving = saving === m
            const isSaved = savedMonth === m
            const inputValue = inputs[m] || ''
            const inputNum = parseFloat(inputValue)
            const dbValue = rates[m]
            const hasChange = inputNum && inputNum > 0 && inputNum !== dbValue
            const isEmpty = !inputValue

            return (
              <div key={m} style={{
                background: isSaved ? 'var(--green-soft, #d1fae5)' : hasChange ? 'var(--amber-soft, #fef3c7)' : dbValue ? 'var(--bg-elevated)' : 'var(--bg-input)',
                border: `2px solid ${isSaved ? 'var(--green, #10b981)' : hasChange ? 'var(--amber, #f59e0b)' : dbValue ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: 10, padding: '14px 16px',
                transition: 'all 0.3s'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{monthFull(m)}</div>
                    <div style={{ fontSize: 9, color: 'var(--ink-muted)', marginTop: 2 }}>
                      Ay sonu kuru
                    </div>
                  </div>
                  {dbValue && (
                    <button onClick={() => handleDelete(m)} disabled={isSaving} title="Bu ay kurunu sil" style={{
                      width: 26, height: 26, borderRadius: 6, color: 'var(--ink-muted)',
                      background: 'transparent', border: 'none', cursor: 'pointer'
                    }}>
                      <Icon name="trash" size={12}/>
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="number" step="0.0001" min="0"
                    value={inputValue}
                    onChange={e => handleInputChange(m, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(m) }}
                    placeholder="36.0000"
                    disabled={isSaving}
                    style={{
                      flex: 1, padding: '10px 12px', fontSize: 15,
                      fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                      border: '1px solid var(--line)', borderRadius: 7,
                      background: 'var(--bg-card)', color: 'var(--ink)',
                      textAlign: 'right'
                    }}
                  />
                  <button onClick={() => handleSave(m)} disabled={isSaving || isEmpty} title="Kaydet" style={{
                    padding: '10px 12px',
                    background: isSaved ? 'var(--green)' : hasChange ? 'var(--amber)' : 'var(--gradient-1)',
                    color: 'white', border: 'none', borderRadius: 7,
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    minWidth: 40, opacity: (isSaving || isEmpty) ? 0.5 : 1
                  }}>
                    {isSaved ? '✓' : isSaving ? '...' : '💾'}
                  </button>
                </div>

                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--ink-muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>1 CHF = ? TL</span>
                  {dbValue && !hasChange && (
                    <span style={{ color: 'var(--green)' }}>✓ Kaydedildi</span>
                  )}
                  {hasChange && (
                    <span style={{ color: 'var(--amber)', fontWeight: 700 }}>⚠ Kaydedilmedi</span>
                  )}
                  {!dbValue && isEmpty && (
                    <span style={{ color: 'var(--ink-faint)' }}>Boş</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ALT BARDA TOPLU KAYDET */}
        {pendingChanges > 0 && (
          <div style={{
            marginTop: 18, padding: '12px 16px',
            background: 'var(--amber-soft, #fef3c7)', border: '1px solid var(--amber, #f59e0b)',
            borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
          }}>
            <div style={{ fontSize: 12, color: 'var(--amber, #f59e0b)', fontWeight: 600 }}>
              ⚠ <strong>{pendingChanges} ay</strong> için kaydedilmemiş değişiklik var
            </div>
            <button onClick={handleBulkSave} disabled={bulkSaving} style={{
              padding: '9px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: 'var(--gradient-1)', color: 'white', border: 'none', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)'
            }}>
              {bulkSaving ? 'Kaydediliyor...' : '💾 Tüm Değişiklikleri Kaydet'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
