#!/usr/bin/env node
/**
 * Extract the circular symbol portion of the stacked Cxentrix logo
 * (public/logo-full.png) and save it as a square icon
 * (public/logo-icon.png) for use in the sidebar.
 *
 * Run:
 *   node scripts/extract-logo-icon.mjs
 */

import sharp from 'sharp'
import { existsSync } from 'node:fs'

const src = 'public/logo-full.png'
const dst = 'public/logo-icon.png'

if (!existsSync(src)) {
  console.error(`ERROR: ${src} not found`)
  process.exit(1)
}

const meta = await sharp(src).metadata()
const W = meta.width, H = meta.height

// The stacked logo places the circle symbol roughly in the top quarter,
// centered horizontally. These ratios were tuned visually against the
// 3125x1875 export from cxentrix.com.
const cx = Math.round(W * 0.50)
const cy = Math.round(H * 0.24)
const side = Math.round(H * 0.48)
const half = Math.round(side / 2)
const left = Math.max(0, cx - half)
const top  = Math.max(0, cy - half)

await sharp(src)
  .extract({ left, top, width: side, height: side })
  .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(dst)

console.log(`Source : ${W}x${H} (alpha=${meta.hasAlpha})`)
console.log(`Crop   : left=${left} top=${top} side=${side}`)
console.log(`Wrote  : ${dst} (256x256)`)
