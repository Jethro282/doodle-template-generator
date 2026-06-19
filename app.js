'use strict';

const photoInput = document.getElementById('photoInput');
const uploadText = document.getElementById('uploadText');
const statusEl = document.getElementById('status');
const sourceCanvas = document.getElementById('sourceCanvas');
const outputCanvas = document.getElementById('outputCanvas');
const drawCanvas = document.getElementById('drawCanvas');
const canvasWrap = document.getElementById('canvasWrap');

const sctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
const ctx = outputCanvas.getContext('2d', { willReadFrequently: true });
const drawCtx = drawCanvas.getContext('2d');

const lightBtn = document.getElementById('lightBtn');
const darkBtn = document.getElementById('darkBtn');
const onlineBtn = document.getElementById('onlineBtn');
const printBtn = document.getElementById('printBtn');
const downloadBtn = document.getElementById('downloadBtn');
const clearDrawingBtn = document.getElementById('clearDrawingBtn');
const detailSlider = document.getElementById('detailSlider');
const densitySlider = document.getElementById('densitySlider');
const outlineSlider = document.getElementById('outlineSlider');
const styleSelect = document.getElementById('styleSelect');

let loadedImage = null;
let currentMode = 'dark';
let drawing = false;
let lastPoint = null;

function setStatus(msg) { statusEl.textContent = msg; }

function setupBlank() {
  sctx.fillStyle = 'white';
  sctx.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sctx.fillStyle = '#777';
  sctx.font = '22px system-ui';
  sctx.textAlign = 'center';
  sctx.fillText('Original photo will appear here', sourceCanvas.width / 2, sourceCanvas.height / 2);

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  ctx.fillStyle = '#777';
  ctx.font = '28px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Doodle template will appear here', outputCanvas.width / 2, outputCanvas.height / 2);
}
setupBlank();

function setReadyState(isReady) {
  lightBtn.disabled = !isReady;
  darkBtn.disabled = !isReady;
  onlineBtn.disabled = !isReady;
  printBtn.disabled = !isReady;
  downloadBtn.disabled = !isReady;
}

photoInput.addEventListener('change', (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  setStatus('Loading photo...');
  uploadText.textContent = file.name;

  const img = new Image();
  img.onload = () => {
    loadedImage = img;
    drawSourcePreview(img);
    setReadyState(true);
    generateTemplate('dark');
    URL.revokeObjectURL(img.src);
  };
  img.onerror = () => setStatus('Sorry mate, that image could not be loaded. Try a JPG or PNG.');
  img.src = URL.createObjectURL(file);
});

lightBtn.addEventListener('click', () => generateTemplate('light'));
darkBtn.addEventListener('click', () => generateTemplate('dark'));
onlineBtn.addEventListener('click', () => generateTemplate('online'));
printBtn.addEventListener('click', () => window.print());
downloadBtn.addEventListener('click', downloadPng);
clearDrawingBtn.addEventListener('click', () => drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height));

function drawSourcePreview(img) {
  sctx.fillStyle = 'white';
  sctx.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  const f = fitImage(img.width, img.height, sourceCanvas.width, sourceCanvas.height, 20);
  sctx.drawImage(img, f.x, f.y, f.w, f.h);
  sctx.strokeStyle = 'rgba(0,0,0,.25)';
  sctx.strokeRect(f.x, f.y, f.w, f.h);
}

function generateTemplate(mode) {
  if (!loadedImage) {
    setStatus('Upload a photo first.');
    return;
  }
  setStatus('Generating template...');
  currentMode = mode;
  const online = mode === 'online';
  canvasWrap.classList.toggle('drawing', online);
  clearDrawingBtn.disabled = !online;
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  setTimeout(() => {
    try {
      renderHybrid(mode);
      setStatus(online ? 'Online template ready — draw directly on the right-hand image.' : `${mode === 'light' ? 'Light' : 'Dark'} template ready.`);
    } catch (err) {
      console.error(err);
      setStatus('Something went wrong generating the template. Check that app.js uploaded correctly.');
    }
  }, 20);
}

function renderHybrid(mode) {
  const W = outputCanvas.width;
  const H = outputCanvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, W, H);

  const fitted = fitImage(loadedImage.width, loadedImage.height, W, H, 45);
  const temp = document.createElement('canvas');
  temp.width = W;
  temp.height = H;
  const tctx = temp.getContext('2d', { willReadFrequently: true });
  tctx.fillStyle = 'white';
  tctx.fillRect(0, 0, W, H);
  tctx.drawImage(loadedImage, fitted.x, fitted.y, fitted.w, fitted.h);

  const imgData = tctx.getImageData(0, 0, W, H);
  const gray = makeGray(imgData.data, W, H);
  const edges = sobel(gray, W, H);

  if (mode === 'light') {
    ctx.globalAlpha = 0.055;
    ctx.drawImage(temp, 0, 0);
    ctx.globalAlpha = 1;
  }

  const detail = Number(detailSlider.value);
  const density = Number(densitySlider.value);
  const style = styleSelect.value;
  const step = Math.max(5, 16 - detail * 2);
  const markAlpha = mode === 'light' ? 0.25 : 0.88;
  const colour = mode === 'light' ? 125 : 0;

  for (let y = Math.floor(fitted.y); y < fitted.y + fitted.h; y += step) {
    for (let x = Math.floor(fitted.x); x < fitted.x + fitted.w; x += step) {
      const stats = sampleStats(gray, edges, W, H, x, y, step);
      const darkness = 1 - stats.luma / 255;
      const edge = Math.min(1, stats.edge / 255);
      const tone = clamp(darkness * 0.92 + edge * 0.22, 0, 1);
      const chance = clamp((tone * tone * 0.7 + tone * 0.35) * (0.52 + density * 0.13), 0.015, 0.98);
      const r = seededRandom(x * 37 + y * 101 + Math.floor(tone * 10000));
      if (r > chance) continue;

      const px = x + step / 2 + (seededRandom(x + y * 3) - 0.5) * step * 0.7;
      const py = y + step / 2 + (seededRandom(x * 5 + y) - 0.5) * step * 0.7;
      const size = Math.max(1.2, step * (0.18 + tone * 1.25));
      ctx.strokeStyle = `rgba(${colour},${colour},${colour},${markAlpha})`;
      ctx.fillStyle = `rgba(${colour},${colour},${colour},${markAlpha})`;
      ctx.lineWidth = mode === 'light' ? 0.55 + tone * 1.15 : 0.75 + tone * 2.4;
      drawDoodleMark(ctx, px, py, size, tone, seededRandom(x * 13 + y * 17), style);
    }
  }

  drawEdgeOverlay(ctx, edges, gray, W, H, fitted, mode === 'light' ? 0.22 : 0.7, mode === 'light' ? 130 : 0, Number(outlineSlider.value));

  ctx.globalAlpha = 1;
  ctx.strokeStyle = mode === 'light' ? 'rgba(120,120,120,.35)' : 'rgba(0,0,0,.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(fitted.x, fitted.y, fitted.w, fitted.h);
}

function fitImage(iw, ih, W, H, margin) {
  const scale = Math.min((W - margin * 2) / iw, (H - margin * 2) / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}
function makeGray(data, W, H) {
  const gray = new Uint8ClampedArray(W * H);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  return gray;
}
function sobel(gray, W, H) {
  const out = new Uint8ClampedArray(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = -gray[i - W - 1] - 2 * gray[i - 1] - gray[i + W - 1] + gray[i - W + 1] + 2 * gray[i + 1] + gray[i + W + 1];
      const gy = -gray[i - W - 1] - 2 * gray[i - W] - gray[i - W + 1] + gray[i + W - 1] + 2 * gray[i + W] + gray[i + W + 1];
      out[i] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }
  return out;
}
function sampleStats(gray, edges, W, H, x, y, size) {
  let luma = 0, edge = 0, count = 0;
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.floor(x + size));
  const y1 = Math.min(H, Math.floor(y + size));
  for (let yy = y0; yy < y1; yy += 2) for (let xx = x0; xx < x1; xx += 2) { const i = yy * W + xx; luma += gray[i]; edge += edges[i]; count++; }
  return { luma: luma / Math.max(1, count), edge: edge / Math.max(1, count) };
}
function drawDoodleMark(c, x, y, size, tone, seed, style) {
  const type = chooseType(seed, tone, style);
  c.save(); c.translate(x, y); c.rotate((seededRandom(seed * 9999) - 0.5) * Math.PI);
  if (type === 'dot') { c.beginPath(); c.arc(0, 0, size * 0.36, 0, Math.PI * 2); c.fill(); }
  else if (type === 'ring') { c.beginPath(); c.arc(0, 0, size * 0.42, 0, Math.PI * 2); c.stroke(); }
  else if (type === 'spiral') { c.beginPath(); const turns = 2.3 + tone * 2; for (let a = 0; a < Math.PI * turns; a += 0.24) { const r = (a / (Math.PI * turns)) * size * 0.52; const px = Math.cos(a) * r; const py = Math.sin(a) * r; if (a === 0) c.moveTo(px, py); else c.lineTo(px, py); } c.stroke(); }
  else if (type === 'hatch') { const n = 2 + Math.floor(tone * 5); for (let i = -n; i <= n; i++) { c.beginPath(); c.moveTo(-size * 0.55, i * size * 0.18); c.lineTo(size * 0.55, i * size * 0.18); c.stroke(); } }
  else if (type === 'cross') { c.beginPath(); c.moveTo(-size * 0.45, 0); c.lineTo(size * 0.45, 0); c.moveTo(0, -size * 0.45); c.lineTo(0, size * 0.45); c.stroke(); }
  else if (type === 'wave') { c.beginPath(); for (let i = -5; i <= 5; i++) { const px = (i / 5) * size * 0.55; const py = Math.sin(i * 1.2) * size * 0.18; if (i === -5) c.moveTo(px, py); else c.lineTo(px, py); } c.stroke(); }
  else { c.beginPath(); const sides = 3 + Math.floor(seed * 4); for (let i = 0; i <= sides; i++) { const a = (i / sides) * Math.PI * 2; const px = Math.cos(a) * size * 0.44; const py = Math.sin(a) * size * 0.44; if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); } c.stroke(); }
  c.restore();
}
function chooseType(seed, tone, style) {
  if (style === 'stipple') return seed < 0.82 ? 'dot' : 'ring';
  if (style === 'zentangle') { if (seed < 0.26) return 'spiral'; if (seed < 0.52) return 'hatch'; if (seed < 0.72) return 'wave'; if (seed < 0.88) return 'ring'; return 'shape'; }
  if (tone > 0.78) return seed < 0.5 ? 'dot' : seed < 0.72 ? 'hatch' : 'spiral';
  if (tone > 0.48) return seed < 0.25 ? 'ring' : seed < 0.5 ? 'wave' : seed < 0.75 ? 'spiral' : 'cross';
  return seed < 0.4 ? 'ring' : seed < 0.7 ? 'wave' : 'shape';
}
function drawEdgeOverlay(c, edges, gray, W, H, fitted, alpha, colour, strength) {
  const threshold = 115 - strength * 12;
  c.fillStyle = `rgba(${colour},${colour},${colour},${alpha})`;
  for (let y = Math.floor(fitted.y) + 1; y < fitted.y + fitted.h - 1; y += 2) for (let x = Math.floor(fitted.x) + 1; x < fitted.x + fitted.w - 1; x += 2) { const i = y * W + x; if (edges[i] > threshold) { const darkness = 1 - gray[i] / 255; c.globalAlpha = alpha * (0.45 + darkness * 0.7); c.beginPath(); c.arc(x, y, 0.45 + darkness * 0.8, 0, Math.PI * 2); c.fill(); } }
  c.globalAlpha = 1;
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function seededRandom(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }
function downloadPng() {
  const combined = document.createElement('canvas'); combined.width = outputCanvas.width; combined.height = outputCanvas.height;
  const c = combined.getContext('2d'); c.drawImage(outputCanvas, 0, 0); c.drawImage(drawCanvas, 0, 0);
  const a = document.createElement('a'); a.download = `doodle-template-${currentMode}.png`; a.href = combined.toDataURL('image/png'); a.click();
}
function getCanvasPoint(e) { const rect = drawCanvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; return { x: (clientX - rect.left) * drawCanvas.width / rect.width, y: (clientY - rect.top) * drawCanvas.height / rect.height }; }
function startDraw(e) { if (currentMode !== 'online') return; e.preventDefault(); drawing = true; lastPoint = getCanvasPoint(e); }
function moveDraw(e) { if (!drawing || currentMode !== 'online') return; e.preventDefault(); const p = getCanvasPoint(e); drawCtx.strokeStyle = 'rgba(0,0,0,.9)'; drawCtx.lineWidth = 4; drawCtx.lineCap = 'round'; drawCtx.beginPath(); drawCtx.moveTo(lastPoint.x, lastPoint.y); drawCtx.lineTo(p.x, p.y); drawCtx.stroke(); lastPoint = p; }
function endDraw() { drawing = false; lastPoint = null; }
drawCanvas.addEventListener('mousedown', startDraw); drawCanvas.addEventListener('mousemove', moveDraw); window.addEventListener('mouseup', endDraw);
drawCanvas.addEventListener('touchstart', startDraw, { passive: false }); drawCanvas.addEventListener('touchmove', moveDraw, { passive: false }); window.addEventListener('touchend', endDraw);
