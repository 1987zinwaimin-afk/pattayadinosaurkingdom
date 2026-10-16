import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, signInWithEmailAndPassword, linkWithCredential } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAk6QIHerhCUWdGAj_zTYc03vLOO8UlG8c",
  authDomain: "pattaya-dinosaur-ticket-desk.firebaseapp.com",
  projectId: "pattaya-dinosaur-ticket-desk",
  storageBucket: "pattaya-dinosaur-ticket-desk.firebasestorage.app",
  messagingSenderId: "386652978138",
  appId: "1:386652978138:web:10e955888dab1ef37cdee3"
};
const OWNER_EMAIL = "1987zinwaimin@gmail.com".toLowerCase();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });
const gate = document.getElementById("ownerAuthGate");
const statusEl = document.getElementById("authStatus");
const googleBtn = document.getElementById("googleOwnerLogin");
const linkPanel = document.getElementById("linkExistingAccount");
const linkBtn = document.getElementById("linkGoogleAccount");
let pendingGoogleCredential = null;

function status(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}
function openApp(user) {
  if (!user || !user.email || user.email.toLowerCase() !== OWNER_EMAIL) {
    document.body.classList.add("auth-pending");
    if (user) signOut(auth).catch(() => {});
    status("This Google account is not authorized for Ticket Desk Owner access. Choose the owner Gmail account.", true);
    return;
  }
  document.body.classList.remove("auth-pending");
  gate.hidden = true;
  document.dispatchEvent(new CustomEvent("ticketdesk-owner-authenticated", {
    detail: { email: user.email, uid: user.uid, provider: user.providerData.map(p => p.providerId) }
  }));
}
onAuthStateChanged(auth, user => {
  if (user) openApp(user);
  else document.body.classList.add("auth-pending");
});
googleBtn.addEventListener("click", async () => {
  googleBtn.disabled = true;
  status("Connecting to Google…");
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === "auth/account-exists-with-different-credential") {
      pendingGoogleCredential = GoogleAuthProvider.credentialFromError(error);
      linkPanel.hidden = false;
      status("This Gmail already exists with Email/Password. Sign in below once to connect Google to that account.", true);
    } else if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(error.code)) {
      await signInWithRedirect(auth, provider);
      return;
    } else {
      status(friendlyError(error), true);
    }
  } finally {
    googleBtn.disabled = false;
  }
});
linkBtn.addEventListener("click", async () => {
  const email = document.getElementById("ownerEmail").value.trim().toLowerCase();
  const password = document.getElementById("ownerPassword").value;
  if (email !== OWNER_EMAIL) return status("Please use the authorized owner Gmail address.", true);
  if (!password) return status("Enter the Firebase password you created for this account.", true);
  linkBtn.disabled = true;
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    if (!pendingGoogleCredential) throw new Error("Google sign-in credential is missing. Tap Continue with Google again.");
    await linkWithCredential(result.user, pendingGoogleCredential);
    pendingGoogleCredential = null;
    status("Google account connected successfully.");
  } catch (error) {
    status(friendlyError(error), true);
  } finally {
    linkBtn.disabled = false;
  }
});
getRedirectResult(auth).catch(error => status(friendlyError(error), true));

function friendlyError(error) {
  const code = error?.code || "";
  if (code === "auth/unauthorized-domain") return "This website domain is not authorized in Firebase Authentication. Add pattayadinosaurkingdom.vercel.app under Authentication → Settings → Authorized domains.";
  if (code === "auth/popup-closed-by-user") return "Google sign-in was closed before completion. Tap Continue with Google to try again.";
  if (code === "auth/invalid-api-key") return "Firebase API key was rejected. Check the Web App config in Firebase Project settings.";
  if (code === "auth/operation-not-allowed") return "Google sign-in is not enabled in Firebase Authentication → Sign-in method.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/invalid-login-credentials") return "Email/password sign-in failed. Check the password you set when adding the user in Firebase.";
  if (code === "auth/email-already-in-use" || code === "auth/credential-already-in-use") return "Google is already connected to another Firebase account. Do not create another account; check the existing provider in Authentication → Users.";
  return error?.message || "Sign-in failed. Check Firebase Authentication settings and try again.";
}
