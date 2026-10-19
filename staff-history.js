import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const cfg={apiKey:"AIzaSyAviNd7mh8B_1cie1tdKfHiQt4Y1EPRa98",authDomain:"pattaya-dinosaur-ticket-desk.firebaseapp.com",projectId:"pattaya-dinosaur-ticket-desk",storageBucket:"pattaya-dinosaur-ticket-desk.firebasestorage.app",messagingSenderId:"386652978138",appId:"1:386652978138:web:32c00c1b19caacda7cdee3"};
const app=getApps().find(x=>x.name==="[DEFAULT]")||initializeApp(cfg),auth=getAuth(app),db=getFirestore(app);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
window.ticketdeskLoadStaffHistory=async()=>{
 const user=auth.currentUser;
 if(!user||user.email?.toLowerCase()!=="1987zinwaimin@gmail.com")return '<p class="notice">Please log in as the Owner to view this history.</p>';
 const [loginSnap,checkoutSnap]=await Promise.all([
  getDocs(query(collection(db,"staffLoginEvents"),orderBy("createdAt","desc"),limit(50))),
  getDocs(query(collection(db,"staffAttendanceEvents"),orderBy("createdAt","desc"),limit(50)))
 ]);
 const events=[
  ...loginSnap.docs.map(doc=>({...doc.data(),eventType:"check-in"})),
  ...checkoutSnap.docs.map(doc=>doc.data())
 ].sort((a,b)=>{
  const at=a.createdAt?.toDate?.()?.getTime()||new Date(a.clientTime||0).getTime();
  const bt=b.createdAt?.toDate?.()?.getTime()||new Date(b.clientTime||0).getTime();
  return bt-at;
 }).slice(0,50);
 if(!events.length)return '<p class="muted">No staff attendance events have been recorded yet.</p>';
 const names={sales:"Sales Department",entry:"Entry Department",playing:"Playing Department",event:"Event Department",leader:"Leader — All Departments"};
 const rows=events.map(d=>{
  const date=d.createdAt?.toDate?.()||new Date(d.clientTime||Date.now());
  const time=new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Bangkok"}).format(date);
  const checkOut=d.eventType==="check-out";
  const eventLabel=checkOut?"Check-out":"Check-in";
  return '<div class="summary-line"><span><strong>'+esc(d.name)+'</strong><br><small>'+esc(names[d.department]||d.department)+' · '+eventLabel+'</small></span><span>'+esc(time)+' ICT</span></div>';
 }).join("");
 return '<div>'+rows+'</div><p class="help-text">Showing latest '+events.length+' check-in/check-out events. Names are self-reported, not identity-verified. Check-out records appear after the updated Firestore Rules are published.</p>';
};
