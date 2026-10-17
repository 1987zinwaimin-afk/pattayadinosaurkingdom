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
    if (!["sales", "entry", "playing", "event", "leader"].includes(department)) throw new Error("Invalid department");
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
  }
};
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
      // The saved Firestore profile is authoritative. Owner may change a staff
      // member's department/Leader role, so do not compare it with the login form.
      if (old.name !== name) {
        status("ဒီ Browser မှာ သိမ်းထားတဲ့ Staff အမည်နဲ့ မကိုက်ညီပါ။ Owner ထံမှ Profile ကို စစ်ဆေးပေးရန် တောင်းဆိုပါ။", true);
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
