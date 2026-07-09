#!/usr/bin/env node
/**
 * Haziran 2026 — yöneticiye sunulacak detaylı gider raporu.
 *
 * Kapsam:
 *   - Kapak (Cxentrix logosu + başlık + tarih)
 *   - Yönetici özeti + 4 KPI kart
 *   - Kategori dağılımı tablosu (tüm kategoriler, % pay)
 *   - Her kategori için ayrı detay tablosu — her işlem (tarih,
 *     açıklama, ödeme tipi, tutar)
 *   - Footer + sayfa numarası
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { jsPDF } from 'jspdf'

pg.types.setTypeParser(1082, (v) => v)

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
const PERIOD_START = '2026-06-01'
const PERIOD_END   = '2026-06-30'
const YEAR = 2026
const MONTH = 5  // 0-indexed: Haziran
const RATE = 56  // 1 CHF = 56 TL

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()
console.log('DB bağlandı, Haziran 2026 verisi çekiliyor...')

const { rows: allRows } = await client.query(
  `select date, type, category, description, payment_type, customer, amount, checked,
          installment_no, installment_total
     from public.transactions
    where date >= $1 and date <= $2
      and type = 'expense'
    order by date, created_at`,
  [PERIOD_START, PERIOD_END]
)
await client.end()

// Fatih cari transferleri operasyonel gider değildir; yöneticiye gidecek
// raporda HARİÇ tutulmalı. Kural: category "fatih" içeriyor + description'da
// maaş/aylık/primi yok → cari transfer.
const isFatihTransfer = (t) => {
  const cat  = String(t.category || '').toLowerCase()
  const desc = String(t.description || '').toLowerCase()
  if (!cat.includes('fatih')) return false
  if (desc.includes('maaş') || desc.includes('aylık') || desc.includes('primi')) return false
  return true
}

const excluded = allRows.filter(isFatihTransfer)
const transactions = allRows.filter(t => !isFatihTransfer(t))
const excludedTotal = excluded.reduce((s, t) => s + Number(t.amount || 0), 0)

console.log(`  ${allRows.length} expense satiri (${transactions.length} operasyonel + ${excluded.length} Fatih cari)`)
if (excluded.length > 0) {
  console.log(`  Haric tutulan: ${excluded.length} Fatih cari transferi = ${excludedTotal.toLocaleString('tr-TR')} TL`)
}

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
const tl = (n) => Math.round(num(n)).toLocaleString('en-US').replace(/,/g, '.') + ' TL'
const chf = (n) => {
  const [whole, dec] = num(n).toFixed(2).split('.')
  return 'CHF ' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec
}

// ── Logo ──
let logoBase64 = null
try {
  const buf = readFileSync('public/logo-full.png')
  logoBase64 = 'data:image/png;base64,' + buf.toString('base64')
} catch {
  console.warn('Logo bulunamadi.')
}

// ── Toplama ──
const grandTotal = transactions.reduce((s, t) => s + num(t.amount), 0)
const grandTotalChf = grandTotal / RATE

// Kategori bazlı topla
const byCategory = {}
transactions.forEach(t => {
  const cat = t.category || '(Kategorisiz)'
  if (!byCategory[cat]) byCategory[cat] = { total: 0, count: 0, txs: [] }
  byCategory[cat].total += num(t.amount)
  byCategory[cat].count += 1
  byCategory[cat].txs.push(t)
})
const categories = Object.entries(byCategory)
  .map(([name, v]) => ({ name, ...v }))
  .sort((a, b) => b.total - a.total)

console.log(`  ${categories.length} kategori, toplam ${tl(grandTotal)}`)

// ── PDF ──
const pdf = new jsPDF('p', 'mm', 'a4')
const W = 210, H = 297, M = 18
let y = 22

const ensureRoom = (need = 12) => {
  if (y + need > H - 18) { pdf.addPage(); y = 22 }
}
const truncate = (txt, maxChars) => {
  const s = String(txt)
  return s.length > maxChars ? s.slice(0, maxChars - 2) + '..' : s
}

// ── KAPAK ──
const today = new Date()

if (logoBase64) {
  const logoW = 50, logoH = 30
  pdf.addImage(logoBase64, 'PNG', (W - logoW) / 2, 14, logoW, logoH)
  y = 14 + logoH + 6
} else {
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(30)
  pdf.text('CXENTRIX SOLUTIONS', W / 2, 22, { align: 'center' })
  y = 32
}

pdf.setFillColor(99, 102, 241)
pdf.rect(M, y, W - 2 * M, 0.6, 'F')
y += 10

pdf.setFontSize(22)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(25)
pdf.text(tr('Haziran 2026 Gider Raporu'), W / 2, y, { align: 'center' })
y += 8

pdf.setFontSize(12)
pdf.setFont('helvetica', 'normal')
pdf.setTextColor(110)
pdf.text(tr('Aylik Detayli Operasyonel Maliyet Analizi'), W / 2, y, { align: 'center' })
y += 5

pdf.setFontSize(9)
pdf.setTextColor(150)
pdf.text(tr('Fatih Karakas cari transferleri dahil degildir'), W / 2, y, { align: 'center' })
y += 6

pdf.setFontSize(9)
pdf.setTextColor(140)
pdf.text(
  `Hazirlanma: ${today.toLocaleDateString('tr-TR')}    -    Rapor No: GR-2026-06    -    1 CHF = ${RATE} TL`,
  W / 2, y, { align: 'center' }
)
y += 14

// ── Yönetici özeti ana tutar kutusu ──
pdf.setFillColor(99, 102, 241)
pdf.rect(M, y, W - 2 * M, 38, 'F')

pdf.setFontSize(10)
pdf.setFont('helvetica', 'normal')
pdf.setTextColor(220, 225, 245)
pdf.text(tr('HAZIRAN 2026 TOPLAM GIDER').toUpperCase(), M + 5, y + 9)

pdf.setFontSize(26)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(255)
pdf.text(tl(grandTotal), M + 5, y + 22)

pdf.setFontSize(14)
pdf.setFont('helvetica', 'normal')
pdf.setTextColor(220, 225, 245)
pdf.text(chf(grandTotalChf), M + 5, y + 32)

y += 46

// ── KPI strip ──
const kpis = [
  { label: 'Toplam İşlem',  value: String(transactions.length),     accent: [99, 102, 241] },
  { label: 'Kategori',      value: String(categories.length),       accent: [16, 185, 129] },
  { label: 'En Yuksek',     value: tl(categories[0]?.total ?? 0),   accent: [239, 68, 68] },
  { label: 'Ortalama Gun',  value: tl(grandTotal / 30),             accent: [245, 158, 11] },
]
const cardW = (W - 2 * M - 12) / 4
kpis.forEach((c, i) => {
  const x = M + i * (cardW + 4)
  pdf.setFillColor(248, 250, 252)
  pdf.rect(x, y, cardW, 18, 'F')
  pdf.setFillColor(...c.accent)
  pdf.rect(x, y, 2.5, 18, 'F')
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(110)
  pdf.text(tr(c.label).toUpperCase(), x + 6, y + 6)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(25)
  pdf.text(tr(c.value), x + 6, y + 14)
})
y += 25

// ── Kategori dağılımı tablosu ──
pdf.setFillColor(99, 102, 241)
pdf.rect(M, y - 4, 3, 7, 'F')
pdf.setFontSize(13)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(25)
pdf.text(tr('Kategori Dagilimi'), M + 6, y + 1)
y += 8

// Sağ-hizalı kolonlar; aralarda yeterli gap olmalı yoksa rakamlar
// üst üste biner. Sayfa: 210mm, M=18, kullanılabilir alan 174mm.
const C_NAME = M + 3        // 21  — sol
const C_CNT  = M + 95       // 113 — sağ (max "82" = 5mm)
const C_TL   = M + 125      // 143 — sağ (max "2.000.063 TL" ≈ 20mm)
const C_CHF  = M + 158      // 176 — sağ (max "CHF 35.715,41" ≈ 22mm)
const C_PCT  = W - M - 3    // 189 — sağ (max "%100" ≈ 8mm)

// Header band — daha gevsek
pdf.setFillColor(99, 102, 241)
pdf.rect(M, y - 4, W - 2 * M, 10, 'F')
pdf.setFontSize(10)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(255)
pdf.text(tr('Kategori'), C_NAME, y + 2)
pdf.text(tr('Islem'), C_CNT, y + 2, { align: 'right' })
pdf.text(tr('TL'),    C_TL,  y + 2, { align: 'right' })
pdf.text(tr('CHF'),   C_CHF, y + 2, { align: 'right' })
pdf.text(tr('%'),     C_PCT, y + 2, { align: 'right' })
y += 12

pdf.setFont('helvetica', 'normal')
pdf.setTextColor(35)
categories.forEach((c, i) => {
  ensureRoom(9)
  if (i % 2 === 0) {
    pdf.setFillColor(247, 248, 252)
    pdf.rect(M, y - 5, W - 2 * M, 9, 'F')
  }
  pdf.setFontSize(9.5)
  pdf.text(truncate(tr(c.name), 48), C_NAME, y + 1)
  pdf.text(String(c.count),         C_CNT, y + 1, { align: 'right' })
  pdf.text(tl(c.total),             C_TL,  y + 1, { align: 'right' })
  pdf.text(chf(c.total / RATE),     C_CHF, y + 1, { align: 'right' })
  pdf.text(`%${(c.total / grandTotal * 100).toFixed(1)}`, C_PCT, y + 1, { align: 'right' })
  y += 9
})

// Toplam satırı
y += 3
pdf.setFillColor(20, 23, 38)
pdf.rect(M, y - 5, W - 2 * M, 11, 'F')
pdf.setFontSize(11)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(255)
pdf.text(tr('TOPLAM'),                        C_NAME, y + 2)
pdf.text(String(transactions.length),         C_CNT,  y + 2, { align: 'right' })
pdf.text(tl(grandTotal),                      C_TL,   y + 2, { align: 'right' })
pdf.text(chf(grandTotalChf),                  C_CHF,  y + 2, { align: 'right' })
pdf.text('%100',                              C_PCT,  y + 2, { align: 'right' })

// ── Kategori detayları — alt alta, sadece gerektiğinde sayfa atla ──

// Yeni bölüm başlığı sayfası
pdf.addPage()
y = 22

pdf.setFillColor(99, 102, 241)
pdf.rect(M, y - 4, 3, 8, 'F')
pdf.setFontSize(14)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(25)
pdf.text(tr('Kategori Bazli Detayli Islem Listesi'), M + 7, y + 2)
y += 12

// İşlem tablosu kolonları — kategori bloklarında aynı kullanılır
const T_DATE = M + 3
const T_DESC = M + 24
const T_PAY  = M + 108
const T_AMT  = W - M - 3

categories.forEach((cat, idx) => {
  // Kategori başlığı + en az birkaç satır için yer ayır
  ensureRoom(60)

  // Kategori başlığı bandı — daha gevsek dikey hizalama
  pdf.setFillColor(30, 41, 59)
  pdf.rect(M, y, W - 2 * M, 22, 'F')
  pdf.setFontSize(13)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255)
  pdf.text(tr(cat.name), M + 5, y + 10)
  pdf.setFontSize(8.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(200)
  pdf.text(`${cat.count} islem  ·  %${(cat.total / grandTotal * 100).toFixed(1)} pay`, M + 5, y + 17)

  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255)
  pdf.text(tl(cat.total), W - M - 5, y + 10, { align: 'right' })
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(200)
  pdf.text(chf(cat.total / RATE), W - M - 5, y + 17, { align: 'right' })

  y += 28

  // İşlem tablosu başlığı
  pdf.setFillColor(99, 102, 241)
  pdf.rect(M, y - 5, W - 2 * M, 9, 'F')
  pdf.setFontSize(9.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255)
  pdf.text(tr('Tarih'),    T_DATE, y + 1)
  pdf.text(tr('Aciklama'), T_DESC, y + 1)
  pdf.text(tr('Odeme'),    T_PAY,  y + 1)
  pdf.text(tr('Tutar TL'), T_AMT,  y + 1, { align: 'right' })
  y += 10

  // Tarihe göre sırala
  const sorted = [...cat.txs].sort((a, b) => a.date.localeCompare(b.date))

  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(35)
  sorted.forEach((t, i) => {
    ensureRoom(8)
    if (i % 2 === 0) {
      pdf.setFillColor(247, 248, 252)
      pdf.rect(M, y - 5, W - 2 * M, 8, 'F')
    }
    pdf.setFontSize(9)
    pdf.text(t.date.slice(8, 10) + '.' + t.date.slice(5, 7), T_DATE, y + 1)
    let desc = t.description || '-'
    if (t.installment_no && t.installment_total) {
      desc = `${desc} (${t.installment_no}/${t.installment_total})`
    }
    pdf.text(truncate(tr(desc), 46), T_DESC, y + 1)
    pdf.text(truncate(tr(t.payment_type || '-'), 22), T_PAY, y + 1)
    pdf.text(tl(num(t.amount)), T_AMT, y + 1, { align: 'right' })
    y += 8
  })

  // Kategori altı toplam — overlap olmasin diye name + count birlikte
  ensureRoom(11)
  pdf.setFillColor(20, 23, 38)
  pdf.rect(M, y - 5, W - 2 * M, 11, 'F')
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255)
  pdf.text(tr(`${truncate(cat.name, 32)}  -  ${cat.count} islem`), T_DATE, y + 2)
  pdf.text(tl(cat.total), T_AMT, y + 2, { align: 'right' })

  // Kategoriler arası boşluk
  y += 16
})

// ── FOOTER ──
const totalPages = pdf.internal.getNumberOfPages()
for (let p = 1; p <= totalPages; p++) {
  pdf.setPage(p)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(140)
  pdf.text(tr('Cxentrix Solutions - Haziran 2026 Gider Raporu'), M, H - 10)
  pdf.text(`Sayfa ${p} / ${totalPages}`, W - M, H - 10, { align: 'right' })
}

// ── KAYDET ──
const buffer = pdf.output('arraybuffer')
const downloadsDir = process.env.USERPROFILE ? join(process.env.USERPROFILE, 'Downloads') : '.'
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)
const outPath = join(downloadsDir, `Cxentrix-Haziran-2026-Gider-Raporu-${stamp}.pdf`)
writeFileSync(outPath, Buffer.from(buffer))

console.log(`\n✓ PDF kaydedildi: ${outPath}`)
console.log(`  ${totalPages} sayfa · ${transactions.length} islem · ${tl(grandTotal)}`)
