import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const cfg = {
  apiKey: "AIzaSyAviNd7mh8B_1cie1tdKfHiQt4Y1EPRa98",
  authDomain: "pattaya-dinosaur-ticket-desk.firebaseapp.com",
  projectId: "pattaya-dinosaur-ticket-desk",
  storageBucket: "pattaya-dinosaur-ticket-desk.firebasestorage.app",
  messagingSenderId: "386652978138",
  appId: "1:386652978138:web:32c00c1b19caacda7cdee3"
};
const app = getApps().find(x => x.name === "[DEFAULT]") || initializeApp(cfg);
const auth = getAuth(app);
const db = getFirestore(app);
const OWNER = "1987zinwaimin@gmail.com";
let role = "";
let unsubscribe = null;
let publishTimer = null;
let started = false;
let signingInAnonymously = false;

function staffSession() {
  try {
    const s = JSON.parse(localStorage.getItem("ticketdesk-staff-session-v1") || "null");
    return s && typeof s.name === "string" && ["sales", "entry", "playing", "event", "leader"].includes(s.department) ? s : null;
  } catch { return null; }
}
function waitForLocalStore() {
  if (window.ticketdeskStoreReady && window.ticketdeskLocalStore) return Promise.resolve();
  return new Promise(resolve => document.addEventListener("ticketdesk-local-store-ready", resolve, { once: true }));
}
function catalogId(ticket) {
  return ticket.slotNumber ? `${ticket.departmentId}__slot__${ticket.slotNumber}` : `${ticket.departmentId}__ticket__${ticket.id}`;
}
async function imageFor(ticket) {
  if (!ticket.imageId) return null;
  const image = await window.ticketdeskLocalStore.get("images", ticket.imageId);
  return image?.data || null;
}
async function publishOwnerCatalog() {
  if (role !== "owner" || !auth.currentUser || auth.currentUser.email?.toLowerCase() !== OWNER) return;
  await waitForLocalStore();
  const store = window.ticketdeskLocalStore;
  const tickets = (await store.all("tickets")).filter(t => t && t.departmentId && String(t.name || "").trim());
  for (const ticket of tickets) {
    const imageData = await imageFor(ticket);
    // Firestore documents are limited to 1 MiB. Never attempt to write an oversized image.
    if (imageData && imageData.length > 760000) {
      console.warn("Shared image too large for safe Firestore sync; use a smaller ticket image:", ticket.name);
      continue;
    }
    const payload = {
      departmentId: ticket.departmentId,
      catalogId: catalogId(ticket),
      name: String(ticket.name || "").slice(0, 160),
      notes: String(ticket.notes || "").slice(0, 1000),
      slotNumber: Number.isInteger(ticket.slotNumber) ? ticket.slotNumber : null,
      inventory: Number.isFinite(ticket.inventory) ? ticket.inventory : null,
      imageData,
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, "sharedTicketCatalog", payload.catalogId), payload);
  }
  console.info("Owner ticket catalog published to Firebase.");
}
function queuePublish() {
  if (role !== "owner") return;
  clearTimeout(publishTimer);
  publishTimer = setTimeout(() => publishOwnerCatalog().catch(err => console.error("Could not publish shared ticket catalog:", err)), 500);
}
async function applyCatalog(snapshot) {
  await waitForLocalStore();
  const store = window.ticketdeskLocalStore;
  const localTickets = await store.all("tickets");
  const records = snapshot.docs.map(d => ({ ...d.data(), cloudDocId: d.id }));
  for (const remote of records) {
    if (!["sales", "entry", "playing", "event"].includes(remote.departmentId) || !remote.name) continue;
    let local = null;
    if (Number.isInteger(remote.slotNumber)) {
      local = localTickets.find(t => t.departmentId === remote.departmentId && t.slotNumber === remote.slotNumber);
    }
    if (!local) {
      local = localTickets.find(t => t.departmentId === remote.departmentId && String(t.name || "").trim().toLowerCase() === String(remote.name).trim().toLowerCase());
    }
    const sharedImageId = `shared-img-${remote.cloudDocId}`;
    if (remote.imageData) {
      await store.put("images", { id: sharedImageId, data: remote.imageData, shared: true, updatedAt: remote.updatedAt || new Date().toISOString() });
    }
    if (local) {
      const updated = { ...local, name: remote.name, notes: remote.notes || "", inventory: remote.inventory ?? local.inventory, updatedAt: remote.updatedAt || local.updatedAt };
      if (remote.imageData) updated.imageId = sharedImageId;
      else if (String(local.imageId || "").startsWith("shared-img-")) {
        await store.del("images", local.imageId);
        updated.imageId = null;
      }
      await store.put("tickets", updated);
    } else {
      const newTicket = {
        id: `shared-${remote.cloudDocId}`,
        departmentId: remote.departmentId,
        name: remote.name,
        notes: remote.notes || "",
        inventory: remote.inventory ?? null,
        imageId: remote.imageData ? sharedImageId : null,
        slot: false,
        slotNumber: remote.slotNumber ?? undefined,
        createdAt: remote.updatedAt || new Date().toISOString(),
        updatedAt: remote.updatedAt || new Date().toISOString(),
        sharedFromOwner: true
      };
      await store.put("tickets", newTicket);
      localTickets.push(newTicket);
    }
  }
  window.ticketdeskLocalStore.refresh?.();
  document.dispatchEvent(new Event("ticketdesk-cloud-catalog-updated"));
}
function startStaffSync() {
  if (started || !auth.currentUser) return;
  started = true;
  role = "staff";
  unsubscribe = onSnapshot(collection(db, "sharedTicketCatalog"), snapshot => {
    applyCatalog(snapshot).catch(err => console.error("Could not apply shared ticket catalog:", err));
  }, err => console.error("Shared ticket catalog read failed:", err));
}
function startOwnerSync() {
  role = "owner";
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  started = true;
  publishOwnerCatalog().catch(err => console.error("Could not publish shared ticket catalog:", err));
  document.addEventListener("ticketdesk-local-ticket-changed", queuePublish);
}
onAuthStateChanged(auth, user => {
  if (user?.email?.toLowerCase() === OWNER && user.emailVerified) {
    if (role !== "owner") startOwnerSync();
    return;
  }
  if (staffSession() && (!user || user.isAnonymous)) {
    if (user) { startStaffSync(); return; }
    if (!signingInAnonymously) {
      signingInAnonymously = true;
      signInAnonymously(auth).then(() => startStaffSync()).catch(err => {
        console.error("Staff cloud sync authentication failed:", err);
      }).finally(() => { signingInAnonymously = false; });
    }
  }
});
