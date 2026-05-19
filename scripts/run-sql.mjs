#!/usr/bin/env node
/**
 * Run one or more .sql files against the Supabase Postgres database
 * using the SUPABASE_DB_URL from .env.local.
 *
 * Usage:
 *   node scripts/run-sql.mjs <file1.sql> [<file2.sql> ...]
 *
 * Each file is executed as a single multi-statement query (good for
 * schema files and transactional batch inserts that already wrap
 * themselves in BEGIN/COMMIT).
 */

import { readFileSync, existsSync } from 'node:fs'
import { argv, exit } from 'node:process'
import pg from 'pg'

// --- Tiny .env.local loader (no extra deps) ---------------------------------
function loadEnvFile(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}
loadEnvFile('.env.local')
loadEnvFile('.env')

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('ERROR: SUPABASE_DB_URL is not set in .env.local')
  exit(1)
}

const files = argv.slice(2)
if (files.length === 0) {
  console.error('Usage: node scripts/run-sql.mjs <file1.sql> [<file2.sql> ...]')
  exit(1)
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  console.log(`Connected to ${new URL(dbUrl).host}`)

  for (const file of files) {
    if (!existsSync(file)) {
      console.error(`  [skip] ${file} (not found)`)
      continue
    }
    const sql = readFileSync(file, 'utf8')
    const sizeKb = (sql.length / 1024).toFixed(1)
    process.stdout.write(`  [run]  ${file} (${sizeKb} KB) ... `)
    try {
      await client.query(sql)
      console.log('OK')
    } catch (err) {
      console.log('FAILED')
      console.error(`         ${err.message}`)
      if (err.position) {
        const pos = parseInt(err.position, 10)
        const before = sql.slice(Math.max(0, pos - 80), pos)
        const after = sql.slice(pos, pos + 80)
        console.error(`         context: ...${before}>>>${after}...`)
      }
      throw err
    }
  }
  console.log('Done.')
} catch (err) {
  console.error('FAILED:', err.message)
  exit(1)
} finally {
  await client.end()
}
