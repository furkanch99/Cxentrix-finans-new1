import React, { useState, useEffect, useMemo } from 'react'
import { Icon, fmtTL, monthName, monthFull } from '../utils'
import { useCurrency, fmtCHF, FALLBACK_RATE } from '../CurrencyContext'
import {
  fetchFatihSettings, fetchFatihSalaries, accrueFatihSalary, deleteFatihSalary,
  fetchTugbaSalaries, accrueTugbaSalary, deleteTugbaSalary,
  getRateForDate,
} from '../dataService'
import { isFatihTransferTx } from '../fatihHelper'
import { PaymentPieChart } from '../charts'
import { useToast } from '../Toast'

const safeNumber = (v, def = 0) => {
  const n = parseFloat(v)
  return isNaN(n) || !isFinite(n) ? def : n
}
const safeRate = (rate) => {
  const r = parseFloat(rate)
  if (!r || isNaN(r) || !isFinite(r) || r <= 0) return FALLBACK_RATE
  return r
}
const safeDate = (date) => {
  if (!date) return null
  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return null
    return d
  } catch { return null }
}

export default function FatihAccount({ data, reload }) {
  const toast = useToast()
  const currency = useCurrency()
  const getRateAt = currency?.getRateAt || (() => 36)

  const [tab, setTab] = useState('summary')
  const [settings, setSettings] = useState(null)
  const [salaries, setSalaries] = useState([])
  const [tugbaSalaries, setTugbaSalaries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSalaryModal, setShowSalaryModal] = useState(false)
  const [showTugbaModal, setShowTugbaModal] = useState(false)
  const [detailModal, setDetailModal] = useState(null)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [s, sal, tug] = await Promise.all([
        fetchFatihSettings().catch(() => null),
        fetchFatihSalaries().catch(() => []),
        fetchTugbaSalaries().catch(() => []),
      ])
      setSettings(s)
      setSalaries(Array.isArray(sal) ? sal : [])
      setTugbaSalaries(Array.isArray(tug) ? tug : [])
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getSafeRate = (date) => {
    if (!date) return FALLBACK_RATE
    try { return safeRate(getRateAt(date)) } catch { return FALLBACK_RATE }
  }

  const fatihData = useMemo(() => {
    try {
      if (!settings) return null
      
      const allTxs = (data && Array.isArray(data.transactions)) ? data.transactions : []
      const startDate = settings.initial_balance_date || '2026-05-01'
      
      // French Team Primi işlemleri
      const frenchTxs = allTxs.filter(t => {
        if (!t || t.type !== 'expense') return false
        if (!t.date || t.date < startDate) return false
        return String(t.category || '').toLowerCase().includes('french team')
      })

      // Fatih'in cebinden ödediği şirket harcamaları (Şirket İçi Harcamalar)
      const advanceTxs = allTxs.filter(t => {
        if (!t || t.type !== 'expense') return false
        if (!t.date || t.date < startDate) return false
        const cat = String(t.category || '').toLowerCase()
        const pay = String(t.paymentType || '').toLowerCase()
        return pay.includes('fatih') && !cat.includes('fatih') && !cat.includes('french team')
      })

      // Şirket'ten Fatih'e transfer
      // Maaş ve prim aynı kategoride saklandığı için (Fatih Karakaş)
      // sadece açıklamasında "maaş/aylık/primi" geçmeyenler — yani gerçek
      // para transferleri — burada sayılır. Maaşlar zaten salaries
      // tablosundan ayrıca hesaplanıyor; çift sayıma engel olur.
      const transferTxs = allTxs.filter(t => {
        if (!t || t.type !== 'expense') return false
        if (!t.date || t.date < startDate) return false
        return isFatihTransferTx(t)
      })

      // TL toplamı (kategoride amount TL olarak saklanır)
      const sumTry = (txs) => txs.reduce((s, t) => s + safeNumber(t.amount), 0)
      // CHF toplamı (her işlemin tarihindeki kuru kullanarak çevir)
      const sumChf = (txs) => txs.reduce((s, t) => {
        const rate = getSafeRate(t.date)
        return s + (rate > 0 ? safeNumber(t.amount) / rate : 0)
      }, 0)

      // Maaşlar direkt salaries tablosundan
      const salaryChfTotal = (salaries || []).reduce((s, sal) => s + safeNumber(sal.amount_chf), 0)
      const salaryTryTotal = (salaries || []).reduce((s, sal) => s + safeNumber(sal.amount_try), 0)

      // Tuğba maaşı — Fatih hakedişinden düşülür
      const tugbaChfTotal = (tugbaSalaries || []).reduce((s, sal) => s + safeNumber(sal.amount_chf), 0)
      const tugbaTryTotal = (tugbaSalaries || []).reduce((s, sal) => s + safeNumber(sal.amount_try), 0)

      // French Team Primi, Şirket İçi Harcamalar, Şirket→Fatih transfer
      const frenchTryTotal   = sumTry(frenchTxs)
      const frenchChfTotal   = sumChf(frenchTxs)
      const advanceTryTotal  = sumTry(advanceTxs)
      const advanceChfTotal  = sumChf(advanceTxs)
      const transferTryTotal = sumTry(transferTxs)
      const transferChfTotal = sumChf(transferTxs)

      // Açılış bakiyesi
      // Settings ekranı `initial_balance_chf`/`initial_balance_try` alanlarına
      // yazıyor; eski `opening_balance_chf` adı eşleşmediği için bakiye burada
      // 0 görünüyordu. Önce yeni alanı oku, yoksa eski isime düş.
      const openingBalanceChf = safeNumber(
        settings.initial_balance_chf ?? settings.opening_balance_chf
      )
      const openingBalanceTry = safeNumber(
        settings.initial_balance_try ?? openingBalanceChf * 54
      )

      // Şirketin Fatih'e borcu:
      //   + Açılış bakiyesi
      //   + Tahakkuk eden maaşlar
      //   + French Team primleri
      //   + Şirket içi harcamalar (Fatih'in cebinden)
      //   - Şirketten Fatih'e yapılan transferler
      //   - Tuğba Karakaş maaşı (Fatih hakedişinden düşülür)
      const totalChf = openingBalanceChf + salaryChfTotal + frenchChfTotal + advanceChfTotal
                       - transferChfTotal - tugbaChfTotal
      const totalTry = openingBalanceTry + salaryTryTotal + frenchTryTotal + advanceTryTotal
                       - transferTryTotal - tugbaTryTotal

      return {
        initialTry: 0,
        initialChf: 0,
        openingBalanceChf,
        openingBalanceTry,
        salaryTxs: salaries || [],
        salaryTry: salaryTryTotal,
        salaryChf: salaryChfTotal,
        tugbaTxs: tugbaSalaries || [],
        tugbaTry: tugbaTryTotal,
        tugbaChf: tugbaChfTotal,
        frenchTxs,
        frenchTry: frenchTryTotal,
        frenchChf: frenchChfTotal,
        advanceTxs,
        advanceTry: advanceTryTotal,
        advanceChf: advanceChfTotal,
        transferTxs,
        transferTry: transferTryTotal,
        transferChf: transferChfTotal,
        balanceTry: totalTry,
        balanceChf: totalChf,
        startDate,
      }
    } catch (err) {
      console.error(err)
      return null
    }
  }, [data, settings, salaries, tugbaSalaries, getSafeRate])

  const handleDeleteSalary = async (id) => {
    if (!confirm('Bu maaş tahakkukunu silmek istediğine emin misin? İlişkili gider de silinecek.')) return
    try {
      await deleteFatihSalary(id)
      await loadData()
      if (reload) await reload()
      toast.success('Maaş tahakkuku silindi')
    } catch (err) {
      toast.error('Hata: ' + err.message)
    }
  }

  const handleDeleteTugba = async (id) => {
    if (!confirm('Bu Tuğba maaş kaydını silmek istediğine emin misin?')) return
    try {
      await deleteTugbaSalary(id)
      await loadData()
      if (reload) await reload()
      toast.success('Tuğba maaş kaydı silindi')
    } catch (err) {
      toast.error('Hata: ' + err.message)
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>
      <div className="spinner" style={{ width: 30, height: 30, border: '3px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%', margin: '0 auto 12px' }}></div>
      Fatih hesabı yükleniyor...
    </div>
  }

  if (loadError) {
    return <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 24, color: '#991b1b' }}>
      <h3>⚠ Hata: {loadError}</h3>
      <button onClick={loadData} style={{ marginTop: 12, padding: '8px 16px', background: '#ef4444', color: 'white', borderRadius: 6 }}>Tekrar Dene</button>
    </div>
  }

  if (!settings) {
    return <div style={{ background: 'var(--amber-soft, #fef3c7)', border: '1px solid var(--amber, #f59e0b)', borderRadius: 12, padding: 30, textAlign: 'center' }}>
      <h3>Fatih Ayarları Bulunamadı</h3>
      <p style={{ fontSize: 13 }}>Önce <strong>Ayarlar → Fatih Karakaş</strong> sekmesinden ayarları girin.</p>
    </div>
  }

  if (!fatihData) return <div style={{ padding: 40 }}>Veri hazırlanamadı.</div>

  return (
    <div>
      <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 10, padding: 4, marginBottom: 18, position: 'relative', width: 'fit-content' }}>
        <div style={{
          position: 'absolute', top: 4, bottom: 4,
          left: tab === 'summary' ? 4 : '50%',
          width: 'calc(50% - 4px)',
          background: 'var(--gradient-1)', borderRadius: 7,
          transition: 'left 0.25s ease',
          boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)', zIndex: 0
        }}/>
        <button onClick={() => setTab('summary')} style={{
          padding: '9px 20px', borderRadius: 7, fontSize: 12, fontWeight: 600,
          color: tab === 'summary' ? 'white' : 'var(--ink-muted)',
          background: 'transparent', position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer'
        }}>
          <Icon name="wallet" size={13} /> Cari Hesap
        </button>
        <button onClick={() => setTab('hakedis')} style={{
          padding: '9px 20px', borderRadius: 7, fontSize: 12, fontWeight: 600,
          color: tab === 'hakedis' ? 'white' : 'var(--ink-muted)',
          background: 'transparent', position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer'
        }}>
          <Icon name="chart" size={13} /> Hakediş Tablosu
        </button>
      </div>

      {tab === 'summary' ? (
        <SummaryView
          fatihData={fatihData}
          settings={settings}
          salaries={salaries}
          tugbaSalaries={tugbaSalaries}
          onAddSalary={() => setShowSalaryModal(true)}
          onAddTugba={() => setShowTugbaModal(true)}
          handleDeleteSalary={handleDeleteSalary}
          handleDeleteTugba={handleDeleteTugba}
          setDetailModal={setDetailModal}
        />
      ) : (
        <HakedisView
          fatihData={fatihData}
          settings={settings}
          getSafeRate={getSafeRate}
        />
      )}

      {detailModal && <DetailModal modal={detailModal} onClose={() => setDetailModal(null)} getSafeRate={getSafeRate} />}
      {showSalaryModal && (
        <AccrueSalaryModal
          settings={settings}
          existingSalaries={salaries}
          onClose={() => setShowSalaryModal(false)}
          onSuccess={async () => { await loadData(); if (reload) await reload(); setShowSalaryModal(false) }}
        />
      )}
      {showTugbaModal && (
        <AccrueTugbaModal
          existingSalaries={tugbaSalaries}
          onClose={() => setShowTugbaModal(false)}
          onSuccess={async () => { await loadData(); if (reload) await reload(); setShowTugbaModal(false) }}
        />
      )}
    </div>
  )
}

// ============= CARI HESAP GÖRÜNÜMÜ =============
function SummaryView({ fatihData, settings, salaries, tugbaSalaries, onAddSalary, onAddTugba, handleDeleteSalary, handleDeleteTugba, setDetailModal }) {
  const isPositive = fatihData.balanceTry > 0
  const isNegative = fatihData.balanceTry < 0
  const salaryAmount = safeNumber(settings.monthly_salary_chf, 4000)
  const settingsDate = safeDate(settings.initial_balance_date)
  const settingsDateStr = settingsDate ? settingsDate.toLocaleDateString('tr-TR') : '—'

  return (
    <div className="fade-in">

      <div className="glow-card" style={{
        background: isPositive ? 'var(--gradient-1)' : isNegative ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'var(--bg-card)',
        color: (isPositive || isNegative) ? 'white' : 'var(--ink)',
        border: (isPositive || isNegative) ? 'none' : '1px solid var(--line)',
        borderRadius: 16, padding: '28px 32px', marginBottom: 24,
        position: 'relative', overflow: 'hidden',
        boxShadow: isPositive ? '0 8px 32px rgba(99, 102, 241, 0.3)' : isNegative ? '0 8px 32px rgba(239, 68, 68, 0.3)' : 'var(--shadow-md)'
      }}>
        <div style={{ position: 'absolute', top: -60, right: -60, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)' }}/>
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', opacity: 0.85, fontWeight: 600, marginBottom: 10 }}>
            {isPositive ? "Şirket Fatih'e Borçlu" : isNegative ? "Fatih Şirkete Borçlu" : "Bakiye Eşit"}
          </div>
          <div className="mono" style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 6 }}>{fmtCHF(Math.abs(fatihData.balanceChf))}</div>
          <div className="mono" style={{ fontSize: 20, opacity: 0.85 }}>≈ {fmtTL(Math.abs(fatihData.balanceTry))}</div>
        </div>
      </div>

      {/* MAAŞ EKLE BUTONLARI */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--line)',
        borderRadius: 12, padding: '14px 18px', marginBottom: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap'
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Maaş Tahakkuk Etme</div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>Aylık olarak Fatih veya Tuğba'nın maaşını elle gir</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onAddSalary} style={{
            background: 'var(--gradient-1)', color: 'white', padding: '9px 16px',
            borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: 'none', display: 'flex', alignItems: 'center', gap: 6
          }}>
            <Icon name="plus" size={13}/> Fatih Maaşı Ekle
          </button>
          <button onClick={onAddTugba} style={{
            background: 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)', color: 'white',
            padding: '9px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: 'none', display: 'flex', alignItems: 'center', gap: 6
          }}>
            <Icon name="plus" size={13}/> Tuğba Maaşı Ekle
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <ClickableCard label="Toplam Maaş" value={fmtCHF(fatihData.salaryChf)} subtitle={`${fatihData.salaryTxs.length} ay · ${fmtTL(fatihData.salaryTry)}`} color="green" icon="users" onClick={() => setDetailModal({ type: 'salary', title: 'Maaş Tahakkukları', txs: fatihData.salaryTxs, color: 'var(--green)' })} />
        <ClickableCard label="French Team Primi" value={fmtCHF(fatihData.frenchChf)} subtitle={`${fatihData.frenchTxs.length} kayıt · ${fmtTL(fatihData.frenchTry)}`} color="blue" icon="spark" onClick={() => setDetailModal({ type: 'french', title: 'French Team Primi', txs: fatihData.frenchTxs, color: 'var(--blue)' })} />
        <ClickableCard label="Şirket → Fatih Transfer" value={fmtCHF(fatihData.transferChf)} subtitle={`${fatihData.transferTxs.length} işlem · ${fmtTL(fatihData.transferTry)}`} color="red" icon="arrowDown" onClick={() => setDetailModal({ type: 'transfer', title: 'Şirket → Fatih Transferleri', txs: fatihData.transferTxs, color: 'var(--red)' })} />
        <ClickableCard label="Şirket İçi Harcamalar" value={fmtCHF(fatihData.advanceChf)} subtitle={`${fatihData.advanceTxs.length} işlem · ${fmtTL(fatihData.advanceTry)}`} color="amber" icon="arrowUp" onClick={() => setDetailModal({ type: 'advance', title: 'Şirket İçi Harcamalar', txs: fatihData.advanceTxs, color: 'var(--amber)' })} />
        <ClickableCard label="Tuğba Maaşı" value={fmtCHF(fatihData.tugbaChf)} subtitle={`${fatihData.tugbaTxs.length} ay · ${fmtTL(fatihData.tugbaTry)}`} color="red" icon="users" onClick={() => setDetailModal({ type: 'tugba', title: 'Tuğba Karakaş Maaşları', txs: fatihData.tugbaTxs, color: '#f43f5e' })} />
      </div>

      {/* Donut + Bakiye Hesabı yan yana */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 1.4fr', gap: 14, marginBottom: 18 }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 18, border: '1px solid var(--line)' }}>
          <h3 className="display" style={{ fontSize: 14, marginBottom: 10 }}>Borcun Kompozisyonu</h3>
          <BalanceDonut data={fatihData} />
        </div>

        <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)' }}>
          <h3 className="display" style={{ fontSize: 15, marginBottom: 14 }}>Bakiye Hesabı</h3>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, lineHeight: 2 }}>
            <Row label="Başlangıç Bakiyesi" chf={fatihData.openingBalanceChf} tl={fatihData.openingBalanceTry} sign="" color="var(--ink-soft)" />
            <Row label="+ Maaş Tahakkukları" chf={fatihData.salaryChf} tl={fatihData.salaryTry} sign="+" color="var(--green)" />
            <Row label="+ French Team Primleri" chf={fatihData.frenchChf} tl={fatihData.frenchTry} sign="+" color="var(--blue)" />
            <Row label="+ Şirket İçi Harcamalar" chf={fatihData.advanceChf} tl={fatihData.advanceTry} sign="+" color="var(--amber)" />
            <Row label="− Şirket → Fatih Transferleri" chf={fatihData.transferChf} tl={fatihData.transferTry} sign="−" color="var(--red)" />
            <Row label="− Tuğba Karakaş Maaşı" chf={fatihData.tugbaChf} tl={fatihData.tugbaTry} sign="−" color="#f43f5e" />
            <div style={{ borderTop: '2px solid var(--accent)', marginTop: 8, paddingTop: 12 }}>
              <Row label="MEVCUT BAKİYE" chf={fatihData.balanceChf} tl={fatihData.balanceTry} sign="" color={isPositive ? 'var(--green)' : isNegative ? 'var(--red)' : 'var(--ink)'} bold />
            </div>
          </div>
        </div>
      </div>

      {/* Son hareketler timeline */}
      <RecentActivityPanel fatihData={fatihData} />

      {/* Sekmeli detay paneli: Maaş / Prim / Transfer / Şirket İçi / Tuğba */}
      <GroupedDetailPanel
        fatihData={fatihData}
        salaries={salaries}
        tugbaSalaries={tugbaSalaries}
        handleDeleteSalary={handleDeleteSalary}
        handleDeleteTugba={handleDeleteTugba}
      />
    </div>
  )
}

// ============= BORÇ KOMPOZİSYONU DONUT =============
function BalanceDonut({ data }) {
  const slices = [
    { n: 'Açılış Bakiyesi', a: Math.max(0, safeNumber(data.openingBalanceTry)) },
    { n: 'Maaş Tahakkukları', a: Math.max(0, safeNumber(data.salaryTry)) },
    { n: 'French Team Primi', a: Math.max(0, safeNumber(data.frenchTry)) },
    { n: 'Şirket İçi Harcamalar', a: Math.max(0, safeNumber(data.advanceTry)) },
  ].filter(s => s.a > 0)

  const total = slices.reduce((s, x) => s + x.a, 0)
  if (slices.length === 0 || total === 0) {
    return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-muted)', fontSize: 12 }}>Henüz pozitif kalem yok</div>
  }

  return (
    <div>
      <PaymentPieChart data={slices} />
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-muted)', textAlign: 'center', lineHeight: 1.6 }}>
        Toplam alacak: <strong style={{ color: 'var(--ink)' }} className="mono">{fmtTL(total)}</strong>
        {data.transferTry > 0 && <span> · Çekilen: <strong style={{ color: 'var(--red)' }} className="mono">{fmtTL(data.transferTry)}</strong></span>}
        {data.tugbaTry > 0 && <span> · Tuğba: <strong style={{ color: '#f43f5e' }} className="mono">{fmtTL(data.tugbaTry)}</strong></span>}
      </div>
    </div>
  )
}

// ============= SON HAREKETLER TIMELINE =============
function RecentActivityPanel({ fatihData }) {
  const events = useMemo(() => {
    const all = []
    fatihData.salaryTxs.forEach(s => {
      // Maaş satırlarında date yok, year+month kullanılır → ayın 1'i olarak ele al
      const d = (s.year != null && s.month != null)
        ? `${s.year}-${String(s.month + 1).padStart(2, '0')}-01`
        : null
      if (!d) return
      all.push({
        kind: 'salary',
        date: d,
        amount_try: safeNumber(s.amount_try),
        amount_chf: safeNumber(s.amount_chf),
        label: `${monthFull(s.month)} ${s.year} maaşı`,
        sign: '+', color: 'var(--green)', icon: 'users',
      })
    })
    fatihData.frenchTxs.forEach(t => {
      all.push({
        kind: 'french', date: t.date,
        amount_try: safeNumber(t.amount), amount_chf: safeNumber(t.amount) / 54,
        label: t.description || 'French Team Primi',
        sign: '+', color: 'var(--blue)', icon: 'spark',
      })
    })
    fatihData.advanceTxs.forEach(t => {
      all.push({
        kind: 'advance', date: t.date,
        amount_try: safeNumber(t.amount), amount_chf: safeNumber(t.amount) / 54,
        label: t.description ? `Şirket içi harcama: ${t.description}` : `Şirket içi harcama (${t.category})`,
        sign: '+', color: 'var(--amber)', icon: 'arrowUp',
      })
    })
    fatihData.transferTxs.forEach(t => {
      all.push({
        kind: 'transfer', date: t.date,
        amount_try: safeNumber(t.amount), amount_chf: safeNumber(t.amount) / 54,
        label: t.description || 'Şirket → Fatih Transferi',
        sign: '−', color: 'var(--red)', icon: 'arrowDown',
      })
    })
    fatihData.tugbaTxs.forEach(s => {
      // Tuğba maaşı kayıtlarında tarih `date` yerine `year+month` üzerinden hesaplanır
      const d = (s.year != null && s.month != null)
        ? `${s.year}-${String(s.month + 1).padStart(2, '0')}-01`
        : null
      if (!d) return
      all.push({
        kind: 'tugba', date: d,
        amount_try: safeNumber(s.amount_try),
        amount_chf: safeNumber(s.amount_chf),
        label: `${monthFull(s.month)} ${s.year} Tuğba maaşı${s.notes ? ' — ' + s.notes : ''}`,
        sign: '−', color: '#f43f5e', icon: 'users',
      })
    })
    return all.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15)
  }, [fatihData])

  if (events.length === 0) return null

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 18, border: '1px solid var(--line)', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="display" style={{ fontSize: 15 }}>Son Hareketler</h3>
        <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{events.length} kayıt</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {events.map((e, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 90px 1fr 130px', gap: 10, padding: '8px 8px', borderRadius: 6, alignItems: 'center', background: i % 2 === 0 ? 'var(--bg-elevated)' : 'transparent' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.04)', color: e.color, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${e.color}` }}>
              <Icon name={e.icon} size={13} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
              {new Date(e.date).toLocaleDateString('tr-TR')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.label}>
              {e.label}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: e.color }}>{e.sign}{fmtCHF(Math.abs(e.amount_chf))}</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{e.sign}{fmtTL(Math.abs(e.amount_try))}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============= SEKMELİ DETAY PANELİ =============
function GroupedDetailPanel({ fatihData, salaries, tugbaSalaries, handleDeleteSalary, handleDeleteTugba }) {
  const [tab, setTab] = useState('salary')

  const tabs = [
    { key: 'salary',   label: 'Maaşlar',     count: salaries.length, color: 'var(--green)' },
    { key: 'french',   label: 'Primler',     count: fatihData.frenchTxs.length, color: 'var(--blue)' },
    { key: 'transfer', label: 'Transferler', count: fatihData.transferTxs.length, color: 'var(--red)' },
    { key: 'advance',  label: 'Şirket İçi Harcamalar', count: fatihData.advanceTxs.length, color: 'var(--amber)' },
    { key: 'tugba',    label: 'Tuğba Maaşı', count: tugbaSalaries.length, color: '#f43f5e' },
  ]

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 18, border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <h3 className="display" style={{ fontSize: 15 }}>Detaylı Döküm</h3>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-input)', border: '1px solid var(--line)', borderRadius: 8, padding: 3 }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: tab === t.key ? t.color : 'transparent',
              color: tab === t.key ? 'white' : 'var(--ink-muted)',
              border: 'none', cursor: 'pointer'
            }}>
              {t.label} <span style={{ opacity: 0.7, marginLeft: 4 }}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'salary' && (
        salaries.length === 0
          ? <EmptyState text="Henüz maaş tahakkuku yok."/>
          : <SimpleTable
              cols={['120px', '1fr', '130px', '130px', '40px']}
              headers={['Ay', 'Kur', 'CHF', 'TL', '']}
              rows={salaries.map(s => ({
                key: s.id,
                cells: [
                  <span style={{ fontWeight: 500 }}>{monthFull(s.month)} {s.year}</span>,
                  <span style={{ color: 'var(--ink-muted)' }}>1 CHF = {safeNumber(s.chf_to_try_rate).toFixed(4)}</span>,
                  <span className="mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green)' }}>{fmtCHF(safeNumber(s.amount_chf))}</span>,
                  <span className="mono" style={{ textAlign: 'right', color: 'var(--ink-soft)' }}>{fmtTL(safeNumber(s.amount_try))}</span>,
                  <button onClick={() => handleDeleteSalary(s.id)} style={{ color: 'var(--ink-muted)', padding: 4, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    <Icon name="trash" size={13}/>
                  </button>,
                ],
              }))}
            />
      )}

      {tab === 'french' && (
        fatihData.frenchTxs.length === 0
          ? <EmptyState text="Henüz French Team primi yok."/>
          : <TxTable txs={fatihData.frenchTxs} color="var(--blue)" />
      )}
      {tab === 'transfer' && (
        fatihData.transferTxs.length === 0
          ? <EmptyState text="Henüz Şirket → Fatih transferi yok."/>
          : <TxTable txs={fatihData.transferTxs} color="var(--red)" />
      )}
      {tab === 'advance' && (
        fatihData.advanceTxs.length === 0
          ? <EmptyState text="Henüz şirket içi harcama yok."/>
          : <TxTable txs={fatihData.advanceTxs} color="var(--amber)" />
      )}
      {tab === 'tugba' && (
        tugbaSalaries.length === 0
          ? <EmptyState text="Henüz Tuğba maaş kaydı yok."/>
          : <SimpleTable
              cols={['120px', '1fr', '120px', '130px', '130px', '40px']}
              headers={['Ay', 'Kur', 'CHF', 'TL', 'Not', '']}
              rows={tugbaSalaries.map(s => ({
                key: s.id,
                cells: [
                  <span style={{ fontWeight: 500 }}>{monthFull(s.month)} {s.year}</span>,
                  <span style={{ color: 'var(--ink-muted)' }}>1 CHF = {safeNumber(s.chf_to_try_rate).toFixed(4)}</span>,
                  <span className="mono" style={{ textAlign: 'right', fontWeight: 600, color: '#f43f5e' }}>{fmtCHF(safeNumber(s.amount_chf))}</span>,
                  <span className="mono" style={{ textAlign: 'right', color: 'var(--ink-soft)' }}>{fmtTL(safeNumber(s.amount_try))}</span>,
                  <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{s.notes || '—'}</span>,
                  <button onClick={() => handleDeleteTugba(s.id)} style={{ color: 'var(--ink-muted)', padding: 4, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    <Icon name="trash" size={13}/>
                  </button>,
                ],
              }))}
            />
      )}
    </div>
  )
}

function TxTable({ txs, color }) {
  const sorted = [...txs].sort((a, b) => (a.date < b.date ? 1 : -1))
  return (
    <SimpleTable
      cols={['100px', '1fr', '160px', '120px', '110px']}
      headers={['Tarih', 'Açıklama', 'Kategori', 'CHF', 'TL']}
      rows={sorted.map(t => ({
        key: t.id,
        cells: [
          <span style={{ color: 'var(--ink-muted)' }}>{new Date(t.date).toLocaleDateString('tr-TR')}</span>,
          <span title={t.description} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{t.description || '—'}</span>,
          <span style={{ color: 'var(--ink-muted)', fontSize: 11 }}>{t.category}</span>,
          <span className="mono" style={{ textAlign: 'right', fontWeight: 600, color }}>{fmtCHF(safeNumber(t.amount) / 54)}</span>,
          <span className="mono" style={{ textAlign: 'right', color: 'var(--ink-soft)' }}>{fmtTL(safeNumber(t.amount))}</span>,
        ],
      }))}
    />
  )
}

function SimpleTable({ cols, headers, rows }) {
  const gridTemplate = cols.join(' ')
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 600 }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: 12, padding: '8px 8px', borderBottom: '2px solid var(--accent)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700 }}>
          {headers.map((h, i) => (
            <div key={i} style={{ textAlign: i >= headers.length - 2 ? 'right' : 'left' }}>{h}</div>
          ))}
        </div>
        {rows.map(r => (
          <div key={r.key} style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: 12, padding: '10px 8px', borderBottom: '1px solid var(--line-soft)', fontSize: 12, alignItems: 'center' }}>
            {r.cells}
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ text }) {
  return <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>{text}</div>
}

// ============= MAAŞ TAHAKKUK MODALI (YENİ) =============
function AccrueSalaryModal({ settings, existingSalaries, onClose, onSuccess }) {
  const modalToast = useToast()
  const now = new Date()
  const defaultSalary = safeNumber(settings.monthly_salary_chf, 4000)

  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [salaryChf, setSalaryChf] = useState(defaultSalary.toString())
  const [rate, setRate] = useState('')
  const [autoRate, setAutoRate] = useState(null)
  const [loadingRate, setLoadingRate] = useState(false)
  const [saving, setSaving] = useState(false)

  // Bu ay-yıl için kayıt var mı?
  const isAlreadyAccrued = useMemo(() => {
    return existingSalaries.some(s => s.year === year && s.month === month)
  }, [existingSalaries, year, month])

  // Otomatik kur (ay başı)
  useEffect(() => {
    const fetchAutoRate = async () => {
      setLoadingRate(true)
      try {
        const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
        const rateData = await getRateForDate(monthStart)
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

  const salaryNum = parseFloat(salaryChf) || 0
  const rateNum = parseFloat(rate) || 0
  const totalTry = salaryNum * rateNum
  const isRateManual = autoRate !== null && Math.abs(rateNum - autoRate) > 0.001
  const isSalaryManual = Math.abs(salaryNum - defaultSalary) > 0.001

  const handleSave = async () => {
    if (isAlreadyAccrued) {
      modalToast.error(`${monthFull(month)} ${year} için maaş zaten tahakkuk ettirilmiş!`)
      return
    }
    if (salaryNum <= 0) {
      modalToast.error('Geçerli bir maaş tutarı girin (CHF).')
      return
    }
    if (rateNum <= 0) {
      modalToast.error('Geçerli bir kur girin.')
      return
    }

    if (!confirm(`${monthFull(month)} ${year} için ${salaryNum} CHF maaş tahakkuk edilecek.\nKur: 1 CHF = ${rateNum.toFixed(4)} TL\nToplam: ${fmtTL(totalTry)}\n\nOnaylıyor musun?`)) return

    setSaving(true)
    try {
      // Hem kur hem CHF manuel olabilir - dataService'e ikisini de geçeceğiz
      await accrueFatihSalary(year, month, salaryNum, isRateManual ? rateNum : null)
      modalToast.success(`${monthFull(month)} ${year} maaşı tahakkuk ettirildi`)
      onSuccess()
    } catch (err) {
      modalToast.error('Hata: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const resetRateToAuto = () => {
    if (autoRate) setRate(autoRate.toFixed(4))
  }

  const resetSalaryToDefault = () => {
    setSalaryChf(defaultSalary.toString())
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
        <h2 className="display gradient-text" style={{ fontSize: 22, marginBottom: 4 }}>Yeni Maaş Tahakkuk</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 20 }}>
          Tüm değerler düzenlenebilir — istediğin ay, tutar ve kur için maaş ekle
        </p>

        {/* AY/YIL */}
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

        {/* Mevcut mu uyarısı */}
        {isAlreadyAccrued && (
          <div style={{
            background: 'var(--red-soft)', border: '1px solid var(--red)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 14,
            fontSize: 11, color: 'var(--red)', fontWeight: 600
          }}>
            ⚠ {monthFull(month)} {year} için maaş zaten kaydedilmiş. Önce eski kaydı silin.
          </div>
        )}

        {/* MAAŞ TUTARI - MANUEL */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>
            <span>Maaş Tutarı (CHF) {isSalaryManual && <span style={{ background: 'var(--amber)', color: 'white', padding: '2px 6px', borderRadius: 4, marginLeft: 6, letterSpacing: 'normal', textTransform: 'none' }}>FARKLI</span>}</span>
            {isSalaryManual && (
              <button onClick={resetSalaryToDefault} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 10, cursor: 'pointer', textTransform: 'none', letterSpacing: 'normal' }}>
                ↶ Varsayılana Dön ({defaultSalary} CHF)
              </button>
            )}
          </label>
          <input
            type="number" step="0.01" min="0"
            value={salaryChf}
            onChange={e => setSalaryChf(e.target.value)}
            placeholder="4000.00"
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14,
              fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
              border: isSalaryManual ? '2px solid var(--amber)' : '1px solid var(--line)',
              background: isSalaryManual ? 'var(--amber-soft, #fef3c7)' : 'var(--bg-input)'
            }}
          />
          <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 4 }}>
            Varsayılan ayarlar: {defaultSalary} CHF · İstediğin ay için farklı bir tutar girebilirsin
          </div>
        </div>

        {/* KUR - MANUEL */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>
            <span>CHF → TL Kuru {isRateManual && <span style={{ background: 'var(--amber)', color: 'white', padding: '2px 6px', borderRadius: 4, marginLeft: 6, letterSpacing: 'normal', textTransform: 'none' }}>MANUEL</span>}</span>
            {autoRate && isRateManual && (
              <button onClick={resetRateToAuto} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 10, cursor: 'pointer', textTransform: 'none', letterSpacing: 'normal' }}>
                ↶ Otomatik ({autoRate.toFixed(4)})
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
              autoRate ? `Sistem kuru: ${autoRate.toFixed(4)} TL (${monthFull(month)} ${year} ay başı) · İstersen değiştir` :
              'Sistem kuru bulunamadı, lütfen elden gir'}
          </div>
        </div>

        {/* HESAPLAMA ÖZETI */}
        <div style={{
          background: 'var(--accent-soft)', border: '1px solid var(--accent)',
          borderRadius: 12, padding: '14px 16px', marginBottom: 18
        }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 700, marginBottom: 8 }}>Tahakkuk Özeti</div>
          <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--ink-muted)' }}>Dönem</span>
              <span style={{ fontWeight: 600 }}>{monthFull(month)} {year}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--ink-muted)' }}>Maaş CHF</span>
              <span className="mono" style={{ fontWeight: 600 }}>{fmtCHF(salaryNum)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--ink-muted)' }}>Kur</span>
              <span className="mono">{rateNum.toFixed(4)} {isRateManual && <span style={{ color: 'var(--amber)', fontSize: 10, marginLeft: 4 }}>(manuel)</span>}</span>
            </div>
            <div style={{ borderTop: '1px solid var(--accent)', paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
              <span>TL Karşılığı</span>
              <span className="mono" style={{ color: 'var(--green)' }}>{fmtTL(totalTry)}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--line)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>İptal</button>
          <button onClick={handleSave} disabled={saving || isAlreadyAccrued || salaryNum <= 0 || rateNum <= 0} style={{
            padding: '10px 20px', borderRadius: 8,
            background: 'var(--gradient-1)', color: 'white',
            border: 'none', fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
            opacity: (saving || isAlreadyAccrued || salaryNum <= 0 || rateNum <= 0) ? 0.5 : 1
          }}>
            {saving ? 'Kaydediliyor...' : 'Maaşı Tahakkuk Ettir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============= TUĞBA MAAŞ TAHAKKUK MODALI =============
function AccrueTugbaModal({ existingSalaries, onClose, onSuccess }) {
  const modalToast = useToast()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [salaryTry, setSalaryTry] = useState('')  // TL olarak giriş
  const [rate, setRate] = useState('')
  const [autoRate, setAutoRate] = useState(null)
  const [loadingRate, setLoadingRate] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const isAlreadyAccrued = useMemo(() => {
    return existingSalaries.some(s => s.year === year && s.month === month)
  }, [existingSalaries, year, month])

  useEffect(() => {
    const fetchAutoRate = async () => {
      setLoadingRate(true)
      try {
        const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
        const rateData = await getRateForDate(monthStart)
        if (rateData && rateData.chf_to_try) {
          const v = parseFloat(rateData.chf_to_try)
          setAutoRate(v)
          setRate(v.toFixed(4))
        } else {
          setAutoRate(null)
          setRate(String(FALLBACK_RATE))
        }
      } catch {
        setAutoRate(null)
        setRate(String(FALLBACK_RATE))
      } finally {
        setLoadingRate(false)
      }
    }
    fetchAutoRate()
  }, [year, month])

  const totalTry = parseFloat(salaryTry) || 0
  const rateNum = parseFloat(rate) || 0
  const salaryChf = rateNum > 0 ? totalTry / rateNum : 0
  const isRateManual = autoRate !== null && Math.abs(rateNum - autoRate) > 0.001

  const handleSave = async () => {
    if (isAlreadyAccrued) {
      modalToast.error(`${monthFull(month)} ${year} için Tuğba maaşı zaten kayıtlı.`)
      return
    }
    if (totalTry <= 0) {
      modalToast.error('Geçerli bir maaş tutarı girin (TL).')
      return
    }
    if (rateNum <= 0) {
      modalToast.error('Geçerli bir kur girin.')
      return
    }
    if (!confirm(`${monthFull(month)} ${year} için Tuğba'ya ${fmtTL(totalTry)} maaş kaydedilecek.\nKur: 1 CHF = ${rateNum.toFixed(4)} TL\nCHF karşılığı: ${salaryChf.toFixed(2)} CHF\nFatih hakedişinden düşülecek.\n\nOnaylıyor musun?`)) return

    setSaving(true)
    try {
      // accrueTugbaSalary CHF bekliyor; TL/kur'dan CHF'i geçiyoruz.
      await accrueTugbaSalary(year, month, salaryChf, isRateManual ? rateNum : null, notes.trim() || null)
      modalToast.success(`${monthFull(month)} ${year} Tuğba maaşı kaydedildi`)
      onSuccess()
    } catch (err) {
      modalToast.error('Hata: ' + err.message)
    } finally {
      setSaving(false)
    }
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
        <div style={{ marginBottom: 4 }}>
          <h2 className="display" style={{ fontSize: 22, color: '#f43f5e' }}>Tuğba Karakaş Maaşı</h2>
        </div>
        <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 20 }}>
          Bu maaş Fatih'in hakedişinden düşülür — şirketin Fatih'e olan borcunu azaltır
        </p>

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

        {isAlreadyAccrued && (
          <div style={{
            background: 'var(--red-soft)', border: '1px solid var(--red)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 14,
            fontSize: 11, color: 'var(--red)', fontWeight: 600
          }}>
            ⚠ {monthFull(month)} {year} için Tuğba maaşı zaten kayıtlı. Önce eski kaydı silin.
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Maaş Tutarı (TL)</label>
          <input
            type="number" step="0.01" min="0"
            value={salaryTry}
            onChange={e => setSalaryTry(e.target.value)}
            placeholder="örn. 81000.00"
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14,
              fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
              border: '1px solid var(--line)', background: 'var(--bg-input)'
            }}
          />
          <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 4 }}>
            Tuğba'ya o ay TL cinsinden ödenen tutarı gir — CHF karşılığı kura göre otomatik hesaplanır
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>
            <span>CHF → TL Kuru {isRateManual && <span style={{ background: 'var(--amber)', color: 'white', padding: '2px 6px', borderRadius: 4, marginLeft: 6, letterSpacing: 'normal', textTransform: 'none' }}>MANUEL</span>}</span>
            {autoRate && isRateManual && (
              <button onClick={() => setRate(autoRate.toFixed(4))} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 10, cursor: 'pointer', textTransform: 'none', letterSpacing: 'normal' }}>
                ↶ Otomatik Kura Dön ({autoRate.toFixed(4)})
              </button>
            )}
          </label>
          <input
            type="number" step="0.0001" min="0"
            value={rate}
            onChange={e => setRate(e.target.value)}
            placeholder={loadingRate ? 'Yükleniyor...' : String(FALLBACK_RATE)}
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14,
              fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
              border: isRateManual ? '2px solid var(--amber)' : '1px solid var(--line)',
              background: isRateManual ? 'var(--amber-soft, #fef3c7)' : 'var(--bg-input)'
            }}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Not (Opsiyonel)</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Açıklama, ödeme tipi vs."
            style={{ width: '100%', padding: '10px 12px', fontSize: 13 }}
          />
        </div>

        <div style={{
          background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.35)',
          borderRadius: 12, padding: '14px 16px', marginBottom: 18
        }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#f43f5e', fontWeight: 700, marginBottom: 8 }}>Hesaplama</div>
          <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
              <span>Tuğba maaşı</span>
              <span className="mono" style={{ color: '#f43f5e' }}>{fmtTL(totalTry)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--ink-muted)' }}>Kur</span>
              <span className="mono">1 CHF = {rateNum.toFixed(4)} TL</span>
            </div>
            <div style={{ borderTop: '1px solid rgba(244, 63, 94, 0.3)', paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--ink-muted)' }}>CHF karşılığı</span>
              <span className="mono" style={{ color: 'var(--ink-soft)' }}>{salaryChf.toFixed(2)} CHF</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', textAlign: 'right' }}>
              Fatih hakedişinden bu tutar düşülecek
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--line)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>İptal</button>
          <button onClick={handleSave} disabled={saving || isAlreadyAccrued || totalTry <= 0 || rateNum <= 0} style={{
            padding: '10px 20px', borderRadius: 8,
            background: 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)', color: 'white',
            border: 'none', fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
            opacity: (saving || isAlreadyAccrued || totalTry <= 0 || rateNum <= 0) ? 0.5 : 1
          }}>
            {saving ? 'Kaydediliyor...' : 'Tuğba Maaşını Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============= HAKEDİŞ TABLOSU =============
function HakedisView({ fatihData, settings, getSafeRate }) {
  const [year, setYear] = useState(new Date().getFullYear())

  const availableYears = useMemo(() => {
    const ys = new Set()
    // Maaş kayıtlarında tarih `date` yerine `year` alanında.
    ;(fatihData.salaryTxs   || []).forEach(s => { if (s && s.year != null) ys.add(s.year) })
    ;(fatihData.tugbaTxs    || []).forEach(s => { if (s && s.year != null) ys.add(s.year) })
    ;(fatihData.frenchTxs   || []).forEach(t => { if (!t) return; const y = new Date(t.date).getFullYear(); if (!isNaN(y)) ys.add(y) })
    ;(fatihData.transferTxs || []).forEach(t => { if (!t) return; const y = new Date(t.date).getFullYear(); if (!isNaN(y)) ys.add(y) })
    ys.add(new Date().getFullYear())
    return Array.from(ys).sort((a,b) => b-a)
  }, [fatihData])

  const monthlyHakedis = useMemo(() => {
    const months = Array.from({length: 12}, (_, m) => ({
      month: m,
      hakedisChf: 0,
      salaryChf: 0,
      frenchChf: 0,
      advanceChf: 0,
      salaryTry: 0,
      frenchTry: 0,
      advanceTry: 0,
      transferTry: 0,
      transferChf: 0,
      tugbaChf: 0,
      tugbaTry: 0,
      rate: FALLBACK_RATE,
    }))

    // salaryTxs aslında fatih_monthly_salaries kayıtlarıdır:
    //   { year, month, amount_chf, amount_try, chf_to_try_rate, ... }
    // Daha önce burada transaction varmış gibi t.date / t.amount okunuyordu,
    // bu yüzden Hakediş tablosundaki Maaş tutarı sürekli 0 çıkıyordu.
    ;(fatihData.salaryTxs || []).forEach(sal => {
      if (!sal || sal.year !== year) return
      const m = sal.month
      if (m == null || m < 0 || m > 11) return
      months[m].salaryChf += safeNumber(sal.amount_chf)
      months[m].salaryTry += safeNumber(sal.amount_try)
      const rate = safeNumber(sal.chf_to_try_rate, FALLBACK_RATE)
      if (rate > 0) months[m].rate = rate
    })

    ;(fatihData.frenchTxs || []).forEach(t => {
      if (!t || !t.date) return
      const d = new Date(t.date)
      if (d.getFullYear() !== year) return
      const m = d.getMonth()
      const rate = getSafeRate(t.date)
      months[m].frenchChf += safeNumber(t.amount) / rate
      months[m].frenchTry += safeNumber(t.amount)
      months[m].rate = rate
    })

    // Şirket içi harcamalar (eskiden "Avans") — Fatih'in cebinden ödediği
    // ama kategorisi şirket gideri olan işlemler. Bunlar da hakedişin
    // parçasıdır çünkü şirket Fatih'e bu tutarı borçlanır.
    ;(fatihData.advanceTxs || []).forEach(t => {
      if (!t || !t.date) return
      const d = new Date(t.date)
      if (d.getFullYear() !== year) return
      const m = d.getMonth()
      const rate = getSafeRate(t.date)
      months[m].advanceChf += safeNumber(t.amount) / rate
      months[m].advanceTry += safeNumber(t.amount)
      months[m].rate = rate
    })

    ;(fatihData.transferTxs || []).forEach(t => {
      if (!t || !t.date) return
      const d = new Date(t.date)
      if (d.getFullYear() !== year) return
      const m = d.getMonth()
      const rate = getSafeRate(t.date)
      months[m].transferTry += safeNumber(t.amount)
      months[m].transferChf += safeNumber(t.amount) / rate
      months[m].rate = rate
    })

    // Tuğba maaşları — fatih_monthly_salaries ile aynı yapıda (year+month)
    ;(fatihData.tugbaTxs || []).forEach(s => {
      if (!s || s.year !== year) return
      const m = s.month
      if (m == null || m < 0 || m > 11) return
      months[m].tugbaChf += safeNumber(s.amount_chf)
      months[m].tugbaTry += safeNumber(s.amount_try)
      const rate = safeNumber(s.chf_to_try_rate, FALLBACK_RATE)
      if (rate > 0) months[m].rate = rate
    })

    months.forEach(m => {
      m.hakedisChf = m.salaryChf + m.frenchChf + m.advanceChf
      m.hakedisTry = m.salaryTry + m.frenchTry + m.advanceTry
      m.kalanChf = m.hakedisChf - m.transferChf - m.tugbaChf
      m.kalanTry = m.hakedisTry - m.transferTry - m.tugbaTry
    })

    return months
  }, [fatihData, year, getSafeRate])

  const activeMonths = monthlyHakedis.filter(m =>
    m.hakedisChf > 0 || m.transferChf > 0 || m.tugbaChf > 0
  )
  const monthlyHakedisChf = activeMonths.reduce((s, m) => s + m.hakedisChf, 0)
  const monthlyHakedisTry = activeMonths.reduce((s, m) => s + m.hakedisTry, 0)

  // Başlangıç bakiyesi (Fatih'in açılışta sahip olduğu alacak),
  // sadece başlangıç tarihinin yılı seçildiğinde toplamlara eklenir.
  const startYear = fatihData.startDate ? new Date(fatihData.startDate).getFullYear() : null
  const openingChfForYear = startYear === year ? safeNumber(fatihData.openingBalanceChf) : 0
  const openingTryForYear = startYear === year ? safeNumber(fatihData.openingBalanceTry) : 0
  const showOpeningRow = openingChfForYear !== 0 || openingTryForYear !== 0

  const totalHakedisChf = monthlyHakedisChf + openingChfForYear
  const totalHakedisTry = monthlyHakedisTry + openingTryForYear
  const totalTransferTry = activeMonths.reduce((s, m) => s + m.transferTry, 0)
  const totalTransferChf = activeMonths.reduce((s, m) => s + m.transferChf, 0)
  const totalKalanChf = totalHakedisChf - totalTransferChf - totalTugbaChf
  const totalKalanTry = totalHakedisTry - totalTransferTry - totalTugbaTry

  // Kırılım toplamları (Maaş / Prim / Şirket İçi Harcamalar)
  const totalSalaryChf  = activeMonths.reduce((s, m) => s + m.salaryChf, 0)
  const totalFrenchChf  = activeMonths.reduce((s, m) => s + m.frenchChf, 0)
  const totalAdvanceChf = activeMonths.reduce((s, m) => s + m.advanceChf, 0)
  const totalTugbaTry   = activeMonths.reduce((s, m) => s + m.tugbaTry, 0)
  const totalTugbaChf   = activeMonths.reduce((s, m) => s + m.tugbaChf, 0)

  return (
    <div className="fade-in">
      <div style={{
        background: 'linear-gradient(135deg, #1a1f2e 0%, #2d3548 100%)',
        color: 'white', borderRadius: 14, padding: '18px 24px', marginBottom: 18,
        position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, transparent 70%)' }}/>
        <div style={{ position: 'relative' }}>
          <h2 className="display" style={{ fontSize: 22 }}>Aylık Hakediş Tablosu</h2>
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>Yıl</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '7px 12px', fontSize: 13, fontWeight: 500 }}>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-muted)' }}>
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{activeMonths.length}</span> aktif ay
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
        <div style={{ background: 'var(--gradient-1)', color: 'white', borderRadius: 12, padding: '16px 18px', boxShadow: '0 8px 20px rgba(99, 102, 241, 0.25)' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.9, fontWeight: 600, marginBottom: 6 }}>{year} Toplam Hakediş</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{fmtCHF(totalHakedisChf)}</div>
          <div className="mono" style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{fmtTL(totalHakedisTry)}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--red)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--red)', fontWeight: 700, marginBottom: 6 }}>{year} Şirketten Çekilen</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--red)' }}>{fmtCHF(totalTransferChf)}</div>
          <div className="mono" style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{fmtTL(totalTransferTry)}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: `1px solid ${totalKalanChf >= 0 ? 'var(--green)' : 'var(--red)'}`, borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: totalKalanChf >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700, marginBottom: 6 }}>{year} Kalan Hakediş</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: totalKalanChf >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtCHF(totalKalanChf)}</div>
          <div className="mono" style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{fmtTL(totalKalanTry)}</div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 20, border: '1px solid var(--line)', overflowX: 'auto' }}>
        <h3 className="display" style={{ fontSize: 15, marginBottom: 14 }}>{year} Detay Tablosu</h3>
        <div style={{ minWidth: 1420 }}>
          {/* Üst gruplandırma şeridi */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '100px 3fr 1.4fr 70px 1.2fr 1.2fr 1.2fr',
            gap: 8, padding: '6px 12px 4px',
            fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontWeight: 700
          }}>
            <div></div>
            <div style={{ textAlign: 'center', borderBottom: '1px solid var(--line)' }}>Hakediş Kırılımı (CHF)</div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '100px 1fr 1fr 1fr 1.2fr 70px 1.2fr 1fr 1fr 1.2fr',
            gap: 8, padding: '10px 12px',
            background: 'var(--gradient-1)', color: 'white', borderRadius: 8,
            fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8
          }}>
            <div>Ay</div>
            <div style={{ textAlign: 'right' }}>Maaş</div>
            <div style={{ textAlign: 'right' }}>Prim</div>
            <div style={{ textAlign: 'right' }}>Şirket İçi</div>
            <div style={{ textAlign: 'right' }}>Toplam Hakediş</div>
            <div style={{ textAlign: 'right' }}>Kur</div>
            <div style={{ textAlign: 'right' }}>Hakediş TL</div>
            <div style={{ textAlign: 'right' }}>Çekilen</div>
            <div style={{ textAlign: 'right' }}>Tuğba</div>
            <div style={{ textAlign: 'right' }}>Kalan</div>
          </div>

          {showOpeningRow && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '100px 1fr 1fr 1fr 1.2fr 70px 1.2fr 1fr 1fr 1.2fr',
              gap: 8, padding: '12px 12px',
              background: 'var(--accent-soft)', border: '1px dashed var(--accent)',
              borderRadius: 6, alignItems: 'center', marginBottom: 6
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                Açılış
                <div style={{ fontSize: 9, color: 'var(--ink-muted)', fontWeight: 400 }}>{year}</div>
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)', textAlign: 'right' }}>—</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)', textAlign: 'right' }}>—</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)', textAlign: 'right' }}>—</div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{fmtCHF(openingChfForYear)}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{fmtTL(openingTryForYear)}</div>
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-muted)', textAlign: 'right' }}>—</div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)', textAlign: 'right' }}>{fmtTL(openingTryForYear)}</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)', textAlign: 'right' }}>—</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)', textAlign: 'right' }}>—</div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{fmtTL(openingTryForYear)}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--green)' }}>{fmtCHF(openingChfForYear)}</div>
              </div>
            </div>
          )}

          {activeMonths.length === 0 && !showOpeningRow ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
              {year} yılı için kayıtlı hakediş bulunamadı.
            </div>
          ) : (
            activeMonths.map((m, i) => (
              <div key={m.month} style={{
                display: 'grid',
                gridTemplateColumns: '100px 1fr 1fr 1fr 1.2fr 70px 1.2fr 1fr 1fr 1.2fr',
                gap: 8, padding: '12px 12px',
                background: i % 2 === 0 ? 'var(--bg-elevated)' : 'transparent',
                borderRadius: 6, alignItems: 'center', marginBottom: 2
              }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  {monthFull(m.month)}
                  <div style={{ fontSize: 9, color: 'var(--ink-muted)', fontWeight: 400 }}>{year}</div>
                </div>
                <div className="mono" style={{ fontSize: 12, color: m.salaryChf > 0 ? 'var(--green)' : 'var(--ink-faint)', textAlign: 'right' }}>{m.salaryChf > 0 ? fmtCHF(m.salaryChf) : '—'}</div>
                <div className="mono" style={{ fontSize: 12, color: m.frenchChf > 0 ? 'var(--blue)' : 'var(--ink-faint)', textAlign: 'right' }}>{m.frenchChf > 0 ? fmtCHF(m.frenchChf) : '—'}</div>
                <div className="mono" style={{ fontSize: 12, color: m.advanceChf > 0 ? 'var(--amber)' : 'var(--ink-faint)', textAlign: 'right' }}>{m.advanceChf > 0 ? fmtCHF(m.advanceChf) : '—'}</div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{fmtCHF(m.hakedisChf)}</div>
                </div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-muted)', textAlign: 'right' }}>{m.rate.toFixed(2)}</div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)', textAlign: 'right' }}>{fmtTL(m.hakedisTry)}</div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: 12, color: m.transferTry > 0 ? 'var(--red)' : 'var(--ink-faint)' }}>{m.transferTry > 0 ? fmtTL(m.transferTry) : '—'}</div>
                  {m.transferChf > 0 && <div className="mono" style={{ fontSize: 10, color: 'var(--red)', opacity: 0.7 }}>{fmtCHF(m.transferChf)}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: 12, color: m.tugbaTry > 0 ? '#f43f5e' : 'var(--ink-faint)' }}>{m.tugbaTry > 0 ? fmtTL(m.tugbaTry) : '—'}</div>
                  {m.tugbaChf > 0 && <div className="mono" style={{ fontSize: 10, color: '#f43f5e', opacity: 0.7 }}>{fmtCHF(m.tugbaChf)}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: m.kalanTry >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtTL(m.kalanTry)}</div>
                  <div className="mono" style={{ fontSize: 10, fontWeight: 700, color: m.kalanChf >= 0 ? 'var(--green)' : 'var(--red)', opacity: 0.85 }}>{fmtCHF(m.kalanChf)}</div>
                </div>
              </div>
            ))
          )}

          {(activeMonths.length > 0 || showOpeningRow) && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '100px 1fr 1fr 1fr 1.2fr 70px 1.2fr 1fr 1fr 1.2fr',
              gap: 8, padding: '14px 12px',
              background: 'var(--accent-soft)', border: '2px solid var(--accent)',
              borderRadius: 8, alignItems: 'center', marginTop: 8
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>TOPLAM</div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', textAlign: 'right' }}>{fmtCHF(totalSalaryChf)}</div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)',  textAlign: 'right' }}>{fmtCHF(totalFrenchChf)}</div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', textAlign: 'right' }}>{fmtCHF(totalAdvanceChf)}</div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>{fmtCHF(totalHakedisChf)}</div>
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-muted)', textAlign: 'right' }}>—</div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)', textAlign: 'right' }}>{fmtTL(totalHakedisTry)}</div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>{fmtTL(totalTransferTry)}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--red)', opacity: 0.7 }}>{fmtCHF(totalTransferChf)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: '#f43f5e' }}>{fmtTL(totalTugbaTry)}</div>
                <div className="mono" style={{ fontSize: 10, color: '#f43f5e', opacity: 0.7 }}>{fmtCHF(totalTugbaChf)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: totalKalanTry >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtTL(totalKalanTry)}</div>
                <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: totalKalanChf >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtCHF(totalKalanChf)}</div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ============= YARDIMCI =============

function ClickableCard({ label, value, subtitle, color, icon, onClick }) {
  return (
    <button onClick={onClick} className="card-hover" style={{
      background: 'var(--bg-card)', border: '1px solid var(--line)',
      borderRadius: 14, padding: '18px 18px', textAlign: 'left',
      cursor: 'pointer', transition: 'all 0.2s', position: 'relative', overflow: 'hidden'
    }}
    onMouseOver={e => {
      e.currentTarget.style.transform = 'translateY(-2px)'
      e.currentTarget.style.boxShadow = '0 8px 20px rgba(99, 102, 241, 0.15)'
      e.currentTarget.style.borderColor = 'var(--accent)'
    }}
    onMouseOut={e => {
      e.currentTarget.style.transform = 'translateY(0)'
      e.currentTarget.style.boxShadow = 'none'
      e.currentTarget.style.borderColor = 'var(--line)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700 }}>{label}</div>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: `var(--${color}-soft)`, color: `var(--${color})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={14} />
        </div>
      </div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: `var(--${color})`, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{subtitle}</div>
      <div style={{ position: 'absolute', bottom: 6, right: 12, fontSize: 9, color: 'var(--ink-faint)', display: 'flex', alignItems: 'center', gap: 3 }}>
        Detay <Icon name="arrowRight" size={9}/>
      </div>
    </button>
  )
}

function DetailModal({ modal, onClose, getSafeRate }) {
  // Bazı kalemler transaction değil aylık maaş kaydı (year+month+amount_try)
  // formatında geliyor. Hem onları hem klasik transaction'ları doğru
  // gösterebilmek için tek bir görüntüleme şekline normalize ediyoruz.
  const isMonthlyRow = (t) =>
    t && t.year != null && t.month != null && (t.amount_try != null || t.amount_chf != null)

  const normalizeRow = (t) => {
    if (isMonthlyRow(t)) {
      const date = `${t.year}-${String(t.month + 1).padStart(2, '0')}-01`
      const tl = safeNumber(t.amount_try)
      const chf = safeNumber(t.amount_chf)
      return {
        id: t.id,
        date,
        amountTl: tl,
        amountChf: chf,
        description: `${monthFull(t.month)} ${t.year} maaşı${t.notes ? ' — ' + t.notes : ''}`,
      }
    }
    const rate = getSafeRate(t.date)
    const amt = safeNumber(t.amount)
    return {
      id: t.id,
      date: t.date,
      amountTl: amt,
      amountChf: rate > 0 ? amt / rate : 0,
      description: t.description || '—',
    }
  }

  const rows = modal.txs.map(normalizeRow)
  const sorted = [...rows].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const totalTl = sorted.reduce((s, r) => s + r.amountTl, 0)
  const totalChf = sorted.reduce((s, r) => s + r.amountChf, 0)

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 17, 23, 0.6)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 20
    }}>
      <div onClick={e => e.stopPropagation()} className="fade-in" style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 800, maxHeight: '85vh', overflowY: 'auto',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 14, borderBottom: '2px solid ' + modal.color }}>
          <div>
            <h2 className="display" style={{ fontSize: 20, marginBottom: 4, color: modal.color }}>{modal.title}</h2>
            <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{sorted.length} kayıt</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: modal.color }}>{fmtCHF(totalChf)}</div>
            <div className="mono" style={{ fontSize: 13, color: 'var(--ink-muted)' }}>≈ {fmtTL(totalTl)}</div>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>Henüz kayıt yok.</div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 130px 130px', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>
              <div>Tarih</div><div>Açıklama</div>
              <div style={{ textAlign: 'right' }}>CHF</div>
              <div style={{ textAlign: 'right' }}>TL</div>
            </div>
            {sorted.map((r, i) => {
              const d = safeDate(r.date)
              return (
                <div key={r.id || i} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 130px 130px', gap: 12, padding: '10px 0', alignItems: 'center', borderBottom: i < sorted.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{d ? d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
                  <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>{r.description}</div>
                  <div className="mono" style={{ fontSize: 12, textAlign: 'right', color: 'var(--ink-muted)' }}>{fmtCHF(r.amountChf)}</div>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', color: modal.color }}>{fmtTL(r.amountTl)}</div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--line)', fontSize: 12, fontWeight: 600 }}>Kapat</button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, chf, tl, sign, color, bold = false }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px', gap: 12, fontWeight: bold ? 700 : 400 }}>
      <div style={{ color }}>{label}</div>
      <div style={{ textAlign: 'right', color }}>{sign} {fmtCHF(Math.abs(safeNumber(chf)))}</div>
      <div style={{ textAlign: 'right', color, opacity: 0.7 }}>{sign} {fmtTL(Math.abs(safeNumber(tl)))}</div>
    </div>
  )
}
