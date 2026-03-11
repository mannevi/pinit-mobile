import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Login.css';

function Login({ onLogin }) {
  const [isAdmin,            setIsAdmin]            = useState(false);
  const [formData,           setFormData]           = useState({ email: '', username: '', password: '' });
  const [error,              setError]              = useState('');
  const [loading,            setLoading]            = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkBiometric();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const checkBiometric = async () => {
    try {
      // Check if device supports biometric (works on Android WebView/Capacitor)
      const hasBiometric =
        window.PublicKeyCredential &&
        await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

      if (hasBiometric) {
        setBiometricAvailable(true);
        // Auto-trigger if user was previously logged in
        const savedToken = localStorage.getItem('savedToken');
        const savedUser  = localStorage.getItem('savedUser');
        if (savedToken && savedUser) {
          handleBiometricLogin();
        }
      }
    } catch (e) {
      setBiometricAvailable(false);
    }
  };

  const handleBiometricLogin = async () => {
    try {
      const savedToken = localStorage.getItem('savedToken');
      const savedUser  = JSON.parse(localStorage.getItem('savedUser') || '{}');

      if (!savedToken || !savedUser.id) {
        setError('Please login with password first to enable biometrics.');
        return;
      }

      // Use device biometric via WebAuthn API
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge        : new Uint8Array(32),
          rpId             : window.location.hostname,
          userVerification : 'required',
          timeout          : 60000
        }
      });

      if (credential) {
        // Biometric passed
        localStorage.setItem('userUUID', savedUser.id);
        onLogin(savedUser, savedToken);
        navigate(savedUser.role === 'admin' ? '/admin/dashboard' : '/user/dashboard');
      }

    } catch (e) {
      if (e.name === 'NotAllowedError') {
        setError('Biometric cancelled. Please use your password.');
      } else {
        // Fallback — just login with saved token directly
        const savedToken = localStorage.getItem('savedToken');
        const savedUser  = JSON.parse(localStorage.getItem('savedUser') || '{}');
        if (savedToken && savedUser.id) {
          localStorage.setItem('userUUID', savedUser.id);
          onLogin(savedUser, savedToken);
          navigate(savedUser.role === 'admin' ? '/admin/dashboard' : '/user/dashboard');
        } else {
          setError('Biometric failed. Please use your password.');
        }
      }
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isAdmin ? '/auth/admin-login' : '/auth/login';
      const body     = isAdmin
        ? { username: formData.username, password: formData.password }
        : { email: formData.email,       password: formData.password };

      const res  = await fetch(`https://pinit-backend.onrender.com${endpoint}`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(body)
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Invalid credentials');
        return;
      }

      // Save for future biometric login
      localStorage.setItem('savedToken', data.access_token);
      localStorage.setItem('savedUser',  JSON.stringify(data.user));
      localStorage.setItem('userUUID',   data.user.id);
      localStorage.setItem(`lastLogin_${data.user.email}`, new Date().toISOString());

      onLogin(data.user, data.access_token);
      navigate(data.user.role === 'admin' ? '/admin/dashboard' : '/user/dashboard');

    } catch (err) {
      setError('Cannot connect to server. Please make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleTabSwitch = (adminTab) => {
    setIsAdmin(adminTab);
    setFormData({ email: '', username: '', password: '' });
    setError('');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Image Forensics App</h1>
          <p>Analyze and detect image manipulations</p>
        </div>

        <div className="tabs">
          <button className={`tab ${!isAdmin ? 'active' : ''}`} onClick={() => handleTabSwitch(false)}>
            User Login
          </button>
          <button className={`tab ${isAdmin ? 'active' : ''}`} onClick={() => handleTabSwitch(true)}>
            Admin Login
          </button>
        </div>

        {/* Biometric button — only shows on mobile with biometric enrolled */}
        {biometricAvailable && !isAdmin && (
          <button
            onClick={handleBiometricLogin}
            style={{
              width         : '100%',
              padding       : '12px',
              marginBottom  : '16px',
              background    : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color         : 'white',
              border        : 'none',
              borderRadius  : '8px',
              fontSize      : '16px',
              fontWeight    : '600',
              cursor        : 'pointer',
              display       : 'flex',
              alignItems    : 'center',
              justifyContent: 'center',
              gap           : '8px'
            }}
          >
            👆 Login with Fingerprint / Face
          </button>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}

          {isAdmin ? (
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input type="text" id="username" name="username" value={formData.username}
                onChange={handleChange} placeholder="Enter admin username" required />
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input type="email" id="email" name="email" value={formData.email}
                onChange={handleChange} placeholder="Enter your email" required />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input type="password" id="password" name="password" value={formData.password}
              onChange={handleChange} placeholder="Enter your password" required />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>

          {!isAdmin && (
            <div className="register-link">
              Don't have an account? <Link to="/register">Register here</Link>
            </div>
          )}
          {isAdmin && (
            <div className="admin-info">
              <small>Contact admin for credentials</small>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default Login;