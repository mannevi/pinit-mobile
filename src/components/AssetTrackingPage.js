import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Calendar, CheckCircle, XCircle, Activity, TrendingUp,
  GitCompare, Upload, AlertTriangle, Shield, Download, Link,
  X, ChevronRight, Eye, Cpu, Hash, Fingerprint, Lock, Clock,
  Wrench, MapPin, Trash2, RefreshCw, UserCheck, UserX, Key
} from 'lucide-react';
import './AssetTrackingPage.css';

// =============================================================================
// PART 1: pHash — unified dual-algorithm with backward compat
// =============================================================================
// FIX (critical): ImageCryptoAnalyzer stored 16-char hashes (8×8 avg).
// AssetTrackingPage computed 64-char hashes (16×16 DCT).
// pHashSimilarity returned 0 for every existing asset (lengths differed).
// Now auto-detects which algorithm to use based on stored hash length.

const computePerceptualHashFromCanvas = (canvas) => {
  try {
    const SIZE = 32;
    const small = document.createElement('canvas');
    small.width = SIZE; small.height = SIZE;
    small.getContext('2d').drawImage(canvas, 0, 0, SIZE, SIZE);
    const data = small.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
    const gray = [];
    for (let i = 0; i < SIZE*SIZE; i++)
      gray.push(0.299*data[i*4] + 0.587*data[i*4+1] + 0.114*data[i*4+2]);
    const DCT = 16;
    const dct = [];
    for (let u = 0; u < DCT; u++)
      for (let v = 0; v < DCT; v++) {
        let sum = 0;
        for (let x = 0; x < SIZE; x++)
          for (let y = 0; y < SIZE; y++)
            sum += gray[x*SIZE+y]
              * Math.cos(((2*x+1)*u*Math.PI)/(2*SIZE))
              * Math.cos(((2*y+1)*v*Math.PI)/(2*SIZE));
        dct.push(sum);
      }
    const acDct  = dct.slice(1);
    const median = [...acDct].sort((a,b)=>a-b)[Math.floor(acDct.length/2)];
    const bits   = ['1', ...acDct.map(v => v >= median ? '1' : '0')];
    let hex = '';
    for (let i = 0; i < 256; i += 4)
      hex += parseInt(bits.slice(i, i+4).join(''), 2).toString(16);
    return hex.toUpperCase(); // 64 chars
  } catch { return null; }
};

const computePerceptualHashLegacy = (canvas) => {
  try {
    const small = document.createElement('canvas');
    small.width = 8; small.height = 8;
    small.getContext('2d').drawImage(canvas, 0, 0, 8, 8);
    const data  = small.getContext('2d').getImageData(0, 0, 8, 8).data;
    const grays = [];
    for (let i = 0; i < 64; i++)
      grays.push(0.299*data[i*4] + 0.587*data[i*4+1] + 0.114*data[i*4+2]);
    const avg = grays.reduce((a,b)=>a+b,0)/64;
    let bits = '';
    for (const g of grays) bits += g >= avg ? '1' : '0';
    let hex = '';
    for (let i = 0; i < 64; i += 4)
      hex += parseInt(bits.substr(i,4),2).toString(16);
    return hex.toUpperCase(); // 16 chars
  } catch { return null; }
};

// Returns null (not 0) on format mismatch — callers handle null explicitly
const pHashSimilarity = (h1, h2) => {
  if (!h1 || !h2 || h1.length !== h2.length) return null;
  const totalBits = h1.length * 4;
  let diff = 0;
  for (let i = 0; i < h1.length; i++) {
    const b1 = parseInt(h1[i],16).toString(2).padStart(4,'0');
    const b2 = parseInt(h2[i],16).toString(2).padStart(4,'0');
    for (let j = 0; j < 4; j++) if (b1[j] !== b2[j]) diff++;
  }
  return Math.round(((totalBits - diff) / totalBits) * 100);
};

const smartPHashCompare = (uploadedCanvas, storedHash) => {
  if (!storedHash || storedHash === 'PHASH-UNAVAIL')
    return { sim: null, uploadedHash: null, algorithm: null, isLegacy: false, note: 'No fingerprint stored for this asset.' };
  if (storedHash.length === 64) {
    const h = computePerceptualHashFromCanvas(uploadedCanvas);
    return { sim: pHashSimilarity(h, storedHash), uploadedHash: h, algorithm: '256-bit DCT', isLegacy: false, note: null };
  }
  if (storedHash.length === 16) {
    const h = computePerceptualHashLegacy(uploadedCanvas);
    return { sim: pHashSimilarity(h, storedHash), uploadedHash: h, algorithm: '64-bit avg (legacy)',
      isLegacy: true, note: 'Asset uses legacy 64-bit fingerprint. Re-embed image to upgrade to 256-bit.' };
  }
  return { sim: null, uploadedHash: null, algorithm: null, isLegacy: false, note: `Unknown fingerprint format (length ${storedHash.length}).` };
};

const pHashSimWithRotationCompat = (uploadedCanvas, storedHash) => {
  if (!storedHash || storedHash === 'PHASH-UNAVAIL')
    return { sim: null, rotation: 0, algorithm: null, isLegacy: false, note: 'No fingerprint stored.' };
  let best = { sim: 0, rotation: 0 }, bestMeta = null;
  for (const deg of [0, 90, 180, 270]) {
    const c   = deg === 0 ? uploadedCanvas : rotateCanvas(uploadedCanvas, deg);
    const res = smartPHashCompare(c, storedHash);
    if (res.sim !== null && res.sim > best.sim) { best = { sim: res.sim, rotation: deg }; bestMeta = res; }
  }
  return { sim: best.sim || null, rotation: best.rotation, algorithm: bestMeta?.algorithm || null, isLegacy: bestMeta?.isLegacy || false, note: bestMeta?.note || null };
};

// =============================================================================
// PART 2: UUID / IMGCRYPT3 extraction
// =============================================================================
// Exact same logic as ImageCryptoAnalyzer.js embedUUIDAdvanced/extractUUIDAdvanced.
// Reads LSBs of R+G channels (tile-based CRC-validated userId) and
// B channel (full IMGCRYPT3 metadata string).

const STEGO_TILE    = 12;
const UUID_FIELD_LEN = 32;
const PAYLOAD_BYTES  = 1 + UUID_FIELD_LEN + 2; // 35 bytes = 280 bits
const PAYLOAD_BITS   = PAYLOAD_BYTES * 8;

const crc16js = (bytes) => {
  let crc = 0xFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let j = 0; j < 8; j++)
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc & 0xFFFF;
};

const parsePayloadBits = (bits) => {
  if (bits.length < PAYLOAD_BITS) return null;
  const bytes = new Uint8Array(PAYLOAD_BYTES);
  for (let i = 0; i < PAYLOAD_BYTES; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | (bits[i*8+b] || 0);
    bytes[i] = v;
  }
  const lenByte = bytes[0];
  if (lenByte <= 0 || lenByte > UUID_FIELD_LEN) return null;
  const uuidPadded = bytes.slice(1, 1 + UUID_FIELD_LEN);
  const crcRead    = (bytes[PAYLOAD_BYTES-2] << 8) | bytes[PAYLOAD_BYTES-1];
  const forCrc     = new Uint8Array(1 + UUID_FIELD_LEN);
  forCrc[0] = lenByte; forCrc.set(uuidPadded, 1);
  if (crc16js(forCrc) !== crcRead) return null;
  let uid = '';
  for (let i = 0; i < lenByte; i++) uid += String.fromCharCode(uuidPadded[i]);
  if (uid.length === 32 && /^[0-9a-fA-F]{32}$/.test(uid))
    uid = `${uid.slice(0,8)}-${uid.slice(8,12)}-${uid.slice(12,16)}-${uid.slice(16,20)}-${uid.slice(20)}`;
  return uid;
};

const parseIMGCRYPT3Msg = (text) => {
  const isV3 = text.includes('IMGCRYPT3|');
  const isV2 = !isV3 && text.includes('IMGCRYPT2|');
  const hdr  = isV3 ? 'IMGCRYPT3|' : isV2 ? 'IMGCRYPT2|' : text.includes('IMGCRYPT|') ? 'IMGCRYPT|' : null;
  if (!hdr) return null;
  const si = text.indexOf(hdr) + hdr.length;
  const ei = text.indexOf('|END', si);
  if (ei <= si) return null;
  const pts = text.substring(si, ei).split('|');
  if (pts.length < 4 || !pts[0] || pts[0].length < 2) return null;
  return { userId: pts[0], gps: pts[1]||'NOGPS', timestamp: pts[2]||null,
    deviceId: pts[3]||null, deviceName: pts[4]||null, ipAddress: pts[5]||null,
    deviceSource: pts[6]||null, ipSource: pts[7]||null, gpsSource: pts[8]||null,
    originalResolution: isV3 ? (pts[9]||null) : null };
};

const buildIMGCRYPT3Result = (m) => {
  let gps = { available: false };
  if (m.gps && m.gps !== 'NOGPS') {
    const pts = m.gps.split(',');
    if (pts.length === 2) {
      const lat = parseFloat(pts[0]), lng = parseFloat(pts[1]);
      if (!isNaN(lat) && !isNaN(lng))
        gps = { available: true, latitude: lat, longitude: lng,
          coordinates: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          mapsUrl: `https://www.google.com/maps?q=${lat},${lng}` };
    }
  }
  return { found: true, userId: m.userId, gps,
    timestamp:          m.timestamp && !isNaN(m.timestamp) ? parseInt(m.timestamp) : null,
    deviceId:           m.deviceId   || null,
    deviceName:         m.deviceName || null,
    ipAddress:          m.ipAddress  || null,
    originalResolution: m.originalResolution || null };
};

const extractIMGCRYPT3FromBits = (bits) => {
  const total   = bits.length;
  const maxScan = Math.min(total - 800, 3200);
  const maxRead = Math.min(500, Math.floor(total / 8));
  for (let off = 0; off <= maxScan; off += 8) {
    let text = '';
    for (let c = 0; c < maxRead; c++) {
      const s = off + c * 8;
      if (s + 8 > total) break;
      let v = 0;
      for (let b = 0; b < 8; b++) v = (v << 1) | bits[s+b];
      text += (v >= 32 && v <= 126) ? String.fromCharCode(v) : '\x00';
    }
    if (!text.includes('IMGCRYPT')) continue;
    const p = parseIMGCRYPT3Msg(text);
    if (p) return buildIMGCRYPT3Result(p);
  }
  return null;
};

const extractUUIDFromCanvas = (canvas) => {
  try {
    const ctx       = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data      = imageData.data;
    const imgW      = canvas.width;
    const TILE      = STEGO_TILE;

    // METHOD 1: Tile-based majority voting (CRC-validated — crop resistant)
    const decodeWithOffset = (ox, oy) => {
      const votes  = new Array(PAYLOAD_BITS).fill(0);
      const counts = new Array(PAYLOAD_BITS).fill(0);
      for (let idx = 0; idx < data.length; idx += 4) {
        const pi = idx / 4;
        const tx = ((pi % imgW) + ox) % TILE;
        const ty = (Math.floor(pi / imgW) + oy) % TILE;
        const p  = ty * TILE + tx;
        const i0 = (2*p)   % PAYLOAD_BITS;
        const i1 = (2*p+1) % PAYLOAD_BITS;
        votes[i0] += (data[idx]   & 1); counts[i0]++;
        votes[i1] += (data[idx+1] & 1); counts[i1]++;
      }
      const bits = votes.map((v,i) => (counts[i] > 0 && v > counts[i]/2) ? 1 : 0);
      const uid  = parsePayloadBits(bits);
      if (!uid) return null;
      // Try B channel for full metadata
      const bBits = [];
      for (let idx = 0; idx < data.length; idx += 4) bBits.push(data[idx+2] & 1);
      const full = extractIMGCRYPT3FromBits(bBits);
      return full || { found: true, userId: uid, gps: { available: false }, timestamp: null, deviceId: null, deviceName: null, originalResolution: null };
    };

    let result = decodeWithOffset(0, 0);
    if (result) return result;

    for (let oy = 0; oy < TILE; oy++)
      for (let ox = 0; ox < TILE; ox++) {
        if (ox === 0 && oy === 0) continue;
        result = decodeWithOffset(ox, oy);
        if (result) return result;
      }

    // METHOD 2: B channel sequential (full IMGCRYPT3)
    const bBits = [];
    for (let idx = 0; idx < data.length; idx += 4) bBits.push(data[idx+2] & 1);
    const r2 = extractIMGCRYPT3FromBits(bBits);
    if (r2) return r2;

    // METHOD 3: Legacy R+G+B sequential
    const rgbBits = [];
    for (let idx = 0; idx < data.length; idx += 4)
      rgbBits.push(data[idx]&1, data[idx+1]&1, data[idx+2]&1);
    const r3 = extractIMGCRYPT3FromBits(rgbBits);
    if (r3) return r3;

    return { found: false, userId: null };
  } catch { return { found: false, userId: null }; }
};

const extractUUIDWithRotation = (canvas) => {
  for (const deg of [0, 90, 180, 270]) {
    const c      = deg === 0 ? canvas : rotateCanvas(canvas, deg);
    const result = extractUUIDFromCanvas(c);
    if (result.found) return { ...result, rotationDetected: deg };
  }
  return { found: false, userId: null, rotationDetected: null };
};

const checkUUIDAndOwnership = (canvas, vaultAsset) => {
  const extraction = extractUUIDWithRotation(canvas);
  if (!extraction.found)
    return { found: false, userId: null, matchesOwner: null, deviceName: null, gps: null, timestamp: null, originalResolution: null, rotationDetected: null };
  const vaultUserId = vaultAsset?.user_id || vaultAsset?.userId || null;
  const extractedId = extraction.userId;
  let matchesOwner  = null;
  if (vaultUserId && extractedId)
    matchesOwner = extractedId === vaultUserId ||
      extractedId.toLowerCase().includes(vaultUserId.toLowerCase()) ||
      vaultUserId.toLowerCase().includes(extractedId.toLowerCase());
  return { found: true, userId: extractedId, matchesOwner,
    deviceId:           extraction.deviceId           || null,
    deviceName:         extraction.deviceName         || null,
    gps:                extraction.gps                || { available: false },
    timestamp:          extraction.timestamp          || null,
    originalResolution: extraction.originalResolution || null,
    rotationDetected:   extraction.rotationDetected   || 0,
    vaultUserId, vaultOwner: vaultAsset?.owner_name || vaultAsset?.ownerName || null };
};

// =============================================================================
// PART 3: Canvas helpers
// =============================================================================
const rotateCanvas = (src, degrees) => {
  const c = document.createElement('canvas');
  const swap = degrees === 90 || degrees === 270;
  c.width  = swap ? src.height : src.width;
  c.height = swap ? src.width  : src.height;
  const ctx = c.getContext('2d');
  ctx.translate(c.width/2, c.height/2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(src, -src.width/2, -src.height/2);
  return c;
};

const loadImageToCanvas = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    resolve(c);
  };
  img.onerror = reject;
  img.src = src;
});

// =============================================================================
// PART 4: Colour histogram (Bhattacharyya coefficient)
// =============================================================================
const computeColorHistogram = (canvas) => {
  try {
    const SIZE = 128, BINS = 32;
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    c.getContext('2d').drawImage(canvas, 0, 0, SIZE, SIZE);
    const data  = c.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
    const r = new Float32Array(BINS), g = new Float32Array(BINS), b = new Float32Array(BINS);
    const total = SIZE * SIZE;
    for (let i = 0; i < total; i++) {
      r[Math.floor(data[i*4]   / (256/BINS))]++;
      g[Math.floor(data[i*4+1] / (256/BINS))]++;
      b[Math.floor(data[i*4+2] / (256/BINS))]++;
    }
    for (let i = 0; i < BINS; i++) { r[i] /= total; g[i] /= total; b[i] /= total; }
    return { r, g, b };
  } catch { return null; }
};

const histogramSimilarity = (h1, h2) => {
  if (!h1 || !h2) return null;
  let bc = 0;
  for (let i = 0; i < h1.r.length; i++)
    bc += Math.sqrt(h1.r[i]*h2.r[i]) + Math.sqrt(h1.g[i]*h2.g[i]) + Math.sqrt(h1.b[i]*h2.b[i]);
  return Math.round((bc / 3) * 100);
};

// =============================================================================
// PART 5: SHA-256
// =============================================================================
const computeFileSHA256 = async (file) => {
  try {
    const buf     = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
  } catch { return null; }
};

// =============================================================================
// PART 6: Pixel diff (supporting signal — compares against thumbnail)
// =============================================================================
// NOTE: This uses the stored Cloudinary thumbnail (up to 400px) as reference,
// not the full-resolution original. Treat hot-region maps as supportive context,
// not as the primary tampering verdict — thumbnail JPEG compression alone causes
// pixel differences on legitimate unmodified images.
const runPixelDiff = async (origSrc, uploadedCanvas) => {
  try {
    const origCanvas   = await loadImageToCanvas(origSrc);
    const SIZE = 256;
    const makeScaled   = (src) => {
      const c = document.createElement('canvas');
      c.width = SIZE; c.height = SIZE;
      c.getContext('2d').drawImage(src, 0, 0, SIZE, SIZE);
      return c.getContext('2d').getImageData(0, 0, SIZE, SIZE);
    };
    const origData     = makeScaled(origCanvas);
    const uploadedData = makeScaled(uploadedCanvas);
    const GRID = 4;
    const cellW = SIZE / GRID, cellH = SIZE / GRID;
    let totalDiff = 0, changedPixels = 0;
    const regionDiffs  = Array(GRID).fill(null).map(() => Array(GRID).fill(0));
    const regionCounts = Array(GRID).fill(null).map(() => Array(GRID).fill(0));
    let origBrightSum = 0, upBrightSum = 0;
    let origRSum = 0, origGSum = 0, origBSum = 0, upRSum = 0, upGSum = 0, upBSum = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const idx = (y*SIZE + x) * 4;
        const oR = origData.data[idx],     oG = origData.data[idx+1], oB = origData.data[idx+2];
        const uR = uploadedData.data[idx], uG = uploadedData.data[idx+1], uB = uploadedData.data[idx+2];
        const diff = (Math.abs(oR-uR) + Math.abs(oG-uG) + Math.abs(oB-uB)) / 3;
        totalDiff += diff;
        if (diff > 15) changedPixels++;
        const gx = Math.min(Math.floor(x/cellW), GRID-1);
        const gy = Math.min(Math.floor(y/cellH), GRID-1);
        regionDiffs[gy][gx]  += diff; regionCounts[gy][gx]++;
        origBrightSum += (oR+oG+oB)/3; upBrightSum += (uR+uG+uB)/3;
        origRSum += oR; origGSum += oG; origBSum += oB;
        upRSum   += uR; upGSum   += uG; upBSum   += uB;
      }
    }
    const totalPixels = SIZE * SIZE;
    const changedPct  = (changedPixels / totalPixels) * 100;
    const brightShift = (upBrightSum - origBrightSum) / totalPixels;
    const rShift = (upRSum - origRSum) / totalPixels;
    const gShift = (upGSum - origGSum) / totalPixels;
    const bShift = (upBSum - origBSum) / totalPixels;
    const rowNames = ['Top', 'Upper-mid', 'Lower-mid', 'Bottom'];
    const colNames = ['left', 'center-left', 'center-right', 'right'];
    const hotRegions = [];
    for (let gy = 0; gy < GRID; gy++)
      for (let gx = 0; gx < GRID; gx++) {
        const score = regionCounts[gy][gx] > 0 ? regionDiffs[gy][gx] / regionCounts[gy][gx] : 0;
        if (score > 8)
          hotRegions.push({ name: `${rowNames[gy]} ${colNames[gx]}`, score: Math.round(score),
            severity: score > 25 ? 'high' : score > 12 ? 'medium' : 'low' });
      }
    hotRegions.sort((a,b) => b.score - a.score);
    return {
      avgDiff:      Math.round((totalDiff / totalPixels) * 10) / 10,
      changedPct:   Math.round(changedPct * 10) / 10,
      changedPixels, totalPixels, hotRegions,
      brightShift:  Math.round(brightShift * 10) / 10,
      rShift: Math.round(rShift), gShift: Math.round(gShift), bShift: Math.round(bShift),
      pixelSimilarity: Math.round(Math.max(0, 100 - changedPct * 1.5)),
      vsThumb: true,
    };
  } catch { return null; }
};

// =============================================================================
// PART 7: JPEG/PNG editing tool detection (unchanged — working correctly)
// =============================================================================
const readStr = (view, offset, len) => {
  let s = '';
  for (let i = 0; i < len && offset+i < view.byteLength; i++)
    s += String.fromCharCode(view.getUint8(offset+i));
  return s;
};

const classifyFromSoftwareString = (sw) => {
  const s = (sw || '').toLowerCase();
  if (s.includes('adobe photoshop')) return sw;
  if (s.includes('adobe lightroom')) return sw;
  if (s.includes('adobe'))           return sw;
  if (s.includes('gimp'))            return sw;
  if (s.includes('inkscape'))        return 'Inkscape';
  if (s.includes('paint.net'))       return 'Paint.NET';
  if (s.includes('affinity'))        return sw;
  if (s.includes('canva'))           return 'Canva';
  if (s.includes('snapseed'))        return 'Snapseed';
  if (s.includes('vsco'))            return 'VSCO';
  if (s.includes('picsart'))         return 'PicsArt';
  if (s.includes('pixelmator'))      return 'Pixelmator';
  if (s.includes('darktable'))       return 'Darktable';
  if (s.includes('capture one'))     return 'Capture One';
  if (s.includes('facetune'))        return 'Facetune';
  if (s.includes('lightx'))          return 'LightX';
  return sw;
};

const parsePNGChunks = (view) => {
  try {
    let offset = 8, software = null, hasICC = false, iccProfile = '', hasXMP = false;
    let xmpTool = null, allTextKeys = [], physX = null, physUnit = null;
    while (offset < view.byteLength - 12) {
      const length = view.getUint32(offset, false);
      const type   = readStr(view, offset+4, 4);
      if (type === 'tEXt' || type === 'iTXt') {
        const data  = readStr(view, offset+8, Math.min(length, 1000));
        const lower = data.toLowerCase();
        const parts = data.split('\x00');
        const key   = (parts[0] || '').toLowerCase().trim();
        const val   = parts.slice(1).join('').trim();
        allTextKeys.push(key);
        if (key === 'software' && val)               software = val;
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
      if (type === 'iCCP') { hasICC = true; iccProfile = readStr(view, offset+8, Math.min(40, length)).split('\x00')[0].trim(); }
      if (type === 'pHYs' && length === 9) { physX = view.getUint32(offset+8, false); physUnit = view.getUint8(offset+16); }
      if (type === 'IEND') break;
      if (length > 100*1024*1024) break;
      offset += 12 + length;
    }
    if (software) return classifyFromSoftwareString(software);
    if (xmpTool)  return classifyFromSoftwareString(xmpTool);
    if (hasICC) {
      const icc = iccProfile.toLowerCase();
      if (icc.includes('adobe rgb') || icc.includes('prophoto')) return 'Adobe Photoshop / Lightroom (Adobe ICC profile)';
      if (icc.includes('display p3')) return 'macOS App / Apple device (Display P3 profile)';
      return `Image Editor (ICC profile: ${iccProfile || 'sRGB'})`;
    }
    if (hasXMP) return 'Professional Editor (XMP metadata present)';
    if (physUnit === 1 && physX === 3937) return 'Windows App — Paint / Snipping Tool (96 DPI)';
    if (physUnit === 1 && physX === 3780) return 'macOS App — Preview / Screenshot (96 DPI)';
    if (physUnit === 1 && physX === 2835) return 'Standard screen export (72 DPI)';
    if (allTextKeys.length > 0) return `Edited — metadata present (${allTextKeys.slice(0,2).join(', ')})`;
    return 'No metadata recorded (screenshot or basic app)';
  } catch { return null; }
};

const classifyByQuantizationTables = ({ lumTable, chromTable, chromaSub, hasJFIF, hasExif, make, imgW, imgH }) => {
  if (!lumTable) { if (!hasExif && hasJFIF) return 'Messenger / Social App (EXIF stripped)'; return null; }
  const maxDim = Math.max(imgW, imgH);
  const lumAvg = lumTable.reduce((a,b)=>a+b,0) / 64;
  const lumDC  = lumTable[0];
  const chromDC = chromTable ? chromTable[0] : 0;
  const estQ = lumAvg < 100 ? Math.round((200-lumAvg*2)/2) : Math.round(5000/lumAvg);
  const q = Math.max(1, Math.min(100, estQ));
  const scores = { whatsapp:0, instagram:0, telegram:0, facebook:0, twitter:0, snapchat:0 };
  if (lumDC>=6  && lumDC<=10)   scores.whatsapp+=30;
  if (lumAvg>=8 && lumAvg<=14)  scores.whatsapp+=20;
  if (chromaSub==='4:2:0')      scores.whatsapp+=25;
  if (!hasExif && hasJFIF)      scores.whatsapp+=15;
  if (maxDim<=1600 && maxDim>0) scores.whatsapp+=15;
  const isWAHD = lumDC>=3 && lumDC<=6 && chromaSub==='4:2:0' && maxDim>1600 && maxDim<=2560;
  if (isWAHD) scores.whatsapp+=20;
  if (imgW===1080 || imgH===1080) scores.instagram+=50;
  if (lumDC>=8  && lumDC<=13)     scores.instagram+=20;
  if (lumAvg>=10 && lumAvg<=18)   scores.instagram+=15;
  if (!hasExif && hasJFIF)        scores.instagram+=10;
  if (lumDC>=2  && lumDC<=6)      scores.telegram+=25;
  if (chromaSub==='4:2:2')        scores.telegram+=40;
  if (chromaSub==='4:4:4')        scores.telegram+=30;
  if (!hasExif && hasJFIF)        scores.telegram+=10;
  if (chromaSub==='4:2:0')        scores.telegram-=40;
  if (maxDim===960 || maxDim===720) scores.facebook+=40;
  if (maxDim===2048)              scores.facebook+=35;
  if (imgW===1200 || imgH===1200) scores.twitter+=45;
  if (lumDC>=10 && lumDC<=16)     scores.snapchat+=20;
  if ((imgW===1080&&imgH===1920)||(imgW===720&&imgH===1280)) scores.snapchat+=40;
  if (hasExif) { scores.whatsapp-=50; scores.instagram-=50; scores.telegram-=30; scores.facebook-=50; scores.twitter-=50; }
  const [platform, score] = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0];
  if (score < 40) { if (!hasExif && hasJFIF) return `Social Media / Messenger (EXIF stripped — quality ~${q}%)`; return null; }
  const detail = `quality ~${q}%, DC=${lumDC}, ${chromaSub||''}`;
  switch(platform) {
    case 'whatsapp':  return isWAHD ? `WhatsApp HD (${maxDim}px, ${detail})` : `WhatsApp (re-encoded — ${maxDim>0?maxDim+'px, ':''}${detail})`;
    case 'instagram': return `Instagram (re-encoded — 1080px, ${detail})`;
    case 'telegram':  return `Telegram (re-encoded — ${detail})`;
    case 'facebook':  return `Facebook (re-encoded — ${maxDim}px, ${detail})`;
    case 'twitter':   return `Twitter / X (re-encoded — 1200px, ${detail})`;
    case 'snapchat':  return `Snapchat (re-encoded — ${detail})`;
    default: return null;
  }
};

const extractEditingToolFromFile = (file, imgW=0, imgH=0) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const buf  = e.target.result;
      const view = new DataView(buf);
      const sig32 = view.getUint32(0, false);
      // FIX: Read full file for PNG — metadata chunks can appear after image data
      if (sig32 === 0x89504E47) { resolve(parsePNGChunks(view)); return; }
      if (view.getUint16(0, false) !== 0xFFD8) { resolve(null); return; }
      let software=null, xmpTool=null, comment=null, hasJFIF=false, hasExif=false;
      let hasApp13=false, hasAdobeICC=false, make=null, chromaSub=null;
      let lumTable=null, chromTable=null;
      let offset=2;
      while (offset < view.byteLength-4) {
        const marker = view.getUint16(offset, false);
        offset += 2;
        if (marker === 0xFFDA) break;
        const segLen = view.getUint16(offset, false);
        if (marker === 0xFFE0) { const id=readStr(view,offset+2,5); if (id.startsWith('JFIF')) hasJFIF=true; }
        if (marker === 0xFFE1) {
          const hdr = readStr(view,offset+2,6);
          if (hdr.startsWith('Exif')) {
            hasExif = true;
            const ts=offset+8, le=view.getUint16(ts,false)===0x4949;
            const ifd=view.getUint32(ts+4,le), num=view.getUint16(ts+ifd,le);
            for (let i=0; i<num; i++) {
              const en=ts+ifd+2+i*12; if (en+12 > ts+segLen) break;
              const tag=view.getUint16(en,le), cnt=view.getUint32(en+4,le);
              const vo=cnt>4 ? ts+view.getUint32(en+8,le) : en+8;
              if (tag===0x0131) software=readStr(view,vo,Math.min(cnt,100)).replace(/\0/g,'').trim();
              if (tag===0x010F) make    =readStr(view,vo,Math.min(cnt, 60)).replace(/\0/g,'').trim();
              if (tag===0x013C) comment =comment||readStr(view,vo,Math.min(cnt,200)).replace(/\0/g,'').trim();
            }
          }
          const fhdr=readStr(view,offset+2,30);
          if (fhdr.includes('http')||fhdr.includes('xpacket')) {
            const xmp=readStr(view,offset+2,Math.min(segLen-2,4000));
            const m=xmp.match(/CreatorTool[^>]*?>([^<]{1,100})</);
            if (m) xmpTool=m[1].trim();
          }
        }
        if (marker===0xFFE2) { const s=readStr(view,offset+2,Math.min(segLen,400)); if (s.includes('ICC_PROFILE')&&(s.includes('Adobe')||s.includes('ProPhoto'))) hasAdobeICC=true; }
        if (marker===0xFFED && readStr(view,offset+2,12).includes('Photoshop')) hasApp13=true;
        if (marker===0xFFFE) comment=comment||readStr(view,offset+2,Math.min(segLen-2,200)).replace(/\0/g,'').trim();
        if (marker===0xFFDB) {
          let tOffset=offset+2; const tEnd=offset+segLen;
          while (tOffset < tEnd-1) {
            const ptq=view.getUint8(tOffset); tOffset++;
            const precision=(ptq>>4)&0xF, tableId=ptq&0xF, coefSize=precision===0?1:2;
            const table=[];
            for (let i=0; i<64; i++) { if (tOffset+coefSize>view.byteLength) break; table.push(precision===0?view.getUint8(tOffset):view.getUint16(tOffset,false)); tOffset+=coefSize; }
            if (table.length===64) { if (tableId===0) lumTable=table; if (tableId===1) chromTable=table; }
          }
        }
        if (marker===0xFFC0||marker===0xFFC2) {
          try { if (segLen>=15&&view.getUint8(offset+7)>=3) { const h1=(view.getUint8(offset+9)>>4)&0xF, h2=(view.getUint8(offset+12)>>4)&0xF; chromaSub=h1===2&&h2===1?'4:2:0':h1===2&&h2===2?'4:2:2':'4:4:4'; } } catch {}
        }
        if (segLen < 2) break;
        offset += segLen;
      }
      if (software) { const t=classifyFromSoftwareString(software); if(t){resolve(t);return;} }
      if (xmpTool)  { const t=classifyFromSoftwareString(xmpTool);  if(t){resolve(t);return;} }
      if (hasApp13)            { resolve('Adobe Photoshop'); return; }
      if (hasAdobeICC&&!hasJFIF){ resolve('Adobe Photoshop / Lightroom'); return; }
      const cmt=(comment||'').toLowerCase();
      if (cmt.includes('gimp'))      { resolve('GIMP'); return; }
      if (cmt.includes('photoshop')) { resolve('Adobe Photoshop'); return; }
      if (cmt.includes('canva'))     { resolve('Canva'); return; }
      if (cmt.includes('snapseed'))  { resolve('Snapseed'); return; }
      resolve(classifyByQuantizationTables({ lumTable, chromTable, chromaSub, hasJFIF, hasExif, make, imgW, imgH }));
    } catch { resolve(null); }
  };
  reader.onerror = () => resolve(null);
  const isPNG = file.type === 'image/png' || (file.name||'').toLowerCase().endsWith('.png');
  reader.readAsArrayBuffer(isPNG ? file : file.slice(0, 1024*1024));
});

// =============================================================================
// PART 8: Format helpers
// =============================================================================
const formatTS = (ts) => {
  if (!ts) return 'Unknown';
  return new Date(ts).toLocaleString('en-US', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
};

const fmtFileSize = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'string') return parseFloat(raw) || null;
  return raw / 1024; // bytes → KB
};

// =============================================================================
// PART 9: Region Heatmap component
// =============================================================================
const RegionHeatmap = ({ hotRegions }) => {
  const rows = ['Top','Upper-mid','Lower-mid','Bottom'];
  const cols = ['left','center-left','center-right','right'];
  const scoreMap = {};
  (hotRegions || []).forEach(r => { scoreMap[r.name] = r.score; });
  return (
    <div style={{ display:'inline-flex', flexDirection:'column', gap:2 }}>
      {rows.map(row => (
        <div key={row} style={{ display:'flex', gap:2 }}>
          {cols.map(col => {
            const name  = `${row} ${col}`;
            const score = scoreMap[name] || 0;
            const bg    = score > 25 ? '#e53e3e' : score > 12 ? '#dd6b20' : score > 0 ? '#ecc94b' : '#c6f6d5';
            return (
              <div key={col} title={`${name}: intensity ${score}`}
                style={{ width:28, height:28, borderRadius:4, background:bg,
                  opacity: score > 0 ? 0.35 + (score/255)*0.65 : 0.35,
                  border:'1px solid rgba(0,0,0,0.1)' }} />
            );
          })}
        </div>
      ))}
      <div style={{ fontSize:10, color:'#718096', marginTop:3, textAlign:'center' }}>
        4×4 region heatmap (red=high, green=clean)
      </div>
    </div>
  );
};

// =============================================================================
// PART 10: Main comparison engine
// =============================================================================
const runComparison = async (uploadedCanvas, uploadedFile, originalAsset) => {
  const changes   = [];
  const uploadedW = uploadedCanvas.width;
  const uploadedH = uploadedCanvas.height;

  // Parse stored resolution ("1920 x 1080" or "1920x1080")
  const resParts = (originalAsset.resolution || originalAsset.assetResolution || '0 x 0').split(/\s*x\s*/i);
  const origW = parseInt(resParts[0]) || 0;
  const origH = parseInt(resParts[1]) || 0;

  const originalCaptureTime = originalAsset.captureTimestamp || originalAsset.capture_timestamp ||
    originalAsset.timestamp || originalAsset.dateEncrypted || null;
  const rawModifiedFileTime = uploadedFile.lastModified || null;

  // ── STEP A: EXIF / editing tool detection ────────────────────────────────────
  const editingTool = await extractEditingToolFromFile(uploadedFile, uploadedW, uploadedH);

  // ── STEP B: SHA-256 exact match (strongest possible signal — short-circuit) ──
  const uploadedSHA = await computeFileSHA256(uploadedFile);
  const origSHA     = originalAsset.fileHash || originalAsset.file_hash || null;

  if (origSHA && uploadedSHA && origSHA === uploadedSHA) {
    return {
      changes: [{ type:'info', category:'Integrity', text:'SHA-256 matches exactly — files are byte-for-byte identical.' }],
      isTampered:false, isModified:false, verdict3tier:'CLEAN',
      visualVerdict:'Exact Match', confidence:100,
      pHashSim:100, histSim:100, pixelAnalysis:null, editingTool:null,
      uuidCheck:null, pHashNote:null, pHashAlgorithm:null,
      originalCaptureTime, modifiedFileTime:null,
      origPHash: originalAsset.visualFingerprint || originalAsset.visual_fingerprint,
      uploadedPHash: originalAsset.visualFingerprint || originalAsset.visual_fingerprint,
      uploadedResolution:`${uploadedW} x ${uploadedH}`,
      uploadedSize:`${(uploadedFile.size/1024).toFixed(1)} KB`,
      timestamp:new Date().toISOString(), exactMatch:true,
    };
  }

  // ── STEP C: UUID / ownership extraction ─────────────────────────────────────
  const uuidCheck = checkUUIDAndOwnership(uploadedCanvas, originalAsset);

  if (uuidCheck.found) {
    if (uuidCheck.matchesOwner === false)
      changes.push({ type:'danger', category:'Ownership',
        text:`UUID found but belongs to a different user (extracted: ${uuidCheck.userId?.slice(0,16)}…). Possible stolen or forged asset.` });
    else if (uuidCheck.matchesOwner === true)
      changes.push({ type:'info', category:'Ownership', text:'UUID verified — ownership confirmed. Extracted user ID matches vault owner.' });
    else
      changes.push({ type:'info', category:'Ownership',
        text:`PINIT UUID detected (user: ${uuidCheck.userId?.slice(0,20)}…). Vault has no user_id to cross-check ownership.` });
    if (uuidCheck.rotationDetected > 0)
      changes.push({ type:'warning', category:'Ownership',
        text:`UUID recovered after applying ${uuidCheck.rotationDetected}° rotation correction — image was rotated after embedding.` });
    if (uuidCheck.originalResolution) {
      const embedded = uuidCheck.originalResolution.replace(/\s/g,'').toLowerCase();
      const current  = `${uploadedW}x${uploadedH}`;
      if (embedded !== current)
        changes.push({ type:'warning', category:'Crop/Resize',
          text:`Embedded original resolution (${uuidCheck.originalResolution}) differs from current (${uploadedW}×${uploadedH}) — image was resized or cropped after embedding.` });
    }
  } else {
    // WARNING (not danger): missing UUID means pixel-level edits occurred after embedding,
    // or the image was never registered. This alone is not sufficient for TAMPERED —
    // JPEG re-export, WhatsApp, brightness adjustments all destroy the UUID legitimately.
    changes.push({ type:'warning', category:'Ownership',
      text:'No PINIT ownership signature found. UUID is destroyed by any pixel-level adjustment (JPEG re-export, brightness, contrast, social media re-encoding) — its absence confirms changes were made after embedding but is not proof of malicious tampering.' });
  }

  // ── STEP D: pHash visual fingerprint (primary visual signal) ─────────────────
  const origPHash = originalAsset.visualFingerprint || originalAsset.visual_fingerprint || null;
  const { sim: pSim, rotation: detectedRotation, algorithm: pHashAlgorithm, isLegacy: pHashIsLegacy, note: pHashNote } =
    pHashSimWithRotationCompat(uploadedCanvas, origPHash);
  const uploadedPHash = computePerceptualHashFromCanvas(uploadedCanvas);

  // ── STEP E: Rotation-correct the canvas before pixel diff ────────────────────
  // FIX: Without this, a 90° rotation causes ~50% false pixel diff.
  const alignedCanvas = (detectedRotation && detectedRotation !== 0)
    ? rotateCanvas(uploadedCanvas, (360 - detectedRotation) % 360)
    : uploadedCanvas;

  // ── STEP F: Pixel diff against thumbnail (supporting signal) ─────────────────
  let pixelAnalysis = null;
  const thumbSrc = originalAsset.thumbnail || originalAsset.thumbnailUrl ||
    originalAsset.thumbnail_url || originalAsset.cloudinary_url;
  if (thumbSrc) pixelAnalysis = await runPixelDiff(thumbSrc, alignedCanvas);

  // ── STEP G: Colour histogram (secondary signal) ───────────────────────────────
  let histSim = null;
  if (thumbSrc) {
    try {
      const origThumb = await loadImageToCanvas(thumbSrc);
      histSim = histogramSimilarity(computeColorHistogram(origThumb), computeColorHistogram(uploadedCanvas));
    } catch { histSim = null; }
  }

  // ── STEP H: Structural comparisons ───────────────────────────────────────────
  // H1: Resolution
  const wDiff = Math.abs(uploadedW - origW), hDiff = Math.abs(uploadedH - origH);
  const resChanged = origW > 0 && ((wDiff/origW)>0.10 || (hDiff/(origH||1))>0.10 || wDiff>100 || hDiff>100);
  if (resChanged) {
    if (uploadedW < origW)
      changes.push({ type:'warning', category:'Resolution', text:`Downscaled: ${origW}×${origH} → ${uploadedW}×${uploadedH} (${Math.round((uploadedW/origW)*100)}% of original).` });
    else if (uploadedW > origW)
      changes.push({ type:'info', category:'Resolution', text:`Upscaled: ${origW}×${origH} → ${uploadedW}×${uploadedH}.` });
    else
      changes.push({ type:'warning', category:'Resolution', text:`Dimensions changed: ${origW}×${origH} → ${uploadedW}×${uploadedH}.` });
  }

  // H2: Aspect ratio / crop
  // WARNING (not danger): cropping is a geometric transform, not malicious tampering.
  // TC-03 (lossless crop) must return MODIFIED. TAMPERED requires pixel-level manipulation.
  if (origW > 0 && Math.abs((uploadedW/uploadedH) - (origW/origH)) > 0.08)
    changes.push({ type:'warning', category:'Cropping',
      text:`Aspect ratio changed (${(origW/origH).toFixed(2)} → ${(uploadedW/uploadedH).toFixed(2)}) — image was cropped after embedding.` });

  // H3: File size
  // FIX: fileSize stored as "245.50 KB" string. Old code divided by 1024 again → NaN.
  // Now: parseFloat("245.50 KB") = 245.50 ✓
  const origSizeKB     = fmtFileSize(originalAsset.fileSize || originalAsset.file_size);
  const uploadedSizeKB = uploadedFile.size / 1024;
  if (origSizeKB && origSizeKB > 1) {
    const pctDiff = ((origSizeKB - uploadedSizeKB) / origSizeKB) * 100;
    if (pctDiff > 20)
      changes.push({ type:'warning', category:'Compression',
        text:`File compressed — size reduced by ${Math.round(pctDiff)}% (${origSizeKB.toFixed(0)} KB → ${uploadedSizeKB.toFixed(0)} KB).` });
    else if (pctDiff < -20)
      changes.push({ type:'info', category:'Compression',
        text:`File grew — size increased by ${Math.round(Math.abs(pctDiff))}% (${origSizeKB.toFixed(0)} KB → ${uploadedSizeKB.toFixed(0)} KB).` });
  }

  // H4: Format
  const uploadedFmt = (uploadedFile.type || '').split('/')[1]?.toUpperCase();
  const origFmt     = (originalAsset.fileName || originalAsset.file_name || '').split('.').pop()?.toUpperCase();
  if (uploadedFmt && origFmt && uploadedFmt !== origFmt && origFmt !== 'PNG')
    changes.push({ type:'info', category:'Format', text:`Format changed: ${origFmt} → ${uploadedFmt}.` });

  // ── STEP I: Pixel-level findings ─────────────────────────────────────────────
  if (pixelAnalysis) {
    const { changedPct, hotRegions, brightShift, rShift, gShift, bShift } = pixelAnalysis;
    if (changedPct > 0.5 && changedPct <= 5) {
      if (pixelAnalysis.vsThumb) {
        // Comparing against Cloudinary thumbnail — JPEG compression alone causes ~1–5% pixel diff.
        // Downgrading to info so it doesn't trigger the MODIFIED verdict on a clean unedited file.
        changes.push({ type:'info', category:'Pixel Edit',
          text:`Minor pixel differences — ${changedPct}% vs thumbnail (expected from JPEG/WebP thumbnail compression; not evidence of editing).` });
      } else {
        changes.push({ type:'warning', category:'Pixel Edit',
          text:`Minor pixel edits — ${changedPct}% of pixels changed vs original.` });
      }
    }
    else if (changedPct > 5 && changedPct <= 20)
      changes.push({ type:'warning', category:'Pixel Edit', text:`Moderate edits — ${changedPct}% of pixels changed.` });
    else if (changedPct > 20)
      changes.push({ type:'danger', category:'Pixel Edit', text:`Extensive pixel modifications — ${changedPct}% of image altered.` });
    hotRegions.slice(0,3).forEach(r =>
      changes.push({ type: r.severity==='high' ? 'danger' : 'warning', category:'Region Edit',
        text:`Localised change in ${r.name} region (intensity: ${r.score}/255).` })
    );
    if (Math.abs(brightShift) > 5)
      changes.push({ type:'info', category:'Colour', text:`Brightness ${brightShift>0?'increased':'decreased'} by ~${Math.abs(brightShift).toFixed(1)} pts.` });
    const maxCh = Math.max(Math.abs(rShift), Math.abs(gShift), Math.abs(bShift));
    if (maxCh > 8) {
      const desc = [];
      if (Math.abs(rShift)>8) desc.push(`R ${rShift>0?'+':''}${rShift}`);
      if (Math.abs(gShift)>8) desc.push(`G ${gShift>0?'+':''}${gShift}`);
      if (Math.abs(bShift)>8) desc.push(`B ${bShift>0?'+':''}${bShift}`);
      changes.push({ type:'info', category:'Colour', text:`Colour grading applied — channel shifts: ${desc.join(', ')}.` });
    }
  }

  // ── STEP J: pHash visual verdict ─────────────────────────────────────────────
  let visualVerdict = 'Unknown';
  if (pSim !== null) {
    if (detectedRotation && detectedRotation !== 0)
      changes.push({ type:'warning', category:'Rotation',
        text:`Image was rotated ${detectedRotation}° — best pHash match found at that rotation (similarity ${pSim}%).` });
    if      (pSim < 40) { changes.push({ type:'danger',  category:'Visual', text:`Completely different image — perceptual similarity only ${pSim}%. Almost certainly a different image entirely.` }); visualVerdict='Completely Different'; }
    else if (pSim < 55) { changes.push({ type:'warning', category:'Visual', text:`High visual divergence — perceptual similarity ${pSim}%. Significant content changes detected (heavy crop, filter, or partial replacement).` }); visualVerdict='Heavily Modified'; }
    else if (pSim < 70) { changes.push({ type:'warning', category:'Visual', text:`Significant visual changes — perceptual similarity ${pSim}%.` });     visualVerdict='Moderately Modified'; }
    else if (pSim < 90) { changes.push({ type:'warning', category:'Visual', text:`Noticeable visual changes — perceptual similarity ${pSim}%.` });      visualVerdict='Lightly Modified'; }
    else                { visualVerdict = pSim >= 99 ? 'Near-Identical' : 'High Similarity'; }
  } else if (histSim !== null && histSim < 40) {
    changes.push({ type:'danger', category:'Visual', text:`Very different colour profile — histogram similarity only ${histSim}% (no fingerprint stored for deeper comparison).` });
    visualVerdict = 'Likely Different';
  }

  if (histSim !== null && pSim !== null && histSim < 40 && pSim < 55)
    changes.push({ type:'danger', category:'Colour Profile', text:`Colour histogram very different (${histSim}%) — confirms different image content.` });

  if (editingTool) {
    // If metadata is absent AND UUID was found (proving the asset was originally registered
    // with embedded data), treat it as a warning — metadata was likely stripped (TC-19).
    // For all other editing tool detections keep as info.
    const isNoMeta   = editingTool.startsWith('No metadata recorded');
    const toolType   = (isNoMeta && uuidCheck.found) ? 'warning' : 'info';
    const toolText   = isNoMeta && uuidCheck.found
      ? `Metadata stripped — no software signature recorded. Original asset had embedded ownership data; stripping metadata is a reportable change.`
      : `Editing software detected in file metadata: ${editingTool}.`;
    changes.push({ type: toolType, category:'Tool', text: toolText });
  }

  // ── STEP K: 3-TIER VERDICT ────────────────────────────────────────────────────
  // TAMPERED: explicit danger signals only —
  //   • pHash < 40 (completely different image — TC-14, TC-20)
  //   • histSim < 40 AND pSim < 55 (different image confirmed by two signals — TC-14)
  //   • hotRegion 'high' severity (localised pixel manipulation — TC-11, TC-12, TC-13)
  //   • extensive pixel change >20% (TC-11)
  //   • UUID found but owner MISMATCH (TC-20 stolen/forged)
  //   NOTE: missing UUID alone is NOT TAMPERED — JPEG/WhatsApp/brightness all destroy it (TC-06..10,17,18)
  //   NOTE: pSim alone (even 40-70%) is NOT TAMPERED — crop+brightness+contrast stays MODIFIED (TC-08)
  //
  // MODIFIED: technical changes present but not malicious —
  //   • Any warning-level change: crop, resize, rotate, compression, no-UUID, no-metadata, social recompression
  //   • pSim 40-92% (visible changes but not proven different image)
  //
  // CLEAN: no significant changes detected

  const dangerChanges   = changes.filter(c => c.type === 'danger' && c.category !== 'Ownership');
  // ownerMismatch = UUID was FOUND but belongs to a different owner (stolen/forged).
  // "No UUID" is now a warning so it no longer triggers ownerMismatch here.
  const ownerMismatch   = changes.some(c => c.type === 'danger' && c.category === 'Ownership');
  const warningChanges  = changes.filter(c => c.type === 'warning');
  const strongTamper    = dangerChanges.length > 0 || ownerMismatch;
  const hasWarnings     = warningChanges.length > 0 || (pSim !== null && pSim < 92) || !uuidCheck.found;

  let verdict3tier, isTampered, isModified;
  if (strongTamper)     { verdict3tier='TAMPERED'; isTampered=true;  isModified=false; }
  else if (hasWarnings) { verdict3tier='MODIFIED'; isTampered=false; isModified=true;  }
  else                  { verdict3tier='CLEAN';    isTampered=false; isModified=false; }

  const modifiedFileTime = (isTampered || isModified) ? rawModifiedFileTime : null;

  // ── STEP L: Confidence score ──────────────────────────────────────────────────
  // Base from visual signals
  let confidence = 0;
  if (pSim !== null) {
    confidence = pSim;
    if (histSim !== null) confidence = Math.round(confidence * 0.70 + histSim * 0.30);
    // Pixel penalty reduced — pixel diff vs thumbnail is noisy for cropped images
    if (pixelAnalysis) confidence = Math.round(Math.max(0, confidence - Math.min(10, pixelAnalysis.changedPct * 0.2)));
  } else if (histSim !== null) {
    confidence = histSim;
    if (pixelAnalysis) confidence = Math.round(Math.max(0, confidence - Math.min(10, pixelAnalysis.changedPct * 0.2)));
  } else if (pixelAnalysis) {
    confidence = pixelAnalysis.pixelSimilarity;
  }

  // Structural penalties — capped so they can't stack to 0 on a legitimate modified image
  let totalPenalty = 0;
  if (resChanged)                                              totalPenalty += 8;
  if (changes.some(c => c.category === 'Cropping'))           totalPenalty += 8;
  if (changes.some(c => c.category === 'Compression'))        totalPenalty += 5;
  if (changes.some(c => c.category === 'Rotation'))           totalPenalty += 3;
  if (!uuidCheck.found)                                        totalPenalty += 12;
  if (uuidCheck.found && uuidCheck.matchesOwner === false)     totalPenalty += 30;
  // Cap total structural penalty — prevents legitimate modified images hitting 0%
  totalPenalty = Math.min(totalPenalty, 30);
  confidence = Math.max(0, confidence - totalPenalty);

  // UUID ownership confirmed = cryptographic proof this is the same asset.
  // Even a heavily cropped + filtered image should never show 0% if UUID matches.
  if (uuidCheck.found && uuidCheck.matchesOwner === true)  confidence = Math.max(confidence, 38);
  else if (uuidCheck.found && uuidCheck.matchesOwner === null) confidence = Math.max(confidence, 22);

  confidence = Math.min(100, confidence);

  return {
    changes, isTampered, isModified, verdict3tier, visualVerdict, confidence,
    pHashSim: pSim, pHashNote, pHashAlgorithm, histSim, detectedRotation,
    pixelAnalysis, editingTool, uuidCheck, origPHash, uploadedPHash,
    originalCaptureTime, modifiedFileTime,
    uploadedResolution: `${uploadedW} x ${uploadedH}`,
    uploadedSize: `${(uploadedFile.size/1024).toFixed(1)} KB`,
    timestamp: new Date().toISOString(), exactMatch: false,
  };
};

// =============================================================================
// PART 11: HTML report download
// =============================================================================
const downloadHTMLReport = (originalAsset, result, origPreview, modPreview) => {
  const changeRows = result.changes.map(c => {
    const color = c.type==='danger'?'#e53e3e':c.type==='warning'?'#dd6b20':'#3182ce';
    const bg    = c.type==='danger'?'#fff5f5':c.type==='warning'?'#fffaf0':'#ebf8ff';
    return `<tr style="background:${bg}"><td style="color:${color};font-weight:700;white-space:nowrap;padding:10px 16px">${c.category}</td><td style="padding:10px 16px;color:#2d3748">${c.text}</td></tr>`;
  }).join('');

  const vColor = result.verdict3tier==='TAMPERED'?'#9b2c2c':result.verdict3tier==='MODIFIED'?'#7b341e':'#22543d';
  const vBg    = result.verdict3tier==='TAMPERED'?'#fed7d7':result.verdict3tier==='MODIFIED'?'#feebc8':'#c6f6d5';
  const vLabel = result.verdict3tier==='TAMPERED'
    ? '🚨 TAMPERED — Strong evidence of deliberate alteration'
    : result.verdict3tier==='MODIFIED'
      ? '⚡ MODIFIED — Technical changes detected (may not be malicious)'
      : '✓ CLEAN — No significant changes detected';

  const uuidHtml = result.uuidCheck ? `
    <div class="card"><div class="card-head">🔐 UUID / Ownership Verification</div>
    <div class="row"><span class="lbl">UUID Found</span><span class="val" style="color:${result.uuidCheck.found?'#38a169':'#e53e3e'}">${result.uuidCheck.found?'Yes':'No'}</span></div>
    ${result.uuidCheck.found ? `
    <div class="row"><span class="lbl">Extracted User</span><span class="val">${result.uuidCheck.userId||'—'}</span></div>
    <div class="row"><span class="lbl">Ownership Match</span><span class="val" style="color:${result.uuidCheck.matchesOwner?'#38a169':result.uuidCheck.matchesOwner===false?'#e53e3e':'#718096'}">${result.uuidCheck.matchesOwner===true?'✓ Matches vault owner':result.uuidCheck.matchesOwner===false?'⚠ Different owner':'Could not verify'}</span></div>
    ${result.uuidCheck.deviceName?`<div class="row"><span class="lbl">Embedded Device</span><span class="val">${result.uuidCheck.deviceName}</span></div>`:''}
    ${result.uuidCheck.gps?.available?`<div class="row"><span class="lbl">Embedded GPS</span><span class="val">${result.uuidCheck.gps.coordinates}</span></div>`:''}
    ${result.uuidCheck.originalResolution?`<div class="row"><span class="lbl">Embedded Resolution</span><span class="val">${result.uuidCheck.originalResolution}</span></div>`:''}
    ` : '<div class="row"><span class="lbl">Reason</span><span class="val">No PINIT signature found.</span></div>'}
    </div>` : '';

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>PINIT Forensic Report</title>
<style>*{box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;margin:0;padding:40px;background:#f0f4f8;color:#2d3748}
.header{background:linear-gradient(135deg,#1a202c,#2d3748);color:white;padding:36px;border-radius:16px;margin-bottom:28px}
.header h1{margin:0 0 6px;font-size:24px}.header p{margin:0;opacity:.6;font-size:13px}
.badge{display:inline-block;padding:8px 20px;border-radius:20px;font-size:13px;font-weight:700;margin-top:14px;background:${vBg};color:${vColor}}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
.card{background:white;border-radius:12px;padding:24px;box-shadow:0 2px 10px rgba(0,0,0,.07);margin-bottom:20px}
.card-head{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#718096;border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin:0 0 14px}
.row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f7fafc;font-size:13px}.row:last-child{border:none}
.lbl{font-weight:600;color:#4a5568}.val{color:#2d3748;font-family:monospace;font-size:12px;max-width:300px;word-break:break-all;text-align:right}
.images{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
.img-box{background:white;border-radius:12px;padding:16px;box-shadow:0 2px 10px rgba(0,0,0,.07);text-align:center}
.img-box h3{margin:0 0 12px;font-size:12px;color:#718096;text-transform:uppercase}
.img-box img{max-width:100%;max-height:280px;border-radius:8px;border:1px solid #e2e8f0}
.score{font-size:56px;font-weight:800;color:#667eea;text-align:center}
table{width:100%;border-collapse:collapse}th{background:#2d3748;color:white;padding:11px 16px;text-align:left;font-size:12px;text-transform:uppercase}
td{border-bottom:1px solid #e2e8f0;font-size:13px;vertical-align:top}tr:last-child td{border:none}
.footer{text-align:center;padding:20px;color:#a0aec0;font-size:12px;margin-top:28px;border-top:1px solid #e2e8f0}
</style></head><body>
<div class="header"><h1>🔍 PINIT Forensic Analysis Report</h1>
<p>Generated: ${new Date().toLocaleString()} · Report ID: RPT-${Date.now()}</p>
<div><span class="badge">${vLabel}</span></div></div>
<div class="images">
<div class="img-box"><h3>🔒 Original (Vault)</h3>${origPreview?`<img src="${origPreview}" alt="Original"/>`:'<p style="color:#a0aec0;padding:40px 0">Thumbnail not available</p>'}</div>
<div class="img-box"><h3>🔍 Submitted</h3>${modPreview?`<img src="${modPreview}" alt="Submitted"/>`:'<p style="color:#a0aec0;padding:40px 0">Preview not available</p>'}</div>
</div>
<div class="card" style="text-align:center"><div class="score">${result.confidence}%</div><div style="color:#718096">${result.visualVerdict||'Analysis Complete'}</div></div>
${uuidHtml}
<div class="grid2">
<div class="card"><div class="card-head">🔒 Original Asset</div>
<div class="row"><span class="lbl">Asset ID</span><span class="val">${originalAsset.assetId||originalAsset.id}</span></div>
<div class="row"><span class="lbl">Owner</span><span class="val">${originalAsset.ownerName||originalAsset.owner_name||'—'}</span></div>
<div class="row"><span class="lbl">Registered</span><span class="val">${new Date(originalAsset.dateEncrypted||originalAsset.timestamp||Date.now()).toLocaleDateString()}</span></div>
<div class="row"><span class="lbl">Resolution</span><span class="val">${originalAsset.resolution||originalAsset.assetResolution||'—'}</span></div>
<div class="row"><span class="lbl">pHash Algorithm</span><span class="val">${result.pHashAlgorithm||'N/A'}</span></div>
<div class="row"><span class="lbl">SHA-256</span><span class="val">${(originalAsset.fileHash||originalAsset.file_hash||'—').substring(0,24)}…</span></div>
</div>
<div class="card"><div class="card-head">🔍 Submitted Image</div>
<div class="row"><span class="lbl">Resolution</span><span class="val">${result.uploadedResolution}</span></div>
<div class="row"><span class="lbl">File Size</span><span class="val">${result.uploadedSize}</span></div>
${result.modifiedFileTime?`<div class="row"><span class="lbl">Last Modified</span><span class="val">${formatTS(result.modifiedFileTime)}</span></div>`:''}
<div class="row"><span class="lbl">pHash Similarity</span><span class="val">${result.pHashSim!==null?result.pHashSim+'%':'—'}</span></div>
<div class="row"><span class="lbl">Histogram Similarity</span><span class="val">${result.histSim!==null?result.histSim+'%':'—'}</span></div>
<div class="row"><span class="lbl">Editing Tool</span><span class="val">${result.editingTool||'Not detected'}</span></div>
<div class="row"><span class="lbl">Verdict</span><span class="val" style="font-weight:700">${result.verdict3tier}</span></div>
</div></div>
<div class="card"><div class="card-head">⚠ Complete Change Analysis</div>
${result.changes.length===0?'<p style="color:#38a169;font-weight:600;margin:0">✓ No modifications detected</p>':
`<table><thead><tr><th>Category</th><th>Finding</th></tr></thead><tbody>${changeRows}</tbody></table>`}
</div>
${result.pHashNote?`<div class="card"><div class="card-head">ℹ Fingerprint Note</div><p style="margin:0;font-size:13px;color:#718096">${result.pHashNote}</p></div>`:''}
<div class="footer">PINIT Image Forensics System · ${new Date().toISOString()}</div>
</body></html>`;

  const blob = new Blob([html], { type:'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `pinit-report-${originalAsset.assetId||'asset'}-${Date.now()}.html`;
  a.click(); URL.revokeObjectURL(url);
};

// =============================================================================
// PART 12: Main Component
// =============================================================================
function AssetTrackingPage() {
  const navigate = useNavigate();
  const [assets,             setAssets]             = useState([]);
  const [filteredAssets,     setFilteredAssets]     = useState([]);
  const [searchQuery,        setSearchQuery]        = useState('');
  const [compareAsset,       setCompareAsset]       = useState(null);
  const [compareFile,        setCompareFile]        = useState(null);
  const [comparePreview,     setComparePreview]     = useState(null);
  const [deleteConfirm,      setDeleteConfirm]      = useState(null);
  const [deleting,           setDeleting]           = useState(false);
  const [comparing,          setComparing]          = useState(false);
  const [comparisonResult,   setComparisonResult]   = useState(null);
  const [linkCopied,         setLinkCopied]         = useState(false);
  const fileInputRef = useRef(null);

  // FIX: Group by fileHash not assetId — assetId format differs between API + localStorage
  // initialSearch: assetId passed from Verify page via ?search= URL param
  // Filtering on raw data avoids the stale state closure bug in .then()
  const loadAssets = async (initialSearch = null) => {
    try {
      const { adminAPI } = await import('../api/client');
      const response = await adminAPI.getAllVault();
      const vault    = response.assets || [];
      const reports  = JSON.parse(localStorage.getItem('analysisReports') || '[]');
      const vaultIds = new Set(vault.map(v => v.asset_id || v.assetId));
      const extras   = reports.filter(r => !vaultIds.has(r.assetId));

      const normalisedVault = vault.map(a => ({
        ...a,
        assetId:            a.asset_id           || a.assetId,
        ownerName:          a.owner_name          || a.ownerName,
        ownerEmail:         a.owner_email         || a.ownerEmail,
        fileHash:           a.file_hash           || a.fileHash,
        visualFingerprint:  a.visual_fingerprint  || a.visualFingerprint,
        thumbnailUrl:       a.thumbnail_url       || a.thumbnailUrl,
        dateEncrypted:      a.created_at          || a.dateEncrypted,
        captureTimestamp:   a.capture_timestamp   || a.captureTimestamp,
        fileName:           a.file_name           || a.fileName,
        fileSize:           a.file_size           || a.fileSize,
        certificateId:      a.certificate_id      || a.certificateId,
        blockchainAnchor:   a.blockchain_anchor   || a.blockchainAnchor,
      }));

      const combined = [...normalisedVault, ...extras];
      const hashGroups = {};
      combined.forEach(a => {
        const key = a.fileHash || a.file_hash || a.assetId || a.id;
        hashGroups[key] = (hashGroups[key] || 0) + 1;
      });
      const withMeta = combined.map(a => ({
        ...a,
        versionCount: hashGroups[a.fileHash || a.file_hash || a.assetId || a.id] || 1,
        isDuplicate:  (hashGroups[a.fileHash || a.file_hash || a.assetId || a.id] || 1) > 1,
      }));
      setAssets(withMeta);
      if (initialSearch) {
        const q = initialSearch.toLowerCase();
        setFilteredAssets(withMeta.filter(a =>
          (a.assetId||'').toLowerCase().includes(q) ||
          (a.ownerName||'').toLowerCase().includes(q) ||
          (a.fileHash||'').toLowerCase().includes(q)
        ));
        setSearchQuery(initialSearch);
      } else {
        setFilteredAssets(withMeta);
      }
    } catch (err) {
      console.warn('API unavailable, using localStorage:', err.message);
      const vault   = JSON.parse(localStorage.getItem('vaultImages') || '[]');
      const reports = JSON.parse(localStorage.getItem('analysisReports') || '[]');
      const vaultIds = new Set(vault.map(v => v.assetId));
      const combined = [...vault, ...reports.filter(r => !vaultIds.has(r.assetId))];
      const hashGroups = {};
      combined.forEach(a => { const k=a.fileHash||a.assetId||a.id; hashGroups[k]=(hashGroups[k]||0)+1; });
      const withMeta = combined.map(a => ({ ...a, versionCount:hashGroups[a.fileHash||a.assetId||a.id]||1, isDuplicate:(hashGroups[a.fileHash||a.assetId||a.id]||1)>1 }));
      setAssets(withMeta);
      if (initialSearch) {
        const q = initialSearch.toLowerCase();
        setFilteredAssets(withMeta.filter(a =>
          (a.assetId||'').toLowerCase().includes(q) ||
          (a.ownerName||'').toLowerCase().includes(q)
        ));
        setSearchQuery(initialSearch);
      } else {
        setFilteredAssets(withMeta);
      }
    }
  };

  const handleRefresh = () => window.location.reload();

  useEffect(() => {
    // Read ?search= param set by Verify page when admin clicks Compare on a visual match
    const params    = new URLSearchParams(window.location.search);
    const preSearch = params.get('search') || null;
    loadAssets(preSearch);
  }, []);

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (!query.trim()) { setFilteredAssets(assets); return; }
    const q = query.toLowerCase();
    setFilteredAssets(assets.filter(a =>
      (a.assetId||'').toLowerCase().includes(q) ||
      (a.userId ||'').toLowerCase().includes(q) ||
      (a.ownerName||'').toLowerCase().includes(q) ||
      (a.certificateId||'').toLowerCase().includes(q) ||
      (a.fileHash||'').toLowerCase().includes(q) ||
      (a.deviceId||'').toLowerCase().includes(q)
    ));
  };

  const deleteAsset = async (asset) => {
    setDeleting(true);
    const id = asset.assetId || asset.id;
    try { const { vaultAPI } = await import('../api/client'); await vaultAPI.delete(id); } catch (err) { console.warn('Backend delete failed:', err); }
    try {
      ['vaultImages','analysisReports'].forEach(key => {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify(arr.filter(a => a.assetId !== id && a.id !== id)));
      });
    } catch {}
    setAssets(prev => prev.filter(a => (a.assetId||a.id) !== id));
    setFilteredAssets(prev => prev.filter(a => (a.assetId||a.id) !== id));
    setDeleting(false); setDeleteConfirm(null);
    alert('Asset deleted permanently.');
  };

  const openCompare = (asset) => {
    setCompareAsset(asset); setCompareFile(null); setComparePreview(null);
    setComparisonResult(null); setLinkCopied(false);
  };
  const closeCompare = () => { setCompareAsset(null); setCompareFile(null); setComparePreview(null); setComparisonResult(null); };
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
      setComparisonResult(result); setComparing(false);

      // Save to backend for audit trail (fire-and-forget — doesn't affect UI)
      try {
        const { compareAPI } = await import('../api/client');
        await compareAPI.save({
          asset_id:              compareAsset.assetId || compareAsset.asset_id,
          is_tampered:           result.isTampered,
          confidence:            result.confidence,
          visual_verdict:        result.verdict3tier || result.visualVerdict,
          editing_tool:          result.editingTool || null,
          changes:               result.changes,
          pixel_analysis:        result.pixelAnalysis || {},
          phash_sim:             result.pHashSim !== null ? Math.round(result.pHashSim) : null,
          uploaded_resolution:   result.uploadedResolution,
          uploaded_size:         String(result.uploadedSize || ''),
          original_capture_time: result.originalCaptureTime || null,
          modified_file_time:    result.modifiedFileTime ? new Date(result.modifiedFileTime).toISOString() : null,
        });
      } catch (err) {
        console.warn('Could not save comparison to backend:', err.message);
      }
    };
    img.src = comparePreview;
  };

  // Uses the existing /public/verify?data= route (PublicVerifyPage) — no new files needed.
  const handleCopyLink = () => {
    if (!compareAsset || !comparisonResult) return;
    const payload = {
      v:                   1,
      assetId:             compareAsset.assetId || compareAsset.id,
      certId:              compareAsset.certificateId,
      owner:               compareAsset.ownerName || compareAsset.userId,
      registered:          compareAsset.dateEncrypted || compareAsset.timestamp,
      origResolution:      compareAsset.resolution || compareAsset.assetResolution,
      origHash:            compareAsset.fileHash || compareAsset.file_hash,
      origFingerprint:     compareAsset.visualFingerprint || compareAsset.visual_fingerprint,
      blockchainAnchor:    compareAsset.blockchainAnchor,
      originalCaptureTime: comparisonResult.originalCaptureTime,
      modifiedFileTime:    comparisonResult.modifiedFileTime,
      editingTool:         comparisonResult.editingTool,
      comparedAt:          comparisonResult.timestamp,
      confidence:          comparisonResult.confidence,
      visualVerdict:       comparisonResult.visualVerdict,
      isTampered:          comparisonResult.isTampered,
      uploadedResolution:  comparisonResult.uploadedResolution,
      uploadedSize:        comparisonResult.uploadedSize,
      uploadedFingerprint: comparisonResult.uploadedPHash,
      pHashSim:            comparisonResult.pHashSim,
      pixelChangedPct:     comparisonResult.pixelAnalysis?.changedPct,
      hotRegions:          comparisonResult.pixelAnalysis?.hotRegions,
      changes:             comparisonResult.changes,
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const url     = `${window.location.origin}/public/verify?data=${encoded}`;
    navigator.clipboard.writeText(url).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 3000); });
  };

  const handleDownload = () => {
    if (!compareAsset || !comparisonResult) return;
    downloadHTMLReport(compareAsset, comparisonResult,
      compareAsset.thumbnail || compareAsset.thumbnailUrl || compareAsset.cloudinary_url, comparePreview);
  };

  const formatDate = (ts) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString('en-US', { day:'2-digit', month:'short', year:'numeric' });
  };

  const hasRichData = (a) => !!(a.fileHash||a.file_hash||a.visualFingerprint||a.visual_fingerprint||a.certificateId||a.certificate_id);

  const verdictBanner = (v3) => {
    if (v3 === 'TAMPERED') return { cls:'tampered', icon:<AlertTriangle size={28}/>, label:'🚨 TAMPERED — Strong evidence of deliberate alteration', sub:'This image shows clear signs of intentional modification.' };
    if (v3 === 'MODIFIED') {
      const hasCrop    = comparisonResult?.changes?.some(c => c.category === 'Cropping' || c.category === 'Crop/Resize');
      const uuidGone   = comparisonResult && !comparisonResult.uuidCheck?.found;
      const hasBright  = comparisonResult?.changes?.some(c => c.category === 'Colour');
      let sub = 'Technical changes detected — image is a modified derivative of the registered original.';
      if (hasCrop && uuidGone && hasBright)
        sub = 'Image was cropped and pixel-edited (brightness/contrast). The embedded UUID was destroyed by pixel manipulation — this is forensic evidence of editing after registration.';
      else if (uuidGone && hasCrop)
        sub = 'Image was cropped after registration. UUID embedding survives simple crops but was not found — pixel-level changes likely also applied.';
      else if (uuidGone)
        sub = 'Embedded UUID not found. UUID survives cropping alone but is destroyed by brightness, contrast, or filter adjustments — its absence indicates pixel-level editing.';
      return { cls:'modified', icon:<AlertTriangle size={28} style={{color:'#dd6b20'}}/>, label:'⚡ MODIFIED — This image is a derivative of the registered original', sub };
    }
    return { cls:'clean', icon:<CheckCircle size={28}/>, label:'✓ CLEAN — No significant changes detected', sub:'Image matches the vault original within normal encoding tolerances.' };
  };

  return (
    <div className="asset-tracking-page">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="tracking-header">
        <div>
          <h1>Asset Tracking</h1>
          <p className="subtitle">Multi-signal forensic comparison: pHash · UUID · pixel diff · EXIF · histogram</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div className="tracking-stats">
            <div className="stat-card"><span className="stat-number">{assets.length}</span><span className="stat-label">Total Assets</span></div>
            <div className="stat-card"><span className="stat-number">{assets.filter(a=>hasRichData(a)).length}</span><span className="stat-label">Fingerprinted</span></div>
            <div className="stat-card"><span className="stat-number">{assets.filter(a=>a.isDuplicate).length}</span><span className="stat-label">Duplicates</span></div>
          </div>
          <button onClick={handleRefresh} style={{padding:'10px 20px',background:'#6366f1',color:'white',border:'none',borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontWeight:600,fontSize:'0.9rem',whiteSpace:'nowrap'}}>
            <RefreshCw size={16}/> Refresh
          </button>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="search-section">
        <div className="search-bar">
          <Search className="search-icon" size={20}/>
          <input type="text" placeholder="Search by Asset ID, Owner, Certificate, File Hash…"
            value={searchQuery} onChange={e=>handleSearch(e.target.value)} className="search-input"/>
          {searchQuery && <button onClick={()=>handleSearch('')} className="clear-search">✕</button>}
        </div>
      </div>
      {searchQuery && <div className="search-results-info">Found {filteredAssets.length} result{filteredAssets.length!==1?'s':''} for "{searchQuery}"</div>}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="tracking-table-container">
        {filteredAssets.length > 0 ? (
          <table className="tracking-table">
            <thead>
              <tr>
                <th>Thumbnail</th><th>Asset ID</th><th>Owner</th><th>Registered</th>
                <th>Certificate</th><th>Vault Data</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset, idx) => (
                <tr key={asset.id||asset.assetId||idx} style={{background:asset.isDuplicate?'#fffbeb':'transparent'}}>
                  <td>
                    <div className="asset-thumbnail">
                      {asset.thumbnailUrl||asset.thumbnail||asset.encryptedData
                        ? <img src={asset.thumbnailUrl||asset.thumbnail||asset.encryptedData} alt={asset.assetId}
                            onClick={()=>window.open(asset.thumbnailUrl||asset.thumbnail||asset.encryptedData,'_blank')}/>
                        : <div className="thumbnail-placeholder">No Image</div>}
                    </div>
                  </td>
                  <td>
                    <span className="asset-id-link" onClick={()=>navigate(`/admin/track/${asset.assetId}`)}>
                      {asset.assetId||asset.id}
                    </span>
                  </td>
                  <td>
                    <div className="creator-info">
                      <div className="creator-avatar">{(asset.ownerName||asset.userName||asset.userId||'U').charAt(0).toUpperCase()}</div>
                      <div>
                        <div className="creator-name">{asset.ownerName||asset.userName||'Unknown'}</div>
                        <div className="creator-email">{asset.ownerEmail||asset.userEmail||asset.userId}</div>
                      </div>
                    </div>
                  </td>
                  <td><div className="date-cell"><Calendar size={14}/>{formatDate(asset.dateEncrypted||asset.timestamp||asset.createdAt)}</div></td>
                  <td>
                    <span className="cert-badge" title={asset.certificateId||asset.certificate_id}>
                      {(asset.certificateId||asset.certificate_id)
                        ? <><Lock size={12}/> {(asset.certificateId||asset.certificate_id).substring(0,10)}…</>
                        : <span style={{color:'#a0aec0',fontSize:12}}>—</span>}
                    </span>
                  </td>
                  <td>
                    {hasRichData(asset) ? (
                      <div className="vault-indicators">
                        {(asset.fileHash||asset.file_hash)          && <span className="vault-chip hash"><Hash size={10}/> SHA-256</span>}
                        {(asset.visualFingerprint||asset.visual_fingerprint) && (
                          <span className="vault-chip fp" title={(asset.visualFingerprint||asset.visual_fingerprint).length===64?'256-bit DCT (new)':'64-bit avg (legacy)'}>
                            <Fingerprint size={10}/> {(asset.visualFingerprint||asset.visual_fingerprint).length===64?'pHash-256':'pHash-64 ⚠'}
                          </span>
                        )}
                        {(asset.blockchainAnchor||asset.blockchain_anchor) && <span className="vault-chip bc"><Cpu size={10}/> Chain</span>}
                      </div>
                    ) : <span style={{color:'#a0aec0',fontSize:12}}>No fingerprint</span>}
                  </td>
                  <td>
                    {asset.isDuplicate
                      ? <span className="version-badge modified" title="Same SHA-256 detected in multiple entries"><TrendingUp size={14}/> {asset.versionCount}× duplicate</span>
                      : <span className="version-badge original">Unique</span>}
                  </td>
                  <td>
                    <div style={{display:'flex',gap:6,alignItems:'center'}}>
                      <button className="btn-compare" onClick={()=>openCompare(asset)}><GitCompare size={14}/> Compare</button>
                      <button onClick={()=>setDeleteConfirm(asset)} title="Delete Asset"
                        style={{display:'flex',alignItems:'center',justifyContent:'center',width:32,height:32,border:'none',borderRadius:6,background:'#fee2e2',color:'#dc2626',cursor:'pointer',flexShrink:0}}
                        onMouseEnter={e=>e.currentTarget.style.background='#fca5a5'}
                        onMouseLeave={e=>e.currentTarget.style.background='#fee2e2'}>
                        <Trash2 size={15}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <Activity size={64} className="empty-icon"/>
            <h3>No Assets Found</h3>
            <p>{searchQuery?`No assets match "${searchQuery}"`:'No tracked assets yet. Encrypt images to start building your vault.'}</p>
          </div>
        )}
      </div>

      {/* ── Compare Panel ──────────────────────────────────────────────────── */}
      {compareAsset && (
        <div className="compare-overlay" onClick={e=>e.target===e.currentTarget&&closeCompare()}>
          <div className="compare-panel">
            <div className="panel-header">
              <div>
                <h2><GitCompare size={20}/> Forensic Comparison</h2>
                <p className="panel-subtitle">6 signals: SHA-256 · UUID extraction · pHash (auto-compat) · pixel diff · histogram · EXIF</p>
              </div>
              <button className="btn-close" onClick={closeCompare}><X size={20}/></button>
            </div>

            <div className="panel-body">
              {/* Original asset info strip */}
              <div className="original-info-strip">
                <Shield size={16} className="shield-icon"/>
                <div style={{flex:1}}>
                  <strong>Vault Original:</strong> {compareAsset.assetId||compareAsset.id}
                  {compareAsset.ownerName && <span> · {compareAsset.ownerName}</span>}
                  <div style={{marginTop:4,display:'flex',gap:8,flexWrap:'wrap'}}>
                    {(compareAsset.visualFingerprint||compareAsset.visual_fingerprint)
                      ? <span style={{fontSize:11,background:'#c6f6d5',color:'#22543d',borderRadius:4,padding:'2px 8px'}}>
                          ✓ pHash stored ({(compareAsset.visualFingerprint||compareAsset.visual_fingerprint).length===64?'256-bit':'64-bit legacy'})
                        </span>
                      : <span style={{fontSize:11,background:'#fed7d7',color:'#9b2c2c',borderRadius:4,padding:'2px 8px'}}>⚠ No fingerprint — visual comparison limited</span>}
                    {(compareAsset.fileHash||compareAsset.file_hash)
                      && <span style={{fontSize:11,background:'#ebf8ff',color:'#2c5282',borderRadius:4,padding:'2px 8px'}}>✓ SHA-256 stored</span>}
                  </div>
                </div>
              </div>

              {/* Side-by-side columns */}
              <div className="compare-columns">
                <div className="compare-col">
                  <div className="compare-col-label"><span className="col-badge original">🔒 Original (Vault Thumbnail)</span></div>
                  <div className="image-frame">
                    {compareAsset.thumbnail||compareAsset.thumbnailUrl||compareAsset.cloudinary_url||compareAsset.image_url
                      ? <img src={compareAsset.thumbnail||compareAsset.thumbnailUrl||compareAsset.cloudinary_url||compareAsset.image_url} alt="Original" className="compare-img"/>
                      : <div className="no-thumb"><Eye size={32}/><p>Thumbnail not stored — pixel diff unavailable</p></div>}
                  </div>
                  <div className="meta-chips">
                    {(compareAsset.resolution||compareAsset.assetResolution) && <span className="meta-chip"><strong>Res:</strong> {compareAsset.resolution||compareAsset.assetResolution}</span>}
                    {compareAsset.captureTimestamp && <span className="meta-chip"><Clock size={10}/> Captured: {formatTS(compareAsset.captureTimestamp)}</span>}
                    {(compareAsset.fileHash||compareAsset.file_hash) && <span className="meta-chip hash-chip"><Hash size={10}/> {(compareAsset.fileHash||compareAsset.file_hash).substring(0,16)}…</span>}
                  </div>
                </div>

                <div className="compare-col">
                  <div className="compare-col-label"><span className="col-badge modified">🔍 Upload for Comparison</span></div>
                  <div className={`upload-drop ${comparePreview?'has-image':''}`}
                    onClick={()=>fileInputRef.current?.click()}
                    onDrop={e=>{e.preventDefault();handleCompareFile(e.dataTransfer.files[0]);}}
                    onDragOver={e=>e.preventDefault()}>
                    {comparePreview
                      ? <img src={comparePreview} alt="Compare" className="compare-img"/>
                      : <div className="upload-prompt"><Upload size={32}/><p>Drop image here or click to upload</p><span>JPG, PNG, WEBP</span></div>}
                    <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>handleCompareFile(e.target.files[0])}/>
                  </div>
                  {compareFile && (
                    <div className="meta-chips">
                      <span className="meta-chip"><strong>File:</strong> {compareFile.name}</span>
                      <span className="meta-chip"><strong>Size:</strong> {(compareFile.size/1024).toFixed(1)} KB</span>
                      {compareFile.lastModified && <span className="meta-chip"><Clock size={10}/> Modified: {formatTS(compareFile.lastModified)}</span>}
                    </div>
                  )}
                </div>
              </div>

              {compareFile && !comparisonResult && (
                <button className="btn-run-compare" onClick={runCompare} disabled={comparing}>
                  {comparing
                    ? <><span className="spinner"/> Extracting UUID · Computing pHash · Running pixel diff · Analysing EXIF…</>
                    : <><ChevronRight size={16}/> Run Forensic Analysis</>}
                </button>
              )}

              {/* ── Results ─────────────────────────────────────────────────── */}
              {comparisonResult && (() => {
                const vb = verdictBanner(comparisonResult.verdict3tier);
                return (
                  <div className="comparison-results">

                    {/* 3-tier verdict banner */}
                    <div className={`verdict-banner ${vb.cls}`}>
                      <div className="verdict-icon">{vb.icon}</div>
                      <div className="verdict-text">
                        <h3>{comparisonResult.exactMatch ? '✓ Exact Match — Byte-for-Byte Identical' : vb.label}</h3>
                        <p>{vb.sub}</p>
                        <p style={{margin:'4px 0 0',opacity:.85}}>{comparisonResult.visualVerdict} · Similarity: {comparisonResult.confidence}%</p>
                      </div>
                      <div className="verdict-score">{comparisonResult.confidence}%</div>
                    </div>

                    {/* UUID strip */}
                    {comparisonResult.uuidCheck && (() => {
                      const { found, matchesOwner, userId, deviceName, gps, originalResolution, rotationDetected } = comparisonResult.uuidCheck;
                      const uColor = found && matchesOwner!==false ? '#276749' : '#c53030';
                      const uBg    = found && matchesOwner!==false ? '#f0fff4' : '#fff5f5';
                      const uBorder = found && matchesOwner!==false ? '#9ae6b4' : '#feb2b2';
                      return (
                        <div style={{display:'flex',alignItems:'flex-start',gap:12,padding:'12px 16px',borderRadius:8,marginBottom:12,background:uBg,border:`1px solid ${uBorder}`}}>
                          <div style={{fontSize:22}}>{found?(matchesOwner===false?'⚠️':'🔐'):'⚠️'}</div>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:600,fontSize:13,color:uColor}}>
                              {found
                                ? matchesOwner===true  ? 'UUID Verified — Ownership Confirmed'
                                : matchesOwner===false ? 'UUID Found — Different Owner Detected'
                                : 'UUID Detected — Ownership Unverified'
                                : 'No UUID Found — No PINIT Signature'}
                            </div>
                            {found && (
                              <div style={{fontSize:12,color:'#4a5568',marginTop:4,lineHeight:1.6}}>
                                User: <code style={{fontFamily:'monospace',fontSize:11}}>{userId?.slice(0,20)}…</code>
                                {deviceName && <> · Device: {deviceName}</>}
                                {gps?.available && <> · GPS: <a href={gps.mapsUrl} target="_blank" rel="noreferrer" style={{color:'#3182ce'}}>{gps.coordinates}</a></>}
                                {originalResolution && <> · Embedded res: {originalResolution}</>}
                                {rotationDetected > 0 && <> · Recovered after {rotationDetected}° rotation</>}
                              </div>
                            )}
                          </div>
                          <div>{found && matchesOwner===true ? <UserCheck size={20} color="#38a169"/> : found && matchesOwner===false ? <UserX size={20} color="#e53e3e"/> : <Key size={20} color="#718096"/>}</div>
                        </div>
                      );
                    })()}

                    {/* pHash legacy note */}
                    {comparisonResult.pHashNote && (
                      <div style={{background:'#ebf8ff',border:'1px solid #bee3f8',borderRadius:8,padding:'10px 14px',marginBottom:12,fontSize:12,color:'#2c5282'}}>
                        ℹ {comparisonResult.pHashNote}
                      </div>
                    )}

                    {/* Actions moved to bottom of results */}
                    <div className="sim-bar-wrap">
                      <div className="sim-bar-track">
                        <div className={`sim-bar-fill ${comparisonResult.confidence>=80?'high':comparisonResult.confidence>=50?'mid':'low'}`}
                          style={{width:`${comparisonResult.confidence}%`}}/>
                      </div>
                      <span className="sim-bar-label">Overall Similarity Score</span>
                    </div>

                    {/* Forensic meta strip */}
                    <div className="forensic-meta-strip">
                      <div className="forensic-meta-item">
                        <Clock size={14} className="fmi-icon original"/>
                        <div><div className="fmi-label">Original Capture Time</div>
                          <div className="fmi-value">{comparisonResult.originalCaptureTime?formatTS(comparisonResult.originalCaptureTime):'Not recorded'}</div></div>
                      </div>
                      <div className="forensic-meta-item">
                        <Clock size={14} className="fmi-icon modified"/>
                        <div><div className="fmi-label">File Last Modified</div>
                          <div className="fmi-value">{comparisonResult.modifiedFileTime?formatTS(comparisonResult.modifiedFileTime):<span className="fmi-na">—</span>}</div></div>
                      </div>
                      <div className="forensic-meta-item">
                        <Wrench size={14} className="fmi-icon tool"/>
                        <div><div className="fmi-label">Editing Tool</div>
                          <div className="fmi-value">{comparisonResult.editingTool?<span className="tool-tag">{comparisonResult.editingTool}</span>:<span className="fmi-na">Not detected</span>}</div></div>
                      </div>
                      <div className="forensic-meta-item">
                        <Fingerprint size={14} className="fmi-icon pixel"/>
                        <div><div className="fmi-label">pHash ({comparisonResult.pHashAlgorithm||'—'})</div>
                          <div className="fmi-value">{comparisonResult.pHashSim!==null?`${comparisonResult.pHashSim}% similarity`:'No stored fingerprint'}</div></div>
                      </div>
                    </div>

                    {/* Changes + heatmap */}
                    <div className="changes-section">
                      <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
                        <div style={{flex:1}}>
                          <h4>Complete Change Analysis — All 6 Signals Combined</h4>
                          {comparisonResult.changes.length===0
                            ? <div className="no-changes"><CheckCircle size={16}/> No modifications detected — image matches vault original.</div>
                            : <ul className="changes-list">
                                {comparisonResult.changes.map((c,i) => (
                                  <li key={i} className={`change-item ${c.type}`}>
                                    <span className="change-dot"/>
                                    <div>
                                      {c.category && <span className="change-category">{c.category}</span>}
                                      <span className="change-text">{c.text}</span>
                                    </div>
                                  </li>
                                ))}
                              </ul>}
                        </div>
                        {comparisonResult.pixelAnalysis?.hotRegions?.length > 0 && (
                          <div style={{flexShrink:0}}>
                            <h4 style={{marginBottom:8,fontSize:13}}>Change Heatmap</h4>
                            <RegionHeatmap hotRegions={comparisonResult.pixelAnalysis.hotRegions}/>
                            <div style={{fontSize:10,color:'#a0aec0',marginTop:4}}>vs thumbnail (not full-res)</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Data comparison grid */}
                    <div className="data-compare-grid">
                      <div className="data-col">
                        <div className="data-col-head original">Original Asset</div>
                        <div className="data-row"><span>Registered</span><span className="ts-value-cell">{formatTS(compareAsset.dateEncrypted||compareAsset.timestamp)}</span></div>
                        <div className="data-row"><span>Capture Time</span><span className="ts-value-cell">{comparisonResult.originalCaptureTime?formatTS(comparisonResult.originalCaptureTime):'—'}</span></div>
                        <div className="data-row"><span>Owner</span><span>{compareAsset.ownerName||compareAsset.userId||'—'}</span></div>
                        <div className="data-row"><span>Resolution</span><span>{compareAsset.resolution||compareAsset.assetResolution||'—'}</span></div>
                        <div className="data-row"><span>pHash Format</span><span style={{fontSize:11}}>{(compareAsset.visualFingerprint||compareAsset.visual_fingerprint)?((compareAsset.visualFingerprint||compareAsset.visual_fingerprint).length===64?'256-bit (new)':'64-bit (legacy)'):'Not stored'}</span></div>
                        <div className="data-row"><span>SHA-256</span><span className="mono-small">{(compareAsset.fileHash||compareAsset.file_hash)?(compareAsset.fileHash||compareAsset.file_hash).substring(0,20)+'…':'—'}</span></div>
                        {(compareAsset.certificateId||compareAsset.certificate_id) && <div className="data-row verified-row"><CheckCircle size={12}/> Certificate Verified</div>}
                      </div>
                      <div className="data-col">
                        <div className="data-col-head modified">Submitted Image</div>
                        {comparisonResult.modifiedFileTime && <div className="data-row"><span>Last Modified</span><span className="ts-value-cell">{formatTS(comparisonResult.modifiedFileTime)}</span></div>}
                        <div className="data-row"><span>Compared At</span><span className="ts-value-cell">{formatTS(comparisonResult.timestamp)}</span></div>
                        <div className="data-row"><span>Editing Tool</span><span>{comparisonResult.editingTool||<span className="fmi-na">Not detected</span>}</span></div>
                        <div className="data-row"><span>Verdict</span><span style={{fontWeight:700,color:comparisonResult.isTampered?'#c53030':comparisonResult.isModified?'#c05621':'#276749'}}>{comparisonResult.verdict3tier}</span></div>
                        <div className="data-row"><span>Resolution</span><span>{comparisonResult.uploadedResolution}</span></div>
                        <div className="data-row"><span>File Size</span><span>{comparisonResult.uploadedSize}</span></div>
                        {comparisonResult.pixelAnalysis && <div className="data-row"><span>Pixels Changed (vs thumb)</span><span>{comparisonResult.pixelAnalysis.changedPct}%</span></div>}
                        <div className="data-row"><span>pHash Similarity</span><span>{comparisonResult.pHashSim!==null?`${comparisonResult.pHashSim}%`:'—'}</span></div>
                        <div className="data-row"><span>Histogram</span><span>{comparisonResult.histSim!==null?`${comparisonResult.histSim}%`:'—'}</span></div>
                      </div>
                    </div>

                    {/* Actions — at the very bottom of results */}
                    <div className="report-actions">
                      <button className={`btn-action copy-link ${linkCopied?'copied':''}`} onClick={handleCopyLink}>
                        <Link size={16}/>
                        {linkCopied ? '✓ Link Copied!' : 'Copy Verification Link'}
                      </button>
                      <button className="btn-action download-report" onClick={handleDownload}>
                        <Download size={16}/> Download HTML Report
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ────────────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="compare-overlay" onClick={()=>!deleting&&setDeleteConfirm(null)}>
          <div className="compare-panel" style={{maxWidth:420,height:'auto',padding:0}} onClick={e=>e.stopPropagation()}>
            <div className="compare-header" style={{borderBottom:'1px solid #fee2e2'}}>
              <h2 style={{color:'#dc2626',display:'flex',alignItems:'center',gap:8,fontSize:16}}><Trash2 size={18}/> Delete Asset</h2>
              <button className="btn-close" onClick={()=>setDeleteConfirm(null)}><X size={20}/></button>
            </div>
            <div style={{padding:24}}>
              <p style={{color:'#374151',marginBottom:12,fontSize:14}}>Are you sure you want to permanently delete this asset?</p>
              <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:8,padding:12,fontSize:13,color:'#7f1d1d'}}>
                <div><strong>Asset ID:</strong> {deleteConfirm.assetId}</div>
                <div><strong>Owner:</strong> {deleteConfirm.ownerName||deleteConfirm.owner||'—'}</div>
                <div style={{marginTop:8,fontWeight:600}}>⚠️ Removes asset from backend and local storage permanently.</div>
              </div>
              <div style={{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'}}>
                <button onClick={()=>setDeleteConfirm(null)} disabled={deleting}
                  style={{padding:'9px 18px',borderRadius:8,border:'1px solid #d1d5db',background:'white',cursor:'pointer',fontWeight:600,fontSize:13}}>Cancel</button>
                <button onClick={()=>deleteAsset(deleteConfirm)} disabled={deleting}
                  style={{display:'flex',alignItems:'center',gap:6,padding:'9px 18px',background:deleting?'#fca5a5':'#dc2626',color:'white',border:'none',borderRadius:8,cursor:deleting?'not-allowed':'pointer',fontWeight:600,fontSize:13}}>
                  <Trash2 size={14}/>{deleting?'Deleting...':'Yes, Delete'}
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