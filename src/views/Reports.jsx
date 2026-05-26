import React, { useState, useMemo } from 'react'
import { Icon, fmtTL, monthFull } from '../utils'
import { isFatihTransferTx } from '../fatihHelper'
import { useCurrency, fmtCHF, FALLBACK_RATE } from '../CurrencyContext'
import { useToast } from '../Toast'

export default function Reports({ data }) {
  const toast = useToast()
  const { getRateAt } = useCurrency()
  const [year, setYear] = useState(new Date().getFullYear())
  const [exportingPdf, setExportingPdf] = useState(false)

  // Yıl içindeki tüm işlemleri al ama Fatih transferlerini çıkar
  const yearTxs = useMemo(() =>
    data.transactions.filter(t => {
      if (new Date(t.date).getFullYear() !== year) return false
      if (isFatihTransferTx(t)) return false
      return true
    }), [data.transactions, year])

  const monthly = useMemo(() => {
    const arr = Array.from({length: 12}, (_,i) => ({ month: i, inc: 0, exp: 0 }))
    yearTxs.forEach(t => {
      const m = new Date(t.date).getMonth()
      arr[m][t.type === 'income' ? 'inc' : 'exp'] += t.amount
    })
    return arr
  }, [yearTxs])

  const total = monthly.reduce((a,m) => ({ inc: a.inc+m.inc, exp: a.exp+m.exp }), { inc: 0, exp: 0 })
  const years = useMemo(() => { const ys = new Set(data.transactions.map(t => new Date(t.date).getFullYear())); ys.add(new Date().getFullYear()); return Array.from(ys).sort((a,b) => b-a) }, [data.transactions])

  const handleExportPDF = async () => {
    setExportingPdf(true)
    try {
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = 210
      const pageHeight = 297
      const M = 15
      let yPos = 20

      // Turkish -> ASCII (helvetica is ASCII-safe only)
      const tr = (s) => String(s ?? '')
        .replace(/ş/g, 's').replace(/Ş/g, 'S')
        .replace(/ı/g, 'i').replace(/İ/g, 'I')
        .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
        .replace(/ç/g, 'c').replace(/Ç/g, 'C')
        .replace(/ö/g, 'o').replace(/Ö/g, 'O')
        .replace(/ü/g, 'u').replace(/Ü/g, 'U')

      const tlFmt = (n) => Math.round(n).toLocaleString('en-US').replace(/,/g, '.') + ' TL'
      const chfFmt = (n) => 'CHF ' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
      const monthLabels = ['Ocak','Subat','Mart','Nisan','Mayis','Haziran','Temmuz','Agustos','Eylul','Ekim','Kasim','Aralik']

      const rateFor = (date) => {
        try {
          const r = getRateAt(date)
          return (r && r > 0) ? r : FALLBACK_RATE
        } catch { return FALLBACK_RATE }
      }
      const toChf = (amount, date) => amount / rateFor(date)

      // Tum yil islemlerini aya gore grupla (Fatih cari haric)
      const monthsDetailed = Array.from({ length: 12 }, (_, m) => {
        const monthTxs = yearTxs.filter(t => new Date(t.date).getMonth() === m)
        // Tipe gore ayir
        const groupByCat = (txs) => {
          const map = {}
          txs.forEach(t => {
            if (!map[t.category]) map[t.category] = { total: 0, totalChf: 0, txs: [] }
            map[t.category].total    += t.amount
            map[t.category].totalChf += toChf(t.amount, t.date)
            map[t.category].txs.push(t)
          })
          return Object.entries(map)
            .map(([name, v]) => ({ name, ...v, txs: v.txs.sort((a, b) => a.date.localeCompare(b.date)) }))
            .sort((a, b) => b.total - a.total)
        }
        const incCats = groupByCat(monthTxs.filter(t => t.type === 'income'))
        const expCats = groupByCat(monthTxs.filter(t => t.type === 'expense'))
        const totalInc    = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
        const totalExp    = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
        const totalIncChf = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + toChf(t.amount, t.date), 0)
        const totalExpChf = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + toChf(t.amount, t.date), 0)
        const monthEnd = new Date(year, m + 1, 0).toISOString().slice(0, 10)
        return {
          month: m, incCats, expCats,
          totalInc, totalExp, totalIncChf, totalExpChf,
          net: totalInc - totalExp,
          netChf: totalIncChf - totalExpChf,
          txCount: monthTxs.length,
          rate: rateFor(monthEnd),
        }
      })

      const yearTotalInc    = monthsDetailed.reduce((s, m) => s + m.totalInc, 0)
      const yearTotalExp    = monthsDetailed.reduce((s, m) => s + m.totalExp, 0)
      const yearTotalIncChf = monthsDetailed.reduce((s, m) => s + m.totalIncChf, 0)
      const yearTotalExpChf = monthsDetailed.reduce((s, m) => s + m.totalExpChf, 0)
      const yearNet         = yearTotalInc - yearTotalExp
      const yearNetChf      = yearTotalIncChf - yearTotalExpChf

      // --- Drawing helpers ---
      const ensureRoom = (need = 12) => {
        if (yPos + need > pageHeight - 20) { pdf.addPage(); yPos = 20 }
      }
      const sectionTitle = (text, accent = [99, 102, 241]) => {
        ensureRoom(14)
        pdf.setFillColor(...accent)
        pdf.rect(M, yPos - 4, 3, 7, 'F')
        pdf.setFontSize(13)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(30)
        pdf.text(tr(text), M + 6, yPos + 1)
        yPos += 9
      }
      const monthHeader = (m) => {
        ensureRoom(20)
        pdf.setFillColor(30, 41, 59)
        pdf.rect(M, yPos, pageWidth - 2 * M, 12, 'F')
        pdf.setFontSize(12)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(255)
        pdf.text(`${monthLabels[m.month]} ${year}`, M + 4, yPos + 8)
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(200)
        pdf.text(`${m.txCount} islem  -  Kur: 1 CHF = ${m.rate.toFixed(2)} TL`, M + 50, yPos + 8)
        // Right side total
        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(255)
        pdf.text(tlFmt(m.totalExp), pageWidth - M - 4, yPos + 5, { align: 'right' })
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(200)
        pdf.text(chfFmt(m.totalExpChf), pageWidth - M - 4, yPos + 10, { align: 'right' })
        yPos += 16
      }

      // === KAPAK ===
      pdf.setFillColor(26, 31, 46)
      pdf.rect(0, 0, pageWidth, 52, 'F')
      pdf.setFillColor(99, 102, 241)
      pdf.rect(0, 52, pageWidth, 2, 'F')

      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(180, 188, 208)
      pdf.text('CXENTRIX SOLUTIONS', M, 18)
      pdf.setFontSize(22)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(255)
      pdf.text('Aylik Kategorili Harcama Raporu', M, 30)
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(180, 188, 208)
      pdf.text(`${year} Yili - Detayli Dokum (TL + CHF)`, M, 39)
      pdf.setFontSize(9)
      pdf.setTextColor(200)
      pdf.text(`Hazirlanma: ${new Date().toLocaleDateString('tr-TR')}`, pageWidth - M, 18, { align: 'right' })
      pdf.text(`Rapor No: CXR-${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}`, pageWidth - M, 24, { align: 'right' })

      yPos = 66

      // === YILLIK OZET ===
      sectionTitle('Yillik Ozet')
      const summaryCards = [
        { label: 'Yillik Toplam Gelir', tl: yearTotalInc, chf: yearTotalIncChf, accent: [16, 185, 129] },
        { label: 'Yillik Toplam Gider', tl: yearTotalExp, chf: yearTotalExpChf, accent: [239, 68, 68] },
        { label: 'Net (Gelir - Gider)',  tl: yearNet,      chf: yearNetChf,      accent: yearNet >= 0 ? [16, 185, 129] : [239, 68, 68] },
      ]
      summaryCards.forEach((c, i) => {
        const x = M + i * ((pageWidth - 2 * M) / 3 + 0)
        const w = (pageWidth - 2 * M) / 3 - 4
        pdf.setFillColor(245, 246, 250)
        pdf.rect(x, yPos, w, 22, 'F')
        pdf.setFillColor(...c.accent)
        pdf.rect(x, yPos, 2.5, 22, 'F')
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(110)
        pdf.text(tr(c.label).toUpperCase(), x + 6, yPos + 6)
        pdf.setFontSize(13)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(25)
        pdf.text(tlFmt(c.tl), x + 6, yPos + 13)
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(110)
        pdf.text(chfFmt(c.chf), x + 6, yPos + 19)
      })
      yPos += 28

      // === AYLIK KARSILASTIRMA TABLOSU ===
      sectionTitle('Aylik Kar/Zarar Ozet Tablosu')
      // Header
      pdf.setFillColor(99, 102, 241)
      pdf.rect(M, yPos - 4, pageWidth - 2 * M, 7, 'F')
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(255)
      pdf.text('Ay', M + 3, yPos)
      pdf.text('Gelir TL', M + 38, yPos)
      pdf.text('Gider TL', M + 72, yPos)
      pdf.text('Net TL', M + 108, yPos)
      pdf.text('Gider CHF', M + 138, yPos)
      pdf.text('Islem', pageWidth - M - 3, yPos, { align: 'right' })
      yPos += 7

      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(40)
      monthsDetailed.forEach((m, idx) => {
        if (m.totalInc === 0 && m.totalExp === 0) return
        ensureRoom(7)
        if (idx % 2 === 0) {
          pdf.setFillColor(247, 248, 252)
          pdf.rect(M, yPos - 4, pageWidth - 2 * M, 6, 'F')
        }
        pdf.text(`${monthLabels[m.month]} ${year}`, M + 3, yPos)
        pdf.text(m.totalInc > 0 ? tlFmt(m.totalInc) : '-', M + 38, yPos)
        pdf.text(tlFmt(m.totalExp), M + 72, yPos)
        pdf.text(`${m.net >= 0 ? '+' : '-'}${tlFmt(Math.abs(m.net))}`, M + 108, yPos)
        pdf.text(chfFmt(m.totalExpChf), M + 138, yPos)
        pdf.text(String(m.txCount), pageWidth - M - 3, yPos, { align: 'right' })
        yPos += 6
      })

      // Yıllık toplam satırı
      yPos += 2
      pdf.setFillColor(99, 102, 241)
      pdf.rect(M, yPos - 4, pageWidth - 2 * M, 7, 'F')
      pdf.setFontSize(9.5)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(255)
      pdf.text('YILLIK TOPLAM', M + 3, yPos)
      pdf.text(tlFmt(yearTotalInc), M + 38, yPos)
      pdf.text(tlFmt(yearTotalExp), M + 72, yPos)
      pdf.text(`${yearNet >= 0 ? '+' : '-'}${tlFmt(Math.abs(yearNet))}`, M + 108, yPos)
      pdf.text(chfFmt(yearTotalExpChf), M + 138, yPos)
      pdf.text(String(monthsDetailed.reduce((s, m) => s + m.txCount, 0)), pageWidth - M - 3, yPos, { align: 'right' })
      yPos += 14

      // === AY × KATEGORI × ISLEM DETAYI ===
      pdf.addPage(); yPos = 20
      sectionTitle('Aylik Kategorili Detay')
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(110)
      pdf.text(tr('Her aktif ay icin gelir/gider kategorileri ve altindaki islemler. CHF tutarlar islemin tarihindeki kura gore hesaplanmistir.'), M, yPos)
      yPos += 8

      monthsDetailed.forEach(m => {
        if (m.txCount === 0) return
        monthHeader(m)

        // GELIR bloklari
        if (m.incCats.length > 0) {
          ensureRoom(8)
          pdf.setFontSize(9)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(16, 185, 129)
          pdf.text('GELIR', M, yPos)
          pdf.text(`${tlFmt(m.totalInc)}  /  ${chfFmt(m.totalIncChf)}`, pageWidth - M, yPos, { align: 'right' })
          yPos += 6
          m.incCats.forEach(c => renderCategoryBlock(c, 'income'))
        }

        // GIDER bloklari
        if (m.expCats.length > 0) {
          ensureRoom(8)
          pdf.setFontSize(9)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(239, 68, 68)
          pdf.text('GIDER', M, yPos)
          pdf.text(`${tlFmt(m.totalExp)}  /  ${chfFmt(m.totalExpChf)}`, pageWidth - M, yPos, { align: 'right' })
          yPos += 6
          m.expCats.forEach(c => renderCategoryBlock(c, 'expense'))
        }

        // Ay sonu net
        ensureRoom(10)
        pdf.setFillColor(241, 243, 248)
        pdf.rect(M, yPos - 2, pageWidth - 2 * M, 8, 'F')
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(40)
        pdf.text(tr('Ay Sonu Net'), M + 3, yPos + 3)
        pdf.setTextColor(m.net >= 0 ? 16 : 239, m.net >= 0 ? 185 : 68, m.net >= 0 ? 129 : 68)
        pdf.text(`${m.net >= 0 ? '+' : '-'}${tlFmt(Math.abs(m.net))}  /  ${m.netChf >= 0 ? '+' : '-'}${chfFmt(Math.abs(m.netChf))}`, pageWidth - M - 3, yPos + 3, { align: 'right' })
        yPos += 14
      })

      // Kategori bloğu helper'ı
      function renderCategoryBlock(c, type) {
        // Kategori başlığı
        ensureRoom(8)
        pdf.setFillColor(type === 'income' ? 230 : 252, type === 'income' ? 248 : 232, type === 'income' ? 240 : 232)
        pdf.rect(M, yPos - 2, pageWidth - 2 * M, 6, 'F')
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(35)
        const catName = tr(c.name)
        pdf.text(catName.length > 40 ? catName.slice(0, 38) + '...' : catName, M + 3, yPos + 2)
        pdf.text(`(${c.txs.length})`, M + 80, yPos + 2)
        pdf.setTextColor(60)
        pdf.text(tlFmt(c.total), pageWidth - M - 38, yPos + 2, { align: 'right' })
        pdf.text(chfFmt(c.totalChf), pageWidth - M - 3, yPos + 2, { align: 'right' })
        yPos += 7

        // İşlemler
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(80)
        c.txs.forEach(t => {
          ensureRoom(5)
          const desc = tr(t.description || t.category)
          const truncDesc = desc.length > 56 ? desc.slice(0, 54) + '...' : desc
          const txChf = toChf(t.amount, t.date)
          pdf.setTextColor(120)
          pdf.text(new Date(t.date).toLocaleDateString('tr-TR'), M + 5, yPos)
          pdf.setTextColor(45)
          pdf.text(truncDesc, M + 28, yPos)
          pdf.setTextColor(60)
          pdf.text(tlFmt(t.amount), pageWidth - M - 38, yPos, { align: 'right' })
          pdf.text(chfFmt(txChf), pageWidth - M - 3, yPos, { align: 'right' })
          yPos += 4.5
        })
        yPos += 1
      }

      // === FOOTER ===
      const totalPages = pdf.internal.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i)
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(140)
        pdf.text(`Cxentrix Solutions  -  Aylik Kategorili Harcama Raporu  -  ${year}`, M, pageHeight - 8)
        pdf.text(`Sayfa ${i} / ${totalPages}`, pageWidth - M, pageHeight - 8, { align: 'right' })
      }

      pdf.save(`Cxentrix-Aylik-Detay-${year}.pdf`)
      toast.success(`PDF indirildi (${totalPages} sayfa)`)
    } catch (err) {
      console.error(err)
      toast.error('PDF oluşturulamadı: ' + err.message)
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '8px 14px', fontSize: 13, fontWeight: 500 }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleExportPDF}
          disabled={exportingPdf || yearTxs.length === 0}
          style={{
            background: 'var(--gradient-1)', color: 'white',
            padding: '9px 18px', borderRadius: 9, fontSize: 12, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
            opacity: (exportingPdf || yearTxs.length === 0) ? 0.5 : 1,
            border: 'none', cursor: (exportingPdf || yearTxs.length === 0) ? 'not-allowed' : 'pointer'
          }}
        >
          <Icon name="download" size={14}/>
          {exportingPdf ? 'Hazırlanıyor...' : `PDF İndir (${year})`}
        </button>
      </div>
      <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--line)' }}>
        <h3 className="display" style={{ fontSize: 16, marginBottom: 16 }}>Aylık Kar/Zarar Tablosu — {year}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 90px', gap: 12, padding: '10px 0', borderBottom: '2px solid var(--accent)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 600 }}>
          <div>Ay</div><div style={{ textAlign: 'right' }}>Gelir</div><div style={{ textAlign: 'right' }}>Gider</div><div style={{ textAlign: 'right' }}>Net</div><div style={{ textAlign: 'right' }}>Marj</div>
        </div>
        {monthly.map((m, i) => {
          const net = m.inc - m.exp
          const margin = m.inc > 0 ? (net / m.inc) * 100 : 0
          const empty = m.inc === 0 && m.exp === 0
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 90px', gap: 12, padding: '10px 0', borderBottom: i < 11 ? '1px solid var(--line-soft)' : 'none', alignItems: 'center', opacity: empty ? 0.4 : 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{monthFull(i)}</div>
              <div className="mono" style={{ textAlign: 'right', color: 'var(--green)', fontSize: 13 }}>{m.inc > 0 ? fmtTL(m.inc) : '—'}</div>
              <div className="mono" style={{ textAlign: 'right', color: 'var(--red)', fontSize: 13 }}>{m.exp > 0 ? fmtTL(m.exp) : '—'}</div>
              <div className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: net > 0 ? 'var(--green)' : net < 0 ? 'var(--red)' : 'var(--ink-muted)' }}>{empty ? '—' : `${net >= 0 ? '+' : ''}${fmtTL(net)}`}</div>
              <div className="mono" style={{ textAlign: 'right', fontSize: 12, color: 'var(--ink-muted)' }}>{empty || m.inc === 0 ? '—' : `%${margin.toFixed(1)}`}</div>
            </div>
          )
        })}
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 90px', gap: 12, padding: '14px 0 4px', borderTop: '2px solid var(--accent)', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Toplam</div>
          <div className="mono" style={{ textAlign: 'right', color: 'var(--green)', fontSize: 14, fontWeight: 700 }}>{fmtTL(total.inc)}</div>
          <div className="mono" style={{ textAlign: 'right', color: 'var(--red)', fontSize: 14, fontWeight: 700 }}>{fmtTL(total.exp)}</div>
          <div className="mono" style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: total.inc-total.exp >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtTL(total.inc - total.exp)}</div>
          <div className="mono" style={{ textAlign: 'right', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>{total.inc > 0 ? `%${((total.inc-total.exp)/total.inc*100).toFixed(1)}` : '—'}</div>
        </div>
      </div>
    </div>
  )
}
