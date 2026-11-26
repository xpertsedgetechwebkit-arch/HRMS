import {useEffect,useRef,useState} from 'react';
import './webmail.css';
import MailModules from './MailModules';
import {AuthShell, PasswordField, Spinner} from './AuthParts';
import {gmailNotice} from './GmailPanel';
import {replyDraft,forwardDraft,draftSignature} from './mail-model.mjs';

const emptyDraft=()=>({id:crypto.randomUUID(),saved:false,to:'',cc:'',subject:'',body:'',attachments:[]});
const folders=['Inbox','Drafts','Scheduled','Sent','Archive','Spam','Trash'];
async function mailApi(path,options={}) {
  let response;try{response=await fetch('/api/webmail'+path,{method:options.method||'GET',credentials:'same-origin',signal:options.signal,headers:{'Content-Type':'application/json'},body:options.body?JSON.stringify(options.body):undefined});}catch{throw new Error('Cannot reach the local mail backend.');}
  if(!response.ok){const payload=await response.json().catch(()=>({}));const error=new Error(payload.message||'Mail request failed ('+response.status+').');error.status=response.status;throw error;}
  return response.status===204?null:response.json();
}
export function MailWorkspace({home,canReturnToHrms=false,hrmsAdmin=false}){
  const [user,setUser]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState('');
  const [allowAdminLaunch,setAllowAdminLaunch]=useState(true);
  async function startAdminSession(){const response=await fetch('/api/auth/webmail-session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'}});if(!response.ok){const payload=await response.json().catch(()=>({}));const failure=new Error(payload.message||'Unable to open the administrator mailbox.');failure.status=response.status;throw failure;}return response.json();}
  async function restore(){setError('');setReady(false);try{setUser(await mailApi('/me'));}catch(error){if(error.status===401&&hrmsAdmin&&allowAdminLaunch){try{const result=await startAdminSession();setUser(result.user);}catch(adminError){setError(adminError.message);}}else if(error.status!==401)setError(error.message);}finally{setReady(true);}}
  useEffect(()=>{restore();},[hrmsAdmin,allowAdminLaunch]);
  async function out(){try{await mailApi('/logout',{method:'POST'});setUser(null);setAllowAdminLaunch(false);}catch(error){setError(error.message);}}
  if(!ready)return <div className="center" role="status">Checking your mailbox session…</div>;
  if(user)return <Webmail key={user.email} user={user} home={home} canReturnToHrms={canReturnToHrms} out={out} expired={()=>setUser(null)}/>;
  return <><MailLogin onDone={setUser} home={home}/>{error&&<div className="wm-connection-error" role="alert">{error}<button className="btn" onClick={restore}>Retry</button></div>}</>;
}
const tags={Red:'#ff536c',Orange:'#ff9438',Yellow:'#f5cc51',Green:'#39d59a',Blue:'#5a9dff',Purple:'#bb80ff',Pink:'#f96eb6'};
function MailIcon({name,size=22}){const paths={Calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/></>,Contacts:<><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="9" r="2"/><path d="M8 17v-1a4 4 0 0 1 8 0v1"/></>,Storage:<><path d="m5 4-3 10v6h20v-6L19 4Z"/><path d="M2 14h20M6 17h1M10 17h1"/></>,Settings:<><circle cx="12" cy="12" r="4"/><path d="M10 3h4l1 3 3 1 3 3v4l-3 1-1 3-3 3h-4l-1-3-3-1-3-3v-4l3-1 1-3Z"/></>,Shortcuts:<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h1M11 9h1M16 9h1M6 13h1M11 13h1M16 13h1M7 16h10"/></>,Archive:<><rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8M9 12h6"/></>,mail:<><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/></>,Inbox:<><path d="m5 4-3 12v4h20v-4L19 4Z"/><path d="M2 14h6l2 3h4l2-3h6"/></>,Drafts:<><path d="M14 3H5v18h14V8Z"/><path d="M14 3v5h5"/></>,Scheduled:<><circle cx="12" cy="13" r="8"/><path d="M12 9v5l3 2M9 2h6"/></>,Sent:<><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,Spam:<><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></>,Trash:<><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></>,compose:<><path d="M20 13v7H4V4h7M14 4l3-3 6 6-3 3-8 8H7v-5Z"/></>,attach:<><path d="m20.5 11.5-8.8 8.8a5 5 0 0 1-7.1-7.1l9.2-9.2a3.5 3.5 0 0 1 5 5L9.7 18a2 2 0 1 1-2.8-2.8l8.1-8.1"/></>,search:<><circle cx="10" cy="10" r="7"/><path d="m16 16 5 5"/></>,back:<path d="m14 6-6 6 6 6"/>,logout:<><path d="M9 4H4v16h5M13 7l5 5-5 5M8 12h13"/></>,tag:<><path d="M3 3h8l10 10-8 8L3 11Z"/><circle cx="7" cy="7" r="1"/></>};return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]||paths.mail}</svg>}

export function MailLogin({onDone,home}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[rememberMe,setRememberMe]=useState(false),[code,setCode]=useState(''),[useCode,setUseCode]=useState(false);
  const [show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(event){
    event.preventDefault();if(busy)return;setBusy(true);setError('');
    try{const result=await mailApi('/login',{method:'POST',body:{email,password,rememberMe,code}});onDone(result.user);}
    catch(error){setError(error.message);}finally{setBusy(false);}
  }
  return <><AuthShell variant="mail" title="XpertsEdge Mail" subtitle="Webmail">
    {error && <div className="xe-alert" role="alert">{error}</div>}
    <form className="xe-form" onSubmit={submit}>
      <label htmlFor="mail-email">Email address</label>
      <input id="mail-email" className="xe-input" placeholder="you@xpertsedgetech.com" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/>
      <label htmlFor="mail-password">Password</label>
      <PasswordField id="mail-password" value={password} onChange={e=>setPassword(e.target.value)}/>
      {useCode&&<><label htmlFor="mail-otp">Authenticator or recovery code</label><input id="mail-otp" className="xe-input" autoComplete="one-time-code" required maxLength={40} placeholder="Enter your code" value={code} onChange={e=>setCode(e.target.value)}/></>}
      <button type="button" className="xe-link xe-left" onClick={()=>{setUseCode(!useCode);setCode('');}}>{useCode?'Hide 2FA / recovery code':'Use a 2FA / recovery code'}</button>
      <label className="xe-check"><input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}/><span>Remember me for 30 days<small>Use only on your own device.</small></span></label>
      <button className="xe-submit" disabled={busy}>{busy&&<Spinner/>}{busy?'Signing in…':'Sign in'}</button>
    </form>
    <p className="xe-foot">Mailbox users sign in with the email and password created in HRMS Mail Admin. Administrators may use their HRMS credentials here or open Webmail directly from HRMS.</p>
    {home&&<button type="button" className="xe-outline" onClick={home}>← Back to HRMS</button>}
  </AuthShell></>;
}

export function Webmail({user,home,canReturnToHrms=false,out,expired}) {
  const [panel,setPanel]=useState('Mail'),[preferences,setPreferences]=useState({theme:'light',density:'compact',shortcuts:true,signature:'',timeZone:'Asia/Kolkata'}),[checked,setChecked]=useState([]);
  const [panel,setPanel]=useState('Mail'),[preferences,setPreferences]=useState({theme:'light',density:'compact',shortcuts:true,signature:'',timeZone:'Asia/Kolkata'}),[checked,setChecked]=useState([]),[themeSaving,setThemeSaving]=useState(false);
  useEffect(()=>{mailApi('/preferences').then(setPreferences).catch(()=>{});},[]);
  useEffect(()=>{const url=new URL(window.location.href),code=url.searchParams.get('gmail');if(!code)return;try{sessionStorage.setItem('wm_gmail_notice',gmailNotice(code));}catch{}url.searchParams.delete('gmail');window.history.replaceState(null,'',url.pathname+url.search+url.hash);setPanel('Settings');},[]);
  const [folder,setFolder]=useState('Inbox'),[query,setQuery]=useState(''),[searchText,setSearchText]=useState('');
  const [viewTab,setViewTab]=useState('all');
  const [records,setRecords]=useState([]),[counts,setCounts]=useState({}),[unread,setUnread]=useState(0),[total,setTotal]=useState(0);
  const [connected,setConnected]=useState(false),[externalAllowed,setExternalAllowed]=useState(false),[externalSender,setExternalSender]=useState(''),[provider,setProvider]=useState('');
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [compose,setCompose]=useState(null),[selected,setSelected]=useState(null),[hasMore,setHasMore]=useState(false);
  const [collapsed,setCollapsed]=useState(()=>window.matchMedia('(max-width:760px)').matches);
  const search=useRef(null),pages=useRef(1),serial=useRef(0),abort=useRef(null),filters=useRef({}),composeRef=useRef(null),autoSave=useRef({saving:false}),unreadNotice=useRef({ready:false,count:0});
  filters.current={folder,query};
  const initials=(user.name||user.email).trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  const normalize=record=>{const draft={...record,saved:true,to:record.toAddress,cc:record.ccAddress||'',from:record.fromAddress,attachments:record.attachments||[]};return {...draft,baseline:draftSignature(draft)};};
  async function refresh(){
    const request=++serial.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;
    const filter=filters.current,params=new URLSearchParams({folder:filter.query||filter.folder==='All'?'':filter.folder,q:filter.query});
    try{const all=[];let result;for(let page=0;page<pages.current;page++){result=await mailApi('/messages?'+params+'&page='+page,{signal:controller.signal});all.push(...result.messages);if(!result.hasMore)break;}
      if(request!==serial.current||filter.folder!==filters.current.folder||filter.query!==filters.current.query)return;
      const nextUnread=Number(result.unread||0),previousUnread=unreadNotice.current.count;
      if(unreadNotice.current.ready&&nextUnread>previousUnread){
        const added=nextUnread-previousUnread;
        setMessage(`You have ${added} new ${added===1?'message':'messages'} in Inbox.`);
        if(document.visibilityState==='hidden'&&typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification('XpertsEdge Mail',{body:`You have ${added} new ${added===1?'message':'messages'} in Inbox.`});
      }
      unreadNotice.current={ready:true,count:nextUnread};
      setRecords(all.map(normalize));setCounts(result.counts||{});setUnread(nextUnread);setTotal(result.total);setHasMore(result.hasMore);setConnected(result.connected);setExternalAllowed(result.externalAllowed);setExternalSender(result.senderEmail||'');setProvider(result.provider||'');setLoadError('');
    }catch(error){if(controller.signal.aborted||request!==serial.current)return;if(error.status===401)expired();else setLoadError(error.message);}finally{if(request===serial.current)setLoading(false);}
  }
  useEffect(()=>{serial.current++;abort.current?.abort();pages.current=1;setLoading(true);setRecords([]);setTotal(0);setHasMore(false);const timer=setTimeout(refresh,200);return()=>clearTimeout(timer);},[folder,query]);
  useEffect(()=>{if(panel!=='Mail')return;const timer=setInterval(refresh,10000);return()=>{clearInterval(timer);abort.current?.abort();};},[panel]);
  useEffect(()=>{document.title=unread>0?`(${unread}) XpertsEdge Mail`:'XpertsEdge Mail';},[unread]);
  useEffect(()=>{const shortcut=event=>{if(preferences.shortcuts&&!['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)){if(event.key==='/'){event.preventDefault();search.current?.focus();}if(event.key.toLowerCase()==='c'){event.preventDefault();newMessage();}}if(event.key==='Escape'&&compose){event.preventDefault();closeCompose();}};window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut);},[preferences.shortcuts,compose,busy]);
  const dirty=compose&&draftSignature(compose)!==(compose.baseline||draftSignature(emptyDraft()));
  useEffect(()=>{const warn=event=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  useEffect(()=>{composeRef.current=compose;},[compose]);
  function payload(draft){return {to:draft.to,cc:draft.cc||'',subject:draft.subject,body:draft.body,attachmentIds:(draft.attachments||[]).filter(file=>file.id&&!file.forward).map(file=>file.id),attachments:(draft.attachments||[]).filter(file=>file.data).map(file=>({name:file.name,contentType:file.contentType,data:file.data})),...(!draft.saved&&draft.forwardFromId?{forwardFromId:draft.forwardFromId,forwardAttachmentIds:(draft.attachments||[]).filter(file=>file.forward).map(file=>file.id)}:{})};}
  async function persistDraft(draft=compose){return normalize(await mailApi('/drafts'+(draft.saved?'/'+draft.id:''),{method:draft.saved?'PUT':'POST',body:payload(draft)}));}
  async function storeDraft(){if(busy)return;setBusy(true);try{const saved=await persistDraft();setCompose(null);setFolder('Drafts');setQuery('');setSearchText('');setSelected(saved.id);setMessage('Draft saved.');await refresh();}catch(error){setMessage(error.message);}finally{setBusy(false);}}
  async function closeCompose(){
    const snapshot=composeRef.current;
    if(!snapshot||busy||autoSave.current.saving)return;
    const unchanged=draftSignature(snapshot)===(snapshot.baseline||draftSignature(emptyDraft()));
    if(unchanged){setCompose(null);return;}
    setBusy(true);autoSave.current.saving=true;
    try{await persistDraft(snapshot);setCompose(null);setMessage('Draft saved automatically.');await refresh();}
    catch(error){setMessage('Draft could not be saved: '+error.message);}
    finally{autoSave.current.saving=false;setBusy(false);}
  }
  async function sendMessage(){if(busy)return;setBusy(true);try{const saved=await persistDraft();setCompose(saved);await mailApi('/send',{method:'POST',body:{id:saved.id,...payload(saved)}});setCompose(null);setFolder('Sent');setQuery('');setSearchText('');setSelected(saved.id);setMessage('SMTP accepted the message. See its delivery status.');await refresh();}catch(error){setMessage(error.message);await refresh();}finally{setBusy(false);}}
  async function selectMessage(record){
    setSelected(record.id);
    if(record.seen)return;
    setRecords(previous=>previous.map(item=>item.id===record.id?{...item,seen:true}:item));
    setCounts(previous=>({...previous,[record.folder]:Math.max(0,(previous[record.folder]||0)-1)}));
    if(record.folder==='Inbox'){
      setUnread(previous=>Math.max(0,previous-1));
      unreadNotice.current.count=Math.max(0,unreadNotice.current.count-1);
    }
    try{await mailApi('/messages/'+record.id,{method:'PATCH',body:{seen:true}});await refresh();}
    catch(error){setMessage(error.message);await refresh();}
  }
  async function updateSelected(body){if(busy)return;setBusy(true);try{await mailApi('/messages/'+selected,{method:'PATCH',body});if(body.folder)setSelected(null);await refresh();}catch(error){setMessage(error.message);}finally{setBusy(false);}}
  async function deleteSelected(){if(busy||!window.confirm('Permanently delete this message and its attachments? This cannot be undone.'))return;setBusy(true);try{await mailApi('/messages/'+selected,{method:'DELETE'});setSelected(null);setMessage('Message permanently deleted.');await refresh();}catch(error){setMessage(error.message);}finally{setBusy(false);}}
  function mayDiscard(){return !dirty||window.confirm('Discard unsaved compose changes?');}
  function openCompose(draft){if(busy||!mayDiscard())return;setCompose(draft);setMessage('');}
  function leave(action){if(!busy&&mayDiscard())action();}
  async function attachFiles(event){const selectedFiles=Array.from(event.target.files||[]);event.target.value='';if(!compose||busy)return;
    const existing=compose.attachments||[];if(existing.length+selectedFiles.length>5||existing.reduce((sum,file)=>sum+file.size,0)+selectedFiles.reduce((sum,file)=>sum+file.size,0)>1024*1024){setMessage('Choose up to 5 files, maximum 1 MB total.');return;}
    setBusy(true);try{const additions=[];for(const file of selectedFiles){const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Cannot read attachment.'));reader.readAsDataURL(file);});additions.push({name:file.name,size:file.size,contentType:file.type||'application/octet-stream',data});}setCompose(previous=>({...previous,attachments:[...(previous.attachments||[]),...additions]}));setMessage('');}catch(error){setMessage(error.message);}finally{setBusy(false);}
  }
  const selectedMessage=records.find(record=>record.id===selected);
  const newMessage=()=>{setPanel('Mail');openCompose({...emptyDraft(),body:preferences.signature?'\n\n'+preferences.signature:''});};
  async function bulk(action){if(!checked.length||busy)return;if(action==='delete'&&!confirm('Permanently delete selected messages?'))return;setBusy(true);try{await mailApi('/bulk',{method:'POST',body:{ids:checked,action}});setChecked([]);setSelected(null);await refresh();}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  const localRecipients=compose?[compose.to,compose.cc].join(',').split(/[,;]/).map(value=>value.trim()).filter(Boolean):[];
  const externalCompose=provider==='mailersend'||localRecipients.some(address=>!address.toLowerCase().endsWith('@xpertsedgetech.com'));
  const statusText=status=>({DRAFT:'Draft · not sent',SCHEDULED:'Scheduled · awaiting send',ACCEPTED:'Accepted by MailerSend',SMTP_ACCEPTED:'Accepted by SMTP',GMAIL_ACCEPTED:'Accepted by Gmail',RECEIVED_PROVIDER:'Received',RECEIVED_LOCAL:'Received locally',RECEIVED_GMAIL:'Received from Gmail',FAILED:'Send failed · draft retained'})[status]||status;
  function folderChange(name){setPanel('Mail');setChecked([]);setFolder(name);setQuery('');setSearchText('');setSelected(null);setMessage('');setViewTab('all');if(window.matchMedia('(max-width:760px)').matches)setCollapsed(true);}
  const visibleRecords=records.filter(record=>viewTab==='unread'?!record.seen:viewTab==='starred'?record.starred:true);
  async function toggleStar(record){
    if(busy)return;const starred=!record.starred;
    setRecords(previous=>previous.map(item=>item.id===record.id?{...item,starred}:item));
    try{await mailApi('/messages/'+record.id,{method:'PATCH',body:{starred}});}
    catch(error){setRecords(previous=>previous.map(item=>item.id===record.id?{...item,starred:!starred}:item));setMessage(error.message);}
  }
  async function toggleTheme(){
    if(themeSaving)return;
    const next={...preferences,theme:preferences.theme==='dark'?'light':'dark'};
    setPreferences(next);
    setThemeSaving(true);
    try{setPreferences(await mailApi('/preferences',{method:'PUT',body:next}));}
    catch(error){setPreferences(preferences);setMessage('Theme could not be saved: '+error.message);}
    finally{setThemeSaving(false);}
  }
  return <div className={'wm-app wm-dark wm-modern'+(preferences.theme==='dark'?' wm-theme-dark':'')+(preferences.density==='comfortable'?' wm-comfortable':'')+(collapsed?' wm-collapsed':'')}>
    <aside className="wm-rail" aria-label="Workspace navigation">
      {canReturnToHrms?<button className="wm-logo-button" title="XpertsEdge Home" aria-label="XpertsEdge home" onClick={()=>leave(home)}><img src="/logo.png" alt="XpertsEdge"/></button>:<div className="wm-logo-static" aria-label="XpertsEdge Mail"><img src="/logo.png" alt="XpertsEdge"/></div>}
      {[['Mail','mail',()=>{if(window.matchMedia('(max-width:760px)').matches)setCollapsed(value=>!value);else folderChange('Inbox');}],['Calendar','Calendar',()=>{if(mayDiscard())setPanel('Calendar');}],['Contacts','Contacts',()=>{if(mayDiscard())setPanel('Contacts');}],['Files','Storage',()=>{if(mayDiscard())setPanel('Storage');}],['Settings','Settings',()=>{if(mayDiscard())setPanel('Settings');}]].map(([label,icon,action])=><button key={label} className={(label==='Mail'?panel==='Mail':panel===label||label==='Files'&&panel==='Storage')?'active':''} title={label} aria-label={label} onClick={action}><MailIcon name={icon}/><span>{label}</span></button>)}
      <button className="wm-theme-toggle" type="button" title={preferences.theme==='dark'?'Switch to light mode':'Switch to dark mode'} aria-label={preferences.theme==='dark'?'Switch to light mode':'Switch to dark mode'} aria-pressed={preferences.theme==='dark'} onClick={toggleTheme}><span>{preferences.theme==='dark'?'Light mode':'Dark mode'}</span></button>
      <button className={'wm-theme-toggle'+(themeSaving?' is-saving':'')} type="button" title={preferences.theme==='dark'?'Switch to light mode':'Switch to dark mode'} aria-label={preferences.theme==='dark'?'Switch to light mode':'Switch to dark mode'} aria-pressed={preferences.theme==='dark'} aria-busy={themeSaving} disabled={themeSaving} onClick={toggleTheme}><span>{preferences.theme==='dark'?'Light mode':'Dark mode'}</span></button>
      <div className="wm-rail-bottom">{canReturnToHrms&&<button title="Back to HRMS" aria-label="Back to HRMS" onClick={()=>leave(home)}><MailIcon name="back"/><span>HRMS</span></button>}<button title="Sign out" aria-label="Sign out" onClick={()=>leave(out)}><MailIcon name="logout"/><span>Logout</span></button></div>
    </aside>{!collapsed&&<button className="wm-scrim" aria-label="Close folders" onClick={()=>setCollapsed(true)}/>} 
    <aside className="wm-sidebar" aria-label="Mailbox folders">
      <button className="wm-compose-button" onClick={newMessage}><MailIcon name="compose"/> <span>Compose</span></button>
      <div className="wm-section-title"><strong>Folders</strong></div>
      <nav aria-label="Mail folders">{folders.map(name=>{const folderUnread=name==='Inbox'?unread:(counts[name]||0);return <button key={name} aria-current={folder===name&&!query?'page':undefined} className={folder===name&&!query?'active':''} onClick={()=>folderChange(name)}><span className={'wm-folder-icon wm-folder-'+name}><MailIcon name={name}/></span><span>{name}</span>{folderUnread>0&&<b>{folderUnread}</b>}</button>})}</nav>
      <div className="wm-sidebar-bottom"><span className="wm-connection"><i/>{connected?(provider==='mailersend'?'MailerSend connected':'Mail service connected'):'Mail service offline'}</span><small title={user.email}>{user.email}</small></div>
    </aside>
    <main className="wm-mail-main">{panel!=='Mail'?<MailModules key={panel} panel={panel} api={mailApi} timeZone={preferences.timeZone} onClose={()=>setPanel('Mail')} onPreferences={setPreferences} onCompose={to=>{setPanel('Mail');openCompose({...emptyDraft(),to});}}/>:<>
      <header className="wm-toolbar"><label className="wm-search"><MailIcon name="search"/><input ref={search} type="search" aria-label="Search all mail" placeholder="Search all mail…" maxLength={200} value={searchText} onChange={event=>setSearchText(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();setQuery(searchText.trim());setSelected(null);}}}/></label><span className="wm-avatar wm-toolbar-avatar" title={user.email}>{initials}</span></header>
      <div className="wm-split"><section className="wm-message-list" aria-label={folder+' messages'}><div className="wm-list-heading"><div><h1>{query?'Search results':folder}</h1><span>{total} {total===1?'message':'messages'}</span></div><div className="wm-tabs" role="tablist" aria-label="Message views">{[['all','All'],['unread','Unread'],['starred','Starred']].map(([key,label])=><button role="tab" aria-selected={viewTab===key} className={viewTab===key?'active':''} key={key} onClick={()=>setViewTab(key)}>{label}</button>)}</div></div>{message&&<p className="wm-status" role="status">{message}</p>}{loadError&&<p className="wm-status" role="alert">{loadError}<button className="btn" onClick={refresh}>Retry</button></p>}
        {visibleRecords.length>0&&<div className="wm-bulk"><label><input type="checkbox" aria-label="Select all loaded messages" checked={visibleRecords.every(r=>checked.includes(r.id))} onChange={e=>setChecked(e.target.checked?visibleRecords.map(r=>r.id):[])}/> Select loaded</label>{checked.length>0&&<><span>{checked.length} selected</span>{['read','unread','archive','trash',...(folder==='Trash'?['restore','delete']:[])].map(action=><button className="btn" key={action} disabled={busy} onClick={()=>bulk(action)}>{action}</button>)}</>}</div>}
        {visibleRecords.length>0?<div className="wm-drafts">{visibleRecords.map(record=><div key={record.id} className={'wm-select-row '+(!record.seen?'wm-unread':'')}><input type="checkbox" aria-label={'Select '+(record.subject||'message')} checked={checked.includes(record.id)} onChange={e=>setChecked(e.target.checked?[...checked,record.id]:checked.filter(id=>id!==record.id))}/><button className="wm-star-button" aria-label={record.starred?'Unstar message':'Star message'} aria-pressed={record.starred} onClick={()=>toggleStar(record)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 17.03 6.5 19.92l1.05-6.12L3.1 9.47l6.15-.9Z"/></svg></button><div className={'wm-draft-row'+(selected===record.id?' selected':'')} role="button" tabIndex="0" onClick={()=>selectMessage(record)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectMessage(record);}}}><span className="wm-message-avatar">{(record.from||user.email).slice(0,2).toUpperCase()}</span><span><strong>{record.folder==='Inbox'?record.from:record.to||user.email}</strong><span className="wm-subject">{record.subject||'(No subject)'}</span><small>{record.deliveryStatus==='FAILED'?'Send failed · ':''}{record.body||'No message text'}</small></span><time dateTime={record.folder==='Drafts'?record.updatedAt:record.createdAt}>{new Date(record.folder==='Drafts'?record.updatedAt:record.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',timeZone:preferences.timeZone})}</time><span className="wm-quick-actions"><button aria-label="Archive" disabled={busy} onClick={e=>{e.stopPropagation();mailApi('/messages/'+record.id,{method:'PATCH',body:{folder:'Archive'}}).then(refresh);}}><MailIcon name="Archive" size={18}/></button><button aria-label="Move to trash" disabled={busy} onClick={e=>{e.stopPropagation();mailApi('/messages/'+record.id,{method:'PATCH',body:{folder:'Trash'}}).then(refresh);}}><MailIcon name="Trash" size={18}/></button><button aria-label={record.seen?'Mark unread':'Mark read'} disabled={busy} onClick={e=>{e.stopPropagation();mailApi('/messages/'+record.id,{method:'PATCH',body:{seen:!record.seen}}).then(refresh);}}><MailIcon name="mail" size={18}/></button></span></div></div>)}</div>:<div className="wm-list-empty"><MailIcon name={folder} size={38}/><h2>{loading?'Loading messages…':query?'No matching messages':viewTab==='starred'?'No starred messages yet':folder+' is empty'}</h2><p>{folder==='Drafts'?'Compose and save a message to start a draft.':'Messages for this folder will appear here.'}</p></div>}
        {hasMore&&<button className="btn wm-load-older" onClick={()=>{pages.current++;refresh();}}>Load older messages</button>}</section><div className="wm-list-notice">{provider==='mailersend'?'External mail is sent as '+externalSender+'. Replies sent to your inbound address are delivered to this Inbox.':externalAllowed?'External mail is available as '+externalSender+'.':'Mail delivery provider is not configured.'}</div>
        <section className="wm-reading-pane" aria-label="Message preview">{selectedMessage?<article className="wm-draft-preview"><div className="wm-reading-header"><button type="button" className="wm-back-to-list" onClick={()=>setSelected(null)}>← Back to {folder}</button><span className={'wm-delivery '+(selectedMessage.deliveryStatus==='FAILED'?'wm-delivery-failed':'')}>{statusText(selectedMessage.deliveryStatus)}</span></div>{selectedMessage.scheduledAt&&<p>Scheduled: {new Date(selectedMessage.scheduledAt).toLocaleString([], {timeZone:preferences.timeZone})}</p>}<h2>{selectedMessage.subject||'(No subject)'}</h2><p>From: {selectedMessage.from}</p><p>To: {selectedMessage.to||'No recipient'}</p>{selectedMessage.cc&&<p>Cc: {selectedMessage.cc}</p>}{selectedMessage.deliveryError&&<p role="alert" className="wm-delivery-error">{selectedMessage.deliveryError}</p>}<div className="wm-message-body">{selectedMessage.body||'No message text'}</div>
          {selectedMessage.attachments.length>0&&<section className="wm-files" aria-label="Message attachments">{selectedMessage.attachments.map(file=><a key={file.id} href={'/api/webmail/messages/'+selectedMessage.id+'/attachments/'+file.id} download={file.name}>📎 {file.name}<small>{Math.ceil(file.size/1024)} KB</small></a>)}</section>}
          <div className="wm-message-actions">{selectedMessage.folder==='Scheduled'?<button className="btn" disabled={busy} onClick={async()=>{try{await mailApi('/schedule/'+selectedMessage.id+'/cancel',{method:'POST'});folderChange('Drafts');}catch(e){setMessage(e.message);}}}>Cancel schedule / edit</button>:selectedMessage.folder==='Drafts'?<button className="wm-primary" disabled={busy} onClick={()=>openCompose({...selectedMessage})}>Edit draft</button>:selectedMessage.folder!=='Trash'&&<><button className="btn" onClick={()=>openCompose({...emptyDraft(),...replyDraft(selectedMessage,user.email)})}>Reply</button><button className="btn" onClick={()=>openCompose({...emptyDraft(),...replyDraft(selectedMessage,user.email,true)})}>Reply all</button><button className="btn" onClick={()=>openCompose({...emptyDraft(),...forwardDraft(selectedMessage)})}>Forward</button><button className="btn" disabled={busy} onClick={()=>updateSelected({seen:!selectedMessage.seen})}>{selectedMessage.seen?'Mark unread':'Mark read'}</button></>}
            {selectedMessage.folder==='Trash'?<><button className="btn" disabled={busy} onClick={()=>updateSelected({folder:'Restore'})}>Restore</button><button className="btn danger" disabled={busy} onClick={deleteSelected}>Delete permanently</button></>:<button className="btn" disabled={busy} onClick={()=>updateSelected({folder:'Trash'})}>Move to Trash</button>}
            {['Inbox','Spam','Sent'].includes(selectedMessage.folder)&&<button className="btn" disabled={busy} onClick={()=>updateSelected({folder:'Archive'})}>Archive</button>}{['Inbox','Spam'].includes(selectedMessage.folder)&&<button className="btn" disabled={busy} onClick={()=>updateSelected({folder:selectedMessage.folder==='Spam'?'Inbox':'Spam'})}>{selectedMessage.folder==='Spam'?'Not spam':'Mark as Spam'}</button>}
          </div></article>:<div className="wm-reader-empty"><div className="wm-reader-icon"><MailIcon name="mail" size={48}/></div><h2>No conversation selected</h2><p>Choose a conversation from the list to read it here.</p></div>}</section></div></>}</main>
    {compose&&<section className="wm-composer" aria-label="Compose message"><header><h2>{compose.forwardFromId?'Forward message':/^Re:/i.test(compose.subject)?'Reply':'New message'}</h2><button className="wm-text-button" aria-label="Close compose" disabled={busy} onClick={closeCompose}>✕</button></header><form onSubmit={event=>{event.preventDefault();storeDraft();}}>
      <div className="wm-from">From <strong>{externalAllowed&&externalCompose?externalSender:user.email}</strong></div><label>To<input type="text" autoComplete="off" placeholder="alice@example.com, bob@example.com" maxLength={2000} disabled={busy} value={compose.to} onChange={event=>setCompose({...compose,to:event.target.value})}/></label>
      <label>Cc<input type="text" autoComplete="off" placeholder="Optional recipients" maxLength={2000} disabled={busy} value={compose.cc||''} onChange={event=>setCompose({...compose,cc:event.target.value})}/></label>
      <label>Subject<input maxLength={255} placeholder="Subject" disabled={busy} value={compose.subject} onChange={event=>setCompose({...compose,subject:event.target.value})}/></label>
      <textarea aria-label="Message body" placeholder="Write your message…" maxLength={20000} disabled={busy} value={compose.body} onChange={event=>setCompose({...compose,body:event.target.value})}/>
      <section className="wm-files" aria-label="Compose attachments">{(compose.attachments||[]).map((file,index)=><div key={file.id||index}><span>📎 {file.name} <small>{Math.ceil(file.size/1024)} KB</small></span><button type="button" aria-label={'Remove attachment '+file.name} disabled={busy} onClick={()=>setCompose({...compose,attachments:compose.attachments.filter((_,position)=>position!==index)})}>✕</button></div>)}</section>
      <label className="wm-file-picker"><span className="wm-attach-label"><MailIcon name="attach" size={18}/>Attach files</span><span className="wm-file-select">Choose files</span><input aria-label="Attach files" type="file" multiple disabled={busy} onChange={attachFiles}/></label>
      {message&&<p role="status" className="wm-compose-note">{message}</p>}<footer><button type="button" className="wm-primary" disabled={busy||!connected} onClick={sendMessage}>{busy?'Working…':'Send email'}</button><button className="btn" type="submit" disabled={busy}>Save draft</button></footer></form></section>}
  </div>;
}