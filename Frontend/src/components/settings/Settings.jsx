import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';

const TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'security', label: 'Security' },
];

function profileFromUser(user) {
  const names = (user?.full_name || '').split(' ');
  return {
    first_name: names[0] || '', last_name: names.slice(1).join(' ') || '',
    email: user?.email || '', phone: user?.phone || '', bio: user?.bio || '',
  };
}

export default function Settings() {
  const [searchParams] = useSearchParams();
  const { user, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState(() =>
    TABS.some((tab) => tab.key === searchParams.get('tab')) ? searchParams.get('tab') : 'profile'
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [profileForm, setProfileForm] = useState(() => profileFromUser(user));

  const [passwordForm, setPasswordForm] = useState({
    current: '', new_password: '', confirm: '',
  });

  useEffect(() => {
    if (user) {
      setProfileForm(profileFromUser(user));
    }
  }, [user]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    setActiveTab(tab && TABS.some((t) => t.key === tab) ? tab : 'profile');
  }, [searchParams]);

  const handleSaveProfile = async () => {
    setSaving(true);
    setMessage('');
    try {
      const { data } = await api.put('/api/v1/users/me', {
        full_name: `${profileForm.first_name} ${profileForm.last_name}`.trim(),
        email: profileForm.email,
        phone: profileForm.phone,
        bio: profileForm.bio,
      });
      updateUser(data);
      setMessage('Profile saved successfully.');
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (passwordForm.new_password !== passwordForm.confirm) {
      setMessage('Passwords do not match.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await api.put('/api/v1/users/me/password', {
        current_password: passwordForm.current,
        new_password: passwordForm.new_password,
      });
      setMessage('Password updated successfully.');
      setPasswordForm({ current: '', new_password: '', confirm: '' });
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Failed to update password.');
    } finally {
      setSaving(false);
    }
  };

  const fileInputRef = useRef(null);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setSaving(true);
    setMessage('');
    try {
      const { data } = await api.post('/api/v1/users/me/avatar', formData);
      updateUser(data);
      setMessage('Profile photo updated.');
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Failed to upload photo.');
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAvatarRemove = async () => {
    setSaving(true);
    setMessage('');
    try {
      const { data } = await api.delete('/api/v1/users/me/avatar');
      updateUser(data);
      setMessage('Profile photo removed.');
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Failed to remove photo.');
    } finally {
      setSaving(false);
    }
  };

  const initials = user?.full_name
    ? user.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : 'SP';

  const avatarUrl = user?.avatar_url || null;

  return (
    <div className="view-enter">
      <div className="eyebrow">Account</div>
      <h1 className="page">Settings</h1>
      <p className="lede">Manage your profile and security.</p>

      {message && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(212,168,83,.08)', border: '1px solid rgba(212,168,83,.25)', color: 'var(--accent)', fontSize: 13, fontFamily: 'var(--mono)' }}>
          {message}
        </div>
      )}

      <div className="settings-layout">
        <div className="settings-nav">
          {TABS.map((tab) => (
            <div key={tab.key} className={`s-item${activeTab === tab.key ? ' on' : ''}`} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </div>
          ))}
        </div>

        <div>
          {/* Profile */}
          {activeTab === 'profile' && (
            <div className="s-card">
              <h3>Profile</h3>
              <div className="s-sub">Your public information and account details.</div>
              <div className="avatar-row">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="avatar-circle" style={{ objectFit: 'cover' }} />
                ) : (
                  <div className="avatar-circle">{initials}</div>
                )}
                <div>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleAvatarUpload} />
                  <button className="btn primary" onClick={() => fileInputRef.current?.click()} disabled={saving}>Upload new photo</button>
                  <button className="btn" style={{ marginLeft: 6 }} onClick={handleAvatarRemove} disabled={saving || !avatarUrl}>Remove</button>
                  <div className="mini-note">JPG, PNG or WebP, up to 2 MB.</div>
                </div>
              </div>
              <div className="s-form" style={{ marginTop: 22 }}>
                <div><label>First name</label><input value={profileForm.first_name} onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })} /></div>
                <div><label>Last name</label><input value={profileForm.last_name} onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })} /></div>
                <div><label>Email address</label><input value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} /></div>
                <div><label>Phone number</label><input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} /></div>
                <div className="full"><label>Bio</label><textarea value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} /></div>
              </div>
              <div className="s-actions">
                <button className="btn primary" onClick={handleSaveProfile} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
                <button className="btn" onClick={() => { setProfileForm(profileFromUser(user)); setMessage(''); }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Security */}
          {activeTab === 'security' && (
            <>
              <div className="s-card">
                <h3>Password</h3>
                <div className="s-sub">Set a strong password to keep your account secure.</div>
                <div className="s-form">
                  <div className="full"><label>Current password</label><input type="password" value={passwordForm.current} onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })} /></div>
                  <div><label>New password</label><input type="password" placeholder="At least 8 characters" value={passwordForm.new_password} onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })} /></div>
                  <div><label>Confirm new password</label><input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} /></div>
                </div>
                <div className="s-actions"><button className="btn primary" onClick={handleUpdatePassword} disabled={saving}>Update password</button></div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
