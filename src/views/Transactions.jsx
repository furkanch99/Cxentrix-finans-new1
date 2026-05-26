import React, { useState, useMemo } from 'react'
import { Icon, fmt, fmtTL, todayStr, monthFull } from '../utils'
import { deleteTransaction, deleteInstallmentGroup, updateTransaction } from '../dataService'
import { useToast } from '../Toast'
import EmptyState from '../EmptyState'

export default function Transactions({ data, reload }) {
  const toast = useToast()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [editTx, setEditTx] = useState(null)
  const [sortBy, setSortBy] = useState('date')   // 'date' | 'amount' | 'category'
  const [sortDir, setSortDir] = useState('desc') // 'asc' | 'desc'

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir(col === 'amount' ? 'desc' : 'desc') }
  }

  const applyQuickRange = (range) => {
    const now = new Date()
    if (range === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      setDateFrom(start.toISOString().slice(0,10))
      setDateTo(end.toISOString().slice(0,10))
    } else if (range === 'lastMonth') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      setDateFrom(start.toISOString().slice(0,10))
      setDateTo(end.toISOString().slice(0,10))
    } else if (range === 'thisYear') {
      setDateFrom(`${now.getFullYear()}-01-01`)
      setDateTo(`${now.getFullYear()}-12-31`)
    } else if (range === 'last30') {
      const start = new Date(now)
      start.setDate(start.getDate() - 30)
      setDateFrom(start.toISOString().slice(0,10))
      setDateTo(now.toISOString().slice(0,10))
    } else {
      setDateFrom('')
      setDateTo('')
    }
  }

  const list = useMemo(() => {
    let l = [...data.transactions]
    l = l.filter(t => !(t.category || '').toLowerCase().includes('french team'))
    if (filter !== 'all') l = l.filter(t => t.type === filter)
    if (search) {
      const s = search.toLowerCase()
      l = l.filter(t => (t.description||'').toLowerCase().includes(s) || t.category.toLowerCase().includes(s) || (t.customer||'').toLowerCase().includes(s))
    }
    if (dateFrom) l = l.filter(t => t.date >= dateFrom)
    if (dateTo) l = l.filter(t => t.date <= dateTo)

    const dir = sortDir === 'asc' ? 1 : -1
    l.sort((a, b) => {
      if (sortBy === 'amount')   return (a.amount - b.amount) * dir
      if (sortBy === 'category') return a.category.localeCompare(b.category, 'tr') * dir
      // default: date
      return a.date.localeCompare(b.date) * dir
    })
    return l
  }, [data.transactions, filter, search, dateFrom, dateTo, sortBy, sortDir])

  const totals = useMemo(() => {
    let income = 0, expense = 0
    list.forEach(t => { if (t.type === 'income') income += t.amount; else expense += t.amount })
    return { income, expense, net: income - expense }
  }, [list])

  const del = async (tx) => {
    if (tx.installmentGroupId) {
      const choice = confirm(
        `Bu işlem ${tx.installmentTotal} taksitten biri (${tx.installmentNo}/${tx.installmentTotal}).\n\n` +
        `Tamam'a basarsan TÜM taksitler silinir.\n` +
        `İptal'e basarsan hiçbir şey silinmez.`
      )
      if (!choice) return
      try {
        await deleteInstallmentGroup(tx.installmentGroupId)
        await reload()
        toast.success(`${tx.installmentTotal} taksitin tamamı silindi`)
      } catch (err) { toast.error('Silme hatası: ' + err.message) }
    } else {
      if (!confirm('Bu işlemi silmek istediğine emin misin?')) return
      try {
        await deleteTransaction(tx.id)
        await reload()
        toast.success('İşlem silindi')
      } catch (err) { toast.error('Silme hatası: ' + err.message) }
    }
  }

  const hasDateFilter = dateFrom || dateTo

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-card)', padding: 3, borderRadius: 10, border: '1px solid var(--line)' }}>
          {['all','income','expense'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: filter === f ? 'var(--accent)' : 'transparent', color: filter === f ? 'white' : 'var(--ink-soft)' }}>{f === 'all' ? 'Tümü' : f === 'income' ? 'Gelir' : 'Gider'}</button>
          ))}
        </div>
        <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }}><Icon name="search" size={14}/></div>
          <input placeholder="Açıklama, kategori veya müşteri ara..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', padding: '9px 14px 9px 38px', fontSize: 13 }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{list.length} kayıt</div>
      </div>

      <div style={{
        background: hasDateFilter ? 'var(--accent-soft)' : 'var(--bg-card)',
        border: `1px solid ${hasDateFilter ? 'var(--accent)' : 'var(--line)'}`,
        borderRadius: 10, padding: '10px 14px', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'
      }}>
        <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: hasDateFilter ? 'var(--accent)' : 'var(--ink-muted)', fontWeight: 700 }}>Tarih</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: '6px 10px', fontSize: 12 }} />
        <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: '6px 10px', fontSize: 12 }} />
        <div style={{ width: 1, height: 20, background: 'var(--line)' }}></div>
        <button onClick={() => applyQuickRange('thisMonth')} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--bg-input)', border: '1px solid var(--line)', color: 'var(--ink-soft)' }}>Bu Ay</button>
        <button onClick={() => applyQuickRange('lastMonth')} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--bg-input)', border: '1px solid var(--line)', color: 'var(--ink-soft)' }}>Geçen Ay</button>
        <button onClick={() => applyQuickRange('last30')} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--bg-input)', border: '1px solid var(--line)', color: 'var(--ink-soft)' }}>Son 30 Gün</button>
        <button onClick={() => applyQuickRange('thisYear')} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--bg-input)', border: '1px solid var(--line)', color: 'var(--ink-soft)' }}>Bu Yıl</button>
        {hasDateFilter && (
          <button onClick={() => applyQuickRange('clear')} style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--red-soft)', border: '1px solid var(--red)', color: 'var(--red)' }}>× Temizle</button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon="list"
          title="İşlem bulunamadı"
          subtitle={search || dateFrom || dateTo || filter !== 'all'
            ? "Mevcut filtreyi gevşeterek veya temizleyerek tekrar dene."
            : "Henüz hiç işlem yok. Sol üstteki “Yeni İşlem” butonuyla başla."}
        />
      ) : (
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
        {/* Sıralanabilir başlık */}
        <div style={{ display: 'grid', gridTemplateColumns: '40px 80px 1fr 150px 130px 130px 60px', gap: 12, padding: '10px 18px', alignItems: 'center', borderBottom: '1px solid var(--line)', background: 'var(--bg-elevated)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700 }}>
          <div></div>
          <SortHeader label="Tarih"    col="date"     sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('date')} />
          <div>Açıklama</div>
          <SortHeader label="Kategori" col="category" sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('category')} />
          <div>Ödeme</div>
          <SortHeader label="Tutar"    col="amount"   sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('amount')} align="right" />
          <div></div>
        </div>
        {list.map((tx, i) => (
          <div key={tx.id} style={{ display: 'grid', gridTemplateColumns: '40px 80px 1fr 150px 130px 130px 60px', gap: 12, padding: '12px 18px', alignItems: 'center', borderBottom: i < list.length-1 ? '1px solid var(--line-soft)' : 'none' }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: tx.type === 'income' ? 'var(--green-soft)' : 'var(--red-soft)', color: tx.type === 'income' ? 'var(--green)' : 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={tx.type === 'income' ? 'arrowDown' : 'arrowUp'} size={14} />
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{new Date(tx.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                {tx.description || tx.category}
                {tx.installmentGroupId && (
                  <span style={{ background: 'var(--purple-soft)', color: 'var(--purple)', padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
                    {tx.installmentNo}/{tx.installmentTotal} TAKSİT
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{tx.customer || '—'}</div>
            </div>
            <div><span style={{ background: 'var(--accent-soft)', color: 'var(--accent)', padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600 }}>{tx.category}</span></div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{tx.paymentType}</div>
            <div className="mono" style={{ fontSize: 14, fontWeight: 600, textAlign: 'right', color: tx.type === 'income' ? 'var(--green)' : 'var(--red)' }}>{tx.type === 'income' ? '+' : '−'}{fmtTL(tx.amount)}</div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditTx(tx)} title="Düzenle" style={{ width: 26, height: 26, borderRadius: 6, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <Icon name="edit" size={13}/>
              </button>
              <button onClick={() => del(tx)} title="Sil" style={{ width: 26, height: 26, borderRadius: 6, color: 'var(--ink-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <Icon name="trash" size={13}/>
              </button>
            </div>
          </div>
        ))}

        {/* Toplam satırı — filtrelenmiş seçimin gelir/gider/net özeti */}
        <div style={{ display: 'grid', gridTemplateColumns: '40px 80px 1fr 150px 130px 130px 60px', gap: 12, padding: '14px 18px', alignItems: 'center', background: 'var(--accent-soft)', borderTop: '2px solid var(--accent)', fontSize: 12, fontWeight: 700 }}>
          <div></div>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)' }}>Toplam</div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{list.length} kayıt</div>
          <div style={{ fontSize: 11, color: 'var(--green)' }}>Gelir <span className="mono">{fmtTL(totals.income)}</span></div>
          <div style={{ fontSize: 11, color: 'var(--red)' }}>Gider <span className="mono">{fmtTL(totals.expense)}</span></div>
          <div className="mono" style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', color: totals.net >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {totals.net >= 0 ? '+' : '−'}{fmtTL(Math.abs(totals.net))}
          </div>
          <div></div>
        </div>
      </div>
      )}

      {editTx && <EditModal tx={editTx} data={data} onClose={() => setEditTx(null)} onSuccess={async () => { await reload(); setEditTx(null) }} />}
    </div>
  )
}

function SortHeader({ label, col, sortBy, sortDir, onClick, align = 'left' }) {
  const active = sortBy === col
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 4,
      justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      background: 'transparent', border: 'none', cursor: 'pointer',
      padding: 0, fontSize: 'inherit', fontWeight: 'inherit',
      letterSpacing: 'inherit', textTransform: 'inherit',
      color: active ? 'var(--accent)' : 'var(--ink-muted)',
      textAlign: align,
    }}>
      <span>{label}</span>
      <span style={{ fontSize: 9, lineHeight: 1, opacity: active ? 1 : 0.4 }}>
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </button>
  )
}

function EditModal({ tx, data, onClose, onSuccess }) {
  const toast = useToast()
  const [type, setType] = useState(tx.type)
  const [date, setDate] = useState(tx.date)
  const [amount, setAmount] = useState(tx.amount.toString())
  const [category, setCategory] = useState(tx.category)
  const [customer, setCustomer] = useState(tx.customer || '')
  const [paymentType, setPaymentType] = useState(tx.paymentType || '')
  const [description, setDescription] = useState(tx.description || '')
  const [saving, setSaving] = useState(false)

  const availableCategories = useMemo(() => {
    return data.categories.filter(c => c.type === type).map(c => c.name).sort()
  }, [data.categories, type])

  const handleSave = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { toast.error('Geçerli bir tutar gir.'); return }
    if (!category) { toast.error('Kategori seç.'); return }
    if (!date) { toast.error('Tarih gir.'); return }

    setSaving(true)
    try {
      await updateTransaction(tx.id, {
        type, date, amount: amt,
        category, customer: customer.trim() || null,
        paymentType: paymentType || null,
        description: description.trim() || null,
      })
      toast.success('İşlem güncellendi')
      onSuccess()
    } catch (err) {
      toast.error('Hata: ' + err.message)
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
        <h2 className="display gradient-text" style={{ fontSize: 22, marginBottom: 4 }}>İşlemi Düzenle</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 20 }}>Tüm alanları istediğin gibi değiştirebilirsin</p>

        {tx.installmentGroupId && (
          <div style={{
            background: 'var(--amber-soft, #fef3c7)', border: '1px solid var(--amber, #f59e0b)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 16,
            fontSize: 11, color: 'var(--amber, #f59e0b)', fontWeight: 600
          }}>
            ⚠ Bu işlem taksitli ({tx.installmentNo}/{tx.installmentTotal}). Sadece bu taksiti düzenlersin.
          </div>
        )}

        {/* TİP */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Tip</label>
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-input)', padding: 3, borderRadius: 8, border: '1px solid var(--line)' }}>
            <button onClick={() => { setType('expense'); setCategory('') }} style={{
              flex: 1, padding: '8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: type === 'expense' ? 'var(--red)' : 'transparent',
              color: type === 'expense' ? 'white' : 'var(--ink-soft)',
              border: 'none', cursor: 'pointer'
            }}>Gider</button>
            <button onClick={() => { setType('income'); setCategory('') }} style={{
              flex: 1, padding: '8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: type === 'income' ? 'var(--green)' : 'transparent',
              color: type === 'income' ? 'white' : 'var(--ink-soft)',
              border: 'none', cursor: 'pointer'
            }}>Gelir</button>
          </div>
        </div>

        {/* TARİH + TUTAR */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Tarih</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', fontSize: 13 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Tutar (₺)</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }} />
          </div>
        </div>

        {/* KATEGORİ */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Kategori</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={{ width: '100%', padding: '10px 12px', fontSize: 13 }}>
            <option value="">— Seç —</option>
            {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* ÖDEME TÜRÜ */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Ödeme Türü</label>
          <select value={paymentType} onChange={e => setPaymentType(e.target.value)} style={{ width: '100%', padding: '10px 12px', fontSize: 13 }}>
            <option value="">— Yok —</option>
            {data.paymentTypes.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* MÜŞTERİ */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Müşteri (Opsiyonel)</label>
          <input type="text" value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Örn: Logic Group AG" style={{ width: '100%', padding: '10px 12px', fontSize: 13 }} />
        </div>

        {/* AÇIKLAMA */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: 6 }}>Açıklama (Opsiyonel)</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="İşlem detayları..." style={{ width: '100%', padding: '10px 12px', fontSize: 13 }} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--line)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>İptal</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '10px 20px', borderRadius: 8,
            background: 'var(--gradient-1)', color: 'white',
            border: 'none', fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.6 : 1
          }}>
            {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}
