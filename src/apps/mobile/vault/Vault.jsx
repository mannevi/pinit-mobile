/**
 * Vault.jsx — src/apps/mobile/vault/Vault.jsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Award, Image as ImageIcon } from 'lucide-react';
import { certAPI } from '../../../api/client';

import VaultList   from './components/VaultList';
import VaultDetail from './components/VaultDetail';

import { loadVaultAssets, deleteVaultAsset, downloadImage } from './utils/vaultStorage';

import './Vault.css';

function Vault({ user, highlightAsset, onCertGenerated, onGoToAnalyzer, onDataChange }) {

  const [vault,    setVault]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState([]);
  const [search,   setSearch]   = useState('');
  const [detailItem, setDetailItem] = useState(null);

  // cert modal
  const [certImg,  setCertImg]  = useState(null);
  const [certBusy, setCertBusy] = useState(false);
  const [certDone, setCertDone] = useState(null);

  const loadVault = useCallback(async () => {
    setLoading(true);
    onDataChange?.([], true);
    try {
      const imgs = await loadVaultAssets();
      setVault(imgs);
      onDataChange?.(imgs, false);
    } catch (e) {
      console.error('Vault load:', e.message);
      onDataChange?.([], false);
    } finally { setLoading(false); }
  }, []); // eslint-disable-line

  useEffect(() => { loadVault(); }, [loadVault]);

  useEffect(() => {
    if (!highlightAsset || loading || vault.length === 0) return;
    const m = vault.find(x => x.id === highlightAsset || x.assetId === highlightAsset);
    if (m) setDetailItem(m);
  }, [vault, loading, highlightAsset]); // eslint-disable-line

  const toggleSelect = (id) =>
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const doDelete = async (id) => {
    if (!window.confirm('Delete this image from vault?')) return;
    await deleteVaultAsset(id);
    setVault(p => { const u = p.filter(x => x.id !== id && x.assetId !== id); onDataChange?.(u, false); return u; });
    setSelected(p => p.filter(x => x !== id));
    if (detailItem && (detailItem.id === id || detailItem.assetId === id)) setDetailItem(null);
  };

  const doDeleteSelected = async () => {
    if (!selected.length || !window.confirm(`Delete ${selected.length} image(s)?`)) return;
    await Promise.allSettled(selected.map(id => deleteVaultAsset(id)));
    setVault(p => { const u = p.filter(x => !selected.includes(x.id) && !selected.includes(x.assetId)); onDataChange?.(u, false); return u; });
    setSelected([]);
  };

  const doDownload = async (img) => {
    try { await downloadImage(img); }
    catch (e) { alert('Download failed: ' + e.message); }
  };

  const openDetail = (img) => { setDetailItem(img); setSelected([]); };

  const openCert = (img) => { setCertImg(img); setCertDone(null); };

  const doGenerateCert = async () => {
    if (!certImg) return;
    setCertBusy(true);
    try {
      const newId = `CERT-${Date.now().toString(36).toUpperCase()}HAFP7`;
      await certAPI.save({
        certificate_id : newId,
        asset_id       : certImg.assetId    || certImg.id,
        confidence     : certImg.confidence || 95,
        status         : 'Verified',
        owner_email    : certImg.ownerEmail || null,
        owner_name     : certImg.ownerName  || null,
        analysis_data  : {
          fileName    : certImg.fileName,
          fileSize    : certImg.fileSize,
          resolution  : certImg.resolution,
          ownerName   : certImg.ownerName,
          ownerEmail  : certImg.ownerEmail,
          deviceName  : certImg.deviceName  || null,
          savedAt     : certImg.captureTimestamp || certImg.dateEncrypted || new Date().toISOString(),
          detectedCase: certImg.detected_case   || null,
          gpsLocation : certImg.gpsLocation?.available ? certImg.gpsLocation.coordinates : null,
        },
        image_preview  : certImg.fullImage || certImg.thumbnail || null,
      });

      try {
        const certRecord = {
          certificate_id : newId,
          certificateId  : newId,
          asset_id       : certImg.assetId    || certImg.id,
          confidence     : certImg.confidence || 95,
          status         : 'Verified',
          owner_email    : certImg.ownerEmail || null,
          created_at     : new Date().toISOString(),
          image_preview  : certImg.fullImage || certImg.thumbnail || null,
          analysis_data  : {
            fileName    : certImg.fileName,
            fileSize    : certImg.fileSize,
            resolution  : certImg.resolution,
            ownerName   : certImg.ownerName,
            ownerEmail  : certImg.ownerEmail,
            deviceName  : certImg.deviceName  || null,
            savedAt     : certImg.captureTimestamp || certImg.dateEncrypted || new Date().toISOString(),
            detectedCase: certImg.detected_case   || null,
            gpsLocation : certImg.gpsLocation?.available ? certImg.gpsLocation.coordinates : null,
          },
        };
        const existing = JSON.parse(localStorage.getItem('sharedCertificates') || '[]');
        localStorage.setItem('sharedCertificates', JSON.stringify([certRecord, ...existing].slice(0, 20)));
      } catch (e) { console.warn('Local cert cache failed (non-critical):', e); }

      setCertDone(newId);
      onCertGenerated?.();
    } catch (e) { alert('Could not generate certificate: ' + e.message); }
    finally { setCertBusy(false); }
  };

  return (
    <>
      {/* LIST VIEW */}
      {!detailItem && (
        <VaultList
          vault={vault} loading={loading} search={search} selected={selected}
          onSearchChange={setSearch} onToggleSelect={toggleSelect}
          onItemClick={openDetail} onDeleteSelected={doDeleteSelected}
          onRefresh={loadVault} onGoToAnalyzer={onGoToAnalyzer}
        />
      )}

      {/* DETAIL VIEW — ShareModal is now handled inside VaultDetail */}
      {detailItem && (
        <VaultDetail
          img={detailItem}
          onBack={() => setDetailItem(null)}
          onDownload={doDownload}
          onGenerateCert={openCert}
          onDelete={doDelete}
        />
      )}

      {/* CERT MODAL */}
      {certImg && (
        <div className="overlay" onClick={() => { if (!certBusy) { setCertImg(null); setCertDone(null); } }}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet__handle"/>
            <div className="sheet__head">
              <h2 className="sheet__title">Generate Certificate</h2>
              <button className="sheet__close" onClick={() => { setCertImg(null); setCertDone(null); }}>✕</button>
            </div>
            <div className="sheet__body">
              {!certDone ? (
                <>
                  <div style={{background:'var(--surface2)',borderRadius:12,padding:14,marginBottom:16}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,color:'#a78bfa',fontWeight:700,marginBottom:12}}>
                      <Award size={18}/> PINIT Certificate of Verification
                    </div>
                    {[['Owner', certImg.ownerName || certImg.ownerEmail || '—'],['Asset ID', certImg.assetId || '—'],['Status','Verified'],['Confidence',`${certImg.confidence || 95}%`],['File', certImg.fileName || '—']].map(([l,v]) => (
                      <div key={l} className="m-row"><span className="m-row__lbl">{l}</span><span className="m-row__val">{v}</span></div>
                    ))}
                    <div style={{marginTop:10,padding:10,background:'rgba(139,92,246,.08)',borderRadius:8,fontSize:11,color:'#c4b5fd',fontStyle:'italic',lineHeight:1.5}}>
                      "This image is registered in PINIT and linked to the owner listed above."
                    </div>
                  </div>
                  <button className="primary-btn" onClick={doGenerateCert} disabled={certBusy}>
                    <Award size={16}/> {certBusy ? 'Generating…' : 'Generate Certificate'}
                  </button>
                </>
              ) : (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:'24px 0',textAlign:'center'}}>
                  <CheckCircle size={40} color="var(--green)"/>
                  <p style={{fontFamily:'Syne,sans-serif',fontSize:18,fontWeight:800,color:'var(--text)',margin:0}}>Certificate Generated!</p>
                  <code style={{fontSize:11,color:'var(--text-2)',background:'var(--surface2)',padding:'6px 12px',borderRadius:8}}>{certDone}</code>
                  <p style={{fontSize:13,color:'var(--text-2)',margin:0}}>Find it in your Certificates tab</p>
                  <button className="primary-btn" onClick={() => { setCertImg(null); setCertDone(null); }}>Done</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Vault;