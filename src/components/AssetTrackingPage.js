import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Calendar, CheckCircle, XCircle, Activity, TrendingUp,
  GitCompare, Upload, AlertTriangle, Shield, Download, Link,
  X, ChevronRight, Eye, Cpu, Hash, Fingerprint, Lock, Clock, Wrench, MapPin, Trash2
} from 'lucide-react';
import './AssetTrackingPage.css';

// ─── pHash (16×16 DCT-based — 256 bits, much more discriminating than 8×8) ───
const computePerceptualHashFromCanvas = (canvas) => {
  try {
    // Step 1: Scale to 32×32 for DCT input
    const SIZE = 32;
    const small = document.createElement('canvas');
    small.width = SIZE; small.height = SIZE;
    const ctx = small.getContext('2d');
    ctx.drawImage(canvas, 0, 0, SIZE, SIZE);
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

    // Step 2: Convert to grayscale float grid
    const gray = [];
    for (let i = 0; i < SIZE * SIZE; i++)
      gray.push(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);

    // Step 3: 2D DCT (compute top-left 16×16 low-frequency block)
    const DCT = 16;
    const dct = [];
    for (let u = 0; u < DCT; u++) {
      for (let v = 0; v < DCT; v++) {
        let sum = 0;
        for (let x = 0; x < SIZE; x++)
          for (let y = 0; y < SIZE; y++)
            sum += gray[x * SIZE + y]
              * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIZE))
              * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * SIZE));
        dct.push(sum);
      }
    }

    // Step 4: Remove DC coefficient (index 0), use remaining 255 values
    const acDct = dct.slice(1); // 255 values
    const median = [...acDct].sort((a, b) => a - b)[Math.floor(acDct.length / 2)];

    // Step 5: Build 256-bit hash (pad to 256 with DC bit = 1)
    const bits = ['1', ...acDct.map(v => (v >= median ? '1' : '0'))];
    // bits.length = 256
    let hex = '';
    for (let i = 0; i < 256; i += 4)
      hex += parseInt(bits.slice(i, i + 4).join(''), 2).toString(16);
    return hex.toUpperCase(); // 64-char hex = 256 bits
  } catch { return null; }
};

// pHash similarity — works on both 16-char (old 8×8) and 64-char (new 16×16)
const pHashSimilarity = (h1, h2) => {
  if (!h1 || !h2) return 0;
  // If lengths differ (old vs new format), can't compare — return 0
  if (h1.length !== h2.length) return 0;
  const totalBits = h1.length * 4;
  let diff = 0;
  for (let i = 0; i < h1.length; i++) {
    const b1 = parseInt(h1[i], 16).toString(2).padStart(4, '0');
    const b2 = parseInt(h2[i], 16).toString(2).padStart(4, '0');
    for (let j = 0; j < 4; j++) if (b1[j] !== b2[j]) diff++;
  }
  return Math.round(((totalBits - diff) / totalBits) * 100);
};

// ─── Rotate canvas by 90/180/270 degrees ─────────────────────────────────────
const rotateCanvas = (src, degrees) => {
  const c = document.createElement('canvas');
  const swap = degrees === 90 || degrees === 270;
  c.width  = swap ? src.height : src.width;
  c.height = swap ? src.width  : src.height;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
};

// Try all 4 rotations and return the best pHash similarity
const pHashSimWithRotation = (uploadedCanvas, origPHash) => {
  if (!origPHash) return { sim: 0, rotation: 0 };
  let best = { sim: 0, rotation: 0 };
  for (const deg of [0, 90, 180, 270]) {
    const c   = deg === 0 ? uploadedCanvas : rotateCanvas(uploadedCanvas, deg);
    const h   = computePerceptualHashFromCanvas(c);
    const sim = pHashSimilarity(h, origPHash);
    if (sim > best.sim) best = { sim, rotation: deg };
  }
  return best;
};

// ─── Colour histogram comparison (32-bin per channel) ────────────────────────
const computeColorHistogram = (canvas) => {
  try {
    const SIZE = 128;
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    c.getContext('2d').drawImage(canvas, 0, 0, SIZE, SIZE);
    const data = c.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
    const BINS = 32;
    const r = new Float32Array(BINS);
    const g = new Float32Array(BINS);
    const b = new Float32Array(BINS);
    const total = SIZE * SIZE;
    for (let i = 0; i < total; i++) {
      r[Math.floor(data[i * 4]     / (256 / BINS))]++;
      g[Math.floor(data[i * 4 + 1] / (256 / BINS))]++;
      b[Math.floor(data[i * 4 + 2] / (256 / BINS))]++;
    }
    // Normalise
    for (let i = 0; i < BINS; i++) { r[i] /= total; g[i] /= total; b[i] /= total; }
    return { r, g, b };
  } catch { return null; }
};

// Bhattacharyya coefficient — 1.0 = identical, 0.0 = completely different
const histogramSimilarity = (h1, h2) => {
  if (!h1 || !h2) return 0;
  const BINS = h1.r.length;
  let bc = 0;
  for (let i = 0; i < BINS; i++)
    bc += Math.sqrt(h1.r[i] * h2.r[i]) + Math.sqrt(h1.g[i] * h2.g[i]) + Math.sqrt(h1.b[i] * h2.b[i]);
  return Math.round((bc / 3) * 100); // 0–100
};

// ─── SHA-256 ──────────────────────────────────────────────────────────────────
const computeFileSHA256 = async (file) => {
  try {
    const buf = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
};

// ─── Load image from base64/URL into a canvas ─────────────────────────────────
const loadImageToCanvas = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = reject;
    img.src = src;
  });
};

// ─── Pixel-level diff between two canvases ────────────────────────────────────
// Scales both to a common size, compares every pixel, returns region map + stats
const runPixelDiff = async (origSrc, uploadedCanvas) => {
  try {
    const origCanvas = await loadImageToCanvas(origSrc);

    // Work at a fixed analysis size to normalise resolution differences
    const SIZE = 256;
    const makeScaled = (src) => {
      const c = document.createElement('canvas');
      c.width = SIZE; c.height = SIZE;
      c.getContext('2d').drawImage(src, 0, 0, SIZE, SIZE);
      return c.getContext('2d').getImageData(0, 0, SIZE, SIZE);
    };

    const origData     = makeScaled(origCanvas);
    const uploadedData = makeScaled(uploadedCanvas);

    const GRID = 4; // 4×4 = 16 regions
    const cellW = SIZE / GRID;
    const cellH = SIZE / GRID;

    let totalDiff = 0;
    let changedPixels = 0;
    const regionDiffs = Array(GRID).fill(null).map(() => Array(GRID).fill(0));
    const regionCounts = Array(GRID).fill(null).map(() => Array(GRID).fill(0));

    // brightness & colour channel averages
    let origBrightSum = 0, upBrightSum = 0;
    let origRSum = 0, origGSum = 0, origBSum = 0;
    let upRSum = 0, upGSum = 0, upBSum = 0;

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const idx = (y * SIZE + x) * 4;
        const oR = origData.data[idx],     oG = origData.data[idx+1], oB = origData.data[idx+2];
        const uR = uploadedData.data[idx], uG = uploadedData.data[idx+1], uB = uploadedData.data[idx+2];

        const diff = (Math.abs(oR - uR) + Math.abs(oG - uG) + Math.abs(oB - uB)) / 3;
        totalDiff += diff;
        if (diff > 15) changedPixels++; // ✅ lowered from 25 → 15 for better sensitivity

        const gx = Math.min(Math.floor(x / cellW), GRID - 1);
        const gy = Math.min(Math.floor(y / cellH), GRID - 1);
        regionDiffs[gy][gx] += diff;
        regionCounts[gy][gx]++;

        origBrightSum += (oR + oG + oB) / 3;
        upBrightSum   += (uR + uG + uB) / 3;
        origRSum += oR; origGSum += oG; origBSum += oB;
        upRSum   += uR; upGSum   += uG; upBSum   += uB;
      }
    }

    const totalPixels = SIZE * SIZE;
    const avgDiff = totalDiff / totalPixels;
    const changedPct = (changedPixels / totalPixels) * 100;

    // Brightness shift
    const origBright = origBrightSum / totalPixels;
    const upBright   = upBrightSum   / totalPixels;
    const brightShift = upBright - origBright;

    // Colour channel shifts
    const rShift = (upRSum - origRSum) / totalPixels;
    const gShift = (upGSum - origGSum) / totalPixels;
    const bShift = (upBSum - origBSum) / totalPixels;

    // Normalise region diffs to 0-100
    const regionScores = regionDiffs.map((row, gy) =>
      row.map((sum, gx) => regionCounts[gy][gx] > 0 ? sum / regionCounts[gy][gx] : 0)
    );

    // Name the regions for human-readable output
    const rowNames = ['Top', 'Upper-middle', 'Lower-middle', 'Bottom'];
    const colNames = ['left', 'center-left', 'center-right', 'right'];

    const hotRegions = [];
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        if (regionScores[gy][gx] > 8) {
          hotRegions.push({
            name: `${rowNames[gy]} ${colNames[gx]}`,
            score: Math.round(regionScores[gy][gx]),
            severity: regionScores[gy][gx] > 25 ? 'high' : regionScores[gy][gx] > 12 ? 'medium' : 'low'
          });
        }
      }
    }

    // Sort hottest first
    hotRegions.sort((a, b) => b.score - a.score);

    return {
      avgDiff: Math.round(avgDiff * 10) / 10,
      changedPct: Math.round(changedPct * 10) / 10,
      changedPixels,
      totalPixels,
      hotRegions,
      brightShift: Math.round(brightShift * 10) / 10,
      rShift: Math.round(rShift),
      gShift: Math.round(gShift),
      bShift: Math.round(bShift),
      pixelSimilarity: Math.round(Math.max(0, 100 - changedPct * 1.5))
    };
  } catch (e) {
    return null;
  }
};

// ─── Deep image binary tool detector ─────────────────────────────────────────
// Reads quantization tables, JFIF/EXIF markers, chroma, XMP, ICC, APP13
// Uses a scoring system — each platform accumulates points from matching signals
const extractEditingToolFromFile = (file, imgW = 0, imgH = 0) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf  = e.target.result;
        const view = new DataView(buf);
        const sig32 = view.getUint32(0, false);

        // PNG
        if (sig32 === 0x89504E47) { resolve(parsePNGChunks(view)); return; }
        // Not JPEG
        if (view.getUint16(0, false) !== 0xFFD8) { resolve(null); return; }

        // ── Parse all JPEG segments ──────────────────────────────────────
        let software = null, xmpTool = null, comment = null;
        let hasJFIF = false, jfifVersion = null;
        let hasExif = false, hasApp13 = false, hasAdobeICC = false;
        let make = null, chromaSub = null;
        let lumTable = null, chromTable = null; // full 64-coeff quantization tables

        let offset = 2;
        while (offset < view.byteLength - 4) {
          const marker = view.getUint16(offset, false);
          offset += 2;
          if (marker === 0xFFDA) break; // SOS

          const segLen = view.getUint16(offset, false);

          // APP0 JFIF
          if (marker === 0xFFE0) {
            const id = readStr(view, offset + 2, 5);
            if (id.startsWith('JFIF')) {
              hasJFIF = true;
              jfifVersion = `${view.getUint8(offset + 7)}.${view.getUint8(offset + 8).toString().padStart(2,'0')}`;
            }
          }

          // APP1 Exif or XMP
          if (marker === 0xFFE1) {
            const hdr = readStr(view, offset + 2, 6);
            if (hdr.startsWith('Exif')) {
              hasExif = true;
              const ts = offset + 8;
              const le = view.getUint16(ts, false) === 0x4949;
              const ifd = view.getUint32(ts + 4, le);
              const num = view.getUint16(ts + ifd, le);
              for (let i = 0; i < num; i++) {
                const en  = ts + ifd + 2 + i * 12;
                if (en + 12 > ts + segLen) break;
                const tag = view.getUint16(en, le);
                const cnt = view.getUint32(en + 4, le);
                const vo  = cnt > 4 ? ts + view.getUint32(en + 8, le) : en + 8;
                if (tag === 0x0131) software = readStr(view, vo, Math.min(cnt, 100)).replace(/\0/g,'').trim();
                if (tag === 0x010F) make     = readStr(view, vo, Math.min(cnt,  60)).replace(/\0/g,'').trim();
                if (tag === 0x013C) comment  = comment || readStr(view, vo, Math.min(cnt, 200)).replace(/\0/g,'').trim();
                if (tag === 0x9286) comment  = comment || readStr(view, vo + 8, Math.min(cnt - 8, 200)).replace(/\0/g,'').trim();
              }
            }
            const fullHdr = readStr(view, offset + 2, 30);
            if (fullHdr.includes('http') || fullHdr.includes('xpacket')) {
              const xmp = readStr(view, offset + 2, Math.min(segLen - 2, 4000));
              for (const p of [/xmp:CreatorTool[^>]*?>([^<]{1,100})</,/CreatorTool[^>]*?>([^<]{1,100})</]) {
                const m = xmp.match(p);
                if (m) { xmpTool = m[1].trim(); break; }
              }
            }
          }

          // APP2 ICC
          if (marker === 0xFFE2) {
            const s = readStr(view, offset + 2, Math.min(segLen, 400));
            if (s.includes('ICC_PROFILE') && (s.includes('Adobe') || s.includes('ProPhoto'))) hasAdobeICC = true;
          }

          // APP13 Photoshop
          if (marker === 0xFFED && readStr(view, offset + 2, 12).includes('Photoshop')) hasApp13 = true;

          // COM comment
          if (marker === 0xFFFE) comment = comment || readStr(view, offset + 2, Math.min(segLen - 2, 200)).replace(/\0/g,'').trim();

          // DQT — quantization tables (the core platform fingerprint)
          if (marker === 0xFFDB) {
            let tOffset = offset + 2; // skip length
            const tEnd  = offset + segLen;
            while (tOffset < tEnd - 1) {
              const ptq      = view.getUint8(tOffset); tOffset++;
              const precision = (ptq >> 4) & 0xF; // 0=8bit, 1=16bit
              const tableId  = ptq & 0xF;          // 0=luminance, 1=chrominance
              const coefSize = precision === 0 ? 1 : 2;
              const table    = [];
              for (let i = 0; i < 64; i++) {
                if (tOffset + coefSize > view.byteLength) break;
                table.push(precision === 0
                  ? view.getUint8(tOffset)
                  : view.getUint16(tOffset, false));
                tOffset += coefSize;
              }
              if (table.length === 64) {
                if (tableId === 0) lumTable   = table;
                if (tableId === 1) chromTable = table;
              }
            }
          }

          // SOF — chroma subsampling
          if (marker === 0xFFC0 || marker === 0xFFC2) {
            try {
              if (segLen >= 15 && view.getUint8(offset + 7) >= 3) {
                const h1 = (view.getUint8(offset +  9) >> 4) & 0xF;
                const h2 = (view.getUint8(offset + 12) >> 4) & 0xF;
                chromaSub = h1 === 2 && h2 === 1 ? '4:2:0' : h1 === 2 && h2 === 2 ? '4:2:2' : '4:4:4';
              }
            } catch {}
          }

          if (segLen < 2) break;
          offset += segLen;
        }

        // ── Definitive metadata matches ───────────────────────────────────
        if (software)  { const t = classifyFromSoftwareString(software); if (t) { resolve(t); return; } }
        if (xmpTool)   { const t = classifyFromSoftwareString(xmpTool);  if (t) { resolve(t); return; } }
        if (hasApp13)  { resolve('Adobe Photoshop'); return; }
        if (hasAdobeICC && !hasJFIF) { resolve('Adobe Photoshop / Lightroom'); return; }
        const cmt = (comment || '').toLowerCase();
        if (cmt.includes('gimp'))       { resolve('GIMP'); return; }
        if (cmt.includes('photoshop'))  { resolve('Adobe Photoshop'); return; }
        if (cmt.includes('canva'))      { resolve('Canva'); return; }
        if (cmt.includes('snapseed'))   { resolve('Snapseed'); return; }

        // ── No metadata — use quantization table scoring system ───────────
        resolve(classifyByQuantizationTables({
          lumTable, chromTable, chromaSub, hasJFIF, hasExif,
          jfifVersion, make, imgW, imgH
        }));

      } catch { resolve(null); }
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, 1024 * 1024));
  });
};

// ── Quantization table scoring system ────────────────────────────────────────
// Each platform encodes JPEG with a fixed encoder/quality setting producing
// predictable quantization table values. We score each platform by how closely
// the image's tables match known platform fingerprints.
const classifyByQuantizationTables = ({ lumTable, chromTable, chromaSub,
  hasJFIF, hasExif, jfifVersion, make, imgW, imgH }) => {

  if (!lumTable) {
    // No quantization table readable — can still use structural signals
    if (!hasExif && hasJFIF) return 'Messenger / Social App (EXIF stripped)';
    return null;
  }

  const maxDim = Math.max(imgW, imgH);

  // ── Compute table statistics ──────────────────────────────────────────────
  const lumSum  = lumTable.reduce((a, b) => a + b, 0);
  const lumAvg  = lumSum / 64;
  const lumDC   = lumTable[0];  // DC coefficient (index 0 in zigzag = top-left)
  const lumAC1  = lumTable[1];  // First AC coefficient
  const lumAC2  = lumTable[8];  // Second row DC
  const lumHigh = lumTable.slice(32).reduce((a, b) => a + b, 0) / 32; // high-freq avg

  const chromSum = chromTable ? chromTable.reduce((a, b) => a + b, 0) : 0;
  const chromDC  = chromTable ? chromTable[0] : 0;

  // IJG quality from table average (reverse formula)
  const estQuality = lumAvg < 100
    ? Math.round((200 - lumAvg * 2) / 2)
    : Math.round(5000 / lumAvg);
  const q = Math.max(1, Math.min(100, estQuality));

  // ── Platform scoring ──────────────────────────────────────────────────────
  const scores = {
    whatsapp:  0,
    instagram: 0,
    telegram:  0,
    facebook:  0,
    twitter:   0,
    snapchat:  0,
  };

  // ── WhatsApp standard (quality ~80, libjpeg Q80 tables) ──────────────────
  // DC lum coeff = 8, chroma uses 4:2:0, strips EXIF, JFIF header
  // WhatsApp uses libwebp/libjpeg quality 80 → DC=8, chromaDC≈8, chromaSub=4:2:0
  if (lumDC >= 6  && lumDC <= 10)   scores.whatsapp += 30;
  if (lumAvg >= 8 && lumAvg <= 14)  scores.whatsapp += 20;
  if (chromaSub === '4:2:0')        scores.whatsapp += 25;
  if (!hasExif && hasJFIF)          scores.whatsapp += 15;
  if (maxDim <= 1600 && maxDim > 0) scores.whatsapp += 15;
  if (maxDim <= 1601 && chromDC >= 5 && chromDC <= 12) scores.whatsapp += 10;

  // WhatsApp HD (quality ~90)
  // DC=4-5, uses same 4:2:0 chroma, max 2560px
  const isWAHD = lumDC >= 3 && lumDC <= 6 && chromaSub === '4:2:0' && maxDim > 1600 && maxDim <= 2560;
  if (isWAHD) { scores.whatsapp += 20; }

  // ── Instagram (quality ~78, specific encoder tables) ─────────────────────
  // Instagram uses quality ~78, DC lum coeff ~9-11
  // Key: always exactly 1080px on long edge
  if (imgW === 1080 || imgH === 1080)  scores.instagram += 50; // very strong
  if (imgW === 1080 && imgH === 1920)  scores.instagram += 20; // stories
  if (lumDC >= 8  && lumDC <= 13)      scores.instagram += 20;
  if (lumAvg >= 10 && lumAvg <= 18)    scores.instagram += 15;
  if (!hasExif && hasJFIF)             scores.instagram += 10;
  if (chromaSub === '4:2:0')           scores.instagram += 5;

  // ── Telegram (quality ~90-95, uses 4:2:2 or 4:4:4, keeps higher quality) ──
  // Telegram DC lum coeff = 3-5 (high quality = low coeff)
  // Key distinguisher: does NOT use 4:2:0 (uses 4:2:2 or 4:4:4)
  if (lumDC >= 2  && lumDC <= 6)           scores.telegram += 25;
  if (lumAvg >= 3 && lumAvg <= 9)          scores.telegram += 20;
  if (chromaSub === '4:2:2')               scores.telegram += 40; // very strong
  if (chromaSub === '4:4:4')               scores.telegram += 30;
  if (!hasExif && hasJFIF)                 scores.telegram += 10;
  if (maxDim <= 2560)                      scores.telegram += 5;
  if (chromaSub === '4:2:0')               scores.telegram -= 40; // penalise — WA not Telegram

  // ── Facebook (quality ~85, max 960px standard / 2048 HD) ─────────────────
  if (maxDim === 960 || maxDim === 720)     scores.facebook += 40;
  if (maxDim === 2048)                      scores.facebook += 35;
  if (lumDC >= 5  && lumDC <= 9)           scores.facebook += 20;
  if (!hasExif && hasJFIF)                 scores.facebook += 10;

  // ── Twitter / X (quality ~85, max 1200px wide) ───────────────────────────
  if (imgW === 1200 || imgH === 1200)       scores.twitter += 45;
  if (lumDC >= 5  && lumDC <= 9)           scores.twitter += 15;
  if (!hasExif && hasJFIF)                 scores.twitter += 10;

  // ── Snapchat (quality ~75, heavy 4:2:0, max 1080px) ─────────────────────
  if (lumDC >= 10 && lumDC <= 16)          scores.snapchat += 20;
  if (lumAvg >= 14 && lumAvg <= 22)        scores.snapchat += 15;
  if (chromaSub === '4:2:0')               scores.snapchat += 10;
  if ((imgW === 1080 && imgH === 1920) ||
      (imgW === 720  && imgH === 1280))     scores.snapchat += 40;

  // ── Penalise platforms when EXIF is present (social apps strip it) ────────
  if (hasExif) {
    scores.whatsapp  -= 50;
    scores.instagram -= 50;
    scores.telegram  -= 30;
    scores.facebook  -= 50;
    scores.twitter   -= 50;
  }

  // ── Find winner ───────────────────────────────────────────────────────────
  const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const [platform, score] = winner;
  const threshold = 40; // minimum score to make a confident claim

  if (score < threshold) {
    // Not confident — return what we know
    if (!hasExif && hasJFIF)
      return `Social Media / Messenger (EXIF stripped — quality ~${q}%, DC=${lumDC}, ${chromaSub || 'chroma N/A'})`;
    return null;
  }

  const detail = `quality ~${q}%, DC=${lumDC}, ${chromaSub || ''}`;

  switch (platform) {
    case 'whatsapp':
      return isWAHD
        ? `WhatsApp HD (re-encoded — ${maxDim}px, ${detail})`
        : `WhatsApp (re-encoded — ${maxDim > 0 ? maxDim + 'px, ' : ''}${detail})`;
    case 'instagram':
      return (imgW === 1080 && imgH === 1920)
        ? `Instagram Stories/Reels (1080×1920, ${detail})`
        : `Instagram (re-encoded — 1080px, ${detail})`;
    case 'telegram':
      return `Telegram (re-encoded — ${maxDim > 0 ? maxDim + 'px, ' : ''}${detail})`;
    case 'facebook':
      return maxDim === 2048
        ? `Facebook HD (re-encoded — 2048px, ${detail})`
        : `Facebook (re-encoded — ${maxDim}px, ${detail})`;
    case 'twitter':
      return `Twitter / X (re-encoded — 1200px, ${detail})`;
    case 'snapchat':
      return `Snapchat (re-encoded — ${detail})`;
    default:
      return null;
  }
};






// ─── Helper: read ASCII string from DataView ─────────────────────────────────
const readStr = (view, offset, len) => {
  let s = '';
  for (let i = 0; i < len && offset + i < view.byteLength; i++)
    s += String.fromCharCode(view.getUint8(offset + i));
  return s;
};

// ─── Helper: classify from a software string ─────────────────────────────────
const classifyFromSoftwareString = (sw) => {
  const s = (sw || '').toLowerCase();
  if (s.includes('adobe photoshop'))  return sw;
  if (s.includes('adobe lightroom'))  return sw;
  if (s.includes('adobe'))            return sw;
  if (s.includes('gimp'))             return sw;
  if (s.includes('inkscape'))         return 'Inkscape';
  if (s.includes('paint.net'))        return 'Paint.NET';
  if (s.includes('affinity'))         return sw;
  if (s.includes('canva'))            return 'Canva';
  if (s.includes('snapseed'))         return 'Snapseed';
  if (s.includes('vsco'))             return 'VSCO';
  if (s.includes('picsart'))          return 'PicsArt';
  if (s.includes('pixelmator'))       return 'Pixelmator';
  if (s.includes('darktable'))        return 'Darktable';
  if (s.includes('capture one'))      return 'Capture One';
  if (s.includes('facetune'))         return 'Facetune';
  if (s.includes('lightx'))           return 'LightX';
  return sw;
};

// ─── Helper: parse PNG chunks for software metadata ──────────────────────────
const parsePNGChunks = (view) => {
  try {
    let offset = 8;
    let software = null, hasICC = false, iccProfile = '', hasXMP = false;
    let xmpTool = null, allTextKeys = [], physX = null, physUnit = null;

    while (offset < view.byteLength - 12) {
      const length = view.getUint32(offset, false);
      const type   = readStr(view, offset + 4, 4);

      if (type === 'tEXt' || type === 'iTXt') {
        const data  = readStr(view, offset + 8, Math.min(length, 1000));
        const lower = data.toLowerCase();
        const parts = data.split('\x00');
        const key   = (parts[0] || '').toLowerCase().trim();
        const val   = parts.slice(1).join('').trim();
        allTextKeys.push(key);
        if (key === 'software' && val)               software = val;
        if (key === 'comment'  && val && !software)  software = software || (val.toLowerCase().includes('gimp') || val.toLowerCase().includes('inkscape') ? val : null);
        if (val.toLowerCase().includes('gimp'))      software = software || val;
        if (val.toLowerCase().includes('inkscape'))  software = software || val;
        if (val.toLowerCase().includes('photoshop')) software = software || val;
        if (val.toLowerCase().includes('canva'))     software = software || 'Canva';
        if (val.toLowerCase().includes('paint.net')) software = software || 'Paint.NET';
        if (lower.includes('xpacket') || lower.includes('xmpmeta')) {
          hasXMP = true;
          const m = data.match(/CreatorTool[^>]*?>([^<]{1,100})</);
          if (m) xmpTool = m[1].trim();
        }
      }

      if (type === 'iCCP') {
        hasICC = true;
        iccProfile = readStr(view, offset + 8, Math.min(40, length)).split('\x00')[0].trim();
      }

      if (type === 'pHYs' && length === 9) {
        physX    = view.getUint32(offset + 8,  false);
        physUnit = view.getUint8(offset + 16);
      }

      if (type === 'IEND') break;
      if (length > 100 * 1024 * 1024) break;
      offset += 12 + length;
    }

    if (software) return classifyFromSoftwareString(software);
    if (xmpTool)  return classifyFromSoftwareString(xmpTool);
    if (hasICC) {
      const icc = iccProfile.toLowerCase();
      if (icc.includes('adobe rgb') || icc.includes('prophoto')) return 'Adobe Photoshop / Lightroom (Adobe ICC profile)';
      if (icc.includes('display p3'))  return 'macOS App / Apple device (Display P3 profile)';
      return `Image Editor (ICC profile: ${iccProfile || 'sRGB'})`;
    }
    if (hasXMP) return 'Professional Editor (XMP metadata present)';
    if (physUnit === 1 && physX === 3937) return 'Windows App — Paint / Snipping Tool / Photos (96 DPI)';
    if (physUnit === 1 && physX === 3780) return 'macOS App — Preview / Screenshot (96 DPI)';
    if (physUnit === 1 && physX === 2835) return 'Standard screen export (72 DPI)';
    if (allTextKeys.length > 0) return `Edited — metadata present (${allTextKeys.slice(0,2).join(', ')})`;
    return 'No metadata recorded (screenshot or basic app)';
  } catch { return null; }
};

// ─── Format timestamp nicely ─────────────────────────────────────────────────
const formatTS = (ts) => {
  if (!ts) return 'Unknown';
  return new Date(ts).toLocaleString('en-US', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
};

// ─── Main comparison engine ───────────────────────────────────────────────────
const runComparison = async (uploadedCanvas, uploadedFile, originalAsset) => {
  const changes = [];
  const uploadedW = uploadedCanvas.width;
  const uploadedH = uploadedCanvas.height;

  const origResParts = (originalAsset.resolution || originalAsset.assetResolution || '0 x 0').split(' x ');
  const origW = parseInt(origResParts[0]) || 0;
  const origH = parseInt(origResParts[1]) || 0;

  // ── Timestamps ──────────────────────────────────────────────────────────────
  const originalCaptureTime = originalAsset.captureTimestamp || originalAsset.timestamp || originalAsset.dateEncrypted || null;
  // Only show modified file time when tampering is likely — suppress it for exact/clean matches
  // We set it now and will clear it at the end if no tampering found
  const rawModifiedFileTime = uploadedFile.lastModified || null;

  // ── Editing tool (EXIF) ─────────────────────────────────────────────────────
  const editingTool = await extractEditingToolFromFile(uploadedFile, uploadedW, uploadedH);

  // ── SHA-256 exact match ─────────────────────────────────────────────────────
  const uploadedSHA = await computeFileSHA256(uploadedFile);
  const origSHA = originalAsset.fileHash || null;
  if (origSHA && uploadedSHA && origSHA === uploadedSHA) {
    return {
      changes: [],
      isTampered: false,
      visualVerdict: 'Exact Match',
      confidence: 100,
      pHashSim: 100,
      pixelAnalysis: null,
      editingTool: null,
      originalCaptureTime,
      modifiedFileTime,
      origPHash: originalAsset.visualFingerprint,
      uploadedPHash: originalAsset.visualFingerprint,
      uploadedResolution: `${uploadedW} x ${uploadedH}`,
      uploadedSize: `${(uploadedFile.size / 1024).toFixed(1)} KB`,
      timestamp: new Date().toISOString(),
      exactMatch: true,
    };
  }

  // ── Pixel-level diff (requires stored thumbnail) ────────────────────────────
  let pixelAnalysis = null;
  if (originalAsset.thumbnail || originalAsset.thumbnailUrl || originalAsset.cloudinary_url) {
    const thumbSrc = originalAsset.thumbnail || originalAsset.thumbnailUrl || originalAsset.cloudinary_url;
    pixelAnalysis = await runPixelDiff(thumbSrc, uploadedCanvas);
  }

  // ── pHash with rotation detection ──────────────────────────────────────────
  const uploadedPHash = computePerceptualHashFromCanvas(uploadedCanvas);
  const origPHash     = originalAsset.visualFingerprint || null;

  // Try all 4 rotations — picks best match (detects rotated copies)
  const { sim: pSim, rotation: detectedRotation } = pHashSimWithRotation(uploadedCanvas, origPHash);

  // ── Colour histogram comparison ─────────────────────────────────────────────
  let histSim = null;
  if (originalAsset.thumbnail || originalAsset.thumbnailUrl || originalAsset.cloudinary_url) {
    try {
      const thumbSrc = originalAsset.thumbnail || originalAsset.thumbnailUrl || originalAsset.cloudinary_url;
      const origThumbCanvas = await loadImageToCanvas(thumbSrc);
      const h1 = computeColorHistogram(origThumbCanvas);
      const h2 = computeColorHistogram(uploadedCanvas);
      histSim  = histogramSimilarity(h1, h2);
    } catch { histSim = null; }
  }

  // ── 1. Resolution ───────────────────────────────────────────────────────────
  const widthDiff  = Math.abs(uploadedW - origW);
  const heightDiff = Math.abs(uploadedH - origH);
  const resChanged = origW > 0 && (
    (widthDiff / origW) > 0.10 || (heightDiff / (origH || 1)) > 0.10 ||
    widthDiff > 100 || heightDiff > 100
  );
  if (resChanged) {
    if (uploadedW < origW)
      changes.push({ type: 'warning', category: 'Resolution', text: `Resolution reduced: ${origW}×${origH} → ${uploadedW}×${uploadedH} (${Math.round((uploadedW / origW) * 100)}% of original)` });
    else if (uploadedW > origW)
      changes.push({ type: 'info', category: 'Resolution', text: `Resolution upscaled: ${origW}×${origH} → ${uploadedW}×${uploadedH}` });
    else
      changes.push({ type: 'warning', category: 'Resolution', text: `Dimensions changed: ${origW}×${origH} → ${uploadedW}×${uploadedH}` });
  }

  // ── 2. Aspect ratio / crop ──────────────────────────────────────────────────
  const uploadedAspect = uploadedW / uploadedH;
  const origAspect     = origW   / origH;
  if (origW > 0 && Math.abs(uploadedAspect - origAspect) > 0.08)
    changes.push({ type: 'danger', category: 'Cropping', text: `Image cropped — aspect ratio changed from ${origAspect.toFixed(2)} to ${uploadedAspect.toFixed(2)}` });

  // ── 3. File size / compression ──────────────────────────────────────────────
  const origSizeKB     = parseFloat((originalAsset.fileSize / 1024) || 0);
  const uploadedSizeKB = parseFloat((uploadedFile.size / 1024) || 0);
  if (origSizeKB > 0) {
    const pctDiff = ((origSizeKB - uploadedSizeKB) / origSizeKB) * 100;
    if (pctDiff > 20)
      changes.push({ type: 'warning', category: 'Compression', text: `Compressed — file size reduced by ${Math.round(pctDiff)}% (${origSizeKB.toFixed(0)} KB → ${uploadedSizeKB.toFixed(0)} KB)` });
    else if (pctDiff < -20)
      changes.push({ type: 'info', category: 'Compression', text: `Re-encoded to larger file — size increased by ${Math.round(Math.abs(pctDiff))}% (${origSizeKB.toFixed(0)} KB → ${uploadedSizeKB.toFixed(0)} KB)` });
  }

  // ── 4. Format conversion ────────────────────────────────────────────────────
  const uploadedFormat = (uploadedFile.type || '').split('/')[1]?.toUpperCase();
  const origFormat     = (originalAsset.fileName || '').split('.').pop()?.toUpperCase();
  if (uploadedFormat && origFormat && uploadedFormat !== origFormat && origFormat !== 'PNG')
    changes.push({ type: 'info', category: 'Format', text: `Format changed: ${origFormat} → ${uploadedFormat}` });

  // ── 5. Pixel-level findings ─────────────────────────────────────────────────
  if (pixelAnalysis) {
    const { changedPct, avgDiff, hotRegions, brightShift, rShift, gShift, bShift } = pixelAnalysis;

    // Changed pixel percentage
    if (changedPct > 0.5 && changedPct <= 5)
      changes.push({ type: 'warning', category: 'Pixel Edit', text: `Minor pixel edits detected — ${changedPct}% of pixels modified (localised change)` });
    else if (changedPct > 5 && changedPct <= 20)
      changes.push({ type: 'warning', category: 'Pixel Edit', text: `Moderate pixel edits — ${changedPct}% of pixels changed` });
    else if (changedPct > 20)
      changes.push({ type: 'danger', category: 'Pixel Edit', text: `Extensive pixel modifications — ${changedPct}% of image altered` });

    // Hot regions (where edits happened)
    if (hotRegions.length > 0) {
      const topRegions = hotRegions.slice(0, 3);
      topRegions.forEach(r => {
        changes.push({
          type: r.severity === 'high' ? 'danger' : 'warning',
          category: 'Region Edit',
          text: `Edit detected in ${r.name} region (intensity: ${r.score}/255)`
        });
      });
    }

    // Brightness shift
    if (Math.abs(brightShift) > 5)
      changes.push({ type: 'info', category: 'Colour', text: `Brightness ${brightShift > 0 ? 'increased' : 'decreased'} by ~${Math.abs(brightShift).toFixed(1)} points` });

    // Colour channel shifts
    const maxChannelShift = Math.max(Math.abs(rShift), Math.abs(gShift), Math.abs(bShift));
    if (maxChannelShift > 8) {
      const channelDesc = [];
      if (Math.abs(rShift) > 8) channelDesc.push(`Red ${rShift > 0 ? '+' : ''}${rShift}`);
      if (Math.abs(gShift) > 8) channelDesc.push(`Green ${gShift > 0 ? '+' : ''}${gShift}`);
      if (Math.abs(bShift) > 8) channelDesc.push(`Blue ${bShift > 0 ? '+' : ''}${bShift}`);
      changes.push({ type: 'info', category: 'Colour', text: `Colour grading / filter applied — channel shifts: ${channelDesc.join(', ')}` });
    }
  }

  // ── 6. pHash overall verdict ────────────────────────────────────────────────
  let visualVerdict = '';
  if (origPHash && uploadedPHash) {
    // Report rotation if detected via best-match rotation
    if (detectedRotation !== 0) {
      changes.push({ type: 'warning', category: 'Rotation', text: `Image rotated ${detectedRotation}° — best pHash match found at ${detectedRotation}° rotation (similarity: ${pSim}%)` });
    }

    if (pSim < 40) {
      changes.push({ type: 'danger', category: 'Visual', text: `Completely different image — perceptual similarity only ${pSim}% (likely unrelated content)` });
      visualVerdict = 'Completely Different';
    } else if (pSim < 60) {
      changes.push({ type: 'danger', category: 'Visual', text: `High visual divergence — perceptual similarity only ${pSim}%` });
      visualVerdict = 'Heavily Modified';
    } else if (pSim < 75) {
      changes.push({ type: 'warning', category: 'Visual', text: `Significant visual changes — perceptual similarity ${pSim}%` });
      visualVerdict = 'Moderately Modified';
    } else if (pSim < 90) {
      changes.push({ type: 'warning', category: 'Visual', text: `Noticeable visual changes — perceptual similarity ${pSim}%` });
      visualVerdict = 'Lightly Modified';
    } else {
      visualVerdict = pSim === 100 ? 'Exact Match' : 'Near-Identical';
    }
  } else if (!origPHash) {
    // No stored pHash — rely on histogram and pixel diff only
    if (histSim !== null && histSim < 40) {
      changes.push({ type: 'danger', category: 'Visual', text: `Very different colour profile — histogram similarity only ${histSim}% (likely different image)` });
      visualVerdict = 'Likely Different';
    }
  }

  // ── Colour histogram verdict (secondary signal) ─────────────────────────────
  if (histSim !== null && origPHash) {
    if (histSim < 40 && pSim < 60) {
      // Both signals agree it's a different image — strong evidence
      changes.push({ type: 'danger', category: 'Colour Profile', text: `Colour histogram very different — ${histSim}% similarity (confirms different image content)` });
    } else if (histSim < 60 && pSim < 75) {
      changes.push({ type: 'warning', category: 'Colour Profile', text: `Colour profile changed significantly — histogram similarity ${histSim}%` });
    }
  }

  // ── Editing tool flag ───────────────────────────────────────────────────────
  if (editingTool) {
    changes.push({ type: 'info', category: 'Tool', text: `Editing software detected in metadata: ${editingTool}` });
  }

  const isTampered = changes.some(c => c.type === 'danger' || c.type === 'warning');

  // Only expose the modified file time when tampering was actually found
  const modifiedFileTime = isTampered ? rawModifiedFileTime : null;

  // ── Confidence: multi-signal weighted score ─────────────────────────────────
  // Priority: pHash (most reliable) > histogram > pixel diff > structural checks
  let confidence;

  if (origPHash && uploadedPHash) {
    // We have a stored pHash — use it as the primary signal (weight 60%)
    confidence = pSim;

    // Blend in histogram if available (weight 25%)
    if (histSim !== null) {
      confidence = Math.round(confidence * 0.70 + histSim * 0.30);
    }

    // Apply pixel penalty only if pixel diff confirms changes
    if (pixelAnalysis) {
      const pixelPenalty = Math.min(20, pixelAnalysis.changedPct * 0.4);
      confidence = Math.round(Math.max(0, confidence - pixelPenalty));
    }
  } else if (histSim !== null) {
    // No stored pHash — use histogram as primary signal
    confidence = histSim;
    if (pixelAnalysis) {
      const pixelPenalty = Math.min(20, pixelAnalysis.changedPct * 0.4);
      confidence = Math.round(Math.max(0, confidence - pixelPenalty));
    }
  } else if (pixelAnalysis) {
    // Only pixel diff available
    confidence = pixelAnalysis.pixelSimilarity;
  } else {
    // Nothing to compare — show 0, not a fake 85
    confidence = 0;
  }

  if (resChanged)                                              confidence -= 15;
  if (changes.some(c => c.category === 'Cropping'))           confidence -= 20;
  if (changes.some(c => c.category === 'Compression'))        confidence -= 10;
  if (changes.some(c => c.category === 'Rotation'))           confidence -= 5;
  confidence = Math.max(0, Math.min(100, confidence));

  return {
    changes,
    isTampered,
    visualVerdict,
    confidence,
    pHashSim: pSim,
    histSim,
    detectedRotation,
    pixelAnalysis,
    editingTool,
    originalCaptureTime,
    modifiedFileTime,
    origPHash,
    uploadedPHash,
    uploadedResolution: `${uploadedW} x ${uploadedH}`,
    uploadedSize: `${uploadedSizeKB.toFixed(1)} KB`,
    timestamp: new Date().toISOString(),
    exactMatch: false,
  };
};

// ─── Download HTML Report ─────────────────────────────────────────────────────
const downloadHTMLReport = (originalAsset, result, origPreview, modPreview) => {
  const changeRows = result.changes.map(c => {
    const color = c.type === 'danger' ? '#e53e3e' : c.type === 'warning' ? '#dd6b20' : '#3182ce';
    const bg    = c.type === 'danger' ? '#fff5f5' : c.type === 'warning' ? '#fffaf0' : '#ebf8ff';
    return `<tr style="background:${bg}">
      <td style="color:${color};font-weight:700;white-space:nowrap">${c.category || c.type.toUpperCase()}</td>
      <td style="color:#2d3748">${c.text}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>PINIT Forensic Report — ${originalAsset.assetId || originalAsset.id}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Segoe UI',sans-serif;margin:0;padding:40px;background:#f0f4f8;color:#2d3748}
  .header{background:linear-gradient(135deg,#1a202c,#2d3748);color:white;padding:36px;border-radius:16px;margin-bottom:28px}
  .header h1{margin:0 0 6px;font-size:24px;letter-spacing:-0.5px}
  .header p{margin:0;opacity:.6;font-size:13px}
  .badge{display:inline-block;padding:6px 18px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:.5px;margin-top:14px}
  .badge-tampered{background:#fed7d7;color:#9b2c2c}
  .badge-clean{background:#c6f6d5;color:#22543d}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
  .card{background:white;border-radius:12px;padding:24px;box-shadow:0 2px 10px rgba(0,0,0,.07)}
  .card-head{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#718096;border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin:0 0 14px}
  .row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f7fafc;font-size:13px}
  .row:last-child{border:none}
  .lbl{font-weight:600;color:#4a5568}
  .val{color:#2d3748;font-family:monospace;font-size:12px;max-width:280px;word-break:break-all;text-align:right}
  .images{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
  .img-box{background:white;border-radius:12px;padding:16px;box-shadow:0 2px 10px rgba(0,0,0,.07);text-align:center}
  .img-box h3{margin:0 0 12px;font-size:12px;color:#718096;text-transform:uppercase;letter-spacing:.5px}
  .img-box img{max-width:100%;max-height:280px;border-radius:8px;border:1px solid #e2e8f0}
  .score-box{text-align:center;padding:24px;margin-bottom:20px}
  .score{font-size:56px;font-weight:800;color:#667eea}
  table{width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden}
  th{background:#2d3748;color:white;padding:11px 16px;text-align:left;font-size:12px;text-transform:uppercase}
  td{padding:10px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;vertical-align:top}
  tr:last-child td{border:none}
  .ts-section{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px}
  .ts-card{background:white;border-radius:12px;padding:18px;box-shadow:0 2px 10px rgba(0,0,0,.07);text-align:center}
  .ts-label{font-size:11px;color:#718096;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
  .ts-value{font-size:13px;font-weight:600;color:#2d3748}
  .tool-badge{display:inline-block;background:#ebf8ff;color:#2c5282;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
  .footer{text-align:center;padding:20px;color:#a0aec0;font-size:12px;margin-top:28px;border-top:1px solid #e2e8f0}
</style>
</head>
<body>
<div class="header">
  <h1>🔍 PINIT Forensic Analysis Report</h1>
  <p>Generated: ${new Date().toLocaleString()} &nbsp;·&nbsp; Report ID: RPT-${Date.now()}</p>
  <div>
    <span class="badge ${result.isTampered ? 'badge-tampered' : 'badge-clean'}">
      ${result.isTampered ? '⚠ TAMPERING DETECTED' : '✓ NO SIGNIFICANT CHANGES'}
    </span>
  </div>
</div>

<div class="images">
  <div class="img-box">
    <h3>🔒 Original (Vault)</h3>
    ${origPreview ? `<img src="${origPreview}" alt="Original"/>` : '<p style="color:#a0aec0;padding:40px 0">Thumbnail not available</p>'}
  </div>
  <div class="img-box">
    <h3>🔴 Submitted Image</h3>
    ${modPreview ? `<img src="${modPreview}" alt="Modified"/>` : '<p style="color:#a0aec0;padding:40px 0">Preview not available</p>'}
  </div>
</div>

<div class="card score-box" style="margin-bottom:20px">
  <div style="font-size:12px;color:#718096;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Similarity Score</div>
  <div class="score">${result.confidence}%</div>
  <div style="color:#718096;font-size:14px">${result.visualVerdict || 'Analysis Complete'}</div>
</div>

<div class="ts-section">
  <div class="ts-card">
    <div class="ts-label">📸 Original Capture Time</div>
    <div class="ts-value">${result.originalCaptureTime ? formatTS(result.originalCaptureTime) : 'Not available'}</div>
  </div>
  <div class="ts-card">
    <div class="ts-label">✏️ Modified File Time</div>
    <div class="ts-value">${result.modifiedFileTime ? formatTS(result.modifiedFileTime) : '—'}</div>
  </div>
  <div class="ts-card">
    <div class="ts-label">🔧 Editing Tool Detected</div>
    <div class="ts-value">${result.editingTool ? `<span class="tool-badge">${result.editingTool}</span>` : 'Not detected'}</div>
  </div>
</div>

<div class="grid2">
  <div class="card">
    <div class="card-head">🔒 Original Asset</div>
    <div class="row"><span class="lbl">Asset ID</span><span class="val">${originalAsset.assetId || originalAsset.id}</span></div>
    <div class="row"><span class="lbl">Certificate ID</span><span class="val">${originalAsset.certificateId || '—'}</span></div>
    <div class="row"><span class="lbl">Owner</span><span class="val">${originalAsset.ownerName || originalAsset.userId || '—'}</span></div>
    <div class="row"><span class="lbl">Registered</span><span class="val">${new Date(originalAsset.dateEncrypted || originalAsset.timestamp || Date.now()).toLocaleDateString()}</span></div>
    <div class="row"><span class="lbl">Capture Time</span><span class="val">${result.originalCaptureTime ? formatTS(result.originalCaptureTime) : '—'}</span></div>
    <div class="row"><span class="lbl">Resolution</span><span class="val">${originalAsset.resolution || originalAsset.assetResolution || '—'}</span></div>
    <div class="row"><span class="lbl">File Size</span><span class="val">${originalAsset.fileSize ? (originalAsset.fileSize / 1024).toFixed(1) + ' KB' : '—'}</span></div>
    <div class="row"><span class="lbl">SHA-256</span><span class="val">${(originalAsset.fileHash || '—').substring(0, 24)}…</span></div>
    <div class="row"><span class="lbl">Blockchain Anchor</span><span class="val">${(originalAsset.blockchainAnchor || '—').substring(0, 22)}…</span></div>
  </div>
  <div class="card">
    <div class="card-head">🔴 Submitted Version</div>
    <div class="row"><span class="lbl">Resolution</span><span class="val">${result.uploadedResolution}</span></div>
    <div class="row"><span class="lbl">File Size</span><span class="val">${result.uploadedSize}</span></div>
    ${result.modifiedFileTime ? `<div class="row"><span class="lbl">File Last Modified</span><span class="val">${formatTS(result.modifiedFileTime)}</span></div>` : ''}
    <div class="row"><span class="lbl">pHash Similarity</span><span class="val">${result.pHashSim !== null ? result.pHashSim + '%' : '—'}</span></div>
    ${result.pixelAnalysis ? `<div class="row"><span class="lbl">Pixels Changed</span><span class="val">${result.pixelAnalysis.changedPct}% (${result.pixelAnalysis.changedPixels.toLocaleString()} px)</span></div>` : ''}
    <div class="row"><span class="lbl">Compared At</span><span class="val">${new Date(result.timestamp).toLocaleString()}</span></div>
    <div class="row"><span class="lbl">Status</span><span class="val" style="color:${result.isTampered ? '#e53e3e' : '#38a169'};font-weight:700">${result.isTampered ? 'TAMPERED' : 'CLEAN'}</span></div>
  </div>
</div>

<div class="card">
  <div class="card-head">⚠ Complete Tampering Summary — All Changes Detected</div>
  ${result.changes.length === 0
    ? '<p style="color:#38a169;font-weight:600;margin:0">✓ No modifications detected — image matches original</p>'
    : `<table><thead><tr><th>Category</th><th>Finding</th></tr></thead><tbody>${changeRows}</tbody></table>`
  }
</div>

<div class="footer">
  PINIT Image Forensics System &nbsp;·&nbsp; ${new Date().toISOString()}<br/>
  This report documents all detected modifications between the vault original and submitted image.
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `pinit-report-${originalAsset.assetId || 'asset'}-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── Build shareable URL ──────────────────────────────────────────────────────
const buildShareableLink = (originalAsset, result) => {
  const payload = {
    v: 1,
    assetId:             originalAsset.assetId || originalAsset.id,
    certId:              originalAsset.certificateId,
    owner:               originalAsset.ownerName || originalAsset.userId,
    registered:          originalAsset.dateEncrypted || originalAsset.timestamp,
    origResolution:      originalAsset.resolution || originalAsset.assetResolution,
    origHash:            originalAsset.fileHash,
    origFingerprint:     originalAsset.visualFingerprint,
    blockchainAnchor:    originalAsset.blockchainAnchor,
    originalCaptureTime: result.originalCaptureTime,
    modifiedFileTime:    result.modifiedFileTime,
    editingTool:         result.editingTool,
    comparedAt:          result.timestamp,
    confidence:          result.confidence,
    visualVerdict:       result.visualVerdict,
    isTampered:          result.isTampered,
    uploadedResolution:  result.uploadedResolution,
    uploadedSize:        result.uploadedSize,
    uploadedFingerprint: result.uploadedPHash,
    pHashSim:            result.pHashSim,
    pixelChangedPct:     result.pixelAnalysis?.changedPct,
    hotRegions:          result.pixelAnalysis?.hotRegions,
    changes:             result.changes,
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return `${window.location.origin}/public/verify?data=${encoded}`;
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────
function AssetTrackingPage() {
  const navigate = useNavigate();
  const [assets, setAssets]                 = useState([]);
  const [filteredAssets, setFilteredAssets] = useState([]);
  const [searchQuery, setSearchQuery]       = useState('');
  const [compareAsset, setCompareAsset]     = useState(null);
  const [compareFile, setCompareFile]       = useState(null);
  const [comparePreview, setComparePreview] = useState(null);
  const [deleteConfirm, setDeleteConfirm]   = useState(null);
  const [deleting, setDeleting]             = useState(false);
  const [comparing, setComparing]           = useState(false);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [linkCopied, setLinkCopied]         = useState(false);
  const fileInputRef = useRef(null);

useEffect(() => {
  const loadAssets = async () => {
    try {
      // Try API first — works on any device
      const { vaultAPI } = await import('../api/client');
      const response = await vaultAPI.list();
      const vault    = response.assets || [];

      // Also load local reports for comparison history
      const reports  = JSON.parse(localStorage.getItem('analysisReports') || '[]');
      const vaultIds = new Set(vault.map(v => v.asset_id || v.assetId));
      const extras   = reports.filter(r => !vaultIds.has(r.assetId));

      // Normalise API response fields to match existing UI expectations
      const normalisedVault = vault.map(a => ({
        ...a,
        assetId:      a.asset_id      || a.assetId,
        ownerName:    a.owner_name    || a.ownerName,
        ownerEmail:   a.owner_email   || a.ownerEmail,
        fileHash:     a.file_hash     || a.fileHash,
        thumbnailUrl: a.thumbnail_url || a.thumbnailUrl,
        dateEncrypted: a.created_at   || a.dateEncrypted,
      }));

      const combined     = [...normalisedVault, ...extras];
      const groups       = {};
      combined.forEach(a => {
        const k = a.assetId || a.id;
        groups[k] = (groups[k] || 0) + 1;
      });
      const withVersions = combined.map(a => ({
        ...a,
        versionCount: groups[a.assetId || a.id] || 1
      }));

      setAssets(withVersions);
      setFilteredAssets(withVersions);

    } catch (err) {
      // Fallback to localStorage if API fails (offline or not logged in)
      console.warn('API unavailable, using localStorage:', err.message);
      const vault   = JSON.parse(localStorage.getItem('vaultImages')    || '[]');
      const reports = JSON.parse(localStorage.getItem('analysisReports')|| '[]');
      const vaultIds = new Set(vault.map(v => v.assetId));
      const extras   = reports.filter(r => !vaultIds.has(r.assetId));
      const combined = [...vault, ...extras];
      const groups   = {};
      combined.forEach(a => {
        const k = a.assetId || a.id;
        groups[k] = (groups[k] || 0) + 1;
      });
      const withVersions = combined.map(a => ({
        ...a,
        versionCount: groups[a.assetId || a.id] || 1
      }));
      setAssets(withVersions);
      setFilteredAssets(withVersions);
    }
  };

  loadAssets();
}, []);

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (!query.trim()) { setFilteredAssets(assets); return; }
    const q = query.toLowerCase();
    setFilteredAssets(assets.filter(a =>
      (a.assetId || '').toLowerCase().includes(q) ||
      (a.userId || '').toLowerCase().includes(q) ||
      (a.ownerName || '').toLowerCase().includes(q) ||
      (a.certificateId || '').toLowerCase().includes(q) ||
      (a.deviceId || '').toLowerCase().includes(q)
    ));
  };

  const deleteAsset = async (asset) => {
    setDeleting(true);
    const id = asset.assetId || asset.id;
    try {
      const { vaultAPI } = await import('../api/client');
      await vaultAPI.delete(id);
    } catch (err) {
      console.warn('Backend delete failed:', err);
    }
    // Remove from localStorage
    try {
      const vault = JSON.parse(localStorage.getItem('vaultImages') || '[]');
      localStorage.setItem('vaultImages', JSON.stringify(
        vault.filter(a => a.assetId !== id && a.id !== id)
      ));
      const reports = JSON.parse(localStorage.getItem('analysisReports') || '[]');
      localStorage.setItem('analysisReports', JSON.stringify(
        reports.filter(a => a.assetId !== id && a.id !== id)
      ));
    } catch (e) { console.warn(e); }
    // Remove from UI
    setAssets(prev => prev.filter(a => (a.assetId || a.id) !== id));
    setFilteredAssets(prev => prev.filter(a => (a.assetId || a.id) !== id));
    setDeleting(false);
    setDeleteConfirm(null);
  };

  const openCompare = (asset) => {
    setCompareAsset(asset); setCompareFile(null);
    setComparePreview(null); setComparisonResult(null); setLinkCopied(false);
  };
  const closeCompare = () => {
    setCompareAsset(null); setCompareFile(null);
    setComparePreview(null); setComparisonResult(null);
  };

  const handleCompareFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setCompareFile(file); setComparisonResult(null);
    const reader = new FileReader();
    reader.onload = e => setComparePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const runCompare = async () => {
    if (!compareFile || !compareAsset) return;
    setComparing(true);
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const result = await runComparison(canvas, compareFile, compareAsset);
      setComparisonResult(result);
      setComparing(false);
    };
    img.src = comparePreview;
  };

  const handleCopyLink = () => {
    if (!compareAsset || !comparisonResult) return;
    const url = buildShareableLink(compareAsset, comparisonResult);
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    });
  };

  const handleDownload = () => {
    if (!compareAsset || !comparisonResult) return;
    downloadHTMLReport(compareAsset, comparisonResult, compareAsset.thumbnail || compareAsset.thumbnailUrl || compareAsset.cloudinary_url, comparePreview);
  };

  const formatDate = (ts) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const hasRichData = (asset) => !!(asset.fileHash || asset.visualFingerprint || asset.certificateId);

  return (
    <div className="asset-tracking-page">
      {/* Header */}
      <div className="tracking-header">
        <div>
          <h1>Asset Tracking</h1>
          <p className="subtitle">Track image modifications, compare versions, and generate forensic reports</p>
        </div>
        <div className="tracking-stats">
          <div className="stat-card">
            <span className="stat-number">{assets.length}</span>
            <span className="stat-label">Total Assets</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{assets.filter(a => hasRichData(a)).length}</span>
            <span className="stat-label">Vault Secured</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{assets.filter(a => a.versionCount > 1).length}</span>
            <span className="stat-label">Modified</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="search-section">
        <div className="search-bar">
          <Search className="search-icon" size={20} />
          <input
            type="text"
            placeholder="Search by Asset ID, Owner, Certificate ID, Device ID…"
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            className="search-input"
          />
          {searchQuery && <button onClick={() => handleSearch('')} className="clear-search">✕</button>}
        </div>
      </div>

      {searchQuery && (
        <div className="search-results-info">
          Found {filteredAssets.length} result{filteredAssets.length !== 1 ? 's' : ''} for "{searchQuery}"
        </div>
      )}

      {/* Table */}
      <div className="tracking-table-container">
        {filteredAssets.length > 0 ? (
          <table className="tracking-table">
            <thead>
              <tr>
                <th>Asset ID</th>
                <th>Owner</th>
                <th>Registered</th>
                <th>Certificate</th>
                <th>Vault Data</th>
                <th>Versions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset, idx) => (
                <tr key={asset.id || asset.assetId || idx}>
                  <td>
                    <span className="asset-id-link" onClick={() => navigate(`/admin/track/${asset.assetId}`)}>
                      {asset.assetId || asset.id}
                    </span>
                  </td>
                  <td>
                    <div className="creator-info">
                      <div className="creator-avatar">
                        {(asset.ownerName || asset.userName || asset.userId || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="creator-name">{asset.ownerName || asset.userName || 'Unknown'}</div>
                        <div className="creator-email">{asset.ownerEmail || asset.userEmail || asset.userId}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="date-cell">
                      <Calendar size={14} />
                      {formatDate(asset.dateEncrypted || asset.timestamp || asset.createdAt)}
                    </div>
                  </td>
                  <td>
                    <span className="cert-badge" title={asset.certificateId}>
                      {asset.certificateId
                        ? <><Lock size={12} /> {asset.certificateId.substring(0, 10)}…</>
                        : <span style={{ color: '#a0aec0', fontSize: 12 }}>—</span>}
                    </span>
                  </td>
                  <td>
                    {hasRichData(asset) ? (
                      <div className="vault-indicators">
                        {asset.fileHash          && <span className="vault-chip hash"><Hash size={10} /> SHA-256</span>}
                        {asset.visualFingerprint && <span className="vault-chip fp"><Fingerprint size={10} /> pHash</span>}
                        {asset.blockchainAnchor  && <span className="vault-chip bc"><Cpu size={10} /> Chain</span>}
                      </div>
                    ) : (
                      <span style={{ color: '#a0aec0', fontSize: 12 }}>Legacy entry</span>
                    )}
                  </td>
                  <td>
                    {asset.versionCount > 1
                      ? <span className="version-badge modified"><TrendingUp size={14} /> {asset.versionCount} versions</span>
                      : <span className="version-badge original">Original</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button className="btn-compare" onClick={() => openCompare(asset)}>
                        <GitCompare size={14} /> Compare
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(asset)}
                        title="Delete Asset"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: '32px', height: '32px', border: 'none', borderRadius: '6px',
                          background: '#fee2e2', color: '#dc2626', cursor: 'pointer',
                          flexShrink: 0
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fca5a5'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fee2e2'}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <Activity size={64} className="empty-icon" />
            <h3>No Assets Found</h3>
            <p>{searchQuery ? `No assets match "${searchQuery}"` : 'No tracked assets yet. Encrypt images to start building your vault.'}</p>
          </div>
        )}
      </div>

      {/* Compare Panel */}
      {compareAsset && (
        <div className="compare-overlay" onClick={e => e.target === e.currentTarget && closeCompare()}>
          <div className="compare-panel">
            <div className="panel-header">
              <div>
                <h2><GitCompare size={20} /> Forensic Comparison</h2>
                <p className="panel-subtitle">Upload a suspected modified image for deep forensic analysis</p>
              </div>
              <button className="btn-close" onClick={closeCompare}><X size={20} /></button>
            </div>

            <div className="panel-body">
              <div className="original-info-strip">
                <Shield size={16} className="shield-icon" />
                <div>
                  <strong>Vault Original:</strong> {compareAsset.assetId || compareAsset.id}
                  {compareAsset.ownerName && <span> · {compareAsset.ownerName}</span>}
                  {compareAsset.captureTimestamp && (
                    <span className="cert-inline"> · Captured: {formatTS(compareAsset.captureTimestamp)}</span>
                  )}
                </div>
              </div>

              <div className="compare-columns">
                {/* Original */}
                <div className="compare-col">
                  <div className="compare-col-label">
                    <span className="col-badge original">🔒 Original (Vault)</span>
                  </div>
                  <div className="image-frame">
                    {compareAsset.thumbnail || compareAsset.thumbnailUrl || compareAsset.cloudinary_url || compareAsset.image_url
                      ? <img src={compareAsset.thumbnail || compareAsset.thumbnailUrl || compareAsset.cloudinary_url || compareAsset.image_url} alt="Original" className="compare-img" />
                      : <div className="no-thumb"><Eye size={32} /><p>Thumbnail not stored</p></div>}
                  </div>
                  <div className="meta-chips">
                    {(compareAsset.resolution || compareAsset.assetResolution) &&
                      <span className="meta-chip"><strong>Resolution:</strong> {compareAsset.resolution || compareAsset.assetResolution}</span>}
                    {compareAsset.captureTimestamp &&
                      <span className="meta-chip"><Clock size={10} /> Captured: {formatTS(compareAsset.captureTimestamp)}</span>}
                    {compareAsset.fileHash &&
                      <span className="meta-chip hash-chip"><Hash size={10} /> {compareAsset.fileHash.substring(0, 16)}…</span>}
                    {compareAsset.visualFingerprint &&
                      <span className="meta-chip fp-chip"><Fingerprint size={10} /> {compareAsset.visualFingerprint}</span>}
                  </div>
                </div>

                {/* Upload */}
                <div className="compare-col">
                  <div className="compare-col-label">
                    <span className="col-badge modified">🔍 Upload for Comparison</span>
                  </div>
                  <div
                    className={`upload-drop ${comparePreview ? 'has-image' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={e => { e.preventDefault(); handleCompareFile(e.dataTransfer.files[0]); }}
                    onDragOver={e => e.preventDefault()}
                  >
                    {comparePreview
                      ? <img src={comparePreview} alt="Compare" className="compare-img" />
                      : <div className="upload-prompt">
                          <Upload size={32} />
                          <p>Drop image here or click to upload</p>
                          <span>JPG, PNG, WEBP</span>
                        </div>}
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => handleCompareFile(e.target.files[0])} />
                  </div>
                  {compareFile && (
                    <div className="meta-chips">
                      <span className="meta-chip"><strong>File:</strong> {compareFile.name}</span>
                      <span className="meta-chip"><strong>Size:</strong> {(compareFile.size / 1024).toFixed(1)} KB</span>
                      {compareFile.lastModified &&
                        <span className="meta-chip"><Clock size={10} /> Modified: {formatTS(compareFile.lastModified)}</span>}
                    </div>
                  )}
                </div>
              </div>

              {compareFile && !comparisonResult && (
                <button className="btn-run-compare" onClick={runCompare} disabled={comparing}>
                  {comparing
                    ? <><span className="spinner" /> Running deep forensic analysis…</>
                    : <><ChevronRight size={16} /> Run Forensic Analysis</>}
                </button>
              )}

              {/* Results */}
              {comparisonResult && (
                <div className="comparison-results">
                  {/* Verdict */}
                  <div className={`verdict-banner ${comparisonResult.isTampered ? 'tampered' : 'clean'}`}>
                    <div className="verdict-icon">
                      {comparisonResult.isTampered ? <AlertTriangle size={28} /> : <CheckCircle size={28} />}
                    </div>
                    <div className="verdict-text">
                      <h3>
                        {comparisonResult.exactMatch
                          ? '✓ Exact Match — Byte-for-Byte Identical'
                          : comparisonResult.isTampered
                            ? 'Tampering Detected'
                            : 'No Significant Changes Detected'}
                      </h3>
                      <p>{comparisonResult.visualVerdict} &nbsp;·&nbsp; Similarity: {comparisonResult.confidence}%</p>
                    </div>
                    <div className="verdict-score">{comparisonResult.confidence}%</div>
                  </div>

                  {/* Similarity bar */}
                  <div className="sim-bar-wrap">
                    <div className="sim-bar-track">
                      <div
                        className={`sim-bar-fill ${comparisonResult.confidence >= 80 ? 'high' : comparisonResult.confidence >= 50 ? 'mid' : 'low'}`}
                        style={{ width: `${comparisonResult.confidence}%` }}
                      />
                    </div>
                    <span className="sim-bar-label">Visual Similarity</span>
                  </div>

                  {/* Timestamps + Tool strip */}
                  <div className="forensic-meta-strip">
                    <div className="forensic-meta-item">
                      <Clock size={14} className="fmi-icon original" />
                      <div>
                        <div className="fmi-label">Original Capture Time</div>
                        <div className="fmi-value">{comparisonResult.originalCaptureTime ? formatTS(comparisonResult.originalCaptureTime) : 'Not recorded'}</div>
                      </div>
                    </div>
                    <div className="forensic-meta-item">
                      <Clock size={14} className="fmi-icon modified" />
                      <div>
                        <div className="fmi-label">Modified File Time</div>
                        <div className="fmi-value">
                          {comparisonResult.modifiedFileTime
                            ? formatTS(comparisonResult.modifiedFileTime)
                            : <span className="fmi-na">—</span>}
                        </div>
                      </div>
                    </div>
                    <div className="forensic-meta-item">
                      <Wrench size={14} className="fmi-icon tool" />
                      <div>
                        <div className="fmi-label">Editing Tool</div>
                        <div className="fmi-value">
                          {comparisonResult.editingTool
                            ? <span className="tool-tag">{comparisonResult.editingTool}</span>
                            : <span className="fmi-na">Not detected (PNG/no EXIF)</span>}
                        </div>
                      </div>
                    </div>
                    {comparisonResult.pixelAnalysis && (
                      <div className="forensic-meta-item">
                        <MapPin size={14} className="fmi-icon pixel" />
                        <div>
                          <div className="fmi-label">Pixels Changed</div>
                          <div className="fmi-value">{comparisonResult.pixelAnalysis.changedPct}% ({comparisonResult.pixelAnalysis.changedPixels.toLocaleString()} px)</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* All changes list */}
                  <div className="changes-section">
                    <h4>Complete Tampering Analysis — All Changes Detected</h4>
                    {comparisonResult.changes.length === 0 ? (
                      <div className="no-changes">
                        <CheckCircle size={16} /> Image matches the vault original — no modifications detected
                      </div>
                    ) : (
                      <ul className="changes-list">
                        {comparisonResult.changes.map((c, i) => (
                          <li key={i} className={`change-item ${c.type}`}>
                            <span className="change-dot" />
                            <div>
                              {c.category && <span className="change-category">{c.category}</span>}
                              <span className="change-text">{c.text}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Side-by-side data */}
                  <div className="data-compare-grid">
                    <div className="data-col">
                      <div className="data-col-head original">Original Asset</div>
                      <div className="data-row">
                        <span>Registered</span>
                        <span className="ts-value-cell">{formatTS(compareAsset.dateEncrypted || compareAsset.timestamp)}</span>
                      </div>
                      <div className="data-row">
                        <span>Capture Time</span>
                        <span className="ts-value-cell">{comparisonResult.originalCaptureTime ? formatTS(comparisonResult.originalCaptureTime) : '—'}</span>
                      </div>
                      <div className="data-row">
                        <span>Owner</span>
                        <span>{compareAsset.ownerName || compareAsset.userId || '—'}</span>
                      </div>
                      <div className="data-row">
                        <span>Resolution</span>
                        <span>{compareAsset.resolution || compareAsset.assetResolution || '—'}</span>
                      </div>
                      <div className="data-row">
                        <span>File Size</span>
                        <span>{compareAsset.fileSize ? (compareAsset.fileSize / 1024).toFixed(0) + ' KB' : '—'}</span>
                      </div>
                      <div className="data-row">
                        <span>SHA-256</span>
                        <span className="mono-small">{compareAsset.fileHash ? compareAsset.fileHash.substring(0, 20) + '…' : '—'}</span>
                      </div>
                      {compareAsset.certificateId && (
                        <div className="data-row verified-row"><CheckCircle size={12} /> Blockchain Verified</div>
                      )}
                    </div>
                    <div className="data-col">
                      <div className="data-col-head modified">Submitted Image</div>
                      {comparisonResult.modifiedFileTime && (
                        <div className="data-row">
                          <span>File Last Modified</span>
                          <span className="ts-value-cell">{formatTS(comparisonResult.modifiedFileTime)}</span>
                        </div>
                      )}
                      <div className="data-row">
                        <span>Compared At</span>
                        <span className="ts-value-cell">{formatTS(comparisonResult.timestamp)}</span>
                      </div>
                      <div className="data-row">
                        <span>Editing Tool</span>
                        <span>{comparisonResult.editingTool || <span className="fmi-na">Not detected</span>}</span>
                      </div>
                      <div className="data-row">
                        <span>Verdict</span>
                        <span className={comparisonResult.isTampered ? 'text-danger' : 'text-success'}>
                          {comparisonResult.isTampered ? 'Altered Derivative' : 'Authentic'}
                        </span>
                      </div>
                      <div className="data-row">
                        <span>Resolution</span>
                        <span>{comparisonResult.uploadedResolution}</span>
                      </div>
                      <div className="data-row">
                        <span>File Size</span>
                        <span>{comparisonResult.uploadedSize}</span>
                      </div>
                      {comparisonResult.pixelAnalysis && (
                        <div className="data-row">
                          <span>Pixels Changed</span>
                          <span>{comparisonResult.pixelAnalysis.changedPct}% ({comparisonResult.pixelAnalysis.changedPixels.toLocaleString()} px)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="report-actions">
                    <button className={`btn-action copy-link ${linkCopied ? 'copied' : ''}`} onClick={handleCopyLink}>
                      <Link size={16} />
                      {linkCopied ? '✓ Link Copied!' : 'Copy Verification Link'}
                    </button>
                    <button className="btn-action download-report" onClick={handleDownload}>
                      <Download size={16} /> Download Report
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="compare-overlay" onClick={() => !deleting && setDeleteConfirm(null)}>
          <div className="compare-panel" style={{ maxWidth: '420px', height: 'auto', padding: '0' }} onClick={e => e.stopPropagation()}>
            <div className="compare-header" style={{ borderBottom: '1px solid #fee2e2' }}>
              <h2 style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
                <Trash2 size={18} /> Delete Asset
              </h2>
              <button className="btn-close" onClick={() => setDeleteConfirm(null)}><X size={20} /></button>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ color: '#374151', marginBottom: '12px', fontSize: '14px' }}>
                Are you sure you want to permanently delete this asset?
              </p>
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#7f1d1d' }}>
                <div><strong>Asset ID:</strong> {deleteConfirm.assetId}</div>
                <div><strong>Owner:</strong> {deleteConfirm.ownerName || deleteConfirm.owner || '—'}</div>
                <div style={{ marginTop: '8px', fontWeight: '600' }}>
                  ⚠️ This removes the asset from backend and local storage permanently.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deleting}
                  style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteAsset(deleteConfirm)}
                  disabled={deleting}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', background: deleting ? '#fca5a5' : '#dc2626', color: 'white', border: 'none', borderRadius: '8px', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px' }}
                >
                  <Trash2 size={14} />
                  {deleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AssetTrackingPage;