import {useState, useEffect, useRef} from 'react';
import {api} from './api';
import {ic} from './icons';
import {HrModule,OrganizationModule} from './BasicModules';
import {MailWorkspace} from './Webmail';
import {AuthShell, PasswordField, Spinner} from './AuthParts';

const TENANT = 'xpertsedgetech', DOM = 'xpertsedgetech.com';
const LOGO_URL = '/logo.png', LOGO_FULL = '/logo-full.png';
const APPS = [
  {id: 'webmail', n: 'Webmail', d: 'Inbox, compose and drafts', i: 'mail', c: '#D7F0E6', f: '#1c6b55'},
  {id: 'hrms', n: 'HRMS', d: 'Employees and departments', i: 'users', c: '#D7F0E6', f: '#1c6b55'},
  {id: 'recruit', n: 'Recruitment', d: 'Hiring & applicant tracking', i: 'brief', c: '#E8E0FA', f: '#5b3fb0'},
  {id: 'mail', n: 'Mail Admin', d: 'Mailboxes & aliases', i: 'mail', c: '#FCDDD2', f: '#b5482a'},
  {id: 'org', n: 'Organization', d: 'User accounts, roles & settings', i: 'bld', c: '#D8E7FB', f: '#2a5db0'}
];
const I = ({n}) => <span style={{display: 'inline-flex'}} dangerouslySetInnerHTML={{__html: ic[n]}}/>;
const Logo = () => <div className="logo">{LOGO_URL ? <img src={LOGO_URL} alt={TENANT}/> : TENANT[0].toUpperCase()}</div>;
const currentView = () => {
  if (location.hash === '#/webmail') return 'webmail';
  if (location.hash === '#/home' || location.hash === '') return 'home';

  const app = APPS.find(item => location.hash === '#/' + item.id);
  return app ? app.id : 'home';
};
const canOpen=(user,id)=>id==='webmail'||user.role==='ADMIN'||id==='hrms'&&['HR_ADMIN','EMPLOYEE'].includes(user.role)||id==='mail'&&user.role==='MAIL_ADMIN';
const userInitials = user => {
  const parts = (user.name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return Array.from(user.email || '?')[0].toUpperCase();
  return (Array.from(parts[0])[0] + (parts.length > 1 ? Array.from(parts[parts.length - 1])[0] : '')).toUpperCase();
};
const gen = () => { const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => alphabet[b % alphabet.length]).join(''); };
function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.append(e); setTimeout(() => e.remove(), 2400); }

export default function App() {
  const [user, setUser] = useState(null), [view, updateView] = useState(currentView), [ready, setReady] = useState(false), [startupError, setStartupError] = useState('');
  useEffect(() => { document.title = view === 'webmail' ? 'XpertsEdge Mail' : 'XpertsEdge HRMS'; }, [view]);
  const setView = next => {
    // Remember that an administrator opened Webmail from HRMS.  The mailbox
    // has its own session, so this small UI flag keeps the safe return route
    // available on the intervening mailbox sign-in screen as well.
    if (next === 'webmail' && user?.role === 'ADMIN') sessionStorage.setItem('wb_hrms_admin_return', '1');
    const target = '#/' + next;
    if (location.hash !== target) location.hash = target;
    updateView(next);
  };
  useEffect(() => {
    const sync = () => { updateView(currentView()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const restore = () => {
    setStartupError(''); setReady(false); localStorage.removeItem('wb_token');
    api('/me').then(setUser).catch(e => { if(e.status === 401) setUser(null); else setStartupError(e.message); }).finally(() => setReady(true));
  };
  useEffect(() => {
    restore();
    const expired = () => { setUser(null); setView(currentView()==='webmail'?'webmail':'home'); };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  const out = async () => {
    try { await api('/auth/logout', {method:'POST'}); }
    catch(e) { if(e.status !== 401) { toast('Sign out failed. Please retry.'); return; } }
    sessionStorage.removeItem('wb_notice'); sessionStorage.removeItem('wb_hrms_admin_return'); setUser(null); setView(view==='webmail'?'webmail':'home');
  };
  if (view === 'webmail') return <MailWorkspace home={()=>{restore();setView('home');}} hrmsAdmin={user?.role==='ADMIN'} canReturnToHrms={user?.role==='ADMIN'||sessionStorage.getItem('wb_hrms_admin_return')==='1'}/>;
  if (!ready) return <div className="center" role="status">Checking your session…</div>;
  if (startupError) return <div className="center"><div role="alert"><p>{startupError}</p><button className="btn" onClick={restore}>Retry connection</button></div></div>;
  if (!user) return <Login onDone={setUser}/>;
  if (view === 'home') return <Home user={user} out={out} go={setView}/>;
  const app = APPS.find(a => a.id === view);
  return <Shell user={user} out={out} go={setView} app={app}>
      {!canOpen(user,view)?<div className="page"><h1>Access restricted</h1><p>Your role does not have access to this module.</p><button className="btn" onClick={()=>setView('home')}>Back to home</button></div>:view==='hrms'?<HrModule user={user}/>:view==='org'?<OrganizationModule user={user}/>:view === 'mail' ? <Mail go={setView} user={user}/> : <div className="soon"><div className="tile" style={{background: app.c, color: app.f}}><I n={app.i}/></div>
      <h2>{app.n} is coming soon</h2><p style={{color: 'var(--mut)'}}>{app.d}. This app isn’t set up yet.</p>
      <button className="btn dark" onClick={() => setView('home')}>Back to apps</button></div>}
  </Shell>;
}

function Login({onDone}) {
  const [f, setF] = useState({email: '', password: ''}), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [help, setHelp] = useState(false);
  const notice = sessionStorage.getItem('wb_notice');
  const submit = async e => {
    e.preventDefault(); if(busy) return; setBusy(true); setErr('');
    try { const r = await api('/auth/login', {method: 'POST', body: f}); sessionStorage.removeItem('wb_notice'); onDone(r.user); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return <AuthShell variant="hrms" title="Sign in" subtitle={`Use your ${TENANT} work account.`}>
    {notice && <div className="xe-note">{notice}</div>}
    {err && <div className="xe-alert" role="alert">{err}</div>}
    <form className="xe-form" onSubmit={submit}>
      <label htmlFor="em">Work email</label>
      <input id="em" className="xe-input" type="email" autoComplete="username" placeholder={`you@${DOM}`} required value={f.email} onChange={e => setF({...f, email: e.target.value})}/>
      <label htmlFor="pw">Password</label>
      <PasswordField id="pw" value={f.password} onChange={e => setF({...f, password: e.target.value})}/>
      <div className="xe-forgot-row"><button type="button" className="xe-link" onClick={() => setHelp(!help)}>Forgot password?</button></div>
      {help && <div className="xe-help" role="status">Ask your admin to reset your password.</div>}
      <button className="xe-submit" disabled={busy}>{busy && <Spinner/>}{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <a className="xe-outline" href="#/webmail">Open XpertsEdge Mail →</a>
  </AuthShell>;
}

function Bell({cls}) {
  const loadSequence=useRef(0);
  const [l, setL] = useState([]), [o, setO] = useState(false), [err, setErr] = useState(''), [unread,setUnread]=useState(0), [pending,setPending]=useState(false);
  const load = async () => {
    const sequence=++loadSequence.current;
    try { const [items,summary]=await Promise.all([api('/notifications'),api('/notifications/summary')]); if(sequence===loadSequence.current) {setL(items);setUnread(summary.unreadCount);setErr('');} }
    catch(e) { if(sequence===loadSequence.current) setErr(e.message); }
  };
  useEffect(() => {
    load(); const timer = setInterval(load, 30000);
    window.addEventListener('notifications-changed', load);
    return () => { ++loadSequence.current; clearInterval(timer); window.removeEventListener('notifications-changed', load); };
  }, []);
  const update = async (n, dismiss = false) => {
    if(pending) return; setPending(true);
    try { await api('/notifications/' + n.id + (dismiss ? '' : '/read'), {method: dismiss ? 'DELETE' : 'POST'}); await load(); }
    catch(e) { setErr(e.message); } finally { setPending(false); }
  };
  const readAll=async()=> { if(pending) return; setPending(true); try { await api('/notifications/read-all',{method:'POST'}); await load(); } catch(e) { setErr(e.message); } finally { setPending(false); } };
  return <><button className={cls + ' bell'} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={o} onClick={() => { setO(!o); load(); }}><I n="bell"/>{unread > 0 && <i>{unread > 99 ? '99+' : unread}</i>}</button>
    {o && <div className="dd" style={{maxHeight: '70vh', overflowY: 'auto'}}><div className="hrow"><b>Notifications</b><button className="ic" aria-label="Close notifications" onClick={() => setO(false)}>✕</button></div>
      {err && <div className="err" role="alert">{err}<button className="btn" onClick={load}>Retry</button></div>}
      {!err && !l.length && <p>No notifications yet.</p>}
      {unread>0 && <button className="btn" disabled={pending} onClick={readAll}>Mark all as read</button>}
      {l.map(n => <div className="n" key={n.id}><b>{n.title}</b><p>{n.body}</p><small style={{color:'var(--mut)'}}>{new Date(n.createdAt).toLocaleString()}</small><div className="hrow">
        {!n.read && <button className="btn" disabled={pending} onClick={() => update(n)}>Mark as read</button>}<button className="btn" disabled={pending} onClick={() => update(n,true)}>Dismiss</button></div></div>)}
      {l.length===100 && <p>Showing your latest 100 notifications. Badge counts all unread notifications.</p>}
    </div>}</>;
}

function Clock() {
  const [d, setD] = useState(new Date()); const z = n => String(n).padStart(2, '0');
  useEffect(() => { const t = setInterval(() => setD(new Date()), 1000); return () => clearInterval(t); }, []);
  return <div className="clock"><div>{z(d.getHours())}:{z(d.getMinutes())}<small>{z(d.getSeconds())}</small></div><span>LOCAL TIME</span></div>;
}

function Home({user, out, go}) {
  const [theme,setTheme]=useState(()=>localStorage.getItem('xe_portal_theme')==='dark'?'dark':'light');
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('xe_portal_theme',theme);},[theme]);
  const h = new Date().getHours(), g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const motivation = h < 12 ? 'Start with focus. Build momentum that lasts.' : h < 17 ? 'Keep moving forward. Every task creates progress.' : 'Finish strong. Tomorrow starts with today’s work.';
  const available = APPS.filter(app => canOpen(user,app.id));
  return <div className="wrap portal-home">
    <header className="portal-header">
      <a href="#/" onClick={event => { event.preventDefault(); go('home'); }} className="portal-brand home-brand" aria-label="XpertsEdge home"><Logo/><b>{TENANT}</b></a>
      <div className="portal-actions"><Bell cls="portal-bell"/><button className="portal-signout" onClick={out}>Sign out</button></div>
    </header>
    <section className="hero" aria-label="Welcome">
      <button type="button" className="portal-theme-toggle" aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'} title={theme==='dark'?'Switch to light mode':'Switch to dark mode'} aria-pressed={theme==='dark'} onClick={()=>setTheme(value=>value==='dark'?'light':'dark')}>
        {theme==='dark'?<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg>:<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z"/></svg>}
      </button>
      <div className="date">{new Date().toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long'})}</div>
      <h1 className="greet">{g}, <b>{user.name}</b></h1><p className="hero-ready">{motivation}</p><Clock/>
    </section>
    <section className="apps" aria-labelledby="apps-title"><h3 id="apps-title">Your apps <span>{available.length}</span></h3>
      <div className="grid">{available.map(app => <button key={app.id} className="app" onClick={() => go(app.id)}>
        <div className="tile" style={{background: app.c, color: app.f}}><I n={app.i}/></div><div className="go"><I n="arrow"/></div><div className="app-copy"><b>{app.n}</b><span>{app.d}</span></div></button>)}</div>
    </section>
    </div>;
}

function Shell({user, out, go, app, children}) {
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => {
    const dismiss = e => { if (e.type === 'keydown' ? e.key === 'Escape' : !e.target.closest('[data-profile]')) setProfileOpen(false); };
    document.addEventListener('click', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => { document.removeEventListener('click', dismiss); document.removeEventListener('keydown', dismiss); };
  }, []);
  return <div className="shell"><aside className="side"><a href="#/" onClick={e => { e.preventDefault(); go('home'); }} className="brand home-brand" aria-label="XpertsEdge home"><Logo/><div><b>{TENANT}</b><span>{app.id === 'mail' ? 'Mail admin' : app.n}</span></div></a>
    <button className="btn" style={{marginBottom: 16}} onClick={() => go('home')}>← Back to home</button>
    <div className="sec">MANAGE</div><button className="nav on"><I n={app.id === 'mail' ? 'mail' : app.i}/>{app.id === 'mail' ? 'Mail Accounts' : app.n}</button></aside>
    <div className="main"><div className="top"><div><button className="btn" onClick={() => go('home')}>← Home</button> <span>{app.id === 'mail' ? 'Mail · Mail Accounts' : app.n}</span></div>
      <div className="r"><button className="ic" onClick={() => go('home')} aria-label="All apps"><I n="grid"/></button><Bell cls="ic"/>
        <div data-profile><button type="button" className="av" onClick={() => setProfileOpen(v => !v)} title={user.name || user.email} aria-label="Account options" aria-expanded={profileOpen} aria-controls="account-options">{userInitials(user)}</button>
          {profileOpen && <div className="dd" id="account-options"><b>{user.name}</b><p>{user.email}</p><button type="button" className="btn" onClick={out}>Sign out</button></div>}
        </div></div></div>{children}</div></div>;
}

function Mail({go,user}) {
  const mutationLock=useRef(false), [mutating,setMutating]=useState(false);
  const loadSequence=useRef(0);
  const [tab, setTab] = useState('mail'), [boxes, setBoxes] = useState([]), [aliases, setAliases] = useState([]), [m, setM] = useState(null);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState('');
  const load = async () => {
    const sequence=++loadSequence.current;
    setLoading(true); setLoadError('');
    try { const [b, a] = await Promise.all([api('/mail/mailboxes'), api('/mail/aliases')]); if(sequence===loadSequence.current) { setBoxes(b); setAliases(a); } }
    catch (e) { if(sequence===loadSequence.current) setLoadError(e.message); } finally { if(sequence===loadSequence.current) setLoading(false); }
  };
  useEffect(() => { load(); return ()=>{++loadSequence.current;}; }, []);
  const act = async (fn,msg,onError) => {
    if(mutationLock.current) return;
    mutationLock.current=true; setMutating(true);
    try { await fn(); setM(null); toast(msg); await load(); window.dispatchEvent(new Event('notifications-changed')); }
    catch(e) { if(onError) onError(e.message); else toast(e.message); }
    finally { mutationLock.current=false; setMutating(false); }
  };
  return <div className="page"><h1>Mail Accounts</h1><p>Manage mailbox and alias records for your domain.</p>
    <div className="note"><b>Company mail workspace.</b> Create a mailbox, then use its full email address and mailbox password to sign in to Webmail. Internet delivery is handled securely through the configured mail provider.</div>
    <p>Mail domain: {DOM}. <a href="#/webmail" onClick={event=>{event.preventDefault();go('webmail');}}>Open Webmail →</a></p>
    {loading && <p role="status">Loading mail records…</p>}
    {loadError && <div className="err" role="alert">{loadError} <button className="btn" onClick={load}>Retry</button></div>}
    <div className="tabs"><button className={'tab' + (tab === 'mail' ? ' on' : '')} onClick={() => setTab('mail')}><I n="mail"/>Mailboxes</button>
      <button className={'tab' + (tab === 'alias' ? ' on' : '')} onClick={() => setTab('alias')}><I n="list"/>Aliases</button></div>
    {tab === 'mail' ? <>
      <div className="box"><div className="bh">Storage<div>
        <button className="btn" onClick={() => api('/mail/check').then(r => toast(r.message)).catch(e => toast(e.message))}>✦ Check mail server</button>
        <button className="btn" onClick={load}>Refresh records</button></div></div>
        <div className="stat"><span>Storage usage unavailable</span><span><b style={{color: 'var(--ink)'}}>{boxes.length}</b> mailbox records</span><span>Connect a provider to sync storage and quotas.</span></div></div>
      <div className="box"><div className="bh">Mailboxes<button className="btn dark" disabled={mutating || loading || !!loadError} onClick={() => setM({t: 'new'})}>+ New mailbox</button></div>
        {!loading && !loadError && !boxes.length && <div className="empty"><h4>No mailboxes yet</h4><p>Create your first mailbox record using New mailbox.</p></div>}
        <div className="tw"><table><thead><tr><th>ADDRESS</th><th>ACCESS</th><th>STORAGE</th><th>STATUS</th><th></th></tr></thead><tbody>
          {boxes.map(b => <tr key={b.id}><td>{b.address}@{DOM}<small>{b.displayName}</small></td>
            <td><span className="st">{String(b.accessRole || 'EMPLOYEE').replace('_',' ')}</span></td>
            <td><small>Usage unavailable · Requested quota: {b.quotaGb} GB</small></td>
            <td><span className="st s">{b.active ? 'LOCAL ONLY' : 'SUSPENDED LOCALLY'}</span></td>
            <td><div className="acts"><button className="ic" disabled={mutating} aria-label="Edit mailbox" onClick={() => setM({t: 'edit', b})}><I n="edit"/></button>
              <button className="btn" disabled={mutating} onClick={() => setM({t: 'reset', b})}>Reset password</button>
              <button className="btn" disabled={mutating} onClick={() => act(() => api(`/mail/mailboxes/${b.id}/toggle`, {method: 'POST'}), b.active ? 'Mailbox suspended' : 'Mailbox reactivated')}>{b.active ? 'Suspend' : 'Reactivate'}</button>
              <button className="ic" disabled={mutating} aria-label="Delete mailbox" onClick={() => setM({t: 'del', b})}>✕</button></div></td></tr>)}
        </tbody></table></div></div></>
    : <div className="box"><div className="bh">Aliases<button className="btn dark" disabled={mutating || loading || !!loadError || !boxes.length} onClick={() => setM({t: 'alias'})}>+ New alias</button></div>
      {aliases.length ? <div className="tw"><table><thead><tr><th>ALIAS</th><th>FORWARDS TO</th><th></th></tr></thead><tbody>
        {aliases.map(a => <tr key={a.id}><td>{a.alias}@{DOM}</td><td>{a.target}@{DOM}</td><td><div className="acts"><button className="btn" disabled={mutating} onClick={() => setM({t:'aliasEdit',b:a})}>Edit alias</button><button className="ic" disabled={mutating} aria-label={`Delete alias ${a.alias}`} onClick={() => setM({t:'aliasDel',b:a})}>✕</button></div></td></tr>)}</tbody></table></div>
      : <div className="empty"><div className="c"><I n="list"/></div><h4>No aliases yet</h4><p>{boxes.length ? 'Create an alias record for an existing mailbox.' : 'Create a mailbox first, then add aliases.'}</p>
        <button className="btn dark" disabled={mutating || loading || !!loadError || !boxes.length} onClick={() => setM({t: 'alias'})}>+ New alias</button></div>}</div>}
    {m && <MailModal m={m} boxes={boxes} actorRole={user.role} act={act} close={() => setM(null)}/>}</div>;
}

function MailModal({m, boxes, actorRole, act, close}) {
  const b = m.b, [f, setF] = useState({address: '', displayName: b?.displayName || '', accessRole: b?.accessRole || 'EMPLOYEE', quotaGb: b?.quotaGb || 2, password: gen(), alias: b?.alias || '', target: b?.target || boxes[0]?.address || '', confirm: ''});
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), set = k => e => setF({...f, [k]: e.target.value});
  useEffect(() => {
    const previous = document.activeElement, dialog = document.querySelector('.md');
    dialog?.querySelector('input, select, button')?.focus();
    const trap = e => {
      if (e.key !== 'Tab') return;
      const items = [...dialog.querySelectorAll('input, select, button')].filter(el => !el.disabled);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    dialog?.addEventListener('keydown', trap);
    return () => { dialog?.removeEventListener('keydown', trap); previous?.focus(); };
  }, []);
  const run = (fn, message) => { setBusy(true); return act(fn, message, setErr).finally(() => setBusy(false)); };
  const T = {new: ['New mailbox', 'Create mailbox'], edit: ['Edit mailbox', 'Save changes'], reset: ['Reset password', 'Reset password'], del: ['Delete mailbox', 'Delete mailbox'], alias: ['New alias', 'Create alias'], aliasEdit:['Edit alias','Save alias'], aliasDel:['Delete alias','Delete alias']}[m.t];
  const ok = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/;
  const go = () => {
    if (busy) return;
    setErr('');
    if ((m.t === 'new' || m.t === 'edit') && (!Number.isInteger(Number(f.quotaGb)) || Number(f.quotaGb) < 1 || Number(f.quotaGb) > 1000)) return setErr('Quota must be a whole number between 1 and 1000 GB.');
    if ((m.t === 'new' || m.t === 'reset') && (!f.password.trim() || f.password.length < 8 || new TextEncoder().encode(f.password).length > 72)) return setErr('Password must contain at least 8 characters and at most 72 bytes.');
    if (m.t === 'new') return ok.test(f.address.trim().toLowerCase()) ? run(() => api('/mail/mailboxes', {method: 'POST', body: f}), 'Mailbox created') : setErr('Use letters, numbers, dots or dashes.');
    if (m.t === 'edit') return run(() => api('/mail/mailboxes/' + b.id, {method: 'PUT', body: f}), 'Changes saved');
    if (m.t === 'reset') return run(() => api(`/mail/mailboxes/${b.id}/reset-password`, {method: 'POST', body: f}), 'Password reset');
    if (m.t === 'del') return f.confirm === b.address + '@' + DOM ? run(() => api('/mail/mailboxes/' + b.id, {method: 'DELETE'}), 'Mailbox deleted') : setErr('Address doesn’t match.');
    if(m.t==='aliasDel') return f.confirm.trim()===b.alias+'@'+DOM ? run(()=>api('/mail/aliases/'+b.id,{method:'DELETE'}),'Alias deleted') : setErr('Address doesn’t match.');
    if(!boxes.some(x=>x.address===f.target)) return setErr('Choose an existing mailbox.');
    return ok.test(f.alias.trim().toLowerCase()) ? run(() => api('/mail/aliases'+(m.t==='aliasEdit'?'/'+b.id:''), {method: m.t==='aliasEdit'?'PUT':'POST', body: f}), m.t==='aliasEdit'?'Alias updated':'Alias created') : setErr('Enter a valid alias address.');
  };
  const dom = <span style={{whiteSpace: 'nowrap', color: 'var(--mut)'}}>@{DOM}</span>;
  return <div className="ov" onClick={e => !busy && e.target === e.currentTarget && close()} onKeyDown={e => { if (e.key === 'Escape' && !busy) close(); }}><form className="md" role="dialog" aria-modal="true" aria-labelledby="mail-dialog-title" onSubmit={e => { e.preventDefault(); go(); }}><h3 id="mail-dialog-title">{T[0]}</h3><fieldset disabled={busy} style={{border: 0, padding: 0, margin: 0, minWidth: 0}}>
    {m.t === 'new' && <><label htmlFor="mail-address">Address</label><div style={{display: 'flex', gap: 8, alignItems: 'center'}}><input id="mail-address" maxLength="64" value={f.address} onChange={set('address')} placeholder="name"/>{dom}</div></>}
    {(m.t === 'new' || m.t === 'edit') && <><label htmlFor="mail-name">Display name</label><input id="mail-name" maxLength="200" value={f.displayName} onChange={set('displayName')}/>{m.t === 'new' && <><label htmlFor="mail-access">Account access</label><select id="mail-access" value={f.accessRole} onChange={set('accessRole')}><option value="EMPLOYEE">Employee — Webmail and employee HRMS access</option>{actorRole === 'ADMIN' && <><option value="MAIL_ADMIN">Mail admin — manage mailboxes and aliases</option><option value="HR_ADMIN">HR admin — HRMS employee administration</option><option value="ADMIN">Admin — all HRMS applications</option></>}</select><small>This creates a linked HRMS account with the same initial password. Change an existing account’s role in Organization.</small></>}<label htmlFor="mail-quota">Quota (GB)</label><input id="mail-quota" type="number" min="1" max="1000" step="1" value={f.quotaGb} onChange={set('quotaGb')}/></>}
    {(m.t === 'new' || m.t === 'reset') && <><label htmlFor="mail-password">{m.t === 'new' ? 'Initial password' : 'New password'}</label><input id="mail-password" autoComplete="new-password" value={f.password} onChange={set('password')}/></>}
    {m.t === 'reset' && <p>{b.address}@{DOM}</p>}
    {m.t === 'del' && <><p>This removes the local record {b.address}@{DOM} and its aliases. Type the address to confirm.</p><input aria-label="Confirm mailbox address" value={f.confirm} onChange={set('confirm')}/></>}
    {m.t==='aliasDel' && <><p>Delete the local alias {b.alias}@{DOM}? Its target mailbox will remain. Type the alias address to confirm.</p><input aria-label="Confirm alias address" value={f.confirm} onChange={set('confirm')}/></>}
    {(m.t === 'alias' || m.t==='aliasEdit') && <><label htmlFor="mail-alias">Alias address</label><div style={{display: 'flex', gap: 8, alignItems: 'center'}}><input id="mail-alias" maxLength="64" value={f.alias} onChange={set('alias')} placeholder="sales"/>{dom}</div>
      <label htmlFor="mail-target">Forward to</label><select id="mail-target" value={f.target} onChange={set('target')}>{boxes.map(x => <option key={x.id}>{x.address}</option>)}</select></>}
    <div className="err" role="alert">{err}</div><div className="row"><button type="button" className="btn" onClick={close}>Cancel</button>
      {m.t === 'reset' && <button type="button" className="btn" onClick={async () => { try { await navigator.clipboard.writeText(f.password); toast('Copied'); } catch { setErr('Copy unavailable. Select and copy the password manually.'); } }}>Copy</button>}
      <button className={'btn dark' + (m.t === 'del' || m.t==='aliasDel' ? ' danger' : '')} type="submit">{busy ? 'Saving…' : T[1]}</button></div></fieldset></form></div>;
}





