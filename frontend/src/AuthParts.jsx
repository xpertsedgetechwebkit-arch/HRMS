import {useState} from 'react';

const EYE = 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';
const EYE_OFF = 'M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3 3.5M6.5 7.6C4 9.3 3 12 3 12s4 6 9 6c1.4 0 2.7-.4 3.8-.9M9.9 9.9a3 3 0 0 0 4.2 4.2';
const Tick = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>;

export function PasswordField({id, value, onChange, autoComplete = 'current-password', placeholder = 'Enter your password'}) {
  const [show, setShow] = useState(false), [caps, setCaps] = useState(false);
  return <>
    <div className="xe-pw">
      <input id={id} className="xe-input" type={show ? 'text' : 'password'} autoComplete={autoComplete} placeholder={placeholder} required value={value} onChange={onChange}
        onKeyUp={e => e.getModifierState && setCaps(e.getModifierState('CapsLock'))} onBlur={() => setCaps(false)}/>
      <button type="button" className="xe-eye" aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={show ? EYE_OFF : EYE}/></svg>
      </button>
    </div>
    {caps && <div className="xe-caps" role="status">Caps Lock is on</div>}
  </>;
}

export const Spinner = () => <span className="xe-spin" aria-hidden="true"/>;

function MailPreview() {
  const rows = [['hr@xpertsedgetech.com', 'Welcome to XpertsEdge Mail', '03:39 PM', true], ['it@xpertsedgetech.com', 'Your mailbox is ready', '02:17 PM', true]];
  return <div className="xe-pv" aria-hidden="true">
    <div className="xe-pv-inbox"><div className="xe-pv-head"><b>Inbox</b><span>2</span></div>
      {rows.map(([from, sub, time, unread]) => <div key={from} className={'xe-pv-row' + (unread ? ' u' : '')}><i>{from.slice(0, 2).toUpperCase()}</i><span><b>{from}</b><em>{sub}</em></span><small>{time}</small></div>)}</div>
    <div className="xe-pv-compose"><div className="xe-pv-ch">New message</div><div className="xe-pv-line">To <span>hr@xpertsedgetech.com</span></div><div className="xe-pv-line mut">Subject</div>
      <div className="xe-pv-bars"><u/><u/><u/></div><div className="xe-pv-send"><span>Send</span><small>Saved just now</small></div></div>
  </div>;
}

function AppsPreview() {
  const items = [['Webmail', 'Inbox, compose and drafts'], ['HRMS', 'Employees and departments'], ['Organization', 'User accounts, roles & settings']];
  return <div className="xe-pv xe-pv-apps" aria-hidden="true"><div className="xe-pv-inbox">
    <div className="xe-pv-head"><b>Your apps</b></div>
    {items.map(([n, d]) => <div key={n} className="xe-pv-row"><i className="sq">{n[0]}</i><span><b>{n}</b><em>{d}</em></span></div>)}</div></div>;
}

function WorkspacePreview() {
  const cards = [
    ['people', 'People', 'Attendance, leave and payroll'],
    ['recruitment', 'Recruitment', 'Streamline hiring and track applicants'],
    ['mail', 'Mail', 'Company mailboxes and secure access']
  ];
  return <div className="xe-workspace-preview" aria-hidden="true">
    <div className="xe-orbit"/>
    {cards.map(([kind, title, text]) => <div className={'xe-workspace-card ' + kind} key={kind}>
      <span className="xe-workspace-icon">{kind === 'people' ? '◉' : kind === 'recruitment' ? '▣' : '✉'}</span>
      <b>{title}</b><small>{text}</small>
    </div>)}
  </div>;
}

const COPY = {
  hrms: {h: <>Work, hiring and mail.<br/>Connected.</>, p: 'Bring your people operations, recruitment and company communication together in one secure workspace.', chips: []},
  mail: {h: <>Stay connected.<br/>Keep work moving.</>, p: 'Access your secure XpertsEdge mailbox for company communication, collaboration and timely updates.', chips: ['Secure company mailbox', 'Reliable delivery', 'Access from any device']}
};

export function AuthShell({variant = 'hrms', title, subtitle, children}) {
  const c = COPY[variant];
  return <main className={`xe-auth xe-auth--${variant}`}>
    <section className="xe-brand">
      <div className="xe-brand-top"><span className="xe-tile"><img src="/logo.png" alt="XpertsEdge logo"/></span><span>{variant === 'hrms' ? 'XpertsEdge Technologies' : 'XpertsEdge Mail'}</span></div>
      <div className="xe-brand-mid">
        <div><h2>{c.h}</h2><p>{c.p}</p></div>
        {variant === 'mail' && <MailPreview/>}
        {variant === 'hrms' && <WorkspacePreview/>}
        {c.chips.length > 0 && <ul className="xe-chips">{c.chips.map(x => <li key={x}><Tick/>{x}</li>)}</ul>}
      </div>
      <small>© {new Date().getFullYear()} XpertsEdge Technologies</small>
    </section>
    <div className="xe-auth-main">
      <div className="xe-card">
        <img className={'xe-mlogo' + (variant === 'hrms' ? ' xe-hrms-logo' : '')} src="/logo.png" alt="XpertsEdge logo"/>
        <h1>{title}</h1>{subtitle && <p className="xe-sub">{subtitle}</p>}
        {children}
      </div>
    </div>
  </main>;
}

