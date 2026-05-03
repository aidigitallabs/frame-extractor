# Frame Extractor

Drop a video, scrub the timeline, cut frames. Runs entirely in your browser — no upload, no signup, nothing leaves your device.

- MP4 / WebM / MOV in, PNG / JPEG / WEBP frames out.
- Cut a single frame at an exact timestamp, or batch many frames at a chosen interval.
- Optional near-duplicate filtering (perceptual hash) drops static frames from the batch.
- ZIP export for batches.

## Run locally

```
node serve.mjs
```

Then open `http://localhost:4180/`.

## Stack

Single-file static HTML + inline JS. JSZip is loaded from CDN on demand. No build step — `serve.mjs` is just a tiny static server for local development. The deployed site is plain static hosting.
