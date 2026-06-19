const photoInput = document.getElementById('photoInput');
const templateCanvas = document.getElementById('templateCanvas');
const drawCanvas = document.getElementById('drawCanvas');
const tctx = templateCanvas.getContext('2d', { willReadFrequently: true });
const dctx = drawCanvas.getContext('2d');
const statusEl = document.getElementById('status');

const detail = document.getElementById('detail');
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

  const greyMap = buildGreyMap(src, width, height);
  const edgeMap = buildEdgeMap(greyMap, width, height);

  clearTemplate(mode);
  drawPhotoBasedContours(greyMap, edgeMap, width, height, mode);
  addFeatureHatching(greyMap, edgeMap, width, height, mode);
  addDoodlePatterns(greyMap, edgeMap, width, height, mode);

  if (mode === 'online') {
    setStatus('Online template ready. Draw with mouse, stylus, or finger.');
  } else {
    setStatus(`${mode === 'light' ? 'Light' : 'Dark'} printable template generated.`);
  }
}

function clearTemplate(mode) {
  tctx.clearRect(0, 0, templateCanvas.width, templateCanvas.height);
  tctx.fillStyle = 'white';
  tctx.fillRect(0, 0, templateCanvas.width, templateCanvas.height);
  tctx.globalAlpha = mode === 'light' ? 0.55 : 1;
}

function buildGreyMap(data, width, height) {
  const grey = new Float32Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    grey[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // Small blur to reduce photo noise while keeping main forms.
  const blurred = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      blurred[p] = (
        grey[p] * 4 +
        grey[p - 1] * 2 + grey[p + 1] * 2 +
        grey[p - width] * 2 + grey[p + width] * 2 +
        grey[p - width - 1] + grey[p - width + 1] +
        grey[p + width - 1] + grey[p + width + 1]
      ) / 16;
    }
  }
  return blurred;
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

function drawPhotoBasedContours(grey, edges, width, height, mode) {
  const detailValue = Number(detail.value);
  // Higher detail slider = lower threshold = more lines.
  const edgeThreshold = Math.max(18, 145 - detailValue);
  const contourStep = Math.max(18, 70 - Math.round(detailValue / 3));
  const dotStep = mode === 'light' ? 2 : 1;

  for (let y = 2; y < height - 2; y += dotStep) {
    for (let x = 2; x < width - 2; x += dotStep) {
      const p = y * width + x;
      const edge = edges[p];
      const shade = grey[p];
      const neighbour = grey[p + 2];
      const contour = Math.floor(shade / contourStep) !== Math.floor(neighbour / contourStep);

      if (edge > edgeThreshold || contour) {
        const strength = Math.min(1, edge / 180);
        const baseAlpha = mode === 'light' ? 0.28 : 0.86;
        const alpha = contour ? baseAlpha * 0.55 : baseAlpha * (0.45 + strength);
        const line = autoLineWidth(edge, shade, contour);
        drawDotLinePixel(x, y, line, mode, alpha);
      }
    }
  }
  tctx.globalAlpha = 1;
}

function autoLineWidth(edge, shade, contour) {
  // Darker areas and stronger edges get thicker marks. Contours stay finer.
  if (contour) return 0.65;
  if (edge > 180 || shade < 65) return 2.4;
  if (edge > 110 || shade < 105) return 1.7;
  return 1.05;
}

function drawDotLinePixel(x, y, radius, mode, alpha) {
  const v = mode === 'light' ? 155 : 0;
  tctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
  tctx.beginPath();
  tctx.arc(x, y, radius, 0, Math.PI * 2);
  tctx.fill();
}

function addFeatureHatching(grey, edges, width, height, mode) {
  const colour = mode === 'light' ? 'rgba(120,120,120,.22)' : 'rgba(0,0,0,.42)';
  tctx.strokeStyle = colour;
  tctx.lineCap = 'round';

  const spacing = Math.max(14, 36 - Math.floor(Number(detail.value) / 5));
  for (let y = spacing; y < height - spacing; y += spacing) {
    for (let x = spacing; x < width - spacing; x += spacing) {
      const p = y * width + x;
      const shade = grey[p];
      const edge = edges[p];

      // Add small sketch strokes mostly in darker or detailed regions.
      if (shade < 175 || edge > 55) {
        const length = 6 + (255 - shade) / 18 + Math.min(edge / 18, 9);
        const angle = ((shade + edge) % 120) * Math.PI / 180;
        tctx.lineWidth = Math.max(0.6, Math.min(2.2, (255 - shade) / 130));
        tctx.beginPath();
        tctx.moveTo(x - Math.cos(angle) * length, y - Math.sin(angle) * length);
        tctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
        tctx.stroke();
      }
    }
  }
}

function addDoodlePatterns(grey, edges, width, height, mode) {
  const amount = Number(patternAmount.value);
  if (amount === 0) return;

  const colour = mode === 'light' ? 'rgba(130,130,130,.28)' : 'rgba(0,0,0,.62)';
  tctx.strokeStyle = colour;
  tctx.fillStyle = colour;
  tctx.lineCap = 'round';

  const seed = 282;
  let r = seed;
  const rand = () => {
    r = (r * 1664525 + 1013904223) % 4294967296;
    return r / 4294967296;
  };

  // More patterns than before, but placed preferentially where the photo has detail.
  const count = Math.floor(amount * 4.5);
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < count * 20) {
    attempts++;
    const x = Math.floor(rand() * width);
    const y = Math.floor(rand() * height);
    const p = y * width + x;
    const shade = grey[p] || 255;
    const edge = edges[p] || 0;

    // Avoid empty white margins; favour darker/detail areas so it resembles the source photo.
    const interesting = shade < 210 || edge > 35;
    if (!interesting && rand() > 0.08) continue;

    const s = 4 + rand() * (10 + amount / 3);
    const weight = Math.max(0.6, Math.min(2.6, (255 - shade) / 100 + edge / 180));
    tctx.lineWidth = mode === 'light' ? weight * 0.75 : weight;

    if (useDots.checked && placed % 3 === 0) {
      tctx.beginPath();
      tctx.arc(x, y, 0.8 + rand() * Math.min(4, s / 3), 0, Math.PI * 2);
      tctx.fill();
    }

    if (useSwirls.checked && placed % 3 === 1) {
      const turns = 2.2 + rand() * 2.2;
      tctx.beginPath();
      for (let a = 0; a < Math.PI * turns; a += 0.22) {
        const rr = s * a / (Math.PI * turns);
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (a === 0) tctx.moveTo(px, py); else tctx.lineTo(px, py);
      }
      tctx.stroke();
    }

    if (useShapes.checked && placed % 3 === 2) {
      const sides = 3 + Math.floor(rand() * 4);
      tctx.beginPath();
      for (let n = 0; n < sides; n++) {
        const a = (Math.PI * 2 * n) / sides + rand() * 0.25;
        const px = x + Math.cos(a) * s;
        const py = y + Math.sin(a) * s;
        if (n === 0) tctx.moveTo(px, py); else tctx.lineTo(px, py);
      }
      tctx.closePath();
      tctx.stroke();
    }

    placed++;
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
