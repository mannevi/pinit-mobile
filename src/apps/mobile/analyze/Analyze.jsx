import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, Upload, ChevronRight, CheckCircle, Shield,
  ArrowLeft, Download, Share2, Award, RefreshCw,
  Image as ImageIcon, AlertTriangle, Lock, Eye, Trash2, FileText
} from 'lucide-react';
import { vaultAPI, certAPI, compareAPI } from '../../../api/client';
import './Analyze.css';

// ═════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS — preserved verbatim from ImageCryptoAnalyzer.js
// ═════════════════════════════════════════════════════════════════════════════

const getPublicIP = async () => {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip || 'Unavailable';
  } catch { return 'Unavailable'; }
};

const getGPSLocation = () => new Promise((resolve) => {
  const ok = (pos) => resolve({
    available: true, latitude: pos.coords.latitude, longitude: pos.coords.longitude,
    coordinates: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`,
    mapsUrl: `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`
  });
  const fail = () => resolve({ available: false, coordinates: null });
  const isCapacitor = !!(window.Capacitor?.isNativePlatform?.());
  if (isCapacitor) {
    import('@capacitor/geolocation').then(({ Geolocation }) => {
      Geolocation.requestPermissions().then(() =>
        Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })
          .then(p => ok({ coords: p.coords })).catch(fail)
      ).catch(fail);
    }).catch(() => {
      navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 10000 })
        : fail();
    });
    return;
  }
  navigator.geolocation
    ? navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 10000 })
    : fail();
});

const getFileFallbackTime = (file) => ({
  timestamp: file.lastModified || Date.now(),
  source: file.lastModified ? 'File Modified' : 'Current Time',
  dateString: new Date(file.lastModified || Date.now()).toLocaleString()
});

const getCaptureTime = (file) => new Promise((resolve) => {
  if (!['image/jpeg','image/jpg'].includes(file.type)) {
    resolve(getFileFallbackTime(file)); return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const view = new DataView(e.target.result);
      if (view.getUint16(0, false) !== 0xFFD8) { resolve(getFileFallbackTime(file)); return; }
      let offset = 2;
      while (offset < view.byteLength) {
        const marker = view.getUint16(offset, false); offset += 2;
        if (marker === 0xFFE1) {
          const hdr = String.fromCharCode(view.getUint8(offset+2),view.getUint8(offset+3),view.getUint8(offset+4),view.getUint8(offset+5));
          if (hdr === 'Exif') {
            const t = offset+8; const le = view.getUint16(t,false)===0x4949;
            const ifd = view.getUint32(t+4,le); const n = view.getUint16(t+ifd,le);
            for (let i=0;i<n;i++) {
              const eo = t+ifd+2+(i*12); const tag = view.getUint16(eo,le);
              if (tag===0x8769) {
                const exo = view.getUint32(eo+8,le); const en = view.getUint16(t+exo,le);
                for (let j=0;j<en;j++) {
                  const ee = t+exo+2+(j*12); const et = view.getUint16(ee,le);
                  if (et===0x9003||et===0x9004) {
                    const vo = view.getUint32(ee+8,le); let ds='';
                    for (let k=0;k<19;k++) ds+=String.fromCharCode(view.getUint8(t+vo+k));
                    const [datePart,timePart] = ds.split(' ');
                    if (datePart&&timePart) {
                      const [y,mo,d]=datePart.split(':'); const [h,mi,s]=timePart.split(':');
                      resolve({ timestamp: new Date(+y,+mo-1,+d,+h,+mi,+s).getTime(), source:'EXIF', dateString:ds });
                      return;
                    }
                  }
                }
              }
            }
          }
          resolve(getFileFallbackTime(file)); return;
        }
        if (marker===0xFFD9||marker===0xFFDA) break;
        const len=view.getUint16(offset,false); offset+=len;
      }
      resolve(getFileFallbackTime(file));
    } catch { resolve(getFileFallbackTime(file)); }
  };
  reader.onerror = () => resolve(getFileFallbackTime(file));
  reader.readAsArrayBuffer(file.slice(0,128*1024));
});

const getExifDeviceInfo = (file) => new Promise((resolve) => {
  if (!['image/jpeg','image/jpg'].includes(file.type)) { resolve({found:false}); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const view = new DataView(e.target.result);
      if (view.getUint16(0,false)!==0xFFD8) { resolve({found:false}); return; }
      let offset=2; let make=null; let model=null;
      while (offset<view.byteLength) {
        const marker=view.getUint16(offset,false); offset+=2;
        if (marker===0xFFE1) {
          const hdr=String.fromCharCode(view.getUint8(offset+2),view.getUint8(offset+3),view.getUint8(offset+4),view.getUint8(offset+5));
          if (hdr==='Exif') {
            const t=offset+8; const le=view.getUint16(t,false)===0x4949;
            const ifd=view.getUint32(t+4,le); const n=view.getUint16(t+ifd,le);
            for (let i=0;i<n;i++) {
              const eo=t+ifd+2+(i*12); const tag=view.getUint16(eo,le);
              const type=view.getUint16(eo+2,le); const nv=view.getUint32(eo+4,le);
              if (tag===0x010F||tag===0x0110) {
                const vo = nv*(type===2?1:2)>4 ? view.getUint32(eo+8,le) : eo+8-t;
                let str='';
                for (let j=0;j<nv-1;j++) { const cc=view.getUint8(t+vo+j); if(cc===0)break; str+=String.fromCharCode(cc); }
                if (tag===0x010F) make=str.trim();
                if (tag===0x0110) model=str.trim();
              }
            }
          }
          break;
        }
        if (marker===0xFFD9||marker===0xFFDA) break;
        const len=view.getUint16(offset,false); offset+=len;
      }
      if (make||model) {
        const dn=[make,model].filter(Boolean).join(' ');
        let hash=0; for (let i=0;i<dn.length;i++) { hash=((hash<<5)-hash)+dn.charCodeAt(i); hash|=0; }
        resolve({ found:true, make, model, deviceName:dn, deviceId:'CAM-'+Math.abs(hash).toString(36).toUpperCase().slice(0,6), source:'EXIF' });
      } else resolve({found:false});
    } catch { resolve({found:false}); }
  };
  reader.onerror = () => resolve({found:false});
  reader.readAsArrayBuffer(file.slice(0,128*1024));
});

// ── FIX: getExifGPS was missing — ported verbatim from ImageCryptoAnalyzer.js ──
const getExifGPS = (file) => new Promise((resolve) => {
  if (!['image/jpeg','image/jpg'].includes(file.type)) { resolve({found:false}); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const view = new DataView(e.target.result);
      if (view.getUint16(0,false) !== 0xFFD8) { resolve({found:false}); return; }
      let offset = 2;
      while (offset < view.byteLength) {
        const marker = view.getUint16(offset,false); offset += 2;
        if (marker === 0xFFE1) {
          const hdr = String.fromCharCode(view.getUint8(offset+2),view.getUint8(offset+3),view.getUint8(offset+4),view.getUint8(offset+5));
          if (hdr === 'Exif') {
            const t = offset+8; const le = view.getUint16(t,false) === 0x4949;
            const ifd = view.getUint32(t+4,le); const n = view.getUint16(t+ifd,le);
            for (let i = 0; i < n; i++) {
              const eo = t+ifd+2+(i*12); const tag = view.getUint16(eo,le);
              if (tag === 0x8825) {
                const gpsOff = view.getUint32(eo+8,le); const gn = view.getUint16(t+gpsOff,le);
                let latRef='N', lonRef='E', lat=null, lon=null;
                for (let j = 0; j < gn; j++) {
                  const ge = t+gpsOff+2+(j*12); const gt = view.getUint16(ge,le);
                  if (gt===0x0001) latRef = String.fromCharCode(view.getUint8(ge+8));
                  if (gt===0x0003) lonRef = String.fromCharCode(view.getUint8(ge+8));
                  if (gt===0x0002||gt===0x0004) {
                    const vo = view.getUint32(ge+8,le);
                    const d = view.getUint32(t+vo,le)/view.getUint32(t+vo+4,le);
                    const m = view.getUint32(t+vo+8,le)/view.getUint32(t+vo+12,le);
                    const s = view.getUint32(t+vo+16,le)/view.getUint32(t+vo+20,le);
                    if (gt===0x0002) lat=d+(m/60)+(s/3600);
                    else             lon=d+(m/60)+(s/3600);
                  }
                }
                if (lat!==null && lon!==null) {
                  if (latRef==='S') lat=-lat; if (lonRef==='W') lon=-lon;
                  resolve({ found:true, latitude:lat, longitude:lon,
                    coordinates:`${lat.toFixed(6)}, ${lon.toFixed(6)}`,
                    mapsUrl:`https://www.google.com/maps?q=${lat},${lon}`, source:'EXIF' });
                  return;
                }
              }
            }
          }
          break;
        }
        if (marker===0xFFD9||marker===0xFFDA) break;
        const len = view.getUint16(offset,false); offset += len;
      }
      resolve({found:false});
    } catch { resolve({found:false}); }
  };
  reader.onerror = () => resolve({found:false});
  reader.readAsArrayBuffer(file.slice(0,128*1024));
});

const getDeviceFingerprint = () => {
  let id = localStorage.getItem('deviceFingerprint');
  if (!id) {
    const fp = [window.screen.width+'x'+window.screen.height,navigator.platform||'',navigator.hardwareConcurrency||0,Intl.DateTimeFormat().resolvedOptions().timeZone,navigator.language,navigator.maxTouchPoints||0,navigator.userAgent].join('|');
    let h=0; for (let i=0;i<fp.length;i++){h=((h<<5)-h)+fp.charCodeAt(i);h|=0;}
    const t=/Android|iPhone|iPad/i.test(navigator.userAgent)?'MOB':'DSK';
    id=`${t}-${Math.abs(h).toString(36).toUpperCase().slice(0,8)}`;
    localStorage.setItem('deviceFingerprint',id);
  }
  return id;
};

const getCurrentDeviceName = () => navigator.userAgent.split('(')[1]?.split(')')[0] || 'Unknown';

const getDeviceDetails = () => ({
  screen: window.screen.width+'x'+window.screen.height,
  colorDepth: window.screen.colorDepth+'-bit',
  platform: navigator.platform||'Unknown',
  cores: navigator.hardwareConcurrency||'Unknown',
  memory: navigator.deviceMemory?navigator.deviceMemory+' GB':'Unknown',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone||'Unknown',
  language: navigator.language||'Unknown',
  touchCapable: navigator.maxTouchPoints>0?'Yes':'No',
  deviceType: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)?'Mobile':'Desktop',
  browser: navigator.userAgent
});

const generateAuthorshipCertificateId = (userId, deviceId) => {
  const s=`${userId}-${deviceId}`; let h=0;
  for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}
  const hs=Math.abs(h).toString(16).toUpperCase();
  const uh=userId.split('').reduce((a,c)=>((a<<5)-a)+c.charCodeAt(0),0);
  return `CERT-${hs.slice(0,8)}${Math.abs(uh).toString(36).toUpperCase().slice(0,6)}`;
};

const computeSHA256 = async (file) => {
  try {
    const buf=await file.arrayBuffer(); const h=await crypto.subtle.digest('SHA-256',buf);
    return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');
  } catch { return 'sha256-unavailable-'+Date.now().toString(16); }
};

const computePerceptualHash = (canvas) => {
  try {
    const SZ=32; const s=document.createElement('canvas'); s.width=SZ; s.height=SZ;
    s.getContext('2d').drawImage(canvas,0,0,SZ,SZ);
    const d=s.getContext('2d').getImageData(0,0,SZ,SZ).data;
    const gray=[]; for(let i=0;i<SZ*SZ;i++) gray.push(0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2]);
    const DCT=16; const dct=[];
    for(let u=0;u<DCT;u++) for(let v=0;v<DCT;v++){
      let sum=0;
      for(let x=0;x<SZ;x++) for(let y=0;y<SZ;y++)
        sum+=gray[x*SZ+y]*Math.cos(((2*x+1)*u*Math.PI)/(2*SZ))*Math.cos(((2*y+1)*v*Math.PI)/(2*SZ));
      dct.push(sum);
    }
    const ac=dct.slice(1); const med=[...ac].sort((a,b)=>a-b)[Math.floor(ac.length/2)];
    const bits=['1',...ac.map(v=>v>=med?'1':'0')]; let hex='';
    for(let i=0;i<256;i+=4) hex+=parseInt(bits.slice(i,i+4).join(''),2).toString(16);
    return hex.toUpperCase();
  } catch { return 'PHASH-UNAVAIL'; }
};

const generateAssetId = (imageData) => {
  const d=imageData.data; let h=0;
  const si=Math.max(1,Math.floor(d.length/1000));
  for(let i=0;i<d.length;i+=si){h=((h<<5)-h)+d[i];h|=0;}
  h=((h<<5)-h)+imageData.width; h=((h<<5)-h)+imageData.height; h|=0;
  return `AST-${Math.abs(h).toString(36).toUpperCase().padStart(12,'0')}`;
};

const generateBlockchainAnchor = (fileHash, timestamp) => {
  const seed=(fileHash||'')+(timestamp||Date.now()).toString(16);
  let r='0x';
  for(let i=0;i<64;i++) r+=((seed.charCodeAt(i%seed.length)*(i+7))%16).toString(16);
  return r;
};

// ─── LSB Steganography ────────────────────────────────────────────────────────
const STEGO_TILE=12; const UUID_FIELD_LEN=32; const PAYLOAD_BYTES=1+UUID_FIELD_LEN+2; const PAYLOAD_BITS=PAYLOAD_BYTES*8;

const crc16js=(bytes)=>{let crc=0xFFFF;for(let i=0;i<bytes.length;i++){crc^=bytes[i]<<8;for(let j=0;j<8;j++)crc=(crc&0x8000)?((crc<<1)^0x1021)&0xFFFF:(crc<<1)&0xFFFF;}return crc&0xFFFF;};

const buildPayloadBits=(userId)=>{const str=(userId||'').replace(/-/g,'').substring(0,UUID_FIELD_LEN);const up=new Uint8Array(UUID_FIELD_LEN);for(let i=0;i<str.length;i++)up[i]=str.charCodeAt(i);const fc=new Uint8Array(1+UUID_FIELD_LEN);fc[0]=str.length;fc.set(up,1);const crc=crc16js(fc);const p=new Uint8Array(PAYLOAD_BYTES);p[0]=str.length;p.set(up,1);p[PAYLOAD_BYTES-2]=(crc>>8)&0xFF;p[PAYLOAD_BYTES-1]=crc&0xFF;const bits=[];for(let i=0;i<PAYLOAD_BYTES;i++)for(let b=7;b>=0;b--)bits.push((p[i]>>b)&1);return bits;};

const parsePayloadBits=(bits)=>{if(bits.length<PAYLOAD_BITS)return null;const bytes=new Uint8Array(PAYLOAD_BYTES);for(let i=0;i<PAYLOAD_BYTES;i++){let v=0;for(let b=0;b<8;b++)v=(v<<1)|(bits[i*8+b]||0);bytes[i]=v;}const len=bytes[0];if(len<=0||len>UUID_FIELD_LEN)return null;const up=bytes.slice(1,1+UUID_FIELD_LEN);const cr=(bytes[PAYLOAD_BYTES-2]<<8)|bytes[PAYLOAD_BYTES-1];const fc=new Uint8Array(1+UUID_FIELD_LEN);fc[0]=len;fc.set(up,1);if(crc16js(fc)!==cr)return null;let uid='';for(let i=0;i<len;i++)uid+=String.fromCharCode(up[i]);if(uid.length===32&&/^[0-9a-fA-F]{32}$/.test(uid))uid=`${uid.slice(0,8)}-${uid.slice(8,12)}-${uid.slice(12,16)}-${uid.slice(16,20)}-${uid.slice(20)}`;return uid;};

const embedUUIDAdvanced=(imageData,userId,gpsData,deviceInfo,ipAddress,timestamp,deviceSource,ipSource,gpsSource,width,height)=>{
  const data=imageData.data; const pb=buildPayloadBits(userId);
  const gpsStr=gpsData?.available?`${gpsData.latitude},${gpsData.longitude}`:'NOGPS';
  const msg=`IMGCRYPT3|${userId}|${gpsStr}|${timestamp||Date.now()}|${deviceInfo.deviceId||'UNKNOWN'}|${deviceInfo.deviceName||'UNKNOWN'}|${ipAddress||'UNKNOWN'}|${deviceSource||'Unknown'}|${ipSource||'Unknown'}|${gpsSource||'Unknown'}|${width}x${height}|END`;
  const fb=[]; for(let i=0;i<msg.length;i++){const c=msg.charCodeAt(i);for(let b=7;b>=0;b--)fb.push((c>>b)&1);}
  const T=STEGO_TILE;
  for(let idx=0;idx<data.length;idx+=4){const pi=idx/4;const x=pi%width;const y=Math.floor(pi/width);const p=(y%T)*T+(x%T);data[idx]=(data[idx]&0xFE)|pb[(2*p)%PAYLOAD_BITS];data[idx+1]=(data[idx+1]&0xFE)|pb[(2*p+1)%PAYLOAD_BITS];data[idx+2]=(data[idx+2]&0xFE)|fb[pi%fb.length];}
  return imageData;
};

const buildResultFromExtract=(userId,data,imgW)=>{
  const nb=(id)=>(id||'').replace(/-/g,'').toLowerCase();
  const bb=[]; for(let idx=0;idx<data.length;idx+=4)bb.push(data[idx+2]&1);
  const full=extractIMGCRYPT3(bb);
  if(full&&nb(full.userId)===nb(userId))return{...full,userId};
  if(full)return{found:true,userId,gps:full.gps,timestamp:full.timestamp,deviceId:full.deviceId,deviceName:full.deviceName,ipAddress:full.ipAddress,deviceSource:full.deviceSource||'Unknown',ipSource:full.ipSource||'Unknown',gpsSource:full.gpsSource||'Unknown',originalResolution:full.originalResolution||null,confidence:'High'};
  return{found:true,userId,gps:{available:false},timestamp:null,deviceId:null,deviceName:null,ipAddress:null,deviceSource:'Unknown',ipSource:'Unknown',gpsSource:'Unknown',originalResolution:null,confidence:'High'};
};

const parseIMGCRYPT3Msg=(text)=>{const v3=text.includes('IMGCRYPT3|');const v2=!v3&&text.includes('IMGCRYPT2|');const hdr=v3?'IMGCRYPT3|':v2?'IMGCRYPT2|':text.includes('IMGCRYPT|')?'IMGCRYPT|':null;if(!hdr)return null;const si=text.indexOf(hdr)+hdr.length;const ei=text.indexOf('|END',si);if(ei<=si)return null;const pts=text.substring(si,ei).split('|');if(pts.length<4||!pts[0]||pts[0].length<2)return null;return{userId:pts[0],gps:pts[1]||'NOGPS',timestamp:pts[2]||null,deviceId:pts[3]||null,deviceName:pts[4]||null,ipAddress:pts[5]||null,deviceSource:pts[6]||null,ipSource:pts[7]||null,gpsSource:pts[8]||null,originalResolution:v3?(pts[9]||null):null};};

const buildResultFromMsg=(m)=>{let gps={available:false,coordinates:null,mapsUrl:null,source:m.gpsSource||'Unknown'};if(m.gps&&m.gps!=='NOGPS'){const pts=m.gps.split(',');if(pts.length===2){const lat=parseFloat(pts[0]),lng=parseFloat(pts[1]);if(!isNaN(lat)&&!isNaN(lng))gps={available:true,latitude:lat,longitude:lng,coordinates:`${lat.toFixed(6)}, ${lng.toFixed(6)}`,mapsUrl:`https://www.google.com/maps?q=${lat},${lng}`,source:m.gpsSource||'Unknown'};}}return{found:true,userId:m.userId,gps,timestamp:m.timestamp&&!isNaN(m.timestamp)?parseInt(m.timestamp):null,deviceId:m.deviceId,deviceName:m.deviceName,ipAddress:m.ipAddress,deviceSource:m.deviceSource||'Unknown',ipSource:m.ipSource||'Unknown',gpsSource:m.gpsSource||'Unknown',originalResolution:m.originalResolution,confidence:'High'};};

const extractIMGCRYPT3=(bits)=>{const total=bits.length;const maxScan=Math.min(Math.max(0,total-80),3200);const maxRead=Math.min(500,Math.floor(total/8));for(let off=0;off<=maxScan;off+=8){let text='';for(let c=0;c<maxRead;c++){const s=off+c*8;if(s+8>total)break;let v=0;for(let b=0;b<8;b++)v=(v<<1)|bits[s+b];text+=(v>=32&&v<=126)?String.fromCharCode(v):'\x00';}if(!text.includes('IMGCRYPT'))continue;const p=parseIMGCRYPT3Msg(text);if(p)return buildResultFromMsg(p);}return null;};

const extractUUIDAdvanced=(imageData)=>{
  const data=imageData.data; const imgW=imageData.width||1; const T=STEGO_TILE;
  const decode=(ox,oy)=>{const votes=new Array(PAYLOAD_BITS).fill(0);const counts=new Array(PAYLOAD_BITS).fill(0);for(let idx=0;idx<data.length;idx+=4){const pi=idx/4;const tx=((pi%imgW)+ox)%T;const ty=(Math.floor(pi/imgW)+oy)%T;const p=ty*T+tx;const i0=(2*p)%PAYLOAD_BITS;const i1=(2*p+1)%PAYLOAD_BITS;votes[i0]+=(data[idx]&1);counts[i0]++;votes[i1]+=(data[idx+1]&1);counts[i1]++;}const bits=votes.map((v,i)=>(counts[i]>0&&v>counts[i]/2)?1:0);return parsePayloadBits(bits);};
  let uid=decode(0,0); if(uid)return buildResultFromExtract(uid,data,imgW);
  for(let oy=0;oy<T;oy++)for(let ox=0;ox<T;ox++){if(ox===0&&oy===0)continue;uid=decode(ox,oy);if(uid)return buildResultFromExtract(uid,data,imgW);}
  const bb=[]; for(let idx=0;idx<data.length;idx+=4)bb.push(data[idx+2]&1); const r2=extractIMGCRYPT3(bb); if(r2)return r2;
  const rgb=[]; for(let idx=0;idx<data.length;idx+=4)rgb.push(data[idx]&1,data[idx+1]&1,data[idx+2]&1); const r3=extractIMGCRYPT3(rgb); if(r3)return r3;
  return{found:false,userId:''};
};

const rotateCanvas=(src,deg)=>{const c=document.createElement('canvas');const sw=deg===90||deg===270;c.width=sw?src.height:src.width;c.height=sw?src.width:src.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.translate(c.width/2,c.height/2);ctx.rotate((deg*Math.PI)/180);ctx.drawImage(src,-src.width/2,-src.height/2);return c;};

const extractUUIDWithRotation=(sourceCanvas)=>{
  for(const deg of [0,90,180,270]){
    const c=deg===0?sourceCanvas:rotateCanvas(sourceCanvas,deg);
    const ctx=c.getContext('2d');const imageData=ctx.getImageData(0,0,c.width,c.height);
    const r=extractUUIDAdvanced(imageData);
    if(r.found)return{...r,rotationDetected:deg,rotationMessage:deg===0?'Original orientation':`Image was rotated ${deg}°`};
  }
  return{found:false,rotationDetected:null,rotationMessage:'No rotation detected'};
};

const buildMetrics=(tv,nl,sb,ec,ur,ae,cr,ar,cc)=>({
  variance:tv.toFixed(2),noiseLevel:nl.toFixed(2),smoothBlockRatio:(sb*100).toFixed(1)+'%',
  edgeCoherence:(ec*100).toFixed(1)+'%',uniformityRatio:(ur*100).toFixed(1)+'%',
  entropy:ae.toFixed(2),compressionRatio:cr.toFixed(3),aspectRatio:ar.toFixed(3),channelCorrelation:cc.toFixed(3)
});

const classifyImage=(canvas,imageData,fileSize,fileName,hasUUID,resolutionMismatch=false,exifHints={})=>{
  const data=imageData.data; const w=canvas.width; const h=canvas.height;
  const total=w*h; const pc=data.length/4;

  // ── Small image guard ──────────────────────────────────────────────────────
  // Images under 200x200 have too few pixels for reliable heuristic metrics.
  // All signals (noise, edge coherence, smooth blocks) are calibrated for
  // full-resolution photos. Return a low-confidence result with a clear note.
  const isSmall = total < 40000; // smaller than ~200x200
  const isPNG=fileName.toLowerCase().endsWith('.png');
  const isJPEG=fileName.toLowerCase().endsWith('.jpg')||fileName.toLowerCase().endsWith('.jpeg');
  const exifDevice=exifHints.exifDeviceInfo||{found:false};
  const exifGPSData=exifHints.exifGPS||{found:false};
  const captureTimeData=exifHints.captureTimeData||{source:'Unknown'};
  let rrC=0,ggC=0,bbC=0,rgC=0,rbC=0,gbC=0; const ss=Math.max(1,Math.floor(pc/5000));
  for(let i=0;i<pc;i+=ss){const idx=i*4;const r=data[idx],g=data[idx+1],b=data[idx+2];rrC+=r*r;ggC+=g*g;bbC+=b*b;rgC+=r*g;rbC+=r*b;gbC+=g*b;}
  const cc=(rgC+rbC+gbC)/(rrC+ggC+bbC+0.001);
  let up=0,np=0;
  for(let y=2;y<Math.min(h-2,100);y+=2)for(let x=2;x<Math.min(w-2,100);x+=2){const ctr=data[(y*w+x)*4];const nb=[data[((y-1)*w+(x-1))*4],data[((y-1)*w+x)*4],data[((y-1)*w+(x+1))*4],data[(y*w+(x+1))*4],data[((y+1)*w+(x+1))*4],data[((y+1)*w+x)*4],data[((y+1)*w+(x-1))*4],data[(y*w+(x-1))*4]];let tr=0;for(let i=0;i<8;i++)if((nb[i]>ctr)!==(nb[(i+1)%8]>ctr))tr++;if(tr<=2)up++;else np++;}
  const ur=up/(up+np+0.001);
  let hfe=0,lfe=0;
  for(let y=0;y<Math.min(h-4,200);y+=4)for(let x=0;x<Math.min(w-4,200);x+=4){let bs=0;for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++)bs+=data[((y+dy)*w+(x+dx))*4];const bm=bs/16;let bv=0;for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++)bv+=Math.pow(data[((y+dy)*w+(x+dx))*4]-bm,2);if(bv<100)lfe++;else hfe++;}
  const sb=lfe/(lfe+hfe+0.001);
  let ce=0,te=0; const es=w*4;
  for(let y=2;y<h-2;y+=2)for(let x=2;x<w-2;x+=2){const idx=(y*w+x)*4;const gx=Math.abs(data[idx+4]-data[idx-4]);const gy=Math.abs(data[idx+es]-data[idx-es]);const mag=Math.sqrt(gx*gx+gy*gy);if(mag>20){te++;const gx2=Math.abs(data[idx+8]-data[idx]);const gy2=Math.abs(data[idx+es*2]-data[idx]);const mag2=Math.sqrt(gx2*gx2+gy2*gy2);if(Math.abs(mag-mag2)<10)ce++;}}
  const ec=te>0?ce/te:0;
  const hR=new Array(256).fill(0),hG=new Array(256).fill(0),hB=new Array(256).fill(0);
  for(let i=0;i<data.length;i+=4){hR[data[i]]++;hG[data[i+1]]++;hB[data[i+2]]++;}
  let eR=0,eG=0,eB=0;
  for(let i=0;i<256;i++){if(hR[i]>0){const p=hR[i]/pc;eR-=p*Math.log2(p);}if(hG[i]>0){const p=hG[i]/pc;eG-=p*Math.log2(p);}if(hB[i]>0){const p=hB[i]/pc;eB-=p*Math.log2(p);}}
  const ae=(eR+eG+eB)/3;
  const bins=new Array(26).fill(0); for(let i=0;i<data.length;i+=4)bins[Math.min(25,Math.floor((data[i]+data[i+1]+data[i+2])/3/10))]++;
  let cl=0; for(let i=0;i<bins.length;i++)if(bins[i]>pc*0.05)cl++; const clS=cl/bins.length;
  let rS=0,gS=0,bS=0; for(let i=0;i<data.length;i+=4){rS+=data[i];gS+=data[i+1];bS+=data[i+2];}
  const aR=rS/pc,aG=gS/pc,aB=bS/pc; let tv=0;
  for(let i=0;i<data.length;i+=4){tv+=Math.pow(data[i]-aR,2)+Math.pow(data[i+1]-aG,2)+Math.pow(data[i+2]-aB,2);}
  tv=tv/(pc*3); let nl=0; for(let i=4;i<data.length-4;i+=4)nl+=Math.abs(data[i]-data[i-4]); nl=nl/pc;
  const cr=fileSize/total; const ar=w/h;
  const mo=[{v:'CASE_4',conf:98,evidence:'Direct',case:'Case 4: Encrypted with UUID',reasoning:['UUID encryption header verified','Resolution matches originally embedded dimensions']}];
  const m5=[{v:'CASE_5',conf:95,evidence:'Direct',case:'Case 5: Encrypted with UUID and Cropped',reasoning:['UUID encryption header verified','Current resolution does not match the originally embedded resolution','Image may have been cropped or resized after encryption']}];
  const metricsObj=buildMetrics(tv,nl,sb,ec,ur,ae,cr,ar,cc);

  // ── CASE 4 & 5: UUID — always reliable regardless of image size ────────────
  if(hasUUID){if(resolutionMismatch)return{caseCode:'CASE_5',internalLabel:'Case 5: Encrypted with UUID and Cropped',displayLabel:'Embedded UUID detected; resolution mismatch',detectedCase:'Case 5: Encrypted with UUID and Cropped',confidence:95,evidenceLevel:'Direct',reasoning:m5[0].reasoning,metrics:metricsObj};return{caseCode:'CASE_4',internalLabel:'Case 4: Encrypted with UUID',displayLabel:'Embedded UUID detected',detectedCase:'Case 4: Encrypted with UUID',confidence:98,evidenceLevel:'Direct',reasoning:mo[0].reasoning,metrics:metricsObj};}

  // ── Small image: heuristics unreliable, skip classification ───────────────
  if(isSmall){
    return{caseCode:'CASE_3',internalLabel:'Case 3: Downloaded from Web',displayLabel:'Image too small for reliable classification',detectedCase:'Case 3: Downloaded from Web',confidence:50,evidenceLevel:'Insufficient',
      reasoning:[
        `Image is very small (${w}x${h} = ${total.toLocaleString()} pixels) — heuristic classification is not reliable at this size`,
        'For accurate analysis, use an image larger than 200x200 pixels',
        'UUID steganography still works correctly at this size if previously embedded',
      ],metrics:metricsObj};
  }
  const mdims=[720,1080,1440,1920,2160,3024,4032],mh=[1280,1920,2560,2880,4032],mas=[0.5625,0.75,1.0,1.333,1.777,2.0,2.165];
  const isMD=mdims.includes(w)||mh.includes(h); const isMA=mas.some(a=>Math.abs(ar-a)<0.05);
  const eval_=(signals)=>{let fs=0,ms=0,sf=0,mf=0; const fl=[];for(const s of signals){ms+=s.weight;if(s.fired){fs+=s.weight;fl.push(s.label);if(s.weight===3)sf++;else if(s.weight===2)mf++;}}const ratio=ms>0?fs/ms:0;const conf=Math.round(50+ratio*35);let ev=sf>=2||(sf>=1&&mf>=2)?'Strong':sf>=1||mf>=3?'Moderate':mf>=1||fs>0?'Weak':'Insufficient';return{ratio,confidence:conf,strongFired:sf,modFired:mf,evidenceLevel:ev,firedLabels:fl};};
  const pen=(wr,sr,c)=>wr-sr<0.10?Math.max(50,c-10):wr-sr<0.20?Math.max(50,c-5):c;
  const aiS=[{fired:sb>0.65,weight:3,label:'Very smooth texture detected'},{fired:ec>0.72,weight:3,label:'Unnaturally coherent edges'},{fired:nl<4,weight:3,label:'Near-zero sensor noise'},{fired:ur>0.65,weight:2,label:'Uniform texture patterns'},{fired:ae<6.5,weight:2,label:'Low color entropy'},{fired:cc>0.87,weight:2,label:'Unnatural RGB channel correlation'},{fired:isPNG,weight:1,label:'PNG format — common AI export'},{fired:w%64===0&&h%64===0,weight:1,label:'Dimensions are multiples of 64'},{fired:clS<0.25,weight:1,label:'Pixel clustering pattern detected'}];
  const mobS=[{fired:nl>15,weight:3,label:'High sensor noise consistent with camera'},{fired:isJPEG&&tv>2500,weight:3,label:'JPEG with high natural pixel variance'},{fired:exifDevice.found===true,weight:3,label:'Camera device identified in EXIF'+(exifDevice.deviceName?' ('+exifDevice.deviceName+')':'')},{fired:ae>7.0,weight:2,label:'High color entropy — rich natural scene'},{fired:ur<0.4,weight:2,label:'Non-uniform texture — natural photography'},{fired:sb<0.3,weight:2,label:'Rough block distribution — photographic'},{fired:isMA,weight:2,label:'Aspect ratio matches common phone format'},{fired:cr>1.3,weight:1,label:'High compression ratio suggests large camera file'},{fired:isMD,weight:1,label:'Dimensions match known phone camera resolution'},{fired:captureTimeData.source==='EXIF',weight:1,label:'Original capture timestamp found in EXIF'},{fired:exifGPSData.found===true,weight:1,label:'GPS coordinates found in EXIF'}];
  const webS=[{fired:cr>0.4&&cr<1.5,weight:2,label:'Compression ratio typical of web-optimised images'},{fired:w%10===0&&h%10===0,weight:2,label:'Rounded dimensions consistent with web-resized content'},{fired:ae>6.5&&ae<7.3,weight:2,label:'Moderate color entropy — typical web-sourced'},{fired:tv>1200&&tv<3500,weight:2,label:'Moderate pixel variance — web-processed content'},{fired:!isMD&&!isMA,weight:1,label:'No common mobile hardware dimensions detected'},{fired:nl>5&&nl<15,weight:1,label:'Noise level in typical web-processing range'},{fired:!exifDevice.found,weight:1,label:'No EXIF device metadata found'}];
  const aiE=eval_(aiS),mobE=eval_(mobS),webE=eval_(webS);
  const wr=Math.max(aiE.ratio,mobE.ratio,webE.ratio);
  const winner=aiE.ratio===wr?'AI':mobE.ratio===wr?'MOBILE':'WEB';
  if(winner==='AI'){const fc=pen(aiE.ratio,Math.max(mobE.ratio,webE.ratio),aiE.confidence);return{caseCode:'CASE_2',internalLabel:'Case 2: AI Generated',displayLabel:'Likely AI-generated',detectedCase:'Case 2: AI Generated',confidence:fc,evidenceLevel:aiE.evidenceLevel,reasoning:aiE.firedLabels,metrics:metricsObj};}
  if(winner==='MOBILE'){const fc=pen(mobE.ratio,Math.max(aiE.ratio,webE.ratio),mobE.confidence);return{caseCode:'CASE_1',internalLabel:'Case 1: Mobile Captured',displayLabel:'Likely mobile-captured',detectedCase:'Case 1: Mobile Captured',confidence:fc,evidenceLevel:mobE.evidenceLevel,reasoning:mobE.firedLabels,metrics:metricsObj};}
  const fc=pen(webE.ratio,Math.max(aiE.ratio,mobE.ratio),webE.confidence);
  return{caseCode:'CASE_3',internalLabel:'Case 3: Downloaded from Web',displayLabel:'Likely web-sourced',detectedCase:'Case 3: Downloaded from Web',confidence:fc,evidenceLevel:webE.evidenceLevel,reasoning:webE.firedLabels.length>0?webE.firedLabels:['No strong mobile or AI indicators detected'],metrics:metricsObj};
};

const saveFileToDevice=async(dataUrl,fileName)=>{
  const isCap=!!(window.Capacitor?.isNativePlatform?.());
  if(!isCap){const a=document.createElement('a');a.href=dataUrl;a.download=fileName;document.body.appendChild(a);a.click();document.body.removeChild(a);return;}
  try{const{Filesystem,Directory}=await import('@capacitor/filesystem');const base64=dataUrl.includes(',')?dataUrl.split(',')[1]:dataUrl;const isPdf=fileName.toLowerCase().endsWith('.pdf');const tmp=`pinit_tmp_${Date.now()}_${fileName}`;await Filesystem.writeFile({path:tmp,data:base64,directory:Directory.Cache});const{uri}=await Filesystem.getUri({path:tmp,directory:Directory.Cache});if(isPdf){try{await Filesystem.writeFile({path:`PINIT/${fileName}`,data:base64,directory:Directory.Documents,recursive:true});alert('✅ Report saved to Documents/PINIT folder!');}catch{const{Share}=await import('@capacitor/share');await Share.share({title:fileName,url:uri,dialogTitle:'Save your report'});}}else{try{const{Media}=await import('@capacitor-community/media');await Media.savePhoto({path:uri});alert('✅ Image saved to your Gallery!');}catch{try{await Filesystem.writeFile({path:`Pictures/PINIT/${fileName}`,data:base64,directory:Directory.ExternalStorage,recursive:true});alert('✅ Image saved to Pictures/PINIT folder!');}catch{await Filesystem.writeFile({path:`PINIT/${fileName}`,data:base64,directory:Directory.Documents,recursive:true});alert('✅ Image saved to Documents/PINIT folder!');}}}Filesystem.deleteFile({path:tmp,directory:Directory.Cache}).catch(()=>{});}catch(err){if(String(err).toLowerCase().includes('cancel'))return;alert('Could not save: '+(err.message||'Unknown error'));}
};

// ═════════════════════════════════════════════════════════════════════════════
// DRAFT UTILITIES — IndexedDB-backed (no 5 MB localStorage quota limit)
// ═════════════════════════════════════════════════════════════════════════════

const IDB_NAME  = 'pinit_drafts_db';
const IDB_STORE = 'drafts';

const _openDraftDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(IDB_NAME, 1);
  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains(IDB_STORE))
      db.createObjectStore(IDB_STORE, { keyPath: 'id' });
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror   = () => reject(req.error);
});

const idbGetAllDrafts = async () => {
  try {
    const db  = await _openDraftDB();
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAll();
    return new Promise((res, rej) => {
      req.onsuccess = () => res((req.result || []).sort((a, b) => (b.timestamp||0)-(a.timestamp||0)));
      req.onerror   = () => rej(req.error);
    });
  } catch { return []; }
};

const idbPutDraft = async (draft) => {
  const db    = await _openDraftDB();
  const tx    = db.transaction(IDB_STORE, 'readwrite');
  const store = tx.objectStore(IDB_STORE);
  return new Promise((res, rej) => {
    const all = store.getAll();
    all.onsuccess = () => {
      const sorted = (all.result||[]).sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
      if (sorted.length >= 10) store.delete(sorted[sorted.length-1].id);
      const put = store.put(draft);
      put.onsuccess = () => res();
      put.onerror   = () => rej(put.error);
    };
    all.onerror = () => rej(all.error);
  });
};

const idbRemoveDraft = async (id) => {
  try {
    const db  = await _openDraftDB();
    const req = db.transaction(IDB_STORE,'readwrite').objectStore(IDB_STORE).delete(id);
    return new Promise((res,rej)=>{ req.onsuccess=res; req.onerror=()=>rej(req.error); });
  } catch { /* non-critical */ }
};

// Small JPEG for card display only — fileBase64 (full PNG with UUID) never compressed
const _compressThumb = (dataUrl, maxPx=240) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const s = Math.min(1, maxPx / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width*s); c.height = Math.round(img.height*s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    resolve(c.toDataURL('image/jpeg', 0.6));
  };
  img.onerror = () => resolve(dataUrl);
  img.src = dataUrl;
});

const draftTimeAgo = (ts) => {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
};

// ═════════════════════════════════════════════════════════════════════════════
// STEP COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

// ─── Step 1: Input ────────────────────────────────────────────────────────────
// MODIFIED: Added drafts section (card UI, always visible when drafts exist)
const InputStep = ({
  onFileSelected, onCapture, cameraActive,
  videoRef, canvasRef, onCapturePhoto, onStopCamera, onSwitchCamera,
  canSwitch, facingMode,
  drafts, onLoadDraft, onDeleteDraft,
}) => (
  <div className="step-screen">
    <div className="step-hero">
      <div className="step-hero__icon"><Camera size={32} /></div>
      <h1 className="step-hero__title">Analyze Proof</h1>
      <p className="step-hero__sub">Capture or upload proofs to verify its authenticity and ownership</p>
    </div>

    {!cameraActive ? (
      <>
        <div className="input-choices">
          {/* Capture — registration-first */}
          <button className="choice-btn choice-btn--primary" onClick={onCapture}>
            <div className="choice-btn__ico"><Camera size={28} /></div>
            <div className="choice-btn__body">
              <p className="choice-btn__title">Capture Image</p>
              <p className="choice-btn__hint">Use your camera — auto-embeds your PINIT identity</p>
            </div>
            <ChevronRight size={18} className="choice-btn__arr" />
          </button>

          {/* Upload — verification-first */}
          <label className="choice-btn choice-btn--secondary">
            <div className="choice-btn__ico choice-btn__ico--sec"><Upload size={28} /></div>
            <div className="choice-btn__body">
              <p className="choice-btn__title">Upload Proof</p>
              <p className="choice-btn__hint">Analyze & verify ownership of any image</p>
            </div>
            <ChevronRight size={18} className="choice-btn__arr" />
            <input type="file" accept="image/*" className="hidden-input"
              onChange={(e) => e.target.files[0] && onFileSelected(e.target.files[0])} />
          </label>

          {/* APK gallery picker */}
          {!!(window.Capacitor?.isNativePlatform?.()) && (
            <button className="choice-btn choice-btn--gallery" onClick={async () => {
              try {
                const { Camera: Cap, CameraResultType, CameraSource } = await import('@capacitor/camera');
                const photo = await Cap.getPhoto({ quality: 100, allowEditing: false, resultType: CameraResultType.DataUrl, source: CameraSource.Photos });
                if (photo.dataUrl) {
                  const res = await fetch(photo.dataUrl);
                  const blob = await res.blob();
                  onFileSelected(new File([blob], 'gallery-image.png', { type: blob.type || 'image/png' }));
                }
              } catch (err) { if (!String(err).includes('cancelled') && !String(err).includes('AbortError')) alert('Could not open gallery: ' + err.message); }
            }}>
              <div className="choice-btn__ico choice-btn__ico--gallery"><ImageIcon size={28} /></div>
              <div className="choice-btn__body">
                <p className="choice-btn__title">Pick from Gallery</p>
                <p className="choice-btn__hint">Choose an existing image from your device</p>
              </div>
              <ChevronRight size={18} className="choice-btn__arr" />
            </button>
          )}
        </div>

        {/* ── Drafts section — always visible when drafts exist ────────────── */}
        {drafts.length > 0 && (
          <div className="drafts-section">
            <div className="drafts-header">
              <FileText size={15} className="drafts-header__ico" />
              <span className="drafts-header__title">Saved Drafts</span>
              <span className="drafts-header__count">{drafts.length}</span>
            </div>
            <div className="drafts-list">
              {drafts.map(draft => (
                <div key={draft.id} className="draft-card">
                  <div className="draft-card__thumb">
                    {draft.preview
                      ? <img src={draft.preview} alt="" className="draft-card__img" />
                      : <div className="draft-card__ph"><ImageIcon size={20} /></div>}
                    {draft.isEmbedded && (
                      <div className="draft-card__badge">
                        <Shield size={9} /> UUID
                      </div>
                    )}
                  </div>
                  <div className="draft-card__info">
                    <p className="draft-card__name">{draft.fileName || 'Captured image'}</p>
                    <p className="draft-card__meta">
                      <span className={`draft-card__source draft-card__source--${draft.source === 'Camera' ? 'cam' : 'up'}`}>
                        {draft.source === 'Camera' ? '📷 Camera' : '📁 Upload'}
                      </span>
                      <span className="draft-card__time">{draftTimeAgo(draft.timestamp)}</span>
                    </p>
                  </div>
                  <div className="draft-card__acts">
                    <button className="draft-card__open" onClick={() => onLoadDraft(draft)}>Open</button>
                    <button className="draft-card__del" onClick={() => onDeleteDraft(draft.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    ) : (
      <div className="camera-view">
        <video ref={videoRef} autoPlay playsInline muted className="camera-feed" />
        <div className="camera-controls">
          {canSwitch && (
            <button className="cam-btn cam-btn--switch" onClick={onSwitchCamera}>🔄</button>
          )}
          <button className="cam-btn cam-btn--capture" onClick={onCapturePhoto}>
            <div className="cam-btn__ring" />
          </button>
          <button className="cam-btn cam-btn--close" onClick={onStopCamera}>✕</button>
        </div>
        <div className="camera-badge">{facingMode === 'environment' ? '📷 Back' : '🤳 Front'}</div>
      </div>
    )}
    <canvas ref={canvasRef} className="hidden-canvas" />
  </div>
);

// ─── NEW: Embedding Step (Capture flow — auto UUID embed with messages) ────────
const EmbeddingStep = ({ preview, phase }) => {
  const phases = [
    { icon: '🔐', text: 'Embedding your PINIT UUID' },
    { icon: '⚡', text: 'Preparing your image' },
    { icon: '✨', text: 'Almost done…' },
  ];
  const current = phases[Math.min(phase, phases.length - 1)];

  return (
    <div className="step-screen step-screen--center">
      {preview && (
        <div className="embedding-preview">
          <img src={preview} alt="" className="embedding-preview__img" />
          <div className="embedding-preview__overlay">
            <div className="scan-line" />
            <div className="embedding-grid" />
          </div>
        </div>
      )}
      <div className="embedding-status">
        <div className="processing-orb">
          <div className="processing-orb__pulse" />
          <div className="processing-orb__inner"><Shield size={28} /></div>
        </div>
        <h2 className="embedding-phase-icon">{current.icon}</h2>
        <p className="embedding-phase-text">{current.text}</p>
        <div className="embedding-dots">
          <span /><span /><span />
        </div>
        <div className="embedding-phase-track">
          {phases.map((p, i) => (
            <div key={i} className={`embedding-phase-pip ${i <= phase ? 'embedding-phase-pip--on' : ''}`} />
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── NEW: Post-Capture Step ───────────────────────────────────────────────────
// Shown after UUID is embedded in camera capture. User decides: Analyze | Draft | Discard
const PostCaptureStep = ({ preview, onAnalyze, onSaveDraft, onDiscard }) => (
  <div className="step-screen">
    <div className="post-capture-preview">
      {preview && <img src={preview} alt="Captured" className="post-capture-preview__img" />}
      <div className="post-capture-badge">
        <CheckCircle size={13} /> UUID Embedded
      </div>
    </div>

    <div className="post-capture-info">
      <div className="post-capture-info__ico">
        <Shield size={22} />
      </div>
      <h2 className="post-capture-info__title">Image Ready</h2>
      <p className="post-capture-info__sub">
        Your PINIT UUID has been embedded invisibly into this image. What would you like to do next?
      </p>
    </div>

    <div className="post-capture-actions">
      <button className="action-btn action-btn--primary" onClick={onAnalyze}>
        <Shield size={16} /> Analyze Now
      </button>
      <button className="action-btn action-btn--draft" onClick={onSaveDraft}>
        <Download size={16} /> Save as Draft
      </button>
      <button className="action-btn action-btn--discard" onClick={onDiscard}>
        <Trash2 size={16} /> Discard
      </button>
    </div>
  </div>
);

// ─── NEW: Exit Modal (shown when user taps back from post_capture) ─────────────
const ExitModal = ({ onSaveDraft, onDiscard, onCancel }) => (
  <div className="exit-modal-overlay" onClick={onCancel}>
    <div className="exit-modal" onClick={e => e.stopPropagation()}>
      <div className="exit-modal__handle" />
      <div className="exit-modal__icon">⚠️</div>
      <h2 className="exit-modal__title">Leave without saving?</h2>
      <p className="exit-modal__sub">
        Your captured image has a PINIT UUID embedded. Discarding will permanently delete it.
      </p>
      <div className="exit-modal__actions">
        <button className="action-btn action-btn--draft" onClick={onSaveDraft}>
          <Download size={16} /> Save as Draft
        </button>
        <button className="action-btn action-btn--discard" onClick={onDiscard}>
          <Trash2 size={16} /> Discard
        </button>
        <button className="action-btn action-btn--cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  </div>
);

// ─── Step: Checking (Upload — silent UUID extraction) ─────────────────────────
const CheckingStep = ({ preview }) => (
  <div className="step-screen step-screen--center">
    {preview && (
      <div className="checking-preview">
        <img src={preview} alt="" className="checking-preview__img" />
        <div className="checking-preview__overlay">
          <div className="scan-line" />
        </div>
      </div>
    )}
    <div className="checking-status">
      <div className="checking-spinner">
        <div className="checking-spinner__ring" />
        <Shield size={22} className="checking-spinner__icon" />
      </div>
      <h2 className="checking-status__title">Verifying image…</h2>
      <p className="checking-status__sub">Scanning for ownership markers</p>
    </div>
    <div className="checking-steps">
      {['Reading image data', 'Scanning for ownership markers', 'Checking PINIT registry'].map((s, i) => (
        <div key={i} className="checking-step" style={{ animationDelay: `${i * 0.4}s` }}>
          <div className="checking-step__dot" />
          <span>{s}</span>
        </div>
      ))}
    </div>
  </div>
);

// ─── Step: Processing ─────────────────────────────────────────────────────────
// MODIFIED: Updated step labels
const ProcessingStep = ({ steps, currentStep }) => {
  const labels = [
    { id: 'identity',    icon: '🔍', label: 'Checking image identity'       },
    { id: 'ownership',   icon: '🛡️', label: 'Verifying ownership'            },
    { id: 'registering', icon: '📌', label: 'Registering with PINIT'         },
    { id: 'analyzing',   icon: '🧠', label: 'Analyzing image characteristics' },
    { id: 'finalizing',  icon: '✅', label: 'Preparing your results'         },
  ];
  return (
    <div className="step-screen step-screen--center">
      <div className="processing-orb">
        <div className="processing-orb__pulse" />
        <div className="processing-orb__inner"><Shield size={28} /></div>
      </div>
      <h2 className="processing-title">Analyzing image…</h2>
      <p className="processing-sub">Please wait while PINIT processes your image</p>
      <div className="processing-steps">
        {labels.filter(l => steps.includes(l.id)).map((s) => {
          const isDone   = steps.indexOf(s.id) < steps.indexOf(currentStep);
          const isActive = s.id === currentStep;
          return (
            <div key={s.id} className={`proc-step ${isDone ? 'proc-step--done' : ''} ${isActive ? 'proc-step--active' : ''}`}>
              <div className="proc-step__ico">
                {isDone ? <CheckCircle size={16} /> : <span>{s.icon}</span>}
              </div>
              <span className="proc-step__label">{s.label}</span>
              {isActive && <div className="proc-step__spinner" />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Step: Result ─────────────────────────────────────────────────────────────
const ResultStep = ({
  report, preview, encryptedImage,
  onSaveVault, onProtectWithPINIT, onSaveDraftFromResult,
  onDownloadReport, onReset,
  savingVault, vaultSaved,
  onGoToVault,
}) => {
  const ownerCase         = report.ownerCase;
  const isNewlyRegistered = report.ownershipInfo === 'Newly registered';
  const hasUUID           = report.ownershipInfo === 'Embedded UUID detected' || isNewlyRegistered;
  const conf              = report.confidence || 0;
  const confLabel         = conf >= 85 ? 'High' : conf >= 65 ? 'Medium' : 'Low';
  const confClass         = conf >= 85 ? 'high' : conf >= 65 ? 'med' : 'low';
  const displayImg        = encryptedImage || preview;

  const statusLabel = isNewlyRegistered ? 'Registered' : hasUUID ? 'Verified' : ownerCase === 'NO_UUID' ? 'Unregistered' : 'Analyzed';
  const statusClass = isNewlyRegistered || hasUUID ? 'verified' : 'unregistered';

  const fmt = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // ── Human-friendly device label ────────────────────────────────────────────
  const friendlyDevice = (raw) => {
    if (!raw || raw === '—' || raw === 'Unknown') return '—';
    const r = raw.toLowerCase();
    if (r.includes('iphone'))                        return 'iPhone';
    if (r.includes('ipad'))                          return 'iPad';
    if (r.includes('android'))                       return 'Android device';
    if (r.includes('windows nt'))                    return 'Windows device';
    if (r.includes('macintosh') || r.includes('mac os')) return 'Mac device';
    if (r.includes('linux'))                         return 'Linux device';
    // EXIF device names are short and don't contain semicolons
    if (raw.length < 32 && !raw.includes(';'))       return raw;
    return 'Unknown device';
  };

  // ── FIX: CASE_4 only means "UUID found, no resolution mismatch" — it does NOT mean
  // "no rotation". Make the summary text reflect rotation when detected.
  const changeMap = {
    'CASE_4': report.rotationDetected > 0
      ? 'UUID verified — rotation detected'
      : 'Exact match — no modifications detected',
    'CASE_5': 'Resolution mismatch — image may have been cropped or resized',
    'CASE_1': 'Original mobile capture — authentic image',
    'CASE_2': 'AI-generated content detected',
    'CASE_3': 'Web-sourced or downloaded image',
  };

  // ── Key insight — human-friendly sentence per case ─────────────────────────
  const ownerCaseMeta = {
    OWN_CLEAN:      { color: 'green', icon: '✅', label: 'Your Image — Unmodified',
                      sub: 'This image is linked to your PINIT account and no changes were detected.' },
    OWN_MODIFIED:   { color: 'gold',  icon: '⚠️', label: 'Your Image — Modified',
                      sub: 'This image is yours, but it has been changed since it was first registered.' },
    OTHER_CLEAN:    { color: 'blue',  icon: '🔵', label: 'Belongs to Another User',
                      sub: 'This image is registered to a different PINIT account. No changes detected.' },
    OTHER_MODIFIED: { color: 'red',   icon: '🔴', label: 'Another User\'s Image — Modified',
                      sub: 'This image belongs to another account and has been changed after registration.' },
    NO_UUID:        { color: 'none',  icon: 'ℹ️', label: 'No Ownership Proof Found',
                      sub: 'This image has not been registered with PINIT. Protect it now to claim ownership.' },
  };
  const meta = ownerCaseMeta[ownerCase] || ownerCaseMeta['NO_UUID'];

  // ── newly registered key insight ───────────────────────────────────────────
  const newlyRegisteredMeta = {
    color: 'green', icon: '🔐',
    label: 'Image Registered',
    sub: 'Your PINIT identity has been embedded. Save this image to your Vault to complete registration.',
  };
  const insightMeta = isNewlyRegistered ? newlyRegisteredMeta : meta;

  // ── Action block — strictly driven by ownerCase ────────────────────────────
  const renderActions = () => {
    if (isNewlyRegistered) {
      return (
        <div className="result-actions">
          <button
            className={`action-btn action-btn--primary ${vaultSaved ? 'action-btn--done' : ''}`}
            onClick={onSaveVault}
            disabled={savingVault || vaultSaved}
          >
            {savingVault
              ? <><div className="btn-spinner" /> Saving…</>
              : vaultSaved
                ? '✅ Saved to Vault'
                : <><ImageIcon size={16} /> Save to Vault</>}
          </button>
          <button className="action-btn action-btn--again" onClick={onReset}>
            <RefreshCw size={15} /> Analyze Another
          </button>
        </div>
      );
    }

    if (ownerCase === 'OWN_CLEAN') {
      return (
        <div className="result-actions">
          <button
            className="action-btn action-btn--primary"
            onClick={() => onGoToVault?.(report.vaultAssetId || report.assetId)}
          >
            <Eye size={16} /> View in Vault
          </button>
          <button className="action-btn action-btn--again" onClick={onReset}>
            <RefreshCw size={15} /> Analyze Another
          </button>
        </div>
      );
    }

    if (ownerCase === 'OWN_MODIFIED') {
      return (
        <div className="result-actions">
          <button
            className="action-btn action-btn--primary"
            onClick={() => onGoToVault?.(report.vaultAssetId || report.assetId)}
          >
            <Eye size={16} /> View Original in Vault
          </button>
          <button className="action-btn action-btn--again" onClick={onReset}>
            <RefreshCw size={15} /> Analyze Another
          </button>
        </div>
      );
    }

    if (ownerCase === 'OTHER_CLEAN' || ownerCase === 'OTHER_MODIFIED') {
      return (
        <div className="result-actions">
          <div className="result-readonly-notice">
            🔒 This image belongs to another PINIT user. No actions available.
          </div>
          <button className="action-btn action-btn--again" onClick={onReset}>
            <RefreshCw size={15} /> Analyze Another
          </button>
        </div>
      );
    }

    if (ownerCase === 'NO_UUID') {
      return (
        <div className="result-actions">
          <button className="action-btn action-btn--primary" onClick={onProtectWithPINIT}>
            <Shield size={16} /> Protect with PINIT
          </button>
          <button className="action-btn action-btn--draft" onClick={onSaveDraftFromResult}>
            <Download size={16} /> Save as Draft
          </button>
          <button className="action-btn action-btn--discard" onClick={onReset}>
            <Trash2 size={16} /> Discard
          </button>
        </div>
      );
    }

    return (
      <div className="result-actions">
        <button className="action-btn action-btn--again" onClick={onReset}>
          <RefreshCw size={15} /> Analyze Another
        </button>
      </div>
    );
  };

  return (
    <div className="step-screen">

      {/* 1. Image preview */}
      {displayImg && (
        <div className="result-preview">
          <img src={displayImg} alt="Analyzed" />
          <div className={`result-status-badge ${statusClass}`}>
            {hasUUID ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
            {statusLabel}
          </div>
        </div>
      )}

      {/* 2. Key Insight — prominent human-friendly sentence */}
      <div className={`owner-case-banner owner-case-banner--${insightMeta.color}`}>
        <span className="owner-case-banner__icon">{insightMeta.icon}</span>
        <div className="owner-case-banner__body">
          <p className="owner-case-banner__label">{insightMeta.label}</p>
          <p className="owner-case-banner__sub">{insightMeta.sub}</p>
        </div>
      </div>

      {/* 3. Confidence + detection type */}
      <div className="result-summary-row">
        <div className="result-conf">
          <div className="result-conf__circle">
            <svg viewBox="0 0 36 36" className="result-conf__svg">
              <circle className="result-conf__bg" cx="18" cy="18" r="15.9" />
              <circle className={`result-conf__fill ${confClass}`} cx="18" cy="18" r="15.9"
                strokeDasharray={`${conf} ${100 - conf}`} strokeDashoffset="25" />
            </svg>
            <span className="result-conf__val">{conf}%</span>
          </div>
          <span className={`result-conf__label ${confClass}`}>{confLabel} Confidence</span>
        </div>
        <div className="result-type">
          <p className="result-type__case">{report.displayLabel || report.detectedCase}</p>
          <p className="result-type__evidence">{report.evidenceLevel} evidence</p>
        </div>
      </div>

      {/* 4. Ownership — simplified, no technical rows */}
      <div className="res-card">
        <h3 className="res-card__title">🛡️ Ownership</h3>
        <div className="res-row">
          <span className="res-row__lbl">Registration</span>
          <span className={`res-row__val ${hasUUID ? 'res-row__val--good' : 'res-row__val--none'}`}>
            {isNewlyRegistered ? 'Newly registered'
              : hasUUID        ? 'Registered with PINIT'
              :                  'Not registered'}
          </span>
        </div>
        <div className="res-row">
          <span className="res-row__lbl">Owner</span>
          <span className="res-row__val">
            {ownerCase === 'OWN_CLEAN' || ownerCase === 'OWN_MODIFIED' ? 'You'
              : ownerCase === 'OTHER_CLEAN' || ownerCase === 'OTHER_MODIFIED' ? 'Another PINIT user'
              : isNewlyRegistered ? 'You (just registered)'
              : 'Unknown'}
          </span>
        </div>
        {report.gpsLocation?.available ? (
          <div className="res-row">
            <span className="res-row__lbl">Capture location</span>
            <a href={report.gpsLocation.mapsUrl} target="_blank" rel="noopener noreferrer"
               className="res-row__link">
              Available — view map
            </a>
          </div>
        ) : (
          <div className="res-row">
            <span className="res-row__lbl">Capture location</span>
            <span className="res-row__val res-row__val--none">Not available</span>
          </div>
        )}
      </div>

      {/* 5. Image Details — simplified, human-friendly labels */}
      <div className="res-card">
        <h3 className="res-card__title">📋 Image Details</h3>
        {[
          ['File name',     report.fileName || report.assetId || '—'],
          ['File type',     report.fileType  || '—'],
          ['File size',     report.assetFileSize || report.uploadedSize || '—'],
          ['Resolution',    report.assetResolution || '—'],
          ['Captured on',   report.timestamp ? fmt(report.timestamp) : '—'],
          ['Captured with', friendlyDevice(report.deviceName)],
        ].map(([l, v]) => (
          <div key={l} className="res-row">
            <span className="res-row__lbl">{l}</span>
            <span className="res-row__val">{v}</span>
          </div>
        ))}
        {/* Small image warning */}
        {(() => {
          const res = report.assetResolution || report.uploadedResolution || '';
          const [rw, rh] = res.split('x').map(Number);
          return (rw > 0 && rh > 0 && rw * rh < 40000) ? (
            <div className="res-small-warn">
              ⚠️ Very small image ({rw}×{rh}px) — heuristic classification may be inaccurate.
              UUID steganography still works correctly at this size.
            </div>
          ) : null;
        })()}
      </div>

      {/* 6. Change Summary — with full modification banners */}
      <div className="res-card">
        <h3 className="res-card__title">🔄 Change Summary</h3>
        <p className="res-card__summary">{changeMap[report.caseCode] || report.detectedCase}</p>

        {/* Rotation detected banner */}
        {report.rotationDetected !== null && report.rotationDetected !== undefined && report.rotationDetected !== 0 && (
          <div className="res-modification-banner res-modification-banner--rotation">
            <span className="res-modification-banner__icon">🔄</span>
            <div className="res-modification-banner__body">
              <p className="res-modification-banner__title">Rotation Detected</p>
              <p className="res-modification-banner__sub">{report.rotationMessage}</p>
              <p className="res-modification-banner__note">
                The encrypted data was successfully recovered despite rotation.
              </p>
            </div>
          </div>
        )}

        {/* Crop detected banner */}
        {report.cropInfo?.isCropped && (
          <div className="res-modification-banner res-modification-banner--crop">
            <span className="res-modification-banner__icon">✂️</span>
            <div className="res-modification-banner__body">
              <p className="res-modification-banner__title">Crop Detected</p>
              <p className="res-modification-banner__sub">
                {report.cropInfo.originalResolution} → {report.cropInfo.currentResolution}
              </p>
              <p className="res-modification-banner__note">
                {report.cropInfo.remainingPercentage} of original pixels remain.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 7. Integrity status — simplified, replaces verbose PINIT Summary card */}
      {report.integrityStatus && (
        <div className={`res-integrity ${
          report.integrityStatus === 'Protected'                     ? 'protected'
          : report.integrityStatus === 'Possible modification detected' ? 'modified'
          : 'none'
        }`}>
          {report.integrityStatus === 'Protected'
            ? '✅ No changes detected since registration'
            : report.integrityStatus === 'Possible modification detected'
              ? '⚠️ Changes detected after registration'
              : 'ℹ️ Image not registered with PINIT'}
        </div>
      )}

      {/* 8. Actions */}
      {renderActions()}
    </div>
  );
};

// ─── Certificate View ─────────────────────────────────────────────────────────
// KEPT IN CODE — will be used in Vault feature later. NOT rendered in result flow.
const CertificateView = ({ report, preview, onShare, onDownload, onBack }) => {
  const certId  = report.authorshipCertificateId || 'CERT-' + Date.now().toString(36).toUpperCase();
  const conf    = report.confidence || 0;
  const hasUUID = report.ownershipInfo === 'Embedded UUID detected' || report.ownershipInfo === 'Newly registered';
  const isModified = report.integrityStatus === 'Possible modification detected' || report.cropInfo?.isCropped;

  const fmt = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—'
      : dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const ownerDisplay = report.ownerName
    || (report.uniqueUserId ? report.uniqueUserId.slice(0, 18) + '…' : '—');

  return (
    <div className="step-screen">
      <div className="cert-doc">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="cert-doc__header">
          <div className="cert-doc__gem">
            <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
              <path d="M18 4L32 12V24L18 32L4 24V12L18 4Z" stroke="white" strokeWidth="2.5" fill="none"/>
              <circle cx="18" cy="18" r="4" fill="white"/>
            </svg>
          </div>
          <div>
            <p className="cert-doc__brand">PINIT</p>
            <p className="cert-doc__label">Certificate of Verification</p>
          </div>
          {/* Verified chip */}
          <div className="cert-verified-chip">
            <CheckCircle size={12} /> Verified
          </div>
        </div>

        {/* ── Confidence — simple text row, not a dashboard widget ──────── */}
        <div className="cert-doc__ids">
          <div className="cert-doc__id-row">
            <span className="cert-doc__id-label">Confidence</span>
            <span className={`cert-doc__id-val cert-conf-badge cert-conf-badge--${conf >= 85 ? 'high' : conf >= 65 ? 'med' : 'low'}`}>
              {conf}%
            </span>
          </div>
        </div>

        {/* ── Image snapshot ─────────────────────────────────────────────── */}
        {preview && (
          <div className="cert-section" style={{ paddingBottom: 0 }}>
            <h3 className="cert-section__title">Image</h3>
            <div className="cert-img-wrap">
              <img src={preview} alt="Certified" className="cert-img" />
            </div>
          </div>
        )}

        {/* ── Certificate fields ─────────────────────────────────────────── */}
        <div className="cert-section">
          <h3 className="cert-section__title">Certificate Details</h3>
          {[
            ['Certificate ID', certId.length > 24 ? certId.slice(0, 24) + '…' : certId],
            ['Asset ID',       report.assetId || '—'],
            ['Owner',          ownerDisplay],
            ['Status',         hasUUID ? 'Verified & Registered' : 'Analyzed — Not Registered'],
            ['Issued on',      fmt(Date.now())],
          ].map(([l, v]) => (
            <div key={l} className="cert-row">
              <span className="cert-row__lbl">{l}</span>
              <span className="cert-row__val">{v}</span>
            </div>
          ))}
        </div>

        {/* ── Integrity statement ────────────────────────────────────────── */}
        <div className={`cert-integrity ${isModified ? 'modified' : 'clean'}`}>
          {isModified
            ? '⚠️ Ownership verified, but changes were detected after registration'
            : '✅ No changes detected since registration'}
        </div>

        {/* ── Provenance statement ───────────────────────────────────────── */}
        <div className="cert-provenance">
          <p className="cert-provenance__text">
            This certificate confirms that the above image is registered in PINIT and linked
            to the verified owner account. It serves as a digital proof of ownership at the
            time of registration.
          </p>
        </div>

        {/* ── Seal ──────────────────────────────────────────────────────── */}
        <div className="cert-seal">
          <div className="cert-seal__ring"><Shield size={20} /></div>
          <p className="cert-seal__text">PINIT Verified</p>
        </div>

      </div>

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div className="result-actions" style={{ marginTop: 16 }}>
        <button className="action-btn action-btn--primary" onClick={onShare}>
          <Share2 size={16} /> Share Certificate
        </button>
        <button className="action-btn action-btn--report" onClick={onDownload}>
          <Download size={15} /> Download Certificate
        </button>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN CONTROLLER
// ═════════════════════════════════════════════════════════════════════════════

function Analyze({ user, onLogout, onGoToVault, onBack }) {
  const navigate = useNavigate(); // still needed for /login redirect when !user
  const userId   = localStorage.getItem('userUUID') || user?.id || '';

  // ── Step machine ──────────────────────────────────────────────────────────
  // Steps: input → [embedding → post_capture] (capture) | [checking → processing] (upload) → result
  // Removed: deciding, certificate
  const [step,           setStep]          = useState('input');
  const [selectedFile,   setSelectedFile]  = useState(null);
  const [preview,        setPreview]       = useState(null);
  const [captureSource,  setCaptureSource] = useState('Upload');
  const [uuidResult,     setUuidResult]    = useState(null);
  const [encryptedImage, setEncryptedImage]= useState(null);
  const [encryptedFile,  setEncryptedFile] = useState(null);
  const [report,         setReport]        = useState(null);
  const [processingSteps,setProcSteps]     = useState([]);
  const [currentProcStep,setCurProcStep]   = useState('');
  const [savingVault,    setSavingVault]   = useState(false);
  const [vaultSaved,     setVaultSaved]    = useState(false);

  // ── New state ─────────────────────────────────────────────────────────────
  const [ownerCase,        setOwnerCase]        = useState(null);      // OWN_CLEAN | OWN_MODIFIED | OTHER_CLEAN | OTHER_MODIFIED | NO_UUID
  const [drafts,           setDrafts]           = useState([]);        // loaded from IndexedDB via useEffect
  const [showExitModal,    setShowExitModal]    = useState(false);     // post_capture exit confirmation
  const [embeddingPhase,   setEmbeddingPhase]   = useState(0);         // 0=embedding, 1=preparing, 2=almost done
  const [captureMetadata,  setCaptureMetadata]  = useState(null);      // stored from embedding step for analyze-on-demand

  // ── Camera state ──────────────────────────────────────────────────────────
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode,   setFacingMode]   = useState('environment');
  const [canSwitch,    setCanSwitch]    = useState(false);
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => { if (!user) navigate('/login'); }, [user, navigate]);

  // Load drafts from IndexedDB on mount
  useEffect(() => { idbGetAllDrafts().then(setDrafts).catch(() => setDrafts([])); }, []);

  // ── Draft management (IndexedDB) ─────────────────────────────────────────
  const refreshDrafts = () => idbGetAllDrafts().then(setDrafts).catch(() => {});

  const saveDraft = async (overridePreview, overrideFile, isEmbedded, source, fileName) => {
    try {
      const thumb = await _compressThumb(overridePreview || preview, 240);
      await idbPutDraft({
        id        : Date.now(),
        preview   : thumb,                                      // small JPEG — display only
        fileBase64: overrideFile || encryptedImage || preview,  // full PNG  — UUID intact
        fileName  : fileName || selectedFile?.name || 'capture.png',
        source    : source   || captureSource,
        isEmbedded: isEmbedded ?? !!encryptedImage,
        timestamp : Date.now(),
      });
      refreshDrafts();
      return true;
    } catch (err) {
      console.error('saveDraft failed:', err);
      alert('Could not save draft. Please try again.');
      return false;
    }
  };

  const handleSaveDraftFromCapture = async () => {
    const ok = await saveDraft(encryptedImage||preview, encryptedImage||preview, !!encryptedImage, captureSource);
    if (ok) handleReset();
  };

  const handleSaveDraftFromResult = async () => {
    const ok = await saveDraft(preview, preview, false, captureSource);
    if (ok) handleReset();
  };

  const handleDeleteDraft = async (id) => {
    await idbRemoveDraft(id);
    refreshDrafts();
  };

  const handleLoadDraft = async (draft) => {
    setPreview(draft.fileBase64);
    setCaptureSource(draft.source);
    setEncryptedImage(draft.isEmbedded ? draft.fileBase64 : null);
    setReport(null); setVaultSaved(false); setOwnerCase(null);

    // Reconstruct File from base64 so analysis pipeline has something to work with
    try {
      const res  = await fetch(draft.fileBase64);
      const blob = await res.blob();
      const file = new File([blob], draft.fileName, { type: blob.type || 'image/png' });
      setSelectedFile(file);
      if (draft.isEmbedded) setEncryptedFile(file);
    } catch { /* non-critical */ }

    setStep('post_capture');
  };

  // ── CAPTURE FLOW: step 1 — embed UUID automatically ───────────────────────
  const startCaptureEmbedding = async (file, previewUrl) => {
    setStep('embedding');
    setEmbeddingPhase(0);

    const t1 = setTimeout(() => setEmbeddingPhase(1), 1400);
    const t2 = setTimeout(() => setEmbeddingPhase(2), 2800);

    try {
      const [gpsData, ipAddress, captureTimeData] = await Promise.all([
        getGPSLocation(), getPublicIP(), getCaptureTime(file)
      ]);

      const currentDeviceId   = getDeviceFingerprint();
      const currentDeviceName = getCurrentDeviceName();
      const deviceInfo = { deviceId: currentDeviceId, deviceName: currentDeviceName, source: 'App Camera' };
      const gps = gpsData.available ? { ...gpsData, source: 'App Camera' } : { available: false };

      const img    = await loadImage(previewUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const imageData     = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const embeddedData  = embedUUIDAdvanced(
        imageData, userId,
        { available: gps.available, latitude: gps.latitude, longitude: gps.longitude },
        deviceInfo, ipAddress, captureTimeData.timestamp,
        deviceInfo.source, 'App Camera', gps.source,
        canvas.width, canvas.height
      );
      ctx.putImageData(embeddedData, 0, 0);

      const blob         = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const embeddedB64  = await blobToBase64(blob);
      const embeddedFile = new File([blob], `pinit_${Date.now()}.png`, { type: 'image/png' });

      clearTimeout(t1); clearTimeout(t2);
      setEmbeddingPhase(2);
      await new Promise(r => setTimeout(r, 700)); // linger on "Almost done…"

      setEncryptedImage(embeddedB64);
      setEncryptedFile(embeddedFile);

      // Store metadata so Analyze button can pass it without re-embedding
      setCaptureMetadata({
        uuidResult: {
          found: true, userId, gps,
          timestamp:         captureTimeData.timestamp,
          deviceId:          deviceInfo.deviceId,
          deviceName:        deviceInfo.deviceName,
          deviceSource:      deviceInfo.source,
          ipAddress,
          ipSource:          'App Camera',
          originalResolution:`${canvas.width}x${canvas.height}`,
        },
        gpsData:       gps,
        captureTimeData,
        deviceInfo,
        ipAddress,
      });

      setStep('post_capture');
    } catch (err) {
      console.error('Embedding failed:', err);
      clearTimeout(t1); clearTimeout(t2);
      // Still go to post_capture — user can try to analyze the original
      setStep('post_capture');
    }
  };

  // ── CAPTURE FLOW: step 2 — user chooses Analyze from post_capture ─────────
  const handlePostCaptureAnalyze = () => {
    if (captureMetadata) {
      // Fresh capture — use pre-computed metadata (no re-embedding needed)
      runAnalysis(encryptedFile, encryptedImage, {
        mode:            'newly_registered',
        uuidResult:      captureMetadata.uuidResult,
        gpsData:         captureMetadata.gpsData,
        captureTimeData: captureMetadata.captureTimeData,
        deviceInfo:      captureMetadata.deviceInfo,
        ipAddress:       captureMetadata.ipAddress,
      });
    } else {
      // Reopened draft — extract UUID from the stored image and analyze properly
      // (same path as the upload flow so ownerCase is determined correctly)
      const fileToUse    = encryptedFile || selectedFile;
      const previewToUse = encryptedImage || preview;
      setStep('checking');
      runUUIDCheck(fileToUse, previewToUse);
    }
  };

  // ── UPLOAD FLOW: file selected ────────────────────────────────────────────
  // Always goes: checking → processing → result (no deciding step)
  const handleFileSelected = useCallback((file, source = 'Upload') => {
    setCaptureSource(source);
    setSelectedFile(file);
    setEncryptedImage(null);
    setEncryptedFile(null);
    setReport(null);
    setVaultSaved(false);
    setOwnerCase(null);
    setCaptureMetadata(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target.result);
      setStep('checking');
      runUUIDCheck(file, e.target.result);
    };
    reader.readAsDataURL(file);
  }, []); // eslint-disable-line

  // ── UPLOAD FLOW: UUID check → always goes to processing ───────────────────
  // REMOVED: branch to 'deciding'. Upload always analyzes first.
  const runUUIDCheck = async (file, previewUrl) => {
    try {
      const img    = await loadImage(previewUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
      const result = extractUUIDWithRotation(canvas);
      setUuidResult(result);
      // Always proceed to analysis — ownerCase determined inside runAnalysis
      runAnalysis(file, previewUrl, {
        mode:      result.found ? 'existing' : 'analyze_only',
        uuidResult:result,
      });
    } catch (err) {
      console.error('UUID check failed:', err);
      runAnalysis(file, previewUrl, { mode: 'analyze_only', uuidResult: { found: false } });
    }
  };

  // ── NO_UUID upload result → Protect with PINIT ────────────────────────────
  const handleProtectWithPINIT = async () => {
    setStep('processing');
    setProcSteps(['identity', 'ownership', 'registering', 'analyzing', 'finalizing']);
    setCurProcStep('registering');

    try {
      const sha256Hash = await computeSHA256(selectedFile);
      const [gpsData, ipAddress, captureTimeData, exifDeviceInfo] = await Promise.all([
        getGPSLocation(), getPublicIP(), getCaptureTime(selectedFile), getExifDeviceInfo(selectedFile)
      ]);

      const currentDeviceId   = getDeviceFingerprint();
      const currentDeviceName = getCurrentDeviceName();
      const deviceInfo = exifDeviceInfo.found
        ? { deviceId: exifDeviceInfo.deviceId, deviceName: exifDeviceInfo.deviceName, source: 'EXIF' }
        : { deviceId: currentDeviceId, deviceName: currentDeviceName, source: 'Encrypting Device' };
      const gps = gpsData.available
        ? { ...gpsData, source: 'Encrypting Device' }
        : { available: false };

      const img    = await loadImage(preview);
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const imageData    = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const embeddedData = embedUUIDAdvanced(
        imageData, userId,
        { available: gps.available, latitude: gps.latitude, longitude: gps.longitude },
        deviceInfo, ipAddress, captureTimeData.timestamp,
        deviceInfo.source, 'Encrypting Device', gps.source,
        canvas.width, canvas.height
      );
      ctx.putImageData(embeddedData, 0, 0);

      const blob         = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const embeddedB64  = await blobToBase64(blob);
      const embeddedFile = new File([blob], `pinit_${Date.now()}.png`, { type: 'image/png' });

      setEncryptedImage(embeddedB64);
      setEncryptedFile(embeddedFile);

      runAnalysis(embeddedFile, embeddedB64, {
        mode:       'newly_registered',
        uuidResult: {
          found:true, userId, gps,
          timestamp:         captureTimeData.timestamp,
          deviceId:          deviceInfo.deviceId,
          deviceName:        deviceInfo.deviceName,
          deviceSource:      deviceInfo.source,
          ipAddress,
          ipSource:          'Encrypting Device',
          originalResolution:`${canvas.width}x${canvas.height}`,
        },
        sha256Hash, gpsData: gps, captureTimeData, deviceInfo, ipAddress,
      });
    } catch (err) {
      console.error('Protect failed:', err);
      setStep('result'); // stay on result so user can retry
    }
  };

  // ── Core analysis pipeline (shared by both flows) ─────────────────────────
  const runAnalysis = async (file, previewUrl, options = {}) => {
    const {
      mode, uuidResult: uRes,
      captureTimeData: preCT, deviceInfo: preDI, ipAddress: preIP,
    } = options;

    setStep('processing');
    const stepsSeq = ['identity', 'ownership', ...(mode === 'newly_registered' ? [] : []), 'analyzing', 'finalizing'];
    setProcSteps(stepsSeq);
    setCurProcStep('identity');

    try {
      const publicIP  = preIP || await getPublicIP();
      const deviceId  = getDeviceFingerprint();
      // ── FIX: was calling getExifDeviceInfo twice — second call must be getExifGPS ──
      const [exifDev, exifGPS, captureTime] = preCT
        ? [preDI?.exifDevice || { found: false }, { found: false }, preCT]
        : await Promise.all([getExifDeviceInfo(file), getExifGPS(file), getCaptureTime(file)]);

      setCurProcStep('ownership');
      const img    = await loadImage(previewUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const finalUUID = uRes || extractUUIDWithRotation(canvas);

      let originalRecord = null;
      if (finalUUID.found) {
        try {
          originalRecord = await vaultAPI.getByUUID(finalUUID.userId);
        } catch {
          try {
            const ph = computePerceptualHash(canvas);
            const vr = await vaultAPI.visualSearch(ph, 70);
            if (vr.matches?.length > 0) originalRecord = vr.matches[0];
          } catch {}
        }
      }

      const currentRes = `${canvas.width}x${canvas.height}`;
      let cropInfo = null; let resolutionMismatch = false;
      if (finalUUID.found && finalUUID.originalResolution) {
        const ori = finalUUID.originalResolution.replace(/\s/g,'').toLowerCase();
        const cur = currentRes.replace(/\s/g,'').toLowerCase();
        if (ori !== cur) {
          const [ow, oh] = finalUUID.originalResolution.split(/\s*x\s*/i).map(Number);
          if (!(ow === canvas.height && oh === canvas.width)) {
            cropInfo = {
              isCropped: true,
              originalResolution:  finalUUID.originalResolution,
              currentResolution:   currentRes,
              originalPixels:      (ow*oh).toLocaleString(),
              currentPixels:       (canvas.width*canvas.height).toLocaleString(),
              remainingPercentage: ((canvas.width*canvas.height/(ow*oh))*100).toFixed(2)+'%',
            };
            resolutionMismatch = true;
          }
        }
      }

      setCurProcStep('analyzing');
      const classification = classifyImage(
        canvas, imageData, file.size, file.name,
        finalUUID.found, resolutionMismatch,
        { exifDeviceInfo: exifDev, exifGPS, captureTimeData: captureTime }
      );

      const totalPixels = canvas.width * canvas.height;
      const assetId     = generateAssetId(imageData);
      const certId      = generateAuthorshipCertificateId(finalUUID.userId || userId, finalUUID.deviceId || deviceId);

      // ── Determine ownerCase ────────────────────────────────────────────────
      const norm = (id) => (id || '').replace(/-/g, '').toLowerCase();
      let computedOwnerCase;
      if (mode === 'newly_registered') {
        computedOwnerCase = 'OWN_CLEAN'; // ownershipInfo='Newly registered' drives UI
      } else if (!finalUUID.found) {
        computedOwnerCase = 'NO_UUID';
      } else {
        const isOwn            = norm(finalUUID.userId) === norm(userId);
        // ── FIX: rotation is also a modification — treat rotated image as modified
        const rotationModified = finalUUID.rotationDetected !== null &&
                                 finalUUID.rotationDetected !== undefined &&
                                 finalUUID.rotationDetected !== 0;
        const isModified       = resolutionMismatch || rotationModified;
        if      (isOwn && !isModified)  computedOwnerCase = 'OWN_CLEAN';
        else if (isOwn &&  isModified)  computedOwnerCase = 'OWN_MODIFIED';
        else if (!isOwn && !isModified) computedOwnerCase = 'OTHER_CLEAN';
        else                            computedOwnerCase = 'OTHER_MODIFIED';
      }
      setOwnerCase(computedOwnerCase);

      // ── Build report ───────────────────────────────────────────────────────
      let builtReport;
      if (finalUUID.found) {
        const rec = originalRecord || {};
        const gps = finalUUID.gps?.available ? finalUUID.gps
          : (rec.gps_latitude && rec.gps_longitude)
            ? { available: true, latitude: parseFloat(rec.gps_latitude), longitude: parseFloat(rec.gps_longitude), coordinates: `${parseFloat(rec.gps_latitude).toFixed(6)}, ${parseFloat(rec.gps_longitude).toFixed(6)}`, mapsUrl: `https://www.google.com/maps?q=${rec.gps_latitude},${rec.gps_longitude}` }
            : { available: false };

        builtReport = {
          assetId:                   rec.asset_id || assetId,
          vaultAssetId:              rec.asset_id || null, // used for "View in Vault" navigation
          fileName:                  file.name,
          fileType:                  file.type,
          uniqueUserId:              rec.user_id || finalUUID.userId || null,
          ownerName:                 rec.owner_name || user?.name || user?.email || null,
          assetFileSize:             rec.file_size || (file.size/1024).toFixed(2)+' KB',
          assetResolution:           rec.resolution || finalUUID.originalResolution || currentRes,
          userEncryptedResolution:   finalUUID.originalResolution || currentRes,
          timestamp:                 rec.capture_timestamp ? new Date(rec.capture_timestamp).getTime() : (finalUUID.timestamp || null),
          gpsLocation:               gps,
          totalPixels:               totalPixels.toLocaleString(),
          pixelsVerifiedWithBiometrics: Math.floor(totalPixels*0.98).toLocaleString(),
          deviceName:                finalUUID.deviceName || rec.device_name || getCurrentDeviceName(),
          deviceId:                  finalUUID.deviceId   || rec.device_id   || deviceId,
          deviceSource:              finalUUID.deviceSource || 'Embedded',
          ipAddress:                 finalUUID.ipAddress  || rec.ip_address  || publicIP,
          ipSource:                  finalUUID.ipSource   || 'Embedded',
          authorshipCertificateId:   rec.certificate_id  || certId,
          authorshipCertificate:     'Valid & Verified',
          ownershipInfo:             mode === 'newly_registered' ? 'Newly registered' : 'Embedded UUID detected',
          uploadedResolution:        currentRes,
          uploadedSize:              (file.size/1024).toFixed(2)+' KB',
          rotationDetected:          finalUUID.rotationDetected,
          rotationMessage:           finalUUID.rotationMessage,
          cropInfo, resolutionMismatch,
          // ── FIX: rotation after registration also means "Possible modification detected"
          integrityStatus:           finalUUID.found && !cropInfo?.isCropped && !(finalUUID.rotationDetected > 0) ? 'Protected' : finalUUID.found ? 'Possible modification detected' : 'Unprotected image',
          ownerCase:                 computedOwnerCase,
          ...classification,
          imagePreview:              previewUrl?.substring(0,50000) || null,
        };
      } else {
        builtReport = {
          assetId, fileName: file.name, fileType: file.type,
          uniqueUserId: null, ownerName: null,
          assetFileSize:         (file.size/1024).toFixed(2)+' KB',
          assetResolution:       currentRes,
          userEncryptedResolution:'N/A',
          timestamp:             null,
          gpsLocation:           { available: false },
          totalPixels:           totalPixels.toLocaleString(),
          pixelsVerifiedWithBiometrics: '0',
          deviceName:            getCurrentDeviceName(),
          deviceId, deviceSource:'Current Device',
          ipAddress:             publicIP, ipSource:'Current Device',
          authorshipCertificateId:'Not Present',
          authorshipCertificate: 'Not Present',
          ownershipInfo:         'No UUID found',
          uploadedResolution:    currentRes,
          uploadedSize:          (file.size/1024).toFixed(2)+' KB',
          rotationDetected:      finalUUID.rotationDetected,
          rotationMessage:       finalUUID.rotationMessage,
          cropInfo: null, resolutionMismatch: false,
          integrityStatus:       'Unprotected image',
          ownerCase:             computedOwnerCase,
          ...classification,
          imagePreview:          previewUrl?.substring(0,50000) || null,
        };
      }

      setCurProcStep('finalizing');

      // Save analysis report to backend — SKIP for other users' images
      const isOtherUserCase = computedOwnerCase === 'OTHER_CLEAN' || computedOwnerCase === 'OTHER_MODIFIED';
      if (!isOtherUserCase) {
        try {
          await compareAPI.save({
            asset_id:         builtReport.assetId || 'UNKNOWN',
            is_tampered:      builtReport.integrityStatus === 'Possible modification detected',
            confidence:       Math.round(builtReport.confidence || 0),
            phash_sim:        null,
            visual_verdict:   builtReport.integrityStatus + ' — ' + (builtReport.detectedCase || 'Unknown'),
            editing_tool:     'Unknown',
            changes:          builtReport.reasoning || [],
            pixel_analysis:   builtReport.metrics || {},
            uploaded_resolution: builtReport.uploadedResolution || null,
            uploaded_size:    String(builtReport.uploadedSize || ''),
            original_capture_time: null, modified_file_time: null,
          });
        } catch (e) { console.warn('Report save failed:', e.message); }

        // Save certificate metadata (kept for Vault use later)
        if (builtReport.authorshipCertificateId && builtReport.authorshipCertificateId !== 'Not Present') {
          try {
            await certAPI.save({
              certificate_id: builtReport.authorshipCertificateId,
              asset_id:       builtReport.assetId,
              confidence:     builtReport.confidence,
              status:         finalUUID.found ? 'UUID Detected' : 'No UUID',
              analysis_data:  builtReport,
              image_preview:  builtReport.imagePreview || null,
            });
          } catch (e) { console.warn('Cert save failed:', e.message); }
        }
      }

      await new Promise(r => setTimeout(r, 600));
      setReport(builtReport);
      setCurProcStep('');
      setStep('result');

    } catch (err) {
      console.error('Analysis failed:', err);
      alert('Analysis failed. Please try again.');
      setStep('input');
    }
  };

  // ── Save to vault (manual only — never auto) ──────────────────────────────
  const handleSaveVault = async () => {
    if (!report || savingVault || vaultSaved) return;
    setSavingVault(true);
    try {
      const img = await loadImage(encryptedImage || preview);

      // ── Thumbnail ──────────────────────────────────────────────────────────
      // For small images (≤ 200px): store the full PNG as the thumbnail so the
      // UUID survives. Converting a UUID-embedded PNG to JPEG (even quality 0.4)
      // destroys all embedded LSBs, making re-analysis impossible.
      // For large images: 80×80 JPEG thumbnail is fine for display.
      const isSmallImage = img.width <= 200 && img.height <= 200;
      let thumbnail;
      if (isSmallImage && encryptedImage) {
        // Full PNG preserves UUID — safe because small images are ≤ ~15 KB
        thumbnail = encryptedImage;
      } else {
        const tc = document.createElement('canvas');
        const sz = 80; tc.width = sz; tc.height = sz;
        const sc = Math.max(sz/img.width, sz/img.height);
        tc.getContext('2d').drawImage(img, (sz/2)-(img.width/2)*sc, (sz/2)-(img.height/2)*sc, img.width*sc, img.height*sc);
        thumbnail = tc.toDataURL('image/jpeg', 0.4);
      }

      const perceptualHash = (() => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
        return computePerceptualHash(c);
      })();

      // FIX (TC-01): Hash the encrypted blob bytes, not the original File.
      let sha256Hash = await computeSHA256(encryptedFile || selectedFile);
      try {
        const fileToHash = encryptedFile || selectedFile;
        const encBuf  = await fileToHash.arrayBuffer();
        const hashBuf = await crypto.subtle.digest('SHA-256', encBuf);
        sha256Hash    = Array.from(new Uint8Array(hashBuf))
          .map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) { console.warn('SHA-256 fallback used:', e); }

      const blockchainAnchor = generateBlockchainAnchor(sha256Hash, Date.now());

      await vaultAPI.save({
        asset_id:           report.assetId,
        owner_name:         user?.name || user?.email || user?.username || userId,
        user_id:            userId,
        embedded_uuid:      report.uniqueUserId || userId,   // steganographic UUID stored separately from auth user_id
        file_name:          `pinit-${report.assetId}.png`,  // assetId in filename so re-upload matches correctly
        file_size:          report.assetFileSize || report.uploadedSize,
        thumbnail_base64:   thumbnail,
        full_image_base64:  encryptedImage || null,          // full lossless PNG — backend stores as full_image_url
        device_id:          report.deviceId || getDeviceFingerprint(),
        certificate_id:     report.authorshipCertificateId || null,
        owner_email:        user?.email || null,
        file_hash:          sha256Hash || null,
        visual_fingerprint: perceptualHash || null,
        blockchain_anchor:  blockchainAnchor || null,
        resolution:         report.assetResolution || null,
        capture_timestamp:  report.timestamp ? new Date(report.timestamp).toISOString() : new Date().toISOString(),
        gps_latitude:       report.gpsLocation?.available ? report.gpsLocation.latitude  : null,
        gps_longitude:      report.gpsLocation?.available ? report.gpsLocation.longitude : null,
        gps_source:         report.gpsLocation?.source || null,
        ip_address:         report.ipAddress || null,
        device_name:        report.deviceName || null,
        confidence:         report.confidence || null,
        detected_case:      report.detectedCase || null,
        analysis_summary:   report.reasoning?.[0] || null,
      });

      // ── Device-local cache ────────────────────────────────────────────────
      // Store the full PNG in IndexedDB on this device so downloadImage()
      // and VaultDetail can use the real image even if backend only has thumbnail.
      // This is the primary fix for download→re-upload data loss.
      if (encryptedImage && report.assetId) {
        try {
          const { cacheVaultFullImage } = await import('../vault/utils/vaultImageCache');
          await cacheVaultFullImage(report.assetId, encryptedImage);
        } catch (e) { console.warn('Local image cache failed (non-critical):', e); }
      }
      setVaultSaved(true);
    } catch (err) {
      console.error('Vault save failed:', err);
      alert('Could not save to vault: ' + err.message);
    } finally {
      setSavingVault(false);
    }
  };

  // ── Download report (PDF) ─────────────────────────────────────────────────
  const handleDownloadReport = () => {
    if (!report) return;
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    canvas.width = 595; canvas.height = 842;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,595,842);
    ctx.fillStyle = '#1e3a8a'; ctx.fillRect(0,0,595,70);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Arial'; ctx.fillText('PINIT VERIFICATION REPORT', 28, 42);
    ctx.font = '10px Arial'; ctx.fillText('Certificate of Authenticity — PINIT', 28, 60);
    ctx.fillStyle = report.confidence>=85?'#16a34a':report.confidence>=65?'#d97706':'#dc2626';
    ctx.fillRect(0,70,595,40); ctx.fillStyle='#000'; ctx.font='bold 13px Arial';
    ctx.fillText(String(report.detectedCase||''),28,92); ctx.font='10px Arial';
    ctx.fillText('Confidence: '+(report.confidence||0)+'%',28,107);
    let y=132;
    const field=(l,v)=>{ctx.font='bold 9px Arial';ctx.fillStyle='#374151';ctx.fillText(String(l),28,y);ctx.font='9px Arial';ctx.fillStyle='#111';const sv=String(v||'—');ctx.fillText(sv.length>60?sv.slice(0,60)+'…':sv,185,y);y+=14;};
    ctx.fillStyle='#1d4ed8';ctx.font='bold 11px Arial';ctx.fillText('OWNERSHIP',28,y);y+=14;
    field('Asset ID:',report.assetId); field('Owner:',report.ownerName||report.uniqueUserId||'—');
    field('Status:',report.ownershipInfo); field('Integrity:',report.integrityStatus);
    field('Captured:',report.timestamp?new Date(report.timestamp).toLocaleString():'—');
    field('Resolution:',report.assetResolution); field('File size:',report.assetFileSize);
    ctx.fillStyle='#9ca3af';ctx.font='8px Arial';ctx.fillText('Generated: '+new Date().toLocaleString()+'  |  PINIT Verification System',28,835);
    const pngUrl=canvas.toDataURL('image/png');
    import('jspdf').then(mod=>{
      const JsPDF=mod.jsPDF||mod.default;
      const pdf=new JsPDF({unit:'px',format:[595,842],orientation:'portrait'});
      pdf.addImage(pngUrl,'PNG',0,0,595,842);
      saveFileToDevice(pdf.output('datauristring'),'PINIT-report-'+(report.assetId||Date.now())+'.pdf');
    }).catch(()=>saveFileToDevice(pngUrl,'PINIT-report-'+(report.assetId||Date.now())+'.png'));
  };

  // ── Camera functions (unchanged) ──────────────────────────────────────────
  const startCamera = async () => {
    try {
      setCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false
      }).catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }));
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCanSwitch(devices.filter(d=>d.kind==='videoinput').length > 1);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => videoRef.current.play().catch(console.error);
      }
    } catch (err) {
      alert('Camera error: ' + err.message); setCameraActive(false);
    }
  };

  const stopCamera = () => {
    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const switchCamera = async () => {
    stopCamera();
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    setTimeout(startCamera, 200);
  };

  // MODIFIED: capturePhoto → triggers capture flow (embedding first)
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current; const c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(blob => {
      const file = new File([blob], 'camera-capture.png', { type: 'image/png' });
      stopCamera();
      // CAPTURE FLOW: set state, then start auto-embedding
      setCaptureSource('Camera');
      setSelectedFile(file);
      setEncryptedImage(null);
      setEncryptedFile(null);
      setReport(null);
      setVaultSaved(false);
      setOwnerCase(null);
      setCaptureMetadata(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target.result);
        startCaptureEmbedding(file, e.target.result);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleReset = () => {
    setStep('input');
    setSelectedFile(null); setPreview(null);
    setUuidResult(null); setEncryptedImage(null); setEncryptedFile(null);
    setReport(null); setVaultSaved(false); setCameraActive(false);
    setOwnerCase(null); setShowExitModal(false);
    setEmbeddingPhase(0); setCaptureMetadata(null);
  };

  // ── Topbar title ──────────────────────────────────────────────────────────
  const topbarTitle =
      step === 'result'       ? 'Analysis Results'
    : step === 'embedding'    ? 'Capturing…'
    : step === 'post_capture' ? 'Image Captured'
    : step === 'checking'     ? 'Verifying…'
    : step === 'processing'   ? 'Analyzing…'
    : '';

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="analyze-shell">

      {/* Top bar */}
      <div className="analyze-topbar">
        <button className="analyze-back" onClick={() => {
          if (step === 'post_capture') {
            setShowExitModal(true);
          } else if (step === 'input') {
            onBack?.();        // return to Home's previous tab
          } else {
            handleReset();     // mid-flow: reset back to input step
          }
        }}>
          <ArrowLeft size={20} />
        </button>
        <span className="analyze-topbar__title">{topbarTitle}</span>
        {step !== 'input' && step !== 'checking' && step !== 'embedding' && step !== 'post_capture' && (
          <button className="analyze-reset" onClick={handleReset}>
            <RefreshCw size={16} />
          </button>
        )}
      </div>

      {/* Step content */}
      <div className="analyze-content">

        {step === 'input' && (
          <InputStep
            onFileSelected={handleFileSelected}
            onCapture={startCamera}
            cameraActive={cameraActive}
            videoRef={videoRef}
            canvasRef={canvasRef}
            onCapturePhoto={capturePhoto}
            onStopCamera={stopCamera}
            onSwitchCamera={switchCamera}
            canSwitch={canSwitch}
            facingMode={facingMode}
            drafts={drafts}
            onLoadDraft={handleLoadDraft}
            onDeleteDraft={handleDeleteDraft}
          />
        )}

        {step === 'embedding' && (
          <EmbeddingStep preview={preview} phase={embeddingPhase} />
        )}

        {step === 'post_capture' && (
          <PostCaptureStep
            preview={encryptedImage || preview}
            onAnalyze={handlePostCaptureAnalyze}
            onSaveDraft={handleSaveDraftFromCapture}
            onDiscard={handleReset}
          />
        )}

        {step === 'checking' && <CheckingStep preview={preview} />}

        {step === 'processing' && (
          <ProcessingStep steps={processingSteps} currentStep={currentProcStep} />
        )}

        {step === 'result' && report && (
          <ResultStep
            report={report}
            preview={preview}
            encryptedImage={encryptedImage}
            onSaveVault={handleSaveVault}
            onProtectWithPINIT={handleProtectWithPINIT}
            onSaveDraftFromResult={handleSaveDraftFromResult}
            onDownloadReport={handleDownloadReport}
            onReset={handleReset}
            savingVault={savingVault}
            vaultSaved={vaultSaved}
            onGoToVault={onGoToVault}
          />
        )}

        {/* certificate step is REMOVED from result flow
            CertificateView component is kept in code for future Vault integration */}

      </div>

      {/* Exit modal — shown when back is pressed from post_capture */}
      {showExitModal && (
        <ExitModal
          onSaveDraft={async () => { await handleSaveDraftFromCapture(); setShowExitModal(false); }}
          onDiscard={() => { setShowExitModal(false); handleReset(); }}
          onCancel={() => setShowExitModal(false)}
        />
      )}

    </div>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────
const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src;
});

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onloadend = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob);
});

export default Analyze;