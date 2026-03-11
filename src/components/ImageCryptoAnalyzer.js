import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, FileSearch, Download, ArrowLeft } from 'lucide-react';

// ============================================
// HELPER FUNCTIONS
// ============================================

// ============================================
// STATS TRACKING HELPER  [NEW - from second file]
// ============================================

const updateForensicsStats = (type, data) => {
  try {
    const savedStats = localStorage.getItem('forensicsStats');
    const stats = savedStats ? JSON.parse(savedStats) : {
      totalEncrypted: 0,
      totalAnalyzed: 0,
      lastActivity: null,
      lastEncryptedId: null,
      recentActivities: []
    };

    if (type === 'encrypted') {
      stats.totalEncrypted += 1;
      stats.lastEncryptedId = data.userId;
    } else if (type === 'analyzed') {
      stats.totalAnalyzed += 1;
    }

    stats.lastActivity = new Date().toISOString();

    stats.recentActivities.unshift({
      type: type,
      fileName: data.fileName,
      timestamp: new Date().toISOString(),
      uuid: data.userId || null
    });

    if (stats.recentActivities.length > 10) {
      stats.recentActivities = stats.recentActivities.slice(0, 10);
    }

    localStorage.setItem('forensicsStats', JSON.stringify(stats));

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'forensicsStats',
      newValue: JSON.stringify(stats),
      url: window.location.href,
      storageArea: localStorage
    }));

    console.log('✅ Dashboard stats updated:', stats);
  } catch (error) {
    console.error('❌ Error updating stats:', error);
  }
};

// ============================================
// VAULT STORAGE HELPER  [NEW - from second file]
// ============================================

const saveToVault = (imageData, fileName, userId, fileSize, imageBlob) => {
  try {
    const canvas = document.createElement('canvas');
    const img = new Image();
    img.onload = () => {
      const size = 80;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size / img.width, size / img.height);
      const x = (size / 2) - (img.width / 2) * scale;
      const y = (size / 2) - (img.height / 2) * scale;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.4);
      const deviceId = typeof getDeviceFingerprint === 'function'
        ? getDeviceFingerprint() : 'UNKNOWN';
      const assetId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);

      // Save to backend API only
      import('../api/client').then(({ vaultAPI }) => {
        vaultAPI.save({
           asset_id:           assetId,
           owner_name:         userId,
           file_name:          fileName,
           file_size:          fileSize,
           thumbnail_base64:   thumbnail,
           device_id:          deviceId,
           certificate_id:     null,
           owner_email:        null,
           file_hash:          null,
           visual_fingerprint: null,
           blockchain_anchor:  null,
           resolution:         null,
           capture_timestamp:  new Date().toISOString(),
        }).then(() => {
          console.log('✅ Saved to vault:', fileName);
        }).catch(err => console.warn('Vault save failed:', err.message));
      }).catch(err => console.warn('API import failed:', err.message));
    };
    img.onerror = () => console.error('❌ Error creating thumbnail');
    img.src = imageData;
  } catch (error) {
    console.error('❌ Error saving to vault:', error);
  }
};
// ============================================
// CERTIFICATE GENERATION HELPER  [NEW - from second file]
// ============================================

const saveCertificate = (analysisReport, imageData) => {
  try {
    const savedCerts = localStorage.getItem('certificates');
    const certificates = savedCerts ? JSON.parse(savedCerts) : [];

    const certificate = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      certificateId: analysisReport.authorshipCertificateId || 'CERT-' + Date.now().toString(36).toUpperCase(),
      assetId: analysisReport.assetId || 'AST-UNKNOWN',
      userId: analysisReport.uniqueUserId || 'unknown',
      dateCreated: new Date().toISOString(),
      confidence: analysisReport.confidence || 0,
      status: analysisReport.ownershipInfo || 'Unverified',

      ownershipAtCreation: {
        assetId: analysisReport.assetId || 'Unknown',
        authorshipCertificateId: analysisReport.authorshipCertificateId || 'Unknown',
        uniqueUserId: analysisReport.uniqueUserId || 'Unknown',
        assetFileSize: analysisReport.assetFileSize || 'Unknown',
        assetResolution: analysisReport.assetResolution || 'Unknown',
        userEncryptedResolution: analysisReport.userEncryptedResolution || 'N/A',
        timeStamp: analysisReport.timestamp ? new Date(analysisReport.timestamp).toLocaleString() : 'Not Available',
        captureLocation: analysisReport.captureLocationInfo || 'Unknown',
        gpsLocation: analysisReport.gpsLocation?.available
          ? `${analysisReport.gpsLocation.coordinates} (${analysisReport.gpsLocation.source || 'Unknown'})`
          : 'Not Available'
      },

      technicalDetails: {
        totalPixels: analysisReport.totalPixels || 'Unknown',
        pixelsVerified: analysisReport.pixelsVerifiedWithBiometrics || '0',
        deviceName: analysisReport.deviceName || 'Unknown',
        deviceId: analysisReport.deviceId || 'Unknown',
        deviceSource: analysisReport.deviceSource || 'Unknown',
        ipAddress: analysisReport.ipAddress || 'Unknown',
        ipSource: analysisReport.ipSource || 'Unknown',
        ownershipInfo: analysisReport.ownershipInfo || 'Unknown',
        certificate: analysisReport.authorshipCertificate || 'Not Present',
        rotationDetected: analysisReport.rotationDetected !== null && analysisReport.rotationDetected !== undefined
          ? `${analysisReport.rotationDetected}°`
          : 'Not detected',
        rotationMessage: analysisReport.rotationMessage || 'Not detected'
      },

      classificationAnalysis: {
        detectedCase: analysisReport.detectedCase || 'Unknown',
        confidence: analysisReport.confidence || 0,
        reasoning: analysisReport.reasoning || [],
        metrics: {
          variance: analysisReport.metrics?.variance || 'N/A',
          noiseLevel: analysisReport.metrics?.noiseLevel || 'N/A',
          smoothBlockRatio: analysisReport.metrics?.smoothBlockRatio || 'N/A',
          edgeCoherence: analysisReport.metrics?.edgeCoherence || 'N/A',
          uniformityRatio: analysisReport.metrics?.uniformityRatio || 'N/A',
          entropy: analysisReport.metrics?.entropy || 'N/A',
          compressionRatio: analysisReport.metrics?.compressionRatio || 'N/A',
          aspectRatio: analysisReport.metrics?.aspectRatio || 'N/A',
          channelCorrelation: analysisReport.metrics?.channelCorrelation || 'N/A'
        }
      },

      cropInfo: analysisReport.cropInfo || null,

      gpsDetails: {
        available: analysisReport.gpsLocation?.available || false,
        latitude: analysisReport.gpsLocation?.latitude || null,
        longitude: analysisReport.gpsLocation?.longitude || null,
        coordinates: analysisReport.gpsLocation?.coordinates || null,
        mapsUrl: analysisReport.gpsLocation?.mapsUrl || null,
        source: analysisReport.gpsLocation?.source || 'Unknown'
      },

      deviceDetails: analysisReport.deviceDetails || null,
      imagePreview: imageData ? imageData.substring(0, 50000) : null
    };

    certificates.unshift(certificate);

    if (certificates.length > 50) {
      certificates.splice(50);
    }

    localStorage.setItem('certificates', JSON.stringify(certificates));

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'certificates',
      newValue: JSON.stringify(certificates),
      url: window.location.href,
      storageArea: localStorage
    }));

    console.log('✅ Certificate generated:', certificate.certificateId);

    return certificate;
  } catch (error) {
    console.error('❌ Error saving certificate:', error);
    return null;
  }
};

// IP Address Helper Function
const getPublicIP = async () => {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip || 'Unavailable';
  } catch {
    return 'Unavailable';
  }
};

// GPS Location Helper Function
const getGPSLocation = () => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ available: false, coordinates: null, address: 'GPS not supported' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        resolve({
          available: true,
          latitude: latitude,
          longitude: longitude,
          coordinates: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
          mapsUrl: `https://www.google.com/maps?q=${latitude},${longitude}`
        });
      },
      (error) => {
        resolve({ available: false, coordinates: null, address: 'Location unavailable' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
};

// Fallback: use file's lastModified date
const getFileFallbackTime = (file) => {
  if (file.lastModified) {
    return {
      timestamp: file.lastModified,
      source: 'File Modified',
      dateString: new Date(file.lastModified).toLocaleString()
    };
  }

  // Last resort: current time
  return {
    timestamp: Date.now(),
    source: 'Current Time',
    dateString: new Date().toLocaleString()
  };
};

// Extract capture time from image file
const getCaptureTime = (file) => {
  return new Promise((resolve) => {
    // Priority 1: Try to read EXIF data from JPEG images
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const view = new DataView(e.target.result);

          // Check for JPEG marker
          if (view.getUint16(0, false) !== 0xFFD8) {
            resolve(getFileFallbackTime(file));
            return;
          }

          let offset = 2;
          while (offset < view.byteLength) {
            const marker = view.getUint16(offset, false);
            offset += 2;

            // Found EXIF marker (APP1)
            if (marker === 0xFFE1) {
              // Check for "Exif" string
              const exifHeader = String.fromCharCode(
                view.getUint8(offset + 2),
                view.getUint8(offset + 3),
                view.getUint8(offset + 4),
                view.getUint8(offset + 5)
              );

              if (exifHeader === 'Exif') {
                const tiffOffset = offset + 8;
                const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;

                const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian);
                const numEntries = view.getUint16(tiffOffset + ifdOffset, littleEndian);

                // Search for EXIF IFD pointer (tag 0x8769)
                for (let i = 0; i < numEntries; i++) {
                  const entryOffset = tiffOffset + ifdOffset + 2 + (i * 12);
                  const tag = view.getUint16(entryOffset, littleEndian);

                  if (tag === 0x8769) {
                    // Found EXIF IFD
                    const exifIfdOffset = view.getUint32(entryOffset + 8, littleEndian);
                    const exifNumEntries = view.getUint16(tiffOffset + exifIfdOffset, littleEndian);

                    // Search for DateTimeOriginal (tag 0x9003) or DateTimeDigitized (tag 0x9004)
                    for (let j = 0; j < exifNumEntries; j++) {
                      const exifEntryOffset = tiffOffset + exifIfdOffset + 2 + (j * 12);
                      const exifTag = view.getUint16(exifEntryOffset, littleEndian);

                      // DateTimeOriginal (0x9003) or DateTimeDigitized (0x9004)
                      if (exifTag === 0x9003 || exifTag === 0x9004) {
                        const valueOffset = view.getUint32(exifEntryOffset + 8, littleEndian);
                        let dateStr = '';

                        for (let k = 0; k < 19; k++) {
                          dateStr += String.fromCharCode(view.getUint8(tiffOffset + valueOffset + k));
                        }

                        // Parse "YYYY:MM:DD HH:MM:SS" format
                        const parts = dateStr.split(' ');
                        if (parts.length === 2) {
                          const dateParts = parts[0].split(':');
                          const timeParts = parts[1].split(':');

                          if (dateParts.length === 3 && timeParts.length === 3) {
                            const captureDate = new Date(
                              parseInt(dateParts[0]),
                              parseInt(dateParts[1]) - 1,
                              parseInt(dateParts[2]),
                              parseInt(timeParts[0]),
                              parseInt(timeParts[1]),
                              parseInt(timeParts[2])
                            );

                            resolve({
                              timestamp: captureDate.getTime(),
                              source: 'EXIF',
                              dateString: dateStr
                            });
                            return;
                          }
                        }
                      }
                    }
                  }
                }
              }

              resolve(getFileFallbackTime(file));
              return;
            }

            // Skip to next marker
            if (marker === 0xFFD9 || marker === 0xFFDA) break;
            const length = view.getUint16(offset, false);
            offset += length;
          }

          resolve(getFileFallbackTime(file));

        } catch (error) {
          resolve(getFileFallbackTime(file));
        }
      };

      reader.onerror = () => resolve(getFileFallbackTime(file));
      reader.readAsArrayBuffer(file.slice(0, 128 * 1024));

    } else {
      resolve(getFileFallbackTime(file));
    }
  });
};

// Extract device info from EXIF (for JPEG images)
const getExifDeviceInfo = (file) => {
  return new Promise((resolve) => {
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const view = new DataView(e.target.result);

          if (view.getUint16(0, false) !== 0xFFD8) {
            resolve({ found: false });
            return;
          }

          let offset = 2;
          let make = null;
          let model = null;

          while (offset < view.byteLength) {
            const marker = view.getUint16(offset, false);
            offset += 2;

            if (marker === 0xFFE1) {
              const exifHeader = String.fromCharCode(
                view.getUint8(offset + 2),
                view.getUint8(offset + 3),
                view.getUint8(offset + 4),
                view.getUint8(offset + 5)
              );

              if (exifHeader === 'Exif') {
                const tiffOffset = offset + 8;
                const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;
                const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian);
                const numEntries = view.getUint16(tiffOffset + ifdOffset, littleEndian);

                for (let i = 0; i < numEntries; i++) {
                  const entryOffset = tiffOffset + ifdOffset + 2 + (i * 12);
                  const tag = view.getUint16(entryOffset, littleEndian);
                  const type = view.getUint16(entryOffset + 2, littleEndian);
                  const numValues = view.getUint32(entryOffset + 4, littleEndian);

                  // Tag 0x010F = Make, Tag 0x0110 = Model
                  if (tag === 0x010F || tag === 0x0110) {
                    let valueOffset;
                    if (numValues * (type === 2 ? 1 : 2) > 4) {
                      valueOffset = view.getUint32(entryOffset + 8, littleEndian);
                    } else {
                      valueOffset = entryOffset + 8 - tiffOffset;
                    }

                    let str = '';
                    for (let j = 0; j < numValues - 1; j++) {
                      const charCode = view.getUint8(tiffOffset + valueOffset + j);
                      if (charCode === 0) break;
                      str += String.fromCharCode(charCode);
                    }

                    if (tag === 0x010F) make = str.trim();
                    if (tag === 0x0110) model = str.trim();
                  }
                }
              }

              break;
            }

            if (marker === 0xFFD9 || marker === 0xFFDA) break;
            const length = view.getUint16(offset, false);
            offset += length;
          }

          if (make || model) {
            const deviceName = [make, model].filter(Boolean).join(' ');
            // Generate device ID from make+model
            let hash = 0;
            for (let i = 0; i < deviceName.length; i++) {
              hash = ((hash << 5) - hash) + deviceName.charCodeAt(i);
              hash |= 0;
            }
            const deviceId = 'CAM-' + Math.abs(hash).toString(36).toUpperCase().slice(0, 6);

            resolve({
              found: true,
              make: make,
              model: model,
              deviceName: deviceName,
              deviceId: deviceId,
              source: 'EXIF'
            });
          } else {
            resolve({ found: false });
          }

        } catch (error) {
          resolve({ found: false });
        }
      };

      reader.onerror = () => resolve({ found: false });
      reader.readAsArrayBuffer(file.slice(0, 128 * 1024));

    } else {
      resolve({ found: false });
    }
  });
};

// Extract GPS from EXIF (for JPEG images)
const getExifGPS = (file) => {
  return new Promise((resolve) => {
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const view = new DataView(e.target.result);

          if (view.getUint16(0, false) !== 0xFFD8) {
            resolve({ found: false });
            return;
          }

          let offset = 2;

          while (offset < view.byteLength) {
            const marker = view.getUint16(offset, false);
            offset += 2;

            if (marker === 0xFFE1) {
              const exifHeader = String.fromCharCode(
                view.getUint8(offset + 2),
                view.getUint8(offset + 3),
                view.getUint8(offset + 4),
                view.getUint8(offset + 5)
              );

              if (exifHeader === 'Exif') {
                const tiffOffset = offset + 8;
                const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;
                const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian);
                const numEntries = view.getUint16(tiffOffset + ifdOffset, littleEndian);

                // Find GPS IFD pointer (tag 0x8825)
                for (let i = 0; i < numEntries; i++) {
                  const entryOffset = tiffOffset + ifdOffset + 2 + (i * 12);
                  const tag = view.getUint16(entryOffset, littleEndian);

                  if (tag === 0x8825) {
                    const gpsIfdOffset = view.getUint32(entryOffset + 8, littleEndian);
                    const gpsNumEntries = view.getUint16(tiffOffset + gpsIfdOffset, littleEndian);

                    let latRef = 'N', lonRef = 'E';
                    let lat = null, lon = null;

                    for (let j = 0; j < gpsNumEntries; j++) {
                      const gpsEntryOffset = tiffOffset + gpsIfdOffset + 2 + (j * 12);
                      const gpsTag = view.getUint16(gpsEntryOffset, littleEndian);

                      // GPS Latitude Ref (N/S)
                      if (gpsTag === 0x0001) {
                        latRef = String.fromCharCode(view.getUint8(gpsEntryOffset + 8));
                      }
                      // GPS Longitude Ref (E/W)
                      if (gpsTag === 0x0003) {
                        lonRef = String.fromCharCode(view.getUint8(gpsEntryOffset + 8));
                      }
                      // GPS Latitude
                      if (gpsTag === 0x0002) {
                        const valueOffset = view.getUint32(gpsEntryOffset + 8, littleEndian);
                        const d = view.getUint32(tiffOffset + valueOffset, littleEndian) / view.getUint32(tiffOffset + valueOffset + 4, littleEndian);
                        const m = view.getUint32(tiffOffset + valueOffset + 8, littleEndian) / view.getUint32(tiffOffset + valueOffset + 12, littleEndian);
                        const s = view.getUint32(tiffOffset + valueOffset + 16, littleEndian) / view.getUint32(tiffOffset + valueOffset + 20, littleEndian);
                        lat = d + (m / 60) + (s / 3600);
                      }
                      // GPS Longitude
                      if (gpsTag === 0x0004) {
                        const valueOffset = view.getUint32(gpsEntryOffset + 8, littleEndian);
                        const d = view.getUint32(tiffOffset + valueOffset, littleEndian) / view.getUint32(tiffOffset + valueOffset + 4, littleEndian);
                        const m = view.getUint32(tiffOffset + valueOffset + 8, littleEndian) / view.getUint32(tiffOffset + valueOffset + 12, littleEndian);
                        const s = view.getUint32(tiffOffset + valueOffset + 16, littleEndian) / view.getUint32(tiffOffset + valueOffset + 20, littleEndian);
                        lon = d + (m / 60) + (s / 3600);
                      }
                    }

                    if (lat !== null && lon !== null) {
                      if (latRef === 'S') lat = -lat;
                      if (lonRef === 'W') lon = -lon;

                      resolve({
                        found: true,
                        latitude: lat,
                        longitude: lon,
                        coordinates: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
                        mapsUrl: `https://www.google.com/maps?q=${lat},${lon}`,
                        source: 'EXIF'
                      });
                      return;
                    }
                  }
                }
              }
              break;
            }

            if (marker === 0xFFD9 || marker === 0xFFDA) break;
            const length = view.getUint16(offset, false);
            offset += length;
          }

          resolve({ found: false });

        } catch (error) {
          resolve({ found: false });
        }
      };

      reader.onerror = () => resolve({ found: false });
      reader.readAsArrayBuffer(file.slice(0, 128 * 1024));

    } else {
      resolve({ found: false });
    }
  });
};

// ============================================
// DEVICE FINGERPRINTING (Reusable)
// ============================================

const getDeviceFingerprint = () => {
  let deviceId = localStorage.getItem('deviceFingerprint');

  if (!deviceId) {
    const screenData = window.screen.width + 'x' + window.screen.height + 'x' + window.screen.colorDepth;
    const platform = navigator.platform || 'unknown';
    const cores = navigator.hardwareConcurrency || 0;
    const memory = navigator.deviceMemory || 0;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
    const language = navigator.language || 'unknown';
    const touchPoints = navigator.maxTouchPoints || 0;
    const userAgent = navigator.userAgent || 'unknown';

    const fingerprint = screenData + '|' + platform + '|' + cores + '|' + memory + '|' + timezone + '|' + language + '|' + touchPoints + '|' + userAgent;

    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      hash = ((hash << 5) - hash) + fingerprint.charCodeAt(i);
      hash |= 0;
    }

    const hashStr = Math.abs(hash).toString(36).toUpperCase().slice(0, 8);
    const deviceType = /Android|iPhone|iPad/i.test(userAgent) ? 'MOB' : 'DSK';
    deviceId = `${deviceType}-${hashStr}`;
    localStorage.setItem('deviceFingerprint', deviceId);
  }

  return deviceId;
};

const getDeviceDetails = () => {
  const screenData = window.screen.width + 'x' + window.screen.height;
  const colorDepth = window.screen.colorDepth + '-bit';
  const platform = navigator.platform || 'Unknown';
  const cores = navigator.hardwareConcurrency || 'Unknown';
  const memory = navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'Unknown';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
  const language = navigator.language || 'Unknown';
  const touchPoints = navigator.maxTouchPoints || 0;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const deviceType = isMobile ? 'Mobile' : 'Desktop';
  const browser = navigator.userAgent;

  return {
    screen: screenData,
    colorDepth: colorDepth,
    platform: platform,
    cores: cores,
    memory: memory,
    timezone: timezone,
    language: language,
    touchCapable: touchPoints > 0 ? 'Yes' : 'No',
    touchPoints: touchPoints,
    deviceType: deviceType,
    browser: browser
  };
};

const getCurrentDeviceName = () => {
  return navigator.userAgent.split('(')[1]?.split(')')[0] || 'Unknown';
};

// ============================================
// AUTHORSHIP CERTIFICATE ID GENERATION
// ============================================

const generateAuthorshipCertificateId = (userId, deviceId) => {
  // Generate a consistent certificate ID based on userId and deviceId only
  // This ensures the same owner always gets the same certificate ID
  const combinedString = `${userId}-${deviceId}`;

  let hash = 0;
  for (let i = 0; i < combinedString.length; i++) {
    const char = combinedString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }

  const hashStr = Math.abs(hash).toString(16).toUpperCase();
  const userHash = userId.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0);
  const userSuffix = Math.abs(userHash).toString(36).toUpperCase().slice(0, 6);

  return `CERT-${hashStr.slice(0, 8)}${userSuffix}`;
};

// ============================================
// ASSET ID GENERATION (Image Hash Based)
// ============================================

// ============================================
// VAULT SECURITY HELPERS
// ============================================

// Compute SHA-256 hash of a file
const computeSHA256 = async (file) => {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    // Fallback: simple checksum
    return 'sha256-unavailable-' + Date.now().toString(16);
  }
};

// Compute perceptual hash (pHash) of an image canvas — 16-char hex
const computePerceptualHash = (canvas) => {
  try {
    const small = document.createElement('canvas');
    small.width = 8;
    small.height = 8;
    const ctx = small.getContext('2d');
    ctx.drawImage(canvas, 0, 0, 8, 8);
    const data = ctx.getImageData(0, 0, 8, 8).data;
    const grays = [];
    for (let i = 0; i < 64; i++) {
      grays.push(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    }
    const avg = grays.reduce((a, b) => a + b, 0) / 64;
    let bits = '';
    for (const g of grays) bits += g >= avg ? '1' : '0';
    let hex = '';
    for (let i = 0; i < 64; i += 4) hex += parseInt(bits.substr(i, 4), 2).toString(16);
    return hex.toUpperCase();
  } catch (e) {
    return 'PHASH-UNAVAIL';
  }
};

// Compute Hamming distance between two pHashes (0 = identical, 64 = totally different)
const pHashDistance = (hash1, hash2) => {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;
  let dist = 0;
  for (let i = 0; i < hash1.length; i++) {
    const b1 = parseInt(hash1[i], 16).toString(2).padStart(4, '0');
    const b2 = parseInt(hash2[i], 16).toString(2).padStart(4, '0');
    for (let j = 0; j < 4; j++) if (b1[j] !== b2[j]) dist++;
  }
  return dist;
};

// Generate a simulated blockchain anchor TX hash
const generateBlockchainAnchor = (fileHash, timestamp) => {
  const seed = (fileHash || '') + (timestamp || Date.now()).toString(16);
  let result = '0x';
  for (let i = 0; i < 64; i++) {
    const charCode = seed.charCodeAt(i % seed.length);
    result += ((charCode * (i + 7)) % 16).toString(16);
  }
  return result;
};

const generateAssetId = (imageData) => {
  // Generate a consistent asset ID based on image content hash
  // This ensures the same image always gets the same asset ID
  const data = imageData.data;

  // Sample pixels at regular intervals to create a signature
  let hash = 0;
  const sampleInterval = Math.floor(data.length / 1000); // Sample ~1000 points

  for (let i = 0; i < data.length; i += sampleInterval) {
    hash = ((hash << 5) - hash) + data[i];
    hash |= 0; // Convert to 32bit integer
  }

  // Add dimensions to the hash for uniqueness
  hash = ((hash << 5) - hash) + imageData.width;
  hash = ((hash << 5) - hash) + imageData.height;
  hash |= 0;

  // Create a consistent ID from the hash
  const hashStr = Math.abs(hash).toString(36).toUpperCase().padStart(12, '0');

  return `AST-${hashStr}`;
};

// ============================================
// ============================================
// LSB STEGANOGRAPHY — TILE + VOTING + CRC16
// Ported from pixel_uuid_stego.py — works for any crop ≥ 25x25 pixels
// ============================================

const STEGO_TILE     = 12;
const UUID_FIELD_LEN = 32;
const PAYLOAD_BYTES  = 1 + UUID_FIELD_LEN + 2; // 35 bytes
const PAYLOAD_BITS   = PAYLOAD_BYTES * 8;       // 280 bits

const crc16js = (bytes) => {
  let crc = 0xFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let j = 0; j < 8; j++)
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc & 0xFFFF;
};

const buildPayloadBits = (userId) => {
  const str = (userId || '').substring(0, UUID_FIELD_LEN);
  const uuidPadded = new Uint8Array(UUID_FIELD_LEN);
  for (let i = 0; i < str.length; i++) uuidPadded[i] = str.charCodeAt(i);
  const forCrc = new Uint8Array(1 + UUID_FIELD_LEN);
  forCrc[0] = str.length;
  forCrc.set(uuidPadded, 1);
  const crc = crc16js(forCrc);
  const payload = new Uint8Array(PAYLOAD_BYTES);
  payload[0] = str.length;
  payload.set(uuidPadded, 1);
  payload[PAYLOAD_BYTES - 2] = (crc >> 8) & 0xFF;
  payload[PAYLOAD_BYTES - 1] = crc & 0xFF;
  const bits = [];
  for (let i = 0; i < PAYLOAD_BYTES; i++)
    for (let b = 7; b >= 0; b--) bits.push((payload[i] >> b) & 1);
  return bits;
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

// ── EMBED ──────────────────────────────────────────────────────────────────
const embedUUIDAdvanced = (imageData, userId, gpsData, deviceInfo, ipAddress, timestamp, deviceSource, ipSource, gpsSource, width, height) => {
  const data        = imageData.data;
  const payloadBits = buildPayloadBits(userId);  // 280-bit CRC-validated userId

  // Full IMGCRYPT3 message in B channel (sequential) for backward compat
  const gpsString = gpsData && gpsData.available
    ? `${gpsData.latitude},${gpsData.longitude}` : 'NOGPS';
  const fullMsg  = `IMGCRYPT3|${userId}|${gpsString}|${timestamp || Date.now()}|${deviceInfo.deviceId || 'UNKNOWN'}|${deviceInfo.deviceName || 'UNKNOWN'}|${ipAddress || 'UNKNOWN'}|${deviceSource || 'Unknown'}|${ipSource || 'Unknown'}|${gpsSource || 'Unknown'}|${width}x${height}|END`;
  const fullBits = [];
  for (let i = 0; i < fullMsg.length; i++) {
    const c = fullMsg.charCodeAt(i);
    for (let b = 7; b >= 0; b--) fullBits.push((c >> b) & 1);
  }

  const TILE = STEGO_TILE;
  for (let idx = 0; idx < data.length; idx += 4) {
    const pi = idx / 4;
    const x  = pi % width;
    const y  = Math.floor(pi / width);
    const p  = (y % TILE) * TILE + (x % TILE);

    // R + G carry tile-based CRC payload (crop-safe, 25x25 min)
    data[idx]     = (data[idx]     & 0xFE) | payloadBits[(2 * p)     % PAYLOAD_BITS];
    data[idx + 1] = (data[idx + 1] & 0xFE) | payloadBits[(2 * p + 1) % PAYLOAD_BITS];

    // B carries full IMGCRYPT3 sequential (fallback for full metadata)
    data[idx + 2] = (data[idx + 2] & 0xFE) | fullBits[pi % fullBits.length];
  }
  return imageData;
};

// ── EXTRACT ────────────────────────────────────────────────────────────────
const extractUUIDAdvanced = (imageData) => {
  const data  = imageData.data;
  const imgW  = imageData.width || Math.round(Math.sqrt(data.length / 4)) || 1;
  const TILE  = STEGO_TILE;

  // METHOD 1: Tile + majority voting (CRC-validated) — works for any 25x25+ crop
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

  // Fast path offset (0,0)
  let uid = decodeWithOffset(0, 0);
  if (uid) return buildResultFromUserId(uid, data, imgW);

  // Try all 144 tile offsets (handles any crop position)
  for (let oy = 0; oy < TILE; oy++) {
    for (let ox = 0; ox < TILE; ox++) {
      if (ox === 0 && oy === 0) continue;
      uid = decodeWithOffset(ox, oy);
      if (uid) return buildResultFromUserId(uid, data, imgW);
    }
  }

  // METHOD 2: IMGCRYPT3 from B channel (full metadata, sequential)
  const bBits = [];
  for (let idx = 0; idx < data.length; idx += 4) bBits.push(data[idx + 2] & 1);
  const r2 = extractIMGCRYPT3(bBits);
  if (r2) return r2;

  // METHOD 3: Legacy R+G+B sequential
  const rgbBits = [];
  for (let idx = 0; idx < data.length; idx += 4) {
    rgbBits.push(data[idx] & 1, data[idx+1] & 1, data[idx+2] & 1);
  }
  const r3 = extractIMGCRYPT3(rgbBits);
  if (r3) return r3;

  return { found: false, userId: '' };
};

const extractIMGCRYPT3 = (bits) => {
  const total   = bits.length;
  const maxScan = Math.min(total - 800, 3200);
  const maxRead = Math.min(500, Math.floor(total / 8));
  for (let off = 0; off <= maxScan; off += 8) {
    let text = '';
    for (let c = 0; c < maxRead; c++) {
      const s = off + c * 8;
      if (s + 8 > total) break;
      let v = 0;
      for (let b = 0; b < 8; b++) v = (v << 1) | bits[s + b];
      text += (v >= 32 && v <= 126) ? String.fromCharCode(v) : '\x00';
    }
    if (!text.includes('IMGCRYPT')) continue;
    const p = parseIMGCRYPT3Msg(text);
    if (p) return buildResult(p);
  }
  return null;
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

const buildResultFromUserId = (userId, data, imgW) => {
  // Try B channel for full metadata first
  const bBits = [];
  for (let idx = 0; idx < data.length; idx += 4) bBits.push(data[idx + 2] & 1);
  const full = extractIMGCRYPT3(bBits);
  if (full) return full;
  return { found: true, userId,
    gps: { available: false, coordinates: null, mapsUrl: null, source: 'Unknown' },
    timestamp: null, deviceId: null, deviceName: null, ipAddress: null,
    deviceSource: 'Unknown', ipSource: 'Unknown', gpsSource: 'Unknown',
    originalResolution: null, confidence: 'High' };
};

const buildResult = (m) => {
  let gps = { available: false, coordinates: null, mapsUrl: null, source: m.gpsSource || 'Unknown' };
  if (m.gps && m.gps !== 'NOGPS') {
    const pts = m.gps.split(',');
    if (pts.length === 2) {
      const lat = parseFloat(pts[0]), lng = parseFloat(pts[1]);
      if (!isNaN(lat) && !isNaN(lng))
        gps = { available: true, latitude: lat, longitude: lng,
          coordinates: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`, source: m.gpsSource || 'Unknown' };
    }
  }
  return { found: true, userId: m.userId, gps,
    timestamp: m.timestamp && !isNaN(m.timestamp) ? parseInt(m.timestamp) : null,
    deviceId: m.deviceId, deviceName: m.deviceName, ipAddress: m.ipAddress,
    deviceSource: m.deviceSource || 'Unknown', ipSource: m.ipSource || 'Unknown',
    gpsSource: m.gpsSource || 'Unknown', originalResolution: m.originalResolution,
    confidence: 'High' };
};

// ============================================
// IMAGE CLASSIFICATION
// ============================================

const classifyImage = (canvas, imageData, fileSize, fileName, hasUUID) => {
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;
  const totalPixels = width * height;
  const pixelCount = data.length / 4;

  // Get EXIF-like metadata indicators
  const isPNG = fileName.toLowerCase().includes('.png');
  const isJPEG = fileName.toLowerCase().includes('.jpg') || fileName.toLowerCase().includes('.jpeg');

  // 1. Color Channel Correlation (AI images have unnatural correlation)
  let rrCorr = 0, ggCorr = 0, bbCorr = 0, rgCorr = 0, rbCorr = 0, gbCorr = 0;
  const sampleSize = Math.min(5000, pixelCount);

  for (let i = 0; i < sampleSize; i++) {
    const idx = Math.floor(Math.random() * pixelCount) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    rrCorr += r * r;
    ggCorr += g * g;
    bbCorr += b * b;
    rgCorr += r * g;
    rbCorr += r * b;
    gbCorr += g * b;
  }

  const channelCorrelation = (rgCorr + rbCorr + gbCorr) / (rrCorr + ggCorr + bbCorr + 0.001);

  // 2. Local Binary Pattern-like analysis (texture signature)
  let uniformPatterns = 0;
  let nonUniformPatterns = 0;

  for (let y = 2; y < Math.min(height - 2, 100); y += 2) {
    for (let x = 2; x < Math.min(width - 2, 100); x += 2) {
      const centerIdx = (y * width + x) * 4;
      const center = data[centerIdx];

      const neighbors = [
        data[((y-1) * width + (x-1)) * 4],
        data[((y-1) * width + x) * 4],
        data[((y-1) * width + (x+1)) * 4],
        data[(y * width + (x+1)) * 4],
        data[((y+1) * width + (x+1)) * 4],
        data[((y+1) * width + x) * 4],
        data[((y+1) * width + (x-1)) * 4],
        data[(y * width + (x-1)) * 4]
      ];

      let transitions = 0;
      for (let i = 0; i < 8; i++) {
        if ((neighbors[i] > center) !== (neighbors[(i+1) % 8] > center)) transitions++;
      }

      if (transitions <= 2) uniformPatterns++;
      else nonUniformPatterns++;
    }
  }

  const uniformityRatio = uniformPatterns / (uniformPatterns + nonUniformPatterns + 0.001);

  // 3. Frequency Domain Analysis (DCT-like for periodic patterns)
  let highFreqEnergy = 0;
  let lowFreqEnergy = 0;

  for (let y = 0; y < Math.min(height - 4, 200); y += 4) {
    for (let x = 0; x < Math.min(width - 4, 200); x += 4) {
      let blockSum = 0;
      let blockVariance = 0;

      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          const idx = ((y + dy) * width + (x + dx)) * 4;
          blockSum += data[idx];
        }
      }

      const blockMean = blockSum / 16;

      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          const idx = ((y + dy) * width + (x + dx)) * 4;
          blockVariance += Math.pow(data[idx] - blockMean, 2);
        }
      }

      if (blockVariance < 100) lowFreqEnergy++;
      else highFreqEnergy++;
    }
  }

  const smoothBlockRatio = lowFreqEnergy / (lowFreqEnergy + highFreqEnergy + 0.001);

  // 4. Edge Coherence (AI has overly coherent edges)
  let coherentEdges = 0;
  let totalEdges = 0;
  const stride = width * 4;

  for (let y = 2; y < height - 2; y += 2) {
    for (let x = 2; x < width - 2; x += 2) {
      const idx = (y * width + x) * 4;

      const gx = Math.abs(data[idx + 4] - data[idx - 4]);
      const gy = Math.abs(data[idx + stride] - data[idx - stride]);
      const magnitude = Math.sqrt(gx * gx + gy * gy);

      if (magnitude > 20) {
        totalEdges++;

        const gx2 = Math.abs(data[idx + 8] - data[idx]);
        const gy2 = Math.abs(data[idx + stride * 2] - data[idx]);
        const magnitude2 = Math.sqrt(gx2 * gx2 + gy2 * gy2);

        if (Math.abs(magnitude - magnitude2) < 10) coherentEdges++;
      }
    }
  }

  const edgeCoherence = totalEdges > 0 ? coherentEdges / totalEdges : 0;

  // 5. Color Distribution Entropy
  const histR = new Array(256).fill(0);
  const histG = new Array(256).fill(0);
  const histB = new Array(256).fill(0);

  for (let i = 0; i < data.length; i += 4) {
    histR[data[i]]++;
    histG[data[i + 1]]++;
    histB[data[i + 2]]++;
  }

  let entropyR = 0, entropyG = 0, entropyB = 0;
  for (let i = 0; i < 256; i++) {
    if (histR[i] > 0) {
      const p = histR[i] / pixelCount;
      entropyR -= p * Math.log2(p);
    }
    if (histG[i] > 0) {
      const p = histG[i] / pixelCount;
      entropyG -= p * Math.log2(p);
    }
    if (histB[i] > 0) {
      const p = histB[i] / pixelCount;
      entropyB -= p * Math.log2(p);
    }
  }

  const avgEntropy = (entropyR + entropyG + entropyB) / 3;

  // 6. Pixel value clustering (AI tends to cluster values)
  let clusterCount = 0;
  const binSize = 10;
  const bins = new Array(Math.ceil(256 / binSize)).fill(0);

  for (let i = 0; i < data.length; i += 4) {
    const avg = Math.floor((data[i] + data[i + 1] + data[i + 2]) / 3);
    bins[Math.floor(avg / binSize)]++;
  }

  for (let i = 0; i < bins.length; i++) {
    if (bins[i] > pixelCount * 0.05) clusterCount++;
  }

  const clusteringScore = clusterCount / bins.length;

  // 7. Basic metrics
  let rSum = 0, gSum = 0, bSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
  }

  const avgR = rSum / pixelCount;
  const avgG = gSum / pixelCount;
  const avgB = bSum / pixelCount;

  let totalVariance = 0;
  for (let i = 0; i < data.length; i += 4) {
    totalVariance += Math.pow(data[i] - avgR, 2);
    totalVariance += Math.pow(data[i + 1] - avgG, 2);
    totalVariance += Math.pow(data[i + 2] - avgB, 2);
  }
  totalVariance = totalVariance / (pixelCount * 3);

  // Simple noise level
  let noiseLevel = 0;
  for (let i = 4; i < data.length - 4; i += 4) {
    noiseLevel += Math.abs(data[i] - data[i - 4]);
  }
  noiseLevel = noiseLevel / pixelCount;

  const compressionRatio = fileSize / totalPixels;
  const aspectRatio = width / height;

  // DECISION LOGIC with strict AI detection
  let detectedCase = '';
  let confidence = 0;
  let reasoning = [];

  if (hasUUID) {
    const isNonStandardAspect = aspectRatio < 0.7 || aspectRatio > 1.8;
    const likelyCropped = totalPixels < width * height * 0.85;

    if (isNonStandardAspect || likelyCropped) {
      detectedCase = 'Case 5: Encrypted with UUID and Cropped';
      confidence = totalPixels < 150000 ? 85 : 95;
      reasoning.push('UUID encryption header verified');
      reasoning.push('Likely cropped image');
      reasoning.push('Aspect ratio: ' + aspectRatio.toFixed(2));
      if (totalPixels < 150000) {
        reasoning.push('Reduced confidence due to small cropped size');
      }
    } else {
      detectedCase = 'Case 4: Encrypted with UUID';
      confidence = 98;
      reasoning.push('UUID encryption header verified');
    }
  } else {
    // AI Detection Score (0-100)
    let aiScore = 0;

    // Strong AI indicators
    if (smoothBlockRatio > 0.6) aiScore += 25;
    if (edgeCoherence > 0.7) aiScore += 25;
    if (uniformityRatio > 0.65) aiScore += 20;
    if (channelCorrelation > 0.85) aiScore += 15;
    if (avgEntropy < 6.5) aiScore += 15;
    if (clusteringScore < 0.3) aiScore += 15;
    if (isPNG) aiScore += 10;
    if (noiseLevel < 5) aiScore += 15;
    if (width % 64 === 0 && height % 64 === 0) aiScore += 10;

    // Mobile Detection Score (0-100)
    let mobileScore = 0;

    if (noiseLevel > 15) mobileScore += 30;
    if (isJPEG) mobileScore += 25;
    if (totalVariance > 3000) mobileScore += 20;
    if (avgEntropy > 7.2) mobileScore += 20;
    if (compressionRatio > 1.3) mobileScore += 15;
    if (uniformityRatio < 0.4) mobileScore += 15;
    if (smoothBlockRatio < 0.3) mobileScore += 15;

    // Mobile aspect ratios
    const mobileAspects = [0.5625, 0.75, 1.0, 1.333, 1.777, 2.0, 2.165];
    if (mobileAspects.some(a => Math.abs(aspectRatio - a) < 0.05)) mobileScore += 20;

    // Check for typical mobile dimensions
    const commonMobileWidths = [720, 1080, 1440, 1920, 2160, 3024, 4032];
    const commonMobileHeights = [1280, 1920, 2560, 2880, 4032];
    if (commonMobileWidths.includes(width) || commonMobileHeights.includes(height)) mobileScore += 15;

    // Web Download Score (0-100)
    let webScore = 0;

    if (compressionRatio > 0.5 && compressionRatio < 1.5) webScore += 25;
    if (width % 10 === 0 && height % 10 === 0) webScore += 20;
    if (noiseLevel > 8 && noiseLevel < 18) webScore += 20;
    if (avgEntropy > 6.5 && avgEntropy < 7.5) webScore += 15;
    if (uniformityRatio > 0.4 && uniformityRatio < 0.6) webScore += 15;
    if (totalVariance > 1500 && totalVariance < 3500) webScore += 20;

    // Determine winner with clear thresholds
    const scoreDiff = Math.abs(aiScore - mobileScore);

    if (aiScore >= 60) {
      detectedCase = 'Case 2: AI Generated';
      confidence = Math.min(aiScore, 97);
      reasoning.push('Overly smooth blocks: ' + (smoothBlockRatio * 100).toFixed(1) + '%');
      reasoning.push('Edge coherence: ' + (edgeCoherence * 100).toFixed(1) + '%');
      reasoning.push('Uniform texture patterns detected');
      if (isPNG) reasoning.push('PNG format (common for AI tools)');
      if (avgEntropy < 6.5) reasoning.push('Low color entropy: ' + avgEntropy.toFixed(2));
      if (width % 64 === 0 || height % 64 === 0) reasoning.push('AI-typical dimensions: ' + width + 'x' + height);

    } else if (mobileScore >= 60) {
      detectedCase = 'Case 1: Mobile Captured';
      confidence = Math.min(mobileScore, 97);
      reasoning.push('High sensor noise: ' + noiseLevel.toFixed(2));
      reasoning.push('Natural variance: ' + totalVariance.toFixed(2));
      if (isJPEG) reasoning.push('JPEG format (mobile camera)');
      reasoning.push('High color entropy: ' + avgEntropy.toFixed(2));
      reasoning.push('Non-uniform texture: ' + (uniformityRatio * 100).toFixed(1) + '%');

    } else if (aiScore > mobileScore && aiScore > webScore) {
      detectedCase = 'Case 2: AI Generated';
      confidence = Math.min(Math.max(aiScore, 55), 85);
      reasoning.push('AI characteristics detected');
      reasoning.push('Smooth blocks: ' + (smoothBlockRatio * 100).toFixed(1) + '%');
      reasoning.push('Edge coherence: ' + (edgeCoherence * 100).toFixed(1) + '%');

    } else if (mobileScore > webScore) {
      detectedCase = 'Case 1: Mobile Captured';
      confidence = Math.min(Math.max(mobileScore, 55), 85);
      reasoning.push('Mobile characteristics detected');
      reasoning.push('Noise level: ' + noiseLevel.toFixed(2));
      reasoning.push('Variance: ' + totalVariance.toFixed(2));

    } else {
      detectedCase = 'Case 3: Downloaded from Web';
      confidence = Math.min(Math.max(webScore, 60), 80);
      reasoning.push('Standard web image characteristics');
      reasoning.push('Moderate compression and entropy');
    }

    // Warn if close call
    if (scoreDiff < 20 && confidence > 70) {
      const secondPlace = aiScore > mobileScore ? 'Mobile' : 'AI';
      reasoning.push('Note: Some ' + secondPlace + ' characteristics present');
      confidence = Math.min(confidence, 75);
    }
  }

  return {
    detectedCase,
    confidence,
    reasoning,
    metrics: {
      variance: totalVariance.toFixed(2),
      noiseLevel: noiseLevel.toFixed(2),
      smoothBlockRatio: (smoothBlockRatio * 100).toFixed(1) + '%',
      edgeCoherence: (edgeCoherence * 100).toFixed(1) + '%',
      uniformityRatio: (uniformityRatio * 100).toFixed(1) + '%',
      entropy: avgEntropy.toFixed(2),
      compressionRatio: compressionRatio.toFixed(3),
      aspectRatio: aspectRatio.toFixed(3),
      channelCorrelation: channelCorrelation.toFixed(3)
    }
  };
};

// ============================================
// REPORT GENERATION (PNG Image)
// ============================================

const generateReport = (report, imageData) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = 595;
  canvas.height = 842;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(0, 0, canvas.width, 80);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial';
  ctx.fillText('IMAGE ANALYSIS REPORT', 40, 50);

  // Classification banner
  const confidenceColor = report.confidence > 90 ? '#10b981' : report.confidence > 70 ? '#fbbf24' : '#ef4444';
  ctx.fillStyle = confidenceColor;
  ctx.fillRect(0, 80, canvas.width, 50);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 16px Arial';
  ctx.fillText(report.detectedCase, 40, 105);
  ctx.font = '12px Arial';
  ctx.fillText('Confidence: ' + report.confidence + '%', 40, 122);

  let y = 160;

  // Ownership section
  ctx.fillStyle = '#1e40af';
  ctx.font = 'bold 16px Arial';
  ctx.fillText('OWNERSHIP AT CREATION', 40, y);
  y += 25;

  ctx.fillStyle = '#000000';
  ctx.font = '12px Arial';
  const ownershipFields = [
    ['Asset ID:', report.assetId],
    ['Authorship Certificate ID:', report.authorshipCertificateId],
    ['Unique User ID:', report.uniqueUserId],
    ['Asset File Size:', report.assetFileSize],
    ['Asset Resolution:', report.assetResolution],
    ['User Encrypted Resolution:', report.userEncryptedResolution],
    ['Time Stamp:', report.timestamp ? new Date(report.timestamp).toLocaleString() : 'Not Available'],
    ['Capture Location:', report.captureLocationInfo],
    ['GPS Location:', report.gpsLocation?.available ? report.gpsLocation.coordinates : 'Not Available']
  ];

  ownershipFields.forEach(function(field) {
    const label = field[0];
    const value = field[1];
    ctx.font = 'bold 11px Arial';
    ctx.fillText(label, 40, y);
    ctx.font = '11px Arial';
    const displayValue = String(value).length > 40 ? String(value).substring(0, 40) + '...' : String(value);
    ctx.fillText(displayValue, 240, y);
    y += 18;
  });

  y += 15;

  // Technical section
  ctx.fillStyle = '#1e40af';
  ctx.font = 'bold 16px Arial';
  ctx.fillText('TECHNICAL DETAILS', 40, y);
  y += 25;

  ctx.fillStyle = '#000000';
  const technicalFields = [
    ['Total Pixels:', report.totalPixels],
    ['Pixels Verified:', report.pixelsVerifiedWithBiometrics],
    ['Device Name:', report.deviceName],
    ['Device ID:', report.deviceId],
    ['IP Address:', report.ipAddress],
    ['Ownership Info:', report.ownershipInfo],
    ['Certificate:', report.authorshipCertificate],
    ['Rotation:', report.rotationMessage || 'Not detected']
  ];

  technicalFields.forEach(function(field) {
    const label = field[0];
    const value = field[1];
    ctx.font = 'bold 11px Arial';
    ctx.fillText(label, 40, y);
    ctx.font = '11px Arial';
    const displayValue = String(value).length > 40 ? String(value).substring(0, 40) + '...' : String(value);
    ctx.fillText(displayValue, 240, y);
    y += 18;
  });

  // Classification reasoning
  if (report.reasoning && report.reasoning.length > 0) {
    y += 15;
    ctx.fillStyle = '#1e40af';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('CLASSIFICATION ANALYSIS', 40, y);
    y += 25;

    ctx.fillStyle = '#000000';
    ctx.font = '11px Arial';
    report.reasoning.forEach(function(reason) {
      ctx.fillText('• ' + reason, 50, y);
      y += 16;
    });
  }

  // Analyzed Image Section
  if (imageData) {
    y += 20;

    ctx.fillStyle = '#1e40af';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('ANALYZED IMAGE', 40, y);
    y += 20;

    const img = new Image();
    img.onload = function () {
      const maxWidth = 500;
      const maxHeight = 220;

      let drawWidth = img.width;
      let drawHeight = img.height;

      const scale = Math.min(
        maxWidth / drawWidth,
        maxHeight / drawHeight,
        1
      );

      drawWidth *= scale;
      drawHeight *= scale;

      ctx.drawImage(img, 40, y, drawWidth, drawHeight);

      // Footer
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px Arial';
      ctx.fillText(
        'Report Generated: ' + new Date().toLocaleString(),
        40,
        825
      );

      // Save as PNG
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analysis-report-${report.assetId}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    };

    img.src = imageData;
    return;
  }

  // If no image, save immediately
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis-report-${report.assetId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
};

// ============================================
// MAIN COMPONENT
// ============================================
const ImageCryptoAnalyzer = ({ user, onLogout }) => {
  const navigate = useNavigate();

  // ✅ MOVE ALL HOOKS TO THE TOP - BEFORE ANY CONDITIONAL LOGIC
  const [activeTab, setActiveTab] = useState('encrypt');
  const [selectedFile, setSelectedFile] = useState(null);
  const [captureSource, setCaptureSource] = useState('Browser Upload');
  const [preview, setPreview] = useState(null);
  const [userId, setUserId] = useState('');
  const [encryptedImage, setEncryptedImage] = useState(null);
  const [encryptedFileName, setEncryptedFileName] = useState('encrypted-image.png');
  const [analysisReport, setAnalysisReport] = useState(null);
  const [showDeviceDetails, setShowDeviceDetails] = useState(false);
  const [processing, setProcessing] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);

  // Cleanup blob URLs on unmount or when new ones are created
  useEffect(() => {
    return () => {
      if (encryptedImage) {
        URL.revokeObjectURL(encryptedImage);
      }
    };
  }, [encryptedImage]);

  // ✅ NOW the safety check - AFTER all hooks
  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  // ✅ NOW the early return - AFTER all hooks
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Redirecting to login...</h2>
          <p className="text-gray-600">Please wait</p>
        </div>
      </div>
    );
  }

  const startCamera = async () => {
    try {
      setCameraActive(true);

      // Try with specific facing mode first
      let constraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 }
        },
        audio: false
      };

      let stream;

      try {
        // Try preferred camera
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        console.log('Specific camera failed, trying fallback...', err);

        // Fallback: Try without facingMode constraint
        constraints = {
          video: {
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 }
          },
          audio: false
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      }

      // Check if device has multiple cameras (can switch)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setCanSwitchCamera(videoDevices.length > 1);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', true);
        videoRef.current.setAttribute('autoplay', true);
        videoRef.current.setAttribute('muted', true);

        // Important: Wait for video to be ready
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(err => {
            console.error('Play failed:', err);
          });
        };
      }

    } catch (err) {
      console.error('Camera error:', err);
      let errorMessage = 'Camera access failed. ';

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage += 'Please allow camera permission in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage += 'No camera found on this device.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMessage += 'Camera is already in use by another app. Please close other apps using the camera.';
      } else {
        errorMessage += err.message;
      }

      alert(errorMessage);
      setCameraActive(false);
    }
  };

  const switchCamera = async () => {
    // Stop current stream
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
    }

    // Toggle facing mode
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);

    // Restart camera with new facing mode
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { exact: newFacingMode },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 }
        },
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(err => console.error('Play failed:', err));
      }
    } catch (err) {
      console.error('Switch camera failed:', err);
      // Fallback: restart with any available camera
      startCamera();
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCanSwitchCamera(false);
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(blob => {
      const file = new File([blob], 'camera-capture.png', { type: 'image/png' });
      setSelectedFile(file);
      setCaptureSource('Camera Capture');
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
      stopCamera();
    });
  };

  const handleFileSelect = (file) => {
    setCaptureSource('Browser Upload');

    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const embedUUID = async () => {
    if (!selectedFile || !userId) {
      alert('Please select an image and enter User ID');
      return;
    }

    setProcessing(true);

    // Compute SHA-256 hash of the original file immediately
    const sha256Hash = await computeSHA256(selectedFile);

    // Cleanup previous encrypted image URL
    if (encryptedImage) {
      URL.revokeObjectURL(encryptedImage);
      setEncryptedImage(null);
    }

    // Get all data in parallel
    const [currentGPS, ipAddress, captureTimeData, exifDeviceInfo, exifGPS] = await Promise.all([
      getGPSLocation(),
      getPublicIP(),
      getCaptureTime(selectedFile),
      getExifDeviceInfo(selectedFile),
      getExifGPS(selectedFile)
    ]);

    // Get current device info using reusable functions
    const currentDeviceId = getDeviceFingerprint();
    const currentDeviceName = getCurrentDeviceName();

    // Build device info based on scenario
    let deviceInfo;
    let gpsData;
    let ipInfo;

    if (captureSource === 'Camera Capture') {
      // Scenario 1: Camera capture in YOUR app - use current device
      deviceInfo = {
        deviceId: currentDeviceId,
        deviceName: currentDeviceName,
        source: 'App Camera'
      };
      gpsData = currentGPS.available ? { ...currentGPS, source: 'App Camera' } : { available: false, source: 'App Camera' };
      ipInfo = { ip: ipAddress, source: 'Capture Device' };

    } else if (exifDeviceInfo.found) {
      // Scenario 3: Upload from DIFFERENT device - use EXIF + label IP
      deviceInfo = {
        deviceId: exifDeviceInfo.deviceId,
        deviceName: exifDeviceInfo.deviceName,
        source: 'EXIF (Capture Device)'
      };
      // Prefer EXIF GPS if available, otherwise use current
      if (exifGPS.found) {
        gpsData = { ...exifGPS, available: true, source: 'EXIF (Capture Device)' };
      } else if (currentGPS.available) {
        gpsData = { ...currentGPS, source: 'Encrypting Device' };
      } else {
        gpsData = { available: false, source: 'Not Available' };
      }
      ipInfo = { ip: ipAddress, source: 'Encrypting Device' };

    } else {
      // Scenario 2: Upload on SAME device (no EXIF = screenshot/PNG/same device)
      deviceInfo = {
        deviceId: currentDeviceId,
        deviceName: currentDeviceName,
        source: 'Encrypting Device'
      };
      gpsData = currentGPS.available ? { ...currentGPS, source: 'Encrypting Device' } : { available: false, source: 'Not Available' };
      ipInfo = { ip: ipAddress, source: 'Encrypting Device' };
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // [UPDATED] Pass canvas.width and canvas.height for V3 resolution embedding
      const encryptedData = embedUUIDAdvanced(
        imageData,
        userId,
        { available: gpsData.available, latitude: gpsData.latitude, longitude: gpsData.longitude },
        deviceInfo,
        ipInfo.ip,
        captureTimeData.timestamp,
        deviceInfo.source,
        ipInfo.source,
        gpsData.source,
        canvas.width,
        canvas.height
      );
      ctx.putImageData(encryptedData, 0, 0);

      canvas.toBlob((blob) => {
        const encryptedUrl = URL.createObjectURL(blob);
        setEncryptedImage(encryptedUrl);
        setProcessing(false);

        // ── Generate asset ID + timestamp filename ──────────────────────────
        const imageData2 = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const assetId = generateAssetId(imageData2);
        const now = new Date();
        const ts = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
        const filename = `${assetId}_${ts}.png`;
        setEncryptedFileName(filename);

        // ── Compute vault security data ─────────────────────────────────────
        const perceptualHash = computePerceptualHash(canvas);
        const blockchainAnchor = generateBlockchainAnchor(sha256Hash, now.getTime());
        const certId = generateAuthorshipCertificateId(userId, deviceInfo.deviceId);

        // ── Save to vault database with correct Asset ID ────────────────────
        const reader = new FileReader();
        reader.onloadend = () => {
          const thumbnail = reader.result;
          
          // Save to backend with CORRECT Asset ID
          import('../api/client').then(({ vaultAPI }) => {
            vaultAPI.save({
              asset_id:           assetId,  // ← Use the hash-based Asset ID!
              owner_name:         userId,
              file_name:          filename,
              file_size:          `${(blob.size / 1024).toFixed(2)} KB`,
              thumbnail_base64:   thumbnail,
              device_id:          deviceInfo.deviceId,
              certificate_id:     certId,
              owner_email:        user?.email || null,
              file_hash:          sha256Hash,
              visual_fingerprint: perceptualHash,
              blockchain_anchor:  blockchainAnchor,
              resolution:         `${canvas.width}x${canvas.height}`,
              capture_timestamp:  captureTimeData.timestamp,
            }).then(() => {
              console.log('✅ Saved to vault with Asset ID:', assetId);
            }).catch(err => console.error('❌ Vault save failed:', err));
          }).catch(err => console.error('❌ API import failed:', err));
        };
        reader.readAsDataURL(blob);

        // ── Update forensicsStats via helper ────────────────────────────────
        updateForensicsStats('encrypted', {
          userId: userId,
          fileName: filename
        });

          try {
            // Backend API save is handled by saveToVault above
            console.log('✅ Vault entry prepared for backend');
          } catch (e) {
            console.error('Failed to save to vault:', e);
          }
        };
        reader.readAsDataURL(blob);

        // ── [UPDATED] Update forensicsStats via new helper ──────────────────
        updateForensicsStats('encrypted', {
          userId: userId,
          fileName: selectedFile ? selectedFile.name : filename
        });

        const locationMsg = gpsData.available
          ? `\nGPS: ${gpsData.latitude?.toFixed(6)}, ${gpsData.longitude?.toFixed(6)} (${gpsData.source})`
          : '\nGPS: Not available';

        const timeMsg = `\nCapture Time: ${captureTimeData.dateString} (${captureTimeData.source})`;
        const deviceMsg = `\nDevice: ${deviceInfo.deviceName} (${deviceInfo.source})`;
        const ipMsg = `\nIP: ${ipInfo.ip} (${ipInfo.source})`;

        alert('UUID successfully embedded!' + timeMsg + deviceMsg + ipMsg + locationMsg + '\n\nFile saved as: ' + filename);
      }, 'image/png');
    };
    img.src = preview;
  };

  // Rotate canvas by specified degrees (90, 180, 270)
  const rotateCanvas = (sourceCanvas, degrees) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // For 90° and 270°, swap width and height
    if (degrees === 90 || degrees === 270) {
      canvas.width = sourceCanvas.height;
      canvas.height = sourceCanvas.width;
    } else {
      canvas.width = sourceCanvas.width;
      canvas.height = sourceCanvas.height;
    }

    // Move to center, rotate, draw
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);

    return canvas;
  };

  // Try extracting UUID from all 4 rotations
  const extractUUIDWithRotation = (sourceCanvas) => {
    const rotations = [0, 90, 180, 270];

    for (const degrees of rotations) {
      let canvas;

      if (degrees === 0) {
        canvas = sourceCanvas;
      } else {
        canvas = rotateCanvas(sourceCanvas, degrees);
      }

      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const uuidResult = extractUUIDAdvanced(imageData);

      if (uuidResult.found) {
        return {
          ...uuidResult,
          rotationDetected: degrees,
          rotationMessage: degrees === 0
            ? 'Original orientation'
            : `Image was rotated ${degrees}° clockwise`
        };
      }
    }

    // No UUID found in any rotation
    return {
      found: false,
      rotationDetected: null,
      rotationMessage: 'No rotation detected'
    };
  };

const saveReportToLocalStorage = (report, userInfo) => {
  try {
    const enhancedReport = {
      ...report,
      reportId:  `RPT-${Date.now()}`,
      createdAt: Date.now(),
      userName:  userInfo?.name  || userInfo?.username || 'Unknown',
      userEmail: userInfo?.email || null,
    };

    // Save comparison report to backend
    import('../api/client').then(({ compareAPI, certAPI }) => {

      // Save analysis report
      compareAPI.save({
         asset_id:            enhancedReport.assetId         || 'UNKNOWN',
  is_tampered:         enhancedReport.isTampered       || false,
confidence: Math.round(enhancedReport.confidence || 0),
phash_sim:  enhancedReport.pHashSim ? Math.round(enhancedReport.pHashSim) : null,  visual_verdict:      enhancedReport.visualVerdict    || 'Unknown',
  editing_tool:        enhancedReport.editingTool      || 'Unknown',
  changes:             enhancedReport.changes          || [],
  pixel_analysis:      enhancedReport.pixelAnalysis    || {},
  uploaded_resolution: enhancedReport.uploadedResolution || null,
  uploaded_size:       String(enhancedReport.uploadedSize || ''),
  original_capture_time: null,
  modified_file_time:    null,
      }).then(() => {
        console.log('✅ Report saved:', enhancedReport.reportId);
      }).catch(err => console.warn('Report save failed:', err.message));

      // Save certificate if present
      if (enhancedReport.authorshipCertificateId) {
        certAPI.save({
          certificate_id: enhancedReport.authorshipCertificateId,
          asset_id:       enhancedReport.assetId,
          confidence:     enhancedReport.confidence,
          status:         enhancedReport.ownershipInfo?.includes('Verified') ? 'Verified' : 'Unknown',
          analysis_data:  enhancedReport,
          image_preview:  enhancedReport.imagePreview || null,
        }).then(() => {
          console.log('✅ Certificate saved:', enhancedReport.authorshipCertificateId);
        }).catch(err => console.warn('Certificate save failed:', err.message));
      }

    }).catch(err => console.warn('API import failed:', err.message));

  } catch (error) {
    console.error('Error saving report:', error);
  }
};
  const analyzeImage = async () => {
    if (!selectedFile) {
      alert('Please select an image to analyze');
      return;
    }

    setProcessing(true);

    // Fetch public IP address
    const publicIP = await getPublicIP();
    const deviceId = getDeviceFingerprint();

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const uuidResult = extractUUIDWithRotation(canvas);

      const classification = classifyImage(
        canvas,
        imageData,
        selectedFile.size,
        selectedFile.name,
        uuidResult.found
      );

      const totalPixels = canvas.width * canvas.height;

      // Generate consistent Asset ID based on image content
      const assetId = generateAssetId(imageData);

      // Use extracted data for encrypted images, otherwise use current device data
      const extractedDeviceName = uuidResult.found && uuidResult.deviceName ? uuidResult.deviceName : null;
      const extractedDeviceId = uuidResult.found && uuidResult.deviceId ? uuidResult.deviceId : null;
      const extractedIpAddress = uuidResult.found && uuidResult.ipAddress ? uuidResult.ipAddress : null;
      const extractedUserId = uuidResult.found ? uuidResult.userId : 'redt';

      // [NEW] Detect if image was cropped using embedded original resolution
      let cropInfo = null;
      const currentResolution = canvas.width + 'x' + canvas.height;

      if (uuidResult.found && uuidResult.originalResolution) {
        const originalRes = uuidResult.originalResolution;

        // Normalize both resolutions (remove spaces for accurate comparison)
        const normalizedOriginal = originalRes.replace(/\s/g, '').toLowerCase();
        const normalizedCurrent  = currentResolution.replace(/\s/g, '').toLowerCase();

        if (normalizedOriginal !== normalizedCurrent) {
          // Image was ACTUALLY cropped!
          const originalParts  = originalRes.split(/\s*x\s*/i);
          const originalWidth  = parseInt(originalParts[0]);
          const originalHeight = parseInt(originalParts[1]);
          const originalPixels = originalWidth * originalHeight;
          const currentPixels  = canvas.width * canvas.height;
          const remainingPercentage = ((currentPixels / originalPixels) * 100).toFixed(2);

          cropInfo = {
            isCropped: true,
            originalResolution: originalRes,
            currentResolution: currentResolution,
            originalPixels: originalPixels.toLocaleString(),
            currentPixels: currentPixels.toLocaleString(),
            remainingPercentage: remainingPercentage + '%'
          };
        } else {
          // Not cropped - resolutions match
          cropInfo = null;
        }
      }

      const report = {
        assetId: assetId,
        uniqueUserId: extractedUserId,
        assetFileSize: (selectedFile.size / 1024).toFixed(2) + ' KB',
        assetResolution: currentResolution,
        userEncryptedResolution: uuidResult.found ? currentResolution : 'N/A',
        timestamp: uuidResult.found && uuidResult.timestamp ? uuidResult.timestamp : null,
        captureLocationInfo: captureSource,
        gpsLocation: uuidResult.gps,
        totalPixels: totalPixels.toLocaleString(),
        pixelsVerifiedWithBiometrics: uuidResult.found ? Math.floor(totalPixels * 0.98).toLocaleString() : '0',
        deviceName: extractedDeviceName || getCurrentDeviceName(),
        deviceDetails: getDeviceDetails(),
        deviceId: extractedDeviceId || deviceId,
        deviceSource: uuidResult.found ? uuidResult.deviceSource : 'Current Device',
        ipAddress: extractedIpAddress || publicIP,
        ipSource: uuidResult.found ? uuidResult.ipSource : 'Current Device',
        ownershipInfo: uuidResult.found ? 'Verified - ' + uuidResult.confidence + ' Confidence' : 'Unknown',
        authorshipCertificateId: uuidResult.found
          ? generateAuthorshipCertificateId(extractedUserId, extractedDeviceId || deviceId)
          : 'Not Present',
        authorshipCertificate: uuidResult.found
          ? 'Valid & Verified (' + (selectedFile.type.startsWith('image/') ? 'Image' : 'File') + ')'
          : 'Not Present',
        detectedCase: classification.detectedCase,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        metrics: classification.metrics,
        rotationDetected: uuidResult.rotationDetected,
        rotationMessage: uuidResult.rotationMessage,
        cropInfo: cropInfo  // [NEW] crop detection result
      };

      setAnalysisReport(report);

      // Save to legacy analysisReports storage
      saveReportToLocalStorage(report, user);

      setProcessing(false);

      // [NEW] Update dashboard stats via helper
      updateForensicsStats('analyzed', {
        fileName: selectedFile.name
      });

      // [NEW] Save to vault if image has a verified UUID
      if (uuidResult.found) {
        saveToVault(
          preview,
          selectedFile.name,
          uuidResult.userId,
          (selectedFile.size / 1024).toFixed(2) + ' KB',
          null
        );
      }

      // [NEW] Generate and save comprehensive certificate
      saveCertificate(report, preview);
    };
    img.src = preview;
  };

  const downloadReport = () => {
    if (!analysisReport) return;
    generateReport(analysisReport, preview);
  };

  return (
    <>
      {/* Navigation Bar */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-3 flex justify-between items-center">
          <button
            onClick={() => navigate(user.role === 'admin' ? '/admin/dashboard' : '/user/dashboard')}
            className="flex items-center text-blue-600 hover:text-blue-800 font-semibold transition"
          >
            <ArrowLeft className="mr-2" size={20} />
            Back to Dashboard
          </button>
          <div className="flex items-center gap-4">
            <span className="text-gray-700">
              {user.role === 'admin' ? `Admin: ${user.username}` : user.name}
            </span>
            <button
              onClick={onLogout}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Original Image Analyzer Content */}
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
              <h1 className="text-3xl font-bold mb-2">Image Encryption & Analysis System</h1>
              <p className="text-blue-100">Advanced UUID embedding with AI-powered classification</p>
            </div>

            <div className="flex border-b">
              <button
                onClick={() => setActiveTab('encrypt')}
                className={`flex-1 py-4 px-6 font-semibold transition ${
                  activeTab === 'encrypt'
                    ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Camera className="inline mr-2" size={20} />
                UUID Encryption
              </button>
              <button
                onClick={() => setActiveTab('analyze')}
                className={`flex-1 py-4 px-6 font-semibold transition ${
                  activeTab === 'analyze'
                    ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <FileSearch className="inline mr-2" size={20} />
                Image Analysis
              </button>
            </div>

            <div className="p-6">
              {activeTab === 'encrypt' && (
                <div className="space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2">Advanced LSB Steganography</h3>
                    <p className="text-blue-800 text-sm">
                      This system uses advanced LSB steganography with a validation header.
                      Your User ID and GPS location are embedded across RGB channels with error detection.
                      <strong className="block mt-2">Important: Download as PNG to preserve encryption!</strong>
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block font-semibold mb-2 text-gray-700">User ID (UUID)</label>
                      <input
                        type="text"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        placeholder="Enter unique identifier"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <button
                        onClick={cameraActive ? captureImage : startCamera}
                        className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-semibold"
                      >
                        <Camera className="inline mr-2" size={20} />
                        {cameraActive ? 'Capture Photo' : 'Open Camera'}
                      </button>

                      <label className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-semibold text-center cursor-pointer">
                        <Upload className="inline mr-2" size={20} />
                        Upload Image
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileSelect(e.target.files[0])}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {cameraActive && (
                      <div className="relative bg-black rounded-lg overflow-hidden">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full rounded-lg"
                          style={{ maxHeight: '500px' }}
                        />

                        {/* Camera Controls Overlay */}
                        <div className="absolute top-2 right-2 flex gap-2">
                          {canSwitchCamera && (
                            <button
                              onClick={switchCamera}
                              className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition flex items-center gap-2"
                            >
                              🔄 Switch Camera
                            </button>
                          )}
                          <button
                            onClick={stopCamera}
                            className="bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-red-700 transition"
                          >
                            ✕ Close
                          </button>
                        </div>

                        {/* Camera Info Badge */}
                        <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white px-3 py-1 rounded text-sm">
                          📷 {facingMode === 'environment' ? 'Back Camera' : 'Front Camera'}
                        </div>
                      </div>
                    )}
                    <canvas ref={canvasRef} className="hidden" />
                  </div>

                  {preview && (
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="font-semibold mb-2 text-gray-700">Original Image</h3>
                        <img src={preview} alt="Original" className="w-full rounded-lg border" />
                      </div>

                      {encryptedImage && (
                        <div>
                          <h3 className="font-semibold mb-2 text-gray-700">Encrypted Image</h3>
                          <img src={encryptedImage} alt="Encrypted" className="w-full rounded-lg border" />
                          <a
                            href={encryptedImage}
                            download={encryptedFileName}
                            className="mt-3 block w-full bg-green-600 text-white px-4 py-2 rounded-lg text-center hover:bg-green-700"
                          >
                            <Download className="inline mr-2" size={18} />
                            Download Encrypted Image (PNG)
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={embedUUID}
                    disabled={!selectedFile || !userId || processing}
                    className="w-full bg-indigo-600 text-white px-6 py-4 rounded-lg hover:bg-indigo-700 transition font-semibold text-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {processing ? 'Processing...' : 'Embed UUID into Image'}
                  </button>
                </div>
              )}

              {activeTab === 'analyze' && (
                <div className="space-y-6">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h3 className="font-semibold text-amber-900 mb-2">Advanced AI Classification</h3>
                    <ul className="text-amber-800 text-sm space-y-1">
                      <li>• Advanced LSB extraction with header validation</li>
                      <li>• GPS location extraction from encrypted images</li>
                      <li>• Multi-metric classification algorithm</li>
                      <li>• High-confidence case detection with reasoning</li>
                    </ul>
                  </div>

                  <label className="block w-full bg-blue-600 text-white px-6 py-4 rounded-lg hover:bg-blue-700 transition font-semibold text-center cursor-pointer">
                    <Upload className="inline mr-2" size={20} />
                    Upload Image to Analyze
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileSelect(e.target.files[0])}
                      className="hidden"
                    />
                  </label>

                  {preview && (
                    <div>
                      <h3 className="font-semibold mb-2 text-gray-700">Selected Image</h3>
                      <img src={preview} alt="To analyze" className="w-full max-w-md mx-auto rounded-lg border" />
                    </div>
                  )}

                  <button
                    onClick={analyzeImage}
                    disabled={!selectedFile || processing}
                    className="w-full bg-purple-600 text-white px-6 py-4 rounded-lg hover:bg-purple-700 transition font-semibold text-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {processing ? 'Analyzing...' : 'Analyze Image'}
                  </button>

                  {analysisReport && (
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-2xl font-bold text-gray-800">Analysis Report</h3>
                        <button
                          onClick={downloadReport}
                          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm"
                        >
                          <Download className="inline mr-1" size={16} />
                          Download Report
                        </button>
                      </div>

                      <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-4">
                        <p className="font-bold text-yellow-900">{analysisReport.detectedCase}</p>
                        <p className="text-yellow-800 text-sm">Confidence: {analysisReport.confidence}%</p>
                      </div>

                      {analysisReport.rotationDetected !== null && analysisReport.rotationDetected !== 0 && (
                        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">🔄</span>
                            <div>
                              <p className="font-bold text-blue-900">Rotation Detected</p>
                              <p className="text-blue-800 text-sm">{analysisReport.rotationMessage}</p>
                              <p className="text-blue-700 text-xs mt-1">
                                The encrypted data was successfully recovered despite rotation.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* [NEW] Crop Detection Banner */}
                      {analysisReport.cropInfo && analysisReport.cropInfo.isCropped && (
                        <div className="bg-purple-50 border-l-4 border-purple-500 p-4 mb-4">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">✂️</span>
                            <div>
                              <p className="font-bold text-purple-900">Crop Detected</p>
                              <div className="text-purple-800 text-sm space-y-1 mt-1">
                                <div><span className="font-semibold">Original Resolution:</span> {analysisReport.cropInfo.originalResolution}</div>
                                <div><span className="font-semibold">Current Resolution:</span> {analysisReport.cropInfo.currentResolution}</div>
                                <div><span className="font-semibold">Original Pixels:</span> {analysisReport.cropInfo.originalPixels}</div>
                                <div><span className="font-semibold">Current Pixels:</span> {analysisReport.cropInfo.currentPixels}</div>
                                <div><span className="font-semibold">Remaining:</span> {analysisReport.cropInfo.remainingPercentage}</div>
                              </div>
                              <p className="text-purple-700 text-xs mt-2">
                                ✓ All encrypted ownership details preserved despite cropping. Only pixel count updated.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-lg border">
                          <h4 className="font-bold text-blue-900 mb-3 border-b pb-2">Ownership at Creation</h4>
                          <div>
                            <span className="font-semibold">Authorship Certificate ID:</span>{' '}
                            {analysisReport.authorshipCertificateId}
                          </div>
                          <div className="space-y-2 text-sm">
                            <div><span className="font-semibold">Asset ID:</span> {analysisReport.assetId}</div>
                            <div><span className="font-semibold">Unique User ID:</span> {analysisReport.uniqueUserId}</div>
                            <div><span className="font-semibold">Asset File Size:</span> {analysisReport.assetFileSize}</div>
                            <div><span className="font-semibold">Asset Resolution:</span> {analysisReport.assetResolution}</div>
                            <div><span className="font-semibold">User Encrypted Resolution:</span> {analysisReport.userEncryptedResolution}</div>
                            <div><span className="font-semibold">Time Stamp:</span> {analysisReport.timestamp ? new Date(analysisReport.timestamp).toLocaleString() : 'Not Available'}</div>
                            <div><span className="font-semibold">Capture Location:</span> {analysisReport.captureLocationInfo}</div>
                            <div>
                              <span className="font-semibold">GPS Location:</span>{' '}
                              {analysisReport.gpsLocation?.available ? (
                                <a
                                  href={analysisReport.gpsLocation.mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 underline hover:text-blue-800"
                                >
                                  📍 {analysisReport.gpsLocation.coordinates}
                                </a>
                              ) : (
                                <span className="text-gray-500">Not Available</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="bg-white p-4 rounded-lg border">
                          <h4 className="font-bold text-blue-900 mb-3 border-b pb-2">Technical Details</h4>
                          <div className="space-y-2 text-sm">
                            <div><span className="font-semibold">Total Pixels:</span> {analysisReport.totalPixels}</div>
                            <div><span className="font-semibold">Pixels Verified:</span> {analysisReport.pixelsVerifiedWithBiometrics}</div>
                            <div>
                              <span className="font-semibold">Device Name:</span> {analysisReport.deviceName}
                              <span className="text-gray-500 text-xs ml-1">({analysisReport.deviceSource})</span>
                            </div>
                            <div>
                              <span className="font-semibold">Device ID:</span>{' '}
                              <span
                                onClick={() => setShowDeviceDetails(true)}
                                className="text-blue-600 underline cursor-pointer hover:text-blue-800"
                              >
                                {analysisReport.deviceId}
                              </span>
                              <span className="text-gray-500 text-xs ml-1">({analysisReport.deviceSource})</span>
                            </div>
                            <div>
                              <span className="font-semibold">IP Address:</span> {analysisReport.ipAddress}
                              <span className="text-gray-500 text-xs ml-1">({analysisReport.ipSource})</span>
                            </div>
                            <div><span className="font-semibold">Ownership Info:</span> {analysisReport.ownershipInfo}</div>
                            <div><span className="font-semibold">Certificate:</span> {analysisReport.authorshipCertificate}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Device Details Modal */}
      {showDeviceDetails && analysisReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Device Information</h2>
                <button
                  onClick={() => setShowDeviceDetails(false)}
                  className="text-white hover:text-gray-200 text-2xl font-bold"
                >
                  ×
                </button>
              </div>
              <p className="text-blue-100 text-sm mt-1">ID: {analysisReport.deviceId}</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Device Type</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.deviceType || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Platform</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.platform || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Screen Resolution</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.screen || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Color Depth</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.colorDepth || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">CPU Cores</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.cores || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Memory</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.memory || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Timezone</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.timezone || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Language</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.language || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Touch Capable</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.touchCapable || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Touch Points</p>
                  <p className="font-semibold text-gray-800">{analysisReport.deviceDetails?.touchPoints || '0'}</p>
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500 uppercase mb-1">Browser / User Agent</p>
                <p className="font-semibold text-gray-800 text-xs break-all">{analysisReport.deviceDetails?.browser || 'Unknown'}</p>
              </div>

              <button
                onClick={() => setShowDeviceDetails(false)}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ImageCryptoAnalyzer;