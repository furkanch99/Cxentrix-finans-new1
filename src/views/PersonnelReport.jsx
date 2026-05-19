import React, { useState, useMemo } from 'react'
import { Icon, fmtTL, monthFull } from '../utils'
import { KPICard } from '../charts'
import { setPaymentStatus, bulkSetPaymentStatus } from '../dataService'

export default function PersonnelReport({ data, reload }) {
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
      alert('Hata: ' + err.message)
    }
  }

  const handleBulkMark = async (markAsPaid) => {
    if (selectedTxIds.size === 0) {
      alert('Önce işlem seçin.')
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
      alert('Hata: ' + err.message)
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

  return (
    <div>
      <h2>Personnel Report</h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 20
      }}>
        <KPICard
          label="Dönem Ödeme"
          value={fmtTL(grandTotal)}
          subtitle={`${totalCount} işlem`}
          icon="wallet"
          color="purple"
          big
          Icon={Icon}
        />

        <KPICard
          label="Dönem Borç"
          value={fmtTL(grandUnpaid)}
          subtitle="Henüz ödenmedi"
          icon="arrowUp"
          color="red"
          big
          Icon={Icon}
        />

        <KPICard
          label="Dönem Ödenmiş"
          value={fmtTL(grandPaid)}
          subtitle="Tamamlandı"
          icon="trending"
          color="green"
          big
          Icon={Icon}
        />

        <KPICard
          label="Ödeyen Kişi"
          value={personnel.length.toString()}
          icon="users"
          color="blue"
          big
          Icon={Icon}
        />
      </div>
    </div>
  )
}
