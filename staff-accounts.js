import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, orderBy, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const config={apiKey:"AIzaSyAviNd7mh8B_1cie1tdKfHiQt4Y1EPRa98",authDomain:"pattaya-dinosaur-ticket-desk.firebaseapp.com",projectId:"pattaya-dinosaur-ticket-desk",storageBucket:"pattaya-dinosaur-ticket-desk.firebasestorage.app",messagingSenderId:"386652978138",appId:"1:386652978138:web:32c00c1b19caacda7cdee3"};
const app=getApps().find(x=>x.name==="[DEFAULT]")||initializeApp(config),auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const departments={sales:"Sales Department",entry:"Entry Department",playing:"Playing Department",event:"Event Department",leader:"Leader — All Departments"};
function dateValue(value){const d=value?.toDate?.()||(value?new Date(value):null);return d&&!Number.isNaN(d.getTime())?d:null;}
function when(value){const d=dateValue(value);return d?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Bangkok"}).format(d)+" ICT":"No login recorded";}
function recent(value){const d=dateValue(value);return !!d&&Date.now()-d.getTime()<=15*60*1000;}
async function loadStaffAccounts(){
 const root=$("staffAccountList");if(!root)return;
 const user=auth.currentUser;
 if(!user||user.email?.toLowerCase()!=="1987zinwaimin@gmail.com"){root.innerHTML='<p class="notice">Please log in as the Owner to manage staff accounts.</p>';return;}
 root.innerHTML='<p class="muted">Loading staff accounts and login activity…</p>';
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
   current.loginCount=Math.max(current.loginCount,0)+1;
   const candidate=e.createdAt||e.clientTime;
   const candDate=dateValue(candidate),existingDate=dateValue(current.lastSeenAt||current.lastSeenClientTime);
   if(candDate&&(!existingDate||candDate>existingDate)){current.lastSeenAt=e.createdAt||null;current.lastSeenClientTime=e.clientTime||null;current.name=e.name||current.name;current.department=e.department||current.department;}
   accounts.set(uid,current);
  });
 }catch(e){historyAvailable=false;console.warn("Could not read staff login history",e);}
 if(!accounts.size){
  root.innerHTML='<p class="muted">No staff accounts or check-ins found yet.</p>'+(directoryAvailable&&historyAvailable?'':'<p class="notice">Publish the updated firestore.rules in Firebase Console to enable account management.</p>');return;
 }
 const rows=[...accounts.values()].sort((a,b)=>(dateValue(b.lastSeenAt||b.lastSeenClientTime)?.getTime()||0)-(dateValue(a.lastSeenAt||a.lastSeenClientTime)?.getTime()||0));
 root.innerHTML=rows.map(a=>{
  const last=a.lastSeenAt||a.lastSeenClientTime,used=recent(last);
  return '<article class="summary-line" style="align-items:flex-start;gap:12px"><div style="min-width:0;flex:1"><strong>'+esc(a.name||"Unnamed staff")+'</strong><br><span>'+esc(departments[a.department]||a.department||"Unknown department")+'</span><br><small class="muted">Last used: '+esc(when(last))+' · Recorded logins: '+esc(a.loginCount||0)+'</small><br><span class="tag '+(used?'':'unsaved')+'">'+(used?'Recently used (last 15 min)':'Not recently used')+'</span></div><div>'+(used?'<span class="muted">In use recently</span>':'<button type="button" class="btn btn-secondary" data-remove-staff="'+esc(a.uid)+'" data-staff-name="'+esc(a.name||"Unnamed staff")+'" data-staff-dept="'+esc(a.department||"")+'">Remove account</button>')+'</div></article>';
 }).join("")+'<p class="help-text">“Recently used” means a check-in in the last 15 minutes; it does not guarantee the person is online now. Removing an account keeps old login history and revokes this Firebase device UID. Names are self-reported and not identity-verified.</p>'+(!directoryAvailable||!historyAvailable?'<p class="notice">Some account data could not load. Publish the updated firestore.rules in Firebase Console and refresh.</p>':'');
}
window.ticketdeskLoadStaffAccounts=loadStaffAccounts;
document.addEventListener("click",async e=>{
 const btn=e.target.closest("[data-remove-staff]");if(!btn)return;
 const uid=btn.dataset.removeStaff,name=btn.dataset.staffName||"this staff account",dept=departments[btn.dataset.staffDept]||btn.dataset.staffDept||"Unknown department";
 if(!confirm("Remove access for "+name+" — "+dept+"? Old login history will be kept. This Firebase device UID will be blocked from checking in again."))return;
 btn.disabled=true;btn.textContent="Removing…";
 try{
  const batch=writeBatch(db);
  batch.delete(doc(db,"staffDirectory",uid));
  batch.set(doc(db,"revokedStaff",uid),{uid,name,department:btn.dataset.staffDept||"",revokedAt:serverTimestamp(),revokedBy:auth.currentUser?.uid||"",reason:"owner-removed"});
  await batch.commit();
  await loadStaffAccounts();
 }catch(err){console.error("Could not remove staff account",err);btn.disabled=false;btn.textContent="Remove account";alert("Could not remove account. Publish the updated firestore.rules in Firebase Console and try again. ("+(err.code||err.message||"error")+")");}
});
document.addEventListener("DOMContentLoaded",()=>{if($("staffAccountList"))loadStaffAccounts();});
if(document.readyState!=="loading"&&$("staffAccountList"))loadStaffAccounts();
document.addEventListener("click",e=>{if(e.target.closest("#refreshStaffAccounts"))loadStaffAccounts();});
document.addEventListener("ticketdesk-staff-accounts-refresh",loadStaffAccounts);
