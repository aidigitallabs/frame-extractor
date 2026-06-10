/* image-preview.js
 * Reusable click-to-preview modal for image gallery cards.
 * Shared across the Frames Generator tool family.
 *
 * Usage:
 *   ImagePreview.open({
 *     src,        // image src URL (object URL OK)
 *     name,       // filename
 *     width,      // px
 *     height,     // px
 *     size,       // bytes (number) or pre-formatted string
 *     edited,     // boolean — shows EDITED badge
 *     meta,       // optional [{label, value}, ...] extra info rows
 *     onEdit,     // optional () => void  — clicking EDIT
 *     onDownload, // optional () => void  — overrides default download-link behavior
 *     downloadHref, downloadName  // used by default download if onDownload not provided
 *   });
 */
(function (root) {
  'use strict';

  const STYLE_ID = 'image-preview-styles';
  const STYLE = `
    .ip-overlay {
      position: fixed; inset: 0;
      background: rgba(17, 17, 17, 0.78);
      z-index: 1500;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
      animation: ipFade 140ms ease-out;
    }
    @keyframes ipFade { from { opacity: 0; } to { opacity: 1; } }
    .ip-card {
      background: var(--paper, #f4f2ec);
      border: 1px solid var(--ink, #111);
      border-radius: 4px;
      max-width: min(1200px, 96vw);
      max-height: 92vh;
      display: flex; flex-direction: column;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(0,0,0,0.45);
    }
    .ip-head {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 14px; border-bottom: 1px solid var(--ink, #111);
      font-family: 'IBM Plex Mono', ui-monospace, monospace;
      font-size: 11px;
    }
    .ip-head .ip-name { font-weight: 700; color: var(--ink, #111); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ip-head .ip-edited {
      background: var(--green, #1c9c3a); color: #fff;
      padding: 3px 6px; border-radius: 2px;
      font: 700 9px/1 'IBM Plex Mono', monospace;
      letter-spacing: 0.1em;
    }
    .ip-close {
      border: none; background: transparent; cursor: pointer;
      font: 700 22px/1 'IBM Plex Mono', monospace; color: var(--ink, #111);
      padding: 0 6px;
    }
    .ip-close:hover { color: var(--green, #1c9c3a); }
    .ip-body {
      flex: 1; min-height: 0;
      display: grid; grid-template-columns: 1fr 280px;
      gap: 0; background: var(--paper-2, #ece9df);
    }
    @media (max-width: 800px) { .ip-body { grid-template-columns: 1fr; } }
    .ip-stage {
      display: flex; align-items: center; justify-content: center;
      background: #ffffff;
      padding: 12px;
      min-height: 280px; max-height: 80vh;
      overflow: auto;
    }
    .ip-stage img { display: block; max-width: 100%; max-height: 78vh; image-rendering: -webkit-optimize-contrast; }
    .ip-info {
      padding: 16px;
      border-left: 1px solid var(--ink, #111);
      display: flex; flex-direction: column; gap: 12px;
      font-family: 'IBM Plex Mono', ui-monospace, monospace;
      font-size: 11px;
      background: var(--paper, #f4f2ec);
    }
    .ip-info h4 {
      margin: 0 0 6px;
      font: 700 10px/1 'IBM Plex Mono', monospace;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #888;
    }
    .ip-info dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; }
    .ip-info dt { color: #888; letter-spacing: 0.06em; text-transform: uppercase; font-size: 10px; }
    .ip-info dd { margin: 0; color: var(--ink, #111); font-weight: 600; word-break: break-all; }
    .ip-actions { display: flex; flex-direction: column; gap: 6px; margin-top: auto; }
    .ip-btn {
      display: inline-block;
      width: 100%;
      text-align: center;
      border: 1px solid var(--ink, #111);
      background: var(--paper, #f4f2ec);
      color: var(--ink, #111);
      padding: 10px 12px;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px; font-weight: 700;
      letter-spacing: 0.12em; text-transform: uppercase;
      border-radius: 2px; cursor: pointer;
      text-decoration: none;
      transition: all 140ms ease;
    }
    .ip-btn:hover { background: var(--ink, #111); color: var(--paper, #f4f2ec); }
    .ip-btn.ip-primary { background: var(--green, #1c9c3a); border-color: var(--green, #1c9c3a); color: #fff; }
    .ip-btn.ip-primary:hover { background: var(--green-dark, #16802e); border-color: var(--green-dark, #16802e); color: #fff; }
  `;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const tag = document.createElement('style');
    tag.id = STYLE_ID;
    tag.textContent = STYLE;
    document.head.appendChild(tag);
  }

  function fmtBytes(n) {
    if (typeof n !== 'number' || !isFinite(n)) return String(n || '—');
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  let active = null;

  function open(opts) {
    ensureStyles();
    if (active) active.close();

    const overlay = document.createElement('div');
    overlay.className = 'ip-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const card = document.createElement('div');
    card.className = 'ip-card';

    // Head
    const head = document.createElement('div');
    head.className = 'ip-head';
    const nameEl = document.createElement('span');
    nameEl.className = 'ip-name';
    nameEl.textContent = opts.name || 'Image';
    head.appendChild(nameEl);
    if (opts.edited) {
      const badge = document.createElement('span');
      badge.className = 'ip-edited';
      badge.textContent = '● EDITED';
      head.appendChild(badge);
    }
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ip-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    head.appendChild(closeBtn);
    card.appendChild(head);

    // Body
    const body = document.createElement('div');
    body.className = 'ip-body';

    const stage = document.createElement('div');
    stage.className = 'ip-stage';
    const img = document.createElement('img');
    img.alt = opts.name || '';
    img.src = opts.src;
    stage.appendChild(img);
    body.appendChild(stage);

    const info = document.createElement('div');
    info.className = 'ip-info';
    const h = document.createElement('h4');
    h.textContent = 'Info';
    info.appendChild(h);

    const dl = document.createElement('dl');
    function row(label, value) {
      if (value == null || value === '') return;
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      dl.appendChild(dt); dl.appendChild(dd);
    }
    row('Name', opts.name);
    if (opts.width && opts.height) row('Size', `${opts.width} × ${opts.height} px`);
    if (opts.size != null) row('Bytes', typeof opts.size === 'number' ? fmtBytes(opts.size) : opts.size);
    if (Array.isArray(opts.meta)) {
      for (const m of opts.meta) row(m.label, m.value);
    }
    info.appendChild(dl);

    const actions = document.createElement('div');
    actions.className = 'ip-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'ip-btn ip-primary';
    editBtn.type = 'button';
    editBtn.textContent = '✎ Edit';
    editBtn.addEventListener('click', () => {
      const cb = opts.onEdit;
      cleanup();
      if (typeof cb === 'function') cb();
    });
    actions.appendChild(editBtn);

    let dlBtn;
    if (opts.onDownload) {
      dlBtn = document.createElement('button');
      dlBtn.type = 'button';
      dlBtn.addEventListener('click', () => opts.onDownload());
    } else if (opts.downloadHref) {
      dlBtn = document.createElement('a');
      dlBtn.href = opts.downloadHref;
      if (opts.downloadName) dlBtn.download = opts.downloadName;
    }
    if (dlBtn) {
      dlBtn.className = 'ip-btn';
      dlBtn.textContent = '↓ Download';
      actions.appendChild(dlBtn);
    }

    info.appendChild(actions);
    body.appendChild(info);
    card.appendChild(body);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function cleanup() {
      if (!overlay.parentNode) return;
      overlay.parentNode.removeChild(overlay);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      active = null;
    }

    function onKey(e) {
      if (e.key === 'Escape') cleanup();
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup();
    });
    closeBtn.addEventListener('click', cleanup);
    window.addEventListener('keydown', onKey);

    active = { close: cleanup };
    return active;
  }

  root.ImagePreview = { open };
})(typeof window !== 'undefined' ? window : globalThis);
