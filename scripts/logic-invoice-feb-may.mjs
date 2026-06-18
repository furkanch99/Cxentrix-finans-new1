#!/usr/bin/env node
/**
 * Logic Holding'e gönderilecek 4 aylık maliyet raporu.
 * Şubat - Mart - Nisan - Mayıs 2026.
 *
 * Çıktı: Logic'in Cxentrix'e ödeyeceği toplam tutarı net şekilde
 * gösterir. Fatih Karakaş cari transferleri hariç tutulur.
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { jsPDF } from 'jspdf'

// pg DATE kolonlarını string olarak al — timezone karışıklığı olmasın
pg.types.setTypeParser(1082, (v) => v)

// ── ENV ──
function loadEnv(p) {
  if (!existsSync(p)) return
  for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = l.trim().match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) {
      process.env[m[1].trim()] = m[2].trim()
    }
  }
}
loadEnv('.env.local')
loadEnv('.env')

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('SUPABASE_DB_URL .env.local içinde olmalı')
  process.exit(1)
}

// ── DB ──
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()
console.log('DB bağlandı, veri çekiliyor...')

const PERIOD_START = '2026-02-01'
const PERIOD_END   = '2026-05-31'
const RATE = 56  // 1 CHF = 56 TL (sabit kur)

const { rows: transactions } = await client.query(
  `select date, type, category, description, amount
     from public.transactions
    where date >= $1 and date <= $2
    order by date`,
  [PERIOD_START, PERIOD_END]
)
await client.end()

console.log(`  ${transactions.length} işlem fetch edildi`)

// ── Helpers ──
const tr = (s) => String(s ?? '')
  .replace(/ş/g, 's').replace(/Ş/g, 'S')
  .replace(/ı/g, 'i').replace(/İ/g, 'I')
  .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
  .replace(/ç/g, 'c').replace(/Ç/g, 'C')
  .replace(/ö/g, 'o').replace(/Ö/g, 'O')
  .replace(/ü/g, 'u').replace(/Ü/g, 'U')
  .replace(/₺/g, 'TL').replace(/€/g, 'EUR').replace(/£/g, 'GBP')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-').replace(/…/g, '...')
  .replace(/[^\x00-\x7F]/g, '?')

const num = (n) => Number(n) || 0
const tl  = (n) => Math.round(num(n)).toLocaleString('en-US').replace(/,/g, '.') + ' TL'
const chf = (n) => {
  // Türkçe biçim: binlik . / ondalık ,
  const [whole, dec] = num(n).toFixed(2).split('.')
  return 'CHF ' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec
}

const MONTH_LABELS = ['Ocak','Subat','Mart','Nisan','Mayis','Haziran']
const MONTHS = [1, 2, 3, 4]  // Şub, Mar, Nis, May

// "Fatih Karakaş" kategoriliyse + açıklamada maaş/aylık/primi yoksa = cari transfer (HARIÇ)
const isFatihTransfer = (t) => {
  const cat = String(t.category || '').toLowerCase()
  const desc = String(t.description || '').toLowerCase()
  if (!cat.includes('fatih')) return false
  if (desc.includes('maaş') || desc.includes('aylık') || desc.includes('primi')) return false
  return true
}

// Aya göre grupla — operasyonel giderler (Logic'e faturalanacak)
const monthData = MONTHS.map(m => {
  const monthTxs = transactions.filter(t => {
    const monthOfTx = parseInt(t.date.slice(5, 7), 10) - 1
    return monthOfTx === m && t.type === 'expense' && !isFatihTransfer(t)
  })
  const total = monthTxs.reduce((s, t) => s + num(t.amount), 0)
  const byCategory = {}
  monthTxs.forEach(t => {
    const k = t.category || '(Kategorisiz)'
    if (!byCategory[k]) byCategory[k] = { total: 0, count: 0 }
    byCategory[k].total += num(t.amount)
    byCategory[k].count += 1
  })
  const categories = Object.entries(byCategory)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total)
  return { month: m, total, categories, txCount: monthTxs.length }
})

const grandTotal = monthData.reduce((s, m) => s + m.total, 0)
const grandTotalChf = grandTotal / RATE

console.log(`  4 aylik toplam: ${tl(grandTotal)} (${chf(grandTotalChf)})`)

// ── LOGO ──
// public/logo-full.png → base64 olarak göm
let logoBase64 = null
try {
  const logoBuf = readFileSync('public/logo-full.png')
  logoBase64 = 'data:image/png;base64,' + logoBuf.toString('base64')
} catch (err) {
  console.warn('Logo bulunamadi (public/logo-full.png); logosuz devam edilecek.')
}

// ── PDF ──
const pdf = new jsPDF('p', 'mm', 'a4')
const W = 210
const H = 297
const M = 18
let y = 22

const ensureRoom = (need = 12) => {
  if (y + need > H - 18) {
    pdf.addPage()
    y = 22
  }
}

const truncate = (txt, maxChars) => {
  const s = String(txt)
  return s.length > maxChars ? s.slice(0, maxChars - 2) + '..' : s
}

// ── KAPAK — Beyaz arka plan + ortalanmış logo + başlık ──
const today = new Date()

// Logo (varsa) — üstte ortalanmış, ~50mm geniş, ~30mm yüksek
if (logoBase64) {
  const logoW = 50
  const logoH = 30
  pdf.addImage(logoBase64, 'PNG', (W - logoW) / 2, 14, logoW, logoH)
  y = 14 + logoH + 6
} else {
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(30)
  pdf.text('CXENTRIX SOLUTIONS', W / 2, 22, { align: 'center' })
  y = 32
}

// İnce mor şerit
pdf.setFillColor(99, 102, 241)
pdf.rect(M, y, W - 2 * M, 0.6, 'F')
y += 10

// Başlık
pdf.setFontSize(22)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(25)
pdf.text(tr('Logic Holding Maliyet Raporu'), W / 2, y, { align: 'center' })
y += 8

// Dönem alt başlık
pdf.setFontSize(12)
pdf.setFont('helvetica', 'normal')
pdf.setTextColor(110)
pdf.text(tr('Donem: Subat 2026 - Mayis 2026'), W / 2, y, { align: 'center' })
y += 6

// Meta bilgiler (rapor no + hazırlanma + kur) — orta hizalı küçük
pdf.setFontSize(9)
pdf.setTextColor(140)
pdf.text(
  `Hazirlanma: ${today.toLocaleDateString('tr-TR')}    -    Rapor No: LHR-2026-${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}    -    1 CHF = 56 TL`,
  W / 2, y, { align: 'center' }
)

y += 10

// ── ANA TUTAR KUTUSU ──
pdf.setFillColor(99, 102, 241)
pdf.rect(M, y, W - 2 * M, 35, 'F')

pdf.setFontSize(10)
pdf.setFont('helvetica', 'normal')
pdf.setTextColor(220, 225, 245)
pdf.text(tr('Logic Holding tarafindan odenecek toplam:').toUpperCase(), M + 5, y + 9)

pdf.setFontSize(24)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(255)
pdf.text(tl(grandTotal), M + 5, y + 21)

pdf.setFontSize(14)
pdf.setFont('helvetica', 'normal')
pdf.setTextColor(220, 225, 245)
pdf.text(chf(grandTotalChf), M + 5, y + 30)

y += 42

// ── AYLIK ÖZET ──
pdf.setFillColor(99, 102, 241)
pdf.rect(M, y - 3, 3, 7, 'F')
pdf.setFontSize(13)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(25)
pdf.text(tr('Aylik Ozet'), M + 6, y + 2)
y += 9

// Aylık karşılaştırma tablosu
const S_ISLEM = M + 75
const S_TL    = M + 115
const S_CHF   = M + 158
const S_PCT   = W - M - 3

const headerColor = [99, 102, 241]
pdf.setFillColor(...headerColor)
pdf.rect(M, y - 4, W - 2 * M, 8, 'F')
pdf.setFontSize(10)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(255)
pdf.text(tr('Ay'),    M + 3,   y + 1)
pdf.text(tr('Islem'), S_ISLEM, y + 1, { align: 'right' })
pdf.text(tr('TL'),    S_TL,    y + 1, { align: 'right' })
pdf.text(tr('CHF'),   S_CHF,   y + 1, { align: 'right' })
pdf.text(tr('%'),     S_PCT,   y + 1, { align: 'right' })
y += 9

pdf.setFont('helvetica', 'normal')
pdf.setTextColor(35)
monthData.forEach((m, i) => {
  ensureRoom(8)
  if (i % 2 === 0) {
    pdf.setFillColor(247, 248, 252)
    pdf.rect(M, y - 4, W - 2 * M, 7, 'F')
  }
  pdf.setFontSize(10)
  pdf.text(tr(`${MONTH_LABELS[m.month]} 2026`), M + 3,   y + 1)
  pdf.text(String(m.txCount),                   S_ISLEM, y + 1, { align: 'right' })
  pdf.text(tl(m.total),                         S_TL,    y + 1, { align: 'right' })
  pdf.text(chf(m.total / RATE),                 S_CHF,   y + 1, { align: 'right' })
  const pct = grandTotal > 0 ? (m.total / grandTotal * 100).toFixed(1) : '0'
  pdf.text(`%${pct}`,                           S_PCT,   y + 1, { align: 'right' })
  y += 7
})

// Toplam satırı
y += 2
pdf.setFillColor(20, 23, 38)
pdf.rect(M, y - 4, W - 2 * M, 9, 'F')
pdf.setFontSize(11)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(255)
pdf.text(tr('4 AYLIK TOPLAM'),                                M + 3,   y + 2)
pdf.text(String(monthData.reduce((s, m) => s + m.txCount, 0)), S_ISLEM, y + 2, { align: 'right' })
pdf.text(tl(grandTotal),                                       S_TL,    y + 2, { align: 'right' })
pdf.text(chf(grandTotalChf),                                   S_CHF,   y + 2, { align: 'right' })
pdf.text('%100',                                               S_PCT,   y + 2, { align: 'right' })
y += 14

// ── HER AY DETAYI ──
for (const m of monthData) {
  pdf.addPage()
  y = 22

  // Ay başlık
  pdf.setFillColor(30, 41, 59)
  pdf.rect(M, y, W - 2 * M, 22, 'F')
  pdf.setFontSize(18)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255)
  pdf.text(tr(`${MONTH_LABELS[m.month]} 2026`), M + 5, y + 13)
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(200)
  pdf.text(`${m.txCount} islem`, M + 5, y + 19)

  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255)
  pdf.text(tl(m.total), W - M - 5, y + 13, { align: 'right' })
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(200)
  pdf.text(chf(m.total / RATE), W - M - 5, y + 19, { align: 'right' })

  y += 28

  // Kategori başlığı
  pdf.setFillColor(99, 102, 241)
  pdf.rect(M, y - 3, 3, 7, 'F')
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(25)
  pdf.text(tr('Kategori Dagilimi'), M + 6, y + 2)
  y += 9

  // Kategori tablosu — sağ kenara dayalı sütun pozisyonları
  // (rakamların üst üste binmemesi için her birinin SAG hizada
  // sabit X koordinatı var). Sayfa eni 210, margin 18 = sağ kenar 192.
  // Her kolon arası ≥ 8mm gap.
  const X_ISLEM = M + 92    // 110 — Islem sayisi (kucuk)
  const X_TL    = M + 125   // 143 — TL tutar (max ~"1.794.965 TL")
  const X_CHF   = M + 158   // 176 — CHF tutar (max ~"CHF 33.240,09")
  const X_PCT   = W - M - 3 // 189 — %

  pdf.setFillColor(99, 102, 241)
  pdf.rect(M, y - 4, W - 2 * M, 8, 'F')
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255)
  pdf.text(tr('Kategori'), M + 3, y + 1)
  pdf.text(tr('Islem'), X_ISLEM, y + 1, { align: 'right' })
  pdf.text(tr('TL'),    X_TL,    y + 1, { align: 'right' })
  pdf.text(tr('CHF'),   X_CHF,   y + 1, { align: 'right' })
  pdf.text(tr('%'),     X_PCT,   y + 1, { align: 'right' })
  y += 9

  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(35)

  m.categories.forEach((c, i) => {
    ensureRoom(7)
    if (i % 2 === 0) {
      pdf.setFillColor(247, 248, 252)
      pdf.rect(M, y - 4, W - 2 * M, 7, 'F')
    }
    pdf.setFontSize(9.5)
    pdf.text(truncate(tr(c.name), 40), M + 3, y + 1)
    pdf.text(String(c.count),         X_ISLEM, y + 1, { align: 'right' })
    pdf.text(tl(c.total),             X_TL,    y + 1, { align: 'right' })
    pdf.text(chf(c.total / RATE),     X_CHF,   y + 1, { align: 'right' })
    const pct = m.total > 0 ? (c.total / m.total * 100).toFixed(1) : '0'
    pdf.text(`%${pct}`,               X_PCT,   y + 1, { align: 'right' })
    y += 7
  })

  // Ay toplam çubuğu
  y += 2
  pdf.setFillColor(20, 23, 38)
  pdf.rect(M, y - 4, W - 2 * M, 8, 'F')
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255)
  pdf.text(tr(`${MONTH_LABELS[m.month]} TOPLAM`), M + 3,   y + 1)
  pdf.text(String(m.txCount),                    X_ISLEM, y + 1, { align: 'right' })
  pdf.text(tl(m.total),                          X_TL,    y + 1, { align: 'right' })
  pdf.text(chf(m.total / RATE),                  X_CHF,   y + 1, { align: 'right' })
  pdf.text('%100',                               X_PCT,   y + 1, { align: 'right' })
}

// ── FOOTER ──
const totalPages = pdf.internal.getNumberOfPages()
for (let p = 1; p <= totalPages; p++) {
  pdf.setPage(p)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(140)
  pdf.text(tr('Cxentrix Solutions - Logic Holding Maliyet Raporu - Subat-Mayis 2026'), M, H - 10)
  pdf.text(`Sayfa ${p} / ${totalPages}`, W - M, H - 10, { align: 'right' })
}

// ── KAYDET ──
const buffer = pdf.output('arraybuffer')
const downloadsDir = process.env.USERPROFILE
  ? join(process.env.USERPROFILE, 'Downloads')
  : '.'

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)
const outPath = join(downloadsDir, `Logic-Maliyet-Raporu-Sub-May-2026-${stamp}.pdf`)
writeFileSync(outPath, Buffer.from(buffer))

console.log(`\n✓ PDF kaydedildi: ${outPath}`)
console.log(`  Toplam: ${tl(grandTotal)} (${chf(grandTotalChf)})`)
console.log(`  ${totalPages} sayfa`)
