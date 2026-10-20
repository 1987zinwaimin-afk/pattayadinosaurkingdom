import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, orderBy, doc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const config={apiKey:"AIzaSyAviNd7mh8B_1cie1tdKfHiQt4Y1EPRa98",authDomain:"pattaya-dinosaur-ticket-desk.firebaseapp.com",projectId:"pattaya-dinosaur-ticket-desk",storageBucket:"pattaya-dinosaur-ticket-desk.firebasestorage.app",messagingSenderId:"386652978138",appId:"1:386652978138:web:32c00c1b19caacda7cdee3"};
const app=getApps().find(x=>x.name==="[DEFAULT]")||initializeApp(config),auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id);
const dismissedKey="ticketdesk-owner-dismissed-staff-notices-v1";
function readDismissed(){try{return JSON.parse(localStorage.getItem(dismissedKey)||"{}")}catch{return {}}}
function staffGroupKey(name,department){return String(name||"").trim().toLocaleLowerCase()+"::"+String(department||"").trim().toLowerCase();}
function latestStamp(a){const d=dateValue(a.lastSeenAt||a.lastSeenClientTime);return d?d.toISOString():"";}
// Keep the selected Staff account green only while its app is actively sending heartbeats.
let staffHeartbeatBusy=false;
async function sendStaffHeartbeat(){
 if(staffHeartbeatBusy||document.visibilityState!=="visible")return;
 let session;try{session=JSON.parse(localStorage.getItem("ticketdesk-staff-session-v1")||"null")}catch{return;}
 if(!session||!session.uid||!session.name||!session.department)return;
 staffHeartbeatBusy=true;
 try{await updateDoc(doc(db,"staffDirectory",session.uid),{lastSeenAt:serverTimestamp(),lastSeenClientTime:new Date().toISOString()});}
 catch(e){if(e.code!=="permission-denied"&&e.code!=="not-found")console.warn("Staff heartbeat failed",e);}
 finally{staffHeartbeatBusy=false;}
}
setInterval(sendStaffHeartbeat,30000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")sendStaffHeartbeat();});
window.addEventListener("focus",sendStaffHeartbeat);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const departments={sales:"Sales Department",entry:"Entry Department",playing:"Playing Department",event:"Event Department",leader:"Leader — All Departments"};
function dateValue(value){const d=value?.toDate?.()||(value?new Date(value):null);return d&&!Number.isNaN(d.getTime())?d:null;}
function when(value){const d=dateValue(value);return d?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Bangkok"}).format(d)+" ICT":"No login recorded";}
function recent(value){const d=dateValue(value);return !!d&&Date.now()-d.getTime()<=2*60*1000;}
async function loadStaffAccounts(){
 const root=$("staffAccountList");if(!root)return;
 const user=auth.currentUser;
 if(!user||user.email?.toLowerCase()!=="1987zinwaimin@gmail.com"){root.innerHTML='<p class="notice">Please log in as the Owner to manage staff accounts.</p>';return;}
 if(!root.children.length)root.innerHTML='<p class="muted">Loading staff accounts and login activity…</p>';
 let accounts=new Map(),directoryAvailable=true,historyAvailable=true;
 try{
  const snap=await getDocs(query(collection(db,"staffDirectory"),orderBy("lastSeenAt","desc")));
  snap.docs.forEach(d=>accounts.set(d.id,{uid:d.id,...d.data(),loginCount:Number(d.data().loginCount)||0}));
 }catch(e){directoryAvailable=false;console.warn("Staff directory not available; trying login history",e);}
 try{
  const events=await getDocs(collection(db,"staffLoginEvents"));
  events.docs.forEach(docSnap=>{
   const e=docSnap.data(),uid=String(e.uid||"");if(!uid)return;
   const current=accounts.get(uid)||{uid,name:e.name||"Unnamed staff",department:e.department||"",loginCount:0,lastSeenAt:null,lastSeenClientTime:null,legacy:true};
   current.eventCount=(Number(current.eventCount)||0)+1;
   const candidate=e.createdAt||e.clientTime;
   const candDate=dateValue(candidate),existingDate=dateValue(current.lastSeenAt||current.lastSeenClientTime);
   if(candDate&&(!existingDate||candDate>existingDate)){current.lastSeenAt=e.createdAt||null;current.lastSeenClientTime=e.clientTime||null;current.name=e.name||current.name;current.department=e.department||current.department;}
   accounts.set(uid,current);
  });
 }catch(e){historyAvailable=false;console.warn("Could not read staff login history",e);}
 if(!accounts.size){
  root.innerHTML='<p class="muted">No staff accounts or check-ins found yet.</p>'+(directoryAvailable&&historyAvailable?'':'<p class="notice">Publish the updated firestore.rules in Firebase Console to enable account management.</p>');return;
 }
 const grouped=new Map();
 for(const a of accounts.values()){
  const key=String(a.name||"").trim().toLocaleLowerCase()+"::"+String(a.department||"").trim().toLowerCase();
  const g=grouped.get(key)||{...a,uids:[],loginTotal:0,eventTotal:0,lastSeenAt:null,lastSeenClientTime:null};
  g.uids.push(a.uid);g.loginTotal+=Number(a.loginCount)||0;g.eventTotal+=Number(a.eventCount)||0;
  const at=dateValue(a.lastSeenAt||a.lastSeenClientTime),prev=dateValue(g.lastSeenAt||g.lastSeenClientTime);
  if(at&&(!prev||at>prev)){g.lastSeenAt=a.lastSeenAt||null;g.lastSeenClientTime=a.lastSeenClientTime||null;g.uid=a.uid;}
  grouped.set(key,g);
 }
 const dismissed=readDismissed();
 const rows=[...grouped.values()].filter(a=>{const key=staffGroupKey(a.name,a.department),saved=dismissed[key];return !saved||latestStamp(a)>saved;}).sort((a,b)=>(dateValue(b.lastSeenAt||b.lastSeenClientTime)?.getTime()||0)-(dateValue(a.lastSeenAt||a.lastSeenClientTime)?.getTime()||0));
 root.innerHTML=rows.map(a=>{
  const last=a.lastSeenAt||a.lastSeenClientTime,used=recent(last);
  return '<article class="summary-line" style="align-items:flex-start;gap:12px"><div style="min-width:0;flex:1"><strong>'+esc(a.name||"Unnamed staff")+'</strong><br><span>'+esc(departments[a.department]||a.department||"Unknown department")+'</span><br><small class="muted">Last login: '+esc(when(last))+' · Login count: '+esc(Math.max(a.loginTotal,a.eventTotal))+'</small><br><span style="display:inline-flex;align-items:center;gap:7px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+(used?'#16a34a':'#dc2626')+'"></span><span>'+(used?'Active recently':'Logged out / inactive')+'</span></span></div><div><button type="button" class="btn btn-secondary" data-dismiss-staff-notice="1" data-notice-key="'+esc(staffGroupKey(a.name,a.department))+'" data-notice-stamp="'+esc(latestStamp(a))+'" data-staff-name="'+esc(a.name||"Unnamed staff")+'" data-staff-dept="'+esc(a.department||"")+'">Delete name</button></div></article>';
 }).join('')+'<p class="help-text">Names are grouped by name and department. Green means a heartbeat was received in the last 2 minutes; red means logged out or no recent activity. Active Staff pages send a heartbeat every 30 seconds. Delete name only dismisses this Owner-side notice on this browser; it does not delete or disable the Staff account.</p>'+(!directoryAvailable||!historyAvailable?'<p class="notice">Some account data could not load. Check Firestore Rules and refresh.</p>':'');
}
window.ticketdeskLoadStaffAccounts=loadStaffAccounts;
document.addEventListener("click",e=>{
 const btn=e.target.closest("[data-dismiss-staff-notice]");if(!btn)return;
 const key=btn.dataset.noticeKey;if(!key)return;
 const dismissed=readDismissed();dismissed[key]=btn.dataset.noticeStamp||new Date().toISOString();
 try{localStorage.setItem(dismissedKey,JSON.stringify(dismissed));}catch(err){console.warn("Could not save dismissed staff notice",err);}
 loadStaffAccounts();
});
document.addEventListener("DOMContentLoaded",()=>{if($("staffAccountList"))loadStaffAccounts();});
if(document.readyState!=="loading"&&$("staffAccountList"))loadStaffAccounts();
document.addEventListener("click",e=>{if(e.target.closest("#refreshStaffAccounts"))loadStaffAccounts();});
document.addEventListener("ticketdesk-staff-accounts-refresh",loadStaffAccounts);
// Owner-wide live login notifications: works even when Owner is on Dashboard or another page.
let knownLoginEventIds=null,loginNoticeBusy=false;
async function pollOwnerStaffLogins(){
 if(loginNoticeBusy||document.visibilityState!=="visible")return;
 const user=auth.currentUser;if(!user||user.email?.toLowerCase()!=="1987zinwaimin@gmail.com")return;
 loginNoticeBusy=true;
 try{
  const snap=await getDocs(collection(db,"staffLoginEvents"));
  const events=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(dateValue(b.createdAt||b.clientTime)?.getTime()||0)-(dateValue(a.createdAt||a.clientTime)?.getTime()||0));
  if(knownLoginEventIds===null){knownLoginEventIds=new Set(events.map(e=>e.id));return;}
  const fresh=events.filter(e=>!knownLoginEventIds.has(e.id));
  for(const e of events)knownLoginEventIds.add(e.id);
  for(const e of fresh.reverse()){
   const region=$("toastRegion")||$(".toast-region");if(!region)continue;
   const toast=document.createElement("div");toast.className="toast success";
   toast.textContent="Staff Login: "+String(e.name||"Staff")+" — "+(departments[e.department]||e.department||"Unknown department");
   region.appendChild(toast);setTimeout(()=>toast.remove(),7000);
  }
  if(fresh.length&&$("staffAccountList"))await loadStaffAccounts();
 }catch(err){console.warn("Owner staff login notification could not refresh",err)}
 finally{loginNoticeBusy=false;}
}
setInterval(pollOwnerStaffLogins,5000);
window.addEventListener("focus",pollOwnerStaffLogins);

// Avoid periodic full-list redraws; refresh the list only when a new login event is detected or the Owner requests it.
