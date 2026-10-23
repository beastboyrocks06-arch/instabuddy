import { useState, useEffect, useCallback, Fragment } from 'react';
const api = async (p, o = {}) => {
  const raw = o.body instanceof Blob, r = await fetch('/api' + p, { ...o, headers: { 'x-requested-with': 'web', ...(o.body && !raw ? { 'content-type': 'application/json' } : {}) }, body: o.body && !raw ? JSON.stringify(o.body) : o.body });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Request failed'); return d;
};
const loadMe = async () => api('/auth/me').catch(() => null);
const mb = n => (n / 1048576).toFixed(1) + ' MB', dt = s => new Date(s).toLocaleString();
const Badge = ({ s }) => <span className={'b ' + s}>{s}</span>;

function LandingPage({ plans = [], openAuth }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const chooseSignup = planId => openAuth('signup', planId);
  return <div className="marketing-shell">
    <header className="site-header">
      <a className="site-brand" href="#" aria-label="InstaBuddy home"><span className="instagram-mark"><i /></span><span>Insta<span>Buddy</span></span></a>
      <button className="mobile-menu-trigger" aria-label="Toggle navigation" onClick={() => setMenuOpen(v => !v)}>☰</button>
      <nav className={menuOpen ? 'site-nav open' : 'site-nav'}>
        <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
        <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
        <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
        <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
      </nav>
      <div className="site-actions">
        <button className="theme-placeholder" aria-label="Dark theme" title="Dark theme">☼</button>
        <button className="login-link" onClick={() => openAuth('login')}>Log in</button>
        <button className="btn primary" onClick={() => chooseSignup(plans.find(p => p.name === 'Free')?.id)}>Get Started Free</button>
      </div>
    </header>
    <main className="marketing-main">
      <section className="hero">
        <div>
          <span className="eyebrow"><i /> Instagram Scheduling SaaS</span>
          <h1>Plan smarter.<br />Schedule faster.<br /><span>Grow your reach.</span></h1>
          <p>Upload videos and images, schedule Reels and carousel posts, and publish across Instagram accounts from one intuitive dashboard.</p>
        
          <div className="social-proof"><span className="avatar-stack"><i>J</i><i>M</i><i>A</i></span><span>Built for creators who publish consistently</span><b>★★★★★</b></div>
        </div>
        <div className="hero-preview" aria-label="InstaBuddy publishing dashboard preview">
          <div className="preview-window"><div className="preview-top"><span>● ● ●</span><b>InstaBuddy</b><span>•••</span></div>
            <div className="preview-content"><aside><b>Workspace</b><span>Overview</span><span>Accounts</span><span>Media library</span><span>Schedule</span></aside>
            <div className="preview-main"><small>CONTENT OVERVIEW</small><h3>Your publishing, at a glance</h3><div className="preview-stats"><div><small>Scheduled</small><b>12</b></div><div><small>Published</small><b>48</b></div></div><div className="preview-calendar"><b>Upcoming posts</b><span>Today · 11:30 AM</span><span>Tomorrow · 4:00 PM</span><span>Friday · 9:15 AM</span></div></div>
            </div>
          </div>
          <div className="preview-float">✦ <span>Ready to publish</span></div>
        </div>
      </section>
      <section id="features" className="feature-grid">
        <div className="feature"><h3>Multi-account publishing</h3><p>Queue content across multiple Instagram business profiles with one campaign workflow.</p></div>
        <div className="feature"><h3>Media library</h3><p>Manage video and image assets and keep an eye on upload size and storage.</p></div>
        <div className="feature"><h3>Admin controls</h3><p>Manage plans, payments, publishing policies, and user permissions from one place.</p></div>
      </section>
      <section id="how-it-works" className="steps"><h2>How it works</h2><div className="steps-grid">
        <div><span>1</span><h4>Connect</h4><p>Link your Instagram business account with Meta OAuth.</p></div>
        <div><span>2</span><h4>Upload</h4><p>Send your video to private R2 storage or local development storage.</p></div>
        <div><span>3</span><h4>Schedule</h4><p>Pick the account, time, and caption — then schedule publishing.</p></div>
      </div></section>
      <section id="pricing" className="pricing-block">
        <div className="pricing-heading"><span>Flexible Plans</span><h2>Simple, transparent pricing</h2><p>Choose the tier that fits your content schedule. Upgrade or downgrade anytime.</p></div>
        <div className="pricing-grid">{plans.map((plan, index) => {
          const features = [
            `Up to ${plan.max_accounts ?? 0} Instagram account${Number(plan.max_accounts) === 1 ? '' : 's'}`,
            `${plan.monthly_posts ?? 0} scheduled posts / month`,
            `${plan.storage_limit ? (plan.storage_limit / (1024 * 1024 * 1024)).toFixed(plan.storage_limit % (1024 * 1024 * 1024) ? 1 : 0) + ' GB' : 'Storage included'} storage`,
            `${plan.max_mb ?? 0} MB max upload size`,
            `${plan.horizon_days ?? 0}-day scheduling horizon`,
            plan.publish_ok ? 'Publishing enabled' : 'Publishing disabled'
          ];
          return <article key={plan.id} className={`pricing-card${index === 1 ? ' popular' : ''}`}>
            {index === 1 && <span className="popular-tag">Most Popular</span>}
            <div><h3>{plan.name}</h3><p className="plan-description">{plan.description || 'For creators building a consistent workflow'}</p>
              <div className="price">₹{Number(plan.price_inr || 0).toLocaleString('en-IN')}<small>/month</small></div>
              <ul>{features.map((item, i) => <li key={i}><span className={i === features.length - 1 && !plan.publish_ok ? 'feature-x' : 'feature-check'}>{i === features.length - 1 && !plan.publish_ok ? '×' : '✓'}</span>{item}</li>)}</ul>
            </div>
            <button className={index === 1 ? 'btn primary' : 'btn secondary'} onClick={() => chooseSignup(plan.id)}>{plan.name === 'Free' ? 'Start Free Trial' : `Choose ${plan.name}`}</button>
          </article>;
        })}</div>
        {!plans.length && <p className="plans-loading">Loading available plans…</p>}
      </section>
      <section id="faq" className="faq"><div><h2>Frequently asked questions</h2><p>Everything you need to know about InstaBuddy.</p></div>
        <div className="faq-item"><h4>Can I try the free plan?</h4><p>Yes. Sign up for the free plan to try the scheduling workflow.</p></div>
        <div className="faq-item"><h4>Does scheduling support multiple accounts?</h4><p>Yes. Available account limits depend on your plan.</p></div>
        <div className="faq-item"><h4>How are paid plans activated?</h4><p>Paid plans remain pending until an administrator confirms payment.</p></div>
      </section>
    </main>
    <footer className="site-footer"><a className="site-brand" href="#">Insta<span>Buddy</span></a><span>Plan smarter. Schedule faster.</span></footer>
  </div>;
}

function Auth({ done, plans = [], initialMode = 'login', selectedPlanId, onClose }) {
  const [m, setM] = useState(initialMode), [f, setF] = useState({ planId: selectedPlanId || plans.find(p => p.name === 'Free')?.id || plans[0]?.id || '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { setM(initialMode); }, [initialMode]);
  useEffect(() => { if (selectedPlanId) setF(v => ({ ...v, planId: selectedPlanId })); else if (plans.length && !f.planId) setF(v => ({ ...v, planId: plans.find(p => p.name === 'Free')?.id || plans[0].id })); }, [plans, selectedPlanId, f.planId]);
  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  const go = async ev => { ev.preventDefault(); try {
    setBusy(true); setErr('');
    const payload = m === 'signup' ? { username: f.username, email: f.email, password: f.password, phone: f.phone, planId: Number(f.planId || 1), name: f.name } : { email: f.email, password: f.password };
    await api('/auth/' + m, { method: 'POST', body: payload });
    done();
  } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  const changeMode = () => { setM(mode => mode === 'login' ? 'signup' : 'login'); setErr(''); };
  return <div className="auth-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title" onSubmit={go}>
      <button type="button" className="auth-close" aria-label="Close" onClick={onClose}>×</button>
      <div className="auth-brand-mark"><span><i /></span></div>
      <h2 id="auth-title">{m === 'login' ? 'Log in to InstaBuddy' : 'Create your account'}</h2>
      <p className="auth-subtitle">{m === 'login' ? 'Schedule Instagram Reels, images, and carousels with ease' : 'Start your InstaBuddy creator account'}</p>
      <div className="auth-divider"><span>Or email</span></div>
      {m === 'signup' && <label>Full Name<input autoComplete="name" placeholder="John Doe" value={f.name || ''} onChange={event => setF({ ...f, name: event.target.value })} required /></label>}
      <label>Email Address<input type="email" autoComplete="email" placeholder="you@example.com" value={f.email || ''} onChange={event => setF({ ...f, email: event.target.value })} required /></label>
      {m === 'signup' && <label>Plan<select value={f.planId || ''} onChange={event => setF({ ...f, planId: event.target.value })} required>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} — ₹{Number(plan.price_inr || 0).toLocaleString('en-IN')}/month</option>)}</select></label>}
      <label><span className="password-label">Password{m === 'login' && <button type="button" className="forgot-link" onClick={() => setErr('Password reset is not available yet.')}>Forgot?</button>}</span><input type="password" autoComplete={m === 'login' ? 'current-password' : 'new-password'} minLength="8" placeholder="••••••••" value={f.password || ''} onChange={event => setF({ ...f, password: event.target.value })} required /></label>
      {err && <p className="auth-error" role="alert">{err}</p>}
      <button className="btn primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : m === 'login' ? 'Log In' : 'Sign Up'}</button>
      <p className="auth-switch">{m === 'login' ? 'Need an account?' : 'Already have an account?'} <button type="button" onClick={changeMode}>{m === 'login' ? 'Sign Up Free' : 'Log In'}</button></p>
    </form>
  </div>;
}

function SimpleLanding({ plans, done }) {
  const freePlan = plans.find(plan => plan.name.toLowerCase() === 'free');
  const [mode, setMode] = useState('signup');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  useEffect(() => {
    if (!selectedPlanId && freePlan) setSelectedPlanId(String(freePlan.id));
  }, [freePlan, selectedPlanId]);
  const selectPlan = plan => {
    setSelectedPlanId(String(plan.id));
    setMode('signup');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return <div className="simple-landing">
    <header className="simple-header"><div className="simple-container"><a className="simple-brand" href="/">InstaBuddy</a></div></header>
    <main className="simple-container">
      <section className="simple-hero">
        <div className="simple-intro">
          <p className="simple-proof">Built for creators who publish consistently <span aria-label="5 stars">★★★★★</span></p>
          <h1>Plan smarter. Schedule faster. Grow your reach.</h1>
          <p>Upload videos and images, schedule Reels and carousel posts, and publish across Instagram accounts from one intuitive dashboard.</p>
        </div>
        <InlineAuth plans={plans} mode={mode} setMode={setMode} selectedPlanId={selectedPlanId || freePlan?.id || plans[0]?.id || ''} onPlanChange={setSelectedPlanId} done={done} />
      </section>
      <section className="simple-how" id="how-it-works">
        <h2>How it Works</h2>
        <div className="simple-steps">
          <article><span aria-hidden="true">↗</span><h3>1. Connect (Meta OAuth)</h3><p>Link your Instagram business account with Meta OAuth.</p></article>
          <article><span aria-hidden="true">↑</span><h3>2. Upload (R2/local)</h3><p>Send your video to private R2 local dev storage.</p></article>
          <article><span aria-hidden="true">▦</span><h3>3. Schedule (Auto Publish)</h3><p>Pick the account, time, and caption then publish automatically.</p></article>
        </div>
      </section>
      <section className="simple-plans" id="plans">
        <h2>Plans</h2>
        {plans.length ? <div className="simple-plan-grid">{plans.map(plan => <button className="simple-plan" type="button" key={plan.id} onClick={() => selectPlan(plan)}>
          <strong>{plan.name}</strong>
          <span className="simple-plan-description">{plan.description || 'Plan details'}</span>
          <span className="simple-price">₹{Number(plan.price_inr || 0).toLocaleString('en-IN')} <small>/ month</small></span>
          <span className="simple-plan-limits">
            <span><b>Accounts</b>{plan.max_accounts}</span>
            <span><b>Monthly posts</b>{Number(plan.monthly_posts).toLocaleString('en-IN')}</span>
            <span><b>Max upload</b>{plan.max_mb} MB</span>
            <span><b>Schedule horizon</b>{plan.horizon_days} days</span>
            <span><b>Storage</b>{formatStorage(plan.storage_limit)}</span>
            <span><b>Monthly upload</b>{formatStorage(plan.monthly_upload_quota)}</span>
            <span><b>Retention</b>{plan.retention_days} days</span>
          </span>
        </button>)}</div> : <p className="simple-loading">Loading plans…</p>}
      </section>
    </main>
    <footer className="simple-footer">Copyright {new Date().getFullYear()} InstaBuddy</footer>
  </div>;
}

function formatStorage(bytes) {
  const value = Number(bytes || 0) / (1000 ** 3);
  return `${Number.isInteger(value) ? value : value.toFixed(1)} GB`;
}

function InlineAuth({ plans, mode, setMode, selectedPlanId, onPlanChange, done }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = signup
        ? { name: form.name, email: form.email, phone: form.phone, password: form.password, planId: Number(selectedPlanId) }
        : { email: form.email, password: form.password };
      await api('/auth/' + mode, { method: 'POST', body });
      await done();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = next => {
    setMode(next);
    setError('');
  };
  return <form className="simple-auth" onSubmit={submit}>
    <div className="simple-auth-tabs" role="group" aria-label="Account action">
      <button type="button" className={!signup ? 'selected' : ''} onClick={() => toggle('login')}>Log In</button>
      <span className={signup ? 'simple-switch on' : 'simple-switch'} aria-hidden="true"><i /></span>
      <button type="button" className={signup ? 'selected' : ''} onClick={() => toggle('signup')}>Sign Up</button>
    </div>
    {signup && <input autoComplete="name" placeholder="Full Name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required />}
    {signup && <input type="tel" autoComplete="tel" placeholder="Mobile Number" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} required />}
    <input type="email" autoComplete="email" placeholder="Email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required />
    {signup && <label className="simple-plan-select-label">Plan
      <select value={selectedPlanId || ''} onChange={event => onPlanChange(event.target.value)} required>
        {plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} — ₹{Number(plan.price_inr || 0).toLocaleString('en-IN')}/month</option>)}
      </select>
    </label>}
    {signup && <p className="simple-contact-note">Please provide a valid mobile number. Our team will contact you within a few hours.</p>}
    <input type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 8 : undefined} placeholder="Password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required />
    {error && <p className="simple-auth-error" role="alert">{error}</p>}
    <button className="simple-submit" disabled={busy || (signup && !plans.length)}>{busy ? 'Please wait…' : signup ? 'Get Started' : 'Log In'}</button>
    <p className="simple-auth-switch">{signup ? 'Already have an account?' : 'Need an account?'} <button type="button" onClick={() => toggle(signup ? 'login' : 'signup')}>{signup ? 'Log In' : 'Sign Up'}</button></p>
  </form>;
}

function Overview({ me }) {
  const [d, setD] = useState(null); useEffect(() => { api('/dashboard').then(setD); }, []);
  if (!d) return <p>Loading…</p>;
  const S = ({ l, v }) => <div className="card stat"><b>{v}</b>{l}</div>;
  return <><div className="card">Plan: <b>{me.plan?.name}</b> · Payment: <Badge s={me.user.pay_status} />{me.user.pay_expires && <> · expires {dt(me.user.pay_expires)}</>}</div>
    <div className="grid"><S l="Connected accounts" v={`${d.accounts} / ${me.plan.max_accounts}`} /><S l="Enabled" v={d.enabled} /><S l="Media items" v={d.videos} /><S l="Storage" v={mb(d.bytes)} /><S l="Scheduled" v={d.scheduled} /><S l="Published" v={d.published} /><S l="Failed/blocked" v={d.failed} /></div>
    {+d.accounts === 0 && <div className="card">No Instagram account yet. Open “Accounts” to connect one.</div>}</>;
}
function Accounts({ me, say }) {
  const [a, setA] = useState([]), load = useCallback(() => api('/accounts').then(setA), []); useEffect(() => { load(); }, [load]);
  const act = async (fn, msg) => { try { await fn(); say(msg); load(); } catch (x) { say(x.message); } };
  return <><div className="card"><p>Requires an Instagram Professional account and a configured Meta app.</p>
    {me.metaConfigured ? <a className="btn" href="/api/ig/connect">Connect Instagram account</a> : <p className="warn">Meta app is not configured (META_APP_ID / META_APP_SECRET in .env).</p>}</div>
    <div className="card"><table><tbody>{a.map(x => <tr key={x.id}><td>{x.picture && <img src={x.picture} width="32" style={{ borderRadius: 16 }} />} @{x.username}</td><td><Badge s={x.status} /> {x.enabled ? 'enabled' : 'disabled'}</td>
      <td>{x.token_expires && 'token until ' + dt(x.token_expires)}{x.last_error && <div style={{ color: '#c00' }}>{x.last_error}</div>}</td><td>{x.scheduled} scheduled</td>
      <td>{x.status !== 'DISCONNECTED' && <><button className="g" onClick={() => act(() => api(`/accounts/${x.id}/enabled`, { method: 'POST', body: { enabled: !x.enabled } }), 'Updated')}>{x.enabled ? 'Disable' : 'Enable'}</button> <button className="g" onClick={() => confirm('Disconnect? Pending posts will be cancelled and the token deleted. (Disable keeps the connection.)') && act(() => api('/accounts/' + x.id, { method: 'DELETE' }), 'Disconnected')}>Disconnect</button></>}
        {['REAUTH_REQUIRED', 'DISCONNECTED', 'CONNECTION_ERROR'].includes(x.status) && <a className="btn" href="/api/ig/connect">Reconnect</a>}</td></tr>)}</tbody></table>{!a.length && <p>No accounts connected.</p>}</div></>;
}
function Videos({ me, say }) {
  const [v, setV] = useState([]), [upload, setUpload] = useState(null), [uploadError, setUploadError] = useState(''), load = useCallback(() => api('/videos').then(setV), []); useEffect(() => { load(); }, [load]);
  const uploading = upload && !['complete', 'failed'].includes(upload.phase);
  const up = async file => {
    if (!file) return;
    let id;
    setUploadError('');
    setUpload({ phase: 'Preparing upload', percent: null });
    try {
      const created = await api('/videos', { method: 'POST', body: { filename: file.name, size: file.size } });
      id = created.id;
      setUpload({ phase: 'Uploading media', percent: 0 });
      await new Promise((ok, no) => {
        const x = new XMLHttpRequest();
        x.open('PUT', created.url);
        x.setRequestHeader('x-requested-with', 'web');
        x.setRequestHeader('Content-Type', created.contentType);
        x.upload.onprogress = p => {
          const total = p.lengthComputable ? p.total : file.size;
          if (total > 0) setUpload({ phase: 'Uploading media', percent: Math.min(100, Math.round(p.loaded / total * 100)) });
        };
        x.onload = () => x.status < 300 ? ok() : no(new Error(`Upload failed (${x.status}${x.statusText ? ` ${x.statusText}` : ''})`));
        x.onerror = () => no(new Error('Upload failed due to a network error.'));
        x.onabort = () => no(new Error('Upload was cancelled.'));
        x.send(file);
      });
      setUpload({ phase: 'Verifying upload', percent: null });
      await api(`/videos/${id}/complete`, { method: 'POST' });
      setUpload({ phase: 'Upload complete', percent: 100 });
      say('Upload complete');
    } catch (x) {
      let message = x.message;
      if (id) {
        try { await api(`/videos/${id}`, { method: 'DELETE' }); }
        catch (cleanupError) { message += ` Cleanup also failed: ${cleanupError.message}`; }
      }
      setUpload({ phase: 'Upload failed', percent: null });
      setUploadError(message);
      say(message);
    } finally { load(); }
  };
  return <><div className="card"><input type="file" accept=".mp4,.mov,.jpg,.jpeg,video/mp4,video/quicktime,image/jpeg" onChange={event => { const file = event.target.files[0]; event.target.value = ''; up(file); }} disabled={uploading} />
    {upload && <div className="video-upload-progress" role="status" aria-live="polite"><span>{upload.phase}{upload.percent !== null && `: ${upload.percent}%`}</span><progress aria-label="Video upload progress" max="100" value={upload.percent ?? undefined} /></div>}
    {uploadError && <p className="video-upload-error" role="alert">{uploadError}</p>}
    <small>MP4/MOV videos and JPEG images · max {me.plan.max_mb} MB · storage: {me.storageMode}</small></div>
    <div className="card"><table><tbody>{v.map(x => <tr key={x.id}><td>{x.filename}</td><td>{x.media_type === 'IMAGE' ? 'Image' : 'Video'}</td><td>{mb(x.size)}</td><td><Badge s={x.status} /></td><td>{dt(x.created_at)}</td>
      <td><button className="g" onClick={async () => { try { await api('/videos/' + x.id, { method: 'DELETE' }); load(); } catch (e) { say(e.message); } }}>Delete</button>      </td></tr>)}</tbody></table>{!v.length && <p>No media yet.</p>}</div></>;
}
function Schedule({ me, say }) {
  const [media, setMedia] = useState([]), [as, setAs] = useState([]), [posts, setPosts] = useState([]);
  const [sel, setSel] = useState({ postType: 'REEL', mediaIds: [], accounts: [], times: [''], caption: '' });
  const load = useCallback(() => { api('/videos').then(x => setMedia(x.filter(y => y.status === 'READY'))); api('/accounts').then(x => setAs(x.filter(y => y.enabled && y.status === 'CONNECTED'))); api('/posts').then(setPosts); }, []); useEffect(() => { load(); }, [load]);
  const times = sel.times.filter(Boolean), jobs = sel.accounts.length * times.length;
  const options = sel.postType === 'REEL' ? media.filter(x => x.media_type === 'VIDEO') : sel.postType === 'IMAGE' ? media.filter(x => x.media_type === 'IMAGE') : media;
  const toggleAccount = (id, checked) => setSel(current => ({ ...current, accounts: checked ? [...new Set([...current.accounts, id])] : current.accounts.filter(item => item !== id) }));
  const toggleMedia = (id, checked) => setSel(current => ({ ...current, mediaIds: checked ? [...new Set([...current.mediaIds, id])] : current.mediaIds.filter(item => item !== id) }));
  const send = async now => { try { const r = await api('/posts', { method: 'POST', body: { postType: sel.postType, mediaIds: sel.mediaIds, accountIds: sel.accounts, times: now ? ['now'] : times.map(t => new Date(t).toISOString()), caption: sel.caption } }); say(`${r.created} job(s) created${r.duplicatesSkipped ? `, ${r.duplicatesSkipped} duplicate(s) skipped` : ''}`); load(); } catch (x) { say(x.message); } };
  const act = async (id, a) => { try { await api(`/posts/${id}/${a}`, { method: 'POST' }); load(); } catch (x) { say(x.message); } };
  const selectionValid = sel.postType === 'CAROUSEL' ? sel.mediaIds.length >= 2 && sel.mediaIds.length <= 10 : sel.mediaIds.length === 1;
  const typeName = { REEL: 'Reel', IMAGE: 'Image', CAROUSEL: 'Carousel' };
  return <>{me.publishBlockedReason && <div className="warn">Publishing blocked: {me.publishBlockedReason}</div>}
    <div className="card"><h3>New post</h3>
      <label>Post type<select value={sel.postType} onChange={event => setSel({ ...sel, postType: event.target.value, mediaIds: [] })}><option value="REEL">Reel</option><option value="IMAGE">Image</option><option value="CAROUSEL">Carousel (2–10 items)</option></select></label>
      <fieldset className="schedule-selection"><legend>{sel.postType === 'CAROUSEL' ? 'Choose 2–10 carousel items' : `Choose ${sel.postType === 'IMAGE' ? 'an image' : 'a video'}`}</legend>
        {options.map(item => <label key={item.id}><input type={sel.postType === 'CAROUSEL' ? 'checkbox' : 'radio'} name="post-media" checked={sel.mediaIds.includes(item.id)} onChange={event => sel.postType === 'CAROUSEL' ? toggleMedia(item.id, event.target.checked) : setSel({ ...sel, mediaIds: [item.id] })} /> {item.filename} <small>({item.media_type === 'IMAGE' ? 'JPEG image' : 'video'})</small></label>)}
        {!options.length && <p>No matching media yet. Upload items in the Media Library.</p>}
      </fieldset>
      <fieldset className="schedule-selection"><legend>Select Instagram accounts</legend>
        <label><input type="checkbox" checked={as.length > 0 && sel.accounts.length === as.length} onChange={event => setSel({ ...sel, accounts: event.target.checked ? as.map(account => account.id) : [] })} /> Select all accounts</label>
        {as.map(a => <label key={a.id}><input type="checkbox" checked={sel.accounts.includes(a.id)} onChange={event => toggleAccount(a.id, event.target.checked)} /> @{a.username}</label>)}
        {!as.length && <p>No connected, enabled accounts available.</p>}
      </fieldset>
      {sel.times.map((t, i) => <input key={i} type="datetime-local" value={t} onChange={x => setSel({ ...sel, times: sel.times.map((o, j) => j === i ? x.target.value : o) })} />)}
      <button className="g" onClick={() => setSel({ ...sel, times: [...sel.times, ''] })}>+ Add date/time</button>
      <textarea placeholder="Caption" onChange={x => setSel({ ...sel, caption: x.target.value })} />
      <p>{sel.mediaIds.length} {sel.postType === 'CAROUSEL' ? 'item(s)' : 'media item'} · {sel.accounts.length} account(s) × {times.length} time(s) = <b>{jobs}</b> {typeName[sel.postType].toLowerCase()} publishing job(s). Times use your browser timezone and are stored in UTC.</p>
      <button className="p" disabled={!selectionValid || !jobs} onClick={() => send(false)}>Schedule</button> <button className="g" disabled={!selectionValid || !sel.accounts.length} onClick={() => confirm(`Publish this ${typeName[sel.postType].toLowerCase()} now to ${sel.accounts.length} account(s)?`) && send(true)}>Publish now</button></div>
    <div className="card"><h3>Jobs</h3><table><tbody>{posts.map(p => <tr key={p.id}><td>{dt(p.run_at)}</td><td>@{p.username}</td><td>{p.post_type === 'REEL' ? 'Reel' : p.post_type === 'IMAGE' ? 'Image' : 'Carousel'}: {p.filename}</td><td><Badge s={p.status} />{p.error && <div style={{ color: '#c00', fontSize: 12 }}>{p.error}</div>}</td>
      <td>{['SCHEDULED', 'FAILED', 'BLOCKED'].includes(p.status) && <button className="g" onClick={() => act(p.id, 'cancel')}>Cancel</button>} {['FAILED', 'BLOCKED'].includes(p.status) && <button className="g" onClick={() => act(p.id, 'retry')}>Retry</button>}</td></tr>)}</tbody></table>{!posts.length && <p>Nothing scheduled.</p>}</div></>;
}
function Admin({ say }) {
  const [u, setU] = useState([]), [o, setO] = useState(null), [s, setS] = useState({}), [pl, setPl] = useState([]), [q, setQ] = useState('');
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [configDrafts, setConfigDrafts] = useState({});
  const [configStatus, setConfigStatus] = useState({});
  const load = useCallback(() => { api('/admin/users?search=' + encodeURIComponent(q)).then(setU); api('/admin/overview').then(setO); api('/admin/settings').then(setS); api('/admin/plans').then(setPl); }, [q]);
  useEffect(() => { load(); }, [load]);
  const patch = async (id, b) => { try { await api('/admin/users/' + id, { method: 'PATCH', body: b }); load(); } catch (x) { say(x.message); } };
  const savePlan = async p => { try { await api('/admin/plans/' + p.id, { method: 'PUT', body: p }); say('Plan saved'); } catch (x) { say(x.message); } };
  const upd = (i, k, v) => setPl(pl.map((p, j) => j === i ? { ...p, [k]: k === 'publish_ok' ? v : +v } : p));
  const getPlanDefaults = planId => {
    const plan = pl.find(p => String(p.id) === String(planId)) || pl[0] || {};
    return {
      planId: Number(plan.id || 1),
      max_accounts: Number(plan.max_accounts || 0),
      monthly_posts: Number(plan.monthly_posts || 0),
      max_mb: Number(plan.max_mb || 0),
      horizon_days: Number(plan.horizon_days || 0),
      publish: Boolean(plan.publish_ok ?? false),
    };
  };
  const openUserConfig = async user => {
    const nextId = expandedUserId === user.id ? null : user.id;
    setExpandedUserId(nextId);
    if (!nextId) return;
    setConfigStatus(v => ({ ...v, [user.id]: { ...v[user.id], loading: true, error: '', success: '' } }));
    try {
      const cfg = await api('/admin/users/' + user.id + '/config');
      setConfigDrafts(prev => ({
        ...prev,
        [user.id]: {
          planId: Number(cfg.planId ?? user.plan_id ?? getPlanDefaults(user.plan_id || 1).planId),
          max_accounts: Number(cfg.config?.max_accounts ?? cfg.planDefaults?.max_accounts ?? getPlanDefaults(user.plan_id || 1).max_accounts),
          monthly_posts: Number(cfg.config?.monthly_posts ?? cfg.planDefaults?.monthly_posts ?? getPlanDefaults(user.plan_id || 1).monthly_posts),
          max_mb: Number(cfg.config?.max_mb ?? cfg.planDefaults?.max_mb ?? getPlanDefaults(user.plan_id || 1).max_mb),
          horizon_days: Number(cfg.config?.horizon_days ?? cfg.planDefaults?.horizon_days ?? getPlanDefaults(user.plan_id || 1).horizon_days),
          publish: cfg.config?.publish ?? cfg.planDefaults?.publish ?? getPlanDefaults(user.plan_id || 1).publish,
        }
      }));
      setConfigStatus(v => ({ ...v, [user.id]: { loading: false, error: '', success: '' } }));
    } catch (x) {
      const fallback = getPlanDefaults(user.plan_id || 1);
      setConfigDrafts(prev => ({ ...prev, [user.id]: { ...fallback, planId: Number(user.plan_id || fallback.planId) } }));
      setConfigStatus(v => ({ ...v, [user.id]: { loading: false, error: x.message, success: '' } }));
    }
  };
  const updateDraft = (userId, key, value) => setConfigDrafts(prev => ({ ...prev, [userId]: { ...(prev[userId] || {}), [key]: value } }));
  const saveUserConfig = async userId => {
    const draft = configDrafts[userId];
    if (!draft) return;
    setConfigStatus(v => ({ ...v, [userId]: { ...v[userId], saving: true, error: '', success: '' } }));
    try {
      await api('/admin/users/' + userId, { method: 'PATCH', body: {
        plan_id: Number(draft.planId),
        max_accounts: Number(draft.max_accounts),
        monthly_posts: Number(draft.monthly_posts),
        max_mb: Number(draft.max_mb),
        horizon_days: Number(draft.horizon_days),
        publish: Boolean(draft.publish),
      } });
      await load();
      setConfigStatus(v => ({ ...v, [userId]: { ...v[userId], saving: false, success: 'Changes saved', error: '' } }));
      say('User settings saved');
    } catch (x) {
      setConfigStatus(v => ({ ...v, [userId]: { ...v[userId], saving: false, success: '', error: x.message } }));
      say(x.message);
    }
  };
  const resetUserConfig = user => {
    const fallback = getPlanDefaults(user.plan_id || 1);
    setConfigDrafts(prev => ({ ...prev, [user.id]: { ...fallback, planId: Number(user.plan_id || fallback.planId) } }));
    setConfigStatus(v => ({ ...v, [user.id]: { ...v[user.id], error: '', success: 'Restored plan defaults' } }));
  };
  return <>{o && <div className="card grid">{Object.entries(o.stats).map(([k, v]) => <div key={k} className="stat"><b>{k === 'bytes' ? mb(v) : v}</b>{k}</div>)}</div>}
    <div className="card">Global publishing: <b>{s.paused === 'true' ? 'PAUSED' : 'active'}</b> <button className="g" onClick={() => api('/admin/settings', { method: 'POST', body: { paused: s.paused !== 'true' } }).then(load)}>{s.paused === 'true' ? 'Resume' : 'Pause'}</button>
      {' '}Retention days: <input style={{ width: 70 }} defaultValue={s.retention_days} key={s.retention_days} onBlur={x => api('/admin/settings', { method: 'POST', body: { retention_days: x.target.value } })} /></div>
    <div className="card"><h3>Plans</h3>{pl.map((p, i) => <div key={p.id}><b>{p.name}</b> {['max_accounts', 'monthly_posts', 'max_mb', 'horizon_days'].map(k => <label key={k}> {k} <input style={{ width: 80 }} type="number" value={p[k]} onChange={x => upd(i, k, x.target.value)} /></label>)} <label><input type="checkbox" style={{ width: 'auto' }} checked={p.publish_ok} onChange={x => upd(i, 'publish_ok', x.target.checked)} /> publish</label> <button className="g" onClick={() => savePlan(p)}>Save</button></div>)}</div>
    <div className="card"><h3>Users</h3><input placeholder="Search email" onChange={x => setQ(x.target.value)} /><table className="admin-user-table"><tbody>{u.map(x => {
      const draft = configDrafts[x.id];
      const status = configStatus[x.id] || {};
      const isExpanded = expandedUserId === x.id;
      return <Fragment key={x.id}>
        <tr className={isExpanded ? 'admin-user-row expanded' : 'admin-user-row'}>
          <td className="admin-user-email">{x.email}<br /><small>{x.accounts} acct · {x.scheduled} sched</small></td>
          <td><select value={x.plan_id || ''} onChange={e => patch(x.id, { plan_id: +e.target.value })}>{pl.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
          <td><select value={x.pay_status} onChange={e => patch(x.id, e.target.value === 'PAID' ? { pay_status: 'PAID', pay_expires: new Date(Date.now() + 30 * 864e5).toISOString() } : { pay_status: e.target.value })}>{['UNPAID', 'PAYMENT_PENDING', 'PAID', 'OVERDUE', 'REFUNDED', 'CANCELLED'].map(p => <option key={p}>{p}</option>)}</select>{x.pay_expires && <small><br />until {dt(x.pay_expires)}</small>}</td>
          <td><button className="g" onClick={() => confirm('Change publishing permission?') && patch(x.id, { publish_enabled: !x.publish_enabled })}>{x.publish_enabled ? 'Publishing on' : 'Publishing off'}</button> <button className="g" onClick={() => confirm(x.active ? 'Disable this user?' : 'Enable this user?') && patch(x.id, { active: !x.active })}>{x.active ? 'Disable' : 'Enable'}</button></td>
          <td className="admin-user-actions"><button className="btn secondary admin-config-trigger" onClick={() => openUserConfig(x)}>{isExpanded ? 'Hide config' : 'Configure'}</button></td>
        </tr>
        {isExpanded && <tr className="admin-user-config-row"><td colSpan="5">
          <div className="admin-user-config-panel">
            {status.loading && <div className="admin-panel-state">Loading user limits…</div>}
            {!status.loading && draft && <>
              <div className="admin-config-header">
                <div><strong>{x.email}</strong><small>Custom plan limits</small></div>
                <div className="admin-config-actions">
                  <button className="g" onClick={() => resetUserConfig(x)}>Reset to Plan Defaults</button>
                  <button className="p" onClick={() => saveUserConfig(x.id)} disabled={status.saving}>{status.saving ? 'Saving…' : 'Save Changes'}</button>
                </div>
              </div>
              <div className="admin-config-grid">
                <label>
                  <span>Plan</span>
                  <select value={draft.planId || ''} onChange={e => {
                    const nextPlanId = Number(e.target.value);
                    const defaults = getPlanDefaults(nextPlanId);
                    setConfigDrafts(prev => ({ ...prev, [x.id]: { ...prev[x.id], planId: nextPlanId, ...defaults } }));
                  }}>{pl.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                </label>
                <label><span>Max accounts</span><input type="number" min="0" value={draft.max_accounts ?? 0} onChange={e => updateDraft(x.id, 'max_accounts', Number(e.target.value) || 0)} /></label>
                <label><span>Monthly posts</span><input type="number" min="0" value={draft.monthly_posts ?? 0} onChange={e => updateDraft(x.id, 'monthly_posts', Number(e.target.value) || 0)} /></label>
                <label><span>Max MB</span><input type="number" min="0" value={draft.max_mb ?? 0} onChange={e => updateDraft(x.id, 'max_mb', Number(e.target.value) || 0)} /></label>
                <label><span>Horizon days</span><input type="number" min="0" value={draft.horizon_days ?? 0} onChange={e => updateDraft(x.id, 'horizon_days', Number(e.target.value) || 0)} /></label>
                <label className="toggle-row"><span>Publishing</span><input type="checkbox" checked={Boolean(draft.publish)} onChange={e => updateDraft(x.id, 'publish', e.target.checked)} /></label>
              </div>
              {status.error && <div className="admin-panel-state error">{status.error}</div>}
              {status.success && <div className="admin-panel-state success">{status.success}</div>}
            </>}
          </div>
        </td></tr>}
      </Fragment>;
    })}</tbody></table></div>
    {o && <div className="card"><h3>Failed jobs</h3>{o.failed.map(f => <p key={f.id}>{f.email}: {f.error}</p>)}<h3>Audit log</h3>{o.audit.map((a, i) => <p key={i}><small>{dt(a.at)} {a.action}{a.user_email && ` · ${a.user_email}`}{a.account_username && ` · @${a.account_username}`}<br />{JSON.stringify(a.detail)}</small></p>)}</div>}</>;
}
export default function App() {
  const [me, setMe] = useState(undefined), [tab, setTab] = useState('Overview'), [msg, setMsg] = useState(''), [plans, setPlans] = useState([]);
  const load = useCallback(async () => { const data = await loadMe(); setMe(data); }, []); useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!me) api('/public/plans').then(setPlans).catch(() => setPlans([])); }, [me]);
  const say = m => { setMsg(m); setTimeout(() => setMsg(''), 4000); };
  useEffect(() => { const p = new URLSearchParams(location.search); if (p.get('error')) say(p.get('error')); if (p.get('connected')) say('Instagram account connected'); if ([...p].length) history.replaceState({}, '', '/'); }, []);
  if (me === undefined) return <p style={{ padding: 24 }}>Loading…</p>;
  if (!me) return <><SimpleLanding plans={plans} done={load} />{msg && <div className="toast">{msg}</div>}</>;
  const tabs = ['Overview', 'Accounts', 'Media Library', 'Schedule', ...(me.user.role === 'ADMIN' ? ['Admin'] : [])];
  const P = { me, say };
  return <div className="app"><nav><b style={{ color: '#fff', marginBottom: 8 }}>Reel Scheduler</b>{tabs.map(t => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
    <button onClick={async () => { await api('/auth/logout', { method: 'POST' }); setMe(null); }}>Log out</button></nav>
    <main><h2>{tab}</h2>{tab === 'Overview' && <Overview {...P} />}{tab === 'Accounts' && <Accounts {...P} />}{tab === 'Media Library' && <Videos {...P} />}{tab === 'Schedule' && <Schedule {...P} />}{tab === 'Admin' && (me.user.role === 'ADMIN' ? <Admin say={say} /> : <div className="card">Admins only.</div>)}</main>{msg && <div className="toast">{msg}</div>}</div>;
}
