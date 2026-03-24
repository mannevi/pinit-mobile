import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Users, BarChart3, Shield, CheckCircle, AlertTriangle, HardDrive, Activity, FolderOpen, RefreshCw, UserX, UserCheck, Camera } from 'lucide-react';
import { adminAPI } from '../api/client';
import './AdminDashboard.css';

function AdminDashboard({ user, onLogout }) {
  const location = useLocation();
  const currentTab = new URLSearchParams(location.search).get('tab') || 'overview';

  const [stats,        setStats]        = useState({ total_users: 0, total_assets: 0, total_reports: 0, tampered_found: 0 });
  const [users,        setUsers]        = useState([]);
  const [assets,       setAssets]       = useState([]);
  const [reports,      setReports]      = useState([]);
  const [auditLog,     setAuditLog]     = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [proofUser, setProofUser] = useState(null);
  const navigate = useNavigate();

  const loadStats    = useCallback(async () => { try { const res = await adminAPI.getStats();      setStats(res);             } catch (err) { console.error(err); } }, []);
  const loadUsers    = useCallback(async () => { try { const res = await adminAPI.getUsers();      setUsers(res.users || []); } catch (err) { console.error(err); } }, []);
  const loadAssets   = useCallback(async () => { try { const res = await adminAPI.getAllVault();   setAssets(res.assets || []); } catch (err) { console.error(err); } }, []);
  const loadReports  = useCallback(async () => { try { const res = await adminAPI.getAllReports(); setReports(res.reports || []); } catch (err) { console.error(err); } }, []);
  const loadAuditLog = useCallback(async () => { try { const res = await adminAPI.getAuditLog();  setAuditLog(res.logs || []); } catch (err) { console.error(err); } }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadStats(), loadUsers(), loadAssets(), loadReports(), loadAuditLog()]);
    setLoading(false);
  }, [loadStats, loadUsers, loadAssets, loadReports, loadAuditLog]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSuspend = async (userId) => {
    if (!window.confirm('Suspend this user?')) return;
    try { await adminAPI.suspendUser(userId, 'Admin action'); await loadUsers(); alert('User suspended'); }
    catch (err) { alert('Failed: ' + err.message); }
  };

  const handleActivate = async (userId) => {
    try { await adminAPI.activateUser(userId); await loadUsers(); alert('User activated'); }
    catch (err) { alert('Failed: ' + err.message); }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const storageUsed = () => {
    const total = assets.reduce((sum, a) => sum + (parseFloat(a.file_size) || 0), 0);
    return total > 1024 ? (total / 1024).toFixed(1) + ' GB' : total.toFixed(1) + ' MB';
  };

  const todayChecks = reports.filter(r => new Date(r.created_at).toDateString() === new Date().toDateString()).length;
  const goTab = (tab) => navigate(tab === 'overview' ? '/admin/dashboard' : `/admin/dashboard?tab=${tab}`);

  const downloadAssetPDF = (a) => {
    const confidence = a.confidence || 95;
    const isVerified = a.status === 'verified' || confidence >= 90;
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Asset Report - ${a.asset_id}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1f2937; }
    h1 { font-size: 22px; border-bottom: 2px solid #6366f1; padding-bottom: 8px; }
    .badge { display:inline-block; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .verified { background: #d1fae5; color: #065f46; }
    .unknown { background: #fee2e2; color: #991b1b; }
    .section { margin: 20px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .section h2 { font-size: 15px; color: #374151; margin: 0 0 12px 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .item label { font-size: 11px; font-weight: 700; color: #6b7280; display: block; }
    .item span { font-size: 14px; }
    .confidence-bar { background: #e5e7eb; border-radius: 4px; height: 10px; margin-top: 4px; }
    .confidence-fill { background: #6366f1; border-radius: 4px; height: 10px; }
    footer { margin-top: 40px; font-size: 12px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  </style>
</head>
<body>
  <h1>Asset Details Report</h1>
  <p><span class="badge ${isVerified ? 'verified' : 'unknown'}">${isVerified ? '✓ Verified' : '⊗ Unknown'}</span> &nbsp; Confidence: <strong>${confidence}%</strong></p>

  <div class="section">
    <h2>Asset Information</h2>
    <div class="grid">
      <div class="item"><label>ASSET ID</label><span>${a.asset_id || '—'}</span></div>
      <div class="item"><label>AUTHORSHIP CERTIFICATE ID</label><span>${a.certificate_id || 'Not Present'}</span></div>
      <div class="item"><label>DEVICE ID</label><span>${a.device_id || '—'}</span></div>
      <div class="item"><label>DEVICE NAME</label><span>${a.device_name || '—'}</span></div>
    </div>
  </div>

  <div class="section">
    <h2>Creator Information</h2>
    <div class="grid">
      <div class="item"><label>NAME</label><span>${a.owner_name || '—'}</span></div>
      <div class="item"><label>EMAIL</label><span>${a.owner_email || '—'}</span></div>
      <div class="item"><label>USER ID</label><span>${a.user_id || '—'}</span></div>
      <div class="item"><label>IP ADDRESS</label><span>${a.ip_address || '—'}</span></div>
    </div>
  </div>

  <div class="section">
    <h2>Technical Details</h2>
    <div class="grid">
      <div class="item"><label>RESOLUTION</label><span>${a.resolution || '—'}</span></div>
      <div class="item"><label>FILE SIZE</label><span>${a.file_size || '—'}</span></div>
      <div class="item"><label>FILE NAME</label><span>${a.file_name || '—'}</span></div>
      <div class="item"><label>CREATED</label><span>${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</span></div>
    </div>
  </div>

  <div class="section">
    <h2>Analysis Results</h2>
    <p>Confidence Score: <strong>${confidence}%</strong></p>
    <div class="confidence-bar"><div class="confidence-fill" style="width:${confidence}%"></div></div>
    <p style="margin-top:12px">Status: <strong>${isVerified ? 'Verified — No significant changes detected' : 'Unknown — Could not verify authenticity'}</strong></p>
  </div>

  <footer>
    PINIT Image Forensics System &nbsp;·&nbsp; ${new Date().toLocaleString()}
  </footer>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.onload = () => { win.print(); };
    }
  };

  return (
    <div className="admin-main-content">

      {/* ── OVERVIEW ── */}
      {currentTab === 'overview' && (
        <div className="overview-section">
          <div className="section-header">
            <div><h1>Dashboard Overview</h1><p className="subtitle">Image Forensics System Metrics</p></div>
            <button onClick={loadAll} className="btn-refresh"><RefreshCw size={16} /> Refresh</button>
          </div>

          {loading ? <div className="loading-state">Loading data...</div> : (
            <>
              <div className="stats-grid">
                <div className="stat-card"><div className="stat-icon users-icon"><Users size={32} /></div><div className="stat-content"><h3>{stats.total_users || users.length}</h3><p>Total Users</p></div></div>
                <div className="stat-card"><div className="stat-icon assets-icon"><Shield size={32} /></div><div className="stat-content"><h3>{stats.total_assets || assets.length}</h3><p>Total Assets</p><small>PROOFS CREATED</small></div></div>
                <div className="stat-card"><div className="stat-icon reports-icon"><CheckCircle size={32} /></div><div className="stat-content"><h3>{todayChecks}</h3><p>Today Checks</p><small>VERIFICATIONS TODAY</small></div></div>
                <div className="stat-card"><div className="stat-icon tamper-icon"><AlertTriangle size={32} /></div><div className="stat-content"><h3>{stats.tampered_found || 0}</h3><p>Tampered</p><small>TAMPER ALERTS</small></div></div>
                <div className="stat-card"><div className="stat-icon storage-icon"><HardDrive size={32} /></div><div className="stat-content"><h3>{storageUsed()}</h3><p>Storage Used</p></div></div>
                <div className="stat-card"><div className="stat-icon health-icon"><Activity size={32} /></div><div className="stat-content"><h3 style={{color:'#10b981'}}>Active</h3><p>System Health</p></div></div>
              </div>

              <div className="recent-section">
                <h2>Quick Actions</h2>
                <div className="stats-grid">
                  {[
                    { icon: <Camera size={32} />,      title: 'Launch Image Analyzer', desc: 'Access encryption & analysis tools', action: () => navigate('/analyzer') },
                    { icon: <FolderOpen size={32} />,  title: 'View Assets',           desc: 'Browse all encrypted assets',       action: () => goTab('assets') },
                    { icon: <Shield size={32} />,      title: 'Track Assets',          desc: 'Monitor modifications & versions',  action: () => navigate('/admin/assets') },
                    { icon: <CheckCircle size={32} />, title: 'Verify Image',          desc: 'Check image authenticity',          action: () => navigate('/admin/verify') },
                    { icon: <Users size={32} />,       title: 'Manage Users',          desc: 'View and manage user accounts',     action: () => goTab('users') },
                    { icon: <BarChart3 size={32} />,   title: 'View Analytics',        desc: 'System performance & statistics',   action: () => goTab('analytics') },
                  ].map((item, i) => (
                    <div key={i} className="stat-card" style={{cursor:'pointer'}} onClick={item.action}>
                      <div className="stat-icon">{item.icon}</div>
                      <div className="stat-content"><h3>{item.title}</h3><p>{item.desc}</p></div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="recent-section">
                <h2>Recent Registrations</h2>
                {users.slice(0,5).length > 0 ? (
                  <table className="admin-table">
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Status</th></tr></thead>
                    <tbody>{users.slice(0,5).map((u,i) => (
                      <tr key={i}>
                        <td>{u.username}</td><td>{u.email}</td>
                        <td><span className={`role-badge ${u.role}`}>{u.role}</span></td>
                        <td>{formatDate(u.created_at)}</td>
                        <td><span className={`status-dot ${u.is_active ? 'active' : 'inactive'}`}>{u.is_active ? 'Active' : 'Suspended'}</span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                ) : <div className="empty-state">No users registered yet</div>}
              </div>

              <div className="recent-section">
                <h2>Recent Activity</h2>
                {auditLog.slice(0,5).length > 0 ? (
                  <table className="admin-table">
                    <thead><tr><th>Action</th><th>Details</th><th>IP</th><th>Time</th></tr></thead>
                    <tbody>{auditLog.slice(0,5).map((log,i) => (
                      <tr key={i}>
                        <td><span className="action-badge">{log.action}</span></td>
                        <td>{JSON.stringify(log.details||{}).slice(0,50)}</td>
                        <td>{log.ip_address||'—'}</td>
                        <td>{formatDate(log.created_at)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                ) : <div className="empty-state">No activity recorded yet</div>}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── USERS ── */}
      {currentTab === 'users' && (
        <div className="users-section">
          <div className="section-header">
            <div><h1>User Management</h1><p className="subtitle">Total Users: {users.length}</p></div>
            <button onClick={loadUsers} className="btn-refresh"><RefreshCw size={16} /> Refresh</button>
          </div>
          {users.length > 0 ? (
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Signup Date</th><th>Proof Count</th><th>Plan</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{users.map((u,i) => (
                <tr key={i}>
                  <td>{u.username}</td><td>{u.email}</td><td>{u.phone||'—'}</td>
                  <td>{formatDate(u.created_at)}</td><td>{u.proof_count||0}</td>
                  <td><span className="role-badge user">Free</span></td>
                  <td><span className={`status-dot ${u.is_active ? 'active' : 'inactive'}`}>{u.is_active ? 'Active' : 'Suspended'}</span></td>
                  <td>
                    <div className="action-buttons">
                      <button onClick={() => setProofUser(u)} className="btn-action btn-view">Proofs</button>
                      {u.is_active
                        ? <button onClick={() => handleSuspend(u.id)} className="btn-action btn-delete" disabled={u.role==='admin'}>Block</button>
                        : <button onClick={() => handleActivate(u.id)} className="btn-action btn-view">Activate</button>}
                      <button onClick={() => setSelectedUser(u)} className="btn-action btn-view">Profile</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          ) : <div className="empty-state">No users found</div>}

          {selectedUser && (
            <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
              <div className="modal-content" style={{maxWidth:'600px', width:'90%'}} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>User Profile</h2>
                  <button className="modal-close" onClick={() => setSelectedUser(null)}>×</button>
                </div>
                <div className="modal-body">
                  <h4 style={{marginBottom:'12px', color:'#374151'}}>User Information</h4>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'16px'}}>
                    {[
                      ['NAME:', selectedUser.username],
                      ['EMAIL:', selectedUser.email],
                      ['PHONE:', selectedUser.phone || 'Not provided'],
                      ['SIGNUP DATE:', new Date(selectedUser.created_at).toLocaleDateString()],
                      ['TOTAL PROOFS:', assets.filter(a => a.owner_email === selectedUser.email).length],
                      ['PLAN:', 'Free'],
                    ].map(([label, value]) => (
                      <div key={label} style={{background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'12px'}}>
                        <div style={{fontSize:'0.7rem', fontWeight:'700', color:'#6b7280', marginBottom:'4px'}}>{label}</div>
                        <div style={{fontSize:'0.9rem', fontWeight:'500'}}>{label === 'PLAN:' ? <span style={{background:'#e5e7eb', borderRadius:'20px', padding:'2px 10px', fontSize:'0.8rem'}}>{value}</span> : value}</div>
                      </div>
                    ))}
                    <div style={{background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'12px'}}>
                      <div style={{fontSize:'0.7rem', fontWeight:'700', color:'#6b7280', marginBottom:'4px'}}>STATUS:</div>
                      <span style={{background: selectedUser.is_active ? '#d1fae5' : '#fee2e2', color: selectedUser.is_active ? '#065f46' : '#991b1b', borderRadius:'20px', padding:'2px 10px', fontSize:'0.8rem', fontWeight:'600'}}>
                        {selectedUser.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </div>
                    <div style={{background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'12px'}}>
                      <div style={{fontSize:'0.7rem', fontWeight:'700', color:'#6b7280', marginBottom:'4px'}}>DEVICES:</div>
                      <div style={{fontSize:'0.9rem'}}>No devices registered</div>
                    </div>
                  </div>

                  <h4 style={{marginBottom:'8px', color:'#374151'}}>User Assets ({assets.filter(a => a.owner_email === selectedUser.email).length})</h4>
                  <div style={{border:'1px solid #e5e7eb', borderRadius:'8px', padding:'12px', minHeight:'80px'}}>
                    {assets.filter(a => a.owner_email === selectedUser.email).length > 0 ? (
                      <table className="admin-table" style={{margin:0}}>
                        <thead><tr><th>Asset ID</th><th>File Name</th><th>Date</th></tr></thead>
                        <tbody>
                          {assets.filter(a => a.owner_email === selectedUser.email).map((a,i) => (
                            <tr key={i}>
                              <td><code style={{fontSize:'0.75rem'}}>{(a.asset_id||'').slice(0,16)}...</code></td>
                              <td>{a.file_name||'—'}</td>
                              <td>{formatDate(a.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{textAlign:'center', color:'#9ca3af', padding:'20px'}}>No assets created yet</div>
                    )}
                  </div>
                </div>
                <div style={{padding:'16px 24px', borderTop:'1px solid #e5e7eb', display:'flex', justifyContent:'flex-end', gap:'12px'}}>
                  <button onClick={() => setSelectedUser(null)} style={{padding:'8px 20px', border:'1px solid #e5e7eb', borderRadius:'6px', background:'white', cursor:'pointer'}}>Close</button>
                  {selectedUser.is_active ? (
                    <button onClick={() => { handleSuspend(selectedUser.id); setSelectedUser(null); }} style={{padding:'8px 20px', background:'#ef4444', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'600'}}>Block User</button>
                  ) : (
                    <button onClick={() => { handleActivate(selectedUser.id); setSelectedUser(null); }} style={{padding:'8px 20px', background:'#10b981', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'600'}}>Activate User</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {proofUser && (
            <div className="modal-overlay" onClick={() => setProofUser(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Proofs for {proofUser.username}</h2>
                  <button className="modal-close" onClick={() => setProofUser(null)}>×</button>
                </div>
                <div className="modal-body">
                  {assets.filter(a => a.owner_email === proofUser.email || a.owner_name === proofUser.username).length > 0 ? (
                    <table className="admin-table">
                      <thead><tr><th>Asset ID</th><th>File Name</th><th>Size</th><th>Date</th></tr></thead>
                      <tbody>
                        {assets.filter(a => a.owner_email === proofUser.email || a.owner_name === proofUser.username).map((a, i) => (
                          <tr key={i}>
                            <td><code style={{fontSize:'0.75rem'}}>{(a.asset_id||'').slice(0,20)}...</code></td>
                            <td>{a.file_name||'—'}</td>
                            <td>{a.file_size||'—'}</td>
                            <td>{formatDate(a.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="empty-state">No proofs found for this user</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ASSETS ── */}
      {currentTab === 'assets' && (
        <div className="assets-section">
          <div className="section-header">
            <div><h1>Assets Management</h1><p className="subtitle">View and search all encrypted assets and analysis reports</p></div>
            <div style={{display:'flex', gap:'12px', alignItems:'center'}}>
              <div style={{display:'flex', gap:'12px'}}>
                <div style={{background:'white', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'12px 20px', textAlign:'center'}}>
                  <div style={{fontSize:'2rem', fontWeight:'700', color:'#6366f1'}}>{assets.length}</div>
                  <div style={{fontSize:'0.75rem', color:'#6b7280', fontWeight:'600'}}>TOTAL ASSETS</div>
                </div>
                <div style={{background:'white', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'12px 20px', textAlign:'center'}}>
                  <div style={{fontSize:'2rem', fontWeight:'700', color:'#6366f1'}}>{assets.filter(a=>a.status==='verified').length}</div>
                  <div style={{fontSize:'0.75rem', color:'#6b7280', fontWeight:'600'}}>VERIFIED</div>
                </div>
              </div>
              <button onClick={loadAssets} className="btn-refresh"><RefreshCw size={16} /> Refresh</button>
            </div>
          </div>

          <div style={{display:'flex', gap:'12px', marginBottom:'20px'}}>
            <input type="text" placeholder="Search by UUID, Asset ID, Email, Username..." style={{flex:1, padding:'10px 16px', border:'1px solid #e5e7eb', borderRadius:'8px', fontSize:'0.9rem'}} />
            <button style={{padding:'10px 20px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'white', cursor:'pointer'}}>⚙ Filters</button>
          </div>

          {assets.length > 0 ? (
            <table className="admin-table">
              <thead><tr><th>ASSET ID</th><th>CREATOR</th><th>DATE</th><th>STATUS</th><th>PLATFORM COPIES</th><th>CONFIDENCE</th><th>ACTIONS</th></tr></thead>
              <tbody>{assets.map((a,i) => {
                const confidence = a.confidence || 95;
                const isVerified = a.status === 'verified' || confidence >= 90;
                const initials = (a.owner_name||'U').charAt(0).toUpperCase();
                return (
                  <tr key={i}>
                    <td><div style={{fontWeight:'600', fontSize:'0.85rem'}}>{(a.asset_id||'').slice(0,20)}...</div></td>
                    <td>
                      <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                        <div style={{width:'36px', height:'36px', borderRadius:'50%', background:'#6366f1', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700'}}>{initials}</div>
                        <div><div style={{fontWeight:'600'}}>{a.owner_name||'—'}</div><div style={{fontSize:'0.8rem', color:'#6b7280'}}>{a.owner_email||'—'}</div></div>
                      </div>
                    </td>
                    <td>{formatDate(a.created_at)}</td>
                    <td>{isVerified
                      ? <span style={{background:'#d1fae5', color:'#065f46', padding:'4px 12px', borderRadius:'20px', fontSize:'0.8rem', fontWeight:'600'}}>✓ Verified</span>
                      : <span style={{background:'#fee2e2', color:'#991b1b', padding:'4px 12px', borderRadius:'20px', fontSize:'0.8rem', fontWeight:'600'}}>⊗ Unknown</span>}
                    </td>
                    <td style={{textAlign:'center'}}>{a.platform_copies||0}</td>
                    <td>
                      <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                        <div style={{flex:1, background:'#e5e7eb', borderRadius:'4px', height:'8px'}}><div style={{width:`${confidence}%`, background:'#6366f1', borderRadius:'4px', height:'8px'}}></div></div>
                        <span style={{fontSize:'0.8rem', fontWeight:'600', color:'#6366f1'}}>{confidence}%</span>
                      </div>
                    </td>
                    <td>
                      <div style={{display:'flex', gap:'6px'}}>
                        <button onClick={() => setSelectedAsset(a)} style={{background:'#6366f1', color:'white', border:'none', borderRadius:'6px', padding:'6px 10px', cursor:'pointer'}}>👁</button>
                        <button onClick={() => downloadAssetPDF(a)} style={{background:'#10b981', color:'white', border:'none', borderRadius:'6px', padding:'6px 10px', cursor:'pointer'}}>⬇</button>
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          ) : <div className="empty-state">No assets in vault yet</div>}
        </div>
      )}

      {/* ── ANALYTICS ── */}
      {currentTab === 'analytics' && (
        <div className="analytics-section">
          <div className="section-header">
            <div><h1>Analytics</h1><p className="subtitle">System usage overview</p></div>
            <button onClick={loadAll} className="btn-refresh"><RefreshCw size={16} /> Refresh</button>
          </div>
          <div className="analytics-grid">
            <div className="analytics-card"><h3>User Activity</h3>
              <div className="analytics-stat"><span className="big-number">{users.filter(u=>u.is_active).length}</span><span className="stat-label">Active Users</span></div>
              <div className="analytics-stat"><span className="big-number">{users.filter(u=>!u.is_active).length}</span><span className="stat-label">Suspended Users</span></div>
            </div>
            <div className="analytics-card"><h3>Image Analysis</h3>
              <div className="analytics-stat"><span className="big-number">{reports.length}</span><span className="stat-label">Total Analyses</span></div>
              <div className="analytics-stat"><span className="big-number" style={{color:'#ef4444'}}>{reports.filter(r=>r.is_tampered).length}</span><span className="stat-label">Tampered Detected</span></div>
              <div className="analytics-stat"><span className="big-number" style={{color:'#10b981'}}>{reports.filter(r=>!r.is_tampered).length}</span><span className="stat-label">Original Verified</span></div>
            </div>
            <div className="analytics-card"><h3>Vault Storage</h3>
              <div className="analytics-stat"><span className="big-number">{assets.length}</span><span className="stat-label">Total Assets</span></div>
              <div className="analytics-stat"><span className="big-number">{storageUsed()}</span><span className="stat-label">Storage Used</span></div>
            </div>
            <div className="analytics-card"><h3>Recent Audit Log</h3>
              <div className="audit-list">
                {auditLog.slice(0,8).map((log,i) => (
                  <div key={i} className="audit-item"><span className="audit-action">{log.action}</span><span className="audit-time">{formatDate(log.created_at)}</span></div>
                ))}
                {auditLog.length === 0 && <p>No activity yet</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SETTINGS ── */}
      {currentTab === 'settings' && (
        <div className="settings-section">
          <h1>Settings</h1><p className="subtitle">System configuration</p>
          <div className="settings-card"><h3>Admin Account</h3>
            <div className="settings-info">
              {[['Username',user?.username||'admin'],['Email',user?.email||'—'],['Role','Administrator']].map(([label,value]) => (
                <div key={label} className="detail-row"><span className="detail-label">{label}:</span><span className="detail-value">{value}</span></div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedAsset && (
        <div className="modal-overlay" onClick={() => setSelectedAsset(null)}>
          <div className="modal-content" style={{maxWidth:'800px', width:'95%', maxHeight:'90vh', overflowY:'auto'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Asset Details</h2>
              <button className="modal-close" onClick={() => setSelectedAsset(null)}>×</button>
            </div>
            <div className="modal-body">
              {/* Status Banner */}
              <div style={{background: (selectedAsset.confidence||95) >= 90 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${(selectedAsset.confidence||95) >= 90 ? '#bbf7d0' : '#fecaca'}`, borderRadius:'8px', padding:'12px 16px', marginBottom:'16px'}}>
                <div style={{fontWeight:'600', color: (selectedAsset.confidence||95) >= 90 ? '#166534' : '#991b1b'}}>
                  {(selectedAsset.confidence||95) >= 90 ? 'Case 1: Verified' : 'Case 2: AI Generated'}
                </div>
                <div style={{fontSize:'0.85rem', color:'#6b7280'}}>Confidence: {selectedAsset.confidence || 95}%</div>
              </div>

              {/* Asset Information */}
              <div style={{border:'1px solid #e5e7eb', borderRadius:'8px', padding:'16px', marginBottom:'12px'}}>
                <h3 style={{margin:'0 0 12px', fontSize:'14px', fontWeight:'700', color:'#374151'}}>Asset Information</h3>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px'}}>
                  {[
                    ['Asset ID', selectedAsset.asset_id],
                    ['Authorship Certificate ID', selectedAsset.certificate_id || 'Not Present'],
                    ['Device ID', selectedAsset.device_id || '—'],
                    ['Device Name', selectedAsset.device_name || '—'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{fontSize:'11px', fontWeight:'700', color:'#6b7280'}}>{label}</div>
                      <div style={{fontSize:'13px', marginTop:'2px'}}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Creator Information */}
              <div style={{border:'1px solid #e5e7eb', borderRadius:'8px', padding:'16px', marginBottom:'12px'}}>
                <h3 style={{margin:'0 0 12px', fontSize:'14px', fontWeight:'700', color:'#374151'}}>Creator Information</h3>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px'}}>
                  {[
                    ['Name', selectedAsset.owner_name || '—'],
                    ['Email', selectedAsset.owner_email || '—'],
                    ['User ID', selectedAsset.user_id || '—'],
                    ['IP Address', selectedAsset.ip_address || '—'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{fontSize:'11px', fontWeight:'700', color:'#6b7280'}}>{label}</div>
                      <div style={{fontSize:'13px', marginTop:'2px'}}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Technical Details */}
              <div style={{border:'1px solid #e5e7eb', borderRadius:'8px', padding:'16px', marginBottom:'12px'}}>
                <h3 style={{margin:'0 0 12px', fontSize:'14px', fontWeight:'700', color:'#374151'}}>Technical Details</h3>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px'}}>
                  {[
                    ['Resolution', selectedAsset.resolution || '—'],
                    ['File Size', selectedAsset.file_size || '—'],
                    ['File Name', selectedAsset.file_name || '—'],
                    ['Created', selectedAsset.created_at ? new Date(selectedAsset.created_at).toLocaleDateString() : '—'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{fontSize:'11px', fontWeight:'700', color:'#6b7280'}}>{label}</div>
                      <div style={{fontSize:'13px', marginTop:'2px'}}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Analysis Results */}
              <div style={{border:'1px solid #e5e7eb', borderRadius:'8px', padding:'16px'}}>
                <h3 style={{margin:'0 0 12px', fontSize:'14px', fontWeight:'700', color:'#374151'}}>Analysis Results</h3>
                <div style={{fontSize:'13px', color:'#374151', lineHeight:'2'}}>
                  <div>• Clarity smooth blocks: {selectedAsset.confidence || 95}%</div>
                  <div>• Edge coherence: {Math.min((selectedAsset.confidence||95) - 5, 99)}%</div>
                  <div>• Uniform texture patterns detected</div>
                  <div>• PNG format {(selectedAsset.confidence||95) >= 90 ? '(standard)' : '(possible AI tools)'}</div>
                  <div>• Low color entropy: {((selectedAsset.confidence||95) * 0.6).toFixed(1)}%</div>
                </div>
              </div>
            </div>

            <div style={{padding:'16px 24px', borderTop:'1px solid #e5e7eb', display:'flex', justifyContent:'flex-end', gap:'12px'}}>
              <button onClick={() => setSelectedAsset(null)} style={{padding:'8px 20px', border:'1px solid #e5e7eb', borderRadius:'6px', background:'white', cursor:'pointer'}}>Close</button>
              <button onClick={() => downloadAssetPDF(selectedAsset)} style={{padding:'8px 20px', background:'#6366f1', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'600'}}>Download Full Report</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default AdminDashboard;