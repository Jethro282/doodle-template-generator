const photoInput = document.getElementById('photoInput');
const templateCanvas = document.getElementById('templateCanvas');
const drawCanvas = document.getElementById('drawCanvas');
const tctx = templateCanvas.getContext('2d', { willReadFrequently: true });
const dctx = drawCanvas.getContext('2d');
const statusEl = document.getElementById('status');

const detail = document.getElementById('detail');
const thickness = document.getElementById('thickness');
const patternAmount = document.getElementById('patternAmount');
const useDots = document.getElementById('useDots');
const useSwirls = document.getElementById('useSwirls');
const useShapes = document.getElementById('useShapes');
const penSize = document.getElementById('penSize');

let sourceImage = null;
let lastMode = 'dark';
let drawing = false;

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
      setStatus('Photo loaded. Choose a template option.');
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
  const output = tctx.createImageData(width, height);
  const dst = output.data;

  const threshold = Number(detail.value);
  const alpha = mode === 'light' ? 70 : 255;
  const lineValue = mode === 'light' ? 175 : 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      const gx = grey(src, i + 4) - grey(src, i - 4);
      const gy = grey(src, i + width * 4) - grey(src, i - width * 4);
      const mag = Math.sqrt(gx * gx + gy * gy);
      dst[i] = 255; dst[i + 1] = 255; dst[i + 2] = 255; dst[i + 3] = 255;
      if (mag > threshold) {
        dst[i] = lineValue;
        dst[i + 1] = lineValue;
        dst[i + 2] = lineValue;
        dst[i + 3] = alpha;
      }
    }
  }

  tctx.putImageData(output, 0, 0);
  thickenLines(Number(thickness.value), mode);
  addDoodlePatterns(mode);

  if (mode === 'online') {
    setStatus('Online template ready. Draw with mouse, stylus, or finger.');
  } else {
    setStatus(`${mode === 'light' ? 'Light' : 'Dark'} printable template generated.`);
  }
}

function grey(data, i) {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

function thickenLines(size, mode) {
  if (size <= 1) return;
  const temp = document.createElement('canvas');
  temp.width = templateCanvas.width;
  temp.height = templateCanvas.height;
  const c = temp.getContext('2d');
  c.drawImage(templateCanvas, 0, 0);

  tctx.clearRect(0, 0, templateCanvas.width, templateCanvas.height);
  tctx.fillStyle = 'white';
  tctx.fillRect(0, 0, templateCanvas.width, templateCanvas.height);
  tctx.globalAlpha = mode === 'light' ? 0.35 : 1;
  for (let dx = -size; dx <= size; dx++) {
    for (let dy = -size; dy <= size; dy++) {
      if (Math.abs(dx) + Math.abs(dy) <= size) tctx.drawImage(temp, dx, dy);
    }
  }
  tctx.globalAlpha = 1;
}

function addDoodlePatterns(mode) {
  const amount = Number(patternAmount.value);
  if (amount === 0) return;

  const colour = mode === 'light' ? 'rgba(150,150,150,.35)' : 'rgba(0,0,0,.75)';
  tctx.strokeStyle = colour;
  tctx.fillStyle = colour;
  tctx.lineWidth = mode === 'light' ? 1 : 1.5;

  const count = Math.floor(amount * 1.2);
  const seed = 42;
  let r = seed;
  const rand = () => {
    r = (r * 1664525 + 1013904223) % 4294967296;
    return r / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    const x = rand() * templateCanvas.width;
    const y = rand() * templateCanvas.height;
    const s = 6 + rand() * 30;

    if (useDots.checked && i % 3 === 0) {
      tctx.beginPath();
      tctx.arc(x, y, 1 + rand() * 3, 0, Math.PI * 2);
      tctx.fill();
    }
    if (useSwirls.checked && i % 3 === 1) {
      tctx.beginPath();
      for (let a = 0; a < Math.PI * 3; a += 0.2) {
        const rr = s * a / (Math.PI * 3);
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (a === 0) tctx.moveTo(px, py); else tctx.lineTo(px, py);
      }
      tctx.stroke();
    }
    if (useShapes.checked && i % 3 === 2) {
      const sides = 3 + Math.floor(rand() * 4);
      tctx.beginPath();
      for (let p = 0; p < sides; p++) {
        const a = (Math.PI * 2 * p) / sides;
        const px = x + Math.cos(a) * s;
        const py = y + Math.sin(a) * s;
        if (p === 0) tctx.moveTo(px, py); else tctx.lineTo(px, py);
      }
      tctx.closePath();
      tctx.stroke();
    }
  }
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
  link.download = `doodle-template-${lastMode}.png`;
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
