#!/usr/bin/env node
/**
 * Convert a "Transactions-Grid view" CSV export into Supabase-ready SQL.
 *
 * Usage:
 *   node scripts/csv-to-sql.mjs <input.csv> <output.sql>
 *
 * The CSV is expected to have these columns (Turkish export):
 *   Month, Masraf Tarihi, MonthLabel, Type, Category, Description,
 *   Amount TL, Ödeme Türü, Gider Faturası var mı?, Faturalandırıldı mı?,
 *   Amount CHF, Açıklama, Gelir, Gider
 *
 * Output SQL:
 *   - Idempotent inserts into public.categories (name, type)
 *   - Idempotent inserts into public.payment_types (name)
 *   - Inserts into public.transactions (type, date, amount, category,
 *       payment_type, description)
 *
 * Paste/run the resulting SQL in Supabase Dashboard → SQL Editor.
 * RLS is bypassed there (service role), so this works even though the
 * app's `authenticated` policy would block anon clients.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const [, , inputPath, outputPath] = argv
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/csv-to-sql.mjs <input.csv> <output.sql>')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 1. CSV parser (handles quoted fields with embedded newlines + escaped quotes)
// ---------------------------------------------------------------------------
function parseCsv(text) {
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''))
}

// ---------------------------------------------------------------------------
// 2. Field cleaners
// ---------------------------------------------------------------------------
function cleanText(s) {
  if (s == null) return ''
  return s.replace(/\s+/g, ' ').trim()
}

function parseDate(s) {
  // "31.12.2025" -> "2025-12-31"
  const t = (s || '').trim()
  const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseAmount(s) {
  if (!s) return null
  // strip "₺", "CHF", whitespace, thousands; keep dot decimal
  const cleaned = s.replace(/[₺$€£]/g, '')
                   .replace(/CHF/gi, '')
                   .replace(/\s+/g, '')
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function mapType(s) {
  const t = (s || '').trim().toLowerCase()
  if (t === 'gider') return 'expense'
  if (t === 'gelir') return 'income'
  return null
}

function sqlString(s) {
  if (s === null || s === undefined || s === '') return 'NULL'
  return `'${String(s).replace(/'/g, "''")}'`
}

function sqlNumber(n) {
  return n == null ? 'NULL' : String(n)
}

// ---------------------------------------------------------------------------
// 3. Read & process
// ---------------------------------------------------------------------------
const raw = readFileSync(inputPath, 'utf8')
const rows = parseCsv(raw)
if (rows.length < 2) {
  console.error('CSV is empty or unreadable')
  process.exit(1)
}

const header = rows[0].map(h => h.trim())
const idx = (name) => {
  const i = header.findIndex(h => h.toLowerCase() === name.toLowerCase())
  if (i < 0) throw new Error(`Column "${name}" not found in CSV header: ${header.join(' | ')}`)
  return i
}

const I_DATE     = idx('Masraf Tarihi')
const I_TYPE     = idx('Type')
const I_CATEGORY = idx('Category')
const I_DESC     = idx('Description')
const I_AMOUNT   = idx('Amount TL')
const I_PAYMENT  = idx('Ödeme Türü')

const categories  = new Map()  // key: `${name}::${type}` -> {name, type}
const paymentTypes = new Set()
const txInserts   = []
const skipped     = []

for (let r = 1; r < rows.length; r++) {
  const row = rows[r]
  if (row.every(c => !c || !c.trim())) continue

  const type = mapType(row[I_TYPE])
  const date = parseDate(row[I_DATE])
  const amount = parseAmount(row[I_AMOUNT])
  let category = cleanText(row[I_CATEGORY])
  const description = cleanText(row[I_DESC])
  const paymentType = cleanText(row[I_PAYMENT])

  if (!type || !date || amount == null) {
    skipped.push({ rowNum: r + 1, reason: `missing type/date/amount`, raw: row })
    continue
  }
  // Fall back to "Diğer" when the source CSV has no category set
  if (!category) category = 'Diğer'

  const catKey = `${category}::${type}`
  if (!categories.has(catKey)) categories.set(catKey, { name: category, type })
  if (paymentType) paymentTypes.add(paymentType)

  txInserts.push({
    type, date, amount, category,
    payment_type: paymentType || null,
    description: description || null,
  })
}

// ---------------------------------------------------------------------------
// 4. Emit SQL
// ---------------------------------------------------------------------------
const lines = []
lines.push('-- =====================================================================')
lines.push(`-- Generated from: ${inputPath}`)
lines.push(`-- ${txInserts.length} transactions, ${categories.size} categories, ${paymentTypes.size} payment types`)
lines.push(`-- Run in Supabase Dashboard → SQL Editor.`)
lines.push('-- =====================================================================')
lines.push('')

lines.push('begin;')
lines.push('')

lines.push('-- Categories')
for (const { name, type } of categories.values()) {
  lines.push(`insert into public.categories (name, type) values (${sqlString(name)}, ${sqlString(type)}) on conflict (name, type) do nothing;`)
}
lines.push('')

lines.push('-- Payment types')
for (const name of paymentTypes) {
  lines.push(`insert into public.payment_types (name) values (${sqlString(name)}) on conflict (name) do nothing;`)
}
lines.push('')

lines.push('-- Transactions')
const BATCH = 100
for (let i = 0; i < txInserts.length; i += BATCH) {
  const chunk = txInserts.slice(i, i + BATCH)
  lines.push(`insert into public.transactions (type, date, amount, category, payment_type, description) values`)
  const valueRows = chunk.map(t =>
    `  (${sqlString(t.type)}, ${sqlString(t.date)}, ${sqlNumber(t.amount)}, ${sqlString(t.category)}, ${sqlString(t.payment_type)}, ${sqlString(t.description)})`
  )
  lines.push(valueRows.join(',\n') + ';')
  lines.push('')
}

lines.push('commit;')
lines.push('')

writeFileSync(outputPath, lines.join('\n'), 'utf8')

console.log(`Wrote ${outputPath}`)
console.log(`  transactions : ${txInserts.length}`)
console.log(`  categories   : ${categories.size}`)
console.log(`  payment_types: ${paymentTypes.size}`)
if (skipped.length) {
  console.log(`  skipped rows : ${skipped.length}`)
  for (const s of skipped.slice(0, 5)) {
    console.log(`    row ${s.rowNum}: ${s.reason}`)
  }
}
