import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

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
const gate = document.getElementById("ownerAuthGate");
const statusEl = document.getElementById("authStatus");
const loginBtn = document.getElementById("ownerLoginButton");
const emailInput = document.getElementById("ownerEmail");
const passwordInput = document.getElementById("ownerPassword");
// Never prefill or restore the Owner Gmail from browser form history.
function clearOwnerEmail() {
  if (emailInput) emailInput.value = "";
}
clearOwnerEmail();
window.addEventListener("pageshow", clearOwnerEmail);
window.addEventListener("pagehide", clearOwnerEmail);

function status(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}
function staffSession() {
  try {
    const value = JSON.parse(localStorage.getItem("ticketdesk-staff-session-v1") || "null");
    return value && typeof value.name === "string" && ["sales", "entry", "playing", "event", "leader"].includes(value.department) ? value : null;
  } catch { return null; }
}
function showGate() {
  document.body.classList.add("auth-pending");
  gate.hidden = false;
}
function allowStaff() {
  gate.hidden = true;
  document.body.classList.remove("auth-pending");
  document.dispatchEvent(new CustomEvent("ticketdesk-staff-authenticated", { detail: staffSession() }));
}
function allowOwner(user) {
  if (!user || !user.email || user.email.toLowerCase() !== OWNER_EMAIL) {
    showGate();
    if (user) signOut(auth).catch(() => {});
    status("ဒီ Gmail သည် Owner အဖြစ် ခွင့်ပြုမထားပါ။ Owner Gmail ဖြင့်သာ ဝင်နိုင်ပါသည်။", true);
    return;
  }
  gate.hidden = true;
  document.body.classList.remove("auth-pending");
  document.dispatchEvent(new CustomEvent("ticketdesk-owner-authenticated", {
    detail: { email: user.email, uid: user.uid }
  }));
}
onAuthStateChanged(auth, user => {
  if (staffSession()) { allowStaff(); return; }
  if (user) allowOwner(user);
  else showGate();
});
document.getElementById("ownerLoginForm").addEventListener("submit", e => e.preventDefault());
loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  if (email !== OWNER_EMAIL) {
    status("ခွင့်ပြုထားသော Owner Gmail ဖြင့်သာ ဝင်နိုင်ပါသည်။", true);
    passwordInput.value = "";
    return;
  }
  if (!password) {
    status("Firebase မှာ သတ်မှတ်ထားတဲ့ Password ကို ထည့်ပါ။", true);
    return;
  }
  loginBtn.disabled = true;
  status("Firebase မှ စစ်ဆေးနေပါသည်…");
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    if (!result.user.email || result.user.email.toLowerCase() !== OWNER_EMAIL) {
      await signOut(auth);
      status("Owner Gmail မဟုတ်သောကြောင့် ဝင်ခွင့်မပြုပါ။", true);
    }
  } catch (error) {
    const code = error?.code || "";
    const message = code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found" || code === "auth/invalid-login-credentials"
      ? "Gmail သို့မဟုတ် Password မှားနေပါသည်။ Firebase Authentication ကို စစ်ဆေးပါ။"
      : code === "auth/operation-not-allowed"
      ? "Firebase Console → Authentication → Sign-in method မှ Email/Password ကို Enable လုပ်ပါ။"
      : code === "auth/unauthorized-domain"
      ? "Firebase Authentication → Settings → Authorized domains မှ pattayadinosaurkingdom-jade.vercel.app ကို ထည့်ပါ။"
      : error?.message || "Login မအောင်မြင်ပါ။ Firebase setting ကို စစ်ဆေးပါ။";
    status(message, true);
  } finally {
    loginBtn.disabled = false;
  }
});
passwordInput.addEventListener("keydown", e => { if (e.key === "Enter") loginBtn.click(); });

const logoutButton = document.getElementById('logoutButton');
if (logoutButton) logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    if (staffSession()) { localStorage.removeItem('ticketdesk-staff-session-v1'); await signOut(auth); window.location.href = './staff-portal.html'; return; }
    await signOut(auth); window.location.reload();
  } catch (error) { console.error('Logout failed', error); status('Logout မအောင်မြင်ပါ။ Network ကိုစစ်ပါ။', true); }
  finally { logoutButton.disabled = false; }
});
