import React from 'react'
import { Hex, HexBackButton } from '../components/hex'
import { IconPlus, IconX2, IconCheck, IconPlay } from '../components/icons'
import {
  MODALITIES, MUSCLE_GROUPS, ALL_MUSCLES, MOVEMENT_PATTERNS, CATEGORIES, TRACKING_OPTIONS,
  saveExercise, deleteExercise, uploadExerciseImage, videoThumb,
} from '../lib/exercises'

const emptyDraft = () => ({
  id: null, name: '', modality: 'Strength', muscle_group: 'Shoulders',
  movement_pattern: 'Upper Body Vertical Push', category: 'Strength',
  tracking_fields: ['Weight', 'Reps'], muscles_worked: [], instructions: '', link_url: '',
  video_url: '', thumbnail_url: '', photos: [], banded: false, unilateral: false,
});

export function ExerciseBuilder({ trainerId, exercise, onClose, onSaved }) {
  const [d, setD] = React.useState(() => exercise ? hydrate(exercise) : emptyDraft());
  const [saving, setSaving]   = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const [trackMenu, setTrackMenu]   = React.useState(false);
  const [uploading, setUploading]   = React.useState(false);
  const thumbInput = React.useRef(null);
  const photoInput = React.useRef(null);

  const set = (patch) => setD(prev => ({ ...prev, ...patch }));
  const canSave = d.name.trim() !== '' && !saving;
  const autoThumb = d.thumbnail_url || videoThumb(d.video_url);

  const save = async (close) => {
    if (!canSave) return;
    setSaving(true);
    const res = await saveExercise(trainerId, d);
    setSaving(false);
    if (res.error) return;
    if (close) onSaved(); else { setD(prev => ({ ...prev, id: res.id })); onSaved(true); }
  };

  const remove = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    if (d.id) await deleteExercise(d.id);
    onSaved();
  };

  const addTracking = (f) => { if (!d.tracking_fields.includes(f)) set({ tracking_fields: [...d.tracking_fields, f] }); setTrackMenu(false); };
  const delTracking = (f) => set({ tracking_fields: d.tracking_fields.filter(x => x !== f) });
  const toggleMuscle = (k) => set({ muscles_worked: d.muscles_worked.includes(k) ? d.muscles_worked.filter(x => x !== k) : [...d.muscles_worked, k] });

  const pickThumb = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setUploading(true);
    const { url } = await uploadExerciseImage(trainerId, file);
    setUploading(false);
    if (url) set({ thumbnail_url: url });
  };
  const pickPhotos = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    const room = 4 - d.photos.length;
    const urls = [];
    for (const f of files.slice(0, room)) {
      const { url } = await uploadExerciseImage(trainerId, f);
      if (url) urls.push(url);
    }
    setUploading(false);
    if (urls.length) set({ photos: [...d.photos, ...urls] });
  };
  const delPhoto = (u) => set({ photos: d.photos.filter(x => x !== u) });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg-0)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-1)', flexShrink: 0 }}>
        <HexBackButton onClick={onClose} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label" style={{ marginBottom: 2 }}>// {d.id ? 'EDIT EXERCISE' : 'NEW EXERCISE'}</div>
          <div className="h-bold" style={{ fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.name.trim() || 'EXERCISE BUILDER'}
          </div>
        </div>
        <button onClick={() => save(false)} disabled={!canSave} className="btn-ghost" style={{ fontSize: 11, padding: '8px 12px', opacity: canSave ? 1 : 0.4 }}>SAVE</button>
        <button onClick={() => save(true)} disabled={!canSave} className="btn-primary" style={{ fontSize: 11, padding: '8px 12px', opacity: canSave ? 1 : 0.4 }}>SAVE & CLOSE</button>
      </div>

      {/* Two-pane body */}
      <div className="scroller" style={{ flex: 1, minHeight: 0, padding: 16 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* LEFT */}
          <div style={{ flex: '1 1 360px', minWidth: 0, display: 'grid', gap: 18 }}>
            <input value={d.name} onChange={e => set({ name: e.target.value })} placeholder="Exercise name"
              style={{ ...fieldSt, fontSize: 20, fontWeight: 700, padding: '12px 14px' }}/>

            <Section label="PRIMARY FOCUS">
              <DropRow label="Modality" value={d.modality} options={MODALITIES} onChange={v => set({ modality: v })}/>
              <DropRow label="Muscle group" value={d.muscle_group} options={MUSCLE_GROUPS} onChange={v => set({ muscle_group: v })}/>
              <DropRow label="Movement pattern" value={d.movement_pattern} options={MOVEMENT_PATTERNS} onChange={v => set({ movement_pattern: v })}/>
            </Section>

            <Section label="MUSCLES WORKED">
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 2 }}>
                Select every muscle this exercise trains — these light up the client's muscle map &amp; volume.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ALL_MUSCLES.map(m => {
                  const on = d.muscles_worked.includes(m.key);
                  return (
                    <button key={m.key} onClick={() => toggleMuscle(m.key)} style={{
                      all: 'unset', cursor: 'pointer', padding: '7px 11px', borderRadius: 999,
                      fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600,
                      background: on ? 'var(--accent-soft)' : 'var(--bg-2)',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                      color: on ? 'var(--accent)' : 'var(--text-3)',
                    }}>{on ? '✓ ' : ''}{m.label}</button>
                  );
                })}
              </div>
            </Section>

            <Section label="CATEGORY">
              <select value={d.category} onChange={e => set({ category: e.target.value })} style={{ ...fieldSt, appearance: 'auto' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              {/* Banded movement toggle — collects a band colour instead of weight */}
              <button onClick={() => set({ banded: !d.banded })} style={{
                all: 'unset', cursor: 'pointer', marginTop: 10,
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px',
                borderRadius: 10, background: 'var(--bg-2)',
                border: `1px solid ${d.banded ? 'var(--accent)' : 'var(--line)'}`,
              }}>
                <span style={{
                  width: 40, height: 24, borderRadius: 999, flexShrink: 0, position: 'relative',
                  background: d.banded ? 'var(--accent)' : 'var(--bg-3)',
                  border: `1px solid ${d.banded ? 'var(--accent)' : 'var(--line-strong)'}`, transition: 'background .15s',
                }}>
                  <span style={{
                    position: 'absolute', top: 2, left: d.banded ? 18 : 2, width: 18, height: 18, borderRadius: '50%',
                    background: d.banded ? 'var(--on-accent)' : 'var(--text-3)', transition: 'left .15s',
                  }}/>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: d.banded ? 'var(--accent)' : 'var(--text)' }}>Banded movement</div>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-3)', letterSpacing: '0.04em', marginTop: 2, lineHeight: 1.4 }}>
                    Collect a band colour (X-Light → X-Heavy) instead of a weight
                  </div>
                </div>
              </button>

              {/* Unilateral toggle — done one side at a time */}
              <button onClick={() => set({ unilateral: !d.unilateral })} style={{
                all: 'unset', cursor: 'pointer', marginTop: 10,
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px',
                borderRadius: 10, background: 'var(--bg-2)',
                border: `1px solid ${d.unilateral ? 'var(--accent)' : 'var(--line)'}`,
              }}>
                <span style={{
                  width: 40, height: 24, borderRadius: 999, flexShrink: 0, position: 'relative',
                  background: d.unilateral ? 'var(--accent)' : 'var(--bg-3)',
                  border: `1px solid ${d.unilateral ? 'var(--accent)' : 'var(--line-strong)'}`, transition: 'background .15s',
                }}>
                  <span style={{
                    position: 'absolute', top: 2, left: d.unilateral ? 18 : 2, width: 18, height: 18, borderRadius: '50%',
                    background: d.unilateral ? 'var(--on-accent)' : 'var(--text-3)', transition: 'left .15s',
                  }}/>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: d.unilateral ? 'var(--accent)' : 'var(--text)' }}>One side at a time</div>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-3)', letterSpacing: '0.04em', marginTop: 2, lineHeight: 1.4 }}>
                    Unilateral — reps are shown per side with an "EACH SIDE" badge
                  </div>
                </div>
              </button>

              <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--line)' }}>
                <div className="label" style={{ marginBottom: 8 }}>TRACKING FIELDS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', position: 'relative' }}>
                  {d.tracking_fields.map((f, i) => (
                    <span key={f} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '8px 10px', borderRadius: 8, background: 'var(--bg-3)', border: '1px solid var(--line-strong)',
                      fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 600,
                    }}>
                      <span style={{ color: 'var(--text-3)' }}>{i + 1}.</span> {f}
                      <button onClick={() => delTracking(f)} aria-label="Remove" style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)', display: 'grid', placeItems: 'center' }}><IconX2 size={11}/></button>
                    </span>
                  ))}
                  <button onClick={() => setTrackMenu(m => !m)} aria-label="Add tracking field" style={{
                    all: 'unset', cursor: 'pointer', width: 38, height: 38, borderRadius: 8,
                    border: '1px solid var(--line-strong)', background: 'var(--bg-3)', display: 'grid', placeItems: 'center', color: 'var(--accent)',
                  }}><IconPlus size={14}/></button>
                  {trackMenu && (
                    <>
                      <div onClick={() => setTrackMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }}/>
                      <div style={{
                        position: 'absolute', top: 44, right: 0, zIndex: 21, minWidth: 160,
                        background: 'var(--bg-3)', border: '1px solid var(--line-strong)', borderRadius: 10,
                        boxShadow: '0 8px 28px rgba(0,0,0,0.45)', padding: 6, display: 'grid', gap: 2, maxHeight: 240, overflow: 'auto',
                      }}>
                        {TRACKING_OPTIONS.filter(o => !d.tracking_fields.includes(o)).map(o => (
                          <button key={o} onClick={() => addTracking(o)} style={{
                            all: 'unset', cursor: 'pointer', padding: '9px 12px', borderRadius: 7,
                            fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--text)',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{o}</button>
                        ))}
                        {TRACKING_OPTIONS.filter(o => !d.tracking_fields.includes(o)).length === 0 &&
                          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', padding: 8 }}>All added</div>}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </Section>

            <div>
              <div className="label" style={{ marginBottom: 8 }}>INSTRUCTIONS <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(one step per line)</span></div>
              <textarea value={d.instructions} onChange={e => set({ instructions: e.target.value })} rows={5}
                placeholder={'Set the bar to shoulder height\nGrip slightly wider than shoulders\nPress overhead, control the descent'}
                style={{ ...fieldSt, resize: 'vertical', lineHeight: 1.6 }}/>
            </div>

            <div>
              <div className="label" style={{ marginBottom: 8 }}>ADD LINK</div>
              <input value={d.link_url} onChange={e => set({ link_url: e.target.value })} placeholder="https://… (article, study, demo)" style={fieldSt}/>
            </div>
          </div>

          {/* RIGHT — Media */}
          <div style={{ flex: '1 1 320px', minWidth: 0, display: 'grid', gap: 18 }}>
            <div className="h-bold" style={{ fontSize: 18 }}>MEDIA</div>

            <div>
              <div className="label" style={{ marginBottom: 8 }}>VIDEO</div>
              <input value={d.video_url} onChange={e => set({ video_url: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" style={fieldSt}/>
              {autoThumb && (
                <div style={{ position: 'relative', marginTop: 10, borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9', background: `url('${autoThumb}') center/cover, var(--bg-3)` }}>
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                    <Hex size={48} style={{ background: 'rgba(0,0,0,0.55)', color: '#eceff4' }}><IconPlay size={18}/></Hex>
                  </div>
                  {d.thumbnail_url && (
                    <button onClick={() => set({ thumbnail_url: '' })} aria-label="Remove thumbnail" style={{
                      position: 'absolute', top: 8, right: 8, all: 'unset', cursor: 'pointer',
                      width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#eceff4', display: 'grid', placeItems: 'center',
                    }}><IconX2 size={12}/></button>
                  )}
                </div>
              )}
              <input ref={thumbInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickThumb}/>
              <button onClick={() => thumbInput.current?.click()} className="btn-ghost"
                style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 11 }}>
                CHOOSE CUSTOM THUMBNAIL
              </button>
            </div>

            <div>
              <div className="label" style={{ marginBottom: 8 }}>PHOTOS</div>
              <input ref={photoInput} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={pickPhotos}/>
              {d.photos.length < 4 && (
                <button onClick={() => photoInput.current?.click()} style={{
                  all: 'unset', cursor: 'pointer', width: '100%', boxSizing: 'border-box',
                  padding: '24px 16px', borderRadius: 12, textAlign: 'center',
                  border: '1.5px dashed var(--line-strong)', background: 'var(--bg-2)',
                }}>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)', letterSpacing: '0.04em' }}>
                    {uploading ? 'UPLOADING…' : `Add up to ${4 - d.photos.length} image${4 - d.photos.length === 1 ? '' : 's'}`}
                  </div>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 4 }}>jpg · jpeg · png</div>
                </button>
              )}
              {d.photos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 10 }}>
                  {d.photos.map(u => (
                    <div key={u} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: `url('${u}') center/cover, var(--bg-3)`, border: '1px solid var(--line)' }}>
                      <button onClick={() => delPhoto(u)} aria-label="Remove photo" style={{
                        position: 'absolute', top: 3, right: 3, all: 'unset', cursor: 'pointer',
                        width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#eceff4', display: 'grid', placeItems: 'center',
                      }}><IconX2 size={10}/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {d.id && (
              <button onClick={remove} style={{
                all: 'unset', cursor: 'pointer', padding: '13px', borderRadius: 10, textAlign: 'center',
                background: 'transparent', marginTop: 4,
                border: `1px solid color-mix(in srgb, var(--c-coral) ${confirmDel ? 60 : 35}%, var(--line))`,
                color: confirmDel ? 'var(--c-coral)' : 'var(--text-3)',
                fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
              }}>{confirmDel ? 'CONFIRM DELETE — TAP AGAIN' : 'DELETE EXERCISE'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function hydrate(e) {
  return {
    id: e.id, name: e.name || '', modality: e.modality || 'Strength',
    muscle_group: e.muscle_group || '', movement_pattern: e.movement_pattern || '',
    category: e.category || 'Strength',
    tracking_fields: e.tracking_fields?.length ? [...e.tracking_fields] : ['Weight', 'Reps'],
    muscles_worked: e.muscles_worked ? [...e.muscles_worked] : [],
    instructions: e.instructions || '', link_url: e.link_url || '',
    video_url: e.video_url || '', thumbnail_url: e.thumbnail_url || '', photos: e.photos ? [...e.photos] : [],
    banded: !!e.banded, unilateral: !!e.unilateral,
  };
}

function Section({ label, children }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'grid', gap: 8 }}>{children}</div>
    </div>
  );
}

// A labelled row that doubles as a native select (label + chosen value).
function DropRow({ label, value, options, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8, position: 'relative',
      padding: '12px 14px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--line)', cursor: 'pointer',
    }}>
      <span className="mono" style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>{label}:</span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{value || '—'}</span>
      <span style={{ color: 'var(--text-3)' }}>▾</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

const fieldSt = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 10,
  padding: '11px 13px', color: 'var(--text)', outline: 'none',
  fontFamily: 'JetBrains Mono', fontSize: 13, lineHeight: 1.4,
};
