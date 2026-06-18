#!/usr/bin/env node
/**
 * Tek seferlik detaylı finansal rapor: Şubat-Mayıs 2026.
 *
 * Mevcut Logic PDF'inden çok daha fazla detay içerir:
 *   - Kapak + yönetici özeti
 *   - 4 aylık karşılaştırma tablosu
 *   - Her ay için (Şubat, Mart, Nisan, Mayıs):
 *       toplam KPI'lar, gelir + gider kategori dağılımı,
 *       Fatih hesap hareketi, Tuğba ödemesi,
 *       o ayın tüm işlemlerinin tek tek listesi
 *   - 4 aylık toplam kategori analizi (Top 20)
 *   - Ödeme tipi analizi (kim ne kadar ödedi)
 *   - Fatih cari hesap 4 aylık özeti
 *   - Logic Holding'e gönderilmesi gereken toplam
 *
 * Çıktı: Downloads/Cxentrix-Detayli-Rapor-Sub-May-2026.pdf
 *
 * Çalıştırma:
 *   node scripts/detailed-report-feb-may.mjs
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { jsPDF } from 'jspdf'

// pg, DATE kolonlarını varsayılan olarak yerel saat dilimine
// çevirip Date object döndürür — bu "2026-02-01"i UTC'de
// "2026-01-31T21:00:00Z"e dönüştürür ve ay hesabını bozar.
// Type 1082 = DATE. Parser'ı kapatınca pg ham 'YYYY-MM-DD'
// string'i döndürür.
pg.types.setTypeParser(1082, (v) => v)

// ── ENV yükle ────────────────────────────────────────────────────────
function loadEnvFile(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) {
      process.env[m[1].trim()] = m[2].trim()
    }
  }
}
loadEnvFile('.env.local')
loadEnvFile('.env')

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('SUPABASE_DB_URL .env.local içinde olmalı')
  process.exit(1)
}

// ── DB'den veri çek ──────────────────────────────────────────────────
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()
console.log('DB bağlandı, veri çekiliyor…')

const PERIOD_START = '2026-02-01'
const PERIOD_END   = '2026-05-31'
const MONTHS = [1, 2, 3, 4]  // Şubat, Mart, Nisan, Mayıs (0-indexed)
const YEAR = 2026

const [txRes, salaryRes, commissionRes, tugbaRes, rateRes] = await Promise.all([
  client.query(`select * from public.transactions where date >= $1 and date <= $2 order by date, created_at`, [PERIOD_START, PERIOD_END]),
  client.query(`select * from public.fatih_monthly_salaries where year=$1 and month = any($2::int[]) order by year, month`, [YEAR, MONTHS]),
  client.query(`select * from public.french_team_commissions where year=$1 and month = any($2::int[]) order by year, month`, [YEAR, MONTHS]),
  client.query(`select * from public.tugba_monthly_salaries where year=$1 and month = any($2::int[]) order by year, month`, [YEAR, MONTHS]),
  client.query(`select * from public.exchange_rates order by date desc limit 50`),
])

await client.end()

const transactions = txRes.rows
const salaries     = salaryRes.rows
const commissions  = commissionRes.rows
const tugbaSalaries = tugbaRes.rows
const rates        = rateRes.rows

// pg driver DATE kolonlarını JS Date object olarak döndürür ve
// timezone (UTC vs Türkiye saati) kayması yapar. Hepsini YYYY-MM-DD
// string formatına normalize edelim ki sonraki karşılaştırmalar
// güvenli olsun.
const toDateStr = (d) => {
  if (!d) return null
  if (d instanceof Date) {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return String(d).slice(0, 10)
}
transactions.forEach(t => { t.date = toDateStr(t.date) })
rates.forEach(r => { r.date = toDateStr(r.date) })

console.log(`  ${transactions.length} işlem, ${salaries.length} maaş, ${commissions.length} prim, ${tugbaSalaries.length} Tuğba maaşı`)

// ── Yardımcılar ──────────────────────────────────────────────────────
const FALLBACK_RATE = 54
const tr = (s) => String(s ?? '')
  .replace(/ş/g, 's').replace(/Ş/g, 'S')
  .replace(/ı/g, 'i').replace(/İ/g, 'I')
  .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
  .replace(/ç/g, 'c').replace(/Ç/g, 'C')
  .replace(/ö/g, 'o').replace(/Ö/g, 'O')
  .replace(/ü/g, 'u').replace(/Ü/g, 'U')
  .replace(/₺/g, ' TL').replace(/€/g, ' EUR').replace(/£/g, ' GBP').replace(/\$/g, ' USD')
  .replace(/[‘’‚‛]/g, "'")
  .replace(/[“”„‟]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/…/g, '...')
  .replace(/[^\x00-\x7F]/g, '?')  // kalan tüm non-ASCII karakterler '?' olur — PDF crash etmez

const tlFmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US').replace(/,/g, '.') + ' TL'
const chfFmt = (n) => 'CHF ' + (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const num = (n) => Number(n) || 0

const MONTH_LABELS = ['Ocak','Subat','Mart','Nisan','Mayis','Haziran','Temmuz','Agustos','Eylul','Ekim','Kasim','Aralik']

const rateForDate = (date) => {
  if (!date) return FALLBACK_RATE
  const d = toDateStr(date)
  const found = rates.find(r => r.date <= d)
  return found ? num(found.chf_to_try) : FALLBACK_RATE
}

const isFatihTransferTx = (tx) => {
  if (!tx) return false
  const cat = String(tx.category || '').toLowerCase()
  const desc = String(tx.description || '').toLowerCase()
  if (!cat.includes('fatih')) return false
  if (desc.includes('maaş') || desc.includes('aylık') || desc.includes('primi')) return false
  return true
}

const monthOf = (date) => {
  // toDateStr ile YYYY-MM-DD'ye normalize edildi; ay = karakter 5-7
  const d = toDateStr(date)
  if (!d || d.length < 7) return -1
  return parseInt(d.slice(5, 7), 10) - 1
}
const isInPeriod = (tx) => {
  const d = toDateStr(tx.date)
  return d >= PERIOD_START && d <= PERIOD_END
}

// ── PDF setup ────────────────────────────────────────────────────────
const pdf = new jsPDF('p', 'mm', 'a4')
const pageWidth = 210
const pageHeight = 297
const M = 15
let yPos = 20

const ensureRoom = (need = 12) => {
  if (yPos + need > pageHeight - 18) {
    pdf.addPage()
    yPos = 20
  }
}

const sectionTitle = (text, accent = [99, 102, 241]) => {
  ensureRoom(14)
  pdf.setFillColor(...accent)
  pdf.rect(M, yPos - 4, 3, 8, 'F')
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(25)
  pdf.text(tr(text), M + 7, yPos + 2)
  yPos += 10
}

const subTitle = (text, color = 60) => {
  ensureRoom(10)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  if (Array.isArray(color)) pdf.setTextColor(color[0], color[1], color[2])
  else pdf.setTextColor(color)
  pdf.text(tr(text), M, yPos)
  yPos += 6
}

const para = (text, lineHeight = 5) => {
  pdf.setFontSize(9.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(70)
  const lines = pdf.splitTextToSize(tr(text), pageWidth - 2 * M)
  for (const line of lines) {
    ensureRoom(lineHeight + 1)
    pdf.text(line, M, yPos)
    yPos += lineHeight
  }
}

const hr = () => {
  ensureRoom(6)
  pdf.setDrawColor(220)
  pdf.line(M, yPos, pageWidth - M, yPos)
  yPos += 4
}

// Generic tablo çizici
const renderTable = ({ headers, widths, rows, headerColor = [99, 102, 241], alternating = true, rightAlignFrom = 0, fontSize = 9 }) => {
  const totalW = widths.reduce((a, b) => a + b, 0)
  const startX = M + Math.max(0, (pageWidth - 2 * M - totalW) / 2)

  // Header
  ensureRoom(8)
  pdf.setFillColor(...headerColor)
  pdf.rect(M, yPos - 4, pageWidth - 2 * M, 7, 'F')
  pdf.setFontSize(fontSize)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255)
  let x = startX
  headers.forEach((h, i) => {
    const align = i >= rightAlignFrom ? 'right' : 'left'
    if (align === 'right') {
      pdf.text(tr(h), x + widths[i] - 1, yPos)
    } else {
      pdf.text(tr(h), x + 1, yPos)
    }
    x += widths[i]
  })
  yPos += 7

  // Rows
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(35)
  // Karakter bazlı hızlı truncate — getTextWidth pahalı ve bazen
  // sonsuz döngü oluşturuyordu. Her mm'ye ~0.55 karakter düşüyor
  // (~9pt helvetica). Bu yaklaşıkla budayıp tek seferde kesiyoruz.
  const charsForMm = (mm) => Math.max(4, Math.floor(mm / 1.7))
  rows.forEach((row, idx) => {
    ensureRoom(6)
    if (alternating && idx % 2 === 0) {
      pdf.setFillColor(247, 248, 252)
      pdf.rect(M, yPos - 4, pageWidth - 2 * M, 6, 'F')
    }
    let cx = startX
    row.forEach((cell, i) => {
      const align = i >= rightAlignFrom ? 'right' : 'left'
      const text = tr(cell)
      const maxChars = charsForMm(widths[i] - 2)
      const truncated = text.length > maxChars ? text.slice(0, maxChars - 2) + '..' : text
      if (align === 'right') {
        pdf.text(truncated, cx + widths[i] - 1, yPos, { align: 'right' })
      } else {
        pdf.text(truncated, cx + 1, yPos)
      }
      cx += widths[i]
    })
    yPos += 6
  })
}

// ── KAPAK ───────────────────────────────────────────────────────────
pdf.setFillColor(20, 23, 38)
pdf.rect(0, 0, pageWidth, 60, 'F')
pdf.setFillColor(99, 102, 241)
pdf.rect(0, 60, pageWidth, 3, 'F')

pdf.setFontSize(12)
pdf.setFont('helvetica', 'normal')
pdf.setTextColor(170, 180, 210)
pdf.text('CXENTRIX SOLUTIONS', M, 20)

pdf.setFontSize(24)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(255)
pdf.text('Detayli Finansal Rapor', M, 34)

pdf.setFontSize(13)
pdf.setFont('helvetica', 'normal')
pdf.setTextColor(180, 188, 215)
pdf.text('Subat 2026 - Mayis 2026', M, 44)

pdf.setFontSize(10)
pdf.setTextColor(200)
pdf.text(`Hazirlanma: ${new Date().toLocaleDateString('tr-TR')}`, pageWidth - M, 20, { align: 'right' })
pdf.text(`Rapor No: CXR-DETAY-2026-0602`, pageWidth - M, 26, { align: 'right' })

yPos = 78

// ── 4 AYLIK GENEL TOPLAMLAR ─────────────────────────────────────────
const operationalTxs = transactions.filter(t => t.type === 'expense' && !isFatihTransferTx(t))
const incomeTxs = transactions.filter(t => t.type === 'income')

const totalIncome = incomeTxs.reduce((s, t) => s + num(t.amount), 0)
const totalExpense = operationalTxs.reduce((s, t) => s + num(t.amount), 0)
const netProfit = totalIncome - totalExpense

const totalSalaryChf = salaries.reduce((s, x) => s + num(x.amount_chf), 0)
const totalSalaryTry = salaries.reduce((s, x) => s + num(x.amount_try), 0)
const totalCommChf = commissions.reduce((s, x) => s + num(x.total_chf), 0)
const totalTugbaChf = tugbaSalaries.reduce((s, x) => s + num(x.amount_chf), 0)
const totalTugbaTry = tugbaSalaries.reduce((s, x) => s + num(x.amount_try), 0)

// Şirket içi harcamalar
const advanceTxs = transactions.filter(t => {
  if (t.type !== 'expense') return false
  const cat = String(t.category || '').toLowerCase()
  const pay = String(t.payment_type || '').toLowerCase()
  return pay.includes('fatih') && !cat.includes('fatih') && !cat.includes('french team')
})
const advanceTotal = advanceTxs.reduce((s, t) => s + num(t.amount), 0)

// Şirket → Fatih Transferleri
const transferTxs = transactions.filter(isFatihTransferTx)
const transferTotal = transferTxs.reduce((s, t) => s + num(t.amount), 0)

// ── YONETICI OZETI ──────────────────────────────────────────────────
sectionTitle('Yonetici Ozeti')

const summaryText = `Cxentrix Solutions'in Subat-Mayis 2026 donemini kapsayan 4 aylik finansal performansi: toplam gelir ${tlFmt(totalIncome)}, operasyonel toplam gider ${tlFmt(totalExpense)} (Fatih cari transferleri haric), net sonuc ${netProfit >= 0 ? '+' : '-'}${tlFmt(Math.abs(netProfit))}. Donem icinde ${transactions.length} adet islem kaydedilmis; bunlardan ${operationalTxs.length}'i operasyonel gider, ${incomeTxs.length}'i gelir kalemidir. Fatih Karakas icin ${salaries.length} aylik maas tahakkuku (${chfFmt(totalSalaryChf)}) ve ${commissions.length} adet French Team primi (${chfFmt(totalCommChf)}) islenmistir. Tugba Karakas adina ${tugbaSalaries.length} aylik maas (${tlFmt(totalTugbaTry)}) Fatih hakedisinden dusulmustur. Sirket Fatih'e ${tlFmt(transferTotal)} tutarinda fiili transfer yapmis, Fatih ise ${tlFmt(advanceTotal)} tutarinda sirket ici harcamayi kendi cebinden gerceklestirmistir.`
para(summaryText, 5.5)
yPos += 4

// KPI kartları (2x3)
ensureRoom(50)
const kpis = [
  { label: 'Toplam Gelir',         value: tlFmt(totalIncome),                  accent: [16, 185, 129] },
  { label: 'Toplam Gider',         value: tlFmt(totalExpense),                 accent: [239, 68, 68] },
  { label: 'Net Kar/Zarar',        value: `${netProfit >= 0 ? '+' : '-'}${tlFmt(Math.abs(netProfit))}`, accent: netProfit >= 0 ? [16, 185, 129] : [239, 68, 68] },
  { label: 'Fatih Maaş Tahakkuk',  value: chfFmt(totalSalaryChf),              accent: [99, 102, 241] },
  { label: 'Fatih Prim (CHF)',     value: chfFmt(totalCommChf),                accent: [14, 165, 233] },
  { label: 'Tugba Maasi (TL)',     value: tlFmt(totalTugbaTry),                accent: [244, 63, 94] },
]
const cardW = (pageWidth - 2 * M - 12) / 3
const cardH = 20
kpis.forEach((c, i) => {
  const col = i % 3
  const row = Math.floor(i / 3)
  const x = M + col * (cardW + 6)
  const y = yPos + row * (cardH + 4)
  pdf.setFillColor(248, 250, 252)
  pdf.rect(x, y, cardW, cardH, 'F')
  pdf.setFillColor(...c.accent)
  pdf.rect(x, y, 2.5, cardH, 'F')
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(110)
  pdf.text(tr(c.label).toUpperCase(), x + 6, y + 7)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(25)
  pdf.text(tr(c.value), x + 6, y + 15)
})
yPos += 2 * (cardH + 4) + 6

// ── 4 AYLIK KARSILASTIRMA TABLOSU ───────────────────────────────────
sectionTitle('Aylik Karsilastirma')

const monthSummaries = MONTHS.map(m => {
  const monthTxs = transactions.filter(t => monthOf(t.date) === m && isInPeriod(t))
  const inc = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + num(t.amount), 0)
  const expOp = monthTxs.filter(t => t.type === 'expense' && !isFatihTransferTx(t)).reduce((s, t) => s + num(t.amount), 0)
  const rate = rateForDate(`${YEAR}-${String(m + 1).padStart(2, '0')}-28`)
  return {
    month: m,
    txCount: monthTxs.length,
    income: inc,
    expense: expOp,
    net: inc - expOp,
    expenseChf: expOp / rate,
    rate,
  }
})

renderTable({
  headers: ['Ay', 'Islem', 'Gelir TL', 'Gider TL', 'Net TL', 'Gider CHF', '% Donem'],
  widths: [30, 18, 30, 30, 30, 28, 24],
  rightAlignFrom: 1,
  rows: monthSummaries.map(m => [
    `${MONTH_LABELS[m.month]}`,
    String(m.txCount),
    m.income > 0 ? tlFmt(m.income) : '-',
    tlFmt(m.expense),
    `${m.net >= 0 ? '+' : '-'}${tlFmt(Math.abs(m.net))}`,
    chfFmt(m.expenseChf),
    totalExpense > 0 ? `%${(m.expense / totalExpense * 100).toFixed(1)}` : '-',
  ]),
})

// Toplam satırı
yPos += 1
pdf.setFillColor(99, 102, 241)
pdf.rect(M, yPos - 4, pageWidth - 2 * M, 7, 'F')
pdf.setFontSize(9)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(255)
const totalsW = [30, 18, 30, 30, 30, 28, 24]
let tx = M
const totalsCells = ['TOPLAM', String(operationalTxs.length + incomeTxs.length), tlFmt(totalIncome), tlFmt(totalExpense), `${netProfit >= 0 ? '+' : '-'}${tlFmt(Math.abs(netProfit))}`, chfFmt(operationalTxs.reduce((s, t) => s + num(t.amount) / rateForDate(t.date), 0)), '%100']
totalsCells.forEach((c, i) => {
  if (i === 0) {
    pdf.text(tr(c), tx + 1, yPos)
  } else {
    pdf.text(tr(c), tx + totalsW[i] - 1, yPos, { align: 'right' })
  }
  tx += totalsW[i]
})
yPos += 10

// ── PER-MONTH DETAYI ────────────────────────────────────────────────
for (const ms of monthSummaries) {
  const m = ms.month
  const monthName = MONTH_LABELS[m]

  pdf.addPage()
  yPos = 20

  // Ay başlığı (büyük koyu band)
  pdf.setFillColor(30, 41, 59)
  pdf.rect(M, yPos, pageWidth - 2 * M, 18, 'F')
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255)
  pdf.text(`${monthName} ${YEAR}`, M + 5, yPos + 12)
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(200)
  pdf.text(`${ms.txCount} islem  -  Kur: 1 CHF = ${ms.rate.toFixed(2)} TL`, M + 55, yPos + 12)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text(tlFmt(ms.expense), pageWidth - M - 5, yPos + 9, { align: 'right' })
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(200)
  pdf.text(chfFmt(ms.expenseChf), pageWidth - M - 5, yPos + 14, { align: 'right' })
  yPos += 24

  // Ayın işlemlerini ayır
  const monthTxs = transactions.filter(t => monthOf(t.date) === m && isInPeriod(t))
  const monthIncome = monthTxs.filter(t => t.type === 'income')
  const monthExpense = monthTxs.filter(t => t.type === 'expense' && !isFatihTransferTx(t))
  const monthTransfers = monthTxs.filter(isFatihTransferTx)

  // GELIR KATEGORILERI
  if (monthIncome.length > 0) {
    subTitle('Gelir Kategorileri', [16, 100, 80])
    const incByCat = {}
    monthIncome.forEach(t => {
      const k = t.category || '(Kategorisiz)'
      if (!incByCat[k]) incByCat[k] = { total: 0, count: 0 }
      incByCat[k].total += num(t.amount)
      incByCat[k].count += 1
    })
    const incRows = Object.entries(incByCat).sort((a, b) => b[1].total - a[1].total)
      .map(([cat, v]) => [cat, String(v.count), tlFmt(v.total), chfFmt(v.total / ms.rate)])
    renderTable({
      headers: ['Kategori', 'Islem', 'TL', 'CHF'],
      widths: [80, 20, 40, 38],
      rightAlignFrom: 1,
      rows: incRows,
      headerColor: [16, 185, 129],
    })
    yPos += 4
  }

  // GIDER KATEGORILERI
  subTitle('Gider Kategorileri', [120, 30, 30])
  const expByCat = {}
  monthExpense.forEach(t => {
    const k = t.category || '(Kategorisiz)'
    if (!expByCat[k]) expByCat[k] = { total: 0, count: 0 }
    expByCat[k].total += num(t.amount)
    expByCat[k].count += 1
  })
  const expRows = Object.entries(expByCat).sort((a, b) => b[1].total - a[1].total)
    .map(([cat, v]) => [
      cat,
      String(v.count),
      tlFmt(v.total),
      chfFmt(v.total / ms.rate),
      `%${(v.total / ms.expense * 100).toFixed(1)}`,
    ])
  renderTable({
    headers: ['Kategori', 'Islem', 'TL', 'CHF', '% Ay'],
    widths: [62, 15, 38, 38, 22],
    rightAlignFrom: 1,
    rows: expRows,
    headerColor: [239, 68, 68],
  })
  yPos += 4

  // FATIH HESAP HAREKETI (bu ay)
  const ayMaas = salaries.find(s => s.month === m)
  const ayPrim = commissions.find(c => c.month === m)
  const ayTugba = tugbaSalaries.find(t => t.month === m)
  const ayAdvances = advanceTxs.filter(t => monthOf(t.date) === m && isInPeriod(t))
  const ayTransfers = monthTransfers
  const ayAdvanceTotal = ayAdvances.reduce((s, t) => s + num(t.amount), 0)
  const ayTransferTotal = ayTransfers.reduce((s, t) => s + num(t.amount), 0)

  if (ayMaas || ayPrim || ayTugba || ayAdvances.length || ayTransfers.length) {
    subTitle('Fatih Karakas Cari Hareketi', [60, 80, 180])
    const rows = []
    if (ayMaas)  rows.push(['Maas Tahakkuk', '+', tlFmt(num(ayMaas.amount_try)), chfFmt(num(ayMaas.amount_chf))])
    if (ayPrim)  rows.push(['French Team Primi', '+', tlFmt(num(ayPrim.total_chf) * ms.rate), chfFmt(num(ayPrim.total_chf))])
    if (ayAdvances.length) rows.push([`Sirket Ici Harcamalar (${ayAdvances.length} adet)`, '+', tlFmt(ayAdvanceTotal), chfFmt(ayAdvanceTotal / ms.rate)])
    if (ayTransfers.length) rows.push([`Sirket -> Fatih Transferi (${ayTransfers.length} adet)`, '-', tlFmt(ayTransferTotal), chfFmt(ayTransferTotal / ms.rate)])
    if (ayTugba) rows.push(['Tugba Karakas Maasi', '-', tlFmt(num(ayTugba.amount_try)), chfFmt(num(ayTugba.amount_chf))])

    const aySalaryTry = ayMaas ? num(ayMaas.amount_try) : 0
    const ayPrimTry   = ayPrim ? num(ayPrim.total_chf) * ms.rate : 0
    const ayTugbaTry  = ayTugba ? num(ayTugba.amount_try) : 0
    const ayNet = aySalaryTry + ayPrimTry + ayAdvanceTotal - ayTransferTotal - ayTugbaTry
    rows.push(['NET HAKEDIS DEGISIMI', ayNet >= 0 ? '+' : '-', tlFmt(Math.abs(ayNet)), chfFmt(Math.abs(ayNet) / ms.rate)])

    renderTable({
      headers: ['Kalem', '+/-', 'TL', 'CHF'],
      widths: [85, 13, 42, 40],
      rightAlignFrom: 1,
      rows,
      headerColor: [99, 102, 241],
    })
    yPos += 4
  }

  // TUM ISLEMLER LISTESI
  subTitle(`${monthName} - Tum Islemler (${monthTxs.length} adet)`, 60)
  const allRows = monthTxs.map(t => [
    String(t.date).slice(8, 10),
    t.type === 'income' ? 'GLR' : 'GDR',
    (t.category || '-').slice(0, 22),
    (t.description || '-').slice(0, 32),
    (t.payment_type || '-').slice(0, 18),
    tlFmt(num(t.amount)),
  ])
  renderTable({
    headers: ['Gun', 'Tip', 'Kategori', 'Aciklama', 'Odeme', 'Tutar'],
    widths: [10, 12, 36, 50, 38, 28],
    rightAlignFrom: 5,
    rows: allRows,
    fontSize: 8,
  })
}

// ── KATEGORI ANALIZI (4 AY TOPLAM) ──────────────────────────────────
pdf.addPage()
yPos = 20
sectionTitle('4 Aylik Kategori Analizi')
para('Subat-Mayis donemi boyunca tum gider islemlerinin kategori bazli toplam dagilimi (Fatih cari transferleri haric).')
yPos += 2

const allExpByCat = {}
operationalTxs.forEach(t => {
  const k = t.category || '(Kategorisiz)'
  if (!allExpByCat[k]) allExpByCat[k] = { total: 0, count: 0, chf: 0 }
  allExpByCat[k].total += num(t.amount)
  allExpByCat[k].count += 1
  allExpByCat[k].chf += num(t.amount) / rateForDate(t.date)
})
const sortedCats = Object.entries(allExpByCat).sort((a, b) => b[1].total - a[1].total)

renderTable({
  headers: ['#', 'Kategori', 'Islem', 'TL Toplam', 'CHF Toplam', '%'],
  widths: [8, 60, 16, 38, 38, 20],
  rightAlignFrom: 2,
  rows: sortedCats.slice(0, 20).map(([cat, v], i) => [
    String(i + 1),
    cat,
    String(v.count),
    tlFmt(v.total),
    chfFmt(v.chf),
    `%${(v.total / totalExpense * 100).toFixed(1)}`,
  ]),
})
yPos += 6

// ── ODEME TIPI ANALIZI ──────────────────────────────────────────────
sectionTitle('Odeme Tipi Analizi')
para('Hangi odeme tipinden ne kadar gider olustu. "Kim cebinden odedi" gorulebilir.')
yPos += 2

const allExpByPay = {}
operationalTxs.forEach(t => {
  const k = t.payment_type || '(Belirtilmemis)'
  if (!allExpByPay[k]) allExpByPay[k] = { total: 0, count: 0 }
  allExpByPay[k].total += num(t.amount)
  allExpByPay[k].count += 1
})
const sortedPays = Object.entries(allExpByPay).sort((a, b) => b[1].total - a[1].total)
renderTable({
  headers: ['Odeme Tipi', 'Islem', 'TL Toplam', 'CHF Toplam', '%'],
  widths: [62, 18, 40, 40, 20],
  rightAlignFrom: 1,
  rows: sortedPays.map(([pay, v]) => [
    pay,
    String(v.count),
    tlFmt(v.total),
    chfFmt(v.total / FALLBACK_RATE),
    `%${(v.total / totalExpense * 100).toFixed(1)}`,
  ]),
})
yPos += 6

// ── FATIH CARI HESAP OZETI (4 AY) ──────────────────────────────────
sectionTitle('Fatih Karakas Cari Hesap Ozeti (4 Ay)')

const fatihRows = [
  ['Maas Tahakkukları (4 ay)',    `+${tlFmt(totalSalaryTry)}`,                  `+${chfFmt(totalSalaryChf)}`],
  ['French Team Primleri (4 ay)', `+${tlFmt(totalCommChf * FALLBACK_RATE)}`,    `+${chfFmt(totalCommChf)}`],
  ['Sirket Ici Harcamalar',       `+${tlFmt(advanceTotal)}`,                    `+${chfFmt(advanceTotal / FALLBACK_RATE)}`],
  ['Sirket -> Fatih Transferleri', `-${tlFmt(transferTotal)}`,                  `-${chfFmt(transferTotal / FALLBACK_RATE)}`],
  ['Tugba Karakas Maasi',          `-${tlFmt(totalTugbaTry)}`,                  `-${chfFmt(totalTugbaChf)}`],
]
const totalChange =
  totalSalaryTry + (totalCommChf * FALLBACK_RATE) + advanceTotal - transferTotal - totalTugbaTry
fatihRows.push(['DONEM NET HAKEDIS DEGISIMI', `${totalChange >= 0 ? '+' : '-'}${tlFmt(Math.abs(totalChange))}`, `${totalChange >= 0 ? '+' : '-'}${chfFmt(Math.abs(totalChange) / FALLBACK_RATE)}`])

renderTable({
  headers: ['Kalem', 'TL', 'CHF'],
  widths: [85, 48, 45],
  rightAlignFrom: 1,
  rows: fatihRows,
  headerColor: [99, 102, 241],
})
yPos += 6

// ── LOGIC HOLDING MALIYET OZETI ────────────────────────────────────
sectionTitle('Logic Holding\'e Faturalanmasi Gereken Maliyet')
para(`4 aylik toplam operasyonel gider ${tlFmt(totalExpense)} = ${chfFmt(operationalTxs.reduce((s, t) => s + num(t.amount) / rateForDate(t.date), 0))} olarak hesaplanmistir. Bu tutar, Cxentrix'in Logic Holding'e gondereceği aylik maliyet raporlarının toplamidir; Fatih Karakas cari transferleri haric tutulmustur.`)
yPos += 2

renderTable({
  headers: ['Ay', 'Gider TL', 'Gider CHF', 'Islem', '% Toplam'],
  widths: [32, 45, 45, 22, 22],
  rightAlignFrom: 1,
  rows: monthSummaries.map(m => [
    `${MONTH_LABELS[m.month]} ${YEAR}`,
    tlFmt(m.expense),
    chfFmt(m.expenseChf),
    String(m.txCount),
    `%${(m.expense / totalExpense * 100).toFixed(1)}`,
  ]),
})

// ── FOOTER (sayfa numarası) ─────────────────────────────────────────
const totalPages = pdf.internal.getNumberOfPages()
for (let p = 1; p <= totalPages; p++) {
  pdf.setPage(p)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(140)
  pdf.text('Cxentrix Solutions  -  Detayli Finansal Rapor  -  Subat-Mayis 2026', M, pageHeight - 8)
  pdf.text(`Sayfa ${p} / ${totalPages}`, pageWidth - M, pageHeight - 8, { align: 'right' })
}

// ── KAYDET ──────────────────────────────────────────────────────────
const buffer = pdf.output('arraybuffer')
const downloadsDir = process.env.USERPROFILE
  ? join(process.env.USERPROFILE, 'Downloads')
  : process.env.HOME
    ? join(process.env.HOME, 'Downloads')
    : '.'

// Dosya viewer'da açıksa overwrite'a izin vermez; her seferinde
// benzersiz isimle yazıp eski sürümün kilitlemesine takılmayalım.
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
const outPath = join(downloadsDir, `Cxentrix-Detayli-Rapor-Sub-May-2026-${stamp}.pdf`)
try {
  writeFileSync(outPath, Buffer.from(buffer))
  console.log(`\nPDF kaydedildi: ${outPath}`)
  console.log(`Toplam sayfa: ${totalPages}`)
} catch (err) {
  console.error(`PDF yazılamadı (${outPath}):`, err.message)
  console.error('Eski PDF açıksa kapat ve tekrar dene.')
  process.exit(1)
}
