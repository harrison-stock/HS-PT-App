import React from 'react'
import { Hex, HexBackButton } from '../components/hex'
import { IconCheck, IconPlay, IconDoc } from '../components/icons'
import { GUIDE_KINDS, GUIDE_CATEGORIES, saveGuide, deleteGuide, uploadGuideImage } from '../lib/guides'
import { videoThumb } from '../lib/exercises'
import { FileDrop } from '../components/FileDrop'
import { toast } from '../lib/toast'

const emptyDraft = () => ({ id: null, title: '', kind: 'ARTICLE', category: 'TECHNIQUE', minutes: '', img: '', video: '', link: '', body: '', file: '', fileName: '' });

// Coach guide/article/video builder (mirrors the recipe maker).
export function GuideBuilder({ trainerId, guide, onClose, onSaved }) {
  const [d, setD] = React.useState(() => guide ? { ...emptyDraft(), ...guide, minutes: String(guide.minutes || '') } : emptyDraft());
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadingFile, setUploadingFile] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const imgInput = React.useRef(null);

  const set = (patch) => setD(prev => ({ ...prev, ...patch }));
  const canSave = d.title.trim() !== '' && !saving;
  const preview = d.img || videoThumb(d.video);

  const save = async (close) => {
    if (!canSave) return;
    setSaving(true);
    const res = await saveGuide(trainerId, d);
    setSaving(false);
    if (res.error) { toast('Could not save guide', { kind: 'error' }); return; }
    if (close) { toast(d.id ? 'Guide updated' : 'Guide added'); onSaved(); }
    else { setD(prev => ({ ...prev, id: res.id })); onSaved(true); }
  };
  const remove = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    if (d.id) await deleteGuide(d.id);
    toast('Guide deleted');
    onSaved();
  };
  const pickImg = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setUploading(true);
    const { url, error } = await uploadGuideImage(trainerId, file);
    setUploading(false);
    if (url) set({ img: url });
    else alert('Image upload failed - please try again.' + (error?.message ? `\n\n${error.message}` : ''));
  };
  const pickFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setUploadingFile(true);
    const { url, error } = await uploadGuideImage(trainerId, file);
    setUploadingFile(false);
    if (url) set({ file: url, fileName: file.name });
    else { toast('File upload failed', { kind: 'error' }); alert('File upload failed - please try again.' + (error?.message ? `\n\n${error.message}` : '')); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg-0)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-1)', flexShrink: 0 }}>
        <HexBackButton onClick={onClose} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label" style={{ marginBottom: 2 }}>// {d.id ? 'EDIT GUIDE' : 'NEW GUIDE'}</div>
          <div className="h-bold" style={{ fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title.trim() || 'GUIDE BUILDER'}</div>
        </div>
        <button onClick={() => save(false)} disabled={!canSave} className="btn-ghost" style={{ fontSize: 11, padding: '8px 12px', opacity: canSave ? 1 : 0.4 }}>SAVE</button>
        <button onClick={() => save(true)} disabled={!canSave} className="btn-primary" style={{ fontSize: 11, padding: '8px 12px', opacity: canSave ? 1 : 0.4 }}>SAVE & CLOSE</button>
      </div>

      <div className="scroller" style={{ flex: 1, minHeight: 0, padding: 16 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 360px', minWidth: 0, display: 'grid', gap: 16 }}>
            <input value={d.title} onChange={e => set({ title: e.target.value })} placeholder="Guide title"
              style={{ ...fieldSt, fontSize: 20, fontWeight: 700, padding: '12px 14px' }}/>

            <Field label="TYPE">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {GUIDE_KINDS.map(k => <Chip key={k} on={d.kind === k} onClick={() => set({ kind: k })}>{k}</Chip>)}
              </div>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="CATEGORY">
                <select value={d.category} onChange={e => set({ category: e.target.value })} style={{ ...fieldSt, appearance: 'auto' }}>
                  {GUIDE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="DURATION (MIN)">
                <input value={d.minutes} onChange={e => set({ minutes: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" placeholder="8" style={fieldSt}/>
              </Field>
            </div>

            <Field label="BODY / DESCRIPTION">
              <textarea value={d.body} onChange={e => set({ body: e.target.value })} rows={6} placeholder="Write the article, cues, or a short description…"
                style={{ ...fieldSt, resize: 'vertical', lineHeight: 1.6 }}/>
            </Field>

            <Field label="EXTERNAL LINK">
              <input value={d.link} onChange={e => set({ link: e.target.value })} placeholder="https://… (optional)" style={fieldSt}/>
            </Field>
          </div>

          <div style={{ flex: '1 1 300px', minWidth: 0, display: 'grid', gap: 16 }}>
            <div className="h-bold" style={{ fontSize: 18 }}>MEDIA</div>
            <Field label="VIDEO URL">
              <input value={d.video} onChange={e => set({ video: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" style={fieldSt}/>
            </Field>
            {preview && (
              <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9', background: `url('${preview}') center/cover, var(--bg-3)` }}>
                {d.video && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><Hex size={48} style={{ background: 'rgba(0,0,0,0.55)', color: '#eceff4' }}><IconPlay size={18}/></Hex></div>}
              </div>
            )}
            <Field label="COVER IMAGE">
              {!preview && <FileDrop onFiles={(files) => pickImg({ target: { files, value: '' } })} accept="image/*" busy={uploading} label="DRAG & DROP OR TAP TO UPLOAD" hint="JPG / PNG" />}
              <input value={d.img} onChange={e => set({ img: e.target.value })} placeholder="…or paste an image URL" style={{ ...fieldSt, marginTop: preview ? 0 : 8 }}/>
              {preview && (
                <button onClick={() => set({ img: '' })} className="btn-ghost" style={{ width: '100%', marginTop: 8, fontSize: 11, color: 'var(--c-coral)', borderColor: 'color-mix(in srgb, var(--c-coral) 40%, var(--line-strong))' }}>
                  REMOVE IMAGE
                </button>
              )}
            </Field>

            <Field label="ATTACHED FILE (PDF)">
              {!d.file && <FileDrop onFiles={(files) => pickFile({ target: { files, value: '' } })} accept="application/pdf,.pdf" busy={uploadingFile} label="DRAG & DROP OR TAP TO UPLOAD" hint="PDF" />}
              {d.file && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 10 }}>
                  <IconDoc size={18} />
                  <a href={d.file} target="_blank" rel="noopener" className="mono" style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>
                    {d.fileName || 'View file'}
                  </a>
                  <button onClick={() => set({ file: '', fileName: '' })} aria-label="Remove file" style={{ all: 'unset', cursor: 'pointer', color: 'var(--c-coral)', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>REMOVE</button>
                </div>
              )}
            </Field>

            {d.id && (
              <button onClick={remove} style={{
                all: 'unset', cursor: 'pointer', padding: '13px', borderRadius: 10, textAlign: 'center',
                border: `1px solid color-mix(in srgb, var(--c-coral) ${confirmDel ? 60 : 35}%, var(--line))`,
                color: confirmDel ? 'var(--c-coral)' : 'var(--text-3)',
                fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
              }}>{confirmDel ? 'CONFIRM DELETE - TAP AGAIN' : 'DELETE GUIDE'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <div><div className="label" style={{ marginBottom: 8 }}>{label}</div>{children}</div>;
}
function Chip({ on, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      all: 'unset', cursor: 'pointer', padding: '7px 12px', borderRadius: 999, fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
      background: on ? 'var(--accent-soft)' : 'var(--bg-2)', border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`, color: on ? 'var(--accent)' : 'var(--text-3)',
    }}>{children}</button>
  );
}
const fieldSt = {
  width: '100%', boxSizing: 'border-box', background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 10,
  padding: '11px 13px', color: 'var(--text)', outline: 'none', fontFamily: 'JetBrains Mono', fontSize: 13, lineHeight: 1.4,
};
