import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, getDocs, updateDoc
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
function requireOwner() {
  if (!auth.currentUser || auth.currentUser.email?.toLowerCase() !== OWNER_EMAIL || auth.currentUser.isAnonymous) {
    throw new Error("Owner login required");
  }
}
function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64Url(bytes);
}
function bytesToBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function derivePasswordHash(password, saltText) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = Uint8Array.from(atob(saltText.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((saltText.length + 3) % 4)), c => c.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" }, material, 256);
  return bytesToHex(bits);
}
window.ticketDeskAdmin = {
  async listStaff() {
    requireOwner();
    const snap = await getDocs(collection(db, "staffProfiles"));
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  },
  async setStaffStatus(uid, status) {
    requireOwner();
    if (!["approved", "rejected", "pending"].includes(status)) throw new Error("Invalid status");
    await updateDoc(doc(db, "staffProfiles", uid), { status, reviewedAt: serverTimestamp() });
  },
  async setStaffDepartment(uid, department) {
    requireOwner();
    if (!["sales", "entry", "playing", "event"].includes(department)) throw new Error("Invalid department");
    await updateDoc(doc(db, "staffProfiles", uid), { department, reviewedAt: serverTimestamp() });
  },
  async hasDeletePassword() {
    requireOwner();
    const snap = await getDoc(doc(db, "ownerSettings", "deleteProtection"));
    return snap.exists() && typeof snap.data().salt === "string" && typeof snap.data().hash === "string";
  },
  async setDeletePassword(password) {
    requireOwner();
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      throw new Error("Password must be 8–128 characters.");
    }
    const salt = randomSalt();
    const hash = await derivePasswordHash(password, salt);
    await setDoc(doc(db, "ownerSettings", "deleteProtection"), {
      salt, hash, algorithm: "PBKDF2-SHA256", iterations: 310000, updatedAt: serverTimestamp()
    });
  },
  async verifyDeletePassword(password) {
    requireOwner();
    const snap = await getDoc(doc(db, "ownerSettings", "deleteProtection"));
    if (!snap.exists()) throw new Error("Set an Owner Delete Password in Owner Database first.");
    const data = snap.data();
    if (data.algorithm !== "PBKDF2-SHA256" || typeof data.salt !== "string" || typeof data.hash !== "string") {
      throw new Error("Owner Delete Password settings are invalid.");
    }
    const actual = await derivePasswordHash(String(password || ""), data.salt);
    if (actual !== data.hash) return false;
    return true;
  },
  async verifyTicketDeleteAsOwner(ownerEmail, ownerLoginPassword, deletePassword) {
    const email = String(ownerEmail || "").trim().toLowerCase();
    if (email !== OWNER_EMAIL) return false;
    const verifyApp = initializeApp(firebaseConfig, "ticketdesk-owner-delete-verification");
    const verifyAuth = getAuth(verifyApp);
    const verifyDb = getFirestore(verifyApp);
    try {
      const credential = await signInWithEmailAndPassword(verifyAuth, email, String(ownerLoginPassword || ""));
      if (!credential.user.email || credential.user.email.toLowerCase() !== OWNER_EMAIL || credential.user.isAnonymous) return false;
      const snap = await getDoc(doc(verifyDb, "ownerSettings", "deleteProtection"));
      if (!snap.exists()) throw new Error("Owner Delete Password has not been set in Owner Database.");
      const data = snap.data();
      if (data.algorithm !== "PBKDF2-SHA256" || typeof data.salt !== "string" || typeof data.hash !== "string") {
        throw new Error("Owner Delete Password settings are invalid.");
      }
      const actual = await derivePasswordHash(String(deletePassword || ""), data.salt);
      return actual === data.hash;
    } finally {
      if (verifyAuth.currentUser) await signOut(verifyAuth);
    }
  }
};
const gate = document.getElementById("ownerAuthGate");
const statusEl = document.getElementById("authStatus");
const ownerForm = document.getElementById("ownerLoginForm");
const staffForm = document.getElementById("staffLoginForm");
const ownerBtn = document.getElementById("ownerLoginButton");
const staffBtn = document.getElementById("staffLoginButton");
const logoutBtn = document.getElementById("logoutButton");
const emailInput = document.getElementById("ownerEmail");
const passwordInput = document.getElementById("ownerPassword");
const nameInput = document.getElementById("staffName");
const deptInput = document.getElementById("staffDepartment");
let loginMode = "staff";
let handlingAuth = false;
const staffOnlyLink = new URLSearchParams(window.location.search).get("staff") === "1";
const authLanguageSelect = document.getElementById("authLanguageSelect");
const AUTH_COPY = {
en:{loginTitle:"Staff Login",loginDescription:"Enter your name and choose your department to continue.",staffLogin:"Staff Login",ownerLogin:"Owner Login",staffName:"Staff name",enterName:"Enter your name",department:"Department",sales:"Sales Department",entry:"Entry Department",playing:"Playing Department",event:"Event Department",loginAsStaff:"Login as Staff",ownerGmail:"Owner Gmail",enterOwnerGmail:"Enter Owner Gmail",firebasePassword:"Firebase Password",loginAsOwner:"Login as Owner",checking:"Choose your name and department to log in.",staffReady:"Choose your name and department, then log in.",ownerReady:"Enter the Owner Gmail and Firebase password.",staffSuccess:"Staff login successful.",ownerRequired:"Only the configured Owner Gmail can sign in here.",ownerInvalid:"Owner login failed. Check the Gmail, password, and Firebase Authentication settings.",staffFailed:"Staff login failed. Check Firebase Anonymous Authentication settings.",networkError:"Could not verify login. Check your connection and Firebase settings.",signedOut:"You have signed out. Choose Staff Login to continue.",fillName:"Enter your name.",ownerPasswordRequired:"Enter the Firebase password.",ownerDomain:"Add this website domain in Firebase Authentication → Settings → Authorized domains.",staffOnly:"Staff access only. Enter your name and choose a department."},
th:{loginTitle:"เข้าสู่ระบบพนักงาน",loginDescription:"กรอกชื่อและเลือกแผนกเพื่อเข้าสู่ระบบ",staffLogin:"เข้าสู่ระบบพนักงาน",ownerLogin:"เข้าสู่ระบบเจ้าของ",staffName:"ชื่อพนักงาน",enterName:"กรอกชื่อของคุณ",department:"แผนก",sales:"แผนกจำหน่ายตั๋ว",entry:"แผนกตั๋วเข้า",playing:"แผนกตั๋วเล่น",event:"แผนกกิจกรรม",loginAsStaff:"เข้าสู่ระบบพนักงาน",ownerGmail:"Gmail เจ้าของ",enterOwnerGmail:"กรอก Gmail เจ้าของ",firebasePassword:"รหัสผ่าน Firebase",loginAsOwner:"เข้าสู่ระบบเจ้าของ",checking:"เลือกชื่อและแผนกเพื่อเข้าสู่ระบบ",staffReady:"เลือกชื่อและแผนก แล้วกดเข้าสู่ระบบ",ownerReady:"กรอก Gmail และรหัสผ่าน Firebase ของเจ้าของ",staffSuccess:"เข้าสู่ระบบพนักงานสำเร็จ",ownerRequired:"อนุญาตเฉพาะ Gmail ของเจ้าของที่กำหนดไว้เท่านั้น",ownerInvalid:"เข้าสู่ระบบเจ้าของไม่สำเร็จ กรุณาตรวจสอบ Gmail รหัสผ่าน และ Firebase Authentication",staffFailed:"เข้าสู่ระบบพนักงานไม่สำเร็จ กรุณาตรวจสอบ Anonymous Authentication ใน Firebase",networkError:"ตรวจสอบการเข้าสู่ระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตและการตั้งค่า Firebase",signedOut:"ออกจากระบบแล้ว เลือกเข้าสู่ระบบพนักงานเพื่อดำเนินการต่อ",fillName:"กรุณากรอกชื่อ",ownerPasswordRequired:"กรุณากรอกรหัสผ่าน Firebase",ownerDomain:"เพิ่มโดเมนเว็บไซต์นี้ใน Firebase Authentication → Settings → Authorized domains",staffOnly:"สำหรับพนักงานเท่านั้น กรุณากรอกชื่อและเลือกแผนก"}
};
function authLang(){try{return localStorage.getItem("ticketdesk-language")==="th"?"th":"en";}catch{return "en";}}
function authT(key){return AUTH_COPY[authLang()][key]||AUTH_COPY.en[key]||key;}
function applyAuthLanguage(){
 const language=authLang();document.documentElement.lang=language;if(authLanguageSelect)authLanguageSelect.value=language;
 document.querySelectorAll("[data-auth-i18n]").forEach(el=>{const key=el.dataset.authI18n;if(AUTH_COPY[language][key])el.textContent=AUTH_COPY[language][key];});
 document.querySelectorAll("[data-auth-placeholder]").forEach(el=>{const key=el.dataset.authPlaceholder;if(AUTH_COPY[language][key])el.placeholder=AUTH_COPY[language][key];});
 if(statusEl&&!statusEl.classList.contains("error"))statusEl.textContent=authT(staffOnlyLink?"staffOnly":loginMode==="owner"?"ownerReady":"staffReady");
}
function translatedStatus(message){
 if(/အမည်ဖြည့်|name.*required/i.test(message))return authT("fillName");
 if(/Owner Login မအောင်မြင်|Firebase Password.*စစ်ဆေး/i.test(message))return authT("ownerInvalid");
 if(/ခွင့်ပြုထားသော Owner Gmail|Owner Gmail မဟုတ်|Owner အဖြစ် ခွင့်မပြု/i.test(message))return authT("ownerRequired");
 if(/Anonymous Sign-in|Staff Login မအောင်မြင်/i.test(message))return authT("staffFailed");
 if(/Network ကို စစ်ဆေး|Login အချက်အလက်ကို စစ်ဆေးမရ/i.test(message))return authT("networkError");
 if(/Authorized domains/i.test(message))return authT("ownerDomain");
 if(/Login ဝင်ပြီးပါပြီ/i.test(message))return authT("staffSuccess");
 if(/အကောင့်မှ ထွက်ပြီးပါပြီ/i.test(message))return authT("signedOut");
 if(/Firebase Password ထည့်ပါ/i.test(message))return authT("ownerPasswordRequired");
 if(/အမည်နဲ့ Department ကိုရွေးပြီး Login ဝင်ပါ|Staff Login သို့မဟုတ် Owner Login ကိုရွေးပါ/i.test(message))return authT(staffOnlyLink?"staffOnly":"staffReady");
 if(/Owner Gmail နဲ့ Firebase Password/i.test(message))return authT("ownerReady");
 return message;
}

function status(message, isError = false) {
  statusEl.textContent = translatedStatus(message);
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
  status(mode === "staff" ? (staffOnlyLink ? authT("staffOnly") : authT("staffReady")) : authT("ownerReady"));
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
      if (staffOnlyLink) { await signOut(auth); denyApp(authT("staffOnly")); setMode("staff"); return; }
      allowApp(user); return;
    }
    if (!user.isAnonymous) {
      await signOut(auth);
      denyApp("ဒီအကောင့်ကို Owner အဖြစ် ခွင့်မပြုထားပါ။", true);
      return;
    }
    // Staff login is intentionally local and immediate: name + department is enough.
    // This app currently stores ticket records in this browser, not in a shared cloud database.
    let profile = null;
    try {
      const saved = localStorage.getItem("ticketdesk-local-staff-profile");
      if (saved) profile = JSON.parse(saved);
    } catch (error) {
      console.warn("Could not read local staff session", error);
    }
    if (!profile || typeof profile.name !== "string" ||
        !["sales", "entry", "playing", "event"].includes(profile.department)) {
      denyApp("အမည်နဲ့ Department ကိုရွေးပြီး Login ဝင်ပါ။");
      return;
    }
    profile.status = "approved";
    allowApp(user, profile);
  } catch (error) {
    console.error("Auth profile check failed", error);
    denyApp("Login အချက်အလက်ကို စစ်ဆေးမရပါ။ Firebase Rules နှင့် Network ကို စစ်ဆေးပါ။", true);
  } finally {
    handlingAuth = false;
  }
}
document.getElementById("staffModeButton").addEventListener("click", () => setMode("staff"));
document.getElementById("ownerModeButton").addEventListener("click", () => { if (!staffOnlyLink) setMode("owner"); });
authLanguageSelect?.addEventListener("change", () => { try { localStorage.setItem("ticketdesk-language", authLanguageSelect.value); } catch {} applyAuthLanguage(); });
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
    const localProfile = { name, department, status: "approved" };
    localStorage.setItem("ticketdesk-local-staff-profile", JSON.stringify(localProfile));
    allowApp(user, localProfile);
    status("Login ဝင်ပြီးပါပြီ။");
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
logoutBtn?.addEventListener("click", async () => {
  if (!auth.currentUser) {
    denyApp("Staff Login သို့မဟုတ် Owner Login ကိုရွေးပါ။");
    setMode("staff");
    return;
  }
  logoutBtn.disabled = true;
  logoutBtn.textContent = "Signing out…";
  try {
    await signOut(auth);
    window.ticketDeskAccess = null;
    try { localStorage.removeItem("ticketdesk-local-staff-profile"); } catch (error) { console.warn("Could not clear local staff profile", error); }
    setMode("staff");
    denyApp("အကောင့်မှ ထွက်ပြီးပါပြီ။ ပြန်ဝင်ရန် Login ကိုရွေးပါ။");
  } catch (error) {
    console.error("Sign out failed", error);
    status("Logout မအောင်မြင်ပါ။ Network ကိုစစ်ပြီး ထပ်ကြိုးစားပါ။", true);
  } finally {
    logoutBtn.disabled = false;
    logoutBtn.textContent = document.documentElement.lang === "th" ? "ออกจากระบบ" : "Log out";
  }
});
if (staffOnlyLink) {
  document.getElementById("ownerModeButton").hidden = true;
  document.getElementById("ownerLoginForm").hidden = true;
  document.getElementById("ownerAuthTitle").textContent = authT("loginTitle");
  document.querySelector(".auth-description").textContent = authT("staffOnly");
}
applyAuthLanguage();
setMode("staff");
onAuthStateChanged(auth, routeUser);
