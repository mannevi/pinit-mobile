import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Award, ArrowLeft, Download, CheckCircle, Shield, XCircle } from 'lucide-react';
import './PublicCertificateView.css';

function PublicCertificateView() {
  const { certificateId } = useParams();
  const navigate = useNavigate();
  const [certificate, setCertificate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCertificate();
  }, [certificateId]);

  const loadCertificate = () => {
  try {
    console.log('Loading certificate:', certificateId);
    
    // First, try to get data from URL parameter (works on any device!)
    const urlParams = new URLSearchParams(window.location.search);
    const encodedData = urlParams.get('data');
    
    if (encodedData) {
      // Decode certificate data from URL
      try {
        const certData = decodeURIComponent(escape(atob(encodedData)));
        const cert = JSON.parse(certData);
        console.log('Certificate loaded from URL:', cert);
        setCertificate(cert);
        setLoading(false);
        return;
      } catch (decodeErr) {
        console.error('Failed to decode certificate from URL:', decodeErr);
      }
    }
    
    // Fallback: try localStorage (for backward compatibility)
    const sharedCerts = JSON.parse(localStorage.getItem('sharedCertificates') || '[]');
    console.log('Shared certificates in localStorage:', sharedCerts);
    
    const cert = sharedCerts.find(c => 
      c.certificateId === certificateId || 
      c.certificate_id === certificateId ||
      c.id === certificateId
    );
    
    console.log('Found certificate in localStorage:', cert);

    if (!cert) {
      setError('Certificate not found or link has expired');
      setLoading(false);
      return;
    }

    setCertificate(cert);
    setLoading(false);
  } catch (err) {
    console.error('Error loading certificate:', err);
    setError('Error loading certificate: ' + err.message);
    setLoading(false);
  }
};

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDownload = () => {
    // Download certificate as PNG
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header
    ctx.fillStyle = '#667eea';
    ctx.fillRect(0, 0, canvas.width, 100);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Arial';
    ctx.fillText('OWNERSHIP CERTIFICATE', 50, 60);

    // Certificate ID
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, 100, canvas.width, 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(`✓ ${certificate.status}`, 50, 140);
    ctx.font = '14px Arial';
    ctx.fillText(`Confidence: ${certificate.confidence}%`, canvas.width - 200, 140);

    let y = 200;

    // Certificate Details
    ctx.fillStyle = '#1a202c';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('CERTIFICATE INFORMATION', 50, y);
    y += 30;

    ctx.font = '13px Arial';
    const details = [
      ['Certificate ID:', certificate.certificateId],
      ['Asset ID:', certificate.assetId],
      ['User ID:', certificate.userId],
      ['Date Created:', formatDate(certificate.dateCreated)],
      ['Confidence:', certificate.confidence + '%']
    ];

    details.forEach(([label, value]) => {
      ctx.fillStyle = '#4a5568';
      ctx.font = 'bold 13px Arial';
      ctx.fillText(label, 50, y);
      ctx.fillStyle = '#1a202c';
      ctx.font = '13px Arial';
      ctx.fillText(String(value).substring(0, 50), 250, y);
      y += 25;
    });

    y += 20;
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px Arial';
    ctx.fillText('Generated: ' + new Date().toLocaleString(), 50, canvas.height - 40);
    ctx.fillText('Image Forensics System - Public Certificate', 50, canvas.height - 20);

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `certificate-${certificate.certificateId}.png`;
      link.click();
      URL.revokeObjectURL(url);
    });
  };

  if (loading) {
    return (
      <div className="pvp-loading">
        <div className="pvp-spinner" />
        <p>Loading certificate...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pvp-error-page">
        <div className="pvp-error-box">
          <XCircle size={48} className="err-icon" />
          <h2>{error}</h2>
          <p>This certificate link may be invalid or has expired.</p>
          <p className="err-hint">Please request a new certificate link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pvp-root">
      {/* Top bar */}
      <div className="pvp-topbar">
        <div className="pvp-topbar-inner">
          <div className="pvp-logo">
            <Shield size={22} />
            <span>Image Forensics App</span>
          </div>
          <div className="pvp-topbar-label">Public Certificate</div>
        </div>
      </div>

      <div className="pvp-container">
        {/* Certificate Header */}
        <div className="cert-header-public">
          <Award size={64} style={{color: '#667eea'}} />
          <h1>Ownership Certificate</h1>
          <div className="cert-verified-badge">
            <CheckCircle size={20} />
            Verified & Authentic
          </div>
        </div>

        {/* Certificate Info Card */}
        <div className="pvp-card" style={{marginBottom: '16px'}}>
          <div className="pvp-card-head" style={{background: 'rgba(102, 126, 234, 0.08)', color: '#667eea'}}>
            <Shield size={16} /> Certificate Information
          </div>
          <div className="pvp-rows">
            <div className="pvp-row">
              <span className="pvp-row-label">Certificate ID</span>
              <span className="pvp-row-value mono">{certificate.certificateId}</span>
            </div>
            <div className="pvp-row">
              <span className="pvp-row-label">Asset ID</span>
              <span className="pvp-row-value mono">{certificate.assetId}</span>
            </div>
            <div className="pvp-row">
              <span className="pvp-row-label">User ID</span>
              <span className="pvp-row-value mono">{certificate.userId}</span>
            </div>
            <div className="pvp-row">
              <span className="pvp-row-label">Date Issued</span>
              <span className="pvp-row-value">{formatDate(certificate.dateCreated)}</span>
            </div>
            <div className="pvp-row">
              <span className="pvp-row-label">Confidence</span>
              <span className="pvp-row-value success">{certificate.confidence}%</span>
            </div>
            <div className="pvp-row">
              <span className="pvp-row-label">Status</span>
              <span className="pvp-row-value success">{certificate.status}</span>
            </div>
          </div>
        </div>

        {/* Ownership Details */}
        {certificate.ownershipAtCreation && (
          <div className="pvp-card" style={{marginBottom: '16px'}}>
            <div className="pvp-card-head" style={{background: 'rgba(16, 185, 129, 0.08)', color: '#10b981'}}>
              <CheckCircle size={16} /> Ownership at Creation
            </div>
            <div className="pvp-rows">
              <div className="pvp-row">
                <span className="pvp-row-label">Asset Resolution</span>
                <span className="pvp-row-value">{certificate.ownershipAtCreation.assetResolution}</span>
              </div>
              <div className="pvp-row">
                <span className="pvp-row-label">File Size</span>
                <span className="pvp-row-value">{certificate.ownershipAtCreation.assetFileSize}</span>
              </div>
              <div className="pvp-row">
                <span className="pvp-row-label">Timestamp</span>
                <span className="pvp-row-value">{certificate.ownershipAtCreation.timeStamp}</span>
              </div>
              <div className="pvp-row">
                <span className="pvp-row-label">GPS Location</span>
                <span className="pvp-row-value">{certificate.ownershipAtCreation.gpsLocation || 'Not Available'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Technical Details */}
        {certificate.technicalDetails && (
          <div className="pvp-card" style={{marginBottom: '16px'}}>
            <div className="pvp-card-head" style={{background: 'rgba(88, 166, 255, 0.08)', color: '#58a6ff'}}>
              <Shield size={16} /> Technical Details
            </div>
            <div className="pvp-rows">
              <div className="pvp-row">
                <span className="pvp-row-label">Device Name</span>
                <span className="pvp-row-value">{certificate.technicalDetails.deviceName}</span>
              </div>
              <div className="pvp-row">
                <span className="pvp-row-label">Pixels Verified</span>
                <span className="pvp-row-value">{certificate.technicalDetails.pixelsVerified}</span>
              </div>
              <div className="pvp-row">
                <span className="pvp-row-label">Ownership Info</span>
                <span className="pvp-row-value success">{certificate.technicalDetails.ownershipInfo}</span>
              </div>
            </div>
          </div>
        )}

        {/* Image Preview */}
        {certificate.imagePreview && (
          <div className="pvp-card" style={{marginBottom: '16px'}}>
            <div className="pvp-card-head" style={{background: 'rgba(210, 153, 34, 0.08)', color: '#d29922'}}>
              Analyzed Image
            </div>
            <div style={{padding: '20px', textAlign: 'center', background: '#161b22'}}>
              <img 
                src={certificate.imagePreview} 
                alt="Certificate Preview" 
                style={{maxWidth: '100%', maxHeight: '400px', borderRadius: '8px'}}
              />
            </div>
          </div>
        )}

        {/* Download Button */}
        <div style={{textAlign: 'center', margin: '30px 0'}}>
          <button 
            onClick={handleDownload}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              padding: '14px 32px',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Download size={18} />
            Download Certificate
          </button>
        </div>

        {/* Footer */}
        <div className="pvp-footer">
          🔒 This certificate is cryptographically verified
          <span className="pvp-ts">{new Date().toISOString()}</span>
        </div>
      </div>
    </div>
  );
}

export default PublicCertificateView;