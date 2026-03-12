import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, XCircle, Image as ImageIcon } from 'lucide-react';
import './VerifyPage.css';

function VerifyPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const fileInputRef = useRef(null);

  const generateImageHash = (imageData) => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
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

  const STEGO_TILE     = 12;
  const UUID_FIELD_LEN = 36; // support full UUID with hyphens
  const PAYLOAD_BYTES  = 1 + UUID_FIELD_LEN + 2;
  const PAYLOAD_BITS   = PAYLOAD_BYTES * 8;

  // Normalize UUID for comparison — strip hyphens, lowercase
  const normalizeUUID = (id) => (id || '').replace(/-/g, '').toLowerCase();

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
    return { userId: pts[0], gps: pts[1]||'NOGPS', timestamp: pts[2]||null, deviceId: pts[3]||null };
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
        text += (v >= 32 && v <= 126) ? String.fromCharCode(v) : String.fromCharCode(0);
      }
      if (!text.includes('IMGCRYPT')) continue;
      const p = parseIMGCRYPT3Msg(text);
      if (p) return { found: true, userId: p.userId, deviceId: p.deviceId, timestamp: p.timestamp };
    }
    return null;
  };

  const extractUUIDWithRotation = (sourceCanvas) => {
    const ctx       = sourceCanvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const data      = imageData.data;
    const imgW      = sourceCanvas.width;
    const TILE      = STEGO_TILE;

    const decodeWithOffset = (ox, oy) => {
      const votes  = new Array(PAYLOAD_BITS).fill(0);
      const counts = new Array(PAYLOAD_BITS).fill(0);
      for (let idx = 0; idx < data.length; idx += 4) {
        const pi = idx / 4;
        const tx = ((pi % imgW) + ox) % TILE;
        const ty = (Math.floor(pi / imgW) + oy) % TILE;
        const p  = ty * TILE + tx;
        const i0 = (2 * p)     % PAYLOAD_BITS;
        const i1 = (2 * p + 1) % PAYLOAD_BITS;
        votes[i0]  += (data[idx]     & 1); counts[i0]++;
        votes[i1]  += (data[idx + 1] & 1); counts[i1]++;
      }
      const bits = votes.map((v, i) => (counts[i] > 0 && v > counts[i] / 2) ? 1 : 0);
      return parsePayloadBits(bits);
    };

    let uid = decodeWithOffset(0, 0);
    if (uid) return { found: true, userId: uid };

    for (let oy = 0; oy < TILE; oy++) {
      for (let ox = 0; ox < TILE; ox++) {
        if (ox === 0 && oy === 0) continue;
        uid = decodeWithOffset(ox, oy);
        if (uid) return { found: true, userId: uid };
      }
    }

    const bBits = [];
    for (let idx = 0; idx < data.length; idx += 4) bBits.push(data[idx + 2] & 1);
    const r2 = extractIMGCRYPT3(bBits);
    if (r2) return r2;

    const rgbBits = [];
    for (let idx = 0; idx < data.length; idx += 4) {
      rgbBits.push(data[idx] & 1, data[idx+1] & 1, data[idx+2] & 1);
    }
    const r3 = extractIMGCRYPT3(rgbBits);
    if (r3) return r3;

    return { found: false };
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setVerificationResult(null);
      setCurrentStep(0);
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setVerificationResult(null);
      setCurrentStep(0);
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const sleep = (ms) => new Promise(res => setTimeout(res, ms));

  const verifyImage = async () => {
    if (!selectedFile) return;
    setVerifying(true);
    setVerificationResult(null);
    setCurrentStep(1);

    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      await sleep(700);
      setCurrentStep(2);

      const uuidResult = extractUUIDWithRotation(canvas);

      await sleep(700);
      setCurrentStep(3);
      await sleep(600);
      setCurrentStep(4);

      let matchFound   = false;
      let matchedAsset = null;

      if (uuidResult.found) {
        try {
          const { adminAPI } = await import('../api/client');
          const response = await adminAPI.getAllVault();
          const allAssets = response?.data || response || [];

          const extractedNorm = normalizeUUID(uuidResult.userId);
          const backendMatch = allAssets.find(a =>
            normalizeUUID(a.owner_name)     === extractedNorm ||
            normalizeUUID(a.asset_id)       === extractedNorm ||
            normalizeUUID(a.user_id)        === extractedNorm ||
            normalizeUUID(a.uuid)           === extractedNorm ||
            normalizeUUID(a.watermark_id)   === extractedNorm ||
            normalizeUUID(a.unique_user_id) === extractedNorm
          );

          if (backendMatch) {
            matchFound   = true;
            matchedAsset = {
              userName     : backendMatch.owner_name || backendMatch.user_name || backendMatch.name,
              uniqueUserId : backendMatch.owner_name || backendMatch.asset_id,
              dateEncrypted: backendMatch.capture_timestamp || backendMatch.created_at,
            };
          }
        } catch (e) {
          console.warn('Backend lookup failed, falling back to localStorage', e);
        }
      }

      if (!matchFound) {
        const vaultAssets  = JSON.parse(localStorage.getItem('vaultImages')     || '[]');
        const reportAssets = JSON.parse(localStorage.getItem('analysisReports') || '[]');
        const storedAssets = [...vaultAssets, ...reportAssets];

        if (uuidResult.found) {
          const extractedNorm = normalizeUUID(uuidResult.userId);
          const found = storedAssets.find(a =>
            normalizeUUID(a.uniqueUserId) === extractedNorm ||
            normalizeUUID(a.userId)       === extractedNorm ||
            normalizeUUID(a.uuid)         === extractedNorm ||
            normalizeUUID(a.owner_name)   === extractedNorm ||
            normalizeUUID(a.asset_id)     === extractedNorm
          );
          if (found) {
            matchFound   = true;
            matchedAsset = found;
          }
        }
      }

      await sleep(400);
      setCurrentStep(5);

      setVerificationResult({
        matchFound,
        asset    : matchedAsset,
        uuid     : uuidResult.userId || null,
        uuidFound: uuidResult.found,
      });

      setVerifying(false);
    };

    img.src = preview;
  };

  const steps = [
    'Scanning image metadata',
    'Extracting hidden watermark',
    'Recovering UUID',
    'Looking up owner in backend',
  ];

  return (
    <div className="verify-page">
      <div className="verify-header">
        <h1>Verify Image Authenticity</h1>
        <p className="subtitle">Upload any image to check if it matches our encrypted asset database</p>
      </div>

      <div className="verify-container">

        {/* Upload Section */}
        <div className="upload-section">
          <div
            className="upload-area"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            {preview ? (
              <div className="preview-container">
                <img src={preview} alt="Preview" className="preview-image" />
                <div className="preview-overlay"><p>Click to change image</p></div>
              </div>
            ) : (
              <div className="upload-placeholder">
                <Upload size={48} className="upload-icon" />
                <h3>Drop image here or click to upload</h3>
                <p>Supports: JPG, PNG, JPEG</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          {selectedFile && (
            <div className="file-info">
              <ImageIcon size={20} />
              <div>
                <div className="file-name">{selectedFile.name}</div>
                <div className="file-size">{(selectedFile.size / 1024).toFixed(2)} KB</div>
              </div>
            </div>
          )}

          <button
            onClick={verifyImage}
            disabled={!selectedFile || verifying}
            className="btn-verify"
          >
            {verifying ? '🔍 Verifying...' : 'Verify Image'}
          </button>
        </div>

        {/* Live Scanning Steps */}
        {(verifying || (verificationResult && currentStep === 5)) && (
          <div style={{
            marginTop: '24px',
            padding: '20px 24px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
          }}>
            <p style={{ fontWeight: '600', marginBottom: '14px', color: '#1e293b', fontSize: '14px' }}>
              🔍 Verification Process
            </p>
            {steps.map((step, i) => {
              const stepNum = i + 1;
              const done    = currentStep > stepNum;
              const active  = currentStep === stepNum;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 0',
                  borderBottom: i < steps.length - 1 ? '1px solid #f1f5f9' : 'none',
                  color: done ? '#16a34a' : active ? '#2563eb' : '#94a3b8',
                  fontSize: '13px',
                  transition: 'color 0.3s',
                }}>
                  <span style={{ fontSize: '15px', minWidth: '20px' }}>
                    {done ? '✅' : active ? '⏳' : '○'}
                  </span>
                  <span style={{ fontWeight: (active || done) ? '600' : '400' }}>{step}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Result Card */}
        {verificationResult && (
          <div style={{ marginTop: '24px' }}>
            {verificationResult.matchFound && verificationResult.asset ? (
              <div style={{
                background: '#f0fdf4',
                border: '2px solid #86efac',
                borderRadius: '14px',
                padding: '24px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                  <CheckCircle size={26} color="#16a34a" />
                  <span style={{ fontSize: '17px', fontWeight: '700', color: '#166534' }}>
                    Image Owner Identified
                  </span>
                </div>

                {[
                  {
                    label: 'Image Owner',
                    value: verificationResult.asset.userName ||
                           verificationResult.asset.uniqueUserId ||
                           verificationResult.asset.ownerName || '—',
                    highlight: true,
                  },
                  {
                    label: 'UUID',
                    value: verificationResult.uuid ||
                           verificationResult.asset.uniqueUserId || '—',
                    mono: true,
                  },
                  {
                    label: 'Captured on',
                    value: new Date(
                      verificationResult.asset.dateEncrypted ||
                      verificationResult.asset.timestamp    ||
                      verificationResult.asset.createdAt    ||
                      Date.now()
                    ).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
                  },
                ].map(({ label, value, highlight, mono }) => (
                  <div key={label} style={{
                    display: 'flex', gap: '12px', alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid #d1fae5',
                  }}>
                    <span style={{ minWidth: '120px', fontWeight: '600', color: '#374151', fontSize: '13px' }}>
                      {label}
                    </span>
                    <span style={{
                      fontSize: mono ? '12px' : '14px',
                      fontWeight: highlight ? '700' : '500',
                      color: highlight ? '#166534' : '#1e293b',
                      fontFamily: mono ? 'monospace' : 'inherit',
                      background: highlight ? '#dcfce7' : mono ? '#f1f5f9' : 'transparent',
                      padding: (highlight || mono) ? '3px 10px' : '0',
                      borderRadius: '6px',
                      letterSpacing: mono ? '0.04em' : 'normal',
                    }}>
                      {value}
                    </span>
                  </div>
                ))}

                <p style={{
                  marginTop: '16px', fontSize: '12px', color: '#166534',
                  paddingTop: '12px', borderTop: '1px solid #bbf7d0'
                }}>
                  ✅ This proves who captured the image.
                </p>
              </div>
            ) : (
              <div style={{
                background: '#fef2f2',
                border: '2px solid #fca5a5',
                borderRadius: '14px',
                padding: '24px',
              }}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <XCircle size={26} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p style={{ fontWeight: '700', color: '#991b1b', fontSize: '16px', marginBottom: '6px' }}>
                      No Match Found
                    </p>
                    <p style={{ color: '#7f1d1d', fontSize: '13px', lineHeight: '1.7' }}>
                      {verificationResult.uuidFound
                        ? 'Watermark was detected but the UUID did not match any record in the database.'
                        : 'No watermark detected. This image may not have been encrypted with this system.'}
                    </p>
                  </div>
                </div>

                {/* Debug info — shows extracted UUID so you can cross-check */}
                {verificationResult.uuidFound && verificationResult.uuid && (
                  <div style={{
                    marginTop: '16px',
                    padding: '12px 14px',
                    background: '#fff7f7',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#7f1d1d',
                  }}>
                    <span style={{ fontWeight: '600' }}>Extracted UUID: </span>
                    <span style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                      {verificationResult.uuid}
                    </span>
                    <div style={{ marginTop: '6px', color: '#991b1b', fontSize: '11px' }}>
                      ⚠️ This UUID was found in the image but has no matching record. Check that this asset was saved to the vault/backend under the same UUID.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default VerifyPage;