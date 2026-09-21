// Written with the extension, unlike the rest of src/, so that this file can be
// run under plain node by tests/appleHealth.test.mjs. Vite resolves it either
// way; node only resolves it like this.
import { ymd } from './day.js'

/**
 * Import an Apple Health export.
 *
 * ── Why this exists at all ──────────────────────────────────────────────────
 *
 * Apple Health is the one source of step data that cannot be reached from a
 * server. Every other provider - Garmin, Fitbit, Withings, Oura, Whoop - has a
 * cloud API, which is why one aggregator (Terra) covers all of them with a
 * webhook. HealthKit has no cloud. The data lives on the phone, and the only
 * two ways out of it are a native app holding a HealthKit entitlement, or the
 * export button in the Health app. This is a PWA, so there is no native app,
 * and no aggregator can close that gap either - Terra can't read HealthKit any
 * more than we can.
 *
 * So: the client taps Export in the Health app, shares the zip to this page,
 * and we read it here in the browser. Nothing is uploaded except the numbers we
 * derive - the archive itself never leaves the phone, which also happens to be
 * the right answer on a file that contains their entire medical history.
 *
 * ── Why it streams ──────────────────────────────────────────────────────────
 *
 * export.xml is one line per sample since the day they bought the watch. A few
 * years of Apple Watch wear is comfortably 500MB of XML and can pass 2GB. That
 * rules out reading the file into a string, and it rules out DOMParser. So the
 * zip entry is decompressed through DecompressionStream and scanned chunk by
 * chunk, holding only a partial tag across each boundary. Peak memory is a few
 * hundred kilobytes regardless of the archive's size.
 *
 * Deliberately on the main thread rather than in a worker, but that only works
 * because the loop yields on purpose. Awaiting the next chunk is not enough on
 * its own: when the stream has bytes ready the promise settles as a microtask,
 * and a run of microtasks never lets the browser paint. Measured on a 350MB
 * export, the whole scan finished without a single timer callback firing - on a
 * phone that is a frozen page and a progress bar stuck at nothing. So the loop
 * hands control back on a clock (below), which costs about a hundred
 * milliseconds across a 350MB file and buys a page that stays alive.
 */

// ── Zip reading ─────────────────────────────────────────────────────────────
// Enough of the format to pull one known entry out of a large archive without
// reading the rest of it. Blob.slice() gives random access, so the central
// directory is read from the tail and only export.xml's bytes are ever touched.

const EOCD_SIG = 0x06054b50   // end of central directory
const EOCD64_SIG = 0x06064b50 // zip64 end of central directory
const LOC64_SIG = 0x07064b50  // zip64 locator
const CDH_SIG = 0x02014b50    // central directory file header
const LFH_SIG = 0x04034b50    // local file header

const U32_MAX = 0xffffffff

const dv = (buf) => new DataView(buf)
const big = (view, off) => Number(view.getBigUint64(off, true))

async function bytes(file, start, end) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer())
}

/**
 * Locate the central directory.
 *
 * The end-of-central-directory record sits at the very end of the file, except
 * that a zip may carry up to 64KB of trailing comment after it, so it has to be
 * found by scanning backwards for its signature rather than read at a fixed
 * offset.
 */
async function readDirectoryLocation(file) {
  const tailLen = Math.min(file.size, 65557 + 20)
  const tail = await bytes(file, file.size - tailLen, file.size)
  const view = dv(tail.buffer)

  let eocd = -1
  for (let i = tail.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) { eocd = i; break }
  }
  if (eocd < 0) return { error: "That doesn't look like a zip file." }

  let entries = view.getUint16(eocd + 10, true)
  let cdSize = view.getUint32(eocd + 12, true)
  let cdOffset = view.getUint32(eocd + 16, true)

  // A zip64 archive parks sentinel values in the 32-bit fields and puts the
  // real ones in a second record. An Apple Health export can be big enough to
  // need this, so it is handled rather than mis-read.
  if (entries === 0xffff || cdSize === U32_MAX || cdOffset === U32_MAX) {
    let loc = -1
    for (let i = eocd - 20; i >= 0; i--) {
      if (view.getUint32(i, true) === LOC64_SIG) { loc = i; break }
    }
    if (loc < 0) return { error: 'That zip file is larger than 4GB and is missing its zip64 index.' }
    const at = big(view, loc + 8)
    const rec = dv((await bytes(file, at, at + 56)).buffer)
    if (rec.getUint32(0, true) !== EOCD64_SIG) return { error: 'That zip file has a damaged zip64 index.' }
    entries = big(rec, 32)
    cdSize = big(rec, 40)
    cdOffset = big(rec, 48)
  }

  return { entries, cdSize, cdOffset }
}

/**
 * The entry we want, or a reason we can't find it.
 *
 * Apple names the payload `apple_health_export/export.xml`. The zip also holds
 * `export_cda.xml` - the same data as a clinical document, several times the
 * size and far more work to read - so the match is on the exact basename rather
 * than anything that merely contains "export".
 */
async function findExportEntry(file) {
  const loc = await readDirectoryLocation(file)
  if (loc.error) return loc

  const cd = await bytes(file, loc.cdOffset, loc.cdOffset + loc.cdSize)
  const view = dv(cd.buffer)
  const names = []
  let p = 0

  for (let n = 0; n < loc.entries && p + 46 <= cd.length; n++) {
    if (view.getUint32(p, true) !== CDH_SIG) break
    const flags = view.getUint16(p + 8, true)
    const method = view.getUint16(p + 10, true)
    let compSize = view.getUint32(p + 20, true)
    let uncompSize = view.getUint32(p + 24, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    let offset = view.getUint32(p + 42, true)
    const name = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nameLen))

    // Zip64 puts the true sizes in an extra field, and only for those fields
    // that overflowed - in a fixed order, so they are read positionally.
    if (uncompSize === U32_MAX || compSize === U32_MAX || offset === U32_MAX) {
      let e = p + 46 + nameLen
      const extraEnd = e + extraLen
      while (e + 4 <= extraEnd) {
        const id = view.getUint16(e, true)
        const size = view.getUint16(e + 2, true)
        if (id === 0x0001) {
          let q = e + 4
          if (uncompSize === U32_MAX) { uncompSize = big(view, q); q += 8 }
          if (compSize === U32_MAX) { compSize = big(view, q); q += 8 }
          if (offset === U32_MAX) { offset = big(view, q); q += 8 }
          break
        }
        e += 4 + size
      }
    }

    const base = name.split('/').pop()
    if (base === 'export.xml') {
      if (flags & 0x1) return { error: 'That zip file is password-protected, so it cannot be read.' }
      if (method !== 0 && method !== 8) return { error: `That zip uses an unsupported compression method (${method}).` }
      return { name, method, compSize, uncompSize, offset }
    }
    names.push(name)
    p = p + 46 + nameLen + extraLen + commentLen
  }

  // Worth being specific: the single most likely mistake is sharing the
  // Health app's *other* export, or a zip of something else entirely.
  const cda = names.some(n => n.split('/').pop() === 'export_cda.xml')
  return {
    error: cda
      ? "That archive only contains export_cda.xml, not export.xml. Re-run the export from the Health app and don't unzip it first."
      : "No export.xml inside that zip - it doesn't look like an Apple Health export.",
  }
}

/** A byte stream of the entry's decompressed contents. */
async function entryStream(file, entry) {
  // The local header repeats the name and carries its own extra field, whose
  // length differs from the central one, so the data offset has to be computed
  // from the local header rather than assumed.
  const head = dv((await bytes(file, entry.offset, entry.offset + 30)).buffer)
  if (head.getUint32(0, true) !== LFH_SIG) return { error: 'That zip file is damaged.' }
  const start = entry.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true)

  const raw = file.slice(start, start + entry.compSize).stream()
  return { stream: entry.method === 8 ? raw.pipeThrough(new DecompressionStream('deflate-raw')) : raw }
}

// ── XML scanning ────────────────────────────────────────────────────────────

const TYPES = {
  HKQuantityTypeIdentifierStepCount: 'steps',
  HKQuantityTypeIdentifierRestingHeartRate: 'resting_hr',
  HKQuantityTypeIdentifierBodyMass: 'weight_kg',
}

// Deliberately absent: HKQuantityTypeIdentifierHeartRate. The watch samples
// heart rate far more often during exercise than at rest, so the mean of a
// day's samples is not that day's average heart rate - it is a number weighted
// by how much of the day was spent training. Resting heart rate is the figure
// Apple actually computes, and it is the one worth having.

const KG = { kg: 1, lb: 0.45359237, st: 6.35029318, stone: 6.35029318, g: 0.001 }

/** Find the end of a start tag, respecting quoted attribute values. */
function tagEnd(s, from) {
  let quote = 0
  for (let i = from; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (quote) { if (c === quote) quote = 0 }
    else if (c === 34 || c === 39) quote = c
    else if (c === 62) return i + 1 // '>'
  }
  return -1
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" }
const unescapeXml = (s) => s.includes('&') ? s.replace(/&(#39|amp|lt|gt|quot|apos);/g, (m, e) => ENTITIES[e] ?? m) : s

const ATTR = /([A-Za-z]+)="([^"]*)"/g
function attrs(tag) {
  const out = {}
  ATTR.lastIndex = 0
  let m
  while ((m = ATTR.exec(tag))) out[m[1]] = m[2]
  return out
}

/**
 * Walk every <Record> in the stream, accumulating per day.
 *
 * `sinceDay` is checked before anything else is parsed, because on a ten-year
 * archive almost every record is outside the window and the cheapest possible
 * rejection is what makes the scan finish in seconds rather than minutes.
 */
async function scanRecords(stream, { sinceDay, onProgress, total }) {
  const days = new Map()
  const dayOf = (d) => { const s = days.get(d); if (s) return s; const n = { bySource: new Map(), rest: [], weight: null }; days.set(d, n); return n }

  const decoder = new TextDecoder('utf-8')
  const reader = stream.getReader()
  let buf = ''
  let read = 0
  let records = 0
  let seen = 0
  let lastTick = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    read += value.byteLength
    buf += decoder.decode(value, { stream: true })

    let i = 0
    for (;;) {
      const start = buf.indexOf('<Record', i)
      if (start < 0) { i = Math.max(i, buf.length - 8); break }
      const end = tagEnd(buf, start)
      if (end < 0) { i = start; break } // incomplete - wait for more bytes
      seen++
      consider(buf.slice(start, end))
      i = end
    }
    buf = buf.slice(i)

    // One clock for both jobs. Repainting per chunk would be thousands of
    // renders, and yielding per chunk would triple the runtime; eight times a
    // second is enough for a progress bar to move and for a tap to register.
    const now = Date.now()
    if (now - lastTick > 120) {
      lastTick = now
      onProgress?.({ read, total, pct: total ? Math.min(99, Math.round((read / total) * 100)) : null })
      // setTimeout, not a microtask: this has to reach the browser's task loop,
      // because that is the only place rendering happens.
      await new Promise(r => setTimeout(r, 0))
    }
  }

  function consider(tag) {
    const t = tag.indexOf(' type="')
    if (t < 0) return
    const tEnd = tag.indexOf('"', t + 7)
    const kind = TYPES[tag.slice(t + 7, tEnd)]
    if (!kind) return

    const a = attrs(tag)
    // Apple writes local wall-clock time with an offset ("2026-09-20 07:58:00
    // +0100"). The first ten characters are the date as the client lived it,
    // which is the day their step count belongs to - so no conversion, and no
    // chance of a walk after 11pm landing on tomorrow.
    const day = (a.startDate || a.creationDate || '').slice(0, 10)
    if (day.length !== 10 || day < sinceDay) return

    const value = Number(a.value)
    if (!Number.isFinite(value)) return
    records++
    const d = dayOf(day)

    if (kind === 'steps') {
      // The export is not de-duplicated. An iPhone in a pocket and a Watch on
      // the wrist both record the same walk, and both sets of samples are in
      // the file; adding them up is how importers end up reporting 19,000
      // steps for a day the Health app called 9,500.
      //
      // So steps are totalled per recording device, and the day's figure is the
      // largest of those totals - the device that saw the most of the day. It
      // can undercount slightly (a morning with the phone, an afternoon with
      // the watch, and neither total covers both), which is the right way to be
      // wrong: a step target should not be met by double counting.
      const src = unescapeXml(a.sourceName || '?')
      d.bySource.set(src, (d.bySource.get(src) || 0) + value)
    } else if (kind === 'resting_hr') {
      d.rest.push(value)
    } else {
      const unit = (a.unit || 'kg').toLowerCase()
      const kg = value * (KG[unit] ?? 1)
      // Last weigh-in of the day wins, same as stepping on the scales twice.
      if (kg > 20 && kg < 400 && (!d.weight || (a.startDate || '') >= d.weight.at)) {
        d.weight = { kg, at: a.startDate || '' }
      }
    }
  }

  const rows = []
  let sources = new Set()
  for (const [day, d] of days) {
    let steps = null
    if (d.bySource.size) {
      steps = 0
      for (const [src, n] of d.bySource) { sources.add(src); if (n > steps) steps = n }
      steps = Math.round(steps)
    }
    const resting_hr = d.rest.length ? Math.round(d.rest.reduce((a, b) => a + b, 0) / d.rest.length) : null
    const weight_kg = d.weight ? Math.round(d.weight.kg * 100) / 100 : null
    if (steps != null || resting_hr != null || weight_kg != null) rows.push({ day, steps, resting_hr, weight_kg })
  }
  rows.sort((a, b) => (a.day < b.day ? -1 : 1))
  return { rows, scanned: seen, matched: records, sources: [...sources] }
}

// ── What a caller wants ─────────────────────────────────────────────────────

/**
 * How far back to import.
 *
 * Two years, not everything. The charts in this app top out at a twelve-month
 * range, so two years is enough to put this September beside last September and
 * nothing beyond that has a reader. A decade of Apple Watch history is 3,650
 * rows of storage answering a question nobody asks.
 */
export const IMPORT_YEARS = 2

export const APPLE_SOURCE = 'apple_health'

export async function parseAppleHealthZip(file, { onProgress } = {}) {
  if (typeof DecompressionStream === 'undefined') {
    return { error: 'This browser is too old to read a zip file. Try Safari or Chrome.' }
  }
  const entry = await findExportEntry(file)
  if (entry.error) return entry

  const opened = await entryStream(file, entry)
  if (opened.error) return opened

  const since = ymd(new Date(Date.now() - IMPORT_YEARS * 365 * 86400000))
  try {
    const out = await scanRecords(opened.stream, {
      sinceDay: since, onProgress, total: entry.uncompSize || 0,
    })
    return { ...out, since }
  } catch (e) {
    // A truncated or corrupt deflate stream surfaces here, and "unexpected end
    // of file" is not something to show a client as-is.
    return { error: 'That file could not be read all the way through. Try exporting it again.' }
  }
}
