import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const config={apiKey:"AIzaSyAviNd7mh8B_1cie1tdKfHiQt4Y1EPRa98",authDomain:"pattaya-dinosaur-ticket-desk.firebaseapp.com",projectId:"pattaya-dinosaur-ticket-desk",storageBucket:"pattaya-dinosaur-ticket-desk.firebasestorage.app",messagingSenderId:"386652978138",appId:"1:386652978138:web:32c00c1b19caacda7cdee3"};
// Use the same default Firebase Auth instance as the workspace so Staff login
// cannot leave an Owner Google/email session active behind the Staff screen.
const app=getApps().find(x=>x.name==="[DEFAULT]")||initializeApp(config),auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id),form=$("checkinForm"),status=$("status"),button=$("submitBtn");
const words={en:{title:"Staff Check-in",desc:"Select your name and department to record your check-in.",name:"Your name",dept:"Department",lang:"Language",approval:"Owner approval password",approvalEnter:"Please enter the Owner approval password.",approvalRequired:"",approvalWrong:"Owner approval password is incorrect.",submit:"Check in",busy:"Recording…",ok:"Check-in recorded. You can now return to the Owner.",err:"Could not record check-in. Please try again or contact the Owner."},th:{title:"ลงชื่อเข้าทำงาน",desc:"เลือกชื่อและแผนกเพื่อบันทึกการเข้าทำงาน",name:"ชื่อของคุณ",dept:"แผนก",lang:"ภาษา",approval:"รหัสอนุมัติจาก Owner",approvalEnter:"กรุณากรอกรหัสผ่านอนุมัติจาก Owner",approvalRequired:"กรุณาตั้งรหัสอนุมัติใน Owner Settings ก่อน",approvalWrong:"รหัสอนุมัติจาก Owner ไม่ถูกต้อง",submit:"ลงชื่อเข้า",busy:"กำลังบันทึก…",ok:"บันทึกการเข้าทำงานแล้ว",err:"บันทึกไม่สำเร็จ โปรดลองอีกครั้งหรือติดต่อเจ้าของ"}};
function translate(){const w=words[$("language").value];$("title").textContent=w.title;$("desc").textContent=w.desc;$("nameLabel").textContent=w.name;$("deptLabel").textContent=w.dept;$("langLabel").textContent=w.lang;$("leaderApprovalLabel").textContent=w.approval;$("leaderApprovalField").hidden=$("department").value!=="leader";button.textContent=w.submit;document.documentElement.lang=$("language").value;try{localStorage.setItem("ticketdesk-language",$("language").value)}catch{}}
$("department").addEventListener("change",()=>{ $("leaderApprovalField").hidden=$("department").value!=="leader"; if($("department").value!=="leader")$("leaderApprovalPassword").value=""; });
$("language").addEventListener("change",translate);try{const saved=localStorage.getItem("ticketdesk-language");if(saved==="th")$("language").value="th"}catch{}translate();
form.addEventListener("submit",async e=>{
 e.preventDefault();
 const name=$("staffName").value.trim(),department=$("department").value,w=words[$("language").value];
 if(!name)return;
 button.disabled=true;button.textContent=w.busy;status.hidden=true;
 try{
  if(department==="leader"){
   const supplied=$("leaderApprovalPassword").value;
   if(!supplied){status.textContent=w.approvalEnter;status.hidden=false;status.className="notice error";$("leaderApprovalPassword").focus();return;}
   // Fixed site-wide Leader approval password; no Owner Settings setup required.
   if(supplied!=="0735"){status.textContent=w.approvalWrong;status.hidden=false;status.className="notice error";$("leaderApprovalPassword").value="";$("leaderApprovalPassword").focus();return;}
  }
  if(auth.currentUser&&!auth.currentUser.isAnonymous)await signOut(auth);
  const cred=auth.currentUser?.isAnonymous?{user:auth.currentUser}:await signInAnonymously(auth);
  const uid=cred.user.uid;
  const session={name:name.slice(0,80),department,loggedInAt:new Date().toISOString(),uid};
  // Account tracking/revocation becomes enforceable after the updated firestore.rules are published.
  try{
   const revokedSnap=await getDoc(doc(db,"revokedStaff",uid));
   if(revokedSnap.exists()){
    localStorage.removeItem("ticketdesk-staff-session-v1");
    status.textContent="This staff access has been removed by the Owner. Please contact the Owner.";
    status.hidden=false;status.className="notice error";return;
   }
   const directoryRef=doc(db,"staffDirectory",uid);
   const previous=await getDoc(directoryRef);
   const previousData=previous.exists()?previous.data():{};
   await setDoc(directoryRef,{uid,name:session.name,department,createdAt:previousData.createdAt||serverTimestamp(),lastSeenAt:serverTimestamp(),lastSeenClientTime:session.loggedInAt,loginCount:(Number(previousData.loginCount)||0)+1,source:"staff-share-link"},{merge:true});
  }catch(directoryError){console.warn("Staff account activity could not be synced. Publish the updated firestore.rules to enable account tracking and removal.",directoryError);}
  localStorage.setItem("ticketdesk-staff-session-v1",JSON.stringify(session));
  try{await addDoc(collection(db,"staffLoginEvents"),{name:session.name,department,uid,createdAt:serverTimestamp(),clientTime:session.loggedInAt,source:"staff-share-link",eventType:"check-in"});}catch(historyError){console.warn("Staff login history could not be recorded",historyError);}
  status.textContent="Login successful. Opening your department…";status.hidden=false;status.className="notice";window.location.href="./index.html";
 }catch(err){
  console.error("Staff login failed",err);
  status.textContent=(department==="leader"&&err?.code==="permission-denied"?"Firebase permission denied: publish the current firestore.rules rules to the live Firestore database, then try again.":(department==="leader"&&err?.code==="unavailable"?"Cannot reach Firebase. Check internet and try again.":(department==="leader"?w.approvalWrong:w.err)))+" ("+(err?.code||"network")+")";status.hidden=false;status.className="notice error";
 }finally{button.disabled=false;button.textContent=w.submit;}
});