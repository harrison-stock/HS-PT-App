// Client-side image downscaling, applied to every upload before it reaches
// Supabase storage.
//
// Phone cameras produce 3-6MB images at 4000px+ on the long edge. Nothing in
// the app ever displays one larger than a full-width card, so storing the
// original means paying for the bytes once in storage and again on every
// client's data plan, every time a list renders. Downscaling to 1600px and
// re-encoding as WebP typically cuts a phone photo by 90-95% with no visible
// difference at the sizes we actually render.
//
// Everything here is best-effort: if the browser can't decode the file, or the
// result comes out no smaller, the original is returned untouched. A failed
// compression must never block an upload.

const MAX_EDGE = 1600;   // longest side, in CSS pixels
const QUALITY = 0.82;    // WebP/JPEG quality - visually lossless at these sizes
const MIN_GAIN = 0.9;    // only keep the result if it's at least 10% smaller

// Formats we deliberately leave alone:
//   svg  - vector, already tiny, and rasterising it would be a downgrade
//   gif  - canvas only captures the first frame, so animation would be lost
//   heic - most browsers can't decode it; iOS converts to JPEG on pick anyway
const SKIP = /^image\/(svg\+xml|gif|heic|heif)$/i;

const canCompress = (file) =>
  typeof document !== 'undefined' &&
  !!file &&
  typeof file.type === 'string' &&
  file.type.startsWith('image/') &&
  !SKIP.test(file.type);

// Pick the best output format the browser can actually encode. Safari gained
// WebP encoding in 14; older engines silently hand back a PNG from toBlob,
// which would be larger than the JPEG we started with.
let encodeType;
function bestType() {
  if (encodeType) return encodeType;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    encodeType = c.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
  } catch (e) {
    encodeType = 'image/jpeg';
  }
  return encodeType;
}

const rename = (name, type) => {
  const stem = (name || 'image').replace(/\.[^.]+$/, '');
  return `${stem}.${type === 'image/webp' ? 'webp' : 'jpg'}`;
};

const toBlob = (canvas, type, quality) => new Promise(resolve => {
  try { canvas.toBlob(resolve, type, quality); } catch (e) { resolve(null); }
});

/**
 * Downscale and re-encode an image file. Returns a new File, or the original
 * when compression isn't possible or wouldn't help.
 */
export async function compressImage(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  if (!canCompress(file)) return file;

  let bitmap;
  try {
    // imageOrientation honours the EXIF rotation flag, so photos taken in
    // portrait don't come back on their side once the tag is dropped.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    return file; // undecodable in this browser - upload as-is
  }

  try {
    const { width, height } = bitmap;
    if (!width || !height) return file;

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const type = bestType();
    const blob = await toBlob(canvas, type, quality);

    // A small PNG logo can come out *bigger* after a round trip - keep whichever
    // is actually smaller.
    if (!blob || blob.size > file.size * MIN_GAIN) return file;

    return new File([blob], rename(file.name, type), { type, lastModified: Date.now() });
  } catch (e) {
    return file;
  } finally {
    bitmap.close?.();
  }
}
