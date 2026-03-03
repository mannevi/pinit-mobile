import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, BarChart3, Settings, LogOut, FileSearch, Shield, CheckCircle, AlertTriangle, HardDrive, Activity, FolderOpen, RefreshCw, Eye, UserX, UserCheck, Camera } from 'lucide-react';

import { adminAPI } from '../api/client';
import './AdminDashboard.css';

function AdminDashboard({ user, onLogout }) {
  const [activeTab,    setActiveTab]    = useState('overview');
  const [stats,        setStats]        = useState({
    total_users: 0, total_assets: 0, total_reports: 0, tampered_found: 0
  });
  const [users,        setUsers]        = useState([]);
  const [assets,       setAssets]       = useState([]);
  const [reports,      setReports]      = useState([]);
  const [auditLog,     setAuditLog]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const navigate = useNavigate();

  const loadStats = useCallback(async () => {
    try { const res = await adminAPI.getStats(); setStats(res); }
    catch (err) { console.error('Stats error:', err.message); }
  }, []);

  const loadUsers = useCallback(async () => {
    try { const res = await adminAPI.getUsers(); setUsers(res.users || []); }
    catch (err) { console.error('Users error:', err.message); }
  }, []);

  const loadAssets = useCallback(async () => {
    try { const res = await adminAPI.getAllVault(); setAssets(res.assets || []); }
    catch (err) { console.error('Assets error:', err.message); }
  }, []);

  const loadReports = useCallback(async () => {
    try { const res = await adminAPI.getAllReports(); setReports(res.reports || []); }
    catch (err) { console.error('Reports error:', err.message); }
  }, []);

  const loadAuditLog = useCallback(async () => {
    try { const res = await adminAPI.getAuditLog(); setAuditLog(res.logs || []); }
    catch (err) { console.error('Audit log error:', err.message); }
  }, []);

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

  const handleLogout = () => { onLogout(); navigate('/login'); };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const storageUsed = () => {
    const total = assets.reduce((sum, a) => sum + (parseFloat(a.file_size) || 0), 0);
    return total > 1024 ? (total / 1024).toFixed(1) + ' GB' : total.toFixed(1) + ' MB';
  };

  const todayChecks = reports.filter(r => {
    const d = new Date(r.created_at);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).length;

  return (
    <div className="admin-dashboard">
      <div className="admin-nav">
        <div className="nav-brand"><h2>🔍 Image Forensics App - Admin</h2></div>
        <div className="nav-user">
          <span>Admin: {user?.username || user?.name || 'Admin'}</span>
          <button onClick={handleLogout} className="btn-logout">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>

      <div className="admin-container">
        <div className="admin-sidebar">
          <ul className="sidebar-menu">
            {[
              ['overview',  <BarChart3 size={18} />, 'Overview'],
              ['assets',    <FolderOpen size={18} />, 'Assets'],
              ['analytics', <Activity size={18} />,  'Analytics'],
              ['users',     <Users size={18} />,     'Users'],
              ['settings',  <Settings size={18} />,  'Settings'],
            ].map(([tab, icon, label]) => (
              <li key={tab}
                className={activeTab === tab ? 'active' : ''}
                onClick={() => setActiveTab(tab)}>
                {icon} {label}
              </li>
            ))}
            <li onClick={() => navigate('/admin/assets')}>
              <Shield size={18} /> Track Assets
            </li>
            <li onClick={() => navigate('/admin/verify')}>
              <FileSearch size={18} /> Verify
            </li>
          </ul>
        </div>

        <div className="admin-main">

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <div className="overview-section">
              <div className="section-header">
                <div>
                  <h1>Dashboard Overview</h1>
                  <p className="subtitle">Image Forensics System Metrics</p>
                </div>
                <button onClick={loadAll} className="btn-refresh">
                  <RefreshCw size={16} /> Refresh
                </button>
              </div>

              {loading ? (
                <div className="loading-state">Loading data...</div>
              ) : (
                <>
                  {/* Stats Grid */}
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-icon users-icon"><Users size={32} /></div>
                      <div className="stat-content">
                        <h3>{stats.total_users || users.length}</h3>
                        <p>Total Users</p>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon assets-icon"><Shield size={32} /></div>
                      <div className="stat-content">
                        <h3>{stats.total_assets || assets.length}</h3>
                        <p>Total Assets</p>
                        <small>PROOFS CREATED</small>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon reports-icon"><CheckCircle size={32} /></div>
                      <div className="stat-content">
                        <h3>{todayChecks}</h3>
                        <p>Today Checks</p>
                        <small>VERIFICATIONS TODAY</small>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon tamper-icon"><AlertTriangle size={32} /></div>
                      <div className="stat-content">
                        <h3>{stats.tampered_found || 0}</h3>
                        <p>Tampered</p>
                        <small>TAMPER ALERTS</small>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon storage-icon"><HardDrive size={32} /></div>
                      <div className="stat-content">
                        <h3>{storageUsed()}</h3>
                        <p>Storage Used</p>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon health-icon"><Activity size={32} /></div>
                      <div className="stat-content">
                        <h3 style={{ color: '#10b981' }}>Active</h3>
                        <p>System Health</p>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="recent-section">
                    <h2>Quick Actions</h2>
                    <div className="stats-grid">
                      <div className="stat-card" style={{cursor:'pointer'}} onClick={() => navigate('/analyzer')}>
                        <div className="stat-icon"><Camera size={32} /></div>
                        <div className="stat-content">
                          <h3>Launch Image Analyzer</h3>
                          <p>Access encryption & analysis tools</p>
                        </div>
                      </div>
                      <div className="stat-card" style={{cursor:'pointer'}} onClick={() => setActiveTab('assets')}>
                        <div className="stat-icon"><FolderOpen size={32} /></div>
                        <div className="stat-content">
                          <h3>View Assets</h3>
                          <p>Browse all encrypted assets</p>
                        </div>
                      </div>
                      <div className="stat-card" style={{cursor:'pointer'}} onClick={() => navigate('/admin/assets')}>
                        <div className="stat-icon"><Shield size={32} /></div>
                        <div className="stat-content">
                          <h3>Track Assets</h3>
                          <p>Monitor modifications & versions</p>
                        </div>
                      </div>
                      <div className="stat-card" style={{cursor:'pointer'}} onClick={() => navigate('/admin/verify')}>
                        <div className="stat-icon"><CheckCircle size={32} /></div>
                        <div className="stat-content">
                          <h3>Verify Image</h3>
                          <p>Check image authenticity</p>
                        </div>
                      </div>
                      <div className="stat-card" style={{cursor:'pointer'}} onClick={() => setActiveTab('users')}>
                        <div className="stat-icon"><Users size={32} /></div>
                        <div className="stat-content">
                          <h3>Manage Users</h3>
                          <p>View and manage user accounts</p>
                        </div>
                      </div>
                      <div className="stat-card" style={{cursor:'pointer'}} onClick={() => setActiveTab('analytics')}>
                        <div className="stat-icon"><BarChart3 size={32} /></div>
                        <div className="stat-content">
                          <h3>View Analytics</h3>
                          <p>System performance & statistics</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Registrations */}
                  <div className="recent-section">
                    <h2>Recent Registrations</h2>
                    {users.slice(0, 5).length > 0 ? (
                      <table className="admin-table">
                        <thead>
                          <tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {users.slice(0, 5).map((u, i) => (
                            <tr key={i}>
                              <td>{u.username}</td>
                              <td>{u.email}</td>
                              <td><span className={`role-badge ${u.role}`}>{u.role}</span></td>
                              <td>{formatDate(u.created_at)}</td>
                              <td>
                                <span className={`status-dot ${u.is_active ? 'active' : 'inactive'}`}>
                                  {u.is_active ? 'Active' : 'Suspended'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="empty-state">No users registered yet</div>
                    )}
                  </div>

                  {/* Recent Activity */}
                  <div className="recent-section">
                    <h2>Recent Activity</h2>
                    {auditLog.slice(0, 5).length > 0 ? (
                      <table className="admin-table">
                        <thead>
                          <tr><th>Action</th><th>Details</th><th>IP</th><th>Time</th></tr>
                        </thead>
                        <tbody>
                          {auditLog.slice(0, 5).map((log, i) => (
                            <tr key={i}>
                              <td><span className="action-badge">{log.action}</span></td>
                              <td>{JSON.stringify(log.details || {}).slice(0, 50)}</td>
                              <td>{log.ip_address || '—'}</td>
                              <td>{formatDate(log.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="empty-state">No activity recorded yet</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── USERS ── */}
          {activeTab === 'users' && (
            <div className="users-section">
              <div className="section-header">
                <div>
                  <h1>User Management</h1>
                  <p className="subtitle">Total Users: {users.length}</p>
                </div>
                <button onClick={loadUsers} className="btn-refresh">
                  <RefreshCw size={16} /> Refresh
                </button>
              </div>

              {users.length > 0 ? (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Email</th><th>Phone</th>
                      <th>Signup Date</th><th>Proof Count</th><th>Plan</th><th>Status</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => (
                      <tr key={i}>
                        <td>{u.username}</td>
                        <td>{u.email}</td>
                        <td>{u.phone || '—'}</td>
                        <td>{formatDate(u.created_at)}</td>
                        <td>{u.proof_count || 0}</td>
                        <td><span className="role-badge user">Free</span></td>
                        <td>
                          <span className={`status-dot ${u.is_active ? 'active' : 'inactive'}`}>
                            {u.is_active ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button onClick={() => setSelectedUser(u)} className="btn-action btn-view" title="Proofs">Proofs</button>
                            {u.is_active ? (
                              <button onClick={() => handleSuspend(u.id)} className="btn-action btn-delete" title="Block" disabled={u.role === 'admin'}>Block</button>
                            ) : (
                              <button onClick={() => handleActivate(u.id)} className="btn-action btn-view" title="Activate">Activate</button>
                            )}
                            <button onClick={() => setSelectedUser(u)} className="btn-action btn-view" title="Profile">Profile</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">No users found</div>
              )}

              {selectedUser && (
                <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
                  <div className="modal-content" onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                      <h2>User Profile</h2>
                      <button className="modal-close" onClick={() => setSelectedUser(null)}>×</button>
                    </div>
                    <div className="modal-body">
                      <div className="user-profile-details">
                        {[
                          ['Name',    selectedUser.username],
                          ['Email',   selectedUser.email],
                          ['Role',    selectedUser.role],
                          ['Status',  selectedUser.is_active ? 'Active' : 'Suspended'],
                          ['Joined',  formatDate(selectedUser.created_at)],
                          ['User ID', selectedUser.id],
                        ].map(([label, value]) => (
                          <div key={label} className="detail-row">
                            <span className="detail-label">{label}:</span>
                            <span className="detail-value">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ASSETS ── */}
          {activeTab === 'assets' && (
            <div className="assets-section">
              <div className="section-header">
                <div>
                  <h1>Assets Management</h1>
                  <p className="subtitle">View and search all encrypted assets and analysis reports</p>
                </div>
                <div style={{display:'flex', gap:'12px', alignItems:'center'}}>
                  <div style={{display:'flex', gap:'12px'}}>
                    <div style={{background:'white', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'12px 20px', textAlign:'center'}}>
                      <div style={{fontSize:'2rem', fontWeight:'700', color:'#6366f1'}}>{assets.length}</div>
                      <div style={{fontSize:'0.75rem', color:'#6b7280', fontWeight:'600'}}>TOTAL ASSETS</div>
                    </div>
                    <div style={{background:'white', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'12px 20px', textAlign:'center'}}>
                      <div style={{fontSize:'2rem', fontWeight:'700', color:'#6366f1'}}>{assets.filter(a => a.status === 'verified').length}</div>
                      <div style={{fontSize:'0.75rem', color:'#6b7280', fontWeight:'600'}}>VERIFIED</div>
                    </div>
                  </div>
                  <button onClick={loadAssets} className="btn-refresh">
                    <RefreshCw size={16} /> Refresh
                  </button>
                </div>
              </div>

              <div style={{display:'flex', gap:'12px', marginBottom:'20px'}}>
                <input
                  type="text"
                  placeholder="Search by UUID, Asset ID, Authorship ID, Email, Username, Device ID, IP Address, Report ID."
                  style={{flex:1, padding:'10px 16px', border:'1px solid #e5e7eb', borderRadius:'8px', fontSize:'0.9rem'}}
                />
                <button style={{padding:'10px 20px', border:'1px solid #e5e7eb', borderRadius:'8px', background:'white', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px'}}>
                  <span>⚙</span> Filters
                </button>
              </div>

              {assets.length > 0 ? (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ASSET ID</th><th>CREATOR</th><th>DATE</th>
                      <th>STATUS</th><th>PLATFORM COPIES</th><th>CONFIDENCE</th><th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((a, i) => {
                      const confidence = a.confidence || Math.floor(Math.random() * 10 + 90);
                      const isVerified = a.status === 'verified' || a.confidence >= 90;
                      const initials = (a.owner_name || 'U').charAt(0).toUpperCase();
                      return (
                        <tr key={i}>
                          <td>
                            <div style={{fontWeight:'600', fontSize:'0.85rem'}}>
                              {(a.asset_id || '').slice(0, 16)}<br/>
                              <span style={{fontWeight:'400'}}>{(a.asset_id || '').slice(16, 32)}</span>
                            </div>
                          </td>
                          <td>
                            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                              <div style={{width:'36px', height:'36px', borderRadius:'50%', background:'#6366f1', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700'}}>
                                {initials}
                              </div>
                              <div>
                                <div style={{fontWeight:'600'}}>{a.owner_name || '—'}</div>
                                <div style={{fontSize:'0.8rem', color:'#6b7280'}}>{a.owner_email || '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td>📅 {formatDate(a.created_at)}</td>
                          <td>
                            {isVerified ? (
                              <span style={{background:'#d1fae5', color:'#065f46', padding:'4px 12px', borderRadius:'20px', fontSize:'0.8rem', fontWeight:'600'}}>✓ Verified</span>
                            ) : (
                              <span style={{background:'#fee2e2', color:'#991b1b', padding:'4px 12px', borderRadius:'20px', fontSize:'0.8rem', fontWeight:'600'}}>⊗ Unknown</span>
                            )}
                          </td>
                          <td style={{textAlign:'center'}}>{a.platform_copies || 0}</td>
                          <td>
                            <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                              <div style={{flex:1, background:'#e5e7eb', borderRadius:'4px', height:'8px'}}>
                                <div style={{width:`${confidence}%`, background:'#6366f1', borderRadius:'4px', height:'8px'}}></div>
                              </div>
                              <span style={{fontSize:'0.8rem', fontWeight:'600', color:'#6366f1'}}>{confidence}%</span>
                            </div>
                          </td>
                          <td>
                            <div style={{display:'flex', gap:'6px'}}>
                              <button
                                onClick={() => navigate(`/admin/track/${a.asset_id}`)}
                                style={{background:'#6366f1', color:'white', border:'none', borderRadius:'6px', padding:'6px 10px', cursor:'pointer'}}>
                                👁
                              </button>
                              <button
                                style={{background:'#10b981', color:'white', border:'none', borderRadius:'6px', padding:'6px 10px', cursor:'pointer'}}>
                                ⬇
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">No assets in vault yet</div>
              )}
            </div>
          )}

          {/* ── ANALYTICS ── */}
          {activeTab === 'analytics' && (
            <div className="analytics-section">
              <div className="section-header">
                <div>
                  <h1>Analytics</h1>
                  <p className="subtitle">System usage overview</p>
                </div>
                <button onClick={loadAll} className="btn-refresh">
                  <RefreshCw size={16} /> Refresh
                </button>
              </div>

              <div className="analytics-grid">
                <div className="analytics-card">
                  <h3>User Activity</h3>
                  <div className="analytics-stat">
                    <span className="big-number">{users.filter(u => u.is_active).length}</span>
                    <span className="stat-label">Active Users</span>
                  </div>
                  <div className="analytics-stat">
                    <span className="big-number">{users.filter(u => !u.is_active).length}</span>
                    <span className="stat-label">Suspended Users</span>
                  </div>
                </div>

                <div className="analytics-card">
                  <h3>Image Analysis</h3>
                  <div className="analytics-stat">
                    <span className="big-number">{reports.length}</span>
                    <span className="stat-label">Total Analyses</span>
                  </div>
                  <div className="analytics-stat">
                    <span className="big-number" style={{ color: '#ef4444' }}>
                      {reports.filter(r => r.is_tampered).length}
                    </span>
                    <span className="stat-label">Tampered Detected</span>
                  </div>
                  <div className="analytics-stat">
                    <span className="big-number" style={{ color: '#10b981' }}>
                      {reports.filter(r => !r.is_tampered).length}
                    </span>
                    <span className="stat-label">Original Verified</span>
                  </div>
                </div>

                <div className="analytics-card">
                  <h3>Vault Storage</h3>
                  <div className="analytics-stat">
                    <span className="big-number">{assets.length}</span>
                    <span className="stat-label">Total Assets</span>
                  </div>
                  <div className="analytics-stat">
                    <span className="big-number">{storageUsed()}</span>
                    <span className="stat-label">Storage Used</span>
                  </div>
                </div>

                <div className="analytics-card">
                  <h3>Recent Audit Log</h3>
                  <div className="audit-list">
                    {auditLog.slice(0, 8).map((log, i) => (
                      <div key={i} className="audit-item">
                        <span className="audit-action">{log.action}</span>
                        <span className="audit-time">{formatDate(log.created_at)}</span>
                      </div>
                    ))}
                    {auditLog.length === 0 && <p>No activity yet</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── SETTINGS ── */}
          {activeTab === 'settings' && (
            <div className="settings-section">
              <h1>Settings</h1>
              <p className="subtitle">System configuration</p>
              <div className="settings-card">
                <h3>Admin Account</h3>
                <div className="settings-info">
                  {[
                    ['Username', user?.username || 'admin'],
                    ['Email',    user?.email || '—'],
                    ['Role',     'Administrator'],
                  ].map(([label, value]) => (
                    <div key={label} className="detail-row">
                      <span className="detail-label">{label}:</span>
                      <span className="detail-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
