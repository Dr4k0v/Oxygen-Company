import React, { useEffect, useMemo, useRef, useState } from 'react';

const products = [
  { id: 'aether-gs', name: 'Aether GS', rub: '1250 RUB', eur: '13 EUR', description: 'Our flagship version. Full access to every feature with the highest level of stability.' },
  { id: 'aether-nl', name: 'Aether NL', rub: '1000 RUB', eur: '10.5 EUR', description: 'Our flagship version for NL. Everything you need with the highest level of features and stability.' },
  { id: 'arcane-gs', name: 'Arcane GS', rub: '900 RUB', eur: '9 EUR', description: 'Arcane version for those who do not need strong anti-aiming and extensive functionality.' },
];

const rouletteRewards = [
  { id: 'nothing', label: 'Nothing', shortLabel: 'Nothing', weight: 96.5, color: '#191919' },
  { id: 'aether-7d', label: 'Oxygen Aether 7d', shortLabel: 'Aether 7d', weight: 0.5, color: '#353535' },
  { id: 'aether-1d', label: 'Oxygen Aether 1d', shortLabel: 'Aether 1d', weight: 0.5, color: '#3b3b3b' },
  { id: 'arcane-30d', label: 'Oxygen Arcane 3d', shortLabel: 'Arcane 3d', weight: 0.5, color: '#414141' },
  { id: 'arcane-7d', label: 'Oxygen Arcane 7d', shortLabel: 'Arcane 7d', weight: 0.5, color: '#474747' },
  { id: 'nl-7d', label: 'Oxygen NL 7d', shortLabel: 'NL 7d', weight: 0.5, color: '#505050' },
  { id: 'nl-1d', label: 'Oxygen NL 1d', shortLabel: 'NL 1d', weight: 0.5, color: '#595959' },
  { id: 'promo', label: '10% promo code', shortLabel: '10% OFF', weight: 0.5, color: '#292929' },
];

const DISCORD_INVITE = 'https://discord.gg/WbUUT4Rbm6';
const OWNER_LOGIN = 'drak0v';
const USERS_STORAGE_KEY = 'oxygen-store-users';
const SESSION_STORAGE_KEY = 'oxygen-store-session';
const DEVICE_STORAGE_KEY = 'oxygen-store-device';
const DEVICE_ACCOUNT_KEY = 'oxygen-store-device-account';
const CLAIMS_STORAGE_KEY = 'oxygen-store-roulette-claims';
const EVENTS_STORAGE_KEY = 'oxygen-store-events';
const ADMIN_SETTINGS_KEY = 'oxygen-store-admin-settings';
const PROMO_STATUS_KEY = 'oxygen-store-promo-status';
const GENERATED_CODES_KEY = 'oxygen-store-generated-codes';
const CUSTOM_REWARDS_KEY = 'oxygen-store-custom-rewards';
const TICKETS_STORAGE_KEY = 'oxygen-store-tickets';
const SPIN_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_ADMIN_SETTINGS = {
  enabled: true,
  weights: Object.fromEntries(rouletteRewards.map((reward) => [reward.id, reward.weight])),
};

const STORE_API_URL = import.meta.env.VITE_STORE_API_URL || '/api/store';

class StoreApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function storeApi(body) {
  try {
    const response = await fetch(STORE_API_URL, body ? {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    } : { headers: { accept: 'application/json' } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) throw new StoreApiError(result.error || 'Remote store unavailable.', result.code || 'REQUEST_FAILED', response.status);
    return result;
  } catch (error) {
    if (error instanceof StoreApiError) throw error;
    throw new StoreApiError('Remote store unavailable.', 'NETWORK_ERROR', 0);
  }
}

function getProfileRouteName() {
  if (typeof window === 'undefined') return '';
  const match = window.location.pathname.match(/^\/profile\/([^/]+)\/?$/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function getInitialPage() {
  if (typeof window === 'undefined') return 'home';
  if (getProfileRouteName()) return 'profile';
  if (window.location.pathname.replace(/\/$/, '') === '/admin') return 'admin';
  if (window.location.pathname.replace(/\/$/, '') === '/shop') return 'shop';
  if (window.location.pathname.replace(/\/$/, '') === '/rewards') return 'rewards';
  return 'home';
}

function prepareAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpe?g|webp)$/i.test(file.type)) return reject(new Error('Choose a PNG, JPG or WebP image.'));
    if (file.size > 8 * 1024 * 1024) return reject(new Error('Avatar must be under 8 MB.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Could not decode image.'));
      image.onload = () => {
        const size = 320;
        const scale = Math.min(1, size / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function prepareScreenshot(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpe?g|webp)$/i.test(file.type) || file.size > 8 * 1024 * 1024) return reject(new Error('Screenshot must be an image under 8 MB.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read screenshot.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Could not decode screenshot.'));
      image.onload = () => {
        const max = 1400;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.76));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function readCustomRewards() {
  return readJson(CUSTOM_REWARDS_KEY, []);
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function readStoredUsers() {
  return readJson(USERS_STORAGE_KEY, {});
}

function removeDemoAccounts() {
  try {
    const users = readStoredUsers();
    const demoKeys = Object.entries(users)
      .filter(([, user]) => user?.demo === true)
      .map(([key]) => key);
    if (!demoKeys.length) return;
    const nextUsers = { ...users };
    demoKeys.forEach((key) => delete nextUsers[key]);
    writeJson(USERS_STORAGE_KEY, nextUsers);
    const claims = readJson(CLAIMS_STORAGE_KEY, {});
    demoKeys.forEach((key) => delete claims[key]);
    writeJson(CLAIMS_STORAGE_KEY, claims);
    const sessionKey = localStorage.getItem(SESSION_STORAGE_KEY);
    if (sessionKey && demoKeys.includes(sessionKey)) localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in a private browser context.
  }
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return hashText(password);
}

function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_STORAGE_KEY, id);
    }
    document.cookie = `${DEVICE_STORAGE_KEY}=${encodeURIComponent(id)}; Max-Age=31536000; SameSite=Lax; Path=/`;
    return id;
  } catch {
    return 'memory-device';
  }
}

function getBrowserFingerprint() {
  if (typeof navigator === 'undefined') return 'unknown';
  return hashText([
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    window.devicePixelRatio || 1,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|'));
}

function recordEvent(type, details = {}) {
  try {
    const events = readJson(EVENTS_STORAGE_KEY, []);
    const event = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      at: new Date().toISOString(),
      type,
      deviceId: getDeviceId().slice(0, 12),
      browser: getBrowserFingerprint(),
      ip: 'Unavailable in static mode',
      ...details,
    };
    events.unshift(event);
    writeJson(EVENTS_STORAGE_KEY, events.slice(0, 250));
    void storeApi({ action: 'event', event });
  } catch {
    // A private browsing context may deny storage; the UI still works.
  }
}

function makePromoCode() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `OXYGEN10-${suffix}`;
}

function getPromoExpiry(at = new Date().toISOString()) {
  return new Date(new Date(at).getTime() + SPIN_COOLDOWN_MS).toISOString();
}

function makeManualPromoCode() {
  return `OXYGEN10-MANUAL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function getAdminSettings(rewards = rouletteRewards) {
  const saved = readJson(ADMIN_SETTINGS_KEY, {});
  return {
    enabled: saved.enabled !== false,
    weights: { ...Object.fromEntries(rewards.map((reward) => [reward.id, reward.weight])), ...(saved.weights || {}) },
  };
}

function pickReward(settings, rewards) {
  const total = rewards.reduce((sum, reward) => sum + Math.max(0, Number(settings.weights[reward.id]) || 0), 0);
  if (!total) return rewards[0];
  let cursor = Math.random() * total;
  return rewards.find((reward) => {
    cursor -= Math.max(0, Number(settings.weights[reward.id]) || 0);
    return cursor <= 0;
  }) || rewards[0];
}

function getWheelGradient(rewards) {
  const slice = 360 / rewards.length;
  const stops = rewards.map((reward, index) => `${reward.color} ${index * slice}deg ${(index + 1) * slice}deg`);
  return `conic-gradient(from -${slice / 2}deg, ${stops.join(', ')})`;
}

function isSpinLocked(claim) {
  return Boolean(claim?.at && Date.now() < new Date(claim.at).getTime() + SPIN_COOLDOWN_MS);
}

function getNextSpinAt(claim) {
  return claim?.at ? new Date(new Date(claim.at).getTime() + SPIN_COOLDOWN_MS) : null;
}

function formatCooldown(claim) {
  const next = getNextSpinAt(claim);
  if (!next) return '';
  const remaining = Math.max(0, next.getTime() - Date.now());
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

function HomeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z" /></svg>;
}

function CartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L19 8H6.2M10 20.2h.01M17 20.2h.01" /></svg>;
}

function GiftIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7H8.8a2.3 2.3 0 1 1 0-4.6C11.3 2.4 12 7 12 7Zm0 0h3.2a2.3 2.3 0 1 0 0-4.6C12.7 2.4 12 7 12 7Z" /></svg>;
}

function TelegramIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m21 4-3.1 15.4c-.2 1.1-.8 1.4-1.7.9l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L5.7 13.3l-4.7-1.5c-1-.3-1-1 .2-1.4L19.5 3c.9-.3 1.7.2 1.5 1Z" /></svg>;
}

function DiscordIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.2 6.1A15.5 15.5 0 0 1 12 5.2a15.5 15.5 0 0 1 4.8.9 14.2 14.2 0 0 1 2.8 8.9 12.8 12.8 0 0 1-4 2.3l-1-1.4a7.4 7.4 0 0 0 2.5-1.2M7.2 6.1a14.2 14.2 0 0 0-2.8 8.9 12.8 12.8 0 0 0 4 2.3l1-1.4a7.4 7.4 0 0 1-2.5-1.2M8.7 13.1h.01M15.3 13.1h.01" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

function ArrowDownIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4v15M6 13l6 6 6-6" /></svg>;
}

function UserIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.7-3.4 3-5.2 6.5-5.2s5.8 1.8 6.5 5.2" /></svg>;
}

function AdminIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3 5 6v5c0 4.8 2.7 8.2 7 10 4.3-1.8 7-5.2 7-10V6l-7-3Z" /><path d="M9 12h6M12 9v6" /></svg>;
}

function LogoutIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" /></svg>;
}

const showcaseImages = [
  { src: '/showcase/01-angles-overview.png', alt: 'Oxygen anti-aim overview' },
  { src: '/showcase/02-angles-settings.png', alt: 'Oxygen anti-aim settings' },
  { src: '/showcase/03-hotkeys.png', alt: 'Oxygen hotkeys' },
  { src: '/showcase/04-antibruteforce.png', alt: 'Oxygen anti-bruteforce settings' },
  { src: '/showcase/05-features.png', alt: 'Oxygen features' },
  { src: '/showcase/06-visuals.png', alt: 'Oxygen visuals' },
];

function ShowcaseSection({ onSelect }) {
  return (
    <section className="showcase-section" aria-labelledby="showcase-title">
      <div className="showcase-heading"><h2 id="showcase-title">SHOWCASE</h2></div>
      <div className="showcase-grid">{showcaseImages.map((image, index) => <button className="showcase-item" type="button" key={image.src} onClick={() => onSelect(image)} aria-label={`Open ${image.alt}`}><img src={image.src} alt={image.alt} loading={index > 1 ? 'lazy' : 'eager'} /></button>)}</div>
    </section>
  );
}

function ShowcaseModal({ image, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return <div className="showcase-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="showcase-modal" role="dialog" aria-modal="true" aria-label={image.alt}><button ref={closeRef} className="icon-button close-button" type="button" onClick={onClose} aria-label="Close showcase image"><CloseIcon /></button><img src={image.src} alt={image.alt} /></section></div>;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning!';
  if (hour >= 12 && hour < 18) return 'Good afternoon!';
  if (hour >= 18 && hour < 23) return 'Good evening!';
  return 'Good night!';
}

function ProductCard({ product, onSelect }) {
  return (
    <button className="product-card" type="button" onClick={(event) => onSelect(product, event)} aria-label={`View ${product.name}`}>
      <span className="product-category">OXYGEN</span>
      <span className="product-title">{product.name}</span>
      <span className="card-rule" aria-hidden="true" />
      <span className="product-prices"><strong>{product.rub}</strong><span className="price-divider" aria-hidden="true" /><b>{product.eur}</b></span>
      <span className="card-rule" aria-hidden="true" />
      <span className="product-description">{product.description}</span>
    </button>
  );
}

function ProductModal({ product, onClose, onValidatePromo }) {
  const closeButtonRef = useRef(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoState, setPromoState] = useState(null);
  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  const rubValue = Number.parseFloat(product.rub);
  const eurValue = Number.parseFloat(product.eur);
  const submitPromo = (event) => {
    event.preventDefault();
    setPromoState(onValidatePromo(promoCode));
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-description">
        <button ref={closeButtonRef} className="icon-button close-button" type="button" onClick={onClose} aria-label="Close dialog"><CloseIcon /></button>
        <p className="product-category">OXYGEN</p>
        <h2 id="modal-title">{product.name}</h2>
        {promoState?.valid ? <div className="checkout-price"><span className="old-price">{product.rub}</span><strong>{(rubValue * 0.9).toFixed(rubValue % 1 ? 1 : 0)} RUB</strong><span className="discount-divider">/</span><span className="old-price">{product.eur}</span><strong>{(eurValue * 0.9).toFixed(2).replace(/\.00$/, '')} EUR</strong></div> : <p className="modal-price">{product.rub} <span>/ {product.eur}</span></p>}
        <p id="modal-description" className="modal-description">{product.description}</p>
        <form className="promo-form" onSubmit={submitPromo}>
          <label htmlFor="product-promo">Promo code</label>
          <div><input id="product-promo" value={promoCode} onChange={(event) => { setPromoCode(event.target.value.toUpperCase()); setPromoState(null); }} placeholder="OXYGEN10-XXXXXX" autoComplete="off" /><button type="submit">Apply</button></div>
          {promoState && <p className={promoState.valid ? 'promo-valid' : 'promo-invalid'} role="status">{promoState.valid ? 'Valid promo code — 10% discount applied.' : promoState.message}</p>}
        </form>
        <a className="buy-button buy-link" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">Buy via Discord</a>
      </section>
    </div>
  );
}

function AuthModal({ mode, onModeChange, onClose, onSubmit, error, busy, onCreateDemo }) {
  const closeButtonRef = useRef(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const isRegistering = mode === 'register';
  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button ref={closeButtonRef} className="icon-button close-button" type="button" onClick={onClose} aria-label="Close dialog"><CloseIcon /></button>
        <p className="product-category">OXYGEN ACCOUNT</p>
        <h2 id="auth-title">{isRegistering ? 'Create account' : 'Welcome back'}</h2>
        <p className="auth-subtitle">{isRegistering ? 'One account per browser/device. No email required.' : 'Sign in with your login and password.'}</p>
        <form className="auth-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ username, password, confirmPassword }); }}>
          <label htmlFor="auth-username">Login</label>
          <input id="auth-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" minLength={3} maxLength={32} required />
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegistering ? 'new-password' : 'current-password'} minLength={6} required />
          {isRegistering && <><label htmlFor="auth-confirm-password">Repeat password</label><input id="auth-confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} required /></>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="buy-button auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait...' : isRegistering ? 'Create account' : 'Sign in'}</button>
        </form>
        <button className="auth-switch" type="button" onClick={() => onModeChange(isRegistering ? 'login' : 'register')}>{isRegistering ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
        {import.meta.env.DEV && <button className="auth-demo" type="button" onClick={onCreateDemo}>Create random demo account &amp; sign in</button>}
      </section>
    </div>
  );
}

function ProfilePage({ user, claims, events, tickets = [], isOwnProfile, onAvatarUpload, onChangePassword, onCreateTicket = async () => false, onSendTicketMessage = async () => false }) {
  const fileRef = useRef(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketAttachment, setTicketAttachment] = useState(null);
  const [ticketBusy, setTicketBusy] = useState(false);
  if (!user) return <section className="profile-page page-enter"><div className="profile-empty"><p className="eyebrow">OXYGEN PROFILE</p><h1>Profile not found.</h1><p>This account does not exist or has not synced yet.</p></div></section>;
  const username = user.username;
  const userClaims = Object.entries(claims)
    .filter(([key]) => key.toLowerCase() === username.toLowerCase())
    .map(([, claim]) => claim);
  const spinEvents = events.filter((event) => event.type === 'spin' && event.username?.toLowerCase() === username.toLowerCase());
  const prizes = [...spinEvents];
  userClaims.forEach((claim) => {
    const duplicate = prizes.some((prize) => prize.rewardId === claim.rewardId && Math.abs(new Date(prize.at) - new Date(claim.at)) < 10_000);
    if (!duplicate) prizes.push(claim);
  });
  prizes.sort((a, b) => new Date(b.at) - new Date(a.at));
  const userId = user.uid ? `#${user.uid}` : 'Local demo';
  return (
    <section className="profile-page page-enter" aria-labelledby="profile-title">
      <div className="profile-header">
        <div className="avatar-wrap"><img src={user.avatar || '/default-avatar.png'} alt={`${username} avatar`} />{isOwnProfile && <button type="button" onClick={() => fileRef.current?.click()}>Change avatar</button>}<input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAvatarUpload(file); event.target.value = ''; }} /></div>
        <div><p className="eyebrow">OXYGEN PROFILE</p><h1 id="profile-title">{username}</h1><span className="profile-role">{user.role || 'user'}</span></div>
      </div>
      <div className="profile-stats"><div><span>Account UID</span><code>{userId}</code></div><div><span>Registered</span><strong>{user.createdAt ? new Date(user.createdAt).toLocaleString() : 'Legacy account'}</strong></div><div><span>Prizes</span><strong>{prizes.length}</strong></div><div><span>Created by</span><strong>{user.createdBy || 'Self registration'}</strong></div></div>
      <section className="profile-prizes"><div className="profile-section-heading"><p className="product-category">PRIZE HISTORY</p><h2>All rewards</h2></div>{prizes.length === 0 ? <p className="empty-state">No prizes yet.</p> : <div className="prize-list">{prizes.map((prize, index) => <article key={`${prize.at}-${index}`}><div><strong>{prize.rewardLabel || prize.rewardId}</strong><span>{new Date(prize.at).toLocaleString()}</span></div><code>{prize.rewardId}</code>{prize.promoCode && <b>************</b>}</article>)}</div>}</section>
      {isOwnProfile && <form className="password-panel" onSubmit={async (event) => { event.preventDefault(); if (newPassword !== confirmPassword) return onChangePassword(null, 'New passwords do not match.'); setPasswordBusy(true); const changed = await onChangePassword({ currentPassword, newPassword }); setPasswordBusy(false); if (changed) { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); } }}><div className="profile-section-heading"><p className="product-category">SECURITY</p><h2>Change password</h2></div><div className="password-fields"><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" autoComplete="current-password" minLength={6} required /><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" autoComplete="new-password" minLength={6} required /><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat new password" autoComplete="new-password" minLength={6} required /><button className="admin-button" type="submit" disabled={passwordBusy}>{passwordBusy ? 'Saving...' : 'Update password'}</button></div></form>}
      {isOwnProfile && <section className="ticket-panel"><div className="profile-section-heading"><p className="product-category">SUPPORT</p><h2>Tickets</h2></div><form className="ticket-form" onSubmit={async (event) => { event.preventDefault(); setTicketBusy(true); const created = await onCreateTicket(ticketSubject, ticketMessage, ticketAttachment); setTicketBusy(false); if (created) { setTicketSubject(''); setTicketMessage(''); setTicketAttachment(null); } }}><input value={ticketSubject} onChange={(event) => setTicketSubject(event.target.value)} placeholder="Subject" maxLength={100} required /><textarea value={ticketMessage} onChange={(event) => setTicketMessage(event.target.value)} placeholder="Describe your issue" maxLength={3000} rows={4} required /><label className="file-picker"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { setTicketAttachment(await prepareScreenshot(file)); } catch { setTicketAttachment(null); } event.target.value = ''; }} />{ticketAttachment ? 'Screenshot attached' : 'Attach screenshot'}</label><button className="admin-button" type="submit" disabled={ticketBusy}>{ticketBusy ? 'Sending...' : 'Create ticket'}</button></form><div className="ticket-list">{tickets.filter((ticket) => ticket.username?.toLowerCase() === username.toLowerCase()).length === 0 ? <p className="empty-state">No tickets yet.</p> : tickets.filter((ticket) => ticket.username?.toLowerCase() === username.toLowerCase()).map((ticket) => <TicketConversation key={ticket.id} ticket={ticket} onSend={onSendTicketMessage} />)}</div></section>}
    </section>
  );
}

function RoulettePage({ rotation, spinning, claimed, result, onSpin, settings, rewards }) {
  return (
    <section className="rewards page-enter" aria-labelledby="rewards-title">
      <div className="rewards-heading"><p className="eyebrow">OXYGEN REWARDS</p><h1 id="rewards-title">A little something for you.</h1><p>One spin every 7 days per browser/device. Good luck.</p></div>
      <div className="roulette-layout">
        <div className="roulette-card">
          <div className="wheel-stage" role="button" tabIndex={claimed || spinning ? -1 : 0} aria-label="Spin Oxygen rewards roulette" onPointerDown={(event) => { if (event.button === 0) onSpin(); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSpin(); } }}><span className="wheel-pointer" aria-hidden="true" /><div className={`roulette-wheel ${spinning ? 'is-spinning' : ''}`} style={{ '--wheel-rotation': `${rotation}deg`, background: getWheelGradient(rewards) }}><div className="wheel-center">OXYGEN</div>{rewards.map((reward, index) => { const angle = (360 / rewards.length) * index; return <span key={reward.id} className="wheel-label" style={{ transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-130px) rotate(${-angle}deg)` }}>{reward.shortLabel}</span>; })}</div></div>
          <button className="buy-button spin-button" type="button" onClick={onSpin} disabled={spinning || claimed || !settings.enabled}>{!settings.enabled ? 'Roulette paused' : spinning ? 'Spinning...' : claimed ? `Next spin in ${formatCooldown(result)}` : 'Spin the wheel'}</button>
          <p className="roulette-note">{claimed ? `Next attempt: ${getNextSpinAt(result)?.toLocaleString()}` : 'The result is saved to this browser and account.'}</p>
        </div>
        <div className="result-card" aria-live="polite"><p className="product-category">YOUR DROP</p>{!result ? <><h2>Ready?</h2><p>Tap the button to reveal your Oxygen reward.</p></> : <><h2>{result.rewardLabel}</h2>{result.promoCode ? <><p className="promo-code">{result.promoCode}</p><p>Send this promo code in a ticket on our Discord channel to claim your 10% discount. Valid for 7 days.</p><p className="promo-expiry">Expires: {new Date(result.expiresAt || getPromoExpiry(result.at)).toLocaleString()}</p><a className="discord-button" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">Open Discord ticket</a></> : <p>{result.rewardId === 'nothing' ? 'Nothing this time — thanks for playing.' : 'Your reward is reserved for this account.'}</p>}</>}</div>
      </div>
    </section>
  );
}

function TicketConversation({ ticket, onSend }) {
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [busy, setBusy] = useState(false);
  const messages = ticket.messages?.length ? ticket.messages : [{ id: `legacy-${ticket.id}`, username: ticket.username, role: 'user', message: ticket.message, attachmentUrl: ticket.attachmentUrl, createdAt: ticket.createdAt }];
  return <article className="ticket-chat"><header><div><strong>#{ticket.id} · {ticket.subject}</strong><span>{ticket.status.replace('_', ' ')}</span></div><time>{new Date(ticket.updatedAt || ticket.createdAt).toLocaleString()}</time></header><div className="ticket-messages">{messages.map((item) => <div className={`ticket-message ${item.role === 'admin' || item.role === 'owner' ? 'is-staff' : ''}`} key={item.id}><div><b>{item.username}</b><time>{new Date(item.createdAt).toLocaleString()}</time></div>{item.message && <p>{item.message}</p>}{item.attachmentUrl && <a href={item.attachmentUrl} target="_blank" rel="noreferrer"><img src={item.attachmentUrl} alt="Ticket screenshot" /></a>}</div>)}</div><form className="ticket-reply" onSubmit={async (event) => { event.preventDefault(); if (!message.trim() && !attachment) return; setBusy(true); const sent = await onSend(ticket, message, attachment); setBusy(false); if (sent) { setMessage(''); setAttachment(null); } }}><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a message" rows={3} maxLength={3000} /><label className="file-picker"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { setAttachment(await prepareScreenshot(file)); } catch { setAttachment(null); } event.target.value = ''; }} />{attachment ? 'Screenshot attached' : 'Attach screenshot'}</label><button className="admin-button" type="submit" disabled={busy}>{busy ? 'Sending...' : 'Send'}</button></form></article>;
}

function AdminTicket({ ticket, onSave, onSend }) {
  const [status, setStatus] = useState(ticket.status);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setStatus(ticket.status); }, [ticket.status]);
  return <div className="admin-ticket"><div className="ticket-status"><strong>{ticket.username}</strong><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="open">open</option><option value="in_progress">in progress</option><option value="closed">closed</option></select><button className="admin-button" type="button" disabled={busy || status === ticket.status} onClick={async () => { setBusy(true); await onSave(ticket, status); setBusy(false); }}>Save status</button></div><TicketConversation ticket={ticket} onSend={onSend} /></div>;
}

function AdminPage({ canManageRoles, adminName, events, settings, rewards, tickets = [], onSaveSettings, onResetSettings, onExportAudit, onAddReward, generatedCodes, onGenerateCodes, users, promoStatuses, onTogglePromo, onChangeRole, onChangeBan, onCreateAccount, onTicketStatus, onSendTicketMessage }) {
  const [newRewardLabel, setNewRewardLabel] = useState('');
  const [newRewardWeight, setNewRewardWeight] = useState('0.5');
  const [newAccountLogin, setNewAccountLogin] = useState('');
  const [newAccountPassword, setNewAccountPassword] = useState('');
  const [newAccountRole, setNewAccountRole] = useState('user');
  const [draft, setDraft] = useState(settings);
  const stats = useMemo(() => ({
    registrations: events.filter((event) => event.type === 'register').length,
    logins: events.filter((event) => event.type === 'login').length,
    spins: events.filter((event) => event.type === 'spin').length,
    promos: events.filter((event) => event.type === 'spin' && event.promoCode).length,
  }), [events]);
  const totalWeight = rewards.reduce((sum, reward) => sum + (Number(draft.weights[reward.id]) || 0), 0);
  useEffect(() => setDraft(settings), [settings]);
  return (
    <section className="admin-page rewards page-enter" aria-labelledby="owner-title">
      <div className="rewards-heading"><p className="eyebrow">OXYGEN ADMIN</p><h1 id="owner-title">Control centre.</h1><p>Manage the shared store, accounts and reward system.</p></div>
      <section className="owner-panel" aria-labelledby="admin-panel-title">
        <div className="owner-heading"><div><p className="product-category">{canManageRoles ? 'OWNER' : 'ADMIN'} VIEW / {adminName}</p><h2 id="admin-panel-title">Full activity control</h2></div><span className="owner-badge">shared Neon data</span></div>
        <div className="owner-stats"><div><strong>{stats.registrations}</strong><span>registrations</span></div><div><strong>{stats.logins}</strong><span>logins</span></div><div><strong>{stats.spins}</strong><span>roulette spins</span></div><div><strong>{stats.promos}</strong><span>promo codes</span></div></div>
        <p className="owner-warning">Shared mode: accounts, rewards and activity are synchronized through Neon across browsers and devices.</p>
        <div className="owner-actions"><button className="admin-button" type="button" onClick={onExportAudit}>Export audit JSON</button><button className="admin-button" type="button" onClick={onResetSettings}>Reset low-probability defaults</button></div>
        <form className="probability-editor" onSubmit={(event) => { event.preventDefault(); onSaveSettings(draft); }}><div className="editor-heading"><div><p className="product-category">ROULETTE CONTROL</p><h3>Reward weights</h3></div><label className="toggle-label"><input type="checkbox" checked={draft.enabled} disabled={!canManageRoles} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /> Roulette enabled</label></div>{rewards.map((reward) => <label className="weight-row" key={reward.id}><span>{reward.label}</span><input type="number" min="0" max="100" step="0.1" disabled={!canManageRoles} value={draft.weights[reward.id] ?? 0} onChange={(event) => setDraft({ ...draft, weights: { ...draft.weights, [reward.id]: event.target.value } })} /><b>%</b></label>)}<p className="weight-total">Total weight: {totalWeight.toFixed(1)}% · every prize defaults to 0.5%</p><button className="buy-button admin-save" type="submit" disabled={!canManageRoles}>Save roulette controls</button></form>
        <form className="add-reward-form" onSubmit={(event) => { event.preventDefault(); if (newRewardLabel.trim()) { onAddReward(newRewardLabel, newRewardWeight); setNewRewardLabel(''); setNewRewardWeight('0.5'); } }}><div className="editor-heading"><div><p className="product-category">PRIZE BUILDER</p><h3>Add a prize</h3></div><span className="owner-badge">owner only</span></div><div className="add-reward-fields"><input value={newRewardLabel} onChange={(event) => setNewRewardLabel(event.target.value)} placeholder="Prize name, e.g. Oxygen Pro 3d" maxLength={36} disabled={!canManageRoles} /><input type="number" value={newRewardWeight} onChange={(event) => setNewRewardWeight(event.target.value)} min="0" max="100" step="0.1" aria-label="Prize chance" disabled={!canManageRoles} /><button className="admin-button" type="submit" disabled={!canManageRoles}>Add prize</button></div></form>
        <div className="admin-subsection promo-generator"><div className="editor-heading"><div><p className="product-category">PROMO CODES</p><h3>Generate 10% codes</h3></div><button className="admin-button" type="button" onClick={() => onGenerateCodes(1)} disabled={!canManageRoles}>Generate code</button></div><div className="generated-code-list">{generatedCodes.length === 0 ? <p className="empty-state">No manual codes generated.</p> : generatedCodes.slice(0, 30).map((item) => <code key={item.code}>{item.code} · {item.status}</code>)}</div></div>
        <form className="admin-subsection create-account-form" onSubmit={async (event) => { event.preventDefault(); const created = await onCreateAccount(newAccountLogin, newAccountPassword, newAccountRole); if (created) { setNewAccountLogin(''); setNewAccountPassword(''); setNewAccountRole('user'); } }}><div className="editor-heading"><div><p className="product-category">ACCOUNT CONTROL</p><h3>Create account</h3></div><span className="owner-badge">owner only</span></div><div className="create-account-fields"><input value={newAccountLogin} onChange={(event) => setNewAccountLogin(event.target.value)} placeholder="Login" minLength={3} maxLength={32} required disabled={!canManageRoles} /><input type="password" value={newAccountPassword} onChange={(event) => setNewAccountPassword(event.target.value)} placeholder="Temporary password" minLength={6} required disabled={!canManageRoles} /><select value={newAccountRole} onChange={(event) => setNewAccountRole(event.target.value)} disabled={!canManageRoles}><option value="user">user</option><option value="admin">admin</option><option value="owner">owner</option></select><button className="admin-button" type="submit" disabled={!canManageRoles}>Create account</button></div></form>
        <div className="admin-subsection"><div className="editor-heading"><div><p className="product-category">USERS</p><h3>Registered accounts</h3></div><span className="owner-badge">{Object.keys(users).length} total</span></div><div className="user-list">{Object.values(users).length === 0 ? <p className="empty-state">No accounts yet.</p> : Object.values(users).map((user) => <article className={`user-row ${user.banned ? 'is-banned' : ''}`} key={user.username}><div><strong>{user.username}{user.banned ? ' · BANNED' : ''}</strong><span>{user.createdAt ? new Date(user.createdAt).toLocaleString() : 'legacy account'}</span></div><code>{user.deviceId ? user.deviceId.slice(0, 12) : 'no device id'}</code><select aria-label={`Role for ${user.username}`} disabled={!canManageRoles || user.username.toLowerCase() === OWNER_LOGIN} value={user.username.toLowerCase() === OWNER_LOGIN ? 'owner' : user.role || 'user'} onChange={(event) => onChangeRole(user.username, event.target.value)}><option value="user">user</option><option value="admin">admin</option><option value="owner">owner</option></select><button className="admin-button ban-button" type="button" disabled={!canManageRoles || user.username.toLowerCase() === OWNER_LOGIN} onClick={() => onChangeBan(user.username, !user.banned)}>{user.banned ? 'Unban' : 'Ban'}</button></article>)}</div></div>
        <div className="admin-subsection"><div className="editor-heading"><div><p className="product-category">AUDIT LOG</p><h3>Every action and result</h3></div><button className="admin-button" type="button" onClick={onExportAudit}>Download</button></div><div className="event-list">{events.length === 0 ? <p className="empty-state">No events yet.</p> : events.slice(0, 100).map((event) => <article className="event-row" key={event.id}><div><strong>{event.type}</strong><span>{event.username || 'anonymous'} · {new Date(event.at).toLocaleString()}</span></div><div className="event-detail"><code>{event.promoCode || event.rewardLabel || event.ip}</code>{event.promoCode && <button className="verify-button" type="button" onClick={() => onTogglePromo(event.promoCode)}>{promoStatuses[event.promoCode] === 'checked' ? 'Checked' : 'Mark checked'}</button>}</div></article>)}</div></div>
        <div className="admin-subsection ticket-admin"><div className="editor-heading"><div><p className="product-category">SUPPORT</p><h3>All tickets</h3></div><span className="owner-badge">{tickets.length} total</span></div>{tickets.length === 0 ? <p className="empty-state">No tickets yet.</p> : <div className="ticket-list">{tickets.map((ticket) => <AdminTicket key={ticket.id} ticket={ticket} onSave={onTicketStatus} onSend={onSendTicketMessage} />)}</div>}</div>
      </section>
    </section>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState(getInitialPage);
  const [profileName, setProfileName] = useState(getProfileRouteName);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedShowcase, setSelectedShowcase] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '' });
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState('user');
  const [authMode, setAuthMode] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [rouletteRotation, setRouletteRotation] = useState(0);
  const [rouletteSpinning, setRouletteSpinning] = useState(false);
  const [rouletteClaim, setRouletteClaim] = useState(null);
  const [customRewards, setCustomRewards] = useState(readCustomRewards);
  const rewards = useMemo(() => [...rouletteRewards, ...customRewards], [customRewards]);
  const [adminSettings, setAdminSettings] = useState(() => getAdminSettings([...rouletteRewards, ...readCustomRewards()]));
  const [generatedCodes, setGeneratedCodes] = useState(() => readJson(GENERATED_CODES_KEY, []));
  const [promoStatuses, setPromoStatuses] = useState(() => readJson(PROMO_STATUS_KEY, {}));
  const [tickets, setTickets] = useState(() => readJson(TICKETS_STORAGE_KEY, []));
  const [, setCooldownTick] = useState(0);
  const [eventsVersion, setEventsVersion] = useState(0);
  const lastTriggerRef = useRef(null);
  const authTriggerRef = useRef(null);
  const spinRequestRef = useRef(false);
  const events = useMemo(() => readJson(EVENTS_STORAGE_KEY, []), [eventsVersion]);
  const users = useMemo(() => readStoredUsers(), [eventsVersion]);
  const claims = useMemo(() => readJson(CLAIMS_STORAGE_KEY, {}), [eventsVersion]);
  const profileUser = profileName ? users[profileName.toLowerCase()] : null;
  const currentUserRecord = currentUser ? users[currentUser.toLowerCase()] : null;
  const isRootOwner = currentUser?.toLowerCase() === OWNER_LOGIN;
  const isOwner = isRootOwner || currentUserRole === 'owner';
  const isAdmin = isOwner || currentUserRole === 'admin';

  useEffect(() => {
    setAdminSettings((current) => ({ ...current, weights: { ...Object.fromEntries(rewards.map((reward) => [reward.id, reward.weight])), ...current.weights } }));
  }, [rewards]);

  useEffect(() => {
    removeDemoAccounts();
    getDeviceId();
    try {
      const sessionKey = localStorage.getItem(SESSION_STORAGE_KEY);
      const user = sessionKey ? readStoredUsers()[sessionKey] : null;
      if (user) {
        setCurrentUser(user.username);
        setCurrentUserRole(user.role || 'user');
      }
    } catch {
      // Storage may be unavailable in a private browser context.
    }
  }, []);
  useEffect(() => {
    let active = true;
    storeApi().then((remote) => {
      if (!active) return;
      if (Array.isArray(remote.users) && remote.users.length) {
        const localUsers = readStoredUsers();
        const mergedUsers = { ...localUsers };
        remote.users.forEach((user) => {
          const key = String(user.username || '').toLowerCase();
          if (key) mergedUsers[key] = { ...mergedUsers[key], ...user };
        });
        writeJson(USERS_STORAGE_KEY, mergedUsers);
      }
      if (Array.isArray(remote.events) && remote.events.length) {
        const localEvents = readJson(EVENTS_STORAGE_KEY, []);
        const byId = new Map([...remote.events, ...localEvents].map((event) => [event.id, event]));
        writeJson(EVENTS_STORAGE_KEY, [...byId.values()].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 250));
      }
      if (remote.claims && Object.keys(remote.claims).length) writeJson(CLAIMS_STORAGE_KEY, { ...readJson(CLAIMS_STORAGE_KEY, {}), ...remote.claims });
      if (remote.settings?.admin) {
        writeJson(ADMIN_SETTINGS_KEY, remote.settings.admin);
        setAdminSettings((current) => ({ ...current, ...remote.settings.admin }));
      }
      if (Array.isArray(remote.customRewards) && remote.customRewards.length) {
        writeJson(CUSTOM_REWARDS_KEY, remote.customRewards);
        setCustomRewards(remote.customRewards);
      }
      if (Array.isArray(remote.generatedCodes) && remote.generatedCodes.length) {
        writeJson(GENERATED_CODES_KEY, remote.generatedCodes);
        setGeneratedCodes(remote.generatedCodes);
      }
      setEventsVersion((version) => version + 1);
    }).catch(() => { /* localStorage remains the offline fallback */ });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!currentUser) { setRouletteClaim(null); return; }
    const claims = readJson(CLAIMS_STORAGE_KEY, {});
    setRouletteClaim(claims[getDeviceId()] || claims[currentUser.toLowerCase()] || null);
    const timer = window.setInterval(() => setCooldownTick((tick) => tick + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [currentUser]);
  useEffect(() => {
    if (!currentUser || !currentUserRecord?.passwordHash) return;
    storeApi({ action: 'tickets', username: currentUser, passwordHash: currentUserRecord.passwordHash }).then((remote) => {
      const nextTickets = Array.isArray(remote.tickets) ? remote.tickets : [];
      setTickets(nextTickets);
      writeJson(TICKETS_STORAGE_KEY, nextTickets);
    }).catch(() => {});
  }, [currentUser, currentUserRole, currentUserRecord?.passwordHash]);

  const showToast = (message) => { setToast({ visible: true, message }); window.setTimeout(() => setToast({ visible: false, message: '' }), 2800); };
  const navigatePage = (page) => {
    setProfileName('');
    setActivePage(page);
    const path = page === 'home' ? '/' : `/${page}`;
    if (window.location.pathname !== path) window.history.pushState({ page }, '', path);
  };
  const navigateProfile = (username = currentUser) => {
    if (!username) return;
    setProfileName(username);
    setActivePage('profile');
    const path = `/profile/${encodeURIComponent(username)}`;
    if (window.location.pathname !== path) window.history.pushState({ page: 'profile', username }, '', path);
  };
  useEffect(() => {
    const onPopState = () => { setProfileName(getProfileRouteName()); setActivePage(getInitialPage()); };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const scrollToShowcase = () => {
    const target = document.getElementById('showcase-title');
    if (!target) return;
    const start = window.scrollY;
    const end = Math.max(0, target.getBoundingClientRect().top + window.scrollY - 56);
    const distance = end - start;
    const startedAt = performance.now();
    const duration = 720;
    const frame = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      window.scrollTo(0, start + distance * eased);
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  const closeProduct = () => { setSelectedProduct(null); requestAnimationFrame(() => lastTriggerRef.current?.focus()); };
  const openProduct = (product, event) => { lastTriggerRef.current = event.currentTarget; setSelectedProduct(product); };
  const openAuth = (mode, event) => { authTriggerRef.current = event.currentTarget; setAuthError(''); setAuthMode(mode); };
  const closeAuth = () => { setAuthMode(null); setAuthError(''); requestAnimationFrame(() => authTriggerRef.current?.focus()); };

  const submitAuth = async ({ username, password, confirmPassword }) => {
    const cleanUsername = username.trim();
    const usernameKey = cleanUsername.toLowerCase();
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(cleanUsername)) return setAuthError('Use 3–32 Latin letters, numbers, dot, dash or underscore.');
    if (password.length < 6) return setAuthError('Password must be at least 6 characters.');
    if (authMode === 'register' && password !== confirmPassword) return setAuthError('Passwords do not match.');
    setAuthBusy(true);
    try {
      const deviceId = getDeviceId();
      const browserFingerprint = getBrowserFingerprint();
      const passwordHash = await hashPassword(password);
      let remoteUser = null;
      try {
        const remote = await storeApi({ action: authMode, username: cleanUsername, passwordHash, deviceId, browserFingerprint });
        remoteUser = remote.user;
      } catch (remoteError) {
        if (['USER_EXISTS', 'ACCOUNT_EXISTS', 'INVALID_CREDENTIALS', 'USER_BANNED'].includes(remoteError.code)) return setAuthError(remoteError.message);
      }
      const users = readStoredUsers();
      if (authMode === 'register') {
        if (!remoteUser) {
          if (users[usernameKey]) return setAuthError('This login is already registered.');
          const deviceAccount = localStorage.getItem(DEVICE_ACCOUNT_KEY);
          const duplicate = Object.values(users).find((user) => user.deviceId === deviceId || user.browserFingerprint === browserFingerprint);
          if (deviceAccount || duplicate) return setAuthError('This browser/device already has an account. Sign in instead.');
          remoteUser = { username: cleanUsername, role: 'user', deviceId, browserFingerprint, createdAt: new Date().toISOString() };
        }
        users[usernameKey] = { ...users[usernameKey], ...remoteUser, passwordHash };
        writeJson(USERS_STORAGE_KEY, users);
        localStorage.setItem(DEVICE_ACCOUNT_KEY, usernameKey);
        localStorage.setItem(SESSION_STORAGE_KEY, usernameKey);
        recordEvent('register', { username: cleanUsername });
        setCurrentUser(remoteUser.username || cleanUsername);
        setCurrentUserRole(remoteUser.role || 'user');
        closeAuth();
        showToast('Account created');
      } else {
        const user = remoteUser || users[usernameKey];
        if (!user || (!remoteUser && user.passwordHash !== passwordHash)) return setAuthError('Incorrect login or password.');
        users[usernameKey] = { ...users[usernameKey], ...user, passwordHash };
        writeJson(USERS_STORAGE_KEY, users);
        localStorage.setItem(SESSION_STORAGE_KEY, usernameKey);
        localStorage.setItem(DEVICE_ACCOUNT_KEY, usernameKey);
        recordEvent('login', { username: user.username });
        setCurrentUser(user.username);
        setCurrentUserRole(user.role || 'user');
        closeAuth();
        showToast('Signed in');
      }
    } catch {
      setAuthError('Storage is unavailable in this browser.');
    } finally {
      setAuthBusy(false);
      setEventsVersion((version) => version + 1);
    }
  };
  const logout = () => {
    if (currentUser) recordEvent('logout', { username: currentUser });
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setCurrentUser(null);
    setCurrentUserRole('user');
    setRouletteClaim(null);
    navigatePage('home');
    setEventsVersion((version) => version + 1);
    showToast('Signed out');
  };
  const uploadAvatar = async (file) => {
    if (!currentUser) return;
    try {
      const avatar = await prepareAvatar(file);
      if (!currentUserRecord?.passwordHash) throw new Error('Sign in again before changing avatar.');
      const remote = await storeApi({ action: 'profile', username: currentUser, passwordHash: currentUserRecord.passwordHash, avatar });
      const nextUsers = readStoredUsers();
      const key = currentUser.toLowerCase();
      nextUsers[key] = { ...nextUsers[key], ...remote.user, avatar };
      writeJson(USERS_STORAGE_KEY, nextUsers);
      setEventsVersion((version) => version + 1);
      recordEvent('avatar_change', { username: currentUser });
      showToast('Avatar updated');
    } catch (error) {
      showToast(error.message || 'Avatar upload failed');
    }
  };
  const changePassword = async (values, validationError) => {
    if (validationError) { showToast(validationError); return false; }
    if (!currentUser || !values || values.newPassword.length < 6) { showToast('New password must be at least 6 characters.'); return false; }
    try {
      const currentPasswordHash = await hashPassword(values.currentPassword);
      const newPasswordHash = await hashPassword(values.newPassword);
      await storeApi({ action: 'password', username: currentUser, currentPasswordHash, newPasswordHash });
      const nextUsers = readStoredUsers();
      const key = currentUser.toLowerCase();
      nextUsers[key] = { ...nextUsers[key], passwordHash: newPasswordHash };
      writeJson(USERS_STORAGE_KEY, nextUsers);
      setEventsVersion((version) => version + 1);
      recordEvent('password_change', { username: currentUser });
      showToast('Password updated');
      return true;
    } catch (error) {
      showToast(error.message || 'Password update failed');
      return false;
    }
  };
  const createTicket = async (subject, message, attachmentUrl) => {
    if (!currentUser || !currentUserRecord?.passwordHash) { showToast('Sign in again.'); return false; }
    try {
      const remote = await storeApi({ action: 'ticket_create', username: currentUser, passwordHash: currentUserRecord.passwordHash, subject, message, attachmentUrl });
      const nextTickets = [remote.ticket, ...tickets];
      setTickets(nextTickets);
      writeJson(TICKETS_STORAGE_KEY, nextTickets);
      showToast(`Ticket #${remote.ticket.id} created`);
      return true;
    } catch (error) {
      showToast(error.message || 'Ticket creation failed');
      return false;
    }
  };
  const updateTicket = async (ticket, status, adminReply) => {
    if (!currentUser || !currentUserRecord?.passwordHash || !isAdmin) return;
    try {
      const remote = await storeApi({ action: 'ticket_update', username: currentUser, passwordHash: currentUserRecord.passwordHash, id: ticket.id, status, adminReply });
      const nextTickets = tickets.map((item) => item.id === remote.ticket.id ? { ...item, ...remote.ticket, messages: item.messages || [] } : item);
      setTickets(nextTickets);
      writeJson(TICKETS_STORAGE_KEY, nextTickets);
      showToast(`Ticket #${ticket.id} updated`);
    } catch (error) {
      showToast(error.message || 'Ticket update failed');
    }
  };
  const sendTicketMessage = async (ticket, message, attachmentUrl) => {
    if (!currentUser || !currentUserRecord?.passwordHash) { showToast('Sign in again.'); return false; }
    try {
      const remote = await storeApi({ action: 'ticket_message', username: currentUser, passwordHash: currentUserRecord.passwordHash, id: ticket.id, message, attachmentUrl });
      const nextTickets = tickets.map((item) => item.id === ticket.id ? { ...item, status: remote.status, updatedAt: remote.updatedAt, messages: [...(item.messages || []), remote.message] } : item);
      setTickets(nextTickets);
      writeJson(TICKETS_STORAGE_KEY, nextTickets);
      showToast('Message sent');
      return true;
    } catch (error) {
      showToast(error.message || 'Message failed');
      return false;
    }
  };
  const saveAdminSettings = (nextSettings) => {
    const normalized = {
      enabled: Boolean(nextSettings.enabled),
      weights: Object.fromEntries(rewards.map((reward) => [reward.id, Math.max(0, Math.min(100, Number(nextSettings.weights[reward.id]) || 0))])),
    };
    writeJson(ADMIN_SETTINGS_KEY, normalized);
    void storeApi({ action: 'settings', actorUsername: currentUser, actorPasswordHash: currentUserRecord?.passwordHash, value: normalized });
    setAdminSettings(normalized);
    recordEvent('admin_settings', { username: currentUser, settings: normalized });
    setEventsVersion((version) => version + 1);
    showToast('Roulette controls saved');
  };
  const resetAdminSettings = () => saveAdminSettings({ enabled: true, weights: Object.fromEntries(rewards.map((reward) => [reward.id, reward.weight])) });
  const addReward = (label, weight) => {
    if (!isOwner) return;
    const cleanLabel = label.trim();
    const newReward = { id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label: cleanLabel, shortLabel: cleanLabel.slice(0, 13), weight: Math.max(0, Math.min(100, Number(weight) || 0.5)), color: `hsl(${Math.floor(Math.random() * 360)} 5% ${24 + Math.floor(Math.random() * 18)}%)` };
    const nextRewards = [...customRewards, newReward];
    writeJson(CUSTOM_REWARDS_KEY, nextRewards);
    void storeApi({ action: 'reward', actorUsername: currentUser, actorPasswordHash: currentUserRecord?.passwordHash, reward: newReward });
    setCustomRewards(nextRewards);
    saveAdminSettings({ ...adminSettings, weights: { ...adminSettings.weights, [newReward.id]: newReward.weight } });
    showToast('Prize added');
  };
  const generateCodes = (count = 1) => {
    if (!isOwner) return;
    const createdAt = new Date().toISOString();
    const nextCodes = Array.from({ length: Math.max(1, Math.min(25, count)) }, () => ({ code: makeManualPromoCode(), discount: 10, status: 'active', createdAt, expiresAt: getPromoExpiry(createdAt), createdBy: currentUser }));
    const merged = [...nextCodes, ...generatedCodes];
    writeJson(GENERATED_CODES_KEY, merged);
    nextCodes.forEach((code) => { void storeApi({ action: 'promo', actorUsername: currentUser, actorPasswordHash: currentUserRecord?.passwordHash, code }); });
    setGeneratedCodes(merged);
    recordEvent('promo_generated', { username: currentUser, count: nextCodes.length, promoCodes: nextCodes.map((item) => item.code) });
    setEventsVersion((version) => version + 1);
    showToast(`${nextCodes.length} promo code${nextCodes.length > 1 ? 's' : ''} generated`);
  };
  const createAccount = async (login, password, role = 'user') => {
    if (!isOwner) return false;
    const cleanLogin = login.trim();
    const key = cleanLogin.toLowerCase();
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(cleanLogin) || password.length < 6) {
      showToast('Use a valid login and 6+ character password');
      return false;
    }
    const nextUsers = readStoredUsers();
    if (nextUsers[key]) {
      showToast('This login already exists');
      return false;
    }
    const passwordHash = await hashPassword(password);
    try {
      const remote = await storeApi({ action: 'register', username: cleanLogin, passwordHash, role, deviceId: null, browserFingerprint: null, actorUsername: currentUser, actorPasswordHash: currentUserRecord?.passwordHash, provisioned: true });
      nextUsers[key] = { ...remote.user, passwordHash };
    } catch (remoteError) {
      if (remoteError.code === 'USER_EXISTS') {
        showToast(remoteError.message);
        return false;
      }
      nextUsers[key] = { username: cleanLogin, role: role === 'owner' || role === 'admin' ? role : 'user', passwordHash, createdAt: new Date().toISOString(), createdBy: currentUser, provisioned: true };
    }
    writeJson(USERS_STORAGE_KEY, nextUsers);
    recordEvent('account_created_by_owner', { username: currentUser, target: cleanLogin, role: nextUsers[key].role });
    setEventsVersion((version) => version + 1);
    showToast(`Account ${cleanLogin} created`);
    return true;
  };
  const createDemoAccount = async () => {
    const suffix = Math.random().toString(36).slice(2, 8).toLowerCase();
    const username = `guest-${suffix}`;
    const password = `Oxygen-${suffix.toUpperCase()}!`;
    const usersNow = readStoredUsers();
    usersNow[username] = { username, role: 'user', passwordHash: await hashPassword(password), deviceId: getDeviceId(), browserFingerprint: getBrowserFingerprint(), createdAt: new Date().toISOString(), provisioned: true, demo: true };
    writeJson(USERS_STORAGE_KEY, usersNow);
    localStorage.setItem(DEVICE_ACCOUNT_KEY, username);
    localStorage.setItem(SESSION_STORAGE_KEY, username);
    recordEvent('demo_account_created', { username });
    setCurrentUser(username);
    setCurrentUserRole('user');
    closeAuth();
    showToast(`Demo ${username} / ${password}`);
    setEventsVersion((version) => version + 1);
  };
  const validatePromo = (code) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return { valid: false, message: 'Enter a promo code.' };
    const generated = readJson(GENERATED_CODES_KEY, []);
    const eventsNow = readJson(EVENTS_STORAGE_KEY, []);
    const generatedMatch = generated.find((item) => item.code === normalized && item.status !== 'revoked');
    const eventMatch = eventsNow.find((event) => event.type === 'spin' && event.promoCode === normalized);
    const expiresAt = generatedMatch?.expiresAt || (eventMatch ? getPromoExpiry(eventMatch.at) : null);
    if (!expiresAt) return { valid: false, message: 'This promo code does not exist or is not active.' };
    if (Date.now() >= new Date(expiresAt).getTime()) return { valid: false, message: 'This promo code expired after 7 days.' };
    return { valid: true, expiresAt };
  };
  const exportAudit = () => {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), users: readStoredUsers(), events: readJson(EVENTS_STORAGE_KEY, []), claims: readJson(CLAIMS_STORAGE_KEY, {}), roulette: adminSettings }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `oxygen-audit-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const togglePromoStatus = (promoCode) => {
    const nextStatus = promoStatuses[promoCode] === 'checked' ? 'unverified' : 'checked';
    const nextStatuses = { ...promoStatuses, [promoCode]: nextStatus };
    writeJson(PROMO_STATUS_KEY, nextStatuses);
    setPromoStatuses(nextStatuses);
    recordEvent('promo_check', { username: currentUser, promoCode, status: nextStatus });
    setEventsVersion((version) => version + 1);
  };
  const changeRole = (username, role) => {
    if (!isOwner || username.toLowerCase() === OWNER_LOGIN) return;
    const nextUsers = readStoredUsers();
    const key = username.toLowerCase();
    if (!nextUsers[key]) return;
    nextUsers[key] = { ...nextUsers[key], role: role === 'owner' || role === 'admin' ? role : 'user' };
    writeJson(USERS_STORAGE_KEY, nextUsers);
    void storeApi({ action: 'role', actorUsername: currentUser, actorPasswordHash: currentUserRecord?.passwordHash, username, role: nextUsers[key].role });
    recordEvent('role_change', { username: currentUser, target: username, role: nextUsers[key].role });
    setEventsVersion((version) => version + 1);
    showToast(`${username} is now ${nextUsers[key].role}`);
  };
  const changeBan = async (username, banned) => {
    if (!isOwner || username.toLowerCase() === OWNER_LOGIN) return;
    try {
      const remote = await storeApi({ action: 'ban', actorUsername: currentUser, actorPasswordHash: currentUserRecord?.passwordHash, username, banned });
      const nextUsers = readStoredUsers();
      const key = username.toLowerCase();
      nextUsers[key] = { ...nextUsers[key], ...remote.user };
      writeJson(USERS_STORAGE_KEY, nextUsers);
      setEventsVersion((version) => version + 1);
      showToast(`${username} ${banned ? 'banned' : 'unbanned'}`);
    } catch (error) {
      showToast(error.message || 'Ban update failed');
    }
  };
  const spinRoulette = async () => {
    if (!currentUser || spinRequestRef.current || rouletteSpinning || (!isOwner && isSpinLocked(rouletteClaim)) || !adminSettings.enabled) return;
    spinRequestRef.current = true;
    let claim;
    try {
      const remote = await storeApi({ action: 'claim', username: currentUser, passwordHash: currentUserRecord?.passwordHash, deviceId: getDeviceId() });
      claim = remote.claim;
    } catch (error) {
      spinRequestRef.current = false;
      showToast(error.message || 'Spin failed');
      return;
    }
    const selected = rewards.find((reward) => reward.id === claim.rewardId) || rewards[0];
    const slice = 360 / rewards.length;
    const selectedIndex = rewards.findIndex((reward) => reward.id === selected.id);
    setRouletteSpinning(true);
    const randomInsideLot = (Math.random() - 0.5) * slice * 0.78;
    setRouletteRotation((rotation) => {
      const target = 360 - selectedIndex * slice + randomInsideLot;
      const correction = ((target - (rotation % 360)) + 360) % 360;
      return rotation + 2160 + correction;
    });
    window.setTimeout(() => {
      const claims = readJson(CLAIMS_STORAGE_KEY, {});
      claims[getDeviceId()] = claim;
      claims[currentUser.toLowerCase()] = claim;
      writeJson(CLAIMS_STORAGE_KEY, claims);
      recordEvent('spin', { username: currentUser, rewardId: claim.rewardId, rewardLabel: claim.rewardLabel, promoCode: claim.promoCode });
      setRouletteClaim(claim);
      setRouletteSpinning(false);
      spinRequestRef.current = false;
      setEventsVersion((version) => version + 1);
    }, 1900);
  };

  return (
    <div className="app-shell">
      <header className="topbar"><div className="social-area" aria-label="Social links"><span className="social-title">SOCIAL</span><a href="https://t.me/oxylua" target="_blank" rel="noopener noreferrer" aria-label="Oxygen Telegram"><TelegramIcon /><span>Telegram</span></a><a href="https://discord.gg/dqAKn8vHy" target="_blank" rel="noopener noreferrer" aria-label="Oxygen Discord"><DiscordIcon /><span>Discord</span></a></div><nav className="nav-pill" aria-label="Primary navigation"><button className={`nav-button ${activePage === 'home' ? 'is-active' : ''}`} type="button" onClick={() => navigatePage('home')} aria-label="Home" aria-pressed={activePage === 'home'}><HomeIcon /></button><button className={`nav-button ${activePage === 'shop' ? 'is-active' : ''}`} type="button" onClick={() => navigatePage('shop')} aria-label="Shop" aria-pressed={activePage === 'shop'}><CartIcon /></button>{currentUser && <button className={`nav-button ${activePage === 'rewards' ? 'is-active' : ''}`} type="button" onClick={() => navigatePage('rewards')} aria-label="Rewards roulette" aria-pressed={activePage === 'rewards'}><GiftIcon /></button>}{isAdmin && <button className={`nav-button ${activePage === 'admin' ? 'is-active' : ''}`} type="button" onClick={() => navigatePage('admin')} aria-label="Admin panel" aria-pressed={activePage === 'admin'}><AdminIcon /></button>}</nav><div className="account-area">{currentUser ? <><button className="account-button profile-button" type="button" onClick={() => navigateProfile()} aria-label={`Open ${currentUser} profile`}><img src={currentUserRecord?.avatar || '/default-avatar.png'} alt="" /><span>{currentUser}</span></button><button className="logout-button" type="button" onClick={logout} aria-label="Log out"><LogoutIcon /><span>Log out</span></button></> : <button className="account-button" type="button" onClick={(event) => openAuth('login', event)} aria-label="Open account sign in"><UserIcon /><span>Sign in</span></button>}</div></header>
      <main>
        {activePage === 'home' && <><section className="hero page-enter" aria-labelledby="greeting"><p className="eyebrow">OXYGEN / DIGITAL STORE</p><h1 id="greeting">{getGreeting()}</h1><p>Welcome to Oxygen | go fuck this game dominate with Oxygen right now!</p><button className="explore-button" type="button" onClick={() => navigatePage('shop')}>Explore products</button></section><ShowcaseSection onSelect={setSelectedShowcase} /></>}
        {activePage === 'shop' && <section className="shop page-enter" aria-labelledby="shop-title"><div className="shop-heading"><p className="eyebrow">OXYGEN COLLECTION</p><h1 id="shop-title">Choose your Oxygen.</h1></div><div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} onSelect={openProduct} />)}</div></section>}
        {activePage === 'rewards' && currentUser && <RoulettePage rotation={rouletteRotation} spinning={rouletteSpinning} claimed={!isOwner && isSpinLocked(rouletteClaim)} result={rouletteClaim} onSpin={spinRoulette} settings={adminSettings} rewards={rewards} />}
        {activePage === 'profile' && <ProfilePage user={profileUser} claims={claims} events={events} tickets={tickets} isOwnProfile={Boolean(currentUser && profileName.toLowerCase() === currentUser.toLowerCase())} onAvatarUpload={uploadAvatar} onChangePassword={changePassword} onCreateTicket={createTicket} onSendTicketMessage={sendTicketMessage} />}
        {activePage === 'admin' && isAdmin && <AdminPage canManageRoles={isOwner} adminName={currentUser} events={events} settings={adminSettings} rewards={rewards} tickets={tickets} onSaveSettings={saveAdminSettings} onResetSettings={resetAdminSettings} onExportAudit={exportAudit} onAddReward={addReward} generatedCodes={generatedCodes} onGenerateCodes={generateCodes} users={users} promoStatuses={promoStatuses} onTogglePromo={togglePromoStatus} onChangeRole={changeRole} onChangeBan={changeBan} onCreateAccount={createAccount} onTicketStatus={updateTicket} onSendTicketMessage={sendTicketMessage} />}
      </main>
      {selectedProduct && <ProductModal product={selectedProduct} onClose={closeProduct} onValidatePromo={validatePromo} />}
      {selectedShowcase && <ShowcaseModal image={selectedShowcase} onClose={() => setSelectedShowcase(null)} />}
      {authMode && <AuthModal mode={authMode} onModeChange={(mode) => { setAuthError(''); setAuthMode(mode); }} onClose={closeAuth} onSubmit={submitAuth} error={authError} busy={authBusy} onCreateDemo={createDemoAccount} />}
      <div className={`toast ${toast.visible ? 'is-visible' : ''}`} role="status" aria-live="polite">{toast.message}</div>
      {activePage === 'home' && <button className="scroll-showcase-button" type="button" onClick={scrollToShowcase} aria-label="Scroll to showcase"><ArrowDownIcon /></button>}
    </div>
  );
}
