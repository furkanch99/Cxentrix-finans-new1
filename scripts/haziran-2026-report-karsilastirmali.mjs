#!/usr/bin/env node
/**
 * Haziran 2026 detayli gider raporu + Mayis 2026 karsilastirmasi.
 *
 * Kapsam:
 *   - Kapak (logo + baslik + tarih)
 *   - Haziran toplam kutusu + 4 KPI kart
 *   - Mayis vs Haziran karsilastirma (toplam + delta %)
 *   - Kategori bazli karsilastirma tablosu (Mayis / Haziran / Fark)
 *   - Haziran kategori dagilimi
 *   - Her kategori icin detayli islem listesi
 *   - Footer + sayfa numarasi
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
  console.error('SUPABASE_DB_URL .env.local icinde olmali')
  process.exit(1)
}

const RATE = 56  // 1 CHF = 56 TL

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()
console.log('DB baglandi, Mayis + Haziran 2026 verisi cekiliyor...')

async function fetchMonth(start, end) {
  const { rows } = await client.query(
    `select date, type, category, description, payment_type, customer, amount, checked,
            installment_no, installment_total
       from public.transactions
      where date >= $1 and date <= $2
        and type = 'expense'
      order by date, created_at`,
    [start, end]
  )
  return rows
}

const mayRows = await fetchMonth('2026-05-01', '2026-05-31')
const junRows = await fetchMonth('2026-06-01', '2026-06-30')
await client.end()

const isFatihTransfer = (t) => {
  const cat  = String(t.category || '').toLowerCase()
  const desc = String(t.description || '').toLowerCase()
  if (!cat.includes('fatih')) return false
  if (desc.includes('maaş') || desc.includes('aylık') || desc.includes('primi')) return false
  return true
}

const mayTx = mayRows.filter(t => !isFatihTransfer(t))
const junTx = junRows.filter(t => !isFatihTransfer(t))

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
const truncate = (txt, maxChars) => {
  const s = String(txt)
  return s.length > maxChars ? s.slice(0, maxChars - 2) + '..' : s
}
const pct = (delta, base) => {
  if (!base) return delta > 0 ? '+∞' : '0'
  return (delta > 0 ? '+' : '') + ((delta / base) * 100).toFixed(1) + '%'
}
const deltaText = (delta) => (delta > 0 ? '+' : '') + tl(Math.abs(delta)).replace(' TL', '') + ' TL'

function groupByCategory(txs) {
  const out = {}
  txs.forEach(t => {
    const cat = t.category || '(Kategorisiz)'
    if (!out[cat]) out[cat] = { total: 0, count: 0, txs: [] }
    out[cat].total += num(t.amount)
    out[cat].count += 1
    out[cat].txs.push(t)
  })
  return out
}

const mayByCat = groupByCategory(mayTx)
const junByCat = groupByCategory(junTx)

const mayTotal = mayTx.reduce((s, t) => s + num(t.amount), 0)
const junTotal = junTx.reduce((s, t) => s + num(t.amount), 0)
const totalDelta = junTotal - mayTotal
const totalDeltaPct = mayTotal ? (totalDelta / mayTotal * 100) : 0

// Haziran kategorileri (siralanmis, detay tablolari icin)
const categories = Object.entries(junByCat)
  .map(([name, v]) => ({ name, ...v }))
  .sort((a, b) => b.total - a.total)

// Karsilastirma tablosu: iki ayda gorulen tum kategoriler
const allCatNames = new Set([...Object.keys(mayByCat), ...Object.keys(junByCat)])
const compareRows = [...allCatNames].map(name => {
  const may = mayByCat[name]?.total || 0
  const jun = junByCat[name]?.total || 0
  return { name, may, jun, delta: jun - may }
}).sort((a, b) => b.jun - a.jun)

console.log(`  Mayis: ${mayTx.length} islem, ${tl(mayTotal)}`)
console.log(`  Haziran: ${junTx.length} islem, ${tl(junTotal)}`)
console.log(`  Fark: ${deltaText(totalDelta)} (${pct(totalDelta, mayTotal)})`)

// ── Logo ──
let logoBase64 = null
try {
  const buf = readFileSync('public/logo-full.png')
  logoBase64 = 'data:image/png;base64,' + buf.toString('base64')
} catch {
  console.warn('Logo bulunamadi.')
}

// ── PDF ──
const pdf = new jsPDF('p', 'mm', 'a4')
const W = 210, H = 297, M = 18
let y = 22

const ensureRoom = (need = 12) => {
  if (y + need > H - 18) { pdf.addPage(); y = 22 }
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
pdf.text(tr('Mayis 2026 Karsilastirmali Operasyonel Maliyet Analizi'), W / 2, y, { align: 'center' })
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

// ── Haziran toplam kutusu ──
pdf.setFillColor(99, 102, 241)
pdf.rect(M, y, W - 2 * M, 38, 'F')
pdf.setFontSize(10)
pdf.setFont('helvetica', 'normal')
pdf.setTextColor(220, 225, 245)
pdf.text(tr('HAZIRAN 2026 TOPLAM GIDER'), M + 5, y + 9)
pdf.setFontSize(26)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(255)
pdf.text(tl(junTotal), M + 5, y + 22)
pdf.setFontSize(14)
pdf.setFont('helvetica', 'normal')
pdf.setTextColor(220, 225, 245)
pdf.text(chf(junTotal / RATE), M + 5, y + 32)

// Delta rozeti (sag ust)
const deltaColor = totalDelta > 0 ? [239, 68, 68] : [16, 185, 129]
pdf.setFillColor(...deltaColor)
pdf.roundedRect(W - M - 55, y + 6, 50, 12, 2, 2, 'F')
pdf.setFontSize(9)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(255)
pdf.text(tr('MAYIS AYINA GORE'), W - M - 30, y + 10, { align: 'center' })
pdf.setFontSize(11)
pdf.text(pct(totalDelta, mayTotal), W - M - 30, y + 15.5, { align: 'center' })

pdf.setFontSize(9)
pdf.setFont('helvetica', 'normal')
pdf.setTextColor(220, 225, 245)
pdf.text(tr('Mayis 2026: ') + tl(mayTotal), W - M - 5, y + 25, { align: 'right' })
pdf.text(tr('Fark: ') + deltaText(totalDelta), W - M - 5, y + 32, { align: 'right' })

y += 46

// ── KPI strip ──
const kpis = [
  { label: 'Toplam Islem',  value: String(junTx.length),           accent: [99, 102, 241] },
  { label: 'Kategori',      value: String(categories.length),      accent: [16, 185, 129] },
  { label: 'En Yuksek',     value: tl(categories[0]?.total ?? 0),  accent: [239, 68, 68] },
  { label: 'Ortalama Gun',  value: tl(junTotal / 30),              accent: [245, 158, 11] },
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
y += 28

// ── KARSILASTIRMA TABLOSU ──
pdf.setFillColor(99, 102, 241)
pdf.rect(M, y - 4, 3, 7, 'F')
pdf.setFontSize(13)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(25)
pdf.text(tr('Mayis vs Haziran Kategori Karsilastirmasi'), M + 6, y + 1)
y += 10

// Kolonlar
const K_NAME  = M + 3
const K_MAY   = M + 88
const K_JUN   = M + 125
const K_DELTA = M + 160
const K_PCT   = W - M - 3

// Header
pdf.setFillColor(99, 102, 241)
pdf.rect(M, y - 4, W - 2 * M, 10, 'F')
pdf.setFontSize(10)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(255)
pdf.text(tr('Kategori'),   K_NAME,  y + 2)
pdf.text(tr('Mayis TL'),   K_MAY,   y + 2, { align: 'right' })
pdf.text(tr('Haziran TL'), K_JUN,   y + 2, { align: 'right' })
pdf.text(tr('Fark TL'),    K_DELTA, y + 2, { align: 'right' })
pdf.text(tr('Fark %'),     K_PCT,   y + 2, { align: 'right' })
y += 12

pdf.setFont('helvetica', 'normal')
compareRows.forEach((row, i) => {
  ensureRoom(9)
  if (i % 2 === 0) {
    pdf.setFillColor(247, 248, 252)
    pdf.rect(M, y - 5, W - 2 * M, 9, 'F')
  }
  pdf.setFontSize(9.5)
  pdf.setTextColor(35)
  pdf.text(truncate(tr(row.name), 42), K_NAME, y + 1)
  pdf.text(tl(row.may), K_MAY, y + 1, { align: 'right' })
  pdf.text(tl(row.jun), K_JUN, y + 1, { align: 'right' })

  // Delta yesil / kirmizi
  if (row.delta > 0) pdf.setTextColor(200, 40, 40)
  else if (row.delta < 0) pdf.setTextColor(20, 140, 80)
  else pdf.setTextColor(120)
  pdf.text(deltaText(row.delta), K_DELTA, y + 1, { align: 'right' })
  pdf.text(pct(row.delta, row.may), K_PCT, y + 1, { align: 'right' })

  y += 9
})

// Toplam satiri
y += 3
pdf.setFillColor(20, 23, 38)
pdf.rect(M, y - 5, W - 2 * M, 11, 'F')
pdf.setFontSize(11)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(255)
pdf.text(tr('TOPLAM'),         K_NAME,  y + 2)
pdf.text(tl(mayTotal),         K_MAY,   y + 2, { align: 'right' })
pdf.text(tl(junTotal),         K_JUN,   y + 2, { align: 'right' })
pdf.text(deltaText(totalDelta), K_DELTA, y + 2, { align: 'right' })
pdf.text(pct(totalDelta, mayTotal), K_PCT, y + 2, { align: 'right' })

// ── Haziran kategori dagilimi tablosu ──
pdf.addPage()
y = 22

pdf.setFillColor(99, 102, 241)
pdf.rect(M, y - 4, 3, 7, 'F')
pdf.setFontSize(13)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(25)
pdf.text(tr('Haziran 2026 Kategori Dagilimi'), M + 6, y + 1)
y += 10

const C_NAME = M + 3
const C_CNT  = M + 95
const C_TL   = M + 125
const C_CHF  = M + 158
const C_PCT  = W - M - 3

pdf.setFillColor(99, 102, 241)
pdf.rect(M, y - 4, W - 2 * M, 10, 'F')
pdf.setFontSize(10)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(255)
pdf.text(tr('Kategori'), C_NAME, y + 2)
pdf.text(tr('Islem'),    C_CNT,  y + 2, { align: 'right' })
pdf.text(tr('TL'),       C_TL,   y + 2, { align: 'right' })
pdf.text(tr('CHF'),      C_CHF,  y + 2, { align: 'right' })
pdf.text(tr('%'),        C_PCT,  y + 2, { align: 'right' })
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
  pdf.text(`%${(c.total / junTotal * 100).toFixed(1)}`, C_PCT, y + 1, { align: 'right' })
  y += 9
})

y += 3
pdf.setFillColor(20, 23, 38)
pdf.rect(M, y - 5, W - 2 * M, 11, 'F')
pdf.setFontSize(11)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(255)
pdf.text(tr('TOPLAM'),                C_NAME, y + 2)
pdf.text(String(junTx.length),        C_CNT,  y + 2, { align: 'right' })
pdf.text(tl(junTotal),                C_TL,   y + 2, { align: 'right' })
pdf.text(chf(junTotal / RATE),        C_CHF,  y + 2, { align: 'right' })
pdf.text('%100',                      C_PCT,  y + 2, { align: 'right' })

// ── Detayli kategori bloklari ──
pdf.addPage()
y = 22

pdf.setFillColor(99, 102, 241)
pdf.rect(M, y - 4, 3, 8, 'F')
pdf.setFontSize(14)
pdf.setFont('helvetica', 'bold')
pdf.setTextColor(25)
pdf.text(tr('Kategori Bazli Detayli Islem Listesi (Haziran)'), M + 7, y + 2)
y += 12

const T_DATE = M + 3
const T_DESC = M + 24
const T_PAY  = M + 108
const T_AMT  = W - M - 3

categories.forEach((cat) => {
  ensureRoom(60)

  // Kategori basligi bandi
  pdf.setFillColor(30, 41, 59)
  pdf.rect(M, y, W - 2 * M, 22, 'F')
  pdf.setFontSize(13)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255)
  pdf.text(tr(cat.name), M + 5, y + 10)
  pdf.setFontSize(8.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(200)

  // Mayis karsilastirma bilgisi
  const mayForCat = mayByCat[cat.name]?.total || 0
  const catDelta  = cat.total - mayForCat
  const catPct    = mayForCat ? ` · Mayis: ${tl(mayForCat)} (${pct(catDelta, mayForCat)})` : ' · Mayis: yok'
  pdf.text(`${cat.count} islem  ·  %${(cat.total / junTotal * 100).toFixed(1)} pay${catPct}`, M + 5, y + 17)

  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255)
  pdf.text(tl(cat.total), W - M - 5, y + 10, { align: 'right' })
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(200)
  pdf.text(chf(cat.total / RATE), W - M - 5, y + 17, { align: 'right' })

  y += 28

  // Islem tablosu basligi
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

  ensureRoom(11)
  pdf.setFillColor(20, 23, 38)
  pdf.rect(M, y - 5, W - 2 * M, 11, 'F')
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255)
  pdf.text(tr(`${truncate(cat.name, 32)}  -  ${cat.count} islem`), T_DATE, y + 2)
  pdf.text(tl(cat.total), T_AMT, y + 2, { align: 'right' })

  y += 16
})

// ── FOOTER ──
const totalPages = pdf.internal.getNumberOfPages()
for (let p = 1; p <= totalPages; p++) {
  pdf.setPage(p)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(140)
  pdf.text(tr('Cxentrix Solutions - Haziran 2026 Karsilastirmali Gider Raporu'), M, H - 10)
  pdf.text(`Sayfa ${p} / ${totalPages}`, W - M, H - 10, { align: 'right' })
}

// ── KAYDET ──
const buffer = pdf.output('arraybuffer')
const downloadsDir = process.env.USERPROFILE ? join(process.env.USERPROFILE, 'Downloads') : '.'
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)
const outPath = join(downloadsDir, `Cxentrix-Haziran-2026-Karsilastirmali-Rapor-${stamp}.pdf`)
writeFileSync(outPath, Buffer.from(buffer))

console.log(`\n✓ PDF kaydedildi: ${outPath}`)
console.log(`  ${totalPages} sayfa · ${junTx.length} islem (Haziran) · ${tl(junTotal)}`)
