import React from 'react'

// Reusable drag-and-drop + click-to-browse upload zone. Calls onFiles(FileList)
// for both a drop and a file-picker selection. Purely presentational - the
// caller does the actual upload and owns the busy state.
export function FileDrop({ onFiles, accept = 'image/*', multiple = false, busy = false, disabled = false, label, hint, height = 120, style }) {
  const inputRef = React.useRef(null);
  const [over, setOver] = React.useState(false);

  const handleFiles = (files) => {
    if (disabled || busy) return;
    const list = Array.from(files || []).filter(Boolean);
    if (list.length) onFiles(multiple ? list : [list[0]]);
  };

  return (
    <div
      onClick={() => !busy && !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!busy && !disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handleFiles(e.dataTransfer?.files); }}
      style={{
        cursor: busy || disabled ? 'default' : 'pointer',
        display: 'grid', placeItems: 'center', textAlign: 'center', gap: 6,
        minHeight: height, padding: '14px 16px', borderRadius: 12, boxSizing: 'border-box',
        border: `1.5px dashed ${over ? 'var(--accent)' : 'var(--line-strong)'}`,
        background: over ? 'var(--accent-soft)' : 'var(--bg-2)',
        transition: 'background .15s, border-color .15s',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} style={{ display: 'none' }}
        onChange={(e) => {
          // Snapshot the files BEFORE clearing the input - resetting value wipes
          // the live FileList, so reading it after would give nothing.
          const picked = Array.from(e.target.files || []);
          e.target.value = '';
          handleFiles(picked);
        }} />
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={over ? 'var(--accent)' : 'var(--text-3)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" />
      </svg>
      <div className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: over ? 'var(--accent)' : 'var(--text-2)' }}>
        {busy ? 'UPLOADING…' : (label || 'DRAG & DROP OR TAP TO UPLOAD')}
      </div>
      {hint && <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.04em' }}>{hint}</div>}
    </div>
  );
}
