import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, orderBy, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const config={apiKey:"AIzaSyAviNd7mh8B_1cie1tdKfHiQt4Y1EPRa98",authDomain:"pattaya-dinosaur-ticket-desk.firebaseapp.com",projectId:"pattaya-dinosaur-ticket-desk",storageBucket:"pattaya-dinosaur-ticket-desk.firebasestorage.app",messagingSenderId:"386652978138",appId:"1:386652978138:web:32c00c1b19caacda7cdee3"};
const app=getApps().find(x=>x.name==="[DEFAULT]")||initializeApp(config),auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const departments={sales:"Sales Department",entry:"Entry Department",playing:"Playing Department",event:"Event Department",leader:"Leader — All Departments"};
function when(value){let d=value?.toDate?.()||(value?new Date(value):null);if(!d||Number.isNaN(d.getTime()))return "No login recorded";return new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Bangkok"}).format(d)+" ICT";}
function recent(value){const d=value?.toDate?.()||(value?new Date(value):null);return !!d&&!Number.isNaN(d.getTime())&&(Date.now()-d.getTime()<=15*60*1000);}
async function loadStaffAccounts(){
 const root=$("staffAccountList");if(!root)return;
 const user=auth.currentUser;
 if(!user||user.email?.toLowerCase()!=="1987zinwaimin@gmail.com"){root.innerHTML='<p class="notice">Please log in as the Owner to manage staff accounts.</p>';return;}
 root.innerHTML='<p class="muted">Loading staff accounts…</p>';
 try{
  const snap=await getDocs(query(collection(db,"staffDirectory"),orderBy("lastSeenAt","desc")));
  if(snap.empty){root.innerHTML='<p class="muted">No registered staff accounts yet. Staff who check in after this feature is enabled will appear here. Existing login history is kept separately.</p>';return;}
  root.innerHTML=snap.docs.map(d=>{
   const a=d.data(),used=recent(a.lastSeenAt||a.lastSeenClientTime),last=when(a.lastSeenAt||a.lastSeenClientTime);
   return '<article class="summary-line" style="align-items:flex-start;gap:12px"><div style="min-width:0;flex:1"><strong>'+esc(a.name||"Unnamed staff")+'</strong><br><span>'+esc(departments[a.department]||a.department||"Unknown department")+'</span><br><small class="muted">Last used: '+esc(last)+' · Logins: '+esc(a.loginCount||1)+'</small><br><span class="tag '+(used?'':'unsaved')+'">'+(used?'Recently used (15 min)':'Not recently used')+'</span></div><div>'+(!used?'<button type="button" class="btn btn-secondary" data-remove-staff="'+esc(d.id)+'" data-staff-name="'+esc(a.name||"Unnamed staff")+'" data-staff-dept="'+esc(a.department||"")+'">Remove account</button>':'<span class="muted">In use recently</span>')+'</div></article>';
  }).join("");
 }catch(e){
  console.error("Could not load staff directory",e);
  root.innerHTML='<p class="notice">Could not load staff accounts. Publish the updated firestore.rules in Firebase Console, then refresh this list. ('+esc(e.code||e.message||"error")+')</p>';
 }
}
window.ticketdeskLoadStaffAccounts=loadStaffAccounts;
document.addEventListener("click",async e=>{
 const btn=e.target.closest("[data-remove-staff]");if(!btn)return;
 const uid=btn.dataset.removeStaff,name=btn.dataset.staffName||"this staff account",dept=departments[btn.dataset.staffDept]||btn.dataset.staffDept||"Unknown department";
 if(!confirm("Remove access for "+name+" — "+dept+"? The old login history will be kept. This device account will be blocked from checking in again."))return;
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
