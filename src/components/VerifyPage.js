import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, XCircle, AlertCircle, Image as ImageIcon, Info } from 'lucide-react';
import './VerifyPage.css';

function VerifyPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const fileInputRef = useRef(null);

  // Image hash generation (simple perceptual hash)
  const generateImageHash = (imageData) => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // Create a simple hash based on image characteristics
    let hash = 0;
    const sampleInterval = Math.floor(data.length / 1000);
    
    for (let i = 0; i < data.length; i += sampleInterval) {
      hash = ((hash << 5) - hash) + data[i];
      hash |= 0;
    }
    
    hash = ((hash << 5) - hash) + width;
    hash = ((hash << 5) - hash) + height;
    hash |= 0;
    
    return Math.abs(hash).toString(36).toUpperCase().padStart(12, '0');
  };

  // ── Advanced UUID Extraction (same engine as ImageCryptoAnalyzer) ──────────
  const STEGO_TILE     = 12;
  const UUID_FIELD_LEN = 32;
  const PAYLOAD_BYTES  = 1 + UUID_FIELD_LEN + 2;
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
      for (let b = 0; b < 8; b++) v = (v << 1) | (bits[i * 8 + b] || 0);
      bytes[i] = v;
    }
    const lenByte    = bytes[0];
    if (lenByte <= 0 || lenByte > UUID_FIELD_LEN) return null;
    const uuidPadded = bytes.slice(1, 1 + UUID_FIELD_LEN);
    const crcRead    = (bytes[PAYLOAD_BYTES - 2] << 8) | bytes[PAYLOAD_BYTES - 1];
    const forCrc     = new Uint8Array(1 + UUID_FIELD_LEN);
    forCrc[0] = lenByte; forCrc.set(uuidPadded, 1);
    if (crc16js(forCrc) !== crcRead) return null;
    let uid = '';
    for (let i = 0; i < lenByte; i++) uid += String.fromCharCode(uuidPadded[i]);
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
    if (pts.length < 2 || !pts[0] || pts[0].length < 2) return null;
    return { userId: pts[0], gps: pts[1]||'NOGPS', timestamp: pts[2]||null, deviceId: pts[3]||null, deviceName: pts[4]||null };
  };

  const extractIMGCRYPT3 = (bits) => {
    const total = bits.length;
    const maxScan = Math.min(total - 800, 3200);
    const maxRead = Math.min(500, Math.floor(total / 8));
    for (let off = 0; off <= maxScan; off += 8) {
      let text = '';
      for (let c = 0; c < maxRead; c++) {
        const s = off + c * 8;
        if (s + 8 > total) break;
        let v = 0;
        for (let b = 0; b < 8; b++) v = (v << 1) | bits[s + b];
        text += (v >= 32 && v <= 126) ? String.fromCharCode(v) : '