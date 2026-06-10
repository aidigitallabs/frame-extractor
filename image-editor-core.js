/* image-editor-core.js
 * Shared image-editing primitives for the Frames Generator tool family.
 * Pure functions on canvases / blobs. No DOM mutation, no UI.
 *
 * Tools currently using this module:
 *   - /image-editor/        (standalone editor; canonical UI)
 *   - /image-resizer/       (per-image Edit handoff)
 *   - / (frame-extractor)   (per-frame Edit handoff)
 *
 * postMessage protocol (parent <-> embedded editor iframe):
 *   editor -> parent: { type: 'editor:ready' }
 *   parent -> editor: { type: 'editor:init',
 *                       source: 'image-resizer' | 'frame-extractor' | ...,
 *                       files: [{ id, name, blob, srcW, srcH }, ...],
 *                       targetIndex: number,
 *                       totalCount: number,
 *                       allowedScopes?: ['this','all','custom']  // host-controlled
 *                     }
 *   editor -> parent: { type: 'editor:apply',
 *                       ops: [
 *                         { kind: 'replace',   index: i, blob, name, w, h },
 *                         { kind: 'add-after', afterIndex: i, blob, name, w, h },
 *                         { kind: 'split',     index: i, items: [{ blob, name, w, h }, ...] }
 *                       ] }
 *   editor -> parent: { type: 'editor:cancel' }
 *
 * Blobs travel via structured clone; no object-URL leakage between frames.
 */

(function (root) {
  'use strict';

  // ── Canvas operations ──────────────────────────────────────────────

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  /** Crop using percent rect {l,t,r,b}, each 0..100. */
  function crop(srcCanvas, pct) {
    const w = srcCanvas.width, h = srcCanvas.height;
    const sx = Math.max(0, Math.round(w * pct.l / 100));
    const sy = Math.max(0, Math.round(h * pct.t / 100));
    const sw = Math.max(1, Math.round(w * (pct.r - pct.l) / 100));
    const sh = Math.max(1, Math.round(h * (pct.b - pct.t) / 100));
    const c = makeCanvas(sw, sh);
    c.getContext('2d').drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return c;
  }

  /** axis: 'h' (mirror left-right) or 'v' (mirror top-bottom). */
  function flip(srcCanvas, axis) {
    const w = srcCanvas.width, h = srcCanvas.height;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    if (axis === 'h') { ctx.translate(w, 0); ctx.scale(-1, 1); }
    else              { ctx.translate(0, h); ctx.scale(1, -1); }
    ctx.drawImage(srcCanvas, 0, 0);
    return c;
  }

  /** Rotate by deg (any multiple of 90; other angles allowed but not framed). */
  function rotate(srcCanvas, deg) {
    const w = srcCanvas.width, h = srcCanvas.height;
    const norm = ((deg % 360) + 360) % 360;
    const radians = norm * Math.PI / 180;
    const swap = (norm === 90 || norm === 270);
    const c = makeCanvas(swap ? h : w, swap ? w : h);
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(radians);
    ctx.drawImage(srcCanvas, -w / 2, -h / 2);
    return c;
  }

  /** Split into 2 pieces. axis: 'vertical' (L|R) or 'horizontal' (T/B). */
  function split(srcCanvas, axis, pctPos) {
    const w = srcCanvas.width, h = srcCanvas.height;
    const make = (sx, sy, sw, sh) => {
      const c = makeCanvas(sw, sh);
      c.getContext('2d').drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return c;
    };
    if (axis === 'vertical') {
      const splitX = Math.max(1, Math.min(w - 1, Math.round(w * pctPos / 100)));
      return [
        { canvas: make(0, 0, splitX, h),     label: 'left'  },
        { canvas: make(splitX, 0, w - splitX, h), label: 'right' }
      ];
    }
    const splitY = Math.max(1, Math.min(h - 1, Math.round(h * pctPos / 100)));
    return [
      { canvas: make(0, 0, w, splitY),       label: 'top'    },
      { canvas: make(0, splitY, w, h - splitY), label: 'bottom' }
    ];
  }

  /** Resize. mode: 'percent' | 'pixels' | 'maxLong'.
   *  params: { pct } | { w, h, lockAspect } | { maxLong }. */
  function resize(srcCanvas, mode, params) {
    const sw = srcCanvas.width, sh = srcCanvas.height;
    let tw = sw, th = sh;
    if (mode === 'percent') {
      const p = Math.max(1, params.pct) / 100;
      tw = Math.max(1, Math.round(sw * p));
      th = Math.max(1, Math.round(sh * p));
    } else if (mode === 'maxLong') {
      const long = Math.max(sw, sh);
      if (long > params.maxLong) {
        const s = params.maxLong / long;
        tw = Math.max(1, Math.round(sw * s));
        th = Math.max(1, Math.round(sh * s));
      }
    } else { // pixels
      if (params.lockAspect) {
        const s = Math.min(params.w / sw, params.h / sh);
        tw = Math.max(1, Math.round(sw * s));
        th = Math.max(1, Math.round(sh * s));
      } else {
        tw = Math.max(1, params.w);
        th = Math.max(1, params.h);
      }
    }
    if (tw === sw && th === sh) return srcCanvas;
    const c = makeCanvas(tw, th);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(srcCanvas, 0, 0, tw, th);
    return c;
  }

  // ── Encode / decode ────────────────────────────────────────────────

  /** Encode canvas to Blob. fmt: 'jpg' | 'png' | 'webp'. quality 0..1 (ignored for png). */
  function encode(canvas, fmt, quality) {
    const mime = fmt === 'jpg' ? 'image/jpeg'
              : fmt === 'webp' ? 'image/webp'
              : 'image/png';
    return new Promise(resolve => {
      if (fmt === 'png') canvas.toBlob(resolve, mime);
      else canvas.toBlob(resolve, mime, quality);
    });
  }

  /** Decode a Blob/File to a canvas. Tries createImageBitmap, falls back to <img>. */
  async function blobToCanvas(blob) {
    let bitmap = null;
    try { bitmap = await createImageBitmap(blob); } catch (_) { /* fall through */ }
    if (bitmap) {
      const c = document.createElement('canvas');
      c.width = bitmap.width; c.height = bitmap.height;
      c.getContext('2d').drawImage(bitmap, 0, 0);
      bitmap.close && bitmap.close();
      return c;
    }
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  // ── Filename helpers ───────────────────────────────────────────────

  function detectFmtFromName(name) {
    const ext = (name || '').toLowerCase().split('.').pop();
    if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
    if (ext === 'webp') return 'webp';
    return 'png'; // default for png/gif/bmp/unknown
  }

  function renameForFormat(name, fmt) {
    const ext = fmt === 'jpg' ? 'jpg' : fmt;
    return (name || 'image').replace(/\.[^.]+$/, '') + '.' + ext;
  }

  function appendLabel(name, label) {
    if (!label) return name;
    return (name || 'image').replace(/(\.[^.]+)?$/, (_, ext) => `-${label}${ext || ''}`);
  }

  // ── Op pipeline ────────────────────────────────────────────────────
  // Apply a list of ops sequentially. Crop/flip/rotate/resize each return one
  // canvas; split returns N canvases — once a split happens, the pipeline
  // forks: subsequent ops are applied to each branch. Returns
  // [{ canvas, label }, ...].

  function applyPipeline(srcCanvas, ops) {
    let branches = [{ canvas: srcCanvas, label: null }];
    for (const op of ops) {
      const next = [];
      for (const br of branches) {
        if (op.kind === 'crop')   next.push({ canvas: crop(br.canvas, op.pct), label: br.label });
        else if (op.kind === 'flip')   next.push({ canvas: flip(br.canvas, op.axis), label: br.label });
        else if (op.kind === 'rotate') next.push({ canvas: rotate(br.canvas, op.deg), label: br.label });
        else if (op.kind === 'resize') next.push({ canvas: resize(br.canvas, op.mode, op.params), label: br.label });
        else if (op.kind === 'split') {
          const slices = split(br.canvas, op.axis, op.pos);
          for (const s of slices) {
            next.push({
              canvas: s.canvas,
              label: br.label ? `${br.label}-${s.label}` : s.label
            });
          }
        }
      }
      branches = next;
    }
    return branches;
  }

  // ── Export ─────────────────────────────────────────────────────────

  const api = {
    crop, flip, rotate, split, resize,
    encode, blobToCanvas,
    detectFmtFromName, renameForFormat, appendLabel,
    applyPipeline,
    makeCanvas
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ImageEditorCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
