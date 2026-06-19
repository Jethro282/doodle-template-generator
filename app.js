const photoInput = document.getElementById('photoInput');
const templateCanvas = document.getElementById('templateCanvas');
const drawCanvas = document.getElementById('drawCanvas');
const tctx = templateCanvas.getContext('2d', { willReadFrequently: true });
const dctx = drawCanvas.getContext('2d');
const statusEl = document.getElementById('status');

const likeness = document.getElementById('likeness');
const density = document.getElementById('density');
const patternSize = document.getElementById('patternSize');
const useDots = document.getElementById('useDots');
const useSwirls = document.getElementById('useSwirls');
const useWaves = document.getElementById('useWaves');
const useHatching = document.getElementById('useHatching');
const useShapes = document.getElementById('useShapes');
const penSize = document.getElementById('penSize');

let sourceImage = null;
let lastMode = 'dark';
let drawing = false;
let imageBox = { x: 0, y: 0, w: templateCanvas.width, h: templateCanvas.height };

function setStatus(msg) { statusEl.textContent = msg; }

photoInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = event => {
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      clearDrawing();
      drawPreview();
      setStatus('Photo loaded. Choose a doodle option.');
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

function drawImageContained(ctx, img) {
  const cw = templateCanvas.width;
  const ch = templateCanvas.height;
  const scale = Math.min(cw / img.width, ch / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = (cw - w) / 2;
  const y = (ch - h) / 2;
  imageBox = { x, y, w, h };
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, x, y, w, h);
}

function drawPreview() {
  if (!sourceImage) return;
  drawImageContained(tctx, sourceImage);
}

function generateTemplate(mode) {
  if (!sourceImage) {
    setStatus('Please upload a photo first.');
    return;
  }

  lastMode = mode;
  drawCanvas.classList.toggle('drawing-enabled', mode === 'online');

  drawImageContained(tctx, sourceImage);
  const width = templateCanvas.width;
  const height = templateCanvas.height;
  const imgData = tctx.getImageData(0, 0, width, height);
  const src = imgData.data;

  const grey = buildGreyMap(src, width, height);
  const smooth = blurMap(grey, width, height, 2);
  const edges = buildEdgeMap(smooth, width, height);

  clearTemplate();
  drawPosterToneBase(smooth, width, height, mode);
  drawMajorOutlines(edges, smooth, width, height, mode);
  drawDoodleField(smooth, edges, width, height, mode);
  drawFineDetail(edges, smooth, width, height, mode);

  if (mode === 'online') {
    setStatus('Online doodle-art template ready. Draw with mouse, stylus, or finger.');
  } else {
    setStatus(`${mode === 'light' ? 'Light' : 'Dark'} doodle-art template generated.`);
  }
}

function clearTemplate() {
  tctx.clearRect(0, 0, templateCanvas.width, templateCanvas.height);
  tctx.fillStyle = 'white';
  tctx.fillRect(0, 0, templateCanvas.width, templateCanvas.height);
}

function inPhoto(x, y) {
  return x >= imageBox.x && x <= imageBox.x + imageBox.w && y >= imageBox.y && y <= imageBox.y + imageBox.h;
}

function buildGreyMap(data, width, height) {
  const grey = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    grey[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return grey;
}

function blurMap(map, width, height, passes) {
  let current = map;
  for (let pass = 0; pass < passes; pass++) {
    const out = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const p = y * width + x;
        out[p] = (
          current[p] * 4 +
          current[p - 1] * 2 + current[p + 1] * 2 +
          current[p - width] * 2 + current[p + width] * 2 +
          current[p - width - 1] + current[p - width + 1] +
          current[p + width - 1] + current[p + width + 1]
        ) / 16;
      }
    }
    current = out;
  }
  return current;
}

function buildEdgeMap(grey, width, height) {
  const edges = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      const gx = -grey[p - width - 1] - 2 * grey[p - 1] - grey[p + width - 1]
               + grey[p - width + 1] + 2 * grey[p + 1] + grey[p + width + 1];
      const gy = -grey[p - width - 1] - 2 * grey[p - width] - grey[p - width + 1]
               + grey[p + width - 1] + 2 * grey[p + width] + grey[p + width + 1];
      edges[p] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return edges;
}

function toneAlpha(mode, shade, multiplier = 1) {
  const dark = (255 - shade) / 255;
  if (mode === 'light') return Math.min(0.36, 0.06 + dark * 0.28) * multiplier;
  if (mode === 'online') return Math.min(0.48, 0.08 + dark * 0.36) * multiplier;
  return Math.min(0.92, 0.14 + dark * 0.75) * multiplier;
}

function strokeFor(mode, shade, alphaMul = 1) {
  const v = mode === 'light' ? 145 : 0;
  return `rgba(${v},${v},${v},${toneAlpha(mode, shade, alphaMul)})`;
}

function drawPosterToneBase(grey, width, height, mode) {
  // This gives the image visible mass before doodles are added.
  const step = 5;
  for (let y = Math.floor(imageBox.y); y < imageBox.y + imageBox.h; y += step) {
    for (let x = Math.floor(imageBox.x); x < imageBox.x + imageBox.w; x += step) {
      const p = y * width + x;
      const shade = grey[p] || 255;
      if (shade > 242) continue;
      const alpha = toneAlpha(mode, shade, 0.18);
      tctx.fillStyle = mode === 'light' ? `rgba(170,170,170,${alpha})` : `rgba(0,0,0,${alpha})`;
      tctx.fillRect(x, y, step + 1, step + 1);
    }
  }
}

function drawMajorOutlines(edges, grey, width, height, mode) {
  const like = Number(likeness.value);
  const threshold = 70 - like * 0.35;
  tctx.lineCap = 'round';

  for (let y = Math.floor(imageBox.y) + 2; y < imageBox.y + imageBox.h - 2; y += 2) {
    for (let x = Math.floor(imageBox.x) + 2; x < imageBox.x + imageBox.w - 2; x += 2) {
      const p = y * width + x;
      const edge = edges[p];
      if (edge < threshold) continue;
      const shade = grey[p] || 255;
      const weight = Math.min(3.2, 0.55 + edge / 80 + (255 - shade) / 180);
      tctx.strokeStyle = strokeFor(mode, shade, 1.35);
      tctx.lineWidth = mode === 'light' ? weight * 0.65 : weight;
      const angle = gradientAngle(grey, width, x, y) + Math.PI / 2;
      const len = Math.min(12, 3 + edge / 38);
      tctx.beginPath();
      tctx.moveTo(x - Math.cos(angle) * len, y - Math.sin(angle) * len);
      tctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      tctx.stroke();
    }
  }
}

function gradientAngle(grey, width, x, y) {
  const p = y * width + x;
  const gx = (grey[p + 1] || grey[p]) - (grey[p - 1] || grey[p]);
  const gy = (grey[p + width] || grey[p]) - (grey[p - width] || grey[p]);
  return Math.atan2(gy, gx);
}

function drawDoodleField(grey, edges, width, height, mode) {
  const dens = Number(density.value);
  const size = Number(patternSize.value);
  const spacing = Math.max(7, size - dens / 8);
  let i = 0;

  for (let y = imageBox.y + spacing; y < imageBox.y + imageBox.h - spacing; y += spacing) {
    for (let x = imageBox.x + spacing; x < imageBox.x + imageBox.w - spacing; x += spacing) {
      const jitterX = seededNoise(x, y, 1) * spacing * 0.55;
      const jitterY = seededNoise(x, y, 2) * spacing * 0.55;
      const px = Math.floor(x + jitterX);
      const py = Math.floor(y + jitterY);
      if (!inPhoto(px, py)) continue;

      const p = py * width + px;
      const shade = grey[p] || 255;
      const edge = edges[p] || 0;
      const darkness = (255 - shade) / 255;
      const chance = 0.18 + darkness * 0.72 + Math.min(edge / 220, 0.42);
      if (seeded01(px, py, 3) > chance * (dens / 65)) continue;

      const localSize = Math.max(3, size * (0.55 + darkness * 0.9 + Math.min(edge / 260, 0.45)));
      const weight = Math.max(0.45, Math.min(3.2, 0.45 + darkness * 2.2 + edge / 170));
      tctx.lineWidth = mode === 'light' ? weight * 0.55 : weight;
      tctx.strokeStyle = strokeFor(mode, shade, 1.05);
      tctx.fillStyle = strokeFor(mode, shade, 0.95);

      const toneBand = Math.floor(shade / 42);
      const choice = (toneBand + i + Math.floor(seeded01(px, py, 4) * 5)) % 5;
      if (choice === 0 && useDots.checked) drawDotCluster(px, py, localSize, darkness);
      else if (choice === 1 && useSwirls.checked) drawSwirl(px, py, localSize, seeded01(px, py, 5));
      else if (choice === 2 && useWaves.checked) drawWaves(px, py, localSize, gradientAngle(grey, width, px, py));
      else if (choice === 3 && useHatching.checked) drawCrossHatch(px, py, localSize, gradientAngle(grey, width, px, py), darkness);
      else if (useShapes.checked) drawShape(px, py, localSize, seeded01(px, py, 6));
      i++;
    }
  }
}

function drawFineDetail(edges, grey, width, height, mode) {
  const like = Number(likeness.value);
  const threshold = 95 - like * 0.45;
  tctx.lineCap = 'round';
  for (let y = Math.floor(imageBox.y) + 1; y < imageBox.y + imageBox.h - 1; y += 3) {
    for (let x = Math.floor(imageBox.x) + 1; x < imageBox.x + imageBox.w - 1; x += 3) {
      const p = y * width + x;
      const edge = edges[p];
      if (edge < threshold) continue;
      const shade = grey[p] || 255;
      tctx.strokeStyle = strokeFor(mode, shade, 0.8);
      tctx.lineWidth = mode === 'light' ? 0.45 : 0.75;
      const a = gradientAngle(grey, width, x, y) + Math.PI / 2;
      tctx.beginPath();
      tctx.moveTo(x - Math.cos(a) * 2.5, y - Math.sin(a) * 2.5);
      tctx.lineTo(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5);
      tctx.stroke();
    }
  }
}

function seeded01(x, y, salt) {
  let n = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  return n - Math.floor(n);
}
function seededNoise(x, y, salt) { return seeded01(x, y, salt) * 2 - 1; }

function drawDotCluster(x, y, s, darkness) {
  const count = Math.floor(2 + darkness * 9);
  for (let k = 0; k < count; k++) {
    const a = seeded01(x + k, y, 10) * Math.PI * 2;
    const r = seeded01(x, y + k, 11) * s * 0.55;
    const dot = 0.8 + darkness * 2.6;
    tctx.beginPath();
    tctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, dot, 0, Math.PI * 2);
    tctx.fill();
  }
}

function drawSwirl(x, y, s, seed) {
  const turns = 2.4 + seed * 2.2;
  tctx.beginPath();
  for (let a = 0; a < Math.PI * turns; a += 0.2) {
    const r = s * a / (Math.PI * turns) * 0.55;
    const px = x + Math.cos(a + seed * 6) * r;
    const py = y + Math.sin(a + seed * 6) * r;
    if (a === 0) tctx.moveTo(px, py); else tctx.lineTo(px, py);
  }
  tctx.stroke();
}

function drawWaves(x, y, s, angle) {
  tctx.save();
  tctx.translate(x, y);
  tctx.rotate(angle + Math.PI / 2);
  const lines = 3;
  for (let j = -1; j <= lines; j++) {
    tctx.beginPath();
    for (let i = -s / 2; i <= s / 2; i += 2) {
      const yy = (j - 1) * s / 5 + Math.sin(i / 3) * 2;
      if (i === -s / 2) tctx.moveTo(i, yy); else tctx.lineTo(i, yy);
    }
    tctx.stroke();
  }
  tctx.restore();
}

function drawCrossHatch(x, y, s, angle, darkness) {
  const reps = Math.floor(2 + darkness * 5);
  tctx.save();
  tctx.translate(x, y);
  tctx.rotate(angle);
  for (let k = -reps; k <= reps; k++) {
    tctx.beginPath();
    tctx.moveTo(-s * 0.45, k * 3);
    tctx.lineTo(s * 0.45, k * 3);
    tctx.stroke();
  }
  if (darkness > 0.45) {
    tctx.rotate(Math.PI / 2);
    for (let k = -reps; k <= reps; k += 2) {
      tctx.beginPath();
      tctx.moveTo(-s * 0.38, k * 3);
      tctx.lineTo(s * 0.38, k * 3);
      tctx.stroke();
    }
  }
  tctx.restore();
}

function drawShape(x, y, s, seed) {
  const sides = 3 + Math.floor(seed * 4);
  tctx.beginPath();
  for (let n = 0; n < sides; n++) {
    const a = (Math.PI * 2 * n) / sides + seed * Math.PI;
    const px = x + Math.cos(a) * s * 0.38;
    const py = y + Math.sin(a) * s * 0.38;
    if (n === 0) tctx.moveTo(px, py); else tctx.lineTo(px, py);
  }
  tctx.closePath();
  tctx.stroke();
}

function clearDrawing() {
  dctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
}

function printTemplate(mode) {
  if (!sourceImage) {
    setStatus('Please upload a photo first.');
    return;
  }
  generateTemplate(mode);
  setTimeout(() => window.print(), 150);
}

function downloadPNG() {
  const merged = document.createElement('canvas');
  merged.width = templateCanvas.width;
  merged.height = templateCanvas.height;
  const mctx = merged.getContext('2d');
  mctx.drawImage(templateCanvas, 0, 0);
  mctx.drawImage(drawCanvas, 0, 0);
  const link = document.createElement('a');
  link.download = `doodle-art-template-${lastMode}.png`;
  link.href = merged.toDataURL('image/png');
  link.click();
}

function getPointerPos(e) {
  const rect = drawCanvas.getBoundingClientRect();
  const touch = e.touches ? e.touches[0] : e;
  return {
    x: (touch.clientX - rect.left) * (drawCanvas.width / rect.width),
    y: (touch.clientY - rect.top) * (drawCanvas.height / rect.height)
  };
}

function startDraw(e) {
  if (!drawCanvas.classList.contains('drawing-enabled')) return;
  drawing = true;
  const p = getPointerPos(e);
  dctx.beginPath();
  dctx.moveTo(p.x, p.y);
  e.preventDefault();
}

function moveDraw(e) {
  if (!drawing) return;
  const p = getPointerPos(e);
  dctx.lineWidth = Number(penSize.value);
  dctx.lineCap = 'round';
  dctx.strokeStyle = '#111';
  dctx.lineTo(p.x, p.y);
  dctx.stroke();
  e.preventDefault();
}

function endDraw() { drawing = false; }

document.getElementById('lightBtn').addEventListener('click', () => generateTemplate('light'));
document.getElementById('darkBtn').addEventListener('click', () => generateTemplate('dark'));
document.getElementById('onlineBtn').addEventListener('click', () => generateTemplate('online'));
document.getElementById('printLightBtn').addEventListener('click', () => printTemplate('light'));
document.getElementById('printDarkBtn').addEventListener('click', () => printTemplate('dark'));
document.getElementById('clearDrawingBtn').addEventListener('click', clearDrawing);
document.getElementById('downloadBtn').addEventListener('click', downloadPNG);

drawCanvas.addEventListener('mousedown', startDraw);
drawCanvas.addEventListener('mousemove', moveDraw);
window.addEventListener('mouseup', endDraw);
drawCanvas.addEventListener('touchstart', startDraw, { passive: false });
drawCanvas.addEventListener('touchmove', moveDraw, { passive: false });
window.addEventListener('touchend', endDraw);
