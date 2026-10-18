import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, onSnapshot, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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
const DEPTS = ["sales", "entry", "playing", "event"];
let role = "";
let started = false;
let signingInAnonymously = false;
let publishTimer = null;
let stopCatalog = null;
let stopDaily = null;
let lastCatalogIds = new Set();
let explicitOwnerDeletePending = false;

// Firestore emits collection snapshots for individual document writes. Coalesce
// rapid Owner updates and apply only the latest full snapshot to Staff.
const SNAPSHOT_COALESCE_MS = 350;
let catalogApplyTimer = null, dailyApplyTimer = null;
let queuedCatalogSnapshot = null, queuedDailySnapshot = null;
let catalogApplyRunning = false, dailyApplyRunning = false;

function queueLatestSnapshot(kind, snapshot) {
  if (kind === "catalog") {
    queuedCatalogSnapshot = snapshot;
    clearTimeout(catalogApplyTimer);
    catalogApplyTimer = setTimeout(() => {
      catalogApplyTimer = null;
      if (catalogApplyRunning || !queuedCatalogSnapshot) return;
      const latest = queuedCatalogSnapshot;
      queuedCatalogSnapshot = null;
      catalogApplyRunning = true;
      applyCatalog(latest)
        .then(() => syncStatus(`Shared catalog loaded: ${latest.size} ticket types.`))
        .catch(err => syncStatus(`Staff catalog load failed: ${err?.code || err?.message || "unknown error"}`, true))
        .finally(() => {
          catalogApplyRunning = false;
          if (queuedCatalogSnapshot) queueLatestSnapshot("catalog", queuedCatalogSnapshot);
        });
    }, SNAPSHOT_COALESCE_MS);
    return;
  }
  queuedDailySnapshot = snapshot;
  clearTimeout(dailyApplyTimer);
  dailyApplyTimer = setTimeout(() => {
    dailyApplyTimer = null;
    if (dailyApplyRunning || !queuedDailySnapshot) return;
    const latest = queuedDailySnapshot;
    queuedDailySnapshot = null;
    dailyApplyRunning = true;
    applyDaily(latest)
      .then(() => syncStatus(`Shared ticket quantities updated: ${latest.size} records.`))
      .catch(err => syncStatus(`Staff quantity sync failed: ${err?.code || err?.message || "unknown error"}`, true))
      .finally(() => {
        dailyApplyRunning = false;
        if (queuedDailySnapshot) queueLatestSnapshot("daily", queuedDailySnapshot);
      });
  }, SNAPSHOT_COALESCE_MS);
}

function syncStatus(message, isError = false) {
  console[isError ? "error" : "info"]("[Ticket Desk Cloud Sync]", message);
  const foot = document.querySelector(".sidebar-foot");
  if (foot) {
    foot.dataset.cloudSync = isError ? "error" : "ok";
    foot.title = message;
    const label = foot.querySelector("[data-i18n]");
    if (label) label.textContent = message;
  }
  window.dispatchEvent(new CustomEvent("ticketdesk-cloud-sync-status", {
    detail: { message, error: isError }
  }));
}

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
function slotCatalogId(ticket) {
  return Number.isInteger(ticket.slotNumber) && ticket.slotNumber > 0
    ? `${ticket.departmentId}__slot__${ticket.slotNumber}`
    : `${ticket.departmentId}__ticket__${ticket.id}`;
}
async function imageFor(ticket) {
  if (!ticket.imageId) return null;
  const image = await window.ticketdeskLocalStore.get("images", ticket.imageId);
  return image?.data || null;
}
async function publishOwnerCatalog() {
  if (role !== "owner" || auth.currentUser?.email?.toLowerCase() !== OWNER) return;
  await waitForLocalStore();
  const store = window.ticketdeskLocalStore;
  const tickets = (await store.all("tickets")).filter(t => t && DEPTS.includes(t.departmentId));
  // Never erase the cloud catalog when this browser has only empty starter slots (or no local tickets).
  if (!tickets.some(t => String(t.name || "").trim()) && !explicitOwnerDeletePending) {
    console.warn("Cloud catalog publish skipped: no named local tickets to safely reconcile.");
    return;
  }
  const desired = new Set();
  const existingSnapshot = await getDocs(collection(db, "sharedTicketCatalog"));
  const existingById = new Map(existingSnapshot.docs.map(d => [d.id, d.data()]));
  for (const ticket of tickets) {
    const id = slotCatalogId(ticket);
    if (!String(ticket.name || "").trim()) continue;
    desired.add(id);
    const imageData = await imageFor(ticket);
    if (imageData && imageData.length > 760000) {
      console.warn("Ticket image is too large to sync safely; preserving any existing cloud record:", ticket.name);
      continue;
    }
    const catalogRef = doc(db, "sharedTicketCatalog", id);
    const nextRecord = {
      catalogId: id,
      sourceTicketId: String(ticket.id),
      departmentId: ticket.departmentId,
      name: String(ticket.name || "").slice(0, 160),
      notes: String(ticket.notes || "").slice(0, 1000),
      slotNumber: Number.isInteger(ticket.slotNumber) ? ticket.slotNumber : null,
      inventory: Number.isFinite(ticket.inventory) ? ticket.inventory : null,
      imageData
    };
    const previousRecord = existingById.get(id);
    const fields = ["catalogId", "sourceTicketId", "departmentId", "name", "notes", "slotNumber", "inventory", "imageData"];
    const unchanged = previousRecord && fields.every(key => (previousRecord[key] ?? null) === (nextRecord[key] ?? null));
    if (!unchanged) {
      await setDoc(catalogRef, { ...nextRecord, updatedAt: new Date().toISOString() });
    }
  }
  // Compare with the actual cloud catalog so deletions propagate after Owner reloads too.
  for (const existing of existingSnapshot.docs) {
    if (!desired.has(existing.id)) await deleteDoc(doc(db, "sharedTicketCatalog", existing.id));
  }
  lastCatalogIds = desired;
  explicitOwnerDeletePending = false;
  syncStatus(`Cloud sync complete: ${desired.size} named ticket types published.`);
}
function queueCatalogPublish(event) {
  if (role !== "owner") return;
  if (event?.detail?.action === "delete") explicitOwnerDeletePending = true;
  clearTimeout(publishTimer);
  publishTimer = setTimeout(() => publishOwnerCatalog().catch(err => console.error("Catalog publish failed:", err)), 600);
}
async function applyCatalog(snapshot) {
  await waitForLocalStore();
  const store = window.ticketdeskLocalStore;
  const localTickets = await store.all("tickets");
  const remoteRecords = snapshot.docs.map(d => ({ ...d.data(), cloudDocId: d.id }));
  let catalogChanged = false;
  const nextIds = new Set(remoteRecords.map(x => x.cloudDocId));
  for (const remote of remoteRecords) {
    if (!DEPTS.includes(remote.departmentId) || !remote.name) continue;
    let local = localTickets.find(t => t.sharedCatalogId === remote.cloudDocId);
    if (!local && Number.isInteger(remote.slotNumber)) {
      local = localTickets.find(t => t.departmentId === remote.departmentId && t.slotNumber === remote.slotNumber);
    }
    if (!local) local = localTickets.find(t => t.departmentId === remote.departmentId && String(t.name || "").trim().toLowerCase() === String(remote.name).trim().toLowerCase());
    const sharedImageId = `shared-img-${remote.cloudDocId}`;
    if (remote.imageData) await store.put("images", { id: sharedImageId, data: remote.imageData, shared: true, updatedAt: remote.updatedAt || new Date().toISOString() });
    if (local) {
      const updated = { ...local, sharedCatalogId: remote.cloudDocId, name: remote.name, notes: remote.notes || "", inventory: remote.inventory ?? local.inventory, updatedAt: remote.updatedAt || local.updatedAt };
      if (remote.imageData) updated.imageId = sharedImageId;
      else if (String(local.imageId || "").startsWith("shared-img-")) { await store.del("images", local.imageId); updated.imageId = null; }
      if (JSON.stringify(local) !== JSON.stringify(updated)) { await store.put("tickets", updated); catalogChanged = true; }
    } else {
      const created = {
        id: `shared-${remote.cloudDocId}`, sharedCatalogId: remote.cloudDocId,
        departmentId: remote.departmentId, name: remote.name, notes: remote.notes || "",
        inventory: remote.inventory ?? null, imageId: remote.imageData ? sharedImageId : null,
        slot: false, slotNumber: remote.slotNumber ?? undefined,
        createdAt: remote.updatedAt || new Date().toISOString(), updatedAt: remote.updatedAt || new Date().toISOString(),
        sharedFromOwner: true
      };
      await store.put("tickets", created);
      localTickets.push(created);
      catalogChanged = true;
    }
  }
  // Remove only ticket entries that were explicitly linked to the Owner's shared catalog.
  for (const local of localTickets) {
    if (local.sharedCatalogId && !nextIds.has(local.sharedCatalogId)) {
      if (String(local.imageId || "").startsWith("shared-img-")) await store.del("images", local.imageId);
      await store.del("tickets", local.id);
      catalogChanged = true;
    }
  }
  lastCatalogIds = nextIds;
  if (catalogChanged) {
    window.ticketdeskLocalStore.refresh?.();
    document.dispatchEvent(new Event("ticketdesk-cloud-catalog-updated"));
  }
}
function dailyDocId(departmentId, ticketId, date) {
  return `${departmentId}__${ticketId}__${date}`.replaceAll("/", "_");
}
async function publishDaily(record) {
  if (!auth.currentUser || !record || !DEPTS.includes(record.departmentId) || !record.date || !record.ticketId) return;
  await waitForLocalStore();
  const store = window.ticketdeskLocalStore;
  const ticket = await store.get("tickets", record.ticketId);
  const catalogTicketId = ticket?.sharedCatalogId || (ticket ? slotCatalogId(ticket) : (String(record.ticketId).startsWith("shared-") ? String(record.ticketId).slice(7) : String(record.ticketId)));
  await setDoc(doc(db, "sharedDaily", dailyDocId(record.departmentId, catalogTicketId, record.date)), {
    id: dailyDocId(record.departmentId, catalogTicketId, record.date),
    ticketId: catalogTicketId,
    departmentId: record.departmentId,
    date: record.date,
    quantity: Math.max(0, Math.trunc(Number(record.quantity) || 0)),
    notes: String(record.notes || "").slice(0, 1000),
    updatedAt: record.updatedAt || new Date().toISOString(),
    sourceUid: auth.currentUser.uid,
    sourceName: staffSession()?.name || auth.currentUser.email || "Owner"
  });
}
async function publishReset(detail) {
  if (!detail || !Array.isArray(detail.records)) return;
  for (const rec of detail.records) await publishDaily({ ...rec, quantity: 0, updatedAt: new Date().toISOString() });
}
async function applyDaily(snapshot) {
  if (role !== "owner" && role !== "staff") return;
  await waitForLocalStore();
  const store = window.ticketdeskLocalStore;
  const tickets = await store.all("tickets");
  let dailyChanged = false;
  for (const d of snapshot.docs) {
    const remote = d.data();
    if (!DEPTS.includes(remote.departmentId) || !remote.date || !remote.ticketId) continue;
    const ticket = tickets.find(t => t.sharedCatalogId === remote.ticketId || t.id === remote.ticketId || slotCatalogId(t) === remote.ticketId);
    if (!ticket) continue;
    const id = `${ticket.id}__${remote.date}`;
    const nextRecord = {
      id, ticketId: ticket.id, departmentId: remote.departmentId, date: remote.date,
      quantity: Math.max(0, Math.trunc(Number(remote.quantity) || 0)),
      notes: remote.notes || "", updatedAt: remote.updatedAt || new Date().toISOString(),
      sourceUid: remote.sourceUid, sourceName: remote.sourceName || ""
    };
    const current = await store.get("daily", id);
    if (!current || Number(current.quantity || 0) !== nextRecord.quantity ||
        String(current.notes || "") !== nextRecord.notes ||
        String(current.updatedAt || "") !== nextRecord.updatedAt) {
      await store.put("daily", nextRecord);
      dailyChanged = true;
    }
  }
  if (dailyChanged) {
    window.ticketdeskLocalStore.refresh?.();
    document.dispatchEvent(new Event("ticketdesk-cloud-daily-updated"));
  }
}
function startOwner() {
  if (role === "owner") return;
  role = "owner"; started = true;
  document.addEventListener("ticketdesk-local-ticket-changed", queueCatalogPublish);
  document.addEventListener("ticketdesk-daily-changed", e => publishDaily(e.detail).catch(err => console.error("Daily sync failed:", err)));
  document.addEventListener("ticketdesk-daily-reset", e => publishReset(e.detail).catch(err => syncStatus(`Daily reset sync failed: ${err?.code || err?.message || "unknown error"}`, true)));
  syncStatus("Owner connected; preparing ticket catalog sync…");
  waitForLocalStore().then(() => publishOwnerCatalog()).catch(err => syncStatus(`Initial catalog sync failed: ${err?.code || err?.message || "unknown error"}`, true));
  stopDaily = onSnapshot(collection(db, "sharedDaily"), snapshot => applyDaily(snapshot).catch(err => syncStatus(`Daily sync failed: ${err?.code || err?.message || "unknown error"}`, true)), err => syncStatus(`Daily sync listener failed: ${err?.code || err?.message || "unknown error"}`, true));
}
function startStaff() {
  if (started || !auth.currentUser) return;
  role = "staff"; started = true;
  syncStatus("Staff connected; loading shared ticket catalog…");
  stopCatalog = onSnapshot(collection(db, "sharedTicketCatalog"), snapshot => queueLatestSnapshot("catalog", snapshot), err => syncStatus(`Staff catalog listener failed: ${err?.code || err?.message || "unknown error"}`, true));
  stopDaily = onSnapshot(collection(db, "sharedDaily"), snapshot => queueLatestSnapshot("daily", snapshot), err => syncStatus(`Staff quantity listener failed: ${err?.code || err?.message || "unknown error"}`, true));
  document.addEventListener("ticketdesk-daily-changed", e => publishDaily(e.detail).catch(err => syncStatus(`Daily publish failed: ${err?.code || err?.message || "unknown error"}`, true)));
  document.addEventListener("ticketdesk-daily-reset", e => publishReset(e.detail).catch(err => console.error("Daily reset sync failed:", err)));
}
onAuthStateChanged(auth, user => {
  if (user?.email?.toLowerCase() === OWNER) {
    (async () => {
      try {
        await user.reload();
        const refreshed = auth.currentUser;
        if (!refreshed || refreshed.email?.toLowerCase() !== OWNER) {
          syncStatus(`Owner account mismatch: Firebase signed in as ${refreshed?.email || "unknown account"}.`, true);
          return;
        }
        await refreshed.getIdToken(true);
        await refreshed.reload();
        if (auth.currentUser?.email?.toLowerCase() === OWNER) {
          // Owner access is already protected by Firebase Email/Password login and the allowlisted Owner email.
          // Do not block cloud sync solely because the verification flag is stale or inconsistent.
          if (!auth.currentUser.emailVerified) {
            syncStatus("Owner signed in; Firebase email verification flag is false, but Cloud Sync is allowed for the authenticated Owner account.", true);
          }
          startOwner();
        }
      } catch (err) {
        syncStatus(`Owner authentication refresh failed: ${err?.code || err?.message || "unknown error"}`, true);
      }
    })();
    return;
  }
  if (staffSession() && (!user || user.isAnonymous)) {
    if (user) { startStaff(); return; }
    if (!signingInAnonymously) {
      signingInAnonymously = true;
      signInAnonymously(auth).then(() => startStaff()).catch(err => console.error("Staff cloud sync authentication failed:", err)).finally(() => { signingInAnonymously = false; });
    }
  }
});
