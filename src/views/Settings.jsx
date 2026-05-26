import React, { useState, useEffect } from 'react'
import { Icon, todayStr, fmtTL } from '../utils'
import {
  addCategory, deleteCategory, addPaymentType, deletePaymentType,
  upsertExchangeRate, fetchTCMBRate, fetchFatihSettings, updateFatihSettings
} from '../dataService'
import { useCurrency, fmtCHF } from '../CurrencyContext'
import { useToast } from '../Toast'

export default function Settings({ data, reload }) {
  const [tab, setTab] = useState('categories')
  return (
    <div>
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg-card)', padding: 3, borderRadius: 10, border: '1px solid var(--line)', marginBottom: 18, width: 'fit-content', flexWrap: 'wrap' }}>
        {[{id:'categories',l:'Kategoriler'},{id:'payments',l:'Ödeme Türleri'},{id:'rates',l:'Kur Yönetimi'},{id:'fatih',l:'Fatih Karakaş'},{id:'data',l:'Veri'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: tab === t.id ? 'var(--accent)' : 'transparent', color: tab === t.id ? 'white' : 'var(--ink-soft)' }}>{t.l}</button>
        ))}
      </div>
      {tab === 'categories' && <CategoriesSettings data={data} reload={reload} />}
      {tab === 'payments' && <PaymentsSettings data={data} reload={reload} />}
      {tab === 'rates' && <RatesSettings />}
      {tab === 'fatih' && <FatihSettings />}
      {tab === 'data' && <DataSettings data={data} />}
    </div>
  )
}

function CategoriesSettings({ data, reload }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [type, setType] = useState('expense')
  const add = async () => {
    if (!name.trim()) return
    try {
      await addCategory(name.trim(), type)
      setName('')
      await reload()
      toast.success(`Kategori eklendi: ${name.trim()}`)
    } catch (err) { toast.error('Hata: ' + err.message) }
  }
  const del = async (id) => {
    if (!confirm('Bu kategoriyi silmek istediğine emin misin?')) return
    try {
      await deleteCategory(id)
      await reload()
      toast.success('Kategori silindi')
    } catch (err) { toast.error('Hata: ' + err.message) }
  }
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Yeni kategori adı" style={{ flex: 1, padding: '9px 14px', fontSize: 13 }} />
        <select value={type} onChange={e => setType(e.target.value)} style={{ padding: '9px 14px', fontSize: 13 }}>
          <option value="expense">Gider</option><option value="income">Gelir</option>
        </select>
        <button onClick={add} style={{ background: 'var(--gradient-1)', color: 'white', padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Ekle</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {['income','expense'].map(t => (
          <div key={t}>
            <h4 style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 10, fontWeight: 700 }}>{t === 'income' ? 'Gelir Kategorileri' : 'Gider Kategorileri'}</h4>
            {data.categories.filter(c => c.type === t).map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: 8, marginBottom: 4, background: 'var(--bg-input)' }}>
                <span style={{ fontSize: 13 }}>{c.name}</span>
                <button onClick={() => del(c.id)} style={{ color: 'var(--ink-muted)' }}><Icon name="x" size={13}/></button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function PaymentsSettings({ data, reload }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const add = async () => {
    if (!name.trim()) return
    try {
      await addPaymentType(name.trim())
      setName('')
      await reload()
      toast.success(`Ödeme türü eklendi: ${name.trim()}`)
    } catch (err) { toast.error('Hata: ' + err.message) }
  }
  const del = async (p) => {
    if (!confirm('Bu ödeme türünü silmek istediğine emin misin?')) return
    try {
      await deletePaymentType(p)
      await reload()
      toast.success('Ödeme türü silindi')
    } catch (err) { toast.error('Hata: ' + err.message) }
  }
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Yeni ödeme türü" style={{ flex: 1, padding: '9px 14px', fontSize: 13 }} />
        <button onClick={add} style={{ background: 'var(--gradient-1)', color: 'white', padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Ekle</button>
      </div>
      {data.paymentTypes.map(p => (
        <div key={p} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 8, marginBottom: 4, background: 'var(--bg-input)' }}>
          <span style={{ fontSize: 13 }}>{p}</span>
          <button onClick={() => del(p)} style={{ color: 'var(--ink-muted)' }}><Icon name="x" size={14}/></button>
        </div>
      ))}
    </div>
  )
}

function RatesSettings() {
  const toast = useToast()
  const { rates, latestRate, manualUpdate, autoUpdateRate, reload } = useCurrency()
  const [date, setDate] = useState(todayStr())
  const [rate, setRate] = useState('')
  const [updating, setUpdating] = useState(false)
  const [autoLoading, setAutoLoading] = useState(false)

  const add = async () => {
    if (!rate || !date) return
    setUpdating(true)
    try {
      await manualUpdate(date, parseFloat(rate))
      setRate('')
      toast.success('Kur kaydedildi')
    } catch (err) {
      toast.error('Hata: ' + err.message)
    } finally {
      setUpdating(false)
    }
  }

  const refreshAuto = async () => {
    setAutoLoading(true)
    try {
      await autoUpdateRate()
      toast.success('Güncel kur çekildi')
    } catch (err) {
      toast.error('Otomatik güncelleme başarısız: ' + err.message)
    } finally {
      setAutoLoading(false)
    }
  }

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)' }}>
      <div style={{ marginBottom: 18 }}>
        <h4 className="display" style={{ fontSize: 15, marginBottom: 4 }}>CHF / TL Kur Yönetimi</h4>
        <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
          Sistem her saat otomatik güncel kuru çeker. Geriye dönük veya manuel kur girişi de yapabilirsin.
        </p>
      </div>

      {latestRate && (
        <div className="glow-card" style={{
          background: 'var(--gradient-1)', color: 'white', borderRadius: 12, padding: 18,
          marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.85, fontWeight: 600, marginBottom: 4 }}>Güncel Kur</div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 700 }}>1 CHF = {parseFloat(latestRate.chf_to_try).toFixed(4)} TL</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>
              {new Date(latestRate.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })} • Kaynak: {latestRate.source === 'auto' ? 'Otomatik' : 'Manuel'}
            </div>
          </div>
          <button onClick={refreshAuto} disabled={autoLoading} style={{
            background: 'rgba(255,255,255,0.2)', color: 'white', padding: '8px 14px',
            borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid rgba(255,255,255,0.3)'
          }}>
            {autoLoading ? 'Çekiliyor...' : '🔄 Güncelle'}
          </button>
        </div>
      )}

      <div style={{ background: 'var(--bg-input)', borderRadius: 10, padding: 16, marginBottom: 18, border: '1px dashed var(--line)' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600, marginBottom: 10 }}>Manuel Kur Girişi</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 10, color: 'var(--ink-muted)', display: 'block', marginBottom: 4 }}>Tarih</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '8px 12px', fontSize: 12 }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--ink-muted)', display: 'block', marginBottom: 4 }}>1 CHF =</label>
            <input type="number" step="0.0001" value={rate} onChange={e => setRate(e.target.value)} placeholder="37.5000 TL" style={{ width: '100%', padding: '8px 12px', fontSize: 12 }} />
          </div>
          <button onClick={add} disabled={updating || !rate} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: 'var(--gradient-1)', color: 'white', opacity: (!rate || updating) ? 0.5 : 1
          }}>
            {updating ? 'Kayıt...' : 'Kaydet'}
          </button>
        </div>
      </div>

      <h5 style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600, marginBottom: 10 }}>Kayıtlı Kurlar ({rates.length})</h5>
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {rates.map(r => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 12, padding: '10px 14px', borderRadius: 8, marginBottom: 4, background: 'var(--bg-input)', alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{new Date(r.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{parseFloat(r.chf_to_try).toFixed(4)} TL</div>
            <div style={{ fontSize: 10, color: 'var(--ink-muted)', textAlign: 'right' }}>{r.source === 'auto' ? '🔄 Otomatik' : '✋ Manuel'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FatihSettings() {
  const toast = useToast()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({})

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const s = await fetchFatihSettings()
      if (s) {
        setSettings(s)
        setForm({
          initial_balance_try: s.initial_balance_try,
          initial_balance_chf: s.initial_balance_chf,
          initial_balance_date: s.initial_balance_date,
          monthly_salary_chf: s.monthly_salary_chf,
        })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateFatihSettings({
        initial_balance_try: parseFloat(form.initial_balance_try),
        initial_balance_chf: parseFloat(form.initial_balance_chf),
        initial_balance_date: form.initial_balance_date,
        monthly_salary_chf: parseFloat(form.monthly_salary_chf),
      })
      await loadSettings()
      toast.success('Ayarlar kaydedildi')
    } catch (err) {
      toast.error('Hata: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>Yükleniyor...</div>

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)' }}>
      <div style={{ marginBottom: 18 }}>
        <h4 className="display" style={{ fontSize: 15, marginBottom: 4 }}>Fatih Karakaş Ayarları</h4>
        <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
          Başlangıç bakiyesi ve aylık maaş tutarı. Bu değerler "Fatih Hesabı" sayfasında cari hesap hesabında kullanılır.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Başlangıç Bakiyesi (TL)</label>
          <input type="number" step="0.01" value={form.initial_balance_try || ''} onChange={e => setForm({...form, initial_balance_try: e.target.value})} style={{ width: '100%', padding: '9px 12px', fontSize: 13 }} />
        </div>
        <div>
          <label style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Başlangıç Bakiyesi (CHF)</label>
          <input type="number" step="0.01" value={form.initial_balance_chf || ''} onChange={e => setForm({...form, initial_balance_chf: e.target.value})} style={{ width: '100%', padding: '9px 12px', fontSize: 13 }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Başlangıç Tarihi</label>
          <input type="date" value={form.initial_balance_date || ''} onChange={e => setForm({...form, initial_balance_date: e.target.value})} style={{ width: '100%', padding: '9px 12px', fontSize: 13 }} />
        </div>
        <div>
          <label style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Aylık Net Maaş (CHF)</label>
          <input type="number" step="0.01" value={form.monthly_salary_chf || ''} onChange={e => setForm({...form, monthly_salary_chf: e.target.value})} style={{ width: '100%', padding: '9px 12px', fontSize: 13 }} />
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} style={{ background: 'var(--gradient-1)', color: 'white', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
      </button>
    </div>
  )
}

function DataSettings({ data }) {
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cxentrix-finans-${todayStr()}.json`
    a.click()
  }
  const exportCSV = () => {
    const headers = ['Tarih','Tür','Tutar','Kategori','Müşteri/Proje','Ödeme Türü','Açıklama']
    const rows = data.transactions.map(t => [t.date, t.type === 'income' ? 'Gelir' : 'Gider', t.amount, t.category, t.customer || '', t.paymentType, (t.description || '').replace(/"/g, '""')].map(v => `"${v}"`).join(','))
    const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cxentrix-islemler-${todayStr()}.csv`
    a.click()
  }
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)' }}>
      <div>
        <h4 className="display" style={{ fontSize: 16, marginBottom: 4 }}>Yedek Al</h4>
        <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 12 }}>Tüm verilerini JSON veya CSV olarak indir.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportJSON} style={{ background: 'var(--gradient-1)', color: 'white', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="download" size={13}/>JSON</button>
          <button onClick={exportCSV} style={{ background: 'var(--bg-card)', color: 'var(--ink)', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="download" size={13}/>CSV (Excel)</button>
        </div>
      </div>
    </div>
  )
}
