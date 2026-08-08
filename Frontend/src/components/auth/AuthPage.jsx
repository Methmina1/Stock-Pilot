import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function AuthPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [mode, setMode] = useState('signin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [signInForm, setSignInForm] = useState({ email: '', password: '' });
  const [signUpForm, setSignUpForm] = useState({ full_name: '', email: '', password: '', confirm: '', role: 'investor' });

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(signInForm.email, signInForm.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    if (signUpForm.password !== signUpForm.confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (signUpForm.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await register(signUpForm.full_name, signUpForm.email, signUpForm.password, signUpForm.role);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-view">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="mark">SP</div>
          Stock<span>Pilot</span>
        </div>
        <div className="auth-tag">
          {mode === 'signin' ? 'Sign in to your account' : 'Create your StockPilot account'}
        </div>

        <div className="auth-tabs">
          <button className={mode === 'signin' ? 'on' : ''} onClick={() => { setMode('signin'); setError(''); }}>
            Sign in
          </button>
          <button className={mode === 'signup' ? 'on' : ''} onClick={() => { setMode('signup'); setError(''); }}>
            Create account
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {mode === 'signin' ? (
          <form className="auth-form" onSubmit={handleSignIn}>
            <div className="a-field">
              <label>Email address</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={signInForm.email}
                onChange={(e) => setSignInForm({ ...signInForm, email: e.target.value })}
              />
            </div>
            <div className="a-field">
              <label>Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={signInForm.password}
                onChange={(e) => setSignInForm({ ...signInForm, password: e.target.value })}
              />
            </div>
            <div className="a-row">
              <label className="a-check">
                <input type="checkbox" defaultChecked /> Keep me signed in
              </label>
            </div>
            <button className="a-submit" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleSignUp}>
            <div className="a-field">
              <label>Full name</label>
              <input
                type="text"
                required
                placeholder="Your name"
                autoComplete="name"
                value={signUpForm.full_name}
                onChange={(e) => setSignUpForm({ ...signUpForm, full_name: e.target.value })}
              />
            </div>
            <div className="a-field">
              <label>I am registering as</label>
              <div className="a-role-group">
                {[
                  { value: 'investor', label: 'Investor', hint: 'Track a portfolio and get AI verdicts' },
                  { value: 'analyst', label: 'Financial Analyst', hint: 'Build and publish strategies' },
                ].map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    className={`a-role${signUpForm.role === opt.value ? ' on' : ''}`}
                    onClick={() => setSignUpForm({ ...signUpForm, role: opt.value })}
                  >
                    <span className="a-role-label">{opt.label}</span>
                    <span className="a-role-hint">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="a-field">
              <label>Email address</label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                autoComplete="email"
                value={signUpForm.email}
                onChange={(e) => setSignUpForm({ ...signUpForm, email: e.target.value })}
              />
            </div>
            <div className="a-field">
              <label>Password</label>
              <input
                type="password"
                required
                placeholder="At least 8 characters"
                autoComplete="new-password"
                value={signUpForm.password}
                onChange={(e) => setSignUpForm({ ...signUpForm, password: e.target.value })}
              />
            </div>
            <div className="a-field">
              <label>Confirm password</label>
              <input
                type="password"
                required
                placeholder="Repeat password"
                autoComplete="new-password"
                value={signUpForm.confirm}
                onChange={(e) => setSignUpForm({ ...signUpForm, confirm: e.target.value })}
              />
            </div>
            <button className="a-submit" type="submit" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        )}

        <div className="auth-switch">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <a onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </a>
        </div>
      </div>
    </div>
  );
}
