import React from "react"
// Demo data for prototype
export const TODAY_WORKOUT = {
  id: 'w-today',
  name: 'Lower Body Strength',
  duration: 52,
  intensity: 'High',
  exerciseCount: 6,
  status: 'ready',
  tag: 'PHASE_02',
};

// Date is YYYY-MM-DD; calendar uses month of April 2026 as a demo anchor
export const ASSIGNED_WORKOUTS = [
  { id: 'w1', name: 'Week 1 | Lower Day', date: '2026-04-28', dateLabel: 'Today', duration: 52, exercises: 6, status: 'ready', tag: 'STRENGTH', img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=70',
    description: "Hi Sarah, welcome to your programme. The exercises included today all leverage the lower muscles of your body.\n\nReps are in the \"hypertrophy zone\" (aiming for 8-12), and the weight should be manageable. Increase the reps and intensity as you progress.",
    equipment: ['Bike', 'Leg Press', 'Machine'],
    sections: [
      { kind: 'PULSE_RAISER', title: 'Pulse Raiser (Legs)', minutes: 5,
        intro: 'To begin, perform some light cardiovascular activity on the exercise bike - the pedalling motion will activate your hip and knee joints, priming your legs for additional load in your upcoming exercises.\n\nAim to burn approximately 50kcal before moving on to your pre-stretches and activation.',
        items: [
        { name: 'Exercise Bike',          target: '70 %HR · 117 bpm · 5 mins', load: '×1', img: 'https://images.unsplash.com/photo-1591741535018-d042766c62eb?w=400&q=70' },
      ]},
      { kind: 'BANDED', title: 'Banded Activation & Pre-Stretches (Legs)', minutes: 6,
        intro: 'Activate your glutes and stretch your hip flexors with these banded exercises before loading the joint. Keep tension on the band throughout each rep.',
        items: [
        { name: 'Banded Hip Opener',      target: '2 × 8/side',  load: '×2', img: 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=400&q=70' },
        { name: 'Banded Glute Activation',target: '2 × 12',      load: '×2', img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400&q=70' },
        { name: 'Banded Ankle Mobility',  target: '2 × 10/side', load: '×2', img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&q=70' },
      ]},
      { kind: 'MAIN', title: 'Workout', minutes: 35,
        intro: 'Your main lifts. Keep tempo controlled (3-X-1-X) - quality reps over quantity. Stop at RPE 8 and save fuel for tomorrow.',
        items: [
        { name: 'Back Squat',             target: '4 × 8',  load: '100kg' },
        { name: 'Romanian Deadlift',      target: '3 × 10', load: '80kg' },
        { name: 'Walking Lunges',         target: '3 × 12', load: '20kg' },
        { name: 'Leg Press',              target: '3 × 12', load: '140kg' },
        { name: 'Leg Curl',               target: '3 × 15', load: '40kg' },
        { name: 'Standing Calf Raise',    target: '4 × 15', load: 'BW+20' },
      ]},
      { kind: 'COOLDOWN', title: 'Cooldown', minutes: 6,
        intro: 'Drop your heart rate and lengthen the muscles you just trained. Slow nasal breathing throughout.',
        items: [
        { name: 'Couch Stretch',          target: '2 × 60s/side', load: '-' },
        { name: 'Pigeon Pose',            target: '2 × 60s/side', load: '-' },
        { name: 'Diaphragmatic Breathing',target: '5 min', load: '-' },
      ]},
    ],
    preview: [
      { name: 'Back Squat',           target: '4 × 8',  load: '100kg' },
      { name: 'Romanian Deadlift',    target: '3 × 10', load: '80kg' },
      { name: 'Walking Lunges',       target: '3 × 12', load: '20kg' },
      { name: 'Leg Press',            target: '3 × 12', load: '140kg' },
      { name: 'Leg Curl',             target: '3 × 15', load: '40kg' },
      { name: 'Standing Calf Raise',  target: '4 × 15', load: 'BW+20' },
    ] },
  { id: 'w2', name: 'Upper Push Power', date: '2026-04-29', dateLabel: 'Tomorrow', duration: 48, exercises: 7, status: 'scheduled', tag: 'STRENGTH', img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400&q=70',
    preview: [
      { name: 'Bench Press',          target: '5 × 5',  load: '85kg' },
      { name: 'Overhead Press',       target: '4 × 6',  load: '50kg' },
      { name: 'Incline DB Press',     target: '3 × 10', load: '24kg' },
      { name: 'Cable Fly',            target: '3 × 12', load: '15kg' },
      { name: 'Lateral Raise',        target: '4 × 15', load: '8kg' },
      { name: 'Tricep Pushdown',      target: '3 × 12', load: '25kg' },
      { name: 'Dips',                 target: '3 × AMRAP', load: 'BW' },
    ] },
  { id: 'w3', name: 'Zone 2 Recovery', date: '2026-04-30', dateLabel: 'Thu, Apr 30', duration: 35, exercises: 1, status: 'scheduled', tag: 'CARDIO', img: 'https://images.unsplash.com/photo-1483721310020-03333e577078?w=400&q=70',
    preview: [
      { name: 'Steady Run / Bike',    target: '35 min', load: 'Z2 · 130-145bpm' },
    ] },
  { id: 'w4', name: 'Pull & Posterior', date: '2026-05-01', dateLabel: 'Fri, May 1', duration: 55, exercises: 8, status: 'scheduled', tag: 'STRENGTH', img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&q=70',
    preview: [
      { name: 'Deadlift',             target: '4 × 5',  load: '130kg' },
      { name: 'Pull-up',              target: '4 × 8',  load: 'BW' },
      { name: 'Barbell Row',          target: '3 × 10', load: '70kg' },
      { name: 'Lat Pulldown',         target: '3 × 12', load: '55kg' },
      { name: 'Cable Row',            target: '3 × 12', load: '50kg' },
      { name: 'Face Pull',            target: '3 × 15', load: '20kg' },
      { name: 'Bicep Curl',           target: '3 × 12', load: '14kg' },
      { name: 'Hammer Curl',          target: '3 × 12', load: '12kg' },
    ] },
  { id: 'w5', name: 'Mobility Flow', date: '2026-05-03', dateLabel: 'Sun, May 3', duration: 25, exercises: 5, status: 'scheduled', tag: 'RECOVERY', img: 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=400&q=70',
    preview: [
      { name: 'Hip Flow',             target: '5 min',  load: '-' },
      { name: 'Thoracic Opener',      target: '5 min',  load: '-' },
      { name: 'Shoulder CARs',        target: '3 × 8',  load: '-' },
      { name: '90/90 Hip Switches',   target: '3 × 10', load: '-' },
      { name: "Couch Stretch",        target: '2 × 60s', load: '-' },
    ] },
  // historic
  { id: 'wh1', name: 'Upper Push Power', date: '2026-04-27', dateLabel: 'Yesterday', duration: 47, exercises: 7, status: 'completed', tag: 'STRENGTH', img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400&q=70', preview: [],
    result: { type: 'strength', completedAt: 'Apr 27 · 18:42', durationMin: 47, volumeKg: 8420, setsDone: 25, setsTotal: 25, avgRpe: 8, prs: ['Bench Press · 85kg × 3'],
      exercises: [
        { name: 'Bench Press', pr: true, sets: [{ w: 60, r: 8 }, { w: 80, r: 5 }, { w: 85, r: 3 }, { w: 85, r: 3 }, { w: 80, r: 4 }] },
        { name: 'Overhead Press', sets: [{ w: 40, r: 6 }, { w: 45, r: 6 }, { w: 50, r: 5 }, { w: 50, r: 4 }] },
        { name: 'Incline DB Press', sets: [{ w: 22, r: 10 }, { w: 24, r: 10 }, { w: 24, r: 9 }] },
        { name: 'Cable Fly', sets: [{ w: 15, r: 12 }, { w: 15, r: 12 }, { w: 15, r: 11 }] },
        { name: 'Lateral Raise', sets: [{ w: 8, r: 15 }, { w: 8, r: 14 }, { w: 8, r: 13 }, { w: 8, r: 12 }] },
        { name: 'Tricep Pushdown', sets: [{ w: 25, r: 12 }, { w: 25, r: 11 }, { w: 25, r: 10 }] },
        { name: 'Dips', sets: [{ w: 0, r: 12 }, { w: 0, r: 10 }, { w: 0, r: 8 }] },
      ] } },
  { id: 'wh2', name: 'Zone 2 Recovery', date: '2026-04-26', dateLabel: '2 days ago', duration: 35, exercises: 1, status: 'completed', tag: 'CARDIO', img: 'https://images.unsplash.com/photo-1483721310020-03333e577078?w=400&q=70', preview: [],
    result: { type: 'cardio', completedAt: 'Apr 26 · 07:30', durationMin: 35, distanceKm: 7.4, avgHr: 138, maxHr: 149, calories: 402, zoneLabel: 'Z2 · AEROBIC',
      splits: [{ km: 1, pace: '4:42' }, { km: 2, pace: '4:38' }, { km: 3, pace: '4:45' }, { km: 4, pace: '4:40' }, { km: 5, pace: '4:36' }, { km: 6, pace: '4:41' }, { km: 7, pace: '4:33' }] } },
  { id: 'wh3', name: 'Full Body Tempo', date: '2026-04-24', dateLabel: '4 days ago', duration: 51, exercises: 6, status: 'completed', tag: 'STRENGTH', img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&q=70', preview: [],
    result: { type: 'strength', completedAt: 'Apr 24 · 17:55', durationMin: 51, volumeKg: 9650, setsDone: 22, setsTotal: 24, avgRpe: 7, prs: [],
      exercises: [
        { name: 'Back Squat', sets: [{ w: 70, r: 8 }, { w: 90, r: 6 }, { w: 110, r: 5 }, { w: 110, r: 5 }] },
        { name: 'Bench Press', sets: [{ w: 60, r: 8 }, { w: 75, r: 6 }, { w: 80, r: 5 }] },
        { name: 'Barbell Row', sets: [{ w: 60, r: 10 }, { w: 70, r: 8 }, { w: 75, r: 8 }] },
        { name: 'Romanian Deadlift', sets: [{ w: 70, r: 10 }, { w: 85, r: 8 }, { w: 85, r: 8 }] },
        { name: 'Overhead Press', sets: [{ w: 40, r: 8 }, { w: 45, r: 6 }, { w: 45, r: 6 }] },
        { name: 'Plank', sets: [{ w: 0, r: 60 }, { w: 0, r: 60 }, { w: 0, r: 45 }] },
      ] } },
];

export const RECENT = [
  { name: 'Upper Push Power', when: 'Yesterday', duration: 47, badge: 'PR' },
  { name: 'Zone 2 Recovery', when: '2 days ago', duration: 35, badge: null },
  { name: 'Full Body Tempo', when: '4 days ago', duration: 51, badge: null },
];

// Active exercises - each has a phase: pulse | banded | main | cooldown
// alternatives is a list of swap options the user can pick instead.
export const ACTIVE_EXERCISES = [
  // ── PULSE RAISER ──────────────────────────────────────────────
  {
    id: 'p1', phase: 'pulse', name: 'Rower (Easy)', target: '5 min · low effort',
    rest: 30,
    img: 'https://images.unsplash.com/photo-1591741535018-d042766c62eb?w=600&q=70',
    coach: 'Build to 130bpm - nasal breathing only.',
    sets: [
      { reps: '5 min', kg: null, rpe: null, done: true, time: true },
    ],
    alternatives: [
      { id: 'p1a', name: 'Bike (Z2)',   target: '5 min',  reason: 'Knee-friendly' },
      { id: 'p1b', name: 'Skipping',    target: '3 × 60s',reason: 'No equipment' },
      { id: 'p1c', name: 'Treadmill',   target: '5 min',  reason: 'Standard' },
    ],
  },
  // ── BANDED STRETCHES ──────────────────────────────────────────
  {
    id: 'b1', phase: 'banded', name: 'Banded Hip Opener', target: '2 × 8 ea side', rest: 0, tempo: '2/1/2/0',
    img: 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=600&q=70',
    coach: 'Slow, controlled pulses - feel hip capsule open.',
    sets: [
      { reps: 8, kg: null, rpe: null, done: true, perSide: true },
      { reps: 8, kg: null, rpe: null, done: false, active: true, perSide: true },
    ],
    alternatives: [
      { id: 'b1a', name: '90/90 Hip Switch', target: '2 × 6 ea', reason: 'Lower intensity' },
      { id: 'b1b', name: 'World\'s Greatest', target: '2 × 5 ea',reason: 'Full body warm-up' },
    ],
  },
  {
    id: 'b2', phase: 'banded', name: 'Banded Pull-Apart', target: '2 × 12', rest: 0, tempo: '2/1/1/0',
    img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=600&q=70',
    coach: 'Squeeze shoulder blades - lock the rep at the back.',
    sets: [
      { reps: 12, kg: null, rpe: null, done: false, active: true },
      { reps: 12, kg: null, rpe: null, done: false },
    ],
    alternatives: [
      { id: 'b2a', name: 'Face Pull (light)', target: '2 × 12', reason: 'Cable variant' },
      { id: 'b2b', name: 'YTW Raise',         target: '2 × 8',  reason: 'Bodyweight' },
    ],
  },
  // ── MAIN WORK ────────────────────────────────────────────────
  {
    id: 'e1', phase: 'main', name: 'Back Squat', target: '4 × 8 @ 100kg', rest: 120, tempo: '3/1/1/0',
    img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=70',
    coach: 'Tempo 3-1-1. Stop at RPE 8 - save fuel for tomorrow.',
    sets: [
      { reps: 12, kg: 60, rpe: 1, done: true, kind: 'WARMUP' },
      { reps: 10, kg: 80, rpe: 2, done: true, kind: 'WARMUP' },
      { reps: 8, kg: 100, rpe: 3, done: true },
      { reps: 8, kg: 100, rpe: 3, done: false, active: true },
      { reps: 8, kg: 100, rpe: null, done: false },
      { reps: 12, kg: 70, rpe: null, done: false, kind: 'DROPSET' },
      { reps: 'AMRAP', kg: 100, rpe: null, done: false, kind: 'FAILURE' },
    ],
    alternatives: [
      { id: 'e1a', name: 'Front Squat',       target: '4 × 6',  reason: 'Quad emphasis · ↓ load' },
      { id: 'e1b', name: 'Goblet Squat',      target: '4 × 10', reason: 'Lower back rest day' },
      { id: 'e1c', name: 'Bulgarian Split Sq',target: '4 × 8 ea',reason: 'Single-leg / unilateral' },
      { id: 'e1d', name: 'Hack Squat',        target: '4 × 8',  reason: 'Machine alternative' },
    ],
  },
  {
    id: 'e2', phase: 'main', name: 'Romanian Deadlift', target: '3 × 10 @ 80kg', rest: 90, tempo: '3/0/1/0',
    img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&q=70',
    coach: 'Hinge from hips, neutral spine, light knee bend.',
    sets: [
      { reps: 10, kg: 80, rpe: null, done: false },
      { reps: 10, kg: 80, rpe: null, done: false },
      { reps: 10, kg: 80, rpe: null, done: false },
    ],
    alternatives: [
      { id: 'e2a', name: 'Single-Leg RDL', target: '3 × 8 ea', reason: 'Balance + stability' },
      { id: 'e2b', name: 'Good Morning',   target: '3 × 10',   reason: 'Lower-load alt' },
      { id: 'e2c', name: 'Hip Thrust',     target: '3 × 10',   reason: 'Glute focus' },
    ],
  },
  {
    id: 'e3', phase: 'main', name: 'Walking Lunges', target: '3 × 12 ea', rest: 60, tempo: '2/0/1/0',
    img: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=600&q=70',
    coach: 'Long stride, knee tracks toes. DBs at sides.',
    sets: [
      { reps: 12, kg: 20, rpe: null, done: false, perSide: true },
      { reps: 12, kg: 20, rpe: null, done: false, perSide: true },
      { reps: 12, kg: 20, rpe: null, done: false, perSide: true },
    ],
    alternatives: [
      { id: 'e3a', name: 'Reverse Lunge',  target: '3 × 10 ea', reason: 'Knee-friendly' },
      { id: 'e3b', name: 'Step-up',        target: '3 × 10 ea', reason: 'Box variant' },
      { id: 'e3c', name: 'Split Squat',    target: '3 × 10 ea', reason: 'Stationary' },
    ],
  },
  {
    id: 'e4', phase: 'main', name: 'Leg Press', target: '3 × 12 @ 140kg', rest: 90, tempo: '2/1/2/0',
    img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=600&q=70',
    coach: 'Feet shoulder-width, full ROM - no lockout.',
    sets: [
      { reps: 12, kg: 140, rpe: null, done: false },
      { reps: 12, kg: 140, rpe: null, done: false },
      { reps: 12, kg: 140, rpe: null, done: false },
    ],
    alternatives: [
      { id: 'e4a', name: 'Hack Squat',     target: '3 × 10', reason: 'Standing variant' },
      { id: 'e4b', name: 'Goblet Squat',   target: '3 × 12', reason: 'Free weight' },
    ],
  },
  // ── COOLDOWN ─────────────────────────────────────────────────
  {
    id: 'c1', phase: 'cooldown', name: 'Couch Stretch', target: '2 × 60s ea', rest: 0,
    img: 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=600&q=70',
    coach: 'Open hip flexors - squeeze glute, ribs down.',
    sets: [
      { reps: '60s', kg: null, rpe: null, done: false, time: true, perSide: true },
      { reps: '60s', kg: null, rpe: null, done: false, time: true, perSide: true },
    ],
    alternatives: [
      { id: 'c1a', name: 'Pigeon Pose', target: '2 × 60s ea', reason: 'Glute focus' },
      { id: 'c1b', name: 'Lizard Pose', target: '2 × 60s ea', reason: 'Deeper hip stretch' },
    ],
  },
  {
    id: 'c2', phase: 'cooldown', name: 'Box Breathing', target: '2 min · 4-4-4-4', rest: 0,
    img: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=70',
    coach: 'In 4 · hold 4 · out 4 · hold 4. Drop your HR before leaving.',
    sets: [
      { reps: '2 min', kg: null, rpe: null, done: false, time: true },
    ],
    alternatives: [
      { id: 'c2a', name: 'Diaphragm Breathing', target: '3 min', reason: 'Recovery focus' },
    ],
  },
];

export const PHASES = [
  { id: 'pulse',    label: 'Pulse',    accent: 'var(--c-coral)' },
  { id: 'banded',   label: 'Stretches', accent: 'var(--c-amber)' },
  { id: 'main',     label: 'Main',     accent: 'var(--accent)' },
  { id: 'cooldown', label: 'Cooldown', accent: 'var(--c-blue)' },
];

export const VOLUME_DATA = [
  { d: 'M', v: 4200 }, { d: 'T', v: 0 }, { d: 'W', v: 5800 },
  { d: 'T', v: 3400 }, { d: 'F', v: 6100 }, { d: 'S', v: 0 }, { d: 'S', v: 4500 },
];

export const PR_HISTORY = [
  { exercise: 'Back Squat', value: '120kg × 5', delta: '+5kg', when: '2 days ago' },
  { exercise: 'Bench Press', value: '85kg × 3', delta: '+2.5kg', when: '5 days ago' },
  { exercise: 'Deadlift', value: '140kg × 3', delta: '+5kg', when: '1 week ago' },
];

export const PROGRESS_LINE = [38, 42, 40, 48, 52, 51, 58, 62, 60, 68, 71, 75];

// Body metrics - manual + Apple Health
export const BODY_METRICS = {
  weight:    { label: 'Weight',    unit: 'kg',    value: 74.2,  delta: -0.8, deltaPct: -1.1, source: 'MANUAL', history: [76.4, 76.1, 75.8, 75.5, 75.2, 74.9, 74.6, 74.5, 74.4, 74.3, 74.2, 74.2] },
  bodyfat:   { label: 'Body fat',  unit: '%',     value: 14.2,  delta: -0.6, deltaPct: -4.1, source: 'MANUAL', history: [15.4, 15.2, 15.0, 14.9, 14.7, 14.6, 14.5, 14.4, 14.3, 14.3, 14.2, 14.2] },
  waist:     { label: 'Waist',     unit: 'cm',    value: 81.0,  delta: -1.2, deltaPct: -1.5, source: 'MANUAL', history: [83, 82.8, 82.5, 82.2, 82.0, 81.8, 81.6, 81.4, 81.3, 81.2, 81.0, 81.0] },
  neck:      { label: 'Neck',      unit: 'cm',    value: 38.5,  delta: 0.3,  deltaPct: 0.8,  source: 'MANUAL', history: [38.0,38.0,38.1,38.1,38.2,38.2,38.3,38.3,38.4,38.4,38.5,38.5] },
  chest:     { label: 'Chest',     unit: 'cm',    value: 102.0, delta: 1.4,  deltaPct: 1.4,  source: 'MANUAL', history: [99.8,100.0,100.3,100.6,100.9,101.1,101.3,101.5,101.7,101.8,101.9,102.0] },
  steps:     { label: 'Avg steps', unit: '/day',  value: 9842,  delta: 1240, deltaPct: 14.4, source: 'APPLE_HEALTH', history: [7600,7800,8100,8400,8700,9000,9200,9400,9600,9700,9800,9842] },
  restHr:    { label: 'Resting HR',unit: 'bpm',   value: 58,    delta: -2,   deltaPct: -3.3, source: 'APPLE_HEALTH', history: [62,62,61,61,60,60,59,59,58,58,58,58] },
  sleep:     { label: 'Sleep',     unit: 'h',     value: 7.4,   delta: 0.3,  deltaPct: 4.2,  source: 'APPLE_HEALTH', history: [6.8,6.9,7.0,7.0,7.1,7.2,7.2,7.3,7.3,7.4,7.4,7.4] },
};

// Exercise PR / performance history - for Weight metrics tab
// Each exercise belongs to a category (chest, back, legs, shoulders, arms, core).
// `pr` is true when the most recent session set a new max-weight PR.
export const EXERCISE_HISTORY = [
  // ── CHEST ─────────────────────────────────────────────────────────
  { id: 'bp', name: 'Bench Press', category: 'chest', muscle: 'Chest', pr: true,
    maxWeight: { value: 85, unit: 'kg', reps: 3, delta: '+2.5kg', when: '5 days ago' },
    maxReps:   { value: 10, weight: 70, when: '2 weeks ago' },
    history: [{ d: 'Mar 1', w: 75, r: 5 },{ d: 'Mar 8', w: 75, r: 6 },{ d: 'Mar 15', w: 77.5, r: 5 },{ d: 'Mar 22', w: 80, r: 5 },{ d: 'Mar 29', w: 80, r: 6 },{ d: 'Apr 5', w: 82.5, r: 4 },{ d: 'Apr 12', w: 82.5, r: 5 },{ d: 'Apr 19', w: 85, r: 3 },{ d: 'Apr 26', w: 85, r: 3 }] },
  { id: 'idp', name: 'Incline DB Press', category: 'chest', muscle: 'Upper Chest', pr: false,
    maxWeight: { value: 30, unit: 'kg', reps: 8, delta: '+2kg', when: '2 weeks ago' },
    maxReps:   { value: 12, weight: 24, when: '3 weeks ago' },
    history: [{ d: 'Mar 1', w: 24, r: 10 },{ d: 'Mar 15', w: 26, r: 8 },{ d: 'Mar 29', w: 28, r: 8 },{ d: 'Apr 12', w: 30, r: 8 },{ d: 'Apr 26', w: 30, r: 8 }] },
  { id: 'cf', name: 'Cable Fly', category: 'chest', muscle: 'Chest', pr: false,
    maxWeight: { value: 18, unit: 'kg', reps: 12, delta: '+1kg', when: '1 week ago' },
    maxReps:   { value: 15, weight: 15, when: '2 weeks ago' },
    history: [{ d: 'Mar 1', w: 14, r: 12 },{ d: 'Mar 15', w: 15, r: 12 },{ d: 'Mar 29', w: 16, r: 12 },{ d: 'Apr 12', w: 17, r: 12 },{ d: 'Apr 26', w: 18, r: 12 }] },

  // ── BACK ──────────────────────────────────────────────────────────
  { id: 'dl', name: 'Deadlift', category: 'back', muscle: 'Lower Back', pr: false,
    maxWeight: { value: 140, unit: 'kg', reps: 3, delta: '+5kg', when: '1 week ago' },
    maxReps:   { value: 8, weight: 120, when: '3 weeks ago' },
    history: [{ d: 'Mar 1', w: 120, r: 5 },{ d: 'Mar 15', w: 125, r: 5 },{ d: 'Mar 29', w: 130, r: 4 },{ d: 'Apr 12', w: 135, r: 3 },{ d: 'Apr 19', w: 140, r: 3 },{ d: 'Apr 26', w: 140, r: 3 }] },
  { id: 'pu', name: 'Pull-up', category: 'back', muscle: 'Lats', pr: true,
    maxWeight: { value: 20, unit: 'kg', reps: 5, delta: '+2.5kg', when: '3 days ago' },
    maxReps:   { value: 14, weight: 0, when: '1 week ago' },
    history: [{ d: 'Mar 1', w: 0, r: 8 },{ d: 'Mar 15', w: 10, r: 6 },{ d: 'Mar 29', w: 15, r: 5 },{ d: 'Apr 12', w: 17.5, r: 5 },{ d: 'Apr 26', w: 20, r: 5 }] },
  { id: 'br', name: 'Barbell Row', category: 'back', muscle: 'Mid Back', pr: false,
    maxWeight: { value: 80, unit: 'kg', reps: 8, delta: '+2.5kg', when: '2 weeks ago' },
    maxReps:   { value: 12, weight: 70, when: '1 month ago' },
    history: [{ d: 'Mar 1', w: 70, r: 10 },{ d: 'Mar 15', w: 72.5, r: 10 },{ d: 'Mar 29', w: 75, r: 8 },{ d: 'Apr 12', w: 80, r: 8 },{ d: 'Apr 26', w: 80, r: 8 }] },
  { id: 'lp', name: 'Lat Pulldown', category: 'back', muscle: 'Lats', pr: false,
    maxWeight: { value: 60, unit: 'kg', reps: 10, delta: '+2.5kg', when: '2 weeks ago' },
    maxReps:   { value: 14, weight: 50, when: '3 weeks ago' },
    history: [{ d: 'Mar 1', w: 50, r: 12 },{ d: 'Mar 15', w: 55, r: 10 },{ d: 'Mar 29', w: 57.5, r: 10 },{ d: 'Apr 12', w: 60, r: 10 },{ d: 'Apr 26', w: 60, r: 10 }] },

  // ── LEGS ──────────────────────────────────────────────────────────
  { id: 'sq', name: 'Back Squat', category: 'legs', muscle: 'Quads', pr: true,
    maxWeight: { value: 120, unit: 'kg', reps: 5, delta: '+5kg', when: '2 days ago' },
    maxReps:   { value: 12,  weight: 100, when: '1 week ago' },
    history: [{ d: 'Mar 1', w: 100, r: 5 },{ d: 'Mar 8', w: 105, r: 5 },{ d: 'Mar 15', w: 105, r: 6 },{ d: 'Mar 22', w: 110, r: 5 },{ d: 'Mar 29', w: 110, r: 6 },{ d: 'Apr 5', w: 115, r: 5 },{ d: 'Apr 12', w: 115, r: 6 },{ d: 'Apr 19', w: 120, r: 5 },{ d: 'Apr 26', w: 120, r: 5 }] },
  { id: 'rdl', name: 'Romanian Deadlift', category: 'legs', muscle: 'Hamstrings', pr: false,
    maxWeight: { value: 90, unit: 'kg', reps: 8, delta: '+5kg', when: '1 week ago' },
    maxReps:   { value: 12, weight: 80, when: '2 weeks ago' },
    history: [{ d: 'Mar 1', w: 75, r: 10 },{ d: 'Mar 15', w: 80, r: 10 },{ d: 'Mar 29', w: 85, r: 8 },{ d: 'Apr 12', w: 90, r: 8 },{ d: 'Apr 26', w: 90, r: 8 }] },
  { id: 'lpr', name: 'Leg Press', category: 'legs', muscle: 'Quads', pr: false,
    maxWeight: { value: 160, unit: 'kg', reps: 10, delta: '+10kg', when: '2 weeks ago' },
    maxReps:   { value: 15, weight: 140, when: '3 weeks ago' },
    history: [{ d: 'Mar 1', w: 130, r: 12 },{ d: 'Mar 15', w: 140, r: 12 },{ d: 'Mar 29', w: 150, r: 10 },{ d: 'Apr 12', w: 160, r: 10 },{ d: 'Apr 26', w: 160, r: 10 }] },
  { id: 'cr', name: 'Standing Calf Raise', category: 'legs', muscle: 'Calves', pr: false,
    maxWeight: { value: 70, unit: 'kg', reps: 12, delta: '+5kg', when: '3 weeks ago' },
    maxReps:   { value: 20, weight: 50, when: '1 month ago' },
    history: [{ d: 'Mar 1', w: 50, r: 15 },{ d: 'Mar 15', w: 60, r: 12 },{ d: 'Mar 29', w: 65, r: 12 },{ d: 'Apr 12', w: 70, r: 12 },{ d: 'Apr 26', w: 70, r: 12 }] },

  // ── SHOULDERS ─────────────────────────────────────────────────────
  { id: 'op', name: 'Overhead Press', category: 'shoulders', muscle: 'Shoulders', pr: false,
    maxWeight: { value: 50, unit: 'kg', reps: 5, delta: '+2.5kg', when: '2 weeks ago' },
    maxReps:   { value: 10, weight: 40, when: '1 month ago' },
    history: [{ d: 'Mar 1', w: 42.5, r: 5 },{ d: 'Mar 15', w: 45, r: 5 },{ d: 'Mar 29', w: 47.5, r: 4 },{ d: 'Apr 12', w: 50, r: 5 },{ d: 'Apr 26', w: 50, r: 5 }] },
  { id: 'lr', name: 'Lateral Raise', category: 'shoulders', muscle: 'Side Delts', pr: true,
    maxWeight: { value: 12, unit: 'kg', reps: 12, delta: '+2kg', when: '4 days ago' },
    maxReps:   { value: 15, weight: 10, when: '2 weeks ago' },
    history: [{ d: 'Mar 1', w: 8, r: 12 },{ d: 'Mar 15', w: 10, r: 12 },{ d: 'Mar 29', w: 10, r: 15 },{ d: 'Apr 12', w: 11, r: 12 },{ d: 'Apr 26', w: 12, r: 12 }] },
  { id: 'fp', name: 'Face Pull', category: 'shoulders', muscle: 'Rear Delts', pr: false,
    maxWeight: { value: 25, unit: 'kg', reps: 15, delta: '+2.5kg', when: '1 week ago' },
    maxReps:   { value: 18, weight: 20, when: '2 weeks ago' },
    history: [{ d: 'Mar 1', w: 18, r: 15 },{ d: 'Mar 15', w: 20, r: 15 },{ d: 'Mar 29', w: 22.5, r: 15 },{ d: 'Apr 12', w: 25, r: 15 },{ d: 'Apr 26', w: 25, r: 15 }] },

  // ── ARMS ──────────────────────────────────────────────────────────
  { id: 'bc', name: 'Bicep Curl', category: 'arms', muscle: 'Biceps', pr: false,
    maxWeight: { value: 16, unit: 'kg', reps: 10, delta: '+2kg', when: '1 week ago' },
    maxReps:   { value: 14, weight: 12, when: '3 weeks ago' },
    history: [{ d: 'Mar 1', w: 12, r: 12 },{ d: 'Mar 15', w: 14, r: 10 },{ d: 'Mar 29', w: 14, r: 12 },{ d: 'Apr 12', w: 16, r: 10 },{ d: 'Apr 26', w: 16, r: 10 }] },
  { id: 'hc', name: 'Hammer Curl', category: 'arms', muscle: 'Biceps', pr: false,
    maxWeight: { value: 14, unit: 'kg', reps: 10, delta: '+2kg', when: '2 weeks ago' },
    maxReps:   { value: 12, weight: 12, when: '3 weeks ago' },
    history: [{ d: 'Mar 1', w: 10, r: 12 },{ d: 'Mar 15', w: 12, r: 10 },{ d: 'Mar 29', w: 12, r: 12 },{ d: 'Apr 12', w: 14, r: 10 },{ d: 'Apr 26', w: 14, r: 10 }] },
  { id: 'tp', name: 'Tricep Pushdown', category: 'arms', muscle: 'Triceps', pr: false,
    maxWeight: { value: 30, unit: 'kg', reps: 10, delta: '+2.5kg', when: '2 weeks ago' },
    maxReps:   { value: 15, weight: 25, when: '3 weeks ago' },
    history: [{ d: 'Mar 1', w: 22.5, r: 12 },{ d: 'Mar 15', w: 25, r: 12 },{ d: 'Mar 29', w: 27.5, r: 10 },{ d: 'Apr 12', w: 30, r: 10 },{ d: 'Apr 26', w: 30, r: 10 }] },

  // ── CORE ──────────────────────────────────────────────────────────
  { id: 'pl', name: 'Plank', category: 'core', muscle: 'Abs', pr: false,
    maxWeight: { value: 0, unit: 's', reps: 90, delta: '+10s', when: '1 week ago' },
    maxReps:   { value: 90, weight: 0, when: '1 week ago' },
    history: [{ d: 'Mar 1', w: 0, r: 60 },{ d: 'Mar 15', w: 0, r: 70 },{ d: 'Mar 29', w: 0, r: 80 },{ d: 'Apr 12', w: 0, r: 85 },{ d: 'Apr 26', w: 0, r: 90 }] },
  { id: 'cw', name: 'Cable Woodchop', category: 'core', muscle: 'Obliques', pr: false,
    maxWeight: { value: 25, unit: 'kg', reps: 12, delta: '+2.5kg', when: '2 weeks ago' },
    maxReps:   { value: 15, weight: 20, when: '3 weeks ago' },
    history: [{ d: 'Mar 1', w: 18, r: 12 },{ d: 'Mar 15', w: 20, r: 12 },{ d: 'Mar 29', w: 22.5, r: 12 },{ d: 'Apr 12', w: 25, r: 12 },{ d: 'Apr 26', w: 25, r: 12 }] },
];

// Categories - ordered, with metadata for cards
export const EXERCISE_CATEGORIES = [
  { id: 'chest',     label: 'Chest',     icon: '◢',  accent: 'var(--accent)' },
  { id: 'back',      label: 'Back',      icon: '◣',  accent: 'var(--purple)' },
  { id: 'legs',      label: 'Legs',      icon: '▼',  accent: 'var(--lime)' },
  { id: 'shoulders', label: 'Shoulders', icon: '◆',  accent: 'var(--pink)' },
  { id: 'arms',      label: 'Arms',      icon: '✕',  accent: 'var(--warn)' },
  { id: 'core',      label: 'Core',      icon: '◯',  accent: 'var(--good)' },
];

// Per-muscle-group volume worked (sets) - last 7 / 30 / 90 days.
// Drives the muscle-map heatmap. Group keys map to anatomical regions.
export const MUSCLE_VOLUME = {
  '7d': {
    chest:      { sets: 18, reps: 142, kg: 8400,  sessions: 2, lastWorked: '5 days ago' },
    upperBack:  { sets: 22, reps: 168, kg: 9100,  sessions: 2, lastWorked: '4 days ago' },
    lats:       { sets: 14, reps: 96,  kg: 5200,  sessions: 2, lastWorked: '4 days ago' },
    lowerBack:  { sets: 8,  reps: 28,  kg: 4200,  sessions: 1, lastWorked: '6 days ago' },
    shoulders:  { sets: 12, reps: 88,  kg: 3600,  sessions: 2, lastWorked: '5 days ago' },
    biceps:     { sets: 6,  reps: 64,  kg: 1280,  sessions: 1, lastWorked: '6 days ago' },
    triceps:    { sets: 6,  reps: 60,  kg: 1620,  sessions: 1, lastWorked: '5 days ago' },
    abs:        { sets: 4,  reps: 40,  kg: 0,     sessions: 1, lastWorked: '3 days ago' },
    obliques:   { sets: 3,  reps: 36,  kg: 720,   sessions: 1, lastWorked: '3 days ago' },
    quads:      { sets: 14, reps: 112, kg: 13200, sessions: 1, lastWorked: 'Today' },
    hamstrings: { sets: 10, reps: 78,  kg: 7600,  sessions: 1, lastWorked: 'Today' },
    glutes:     { sets: 12, reps: 96,  kg: 9800,  sessions: 1, lastWorked: 'Today' },
    calves:     { sets: 6,  reps: 90,  kg: 4200,  sessions: 1, lastWorked: 'Today' },
    forearms:   { sets: 2,  reps: 24,  kg: 320,   sessions: 1, lastWorked: '6 days ago' },
  },
  '30d': {
    chest:      { sets: 64, reps: 512, kg: 31000, sessions: 8,  lastWorked: '5 days ago' },
    upperBack:  { sets: 72, reps: 540, kg: 30200, sessions: 8,  lastWorked: '4 days ago' },
    lats:       { sets: 56, reps: 384, kg: 21000, sessions: 8,  lastWorked: '4 days ago' },
    lowerBack:  { sets: 24, reps: 84,  kg: 13800, sessions: 4,  lastWorked: '6 days ago' },
    shoulders:  { sets: 48, reps: 352, kg: 14400, sessions: 8,  lastWorked: '5 days ago' },
    biceps:     { sets: 22, reps: 232, kg: 4600,  sessions: 4,  lastWorked: '6 days ago' },
    triceps:    { sets: 24, reps: 240, kg: 6400,  sessions: 4,  lastWorked: '5 days ago' },
    abs:        { sets: 16, reps: 160, kg: 0,     sessions: 4,  lastWorked: '3 days ago' },
    obliques:   { sets: 12, reps: 144, kg: 2880,  sessions: 4,  lastWorked: '3 days ago' },
    quads:      { sets: 56, reps: 448, kg: 52800, sessions: 4,  lastWorked: 'Today' },
    hamstrings: { sets: 40, reps: 312, kg: 30400, sessions: 4,  lastWorked: 'Today' },
    glutes:     { sets: 48, reps: 384, kg: 39200, sessions: 4,  lastWorked: 'Today' },
    calves:     { sets: 24, reps: 360, kg: 16800, sessions: 4,  lastWorked: 'Today' },
    forearms:   { sets: 8,  reps: 96,  kg: 1280,  sessions: 4,  lastWorked: '6 days ago' },
  },
  '90d': {
    chest:      { sets: 184, reps: 1472, kg: 88000,  sessions: 24, lastWorked: '5 days ago' },
    upperBack:  { sets: 208, reps: 1560, kg: 86400,  sessions: 24, lastWorked: '4 days ago' },
    lats:       { sets: 168, reps: 1152, kg: 60200,  sessions: 24, lastWorked: '4 days ago' },
    lowerBack:  { sets: 72,  reps: 252,  kg: 39600,  sessions: 12, lastWorked: '6 days ago' },
    shoulders:  { sets: 144, reps: 1056, kg: 42400,  sessions: 24, lastWorked: '5 days ago' },
    biceps:     { sets: 66,  reps: 696,  kg: 13800,  sessions: 12, lastWorked: '6 days ago' },
    triceps:    { sets: 72,  reps: 720,  kg: 19200,  sessions: 12, lastWorked: '5 days ago' },
    abs:        { sets: 48,  reps: 480,  kg: 0,      sessions: 12, lastWorked: '3 days ago' },
    obliques:   { sets: 36,  reps: 432,  kg: 8640,   sessions: 12, lastWorked: '3 days ago' },
    quads:      { sets: 168, reps: 1344, kg: 156000, sessions: 12, lastWorked: 'Today' },
    hamstrings: { sets: 120, reps: 936,  kg: 89600,  sessions: 12, lastWorked: 'Today' },
    glutes:     { sets: 144, reps: 1152, kg: 116800, sessions: 12, lastWorked: 'Today' },
    calves:     { sets: 72,  reps: 1080, kg: 49600,  sessions: 12, lastWorked: 'Today' },
    forearms:   { sets: 24,  reps: 288,  kg: 3840,   sessions: 12, lastWorked: '6 days ago' },
  },
};

export const MUSCLE_LABELS = {
  chest: 'Chest', upperBack: 'Upper Back', lats: 'Lats', lowerBack: 'Lower Back',
  shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
  abs: 'Abs', obliques: 'Obliques', quads: 'Quads',
  hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', forearms: 'Forearms',
};

export const RECIPES_SEED = [
  { id: 'r1', title: 'Steak & Sweet Potato Bowl', kcal: 620, protein: 48, carbs: 52, fats: 22, time: 25, tag: 'POST-WORKOUT', img: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=70' },
  { id: 'r2', title: 'Greek Yogurt Power Bowl',  kcal: 380, protein: 32, carbs: 38, fats: 10, time: 5,  tag: 'BREAKFAST',   img: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&q=70' },
  { id: 'r3', title: 'Salmon Teriyaki & Rice',   kcal: 540, protein: 42, carbs: 58, fats: 18, time: 30, tag: 'DINNER',      img: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600&q=70' },
  { id: 'r4', title: 'Overnight Oats',           kcal: 420, protein: 22, carbs: 64, fats: 12, time: 5,  tag: 'BREAKFAST',   img: 'https://images.unsplash.com/photo-1517673132405-a56a62b18caf?w=600&q=70' },
];

export const GUIDES_SEED = [
  { id: 'g1', title: 'Hip Mobility Routine',          kind: 'GUIDE',   minutes: 8,  category: 'MOBILITY', img: 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=600&q=70' },
  { id: 'g2', title: 'How to Brace for Heavy Squats', kind: 'VIDEO',   minutes: 6,  category: 'TECHNIQUE', img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=70' },
  { id: 'g3', title: 'Sleep & Recovery Protocols',    kind: 'ARTICLE', minutes: 10, category: 'RECOVERY', img: 'https://images.unsplash.com/photo-1520206183501-b80df61043c2?w=600&q=70' },
  { id: 'g4', title: 'Progressive Overload Basics',   kind: 'ARTICLE', minutes: 7,  category: 'PROGRAMMING', img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&q=70' },
];

// ── COACH (PT-side) DATA ──────────────────────────────────────────
// adherence: last-7-day completion 0..1 per day; adherence[6] is today
// status: on-track | needs-attention | inactive | new
export const COACH_PROFILE = {
  name: 'Harrison Stock',
  handle: '@coach.hs',
  clientsActive: 14,
  clientsTotal: 16,
};

export const COACH_CLIENTS = [
  { id: 'c1', name: 'Sarah Chen',      initials: 'SC', accent: 'var(--accent)',     programme: 'Hypertrophy 16', phaseLabel: 'P2 · Build · Wk 1/4', adherence: [1,1,0,1,1,1,1], lastSeen: '2h ago',  status: 'on-track',       streak: 4, prsThisWeek: 1, sessionsThisWeek: 3, sessionsTarget: 5 },
  { id: 'c2', name: 'Marcus Webb',     initials: 'MW', accent: 'var(--accent-2)',   programme: 'Power Build',    phaseLabel: 'P3 · Peak · Wk 2/4',  adherence: [1,0,1,1,1,0,1], lastSeen: 'Today',   status: 'on-track',       streak: 6, prsThisWeek: 2, sessionsThisWeek: 4, sessionsTarget: 4 },
  { id: 'c3', name: 'Priya Anand',     initials: 'PA', accent: 'var(--c-coral)',    programme: 'Foundations',    phaseLabel: 'P1 · Onboard · Wk 2/4',adherence: [1,0,0,1,0,0,0], lastSeen: '3d ago',  status: 'needs-attention', streak: 0, prsThisWeek: 0, sessionsThisWeek: 1, sessionsTarget: 3 },
  { id: 'c4', name: 'Jonas Berg',      initials: 'JB', accent: 'var(--c-amber)',    programme: 'Off-Season',     phaseLabel: 'P2 · Conditioning · Wk 3/6', adherence: [1,1,1,1,1,1,0], lastSeen: 'Yesterday',status: 'on-track',     streak: 9, prsThisWeek: 0, sessionsThisWeek: 4, sessionsTarget: 5 },
  { id: 'c5', name: 'Aisha Khan',      initials: 'AK', accent: 'var(--c-blue)',     programme: 'Postpartum Return', phaseLabel: 'P1 · Reactivate · Wk 4/4', adherence: [1,1,1,0,1,1,1], lastSeen: 'Today', status: 'on-track',     streak: 5, prsThisWeek: 1, sessionsThisWeek: 3, sessionsTarget: 3 },
  { id: 'c6', name: 'Diego Ramos',     initials: 'DR', accent: 'var(--c-pink)',     programme: 'Hypertrophy 16', phaseLabel: 'P2 · Build · Wk 1/4', adherence: [0,0,0,0,0,0,0], lastSeen: '11d ago', status: 'inactive',       streak: 0, prsThisWeek: 0, sessionsThisWeek: 0, sessionsTarget: 5 },
  { id: 'c7', name: 'Lin Park',        initials: 'LP', accent: 'var(--c-salmon)',   programme: 'Power Build',    phaseLabel: 'P3 · Peak · Wk 4/4',  adherence: [1,1,1,1,1,0,1], lastSeen: 'Today',   status: 'on-track',       streak: 3, prsThisWeek: 1, sessionsThisWeek: 4, sessionsTarget: 4 },
  { id: 'c8', name: 'Noah Foster',     initials: 'NF', accent: 'var(--c-slate)',    programme: 'Hypertrophy 16', phaseLabel: 'P2 · Build · Wk 2/4', adherence: [1,0,1,1,0,1,1], lastSeen: 'Yesterday',status: 'on-track',     streak: 2, prsThisWeek: 0, sessionsThisWeek: 3, sessionsTarget: 5 },
  { id: 'c9', name: 'Emily Hart',      initials: 'EH', accent: 'var(--accent)',     programme: 'Foundations',    phaseLabel: 'P1 · Onboard · Wk 1/4',adherence: [0,1,1,1,1,1,1], lastSeen: 'Today',   status: 'new',            streak: 5, prsThisWeek: 0, sessionsThisWeek: 3, sessionsTarget: 3 },
  { id: 'c10',name: 'Ravi Patel',      initials: 'RP', accent: 'var(--accent-2)',   programme: 'Off-Season',     phaseLabel: 'P2 · Conditioning · Wk 1/6', adherence: [1,1,0,1,1,1,0], lastSeen: 'Today',   status: 'on-track',       streak: 2, prsThisWeek: 0, sessionsThisWeek: 3, sessionsTarget: 5 },
];

// Today's coaching schedule (sessions to deliver/review)
export const COACH_SCHEDULE = [
  { id: 's1', time: '06:30', client: 'Marcus Webb',  clientId: 'c2', kind: 'LIVE_PT',  duration: 60, status: 'done',     note: 'Bench PR ✓' },
  { id: 's2', time: '07:30', client: 'Sarah Chen',   clientId: 'c1', kind: 'CHECK_IN', duration: 15, status: 'live',     note: 'Form review video uploaded' },
  { id: 's3', time: '09:00', client: 'Aisha Khan',   clientId: 'c5', kind: 'LIVE_PT',  duration: 45, status: 'upcoming', note: 'Postnatal - reduce load 10%' },
  { id: 's4', time: '11:00', client: 'Lin Park',     clientId: 'c7', kind: 'REVIEW',   duration: 20, status: 'upcoming', note: 'Peak week - log review' },
  { id: 's5', time: '15:30', client: 'Noah Foster',  clientId: 'c8', kind: 'LIVE_PT',  duration: 60, status: 'upcoming', note: 'Programme catchup' },
  { id: 's6', time: '17:00', client: 'Emily Hart',   clientId: 'c9', kind: 'INTAKE',   duration: 30, status: 'upcoming', note: 'Onboarding · goal setting' },
];

// Programme templates the coach owns
export const COACH_PROGRAMMES = [
  { id: 'pg1', name: 'Hypertrophy 16',    weeks: 16, phases: 4, clients: 6, lastEdited: '3d ago',  tag: 'STRENGTH',
    phaseList: [
      { name: 'Foundation',         weeks: 4, focus: 'Volume tolerance' },
      { name: 'Build',              weeks: 4, focus: 'Progressive overload' },
      { name: 'Peak',               weeks: 4, focus: 'Intensity push' },
      { name: 'Deload',             weeks: 4, focus: 'Recovery + retest' },
    ] },
  { id: 'pg2', name: 'Power Build',       weeks: 12, phases: 3, clients: 4, lastEdited: '6d ago',  tag: 'STRENGTH',
    phaseList: [
      { name: 'Hypertrophy Accum.', weeks: 4, focus: 'Volume base' },
      { name: 'Strength Intensif.', weeks: 4, focus: 'Heavy compound triples' },
      { name: 'Peak & Test',        weeks: 4, focus: '1RM windows' },
    ] },
  { id: 'pg3', name: 'Foundations',       weeks: 4,  phases: 1, clients: 2, lastEdited: '1d ago',  tag: 'ONBOARD',
    phaseList: [
      { name: 'Movement Onboard',   weeks: 4, focus: 'Pattern grooving' },
    ] },
  { id: 'pg4', name: 'Off-Season',        weeks: 24, phases: 4, clients: 2, lastEdited: '2w ago',  tag: 'SPORT',
    phaseList: [
      { name: 'GPP',                weeks: 6, focus: 'Work capacity' },
      { name: 'Conditioning',       weeks: 6, focus: 'Aerobic + lactate' },
      { name: 'Strength Block',     weeks: 6, focus: 'Compound strength' },
      { name: 'Pre-Season Taper',   weeks: 6, focus: 'Speed + maintain' },
    ] },
  { id: 'pg5', name: 'Postpartum Return', weeks: 8,  phases: 2, clients: 1, lastEdited: '4d ago',  tag: 'REHAB',
    phaseList: [
      { name: 'Reactivate',         weeks: 4, focus: 'Pelvic floor + breath' },
      { name: 'Restrength',         weeks: 4, focus: 'Compound build-up' },
    ] },
];

export const COACH_INBOX = [
  { id: 'm1', from: 'Sarah Chen',  initials: 'SC', accent: 'var(--accent)',     when: '2m',   unread: true,  preview: 'Hip felt stiff after squats - should I keep going Thurs?' },
  { id: 'm2', from: 'Priya Anand', initials: 'PA', accent: 'var(--c-coral)',    when: '47m',  unread: true,  preview: "Sorry - slammed at work, missed Mon + Wed. Can we replan?" },
  { id: 'm3', from: 'Jonas Berg',  initials: 'JB', accent: 'var(--c-amber)',    when: '2h',   unread: true,  preview: 'Hit 140kg deadlift @ 8 RPE 🎉 video attached' },
  { id: 'm4', from: 'Emily Hart',  initials: 'EH', accent: 'var(--accent)',     when: '5h',   unread: true,  preview: 'Form check please - split squat felt weird' },
  { id: 'm5', from: 'Aisha Khan',  initials: 'AK', accent: 'var(--c-blue)',     when: 'Yest', unread: false, preview: 'Done! Feeling strong - sleep was rough though' },
  { id: 'm6', from: 'Marcus Webb', initials: 'MW', accent: 'var(--accent-2)',   when: 'Yest', unread: false, preview: 'Pull session crushed - log uploaded' },
  { id: 'm7', from: 'Diego Ramos', initials: 'DR', accent: 'var(--c-pink)',     when: '4d',   unread: false, preview: "I'm so sorry - I'll be back next week, family stuff." },
];

// KPIs for coach dashboard hero row
export const COACH_KPIS = {
  activeClients: 14,
  sessionsToday: 6,
  prsThisWeek:   8,
  unreadMessages: 4,
};

// Athlete tasks shown on the dashboard. `kind:'form'` opens an in-app form.
export const TASKS = [
  { id: 't1', kind: 'form', icon: 'form', title: 'Weekly check-in form', sub: 'Due today · sleep, soreness, nutrition', done: false,
    form: {
      title: 'WEEKLY CHECK-IN',
      intro: 'Your coach reviews this every Monday to adjust your programme.',
      fields: [
        { id: 'weight', type: 'number', label: 'Bodyweight (kg)', placeholder: '72.5' },
        { id: 'sleep', type: 'scale', label: 'Sleep quality this week', min: 1, max: 5 },
        { id: 'soreness', type: 'scale', label: 'Muscle soreness', min: 1, max: 5 },
        { id: 'nutrition', type: 'choice', label: 'Nutrition adherence', options: ['On point', 'Mostly', 'Off track'] },
        { id: 'energy', type: 'choice', label: 'Energy levels', options: ['High', 'Moderate', 'Low'] },
        { id: 'notes', type: 'textarea', label: 'Anything else for your coach?', placeholder: 'Niggles, schedule changes, wins…' },
      ]
    } },
  { id: 't2', kind: 'action', icon: 'scale', title: 'Log your weigh-in', sub: 'Tuesday & Friday mornings', done: false },
  { id: 't3', kind: 'action', icon: 'camera', title: 'Upload progress photos', sub: 'Every 4 weeks · 2 weeks left', done: false },
  { id: 't4', kind: 'form', icon: 'doc', title: 'Sign training agreement', sub: 'Completed 12 Apr', done: true,
    form: { title: 'TRAINING AGREEMENT', intro: 'Already signed - view your agreement.', fields: [] } },
];

// Athlete-side notifications (bell on dashboard)
export const NOTIFICATIONS = [
  { id: 'n1', kind: 'coach',   when: '12m',  today: true, unread: true,  title: 'Harrison Stock', body: 'Great session yesterday - bumped your bench target to 87.5kg for next week. Keep the tempo controlled.' },
  { id: 'n2', kind: 'pr',      when: '1h',   today: true, unread: true,  title: 'New PR · Bench Press', body: 'You hit 85kg × 3 - a +2.5kg personal record. That\u2019s 3 PRs this month.' },
  { id: 'n3', kind: 'reminder',when: '3h',   today: true, unread: true,  title: 'Lower Day is ready', body: 'Today\u2019s session: Week 1 | Lower Day · 52 min · 6 exercises. Tap to preview.' },
  { id: 'n4', kind: 'achievement', when: 'Yesterday', today: false, unread: false, title: '4-day streak 🔥', body: 'Four sessions completed on schedule. Consistency is compounding - keep it going.' },
  { id: 'n5', kind: 'schedule',when: 'Yesterday', today: false, unread: false, title: 'Session rescheduled', body: 'Pull & Posterior moved to Fri, May 1 at your request.' },
  { id: 'n6', kind: 'coach',   when: '2d',   today: false, unread: false, title: 'Harrison Stock', body: 'Nice work logging your meals this week. Your protein average is up to 1.8g/kg - right where we want it.' },
  { id: 'n7', kind: 'health',  when: '3d',   today: false, unread: false, title: 'Recovery looking good', body: 'Resting HR down to 58bpm and sleep averaging 7.4h. Your body is adapting well to the volume.' },
];
