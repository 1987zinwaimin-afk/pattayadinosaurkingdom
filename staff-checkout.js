import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const config = {
  apiKey: "AIzaSyAviNd7mh8B_1cie1tdKfHiQt4Y1EPRa98",
  authDomain: "pattaya-dinosaur-ticket-desk.firebaseapp.com",
  projectId: "pattaya-dinosaur-ticket-desk",
  storageBucket: "pattaya-dinosaur-ticket-desk.firebasestorage.app",
  messagingSenderId: "386652978138",
  appId: "1:386652978138:web:32c00c1b19caacda7cdee3"
};
const app = getApps().find(item => item.name === "[DEFAULT]") || initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

window.ticketdeskStaffCheckOut = async function staffCheckOut(session) {
  if (!session || !session.uid || !session.name || !session.department) {
    throw new Error("Staff session details are missing. Please sign in again.");
  }
  const user = auth.currentUser;
  if (!user || user.uid !== session.uid) {
    throw new Error("The signed-in staff identity could not be verified. Please return to Staff Login and sign in again; your current session has not been cleared.");
  }
  await addDoc(collection(db, "staffAttendanceEvents"), {
    eventType: "check-out",
    name: String(session.name).slice(0, 80),
    department: session.department,
    uid: user.uid,
    clientTime: new Date().toISOString(),
    createdAt: serverTimestamp(),
    source: "staff-dashboard"
  });
  // Only clear the local session after Firestore confirms the check-out write.
  localStorage.removeItem("ticketdesk-staff-session-v1");
  return true;
};
