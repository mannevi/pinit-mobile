import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, XCircle, AlertCircle, Image as ImageIcon, Info } from 'lucide-react';
import { vaultAPI } from '../api/client';
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

  // Extract UUID from image (same as analyzer)
  const extractUUID = (imageData) => {
    const data = imageData.data;
    let binaryMessage = '';

    for (let i = 0; i < data.length; i += 4) {
      for (let j = 0; j < 3; j++) {
        binaryMessage += (data[i + j] & 1).toString();
      }
    }

    for (let i = 0; i < binaryMessage.length - 800; i += 8) {
      let text = '';
      for (let j = i; j < i + 5000; j += 8) {
        const byte = binaryMessage.substr(j, 8);
        if (byte.length < 8) break;
        const charCode = parseInt(byte, 2);
        if (charCode >= 32 && charCode <= 126) {
          text += String.fromCharCode(charCode);
        }
      }

      if ((text.includes('IMGCRYPT2|') || text.includes('IMGCRYPT|')) && text.includes('|END')) {
        const isV2 = text.includes('IMGCRYPT2|');
        const startIdx = text.indexOf(isV2 ? 'IMGCRYPT2|' : 'IMGCRYPT|') + (isV2 ? 10 : 9);
        const endIdx = text.indexOf('|END');
        const content = text.substring(startIdx, endIdx);
        const parts = content.split('|');
        
        if (parts.length >= 2) {
          return {
            found: true,
            userId: parts[0] || null,
            deviceId: parts[3] || null,
            timestamp: parts[2] || null
          };
        }
      }
    }

    return { found: false };
  };

  // Try all rotations
  const rotateCanvas = (sourceCanvas, degrees) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (degrees === 90 || degrees === 270) {
      canvas.width = sourceCanvas.height;
      canvas.height = sourceCanvas.width;
    } else {
      canvas.width = sourceCanvas.width;
      canvas.height = sourceCanvas.height;
    }
    
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
    
    return canvas;
  };

  const extractUUIDWithRotation = (sourceCanvas) => {
    const rotations = [0, 90, 180, 270];
    
    for (const degrees of rotations) {
      let canvas = degrees === 0 ? sourceCanvas : rotateCanvas(sourceCanvas, degrees);
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const uuidResult = extractUUID(imageData);
      
      if (uuidResult.found) {
        return {
          ...uuidResult,
          rotation: degrees
        };
      }
    }
    
    return { found: false };
  };

  // SIMPLE DETECTION: Report what actually changed, no smart assumptions
  const detectModifications = (uploadedCanvas, originalAsset, rotation) => {
    const changes = [];
    
    // Get uploaded image dimensions
    let uploadedWidth = uploadedCanvas.width;
    let uploadedHeight = uploadedCanvas.height;
    
    // Parse original dimensions
    const originalRes = originalAsset.assetResolution.split(' x ');
    const originalWidth = parseInt(originalRes[0]);
    const originalHeight = parseInt(originalRes[1]);
    
    // 1. ROTATION - Report if rotated
    if (rotation && rotation !== 0) {
      const userRotation = (360 - rotation) % 360;
      
      if (userRotation === 90) {
        changes.push('Rotated 90° clockwise (right)');
      } else if (userRotation === 180) {
        changes.push('Rotated 180°');
      } else if (userRotation === 270) {
        changes.push('Rotated 270° clockwise (left)');
      }
    }
    
    // 2. RESIZING - Report if dimensions changed significantly
    let checkWidth = uploadedWidth;
    let checkHeight = uploadedHeight;
    
    // Account for rotation when comparing
    if (rotation === 90 || rotation === 270) {
      [checkWidth, checkHeight] = [checkHeight, checkWidth];
    }
    
    const widthDiff = Math.abs(checkWidth - originalWidth);
    const heightDiff = Math.abs(checkHeight - originalHeight);
    
    // Report if changed by more than 5% or 50 pixels
    if ((widthDiff > 50 || heightDiff > 50) || 
        ((widthDiff / originalWidth) > 0.05 || (heightDiff / originalHeight) > 0.05)) {
      
      if (checkWidth < originalWidth) {
        const scalePercent = Math.round((checkWidth / originalWidth) * 100);
        changes.push(`Resized to ${scalePercent}% (${checkWidth} x ${checkHeight})`);
      } else if (checkWidth > originalWidth) {
        const scalePercent = Math.round((checkWidth / originalWidth) * 100);
        changes.push(`Upscaled to ${scalePercent}% (${checkWidth} x ${checkHeight})`);
      }
    }
    
    // 3. CROPPING - Report if aspect ratio changed
    const uploadedAspect = uploadedWidth / uploadedHeight;
    const originalAspect = originalWidth / originalHeight;
    const aspectDiff = Math.abs(uploadedAspect - originalAspect);
    
    // Report if aspect ratio changed by more than 5%
    if (aspectDiff > 0.05) {
      changes.push('Cropped (aspect ratio changed)');
    }
    
    // 4. COMPRESSION - Report if file size changed significantly
    const uploadedSize = selectedFile.size;
    const originalSizeStr = originalAsset.assetFileSize || '';
    const originalSizeKB = parseFloat(originalSizeStr.replace(/[^0-9.]/g, ''));
    const originalSize = originalSizeKB * 1024;
    
    if (originalSize && uploadedSize) {
      const sizeDiffPercent = ((originalSize - uploadedSize) / originalSize) * 100;
      
      // Report if file size changed by more than 5%
      if (Math.abs(sizeDiffPercent) > 5) {
        if (sizeDiffPercent > 0) {
          changes.push(`Compressed (${Math.round(sizeDiffPercent)}% smaller)`);
        } else {
          changes.push(`Re-encoded (${Math.round(Math.abs(sizeDiffPercent))}% larger)`);
        }
      }
    }
    
    // 5. FORMAT CONVERSION - ONLY report if format ACTUALLY changed
    const uploadedType = selectedFile.type;
    const uploadedFormat = uploadedType.split('/')[1]?.toUpperCase();
    
    // Determine original format
    let originalFormat = null;
    if (originalSizeStr.toLowerCase().includes('png')) {
      originalFormat = 'PNG';
    } else if (originalSizeStr.toLowerCase().includes('jpeg') || originalSizeStr.toLowerCase().includes('jpg')) {
      originalFormat = 'JPEG';
    } else if (originalSizeStr.toLowerCase().includes('webp')) {
      originalFormat = 'WEBP';
    } else if (originalSizeStr.toLowerCase().includes('gif')) {
      originalFormat = 'GIF';
    }
    
    // ONLY report if format actually changed
    if (originalFormat && uploadedFormat && uploadedFormat !== originalFormat) {
      changes.push(`Format converted from ${originalFormat} to ${uploadedFormat}`);
    }
    
    // 6. FLIPPING - Would need original image to detect accurately
    // Placeholder for future enhancement
    
    // 7. FILTERS/EFFECTS - Would need original image to compare
    // Placeholder for future enhancement
    
    return changes.length > 0 ? changes : ['No modifications detected'];
  };

  // Calculate similarity between two images
  const calculateSimilarity = (uploadedCanvas, originalAsset) => {
    // This is a simplified similarity check
    // In production, you'd use more sophisticated algorithms
    
    const uploadedCtx = uploadedCanvas.getContext('2d');
    const uploadedData = uploadedCtx.getImageData(0, 0, uploadedCanvas.width, uploadedCanvas.height);
    
    // For now, base similarity on resolution and aspect ratio match
    const uploadedAspect = uploadedCanvas.width / uploadedCanvas.height;
    const originalRes = originalAsset.assetResolution.split(' x ');
    const originalAspect = parseInt(originalRes[0]) / parseInt(originalRes[1]);
    
    const aspectDiff = Math.abs(uploadedAspect - originalAspect);
    let similarity = 100 - (aspectDiff * 100);
    
    // Adjust based on resolution match
    if (uploadedCanvas.width === parseInt(originalRes[0])) {
      similarity = Math.min(100, similarity + 20);
    }
    
    return Math.max(0, Math.min(100, similarity));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setVerificationResult(null);
      
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
      
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const verifyImage = async () => {
    if (!selectedFile) {
      alert('Please select an image first');
      return;
    }

    setVerifying(true);

    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      // Try to extract UUID
      const uuidResult = extractUUIDWithRotation(canvas);

      // Fetch assets from backend API
      // Fetch assets from backend API
      let storedAssets = [];
      try {
        const res = await vaultAPI.list();
        const vault = res.assets || [];
        storedAssets = vault.map(asset => ({
          ...asset,
          assetId:        asset.asset_id      || asset.assetId,
          assetResolution: asset.resolution   || asset.assetResolution || '0 x 0',
          assetFileSize:  asset.file_size     || asset.assetFileSize   || '0 KB',
          uniqueUserId:   asset.user_id       || asset.uniqueUserId    || null,
          userName:       asset.owner_name    || asset.userName        || null,
          userEmail:      asset.owner_email   || asset.userEmail       || null,
          deviceId:       asset.device_id     || asset.deviceId        || null,
          dateEncrypted:  asset.created_at    || asset.dateEncrypted,
          certificateId:  asset.certificate_id|| asset.certificateId   || null,
          fileHash:       asset.file_hash     || asset.fileHash        || null,
          blockchainAnchor: asset.blockchain_anchor || asset.blockchainAnchor || null,
          gpsLocation:    asset.gps_location  || asset.gpsLocation     || null,
        }));
        
        console.log('🔵 Total vault images:', storedAssets.length);
        console.log('🔵 First vault image:', storedAssets[0]);
      } catch (err) {
        console.warn('Could not fetch vault assets:', err.message);
      }
      
      let matchFound = false;
      let matchedAsset = null;
      let confidence = 0;
      let changes = [];
      
      // Generate Asset ID from uploaded image
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const uploadedAssetId = 'AST-' + generateImageHash(imageData);
      
      console.log('🔵 Uploaded Asset ID:', uploadedAssetId);
      console.log('🔵 UUID Result:', uuidResult);
      
      if (uuidResult.found) {
        // Try matching by Asset ID first (most reliable)
        matchedAsset = storedAssets.find(asset => {
          console.log('🔍 Comparing Asset IDs:', asset.assetId, 'vs', uploadedAssetId);
          return asset.assetId === uploadedAssetId;
        });
        
        // Fallback: match by userId
        if (!matchedAsset) {
          console.log('🔍 No Asset ID match, trying userId match...');
          matchedAsset = storedAssets.find(asset => 
            (asset.uniqueUserId && asset.uniqueUserId === uuidResult.userId) ||
            (asset.user_id      && asset.user_id      === uuidResult.userId) ||
            (asset.deviceId     && asset.deviceId     === uuidResult.deviceId)
          );
        }
        
        console.log('🔵 Match found:', matchedAsset);
        
        if (matchedAsset) {
          matchFound = true;
          confidence = calculateSimilarity(canvas, matchedAsset);
          changes = detectModifications(canvas, matchedAsset, uuidResult.rotation || 0);
          if (uuidResult.rotation !== 0) {
            confidence = Math.max(85, confidence - 5);
          }
        }
      } else {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const uploadedHash = generateImageHash(imageData);
        
        for (const asset of storedAssets) {
          const similarity = calculateSimilarity(canvas, asset);
          if (similarity > 70) {
            matchFound = true;
            matchedAsset = asset;
            confidence = similarity;
            changes = detectModifications(canvas, asset, 0);
            changes.push('UUID removed or corrupted');
            break;
          }
        }
      }

      setVerificationResult({
        matchFound,
        asset: matchedAsset,
        confidence: Math.round(confidence),
        changes,
        hasUUID: uuidResult.found,
        rotation: uuidResult.rotation || 0
      });

      setVerifying(false);
    };
    
    img.src = preview;
  };

  return (
    <div className="verify-page">
      <div className="verify-header">
        <div>
          <h1>Verify Image Authenticity</h1>
          <p className="subtitle">Upload any image to check if it matches our encrypted asset database</p>
        </div>
      </div>

      <div className="verify-container">
        {/* Upload Section */}
        <div className="upload-section">
          <div 
            className="upload-area"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            {preview ? (
              <div className="preview-container">
                <img src={preview} alt="Preview" className="preview-image" />
                <div className="preview-overlay">
                  <p>Click to change image</p>
                </div>
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
            {verifying ? 'Verifying...' : 'Verify Image'}
          </button>
        </div>

        {/* Results Section */}
        {verificationResult && (
          <div className="results-section">
            <div className={`result-banner ${verificationResult.matchFound ? 'success' : 'error'}`}>
              <div className="result-icon">
                {verificationResult.matchFound ? (
                  <CheckCircle size={32} />
                ) : (
                  <XCircle size={32} />
                )}
              </div>
              <div>
                <h2>{verificationResult.matchFound ? 'Match Found ✓' : 'No Match Found ✗'}</h2>
                <p>
                  {verificationResult.matchFound
                    ? `Confidence: ${verificationResult.confidence}%`
                    : 'Unknown origin - Image not found in database'
                  }
                </p>
              </div>
            </div>

            {verificationResult.matchFound && verificationResult.asset && (
              <>
                {/* Original Creator Info */}
                <div className="result-card">
                  <h3>Original Creator</h3>
                  <div className="creator-details">
                    <div className="creator-avatar-large">
                      {verificationResult.asset.userName?.charAt(0).toUpperCase() || 
                       verificationResult.asset.uniqueUserId?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <div className="creator-name-large">
                        {verificationResult.asset.userName || 'Unknown User'}
                      </div>
                      <div className="creator-email-large">
                        {verificationResult.asset.userEmail || verificationResult.asset.uniqueUserId}
                      </div>
                      <div className="creator-meta">
                        Created: {new Date(
                          verificationResult.asset.dateEncrypted ||
                          verificationResult.asset.timestamp    ||
                          verificationResult.asset.createdAt    ||
                          Date.now()
                        ).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Confidence Score */}
                <div className="result-card">
                  <h3>Confidence Score</h3>
                  <div className="confidence-meter">
                    <div className="confidence-bar-large">
                      <div 
                        className="confidence-fill-large" 
                        style={{ width: `${verificationResult.confidence}%` }}
                      ></div>
                    </div>
                    <div className="confidence-label">{verificationResult.confidence}%</div>
                  </div>
                  <div className="confidence-description">
                    {verificationResult.confidence >= 90 && 'Very High - Strong match with original'}
                    {verificationResult.confidence >= 70 && verificationResult.confidence < 90 && 'High - Likely the same image'}
                    {verificationResult.confidence >= 50 && verificationResult.confidence < 70 && 'Medium - Possible match with modifications'}
                    {verificationResult.confidence < 50 && 'Low - Significant differences detected'}
                  </div>
                </div>

                {/* Detected Changes */}
                <div className="result-card">
                  <h3>Detected Changes</h3>
                  <ul className="changes-list">
                    {verificationResult.changes.map((change, idx) => (
                      <li key={idx}>
                        <AlertCircle size={16} />
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Asset Details */}
                <div className="result-card">
                  <h3>Original Asset Details</h3>
                  <div className="asset-details-grid">
                    <div className="detail-row">
                      <span className="detail-label">Asset ID:</span>
                      <span className="detail-value">{verificationResult.asset.assetId}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Certificate ID:</span>
                      <span className="detail-value">
                        {verificationResult.asset.certificateId ||
                         verificationResult.asset.authorshipCertificateId || '—'}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Device ID:</span>
                      <span className="detail-value">{verificationResult.asset.deviceId || '—'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Original Resolution:</span>
                      <span className="detail-value">{verificationResult.asset.assetResolution}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Original Size:</span>
                      <span className="detail-value">{verificationResult.asset.assetFileSize || '—'}</span>
                    </div>
                    {verificationResult.asset.fileHash && (
                      <div className="detail-row">
                        <span className="detail-label">SHA-256:</span>
                        <span className="detail-value">
                          {verificationResult.asset.fileHash.substring(0, 20)}…
                        </span>
                      </div>
                    )}
                    {verificationResult.asset.blockchainAnchor && (
                      <div className="detail-row">
                        <span className="detail-label">Blockchain Anchor:</span>
                        <span className="detail-value">
                          {verificationResult.asset.blockchainAnchor.substring(0, 20)}…
                        </span>
                      </div>
                    )}
                    {verificationResult.asset.gpsLocation?.available && (
                      <div className="detail-row">
                        <span className="detail-label">GPS Location:</span>
                        <span className="detail-value">
                          <a 
                            href={verificationResult.asset.gpsLocation.mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="gps-link"
                          >
                            📍 {verificationResult.asset.gpsLocation.coordinates}
                          </a>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {!verificationResult.matchFound && (
              <div className="result-card no-match">
                <Info size={24} />
                <div>
                  <h3>No Match Found</h3>
                  <p>This image does not match any encrypted assets in our database.</p>
                  <p className="hint">
                    Possible reasons:
                  </p>
                  <ul>
                    <li>Image was not encrypted with our system</li>
                    <li>Image has been heavily modified or filtered</li>
                    <li>Original asset not yet stored in database</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default VerifyPage;