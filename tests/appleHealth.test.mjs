// Reading an Apple Health export.
//
// Two things here are worth more than the rest. The first is that steps are not
// double counted: the export is not de-duplicated, an iPhone and a Watch both
// record the same walk, and adding them up inflates a day by half again. The
// second is that a 350MB file is read without being held in memory and without
// locking up the page - so the fixture is deliberately large enough to be
// decompressed in many chunks, and every record is counted to prove that none
// was lost or seen twice at a chunk boundary.

import { parseAppleHealthZip, IMPORT_YEARS } from '../src/lib/appleHealth.js';
import { ymd } from '../src/lib/day.js';
import { makeZip, withComment } from './zip.mjs';
import { t, eq, group, note, done } from './assert.mjs';

const day = (n) => ymd(new Date(Date.now() - n * 86400000));
const at = (d, h = 8, m = 0) => `${d} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00 +0100`;

// Entities on purpose: Apple writes the phone's name as the client typed it,
// and "Harrison's iPhone" arrives as an escaped apostrophe.
const PHONE = 'Harrison&apos;s iPhone';
const WATCH = 'Watch &gt; 10 &amp; newer';

const rec = (type, src, unit, start, value, children) =>
  ` <Record type="${type}" sourceName="${src}" sourceVersion="10.1" unit="${unit}"` +
  ` creationDate="${start}" startDate="${start}" endDate="${start}" value="${value}"` +
  (children ? '>\n  <MetadataEntry key="HKMetadataKeyWasUserEntered" value="1"/>\n </Record>\n' : '/>\n');

// ── The fixture ─────────────────────────────────────────────────────────────
const parts = ['<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="en_GB">\n'];
let written = 0;
const add = (s) => { parts.push(s); written++ };

// Yesterday: the phone saw 4,000 and the watch saw 9,500 of the same day.
for (let i = 0; i < 8; i++) add(rec('HKQuantityTypeIdentifierStepCount', PHONE, 'count', at(day(1), 7, i), 500));
for (let i = 0; i < 20; i++) add(rec('HKQuantityTypeIdentifierStepCount', WATCH, 'count', at(day(1), 9, i), 475));
// Two days ago: one device only.
for (let i = 0; i < 12; i++) add(rec('HKQuantityTypeIdentifierStepCount', PHONE, 'count', at(day(2), 7, i), 510));
// Well outside the import window.
for (let i = 0; i < 5; i++) add(rec('HKQuantityTypeIdentifierStepCount', PHONE, 'count', at(day(800), 7, i), 1000));

add(rec('HKQuantityTypeIdentifierRestingHeartRate', WATCH, 'count/min', at(day(1), 3), 52));
add(rec('HKQuantityTypeIdentifierRestingHeartRate', WATCH, 'count/min', at(day(1), 4), 54));
// Two weigh-ins, the later one in pounds. 176.4lb is 80.01kg.
add(rec('HKQuantityTypeIdentifierBodyMass', 'Withings', 'kg', at(day(2), 6), 82.5, true));
add(rec('HKQuantityTypeIdentifierBodyMass', 'Withings', 'lb', at(day(2), 20), 176.4));
// A British scale, reading in stones.
add(rec('HKQuantityTypeIdentifierBodyMass', 'Manual', 'st', at(day(3), 7), 12.6));

// Bulk. Heart-rate samples are the most numerous thing in a real export by a
// wide margin and we deliberately ignore them, so they are the right filler:
// they make the file big enough to stream in many chunks and they must all be
// skipped.
const IGNORED = 40000;
for (let i = 0; i < IGNORED; i++) {
  add(rec('HKQuantityTypeIdentifierHeartRate', WATCH, 'count/min', at(day(i % 400), i % 24, i % 60), 60 + (i % 40)));
}
parts.push(' <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="32"/>\n</HealthData>\n');
const XML = parts.join('');

// Accepts a list of parts as well as one blob of bytes, because a File picked
// on a phone is not guaranteed to be one contiguous chunk.
const file = (bytes, name = 'export.zip') => new File(Array.isArray(bytes) ? bytes : [bytes], name);
const archive = (opts = {}) => makeZip([{ name: 'apple_health_export/export.xml', data: XML, ...opts }]);

// ── 1. A normal export ──────────────────────────────────────────────────────
group('A normal export');
let ticks = 0;
const t0 = Date.now();
const r = await parseAppleHealthZip(file(await makeZip([
  { name: 'apple_health_export/export.xml', data: XML },
  { name: 'apple_health_export/export_cda.xml', data: 'x'.repeat(4000) },
])), { onProgress: () => ticks++ });
note(`${(XML.length / 1e6).toFixed(1)}MB of XML, ${r.scanned?.toLocaleString()} records, ${Date.now() - t0}ms`);

t('read without error', !r.error, r.error);
const byDay = Object.fromEntries((r.rows || []).map(x => [x.day, x]));

t('steps take the busiest device, not the sum of both', byDay[day(1)]?.steps === 9500, byDay[day(1)]);
t('  - and a single-device day is just its total', byDay[day(2)]?.steps === 6120, byDay[day(2)]);
t('resting heart rate is the mean of the day', byDay[day(1)]?.resting_hr === 53, byDay[day(1)]);
t('the last weigh-in of the day wins, converted from pounds', byDay[day(2)]?.weight_kg === 80.01, byDay[day(2)]);
t('stones are converted too', byDay[day(3)]?.weight_kg === 80.01, byDay[day(3)]);
t(`anything older than ${IMPORT_YEARS} years is left out`, !byDay[day(800)], byDay[day(800)]);
t('the window is measured from today', r.since === ymd(new Date(Date.now() - IMPORT_YEARS * 365 * 86400000)), r.since);
t('device names are unescaped',
  r.sources?.includes("Harrison's iPhone") && r.sources?.includes('Watch > 10 & newer'), r.sources);
t('progress is reported while it runs', ticks > 0, ticks);
eq('only the days with something in them come back',
  (r.rows || []).map(x => x.day), [day(3), day(2), day(1)]);

// Getting this exactly right is the chunk-boundary test. At ~64KB per
// decompressed chunk this file spans well over a hundred of them, and a tag
// straddling any one would be lost or counted twice.
t(`every one of the ${written.toLocaleString()} records seen exactly once`, r.scanned === written, r.scanned);
t('and only the three types we want were kept', r.matched === 8 + 20 + 12 + 2 + 2 + 1, r.matched);
t('heart-rate samples contributed nothing', (r.rows || []).every(x => x.avg_hr == null));

// ── 2. The same file, stored differently ────────────────────────────────────
group('The same data, packaged differently');
const same = (label, bytes) => parseAppleHealthZip(file(bytes)).then(x =>
  t(label, !x.error && JSON.stringify(x.rows) === JSON.stringify(r.rows), x.error || x.rows?.length));

await same('an uncompressed entry reads identically', await archive({ store: true }));
await same('zip64 size fields read identically', await archive({ zip64: true }));
await same('a trailing zip comment is skipped', withComment(await archive(), 'z'.repeat(400)));
await same('the file arriving in several blob parts makes no difference',
  [(await archive()).subarray(0, 20000), (await archive()).subarray(20000)]);

// ── 3. The ways this goes wrong in someone's hands ──────────────────────────
group('What a client is actually likely to hand us');
const refuses = async (label, bytes, pattern) => {
  const x = await parseAppleHealthZip(file(bytes));
  t(label, pattern.test(x.error || ''), x.error);
};
await refuses('only export_cda.xml - says which file is missing and what to do',
  await makeZip([{ name: 'apple_health_export/export_cda.xml', data: 'x'.repeat(400) }]), /export_cda\.xml.*Health app/s);
await refuses('some other zip entirely',
  await makeZip([{ name: 'photos/cat.txt', data: 'meow' }]), /doesn't look like an Apple Health export/);
await refuses('a password-protected archive',
  await archive({ encrypted: true }), /password-protected/);
await refuses('a file that is not a zip at all', new Uint8Array(5000), /doesn't look like a zip/);
await refuses('an empty file', new Uint8Array(0), /doesn't look like a zip/);
await refuses('an archive cut off partway through',
  (await archive()).subarray(0, 12000), /doesn't look like a zip/);

// Truncating the entry's bytes while leaving the directory intact is the nastier
// case: everything about the archive looks right until the deflate stream ends
// early, which surfaces as a stream error rather than a bad header.
const whole = await archive();
const gutted = whole.slice();
gutted.fill(0, 200, 60000);
const bad = await parseAppleHealthZip(file(gutted));
t('a corrupt entry fails with something a client can act on',
  /could not be read|doesn't look like/.test(bad.error || ''), bad.error);

done(25);
