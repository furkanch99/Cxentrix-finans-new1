import React, { useState, useMemo } from 'react'
import { Icon, fmtTL, monthName, monthFull } from '../utils'
import { TrendChart, DailyTrendChart, CategoryBarChart, PaymentPieChart, CustomerBarChart, KPICard, ChartCard } from '../charts'
import { isFatihTransferTx } from '../fatihHelper'

export default function Dashboard({ data }) {
  const availableYears = useMemo(() => {
    const ys = new Set(data.transactions.map(t => new Date(t.date).getFullYear()))
    ys.add(new Date().getFullYear())
    return Array.from(ys).sort((a,b) => b-a)
  }, [data.transactions])

  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('all')

  const yearTxs = useMemo(() => data.transactions.filter(t => new Date(t.date).getFullYear() === year), [data.transactions, year])
  const yearOperationalTxs = useMemo(() => yearTxs.filter(t => !isFatihTransferTx(t)), [yearTxs])

  const periodTxs = useMemo(() => {
    return month === 'all' ? yearOperationalTxs : yearOperationalTxs.filter(t => new Date(t.date).getMonth() === month)
  }, [yearOperationalTxs, month])

  const monthly = useMemo(() => {
    const arr = Array.from({length: 12}, (_,i) => ({ month: i, inc: 0, exp: 0, net: 0 }))
    yearOperationalTxs.forEach(t => {
      const m = new Date(t.date).getMonth()
      arr[m][t.type === 'income' ? 'inc' : 'exp'] += t.amount
    })
    arr.forEach(m => m.net = m.inc - m.exp)
    return arr
  }, [yearOperationalTxs])

  const daily = useMemo(() => {
    if (month === 'all') return null
    const days = new Date(year, month + 1, 0).getDate()
    const arr = Array.from({length: days}, (_,i) => ({ day: i+1, inc: 0, exp: 0, net: 0 }))
    periodTxs.forEach(t => {
      const d = new Date(t.date).getDate()
      arr[d-1][t.type === 'income' ? 'inc' : 'exp'] += t.amount
    })
    arr.forEach(d => d.net = d.inc - d.exp)
    return arr
  }, [periodTxs, month, year])

  const totalIncome = periodTxs.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0)
  const totalExpense = periodTxs.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0)
  const netProfit = totalIncome - totalExpense
  const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0

  // Geçen yıl aynı dönem (YoY) karşılaştırması
  const yoyComparison = useMemo(() => {
    const prevYear = year - 1
    const prevTxs = data.transactions.filter(t => {
      const d = new Date(t.date)
      if (d.getFullYear() !== prevYear) return false
      if (isFatihTransferTx(t)) return false
      if (month !== 'all' && d.getMonth() !== month) return false
      return true
    })
    const prevIncome  = prevTxs.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0)
    const prevExpense = prevTxs.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0)
    const prevNet     = prevIncome - prevExpense
    const pct = (now, prev) => {
      if (prev === 0) return null
      return ((now - prev) / Math.abs(prev)) * 100
    }
    return {
      hasData: prevTxs.length > 0,
      prevIncome, prevExpense, prevNet,
      incomePct:  pct(totalIncome, prevIncome),
      expensePct: pct(totalExpense, prevExpense),
      netPct:     pct(netProfit, prevNet),
    }
  }, [data.transactions, year, month, totalIncome, totalExpense, netProfit])
  const monthsWithData = monthly.filter(m => m.inc > 0 || m.exp > 0).length || 1
  const avgMonthlyProfit = month === 'all' ? (monthly.reduce((s,m) => s+m.net, 0) / monthsWithData) : netProfit

  const expenseByCategory = useMemo(() => {
    const map = {}
    periodTxs.filter(t => t.type === 'expense').forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount })
    return Object.entries(map).map(([n,a]) => ({n,a})).sort((a,b) => b.a - a.a)
  }, [periodTxs])

  const incomeByCategory = useMemo(() => {
    const map = {}
    periodTxs.filter(t => t.type === 'income').forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount })
    return Object.entries(map).map(([n,a]) => ({n,a})).sort((a,b) => b.a - a.a)
  }, [periodTxs])

  const customerRanking = useMemo(() => {
    const map = {}
    periodTxs.filter(t => t.type === 'income' && t.customer).forEach(t => { map[t.customer] = (map[t.customer] || 0) + t.amount })
    return Object.entries(map).map(([n,a]) => ({n,a})).sort((a,b) => b.a - a.a)
  }, [periodTxs])

  const paymentDist = useMemo(() => {
    const map = {}
    periodTxs.forEach(t => { map[t.paymentType] = (map[t.paymentType] || 0) + t.amount })
    return Object.entries(map).map(([n,a]) => ({n,a})).sort((a,b) => b.a - a.a)
  }, [periodTxs])

  const topCategory = expenseByCategory[0]
  const topCustomer = customerRanking[0]
  const periodLabel = month === 'all' ? `${year}` : `${monthFull(month)} ${year}`

  if (data.transactions.length === 0) {
    return (
      <div className="glow-card" style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '80px 40px', textAlign: 'center', border: '1px solid var(--line)' }}>
        <div className="display gradient-text" style={{ fontSize: 28, marginBottom: 12 }}>Henüz işlem yok</div>
        <p style={{ fontSize: 14, color: 'var(--ink-muted)' }}>Sol üstteki "Yeni İşlem" butonuna basarak başla.</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>Yıl</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '7px 12px', fontSize: 13, fontWeight: 500 }}>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ width: 1, height: 24, background: 'var(--line)' }}></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>Dönem</span>
          <select value={month} onChange={e => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))} style={{ padding: '7px 12px', fontSize: 13, fontWeight: 500, minWidth: 130 }}>
            <option value="all">Tüm Yıl</option>
            {Array.from({length:12}, (_,i) => <option key={i} value={i}>{monthFull(i)}</option>)}
          </select>
        </div>
        {month !== 'all' && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setMonth(month === 0 ? 11 : month - 1)} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--bg-card)' }}><Icon name="arrowLeft" size={14}/></button>
            <button onClick={() => setMonth(month === 11 ? 0 : month + 1)} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--bg-card)' }}><Icon name="arrowRight" size={14}/></button>
          </div>
        )}
        <div style={{ marginLeft: month === 'all' ? 'auto' : 0, fontSize: 11, color: 'var(--ink-muted)' }}>
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{periodLabel}</span> · {periodTxs.length} işlem
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
        <KPICard label="Toplam Gelir" value={fmtTL(totalIncome)} icon="trending" color="green" big Icon={Icon} />
        <KPICard label="Toplam Gider" value={fmtTL(totalExpense)} icon="wallet" color="red" big Icon={Icon} />
        <KPICard label="Net Kar" value={fmtTL(netProfit)} subtitle={`Kar marjı: %${profitMargin.toFixed(1)}`} icon="spark" gradient big Icon={Icon} />
      </div>

      {/* Geçen Yıl Karşılaştırması — sadece geçen yılda da veri varsa */}
      {yoyComparison.hasData && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--line)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 14,
          display: 'grid', gridTemplateColumns: 'auto repeat(3, 1fr)', gap: 18,
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700 }}>Geçen Yıl</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{year - 1} {month !== 'all' ? monthFull(month) : ''}</div>
          </div>
          <YoYStat label="Gelir"  pct={yoyComparison.incomePct}  prev={yoyComparison.prevIncome}  positiveIsGood />
          <YoYStat label="Gider"  pct={yoyComparison.expensePct} prev={yoyComparison.prevExpense} positiveIsGood={false} />
          <YoYStat label="Net Kar" pct={yoyComparison.netPct}    prev={yoyComparison.prevNet}    positiveIsGood />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        <KPICard label={month === 'all' ? 'Aylık Ortalama Kar' : 'Bu Ayın Net Karı'} value={fmtTL(avgMonthlyProfit)} color="blue" Icon={Icon} />
        <KPICard label="En Çok Harcanan Kategori" value={topCategory ? topCategory.n : '—'} subtitle={topCategory ? fmtTL(topCategory.a) : ''} color="amber" Icon={Icon} />
        <KPICard label="En Çok Gelir Getiren Müşteri" value={topCustomer ? topCustomer.n : '—'} subtitle={topCustomer ? fmtTL(topCustomer.a) : ''} color="purple" Icon={Icon} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {month === 'all' ? (
          <ChartCard title="Aylık Trend" subtitle={`${year} — Gelir, gider ve net kar`} icon="chart" Icon={Icon}>
            <TrendChart monthly={monthly} />
          </ChartCard>
        ) : (
          <ChartCard title="Günlük Trend" subtitle={`${periodLabel} — Gün gün hareket`} icon="chart" Icon={Icon}>
            <DailyTrendChart daily={daily} />
          </ChartCard>
        )}
        <ChartCard title="Gider Kategorileri" subtitle={`${periodLabel} — Dağılım`} icon="pie" Icon={Icon}>
          <CategoryBarChart data={expenseByCategory} colorHex="#ef4444" />
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <ChartCard title="Gelir Kategorileri" subtitle={`${periodLabel} — Dağılım`} icon="pie" Icon={Icon}>
          <CategoryBarChart data={incomeByCategory} colorHex="#10b981" />
        </ChartCard>
        <ChartCard title="Ödeme Türü Dağılımı" subtitle={`${periodLabel} — Tüm işlemler`} icon="wallet" Icon={Icon}>
          <PaymentPieChart data={paymentDist} />
        </ChartCard>
      </div>

      {customerRanking.length > 0 && (
        <ChartCard title="Müşteri / Proje Bazlı Gelir" subtitle={`${periodLabel} — En çok gelir getirenden`} icon="users" Icon={Icon}>
          <CustomerBarChart data={customerRanking} />
        </ChartCard>
      )}
    </div>
  )
}

function YoYStat({ label, pct, prev, positiveIsGood }) {
  if (pct == null) {
    return (
      <div>
        <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontWeight: 600 }}>{label}</div>
        <div className="mono" style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{fmtTL(prev)}</div>
        <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>karşılaştırma yok</div>
      </div>
    )
  }
  const isUp = pct >= 0
  const isGood = positiveIsGood ? isUp : !isUp
  const color = isGood ? 'var(--green)' : 'var(--red)'
  const arrow = isUp ? '▲' : '▼'
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontWeight: 600 }}>{label}</div>
      <div className="mono" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{fmtTL(prev)}</div>
      <div style={{ fontSize: 11, color, fontWeight: 700, marginTop: 2 }}>{arrow} {Math.abs(pct).toFixed(1)}%</div>
    </div>
  )
}
