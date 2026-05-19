import React, { useState, useMemo, useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import { Icon, fmtTL, monthName, monthFull, getChartTheme } from '../utils'
import { useCurrency, fmtCHF } from '../CurrencyContext'
import { isFatihTransferTx } from '../fatihHelper'

export default function LogicView({ data }) {
  const { getRateAt } = useCurrency()
  const [year, setYear] = useState(new Date().getFullYear())
  const [view, setView] = useState('yearly')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [expandedMonth, setExpandedMonth] = useState(null)
  const [expandedCategory, setExpandedCategory] = useState(null)
  const [exportingPdf, setExportingPdf] = useState(false)

  const availableYears = useMemo(() => {
    const ys = new Set(data.transactions.map(t => new Date(t.date).getFullYear()))
    ys.add(new Date().getFullYear())
    return Array.from(ys).sort((a,b) => b-a)
  }, [data.transactions])

  const monthlySummary = useMemo(() => {
    return Array.from({length: 12}, (_, m) => {
      const monthTxs = data.transactions.filter(t => {
        if (t.type !== 'expense') return false
        const d = new Date(t.date)
        if (d.getFullYear() !== year || d.getMonth() !== m) return false
        if (isFatihTransferTx(t)) return false
        return true
      })

      const totalTry = monthTxs.reduce((s, t) => s + t.amount, 0)
      const monthEnd = new Date(year, m + 1, 0).toISOString().slice(0, 10)
      const rate = getRateAt(monthEnd) || 36
      const totalChf = totalTry / rate

      const byCategory = {}
      monthTxs.forEach(t => {
        if (!byCategory[t.category]) byCategory[t.category] = { total: 0, txs: [] }
        byCategory[t.category].total += t.amount
        byCategory[t.category].txs.push(t)
      })

      return {
        month: m, totalTry, totalChf, rate,
        transactionCount: monthTxs.length, transactions: monthTxs,
        categories: Object.entries(byCategory).map(([n,v]) => ({
          name: n, amount: v.total, amountChf: v.total / rate,
          txs: v.txs.sort((a,b) => a.date.localeCompare(b.date)),
        })).sort((a,b) => b.amount - a.amount)
      }
    })
  }, [data.transactions, year, getRateAt])

  const yearTotalTry = monthlySummary.reduce((s,m) => s + m.totalTry, 0)
  const yearTotalChf = monthlySummary.reduce((s,m) => s + m.totalChf, 0)
  const activeMonths = monthlySummary.filter(m => m.totalTry > 0).length
  const avgMonthlyChf = activeMonths > 0 ? yearTotalChf / activeMonths : 0
  const avgMonthlyTry = activeMonths > 0 ? yearTotalTry / activeMonths : 0

  const yearlyCategoryDist = useMemo(() => {
    const map = {}
    monthlySummary.forEach(m => {
      m.categories.forEach(c => {
        if (!map[c.name]) map[c.name] = { tl: 0, chf: 0 }
        map[c.name].tl += c.amount
        map[c.name].chf += c.amountChf
      })
    })
    return Object.entries(map).map(([n, v]) => ({ name: n, ...v })).sort((a,b) => b.tl - a.tl)
  }, [monthlySummary])

  const currentMonth = monthlySummary[selectedMonth]

  const handleExportPDF = async () => {
    setExportingPdf(true)
    try {
      const { jsPDF } = await import('https://cdn.skypack.dev/jspdf@2.5.1')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = 210
      let yPos = 20

      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.text('CXENTRIX SOLUTIONS', pageWidth / 2, yPos, { align: 'center' })
      yPos += 7
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Logic Holding Maliyet Raporu - ${year}`, pageWidth / 2, yPos, { align: 'center' })
      yPos += 5
      pdf.setFontSize(9)
      pdf.setTextColor(120)
      pdf.text(`Hazirlanma: ${new Date().toLocaleDateString('tr-TR')}`, pageWidth / 2, yPos, { align: 'center' })
      yPos += 10

      pdf.setTextColor(0)
      pdf.setFontSize(13)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Yillik Ozet', 15, yPos)
      yPos += 7

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Toplam Maliyet: ${yearTotalChf.toFixed(2)} CHF`, 15, yPos)
      pdf.text(`(${yearTotalTry.toLocaleString('tr-TR', {maximumFractionDigits: 2})} TL)`, 90, yPos)
      yPos += 6
      pdf.text(`Aylik Ortalama: ${avgMonthlyChf.toFixed(2)} CHF`, 15, yPos)
      yPos += 6
      pdf.text(`Aktif Ay: ${activeMonths} ay`, 15, yPos)
      yPos += 12

      pdf.setFontSize(13)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Aylik Dokum', 15, yPos)
      yPos += 7

      pdf.setFontSize(9)
      pdf.setFillColor(99, 102, 241)
      pdf.setTextColor(255)
      pdf.rect(15, yPos - 4, pageWidth - 30, 7, 'F')
      pdf.text('Ay', 18, yPos)
      pdf.text('Islem', 50, yPos)
      pdf.text('TL', 90, yPos)
      pdf.text('CHF', 140, yPos)
      pdf.text('Kur', 175, yPos)
      yPos += 7

      pdf.setTextColor(0)
      pdf.setFont('helvetica', 'normal')

      monthlySummary.forEach((m, idx) => {
        if (m.totalTry === 0) return
        if (yPos > 270) { pdf.addPage(); yPos = 20 }
        if (idx % 2 === 0) { pdf.setFillColor(245, 246, 250); pdf.rect(15, yPos - 4, pageWidth - 30, 6, 'F') }
        const monthLabels = ['Ocak','Subat','Mart','Nisan','Mayis','Haziran','Temmuz','Agustos','Eylul','Ekim','Kasim','Aralik']
        pdf.text(`${monthLabels[m.month]} ${year}`, 18, yPos)
        pdf.text(String(m.transactionCount), 50, yPos)
        pdf.text(m.totalTry.toLocaleString('tr-TR', {maximumFractionDigits: 2}), 90, yPos)
        pdf.text(m.totalChf.toFixed(2), 140, yPos)
        pdf.text(m.rate.toFixed(4), 175, yPos)
        yPos += 6
      })

      yPos += 3
      pdf.setFillColor(99, 102, 241)
      pdf.setTextColor(255)
      pdf.rect(15, yPos - 4, pageWidth - 30, 7, 'F')
      pdf.setFont('helvetica', 'bold')
      pdf.text('TOPLAM', 18, yPos)
      pdf.text(yearTotalTry.toLocaleString('tr-TR', {maximumFractionDigits: 2}), 90, yPos)
      pdf.text(yearTotalChf.toFixed(2), 140, yPos)

      pdf.save(`Cxentrix-Logic-Raporu-${year}.pdf`)
    } catch (err) {
      alert('PDF olusturulamadi: ' + err.message)
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #1a1f2e 0%, #2d3548 100%)',
        color: 'white', borderRadius: 16, padding: '24px 28px', marginBottom: 18,
        position: 'relative', overflow: 'hidden',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap'
      }}>
        <div style={{ position: 'absolute', top: -60, right: -60, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, transparent 70%)' }}/>
        <div style={{ position: 'relative', flex: 1 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7, fontWeight: 600, marginBottom: 8 }}>
            Logic Holding · Yönetici Raporları
          </div>
          <h2 className="display" style={{ fontSize: 28, marginBottom: 4, lineHeight: 1.1 }}>Cxentrix Solutions Maliyet Analizi</h2>
          <p style={{ fontSize: 12, opacity: 0.7 }}>Aylık kurları ayarlamak için → <strong>Ayarlar → Aylık Kurlar</strong></p>
        </div>
        <button onClick={handleExportPDF} disabled={exportingPdf} style={{
          background: 'rgba(255,255,255,0.95)', color: '#1a1f2e',
          padding: '10px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: 8, position: 'relative',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)', opacity: exportingPdf ? 0.7 : 1, border: 'none', cursor: 'pointer'
        }}>
          <Icon name="download" size={14}/> {exportingPdf ? 'Hazırlanıyor...' : 'PDF İndir'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>Yıl</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '4px 8px', fontSize: 13, fontWeight: 500, border: 'none', background: 'transparent' }}>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 10, padding: 4, boxShadow: 'var(--shadow-sm)', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 4, bottom: 4,
            left: view === 'yearly' ? 4 : '50%',
            width: 'calc(50% - 4px)',
            background: 'var(--gradient-1)', borderRadius: 7,
            transition: 'left 0.25s ease',
            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)', zIndex: 0
          }}/>
          <button onClick={() => setView('yearly')} style={{
            padding: '9px 20px', borderRadius: 7, fontSize: 12, fontWeight: 600,
            color: view === 'yearly' ? 'white' : 'var(--ink-muted)',
            background: 'transparent', position: 'relative', zIndex: 1,
            display: 'flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer'
          }}>
            <Icon name="chart" size={13} /> Yıllık Rapor
          </button>
          <button onClick={() => setView('monthly')} style={{
            padding: '9px 20px', borderRadius: 7, fontSize: 12, fontWeight: 600,
            color: view === 'monthly' ? 'white' : 'var(--ink-muted)',
            background: 'transparent', position: 'relative', zIndex: 1,
            display: 'flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer'
          }}>
            <Icon name="pie" size={13} /> Aylık Rapor
          </button>
        </div>
      </div>

      {view === 'yearly' ? (
        <YearlyView
          year={year}
          monthlySummary={monthlySummary}
          yearTotalTry={yearTotalTry}
          yearTotalChf={yearTotalChf}
          activeMonths={activeMonths}
          avgMonthlyChf={avgMonthlyChf}
          avgMonthlyTry={avgMonthlyTry}
          yearlyCategoryDist={yearlyCategoryDist}
          expandedMonth={expandedMonth}
          setExpandedMonth={setExpandedMonth}
          expandedCategory={expandedCategory}
          setExpandedCategory={setExpandedCategory}
        />
      ) : (
        <MonthlyView
          year={year}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          currentMonth={currentMonth}
          monthlySummary={monthlySummary}
        />
      )}
    </div>
  )
}

function YearlyView({ year, monthlySummary, yearTotalTry, yearTotalChf, activeMonths, avgMonthlyChf, avgMonthlyTry, yearlyCategoryDist, expandedMonth, setExpandedMonth, expandedCategory, setExpandedCategory }) {
  return (
    <div className="fade-in">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        <BigKPI label="Yıllık Toplam" mainValue={fmtCHF(yearTotalChf)} subValue={fmtTL(yearTotalTry)} icon="wallet" gradient />
        <BigKPI label="Aylık Ortalama" mainValue={fmtCHF(avgMonthlyChf)} subValue={fmtTL(avgMonthlyTry)} icon="trending" color="blue" />
        <BigKPI label="Aktif Ay" mainValue={`${activeMonths} ay`} subValue={`${monthlySummary.reduce((s,m) => s + m.transactionCount, 0)} işlem`} icon="dashboard" color="purple" />
        <BigKPI label="En Pahalı Kategori" mainValue={yearlyCategoryDist[0]?.name || '—'} subValue={yearlyCategoryDist[0] ? fmtTL(yearlyCategoryDist[0].tl) : ''} icon="spark" color="amber" small />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
        <ChartBox title="Aylık Maliyet Trendi" subtitle={`${year} yılı 12 aylık seyir`} icon="chart">
          <YearlyLineChart monthlySummary={monthlySummary} />
        </ChartBox>
        <ChartBox title="Kategori Dağılımı" subtitle="Yıllık toplam üzerinden" icon="pie">
          <YearlyDonutChart data={yearlyCategoryDist} />
        </ChartBox>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        <ChartBox title="Aylık Bazda Karşılaştırma" subtitle="TL bazlı maliyet" icon="dashboard">
          <YearlyBarChart monthlySummary={monthlySummary} />
        </ChartBox>
        <ChartBox title="Top 5 Maliyet Kategorisi" subtitle="En çok harcama yapılanlar" icon="trending">
          <TopCategoriesList data={yearlyCategoryDist.slice(0, 5)} total={yearTotalTry} />
        </ChartBox>
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)' }}>
        <h3 className="display" style={{ fontSize: 17, marginBottom: 4 }}>Aylık Detay Tablosu</h3>
        <p style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 16 }}>
          Aya tıkla → kategoriler aç. Kategoriye tıkla → işlemleri gör.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {monthlySummary.filter(m => m.totalTry > 0).map(m => {
            const isExpanded = expandedMonth === m.month
            return (
              <div key={m.month} style={{
                background: isExpanded ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                border: `1px solid ${isExpanded ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: 10, overflow: 'hidden', transition: 'all 0.2s'
              }}>
                <div onClick={() => { setExpandedMonth(isExpanded ? null : m.month); setExpandedCategory(null) }} style={{ display: 'grid', gridTemplateColumns: '140px 100px 1fr 1fr 30px', gap: 14, padding: '14px 18px', cursor: 'pointer', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{monthFull(m.month)}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 2 }}>{year}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{m.transactionCount} işlem</div>
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>TL</div>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)' }}>{fmtTL(m.totalTry)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 600 }}>CHF</div>
                    <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{fmtCHF(m.totalChf)}</div>
                  </div>
                  <div style={{ color: 'var(--ink-muted)' }}>
                    <Icon name={isExpanded ? 'arrowUp' : 'arrowDown'} size={16} />
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ padding: '14px 18px 18px', borderTop: '1px solid var(--accent)', background: 'var(--bg-card)' }}>
                    {m.categories.map(c => {
                      const isCatExpanded = expandedCategory === `${m.month}-${c.name}`
                      const pct = (c.amount / m.totalTry) * 100
                      return (
                        <div key={c.name} style={{ marginBottom: 8 }}>
                          <div onClick={() => setExpandedCategory(isCatExpanded ? null : `${m.month}-${c.name}`)} style={{
                            background: isCatExpanded ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                            borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
                            border: `1px solid ${isCatExpanded ? 'var(--accent)' : 'var(--line)'}`
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Icon name={isCatExpanded ? 'arrowUp' : 'arrowRight'} size={12} />
                                <span style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</span>
                                <span style={{ fontSize: 10, color: 'var(--ink-muted)' }}>({c.txs.length} işlem)</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span className="mono" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{fmtCHF(c.amountChf)}</span>
                                <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{fmtTL(c.amount)}</span>
                                <span style={{ fontSize: 11, color: 'var(--ink-muted)', minWidth: 50, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                              </div>
                            </div>
                            <div style={{ height: 3, background: 'var(--line-soft)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--gradient-1)', borderRadius: 2 }}/>
                            </div>
                          </div>

                          {isCatExpanded && (
                            <div style={{ marginTop: 6, marginLeft: 14, paddingLeft: 14, borderLeft: '2px solid var(--accent)' }}>
                              {c.txs.map(tx => (
                                <div key={tx.id} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px', marginBottom: 6, border: '1px solid var(--line-soft)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>{tx.description || '—'}</div>
                                      <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--ink-muted)', flexWrap: 'wrap' }}>
                                        <span>📅 {new Date(tx.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                                        {tx.paymentType && <span>💳 {tx.paymentType}</span>}
                                        {tx.customer && <span>👤 {tx.customer}</span>}
                                      </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>{fmtTL(tx.amount)}</div>
                                      <div className="mono" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{fmtCHF(tx.amount / m.rate)}</div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--line)', fontSize: 10, color: 'var(--ink-muted)' }}>
                      Kullanılan kur: 1 CHF = {m.rate.toFixed(4)} TL · Ayarlar'dan değiştirebilirsin
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {monthlySummary.filter(m => m.totalTry > 0).length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '2px solid var(--accent)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700 }}>{year} YILI TOPLAM</div>
            <div style={{ textAlign: 'right' }}>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-soft)' }}>{fmtTL(yearTotalTry)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{fmtCHF(yearTotalChf)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MonthlyView({ year, selectedMonth, setSelectedMonth, currentMonth, monthlySummary }) {
  if (!currentMonth || currentMonth.totalTry === 0) {
    return (
      <div className="fade-in">
        <MonthSelector year={year} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} monthlySummary={monthlySummary} />
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 60, textAlign: 'center', color: 'var(--ink-muted)', border: '1px solid var(--line)' }}>
          {monthFull(selectedMonth)} {year} için kayıtlı gider bulunamadı.
        </div>
      </div>
    )
  }

  const avgTx = currentMonth.totalTry / (currentMonth.transactionCount || 1)
  const topCategory = currentMonth.categories[0]
  const top5Txs = [...currentMonth.transactions].sort((a, b) => b.amount - a.amount).slice(0, 5)
  const prevMonth = selectedMonth > 0 ? monthlySummary[selectedMonth - 1] : null
  const changePct = prevMonth && prevMonth.totalTry > 0 ? ((currentMonth.totalTry - prevMonth.totalTry) / prevMonth.totalTry) * 100 : 0

  return (
    <div className="fade-in">
      <MonthSelector year={year} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} monthlySummary={monthlySummary} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        <BigKPI label={`${monthFull(selectedMonth)} Toplam`} mainValue={fmtCHF(currentMonth.totalChf)} subValue={fmtTL(currentMonth.totalTry)} icon="wallet" gradient />
        <BigKPI label="İşlem Sayısı" mainValue={currentMonth.transactionCount.toString()} subValue={`Ort: ${fmtTL(avgTx)}`} icon="list" color="blue" />
        <BigKPI label="En Pahalı Kategori" mainValue={topCategory?.name || '—'} subValue={topCategory ? fmtTL(topCategory.amount) : ''} icon="spark" color="amber" small />
        <BigKPI label="Geçen Aya Göre" mainValue={prevMonth ? `${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%` : '—'} subValue={prevMonth ? `Geçen: ${fmtTL(prevMonth.totalTry)}` : 'Önceki ay yok'} icon={changePct > 0 ? 'arrowUp' : 'arrowDown'} color={changePct > 0 ? 'red' : 'green'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <ChartBox title="Kategori Dağılımı" subtitle="Pasta grafik" icon="pie">
          <MonthlyPieChart categories={currentMonth.categories} />
        </ChartBox>
        <ChartBox title="Kategori Bazlı Tutar" subtitle="TL bazında dağılım" icon="chart">
          <MonthlyBarChart categories={currentMonth.categories} />
        </ChartBox>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        <ChartBox title="En Pahalı 5 İşlem" subtitle={`${monthFull(selectedMonth)} ${year}`} icon="trending">
          <TopTransactionsList txs={top5Txs} rate={currentMonth.rate} />
        </ChartBox>
        <ChartBox title="Kategori Listesi" subtitle="Tüm kategoriler" icon="dashboard">
          <CategoryListBox categories={currentMonth.categories} total={currentMonth.totalTry} />
        </ChartBox>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%)',
        color: 'white', borderRadius: 14, padding: '18px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 8px 24px rgba(99, 102, 241, 0.25)', flexWrap: 'wrap', gap: 14
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.85, fontWeight: 600, marginBottom: 4 }}>
            {monthFull(selectedMonth)} {year} Özet
          </div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>
            Kur: 1 CHF = {currentMonth.rate.toFixed(4)} TL
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, marginBottom: 2 }}>{fmtCHF(currentMonth.totalChf)}</div>
          <div className="mono" style={{ fontSize: 14, opacity: 0.85 }}>{fmtTL(currentMonth.totalTry)}</div>
        </div>
      </div>
    </div>
  )
}

function MonthSelector({ year, selectedMonth, setSelectedMonth, monthlySummary }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>Ay Seç:</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {Array.from({length: 12}, (_, i) => {
          const hasData = monthlySummary[i].totalTry > 0
          return (
            <button key={i} onClick={() => setSelectedMonth(i)} disabled={!hasData} style={{
              padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              background: selectedMonth === i ? 'var(--accent)' : 'var(--bg-elevated)',
              color: selectedMonth === i ? 'white' : hasData ? 'var(--ink-soft)' : 'var(--ink-faint)',
              border: selectedMonth === i ? 'none' : '1px solid var(--line)',
              cursor: hasData ? 'pointer' : 'not-allowed',
              opacity: hasData ? 1 : 0.4
            }}>
              {monthName(i)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function BigKPI({ label, mainValue, subValue, icon, color, gradient, small }) {
  const colorMap = { blue: 'var(--blue)', green: 'var(--green)', red: 'var(--red)', amber: 'var(--amber)', purple: 'var(--purple)', accent: 'var(--accent)' }
  return (
    <div style={{
      background: gradient ? 'var(--gradient-1)' : 'var(--bg-card)',
      color: gradient ? 'white' : 'var(--ink)',
      border: gradient ? 'none' : '1px solid var(--line)',
      borderRadius: 14, padding: '18px 18px',
      boxShadow: gradient ? '0 8px 24px rgba(99, 102, 241, 0.25)' : 'none'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85, fontWeight: 700 }}>{label}</div>
        {!gradient && <div style={{ width: 28, height: 28, borderRadius: 8, background: `${colorMap[color] || colorMap.accent}20`, color: colorMap[color] || colorMap.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={14} /></div>}
      </div>
      <div className="mono" style={{ fontSize: small ? 15 : 22, fontWeight: 700, color: gradient ? 'white' : (colorMap[color] || 'var(--ink)'), marginBottom: 4, lineHeight: 1.1 }}>{mainValue}</div>
      {subValue && <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.3 }}>{subValue}</div>}
    </div>
  )
}

function ChartBox({ title, subtitle, icon, children }) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 18, border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={14}/>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 1 }}>{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}

function YearlyLineChart({ monthlySummary }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()
    const t = getChartTheme()
    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'line',
      data: {
        labels: monthlySummary.map(m => monthName(m.month)),
        datasets: [
          { label: 'TL Maliyet', data: monthlySummary.map(m => m.totalTry), borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 2.5, tension: 0.35, fill: true, pointRadius: 4, pointHoverRadius: 6, yAxisID: 'y' },
          { label: 'CHF Maliyet', data: monthlySummary.map(m => m.totalChf), borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.1)', borderWidth: 2.5, tension: 0.35, fill: false, pointRadius: 4, pointHoverRadius: 6, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', align: 'end', labels: { font: { size: 11 }, color: t.textColor, usePointStyle: true, padding: 12 } },
          tooltip: { backgroundColor: 'rgba(15, 17, 23, 0.95)', titleColor: '#fff', bodyColor: '#fff', padding: 10, cornerRadius: 8 }
        },
        scales: {
          y: { type: 'linear', position: 'left', beginAtZero: true, grid: { color: t.gridColor }, ticks: { color: t.textColor, callback: v => v >= 1000000 ? '₺' + (v/1000000).toFixed(1) + 'M' : '₺' + (v/1000).toFixed(0) + 'K' } },
          y1: { type: 'linear', position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: '#6366f1', callback: v => v.toFixed(0) + ' CHF' } },
          x: { grid: { display: false }, ticks: { color: t.textColor } }
        }
      }
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [monthlySummary])
  return <div style={{ height: 280 }}><canvas ref={canvasRef}></canvas></div>
}

function YearlyDonutChart({ data }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()
    const t = getChartTheme()
    const top = data.slice(0, 8)
    const others = data.slice(8).reduce((s, d) => s + d.tl, 0)
    const labels = top.map(d => d.name)
    const values = top.map(d => d.tl)
    if (others > 0) { labels.push('Diğer'); values.push(others) }
    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f59e0b','#10b981','#06b6d4','#3b82f6','#94a3b8'], borderColor: t.isDark ? '#1a1f2e' : '#fff', borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: {
          legend: { position: 'right', labels: { font: { size: 10 }, color: t.textColor, padding: 8, boxWidth: 10 } },
          tooltip: { backgroundColor: 'rgba(15, 17, 23, 0.95)', titleColor: '#fff', bodyColor: '#fff', padding: 10, cornerRadius: 8, callbacks: { label: (ctx) => `${ctx.label}: ${fmtTL(ctx.parsed)}` } }
        }
      }
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [data])
  return <div style={{ height: 280 }}><canvas ref={canvasRef}></canvas></div>
}

function YearlyBarChart({ monthlySummary }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()
    const t = getChartTheme()
    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'bar',
      data: { labels: monthlySummary.map(m => monthName(m.month)), datasets: [{ label: 'Maliyet TL', data: monthlySummary.map(m => m.totalTry), backgroundColor: 'rgba(99, 102, 241, 0.7)', borderColor: '#6366f1', borderWidth: 1, borderRadius: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15, 17, 23, 0.95)', titleColor: '#fff', bodyColor: '#fff', padding: 10, cornerRadius: 8, callbacks: { label: (ctx) => fmtTL(ctx.parsed.y) } } },
        scales: {
          y: { beginAtZero: true, grid: { color: t.gridColor }, ticks: { color: t.textColor, callback: v => v >= 1000000 ? '₺' + (v/1000000).toFixed(1) + 'M' : '₺' + (v/1000).toFixed(0) + 'K' } },
          x: { grid: { display: false }, ticks: { color: t.textColor } }
        }
      }
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [monthlySummary])
  return <div style={{ height: 240 }}><canvas ref={canvasRef}></canvas></div>
}

function MonthlyPieChart({ categories }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()
    const t = getChartTheme()
    const top = categories.slice(0, 7)
    const others = categories.slice(7).reduce((s, c) => s + c.amount, 0)
    const labels = top.map(c => c.name)
    const values = top.map(c => c.amount)
    if (others > 0) { labels.push('Diğer'); values.push(others) }
    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'pie',
      data: { labels, datasets: [{ data: values, backgroundColor: ['#ef4444','#f59e0b','#10b981','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#94a3b8'], borderColor: t.isDark ? '#1a1f2e' : '#fff', borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { font: { size: 10 }, color: t.textColor, padding: 8, boxWidth: 10 } },
          tooltip: { backgroundColor: 'rgba(15, 17, 23, 0.95)', titleColor: '#fff', bodyColor: '#fff', padding: 10, cornerRadius: 8, callbacks: { label: (ctx) => `${ctx.label}: ${fmtTL(ctx.parsed)}` } }
        }
      }
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [categories])
  return <div style={{ height: 260 }}><canvas ref={canvasRef}></canvas></div>
}

function MonthlyBarChart({ categories }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()
    const t = getChartTheme()
    const top = categories.slice(0, 8)
    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'bar',
      data: { labels: top.map(c => c.name), datasets: [{ label: 'TL', data: top.map(c => c.amount), backgroundColor: 'rgba(239, 68, 68, 0.7)', borderColor: '#ef4444', borderWidth: 1, borderRadius: 6 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15, 17, 23, 0.95)', titleColor: '#fff', bodyColor: '#fff', padding: 10, cornerRadius: 8, callbacks: { label: (ctx) => fmtTL(ctx.parsed.x) } } },
        scales: {
          x: { beginAtZero: true, grid: { color: t.gridColor }, ticks: { color: t.textColor, callback: v => v >= 1000000 ? '₺' + (v/1000000).toFixed(1) + 'M' : '₺' + (v/1000).toFixed(0) + 'K' } },
          y: { grid: { display: false }, ticks: { color: t.textColor, font: { size: 10 } } }
        }
      }
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [categories])
  return <div style={{ height: 260 }}><canvas ref={canvasRef}></canvas></div>
}

function TopCategoriesList({ data, total }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((c, i) => {
        const pct = (c.tl / total) * 100
        return (
          <div key={c.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{i + 1}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{fmtTL(c.tl)}</span>
                <span style={{ fontSize: 10, color: 'var(--ink-muted)', minWidth: 40, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
              </div>
            </div>
            <div style={{ height: 4, background: 'var(--line-soft)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--gradient-1)', borderRadius: 2 }}/>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TopTransactionsList({ txs, rate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {txs.map((tx, i) => (
        <div key={tx.id} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ background: 'var(--red-soft)', color: 'var(--red)', padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>#{i + 1}</span>
                <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description || tx.category}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
                {new Date(tx.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} · {tx.category}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>{fmtTL(tx.amount)}</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{fmtCHF(tx.amount / rate)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function CategoryListBox({ categories, total }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
      {categories.map(c => {
        const pct = (c.amount / total) * 100
        return (
          <div key={c.name} style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 500 }}>{c.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="mono" style={{ fontSize: 11, fontWeight: 600 }}>{fmtTL(c.amount)}</span>
              <span style={{ fontSize: 9, color: 'var(--ink-muted)', minWidth: 30, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
