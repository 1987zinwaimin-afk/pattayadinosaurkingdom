import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAviNd7mh8B_1cie1tdKfHiQt4Y1EPRa98",
  authDomain: "pattaya-dinosaur-ticket-desk.firebaseapp.com",
  projectId: "pattaya-dinosaur-ticket-desk",
  storageBucket: "pattaya-dinosaur-ticket-desk.firebasestorage.app",
  messagingSenderId: "386652978138",
  appId: "1:386652978138:web:32c00c1b19caacda7cdee3"
};
const OWNER_EMAIL = "1987zinwaimin@gmail.com".toLowerCase();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const gate = document.getElementById("ownerAuthGate");
const statusEl = document.getElementById("authStatus");
const ownerForm = document.getElementById("ownerLoginForm");
const staffForm = document.getElementById("staffLoginForm");
const ownerBtn = document.getElementById("ownerLoginButton");
const staffBtn = document.getElementById("staffLoginButton");
const emailInput = document.getElementById("ownerEmail");
const passwordInput = document.getElementById("ownerPassword");
const nameInput = document.getElementById("staffName");
const deptInput = document.getElementById("staffDepartment");
let loginMode = "staff";
let handlingAuth = false;

function status(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}
function showGate() {
  document.body.classList.add("auth-pending");
  gate.hidden = false;
}
function setMode(mode) {
  loginMode = mode;
  staffForm.hidden = mode !== "staff";
  ownerForm.hidden = mode !== "owner";
  document.getElementById("staffModeButton").classList.toggle("btn-primary", mode === "staff");
  document.getElementById("ownerModeButton").classList.toggle("btn-primary", mode === "owner");
  status(mode === "staff" ? "အမည်နဲ့ Department ကိုရွေးပြီး Login ဝင်ပါ။" : "Owner Gmail နဲ့ Firebase Password ကို ထည့်ပါ။");
}
function allowApp(user, profile = null) {
  gate.hidden = true;
  document.body.classList.remove("auth-pending");
  window.ticketDeskAccess = profile
    ? { role: profile.department, department: profile.department, name: profile.name, uid: user.uid, status: profile.status }
    : { role: "owner", department: "owner", name: "Owner", uid: user.uid, status: "approved" };
  document.dispatchEvent(new CustomEvent("ticketdesk-access-ready", { detail: window.ticketDeskAccess }));
}
function denyApp(message, isError = false) {
  showGate();
  status(message, isError);
}
async function routeUser(user) {
  if (handlingAuth) return;
  handlingAuth = true;
  try {
    if (!user) {
      denyApp("Staff Login သို့မဟုတ် Owner Login ကိုရွေးပါ။");
      return;
    }
    if (user.email && user.email.toLowerCase() === OWNER_EMAIL && !user.isAnonymous) {
      allowApp(user);
      return;
    }
    if (!user.isAnonymous) {
      await signOut(auth);
      denyApp("ဒီအကောင့်ကို Owner အဖြစ် ခွင့်မပြုထားပါ။", true);
      return;
    }
    const snap = await getDoc(doc(db, "staffProfiles", user.uid));
    if (!snap.exists()) {
      denyApp("Staff အမည်နဲ့ Department ဖြည့်ပြီး Login နှိပ်ပါ။");
      return;
    }
    const profile = snap.data();
    if (profile.status !== "approved") {
      denyApp("Owner အတည်ပြုချက်ကို စောင့်ဆိုင်းနေပါတယ်။ ခွင့်ပြုမပြီးမချင်း Ticket Data ကို အသုံးမပြုနိုင်ပါ။");
      return;
    }
    allowApp(user, profile);
  } catch (error) {
    console.error("Auth profile check failed", error);
    denyApp("Login အချက်အလက်ကို စစ်ဆေးမရပါ။ Firebase Rules နှင့် Network ကို စစ်ဆေးပါ။", true);
  } finally {
    handlingAuth = false;
  }
}
document.getElementById("staffModeButton").addEventListener("click", () => setMode("staff"));
document.getElementById("ownerModeButton").addEventListener("click", () => setMode("owner"));
ownerForm.addEventListener("submit", e => e.preventDefault());
staffForm.addEventListener("submit", e => e.preventDefault());

staffBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const department = deptInput.value;
  if (!name) return status("အမည်ဖြည့်ပါ။", true);
  staffBtn.disabled = true;
  status("Staff Login စစ်ဆေးနေပါသည်…");
  try {
    let user = auth.currentUser;
    if (user && !user.isAnonymous) {
      await signOut(auth);
      user = null;
    }
    if (!user) user = (await signInAnonymously(auth)).user;
    const ref = doc(db, "staffProfiles", user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const old = snap.data();
      if (old.name !== name || old.department !== department) {
        status("ဒီ Browser မှာ အခြား Staff Profile ရှိပြီးသားပါ။ Owner ထံမှ Profile ပြင်ဆင်ပေးရန် တောင်းဆိုပါ။", true);
        return;
      }
      await routeUser(user);
      return;
    }
    await setDoc(ref, {
      name,
      department,
      status: "pending",
      createdAt: serverTimestamp()
    });
    status("Staff အကောင့် တောင်းဆိုမှုကို ပို့ပြီးပါပြီ။ Owner အတည်ပြုပြီးမှ အသုံးပြုနိုင်ပါမယ်။");
  } catch (error) {
    console.error("Staff sign-in failed", error);
    const msg = error?.code === "auth/operation-not-allowed"
      ? "Firebase Console မှ Anonymous Sign-in ကို Enable လုပ်ပါ။"
      : "Staff Login မအောင်မြင်ပါ။ Firestore Rules ကို စစ်ဆေးပါ။";
    status(msg, true);
  } finally {
    staffBtn.disabled = false;
  }
});
ownerBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  if (email !== OWNER_EMAIL) return status("ခွင့်ပြုထားသော Owner Gmail ဖြင့်သာ ဝင်နိုင်ပါသည်။", true);
  if (!password) return status("Firebase Password ထည့်ပါ။", true);
  ownerBtn.disabled = true;
  status("Owner Login စစ်ဆေးနေပါသည်…");
  try {
    if (auth.currentUser?.isAnonymous) await signOut(auth);
    const result = await signInWithEmailAndPassword(auth, email, password);
    if (!result.user.email || result.user.email.toLowerCase() !== OWNER_EMAIL) {
      await signOut(auth);
      status("Owner Gmail မဟုတ်သောကြောင့် ဝင်ခွင့်မပြုပါ။", true);
    }
  } catch (error) {
    console.error("Owner sign-in failed", error);
    status(error?.code === "auth/unauthorized-domain"
      ? "Firebase Authentication → Settings → Authorized domains မှ Website domain ကို ထည့်ပါ။"
      : "Owner Login မအောင်မြင်ပါ။ Gmail၊ Password နှင့် Firebase Authentication ကို စစ်ဆေးပါ။", true);
  } finally {
    ownerBtn.disabled = false;
  }
});
passwordInput.addEventListener("keydown", e => { if (e.key === "Enter") ownerBtn.click(); });
onAuthStateChanged(auth, routeUser);
setMode("staff");
