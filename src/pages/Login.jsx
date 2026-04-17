import React, { useState } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        window.location.href = '/dashboard';
      } else {
        setError('Invalid credentials');
      }
    } catch (err) {
      setError('Connection failed');
    }
  };

  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(160deg, #0d1b3e 0%, #0a0f1e 100%)',
      padding: '20px'
    }}>
      <div style={{
        background: 'rgba(15, 22, 41, 0.9)',
        padding: '32px',
        borderRadius: '24px',
        width: '100%',
        maxWidth: '400px',
        border: '1px solid rgba(255,255,255,0.08)'
      }}>
        <h2 style={{ color: '#fff', marginBottom: '8px', fontSize: '24px' }}>Welcome Back</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '24px', fontSize: '14px' }}>Please enter your details to sign in.</p>
        
        {error && <div style={{ color: '#f43f5e', marginBottom: '16px', fontSize: '14px' }}>{error}</div>}
        
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '12px', marginBottom: '6px' }}>Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="melloomedia@gmail.com"
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                color: '#fff',
                outline: 'none'
              }}
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '12px', marginBottom: '6px' }}>Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                color: '#fff',
                outline: 'none'
              }}
            />
          </div>
          <button type="submit" style={{
            width: '100%',
            padding: '14px',
            background: '#6366f1',
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            fontWeight: '700',
            fontSize: '16px'
          }}>Sign In</button>
        </form>
      </div>
    </div>
  );
}
