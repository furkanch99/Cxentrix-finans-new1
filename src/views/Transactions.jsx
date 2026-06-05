import React, { useState, useMemo } from 'react'
import { Icon, fmt, fmtTL, todayStr, monthFull } from '../utils'
import { deleteTransaction, deleteInstallmentGroup, updateTransaction, setTransactionChecked } from '../dataService'
import { useToast } from '../Toast'
import EmptyState from '../EmptyState'

// --- Kategori başına tutarlı renk üreten yardımcı.
// Aynı kategori adı → her zaman aynı renk; göz hızlı tarama için.
const CAT_PALETTE = [
  { bg: 'rgba(99, 102, 241, 0.14)',  fg: '#6366f1' },  // indigo
  { bg: 'rgba(16, 185, 129, 0.14)',  fg: '#059669' },  // emerald
  { bg: 'rgba(245, 158, 11, 0.16)',  fg: '#d97706' },  // amber
  { bg: 'rgba(239, 68, 68, 0.14)',   fg: '#dc2626' },  // red
  { bg: 'rgba(168, 85, 247, 0.14)',  fg: '#9333ea' },  // purple
  { bg: 'rgba(14, 165, 233, 0.14)',  fg: '#0284c7' },  // sky
  { bg: 'rgba(236, 72, 153, 0.14)',  fg: '#db2777' },  // pink
  { bg: 'rgba(132, 204, 22, 0.16)',  fg: '#65a30d' },  // lime
  { bg: 'rgba(244, 63, 94, 0.14)',   fg: '#e11d48' },  // rose
  { bg: 'rgba(20, 184, 166, 0.14)',  fg: '#0d9488' },  // teal
]
function categoryColor(name) {
  const s = String(name || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return CAT_PALETTE[h % CAT_PALETTE.length]
}

export default function Transactions({ data, reload }) {
  const toast = useToast()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('all')                // 'all' | YYYY
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [editTx, setEditTx] = useState(null)
  const [sortBy, setSortBy] = useState('date')   // 'date' | 'amount' | 'category'
  const [sortDir, setSortDir] = useState('desc') // 'asc' | 'desc'
  // Optimistic "checked" override — DB güncellemesi sırasında tıklamanın
  // ekranda anında yansıması için yerel olarak tutuluyor.
  const [checkedOverride, setCheckedOverride] = useState({})

  const isChecked = (tx) => (tx.id in checkedOverride) ? checkedOverride[tx.id] : !!tx.checked

  const handleToggleChecked = async (tx) => {
    const next = !isChecked(tx)
    setCheckedOverride(p => ({ ...p, [tx.id]: next }))
    try {
      await setTransactionChecked(tx.id, next)
    } catch (err) {
      setCheckedOverride(p => {
        const c = { ...p }
        delete c[tx.id]
        return c
      })
      toast.error('Güncellenemedi: ' + err.message)
    }
  }

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir(col === 'amount' ? 'desc' : 'desc') }
  }

  const availableYears = useMemo(() => {
    const ys = new Set(data.transactions.map(t => new Date(t.date).getFullYear()))
    return Array.from(ys).filter(Boolean).sort((a, b) => b - a)
  }, [data.transactions])

  const availableCategories = useMemo(() => {
    const set = new Set()
    data.transactions.forEach(t => {
      if (!(t.category || '').toLowerCase().includes('french team')) {
        if (t.category) set.add(t.category)
      }
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'))
  }, [data.transactions])

  const availablePaymentTypes = useMemo(() => {
    const set = new Set()
    data.transactions.forEach(t => { if (t.paymentType) set.add(t.paymentType) })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'))
  }, [data.transactions])

  const currentYear = new Date().getFullYear()

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
    if (year !== 'all') l = l.filter(t => new Date(t.date).getFullYear() === year)
    if (categoryFilter !== 'all') l = l.filter(t => (t.category || '') === categoryFilter)
    if (paymentFilter !== 'all') l = l.filter(t => (t.paymentType || '') === paymentFilter)
    if (search) {
      const s = search.toLowerCase()
      l = l.filter(t => (t.description||'').toLowerCase().includes(s) || (t.category||'').toLowerCase().includes(s) || (t.customer||'').toLowerCase().includes(s))
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
  }, [data.transactions, filter, year, categoryFilter, paymentFilter, search, dateFrom, dateTo, sortBy, sortDir])

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
  const hasAnyFilter = filter !== 'all' || year !== 'all' || categoryFilter !== 'all' || paymentFilter !== 'all' || search || hasDateFilter

  const handleExportCsv = () => {
    if (list.length === 0) {
      toast.info('Boş listeyi dışa aktaramazsın.')
      return
    }
    const esc = (v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const headers = ['Tarih', 'Tip', 'Kategori', 'Açıklama', 'Müşteri', 'Ödeme Tipi', 'Tutar TL', 'Taksit', 'Kontrol']
    const rows = list.map(t => [
      t.date,
      t.type === 'income' ? 'Gelir' : 'Gider',
      t.category,
      t.description || '',
      t.customer || '',
      t.paymentType || '',
      t.amount,
      t.installmentGroupId ? `${t.installmentNo}/${t.installmentTotal}` : '',
      isChecked(t) ? 'EVET' : '',
    ])
    const csv = '﻿' + [headers, ...rows].map(r => r.map(esc).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `cxentrix-islemler-${stamp}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`${list.length} kayıt dışa aktarıldı`)
  }

  return (
    <div>
      <style>{`
        .tx-row { transition: background 0.15s ease, transform 0.15s ease; }
        .tx-row:hover { background: var(--bg-elevated); }
        .tx-row-checked { background: rgba(16, 185, 129, 0.04); }
        .tx-row-checked:hover { background: rgba(16, 185, 129, 0.08); }
        .tx-delete-btn { transition: color 0.15s ease, background 0.15s ease; }
        .tx-delete-btn:hover { color: var(--red) !important; background: rgba(239, 68, 68, 0.10) !important; }
        .tx-edit-btn:hover { background: var(--accent-soft) !important; }
        .tx-quick-chip:hover { background: var(--accent-soft) !important; color: var(--accent) !important; }
        .tx-check-box {
          width: 22px; height: 22px; border-radius: 6px;
          border: 1.5px solid var(--line);
          background: var(--bg-input);
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s ease;
          color: transparent;
        }
        .tx-check-box:hover { border-color: var(--green); background: rgba(16, 185, 129, 0.08); }
        .tx-check-box-on {
          background: linear-gradient(135deg, #10b981, #059669) !important;
          border-color: #059669 !important;
          color: white !important;
          box-shadow: 0 1px 3px rgba(16, 185, 129, 0.35);
        }
      `}</style>

      {/* TEK BARLI TOOLBAR */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12,
        padding: 12, marginBottom: 14,
        display: 'grid', gap: 10
      }}>
        {/* Üst satır: tip + arama + yıl + dışa aktar */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-input)', padding: 3, borderRadius: 9, border: '1px solid var(--line)' }}>
            {['all','income','expense'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: filter === f ? 'var(--accent)' : 'transparent',
                color: filter === f ? 'white' : 'var(--ink-soft)',
                border: 'none', cursor: 'pointer', transition: 'all 0.15s'
              }}>
                {f === 'all' ? 'Tümü' : f === 'income' ? 'Gelir' : 'Gider'}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }}><Icon name="search" size={14}/></div>
            <input placeholder="Açıklama, kategori veya müşteri ara..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '9px 14px 9px 38px', fontSize: 13 }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700 }}>Yıl</span>
            <select value={year} onChange={e => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              style={{ padding: '7px 10px', fontSize: 12, fontWeight: 600 }}
            >
              <option value="all">Tümü</option>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <button onClick={handleExportCsv} title="CSV olarak indir"
            style={{
              padding: '8px 14px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--line)',
              fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <Icon name="download" size={13}/> CSV
          </button>
        </div>

        {/* Orta satır: kategori + ödeme filtreleri */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          paddingTop: 8, borderTop: '1px solid var(--line-soft)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 220 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: categoryFilter !== 'all' ? 'var(--accent)' : 'var(--ink-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>Kategori</span>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              style={{
                flex: 1, minWidth: 140, padding: '7px 10px', fontSize: 12, fontWeight: 600,
                border: categoryFilter !== 'all' ? '1px solid var(--accent)' : '1px solid var(--line)',
                background: categoryFilter !== 'all' ? 'var(--accent-soft)' : 'var(--bg-input)',
                color: categoryFilter !== 'all' ? 'var(--accent)' : 'var(--ink-soft)'
              }}
            >
              <option value="all">Tümü</option>
              {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {categoryFilter !== 'all' && (
              <button onClick={() => setCategoryFilter('all')} title="Kategori filtresini kaldır"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)', padding: 2, fontSize: 14, lineHeight: 1 }}
              >×</button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 220 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: paymentFilter !== 'all' ? 'var(--accent)' : 'var(--ink-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>Ödeme</span>
            <select
              value={paymentFilter}
              onChange={e => setPaymentFilter(e.target.value)}
              style={{
                flex: 1, minWidth: 140, padding: '7px 10px', fontSize: 12, fontWeight: 600,
                border: paymentFilter !== 'all' ? '1px solid var(--accent)' : '1px solid var(--line)',
                background: paymentFilter !== 'all' ? 'var(--accent-soft)' : 'var(--bg-input)',
                color: paymentFilter !== 'all' ? 'var(--accent)' : 'var(--ink-soft)'
              }}
            >
              <option value="all">Tümü</option>
              {availablePaymentTypes.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {paymentFilter !== 'all' && (
              <button onClick={() => setPaymentFilter('all')} title="Ödeme filtresini kaldır"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)', padding: 2, fontSize: 14, lineHeight: 1 }}
              >×</button>
            )}
          </div>
        </div>

        {/* Alt satır: tarih aralığı + quick chip'ler */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          paddingTop: 8, borderTop: '1px solid var(--line-soft)'
        }}>
          <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: hasDateFilter ? 'var(--accent)' : 'var(--ink-muted)', fontWeight: 700 }}>Tarih</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 12,
              border: hasDateFilter ? '1px solid var(--accent)' : '1px solid var(--line)',
              background: hasDateFilter ? 'var(--accent-soft)' : 'var(--bg-input)'
            }}
          />
          <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 12,
              border: hasDateFilter ? '1px solid var(--accent)' : '1px solid var(--line)',
              background: hasDateFilter ? 'var(--accent-soft)' : 'var(--bg-input)'
            }}
          />
          {[
            { k: 'thisMonth', label: 'Bu Ay' },
            { k: 'lastMonth', label: 'Geçen Ay' },
            { k: 'last30',    label: 'Son 30 Gün' },
            { k: 'thisYear',  label: 'Bu Yıl' },
          ].map(c => (
            <button key={c.k} className="tx-quick-chip" onClick={() => applyQuickRange(c.k)}
              style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: 'var(--bg-input)', border: '1px solid var(--line)', color: 'var(--ink-soft)',
                cursor: 'pointer'
              }}
            >{c.label}</button>
          ))}
          {hasAnyFilter && (
            <button onClick={() => { applyQuickRange('clear'); setFilter('all'); setYear('all'); setCategoryFilter('all'); setPaymentFilter('all'); setSearch('') }}
              style={{
                marginLeft: 'auto', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.4)', color: 'var(--red)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
              }}
            >× Filtreleri Temizle</button>
          )}
          <div style={{ marginLeft: hasAnyFilter ? 0 : 'auto', fontSize: 11, color: 'var(--ink-muted)' }}>
            <strong style={{ color: 'var(--ink)' }}>{list.length}</strong> kayıt
          </div>
        </div>
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
        <div style={{ display: 'grid', gridTemplateColumns: '4px 36px 80px 1fr 150px 130px 130px 60px 38px', gap: 10, padding: '10px 18px', alignItems: 'center', borderBottom: '1px solid var(--line)', background: 'var(--bg-elevated)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700 }}>
          <div></div>
          <div></div>
          <SortHeader label="Tarih"    col="date"     sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('date')} />
          <div>Açıklama</div>
          <SortHeader label="Kategori" col="category" sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('category')} />
          <div>Ödeme</div>
          <SortHeader label="Tutar"    col="amount"   sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('amount')} align="right" />
          <div></div>
          <div style={{ textAlign: 'center' }}>Tık</div>
        </div>

        {list.map((tx, i) => {
          const cat = categoryColor(tx.category)
          const isIncome = tx.type === 'income'
          const stripe = isIncome ? 'var(--green)' : 'var(--red)'
          const txYear = new Date(tx.date).getFullYear()
          const showYear = txYear !== currentYear
          const checked = isChecked(tx)
          return (
            <div key={tx.id} className={`tx-row ${checked ? 'tx-row-checked' : ''}`} style={{
              display: 'grid', gridTemplateColumns: '4px 36px 80px 1fr 150px 130px 130px 60px 38px',
              gap: 10, padding: '12px 18px', alignItems: 'center',
              borderBottom: i < list.length - 1 ? '1px solid var(--line-soft)' : 'none'
            }}>
              <div style={{ width: 4, height: 28, borderRadius: 2, background: stripe }}/>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: isIncome ? 'var(--green-soft)' : 'var(--red-soft)',
                color: stripe,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Icon name={isIncome ? 'arrowDown' : 'arrowUp'} size={14} />
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                {new Date(tx.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                {showYear && <div style={{ fontSize: 9, color: 'var(--ink-faint)' }}>{txYear}</div>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div title={tx.description || tx.category}
                  style={{
                    fontSize: 13, fontWeight: 500, marginBottom: tx.customer ? 2 : 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: 6
                  }}>
                  {tx.description || tx.category}
                  {tx.installmentGroupId && (
                    <span style={{
                      background: 'var(--purple-soft)', color: 'var(--purple)',
                      padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace", flexShrink: 0
                    }}>
                      {tx.installmentNo}/{tx.installmentTotal} TAKSİT
                    </span>
                  )}
                </div>
                {tx.customer && (
                  <div style={{ fontSize: 10, color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.customer}
                  </div>
                )}
              </div>
              <div>
                <span title={tx.category} style={{
                  background: cat.bg, color: cat.fg,
                  padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                  display: 'inline-block', maxWidth: '100%',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>{tx.category}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                   title={tx.paymentType}>
                {tx.paymentType || '—'}
              </div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 700, textAlign: 'right', color: stripe }}>
                {isIncome ? '+' : '−'}{fmtTL(tx.amount)}
              </div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditTx(tx)} title="Düzenle" className="tx-edit-btn"
                  style={{
                    width: 28, height: 28, borderRadius: 6, color: 'var(--accent)',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    transition: 'background 0.15s'
                  }}>
                  <Icon name="edit" size={13}/>
                </button>
                <button onClick={() => del(tx)} title="Sil" className="tx-delete-btn"
                  style={{
                    width: 28, height: 28, borderRadius: 6, color: 'var(--ink-muted)',
                    background: 'transparent', border: 'none', cursor: 'pointer'
                  }}>
                  <Icon name="trash" size={13}/>
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={() => handleToggleChecked(tx)}
                  title={checked ? 'Kontrol işaretini kaldır' : 'Kontrol edildi olarak işaretle'}
                  aria-label={checked ? 'Kontrol işaretini kaldır' : 'Kontrol edildi olarak işaretle'}
                  className={`tx-check-box ${checked ? 'tx-check-box-on' : ''}`}
                >
                  <Icon name="check" size={13} />
                </button>
              </div>
            </div>
          )
        })}

        {/* Toplam satırı — filtrelenmiş seçimin gelir/gider/net özeti */}
        <div style={{
          display: 'grid', gridTemplateColumns: '4px 36px 80px 1fr 150px 130px 130px 60px 38px',
          gap: 10, padding: '14px 18px', alignItems: 'center',
          background: 'var(--accent-soft)', borderTop: '2px solid var(--accent)',
          fontSize: 12, fontWeight: 700
        }}>
          <div></div>
          <div></div>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)' }}>Toplam</div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{list.length} kayıt</div>
          <div style={{ fontSize: 11, color: 'var(--green)' }}>Gelir <span className="mono">{fmtTL(totals.income)}</span></div>
          <div style={{ fontSize: 11, color: 'var(--red)' }}>Gider <span className="mono">{fmtTL(totals.expense)}</span></div>
          <div className="mono" style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', color: totals.net >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {totals.net >= 0 ? '+' : '−'}{fmtTL(Math.abs(totals.net))}
          </div>
          <div></div>
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
