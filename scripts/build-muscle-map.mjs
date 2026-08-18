// Regenerates src/data/musclePaths.jsx from the muscle-map artwork.
//
//   node scripts/build-muscle-map.mjs
//
// The artwork is the source of truth: layer names become slugs, and nested
// group transforms are baked into the coordinates so every path stands alone
// and can be filled, tinted and hit-tested by itself. Re-run this after
// editing design/icons/Muscle Map HS.svg - do not hand-edit the output.
//
// It only handles what that export actually contains: matrix() transforms and
// absolute M/L/C/Z path data. Anything else throws rather than silently
// producing a body with a limb in the wrong place.

import fs from 'fs';

const SRC = 'design/icons/Muscle Map HS.svg';
const s = fs.readFileSync(SRC, 'utf8');

const mul = (A, B) => [
  A[0]*B[0] + A[2]*B[1],
  A[1]*B[0] + A[3]*B[1],
  A[0]*B[2] + A[2]*B[3],
  A[1]*B[2] + A[3]*B[3],
  A[0]*B[4] + A[2]*B[5] + A[4],
  A[1]*B[4] + A[3]*B[5] + A[5],
];
const apply = (M, x, y) => [M[0]*x + M[2]*y + M[4], M[1]*x + M[3]*y + M[5]];
const parseM = (t) => {
  if (!t) return null;
  const m = /matrix\(([^)]*)\)/.exec(t);
  if (!m) throw new Error('unhandled transform: ' + t);
  const n = m[1].split(',').map(Number);
  if (n.length !== 6 || n.some(Number.isNaN)) throw new Error('bad matrix: ' + t);
  return n;
};

const r2 = (v) => {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
};

// Rewrites a path's absolute M/L/C/Z data through an affine matrix. Safe here
// because the export uses no arcs and no relative commands - every coordinate
// is an independent point, so the transform is exact rather than approximated.
function bake(d, M) {
  const toks = d.match(/[MLCZ]|-?[\d.]+(?:e-?\d+)?/gi);
  const out = [];
  let i = 0, cmd = null;
  while (i < toks.length) {
    const t = toks[i];
    if (/^[MLCZ]$/i.test(t)) { cmd = t.toUpperCase(); i++; if (cmd === 'Z') { out.push('Z'); continue; } }
    if (cmd === 'Z') { i++; continue; }
    const n = cmd === 'C' ? 6 : 2;
    const nums = toks.slice(i, i + n).map(Number);
    if (nums.length < n || nums.some(Number.isNaN)) throw new Error('bad path run in ' + d.slice(0, 40));
    i += n;
    const pts = [];
    for (let k = 0; k < n; k += 2) pts.push(apply(M, nums[k], nums[k + 1]).map(r2));
    out.push(cmd + pts.map((p) => p.join(' ')).join(' '));
    cmd = cmd === 'M' ? 'L' : cmd; // implicit line-to after a move-to
  }
  return out.join('');
}

// Walk the document, carrying the accumulated matrix and the nearest named
// ancestor. Ids come straight from the artwork's layer names.
const re = /<(\/?)(g|path|svg)\b([^>]*?)(\/?)>/g;
const stack = [];      // { tag, M, group, side }
let cur = { M: [1,0,0,1,0,0], group: null, side: null };
let topIndex = -1;
const found = [];      // { side, group, d }
let m;
while ((m = re.exec(s))) {
  const [, close, tag, attrs, selfClose] = m;
  if (close) { cur = stack.pop(); continue; }
  const idm = /(?:^|\s)id="([^"]*)"/.exec(attrs);
  const id = idm ? idm[1] : null;
  const M = parseM((/\stransform="([^"]*)"/.exec(attrs) || [])[1]);
  const next = {
    M: M ? mul(cur.M, M) : cur.M,
    group: id || cur.group,
    side: cur.side,
  };
  if (tag === 'g' && stack.length === 1) { topIndex++; next.side = topIndex === 0 ? 'front' : 'back'; }
  if (tag === 'path') {
    const d = (/\sd="([^"]*)"/.exec(attrs) || [])[1];
    if (d) found.push({ side: next.side, group: next.group, d: bake(d, next.M) });
    continue;
  }
  if (selfClose) continue;
  stack.push(cur);
  cur = next;
}

// Layer name -> map slug. The artwork carries a finer chest and shoulder than
// the old figure did; everything else keeps the slug it already had so the rest
// of the app (heat groups, injuries, draw order) needs no translation.
const SLUG = {
  'Upper-Chest': 'chestUpper',
  'Mid-Chest':   'chestMid',
  'Front-Delt':  'deltsFront',
  'Mid-Delt':    'deltsSide',
  'Mid-Delt1':   'deltsSide',
  'Rear-Delt':   'deltsRear',
};
const slugOf = (g) => SLUG[g] || g.replace(/^(front|back)-/, '');

const parts = { front: {}, back: {} };
for (const p of found) {
  if (!p.side || !p.group) throw new Error('orphan path: ' + JSON.stringify(p).slice(0, 120));
  const slug = slugOf(p.group);
  (parts[p.side][slug] ||= []).push(p.d);
}

// Sanity: bounds per side, so the viewBoxes below are checked not assumed.
for (const side of ['front', 'back']) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const paths of Object.values(parts[side])) for (const d of paths) {
    for (const n of d.match(/-?[\d.]+ -?[\d.]+/g) || []) {
      const [x, y] = n.split(' ').map(Number);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  console.error(side, 'bbox', [x0, y0, x1, y1].map(r2).join(', '),
    'slugs', Object.keys(parts[side]).length,
    'paths', Object.values(parts[side]).reduce((a, b) => a + b.length, 0));
}
console.error('total paths', found.length);


const ORDER = {
  front: ['head','neck','trapezius','adductors','knees','tibialis','ankles','feet','hands',
          'forearm','triceps','biceps','deltsFront','deltsSide','chestMid','chestUpper',
          'obliques','abs','quadriceps','calves'],
  back:  ['head','neck','adductors','ankles','feet','hands',
          'forearm','triceps','deltsRear','deltsSide','trapezius','upperBack','lowerBack',
          'gluteal','hamstring','calves'],
};

for (const side of ['front','back']) {
  const have = Object.keys(parts[side]).sort();
  const want = [...ORDER[side]].sort();
  if (have.join() !== want.join()) {
    throw new Error(`${side} slug mismatch\n  in svg: ${have.join(' ')}\n  ordered: ${want.join(' ')}`);
  }
}

const block = (name, side) => {
  const out = [`const ${name} = {`];
  for (const slug of ORDER[side]) {
    out.push(`  ${slug}: [`);
    for (const d of parts[side][slug]) out.push(`    ${JSON.stringify(d)},`);
    out.push('  ],');
  }
  out.push('};');
  return out.join('\n');
};

const head = `// Anatomical body paths, traced from the app's own muscle map artwork
// (design/icons/Muscle Map HS.svg) and generated from it - the layer names in
// that file are the slugs below. Transforms are baked into the coordinates so
// every path is absolute and independent, which is what lets a region be
// filled, tinted and hit-tested on its own.
//
// The chest is two heads, not one: chestUpper is the clavicular fibres an
// incline press loads, chestMid the sternocostal bulk a flat press does. The
// deltoid is likewise split front/side/rear. Coarse 'chest' and 'shoulders'
// tags from before the split still work - see GROUP_PARTS in lib/muscleVolume.
//
// Each side renders with its own viewBox out of the shared 1544x1280 artwork
// (front origin x=0, back origin x=818).
//
// Structure: export const MUSCLE_BODY = {
//   front: { viewBox, parts: { slug: [pathStr, ...] } },
//   back:  { viewBox, parts: { ... } },
//   groupSlugs: { front: { heatGroup: [slug,...] }, back: {...} },
//   neutral:    { front: [slug,...], back: [slug,...] },
//   order:      { front: [slug,...], back: [slug,...] },  // draw order
// }
`;

const tail = `
export const MUSCLE_BODY = {
  front: { viewBox: '0 0 727 1280', parts: MF },
  back:  { viewBox: '818 0 727 1280', parts: MB },
  // heat group -> source slug(s). One group per slug: a slug can only be lit
  // by one signal, which is why the chest and deltoid heads are groups in their
  // own right rather than sub-parts of a 'chest'/'shoulders' group.
  groupSlugs: {
    front: {
      chestUpper: ['chestUpper'], chestMid: ['chestMid'],
      deltsFront: ['deltsFront'], deltsSide: ['deltsSide'],
      biceps: ['biceps'], triceps: ['triceps'], abs: ['abs'], obliques: ['obliques'],
      quads: ['quadriceps'], calves: ['calves'], forearms: ['forearm'],
    },
    back: {
      deltsRear: ['deltsRear'], deltsSide: ['deltsSide'],
      upperBack: ['trapezius'], lats: ['upperBack'],
      lowerBack: ['lowerBack'], triceps: ['triceps'], forearms: ['forearm'],
      glutes: ['gluteal'], hamstrings: ['hamstring'], calves: ['calves'],
    },
  },
  // Injury-selectable regions = every muscle PLUS joints/limbs (knees, ankles,
  // neck, feet, wrists...). Used by the injury map so any body part is tappable.
  // Deliberately coarser than the heat map: a hurt shoulder is a shoulder, and
  // asking someone to pick which deltoid head aches is not a useful question.
  injurySlugs: {
    front: {
      chest: ['chestUpper', 'chestMid'], shoulders: ['deltsFront', 'deltsSide'],
      biceps: ['biceps'], triceps: ['triceps'], abs: ['abs'], obliques: ['obliques'],
      quads: ['quadriceps'], calves: ['calves'], forearms: ['forearm'],
      adductors: ['adductors'], traps: ['trapezius'], neck: ['neck'],
      knees: ['knees'], shins: ['tibialis'], ankles: ['ankles'],
      feet: ['feet'], hands: ['hands'],
    },
    back: {
      shoulders: ['deltsRear', 'deltsSide'], upperBack: ['trapezius'], lats: ['upperBack'],
      lowerBack: ['lowerBack'], triceps: ['triceps'], forearms: ['forearm'],
      glutes: ['gluteal'], hamstrings: ['hamstring'], calves: ['calves'],
      adductors: ['adductors'], neck: ['neck'], ankles: ['ankles'],
      feet: ['feet'], hands: ['hands'],
    },
  },
  // structural parts that never carry heat (drawn neutral)
  neutral: {
    front: ['head', 'neck', 'hands', 'knees', 'tibialis', 'ankles', 'feet', 'adductors', 'trapezius'],
    back:  ['head', 'neck', 'hands', 'ankles', 'feet', 'adductors'],
  },
  // draw order: neutral/structural first, heat muscles last so they sit on top.
  // Within the shoulder and the chest the heads stack the way the artwork
  // stacks them, so the split reads the same here as it does in the file it
  // was drawn in.
  order: {
    front: ${JSON.stringify(ORDER.front)},
    back:  ${JSON.stringify(ORDER.back)},
  },
};

// Friendly names for every selectable region (muscles + joints/limbs). The
// coarse 'chest'/'shoulders' keys are kept so exercises tagged before the split
// still read properly wherever they surface.
export const REGION_LABELS = {
  chestUpper: 'Upper Chest', chestMid: 'Mid Chest', chest: 'Chest',
  deltsFront: 'Front Delts', deltsSide: 'Side Delts', deltsRear: 'Rear Delts',
  shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
  abs: 'Abs', obliques: 'Obliques', quads: 'Quads', calves: 'Calves',
  forearms: 'Forearms', adductors: 'Adductors / Groin', traps: 'Trapezius',
  neck: 'Neck', knees: 'Knees', shins: 'Shins', ankles: 'Ankles', feet: 'Feet',
  hands: 'Wrists / Hands', upperBack: 'Upper Back', lats: 'Lats',
  lowerBack: 'Lower Back', glutes: 'Glutes', hamstrings: 'Hamstrings',
};

// Singular forms, used when an injury is one-sided ("Right Knee").
export const REGION_SINGULAR = {
  chestUpper: 'Upper Chest', chestMid: 'Mid Chest', chest: 'Chest',
  deltsFront: 'Front Delt', deltsSide: 'Side Delt', deltsRear: 'Rear Delt',
  shoulders: 'Shoulder', biceps: 'Bicep', triceps: 'Tricep',
  abs: 'Abs', obliques: 'Oblique', quads: 'Quad', calves: 'Calf',
  forearms: 'Forearm', adductors: 'Adductor / Groin', traps: 'Trapezius',
  neck: 'Neck', knees: 'Knee', shins: 'Shin', ankles: 'Ankle', feet: 'Foot',
  hands: 'Wrist / Hand', upperBack: 'Upper Back', lats: 'Lat',
  lowerBack: 'Lower Back', glutes: 'Glute', hamstrings: 'Hamstring',
};
`;

fs.writeFileSync('src/data/musclePaths.jsx', head + '\n' + block('MF','front') + '\n\n' + block('MB','back') + '\n' + tail);
console.error('wrote', fs.statSync('src/data/musclePaths.jsx').size, 'bytes');
