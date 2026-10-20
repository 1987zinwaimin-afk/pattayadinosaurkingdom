import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, getDocsFromServer, onSnapshot, setDoc, deleteDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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
const APPROVAL_DOC = doc(db, "settings", "leaderApproval");
window.ticketdeskCloudApproval = {
  async save(salt, hash) {
    if (auth.currentUser?.email?.toLowerCase() !== OWNER) throw new Error("Owner sign-in required");
    await setDoc(APPROVAL_DOC, {salt, hash, algorithm:"PBKDF2-SHA256", iterations:150000, updatedAt:new Date().toISOString(), updatedBy:OWNER});
  },
  async read() {
    if (!auth.currentUser) throw new Error("Sign-in required");
    const snap = await getDoc(APPROVAL_DOC);
    return snap.exists() ? snap.data() : null;
  }
};
const DEPTS = ["sales", "entry", "playing", "event"];
let role = "";
let started = false;
let signingInAnonymously = false;
let publishTimer = null;
let stopCatalog = null;
let stopDaily = null;
let lastCatalogIds = new Set();
let explicitOwnerDeletePending = false;
let pendingCatalogPublish = false;

// Firestore emits collection snapshots for individual document writes. Coalesce
// rapid Owner updates and apply only the latest full snapshot to Staff.
const SNAPSHOT_COALESCE_MS = 100;
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
        .then(async catalogChanged => {
          // Re-read shared quantities only when the catalog actually changed.
          // Previously every catalog snapshot caused an extra server read of the
          // entire daily collection, slowing Owner/Staff sync unnecessarily.
          if (role === "staff" && auth.currentUser && catalogChanged) {
            const dailySnapshot = await getDocsFromServer(collection(db, "sharedDaily"));
            await applyDaily(dailySnapshot);
          }
          // Notify the UI after every completed cloud snapshot, even when the
          // local record comparison says no fields changed. This repairs stale
          // in-memory views without a full page refresh.
          window.ticketdeskLocalStore?.refresh?.();
          document.dispatchEvent(new Event("ticketdesk-cloud-catalog-updated"));
          syncStatus("Shared catalog loaded: " + latest.size + " ticket types.");
        })
        .catch(err => syncStatus("Staff catalog load failed: " + (err?.code || err?.message || "unknown error"), true))
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
      .then(() => {
        // Keep the currently open Owner/Staff screen in sync without reloading
        // the whole website. app.js defers rendering while a quantity is edited.
        window.ticketdeskLocalStore?.refresh?.();
        document.dispatchEvent(new Event("ticketdesk-cloud-daily-updated"));
        syncStatus(`Shared ticket quantities updated: ${latest.size} records.`);
      })
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
  // The shared catalog is an Owner-owned source of truth. Staff may update
  // daily quantities, but must never publish or overwrite ticket definitions.
  if (role !== "owner" || !auth.currentUser) return;
  if (auth.currentUser.email?.toLowerCase() !== OWNER) return;
  await waitForLocalStore();
  const store = window.ticketdeskLocalStore;
  const tickets = (await store.all("tickets")).filter(t => t && DEPTS.includes(t.departmentId));
  // Never erase the cloud catalog when this browser has only empty starter slots (or no local tickets).
  if (!tickets.some(t => String(t.name || "").trim()) && !explicitOwnerDeletePending) {
    console.warn("Cloud catalog publish skipped: no named local tickets to safely reconcile.");
    return;
  }
  const desired = new Set();
  const existingSnapshot = await getDocsFromServer(collection(db, "sharedTicketCatalog"));
  const existingById = new Map(existingSnapshot.docs.map(d => [d.id, d.data()]));
  for (const ticket of tickets) {
    if (!String(ticket.name || "").trim()) continue;
    // Keep an existing cloud identity when available, including legacy slot IDs.
    // Otherwise use a stable ticket-ID identity, never the mutable display slot.
    const legacyMatch = existingSnapshot.docs.find(d => {
      const data = d.data();
      return data.departmentId === ticket.departmentId &&
        String(data.sourceTicketId || "") === String(ticket.id);
    });
    const id = ticket.sharedCatalogId || legacyMatch?.id || `${ticket.departmentId}__ticket__${ticket.id}`;
    desired.add(id);
    let imageData = await imageFor(ticket);
    const catalogRef = doc(db, "sharedTicketCatalog", id);
    const previousRecord = existingById.get(id);
    // Keep syncing text/inventory edits even if a newly selected image is too
    // large for a safe Firestore document. Retain the last valid cloud image.
    if (imageData && imageData.length > 760000) {
      console.warn("Ticket image exceeds the safe Firestore document budget; syncing other fields and retaining the previous cloud image:", ticket.name);
      imageData = previousRecord?.imageData || null;
      syncStatus(`Ticket updated, but its new image is too large to sync: ${String(ticket.name || "ticket").slice(0, 100)}`, true);
    }
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
    const fields = ["catalogId", "sourceTicketId", "departmentId", "name", "notes", "slotNumber", "inventory", "imageData"];
    const unchanged = previousRecord && fields.every(key => (previousRecord[key] ?? null) === (nextRecord[key] ?? null));
    if (!unchanged) {
      await setDoc(catalogRef, { ...nextRecord, updatedAt: new Date().toISOString() });
    }
    // Remove only duplicate legacy documents that identify this exact Owner
    // ticket by department + sourceTicketId. Same-name tickets with different
    // source IDs are separate valid ticket types and are never merged.
    const duplicateIds = existingSnapshot.docs
      .filter(d => d.id !== id &&
        d.data().departmentId === ticket.departmentId &&
        String(d.data().sourceTicketId || "") === String(ticket.id))
      .map(d => d.id);
    if (duplicateIds.length) {
      await Promise.all(duplicateIds.map(duplicateId =>
        deleteDoc(doc(db, "sharedTicketCatalog", duplicateId))
      ));
    }
  }
  // Never infer deletions from a device's local list: Owner and Staff may have
  // different local snapshots. Explicit deletes are sent by the delete handler.
  lastCatalogIds = desired;
  explicitOwnerDeletePending = false;
  syncStatus(`Cloud sync complete: ${desired.size} named ticket types published.`);
}
function queueCatalogPublish(event) {
  if (!role) {
    // Ticket edits can happen while Firebase is still restoring the Owner session.
    pendingCatalogPublish = true;
    return;
  }
  // Staff sessions are not allowed to publish or delete the Owner catalog.
  if (role !== "owner" || auth.currentUser?.email?.toLowerCase() !== OWNER) return;
  const detail = event?.detail || {};
  if (detail.action === "delete") {
    const ticket = detail.ticket;
    // Legacy catalog records may use an older document ID than sharedCatalogId
    // or the current slot-based ID. Remove every exact identity/name match so a
    // later catalog snapshot cannot resurrect the deleted Owner ticket.
    (async () => {
      if (!ticket) return;
      const snapshot = await getDocsFromServer(collection(db, "sharedTicketCatalog"));
      // Delete only records linked by stable identity. Name-based deletion is
      // unsafe: two different ticket types can share a name, and deleting one
      // must never remove the other from every Staff account.
      // Only delete a known catalog identity or records whose sourceTicketId
      // matches this exact ticket. Never delete a slot-derived ID blindly: the
      // same slot may now belong to a different ticket after reordering.
      const idsToDelete = new Set();
      for (const item of snapshot.docs) {
        const data = item.data();
        const sameSource = data.departmentId === ticket.departmentId &&
          String(data.sourceTicketId || "") === String(ticket.id);
        // A legacy sharedCatalogId may be a reused slot ID. Trust it only when
        // the stored source identity agrees; never delete a newer ticket that
        // happens to occupy the same old catalog document ID.
        const exactKnownIdentity = item.id === ticket.sharedCatalogId &&
          data.departmentId === ticket.departmentId &&
          (!data.sourceTicketId || String(data.sourceTicketId) === String(ticket.id));
        if (sameSource || exactKnownIdentity) idsToDelete.add(item.id);
      }
      await Promise.all([...idsToDelete].map(id => deleteDoc(doc(db, "sharedTicketCatalog", id))));
      syncStatus("Deleted ticket and matching legacy cloud catalog records.");
    })().catch(err => syncStatus(`Ticket delete sync failed: ${err?.code || err?.message || "unknown error"}`, true));
    return;
  }
  // A saved ticket must reach Firestore immediately; do not rely on the next page load.
  clearTimeout(publishTimer);
  publishTimer = setTimeout(() => publishOwnerCatalog().catch(err => syncStatus(`Catalog publish failed: ${err?.code || err?.message || "unknown error"}`, true)), 100);
}
// Register before auth finishes so an early Owner edit is not lost.
document.addEventListener("ticketdesk-local-ticket-changed", queueCatalogPublish);

async function applyCatalog(snapshot) {
  await waitForLocalStore();
  const store = window.ticketdeskLocalStore;
  const localTickets = await store.all("tickets");
  const remoteRecords = snapshot.docs.map(d => ({ ...d.data(), cloudDocId: d.id }));
  let catalogChanged = false;
  const nextIds = new Set(remoteRecords.map(x => x.cloudDocId));
  // One local ticket must map to at most one cloud record. Without this guard,
  // two cloud tickets with the same name (or legacy source IDs) can both match
  // the same local ticket, leaving Staff with one fewer ticket type than Owner.
  const claimedLocalIds = new Set();
  const isUnclaimed = ticket => ticket && !claimedLocalIds.has(String(ticket.id));
  for (const remote of remoteRecords) {
    if (!DEPTS.includes(remote.departmentId) || !remote.name) continue;
    let local = localTickets.find(t => isUnclaimed(t) && t.sharedCatalogId === remote.cloudDocId);
    // Prefer stable identity and exact name matches. Slot numbers are only a
    // fallback for an empty local starter slot; matching a named ticket by
    // position can overwrite it when old data contains duplicate slot numbers.
    if (!local && remote.sourceTicketId) {
      local = localTickets.find(t => isUnclaimed(t) && t.departmentId === remote.departmentId && String(t.id) === String(remote.sourceTicketId));
    }
    // Never use ticket name as identity. Duplicate names are valid ticket types;
    // matching by name merges them and makes Staff show fewer types than Owner.
    if (!local && Number.isInteger(remote.slotNumber)) {
      local = localTickets.find(t => isUnclaimed(t) && t.departmentId === remote.departmentId && t.slotNumber === remote.slotNumber && !String(t.name || "").trim());
    }
    if (local) claimedLocalIds.add(String(local.id));
    const sharedImageId = `shared-img-${remote.cloudDocId}`;
    if (remote.imageData) await store.put("images", { id: sharedImageId, data: remote.imageData, shared: true, updatedAt: remote.updatedAt || new Date().toISOString() });
    if (local) {
      const updated = { ...local, sharedCatalogId: remote.cloudDocId, sharedFromOwner: true, slotNumber: Number.isInteger(remote.slotNumber) ? remote.slotNumber : local.slotNumber, name: remote.name, notes: remote.notes || "", inventory: remote.inventory ?? local.inventory, updatedAt: remote.updatedAt || local.updatedAt };
      if (remote.imageData) updated.imageId = sharedImageId;
      else if (String(local.imageId || "").startsWith("shared-img-")) { await store.del("images", local.imageId); updated.imageId = null; }
      if (JSON.stringify(local) !== JSON.stringify(updated)) {
        await store.put("tickets", updated);
        const localIndex = localTickets.findIndex(t => t.id === local.id);
        if (localIndex >= 0) localTickets[localIndex] = updated;
        catalogChanged = true;
      }
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
  // Never remove shared tickets based on a cached/offline catalog snapshot.
  // Firestore may first emit a cache view that is incomplete or stale; treating
  // it as authoritative makes Owner tickets flicker or disappear on Staff.
  const possibleMissingSharedTicket = localTickets.some(local =>
    local.sharedFromOwner === true && local.sharedCatalogId && !nextIds.has(local.sharedCatalogId)
  );
  if (possibleMissingSharedTicket && !snapshot.metadata?.fromCache && !snapshot.metadata?.hasPendingWrites) {
    // Only pay for a second server read when this snapshot appears to omit an
    // existing shared ticket. Normal quantity/catalog updates avoid this extra
    // network round-trip; suspected deletions still require server confirmation.
    const confirmedSnapshot = await getDocsFromServer(collection(db, "sharedTicketCatalog"));
    const confirmedIds = new Set(confirmedSnapshot.docs.map(d => d.id));
    for (const local of localTickets) {
      if (local.sharedFromOwner === true && local.sharedCatalogId && !confirmedIds.has(local.sharedCatalogId)) {
        if (String(local.imageId || "").startsWith("shared-img-")) await store.del("images", local.imageId);
        await store.del("tickets", local.id);
        catalogChanged = true;
      }
    }
  }
  lastCatalogIds = nextIds;
  if (catalogChanged) {
    window.ticketdeskLocalStore.refresh?.();
    document.dispatchEvent(new Event("ticketdesk-cloud-catalog-updated"));
  }
  return catalogChanged;
}
function dailyDocId(departmentId, ticketId, date) {
  return `${departmentId}__${ticketId}__${date}`.replaceAll("/", "_");
}
async function publishDaily(record) {
  if (!auth.currentUser || !record || !DEPTS.includes(record.departmentId) || !record.date || !record.ticketId) return;
  // Client-side guard: ordinary Staff may publish only their assigned department.
  // Firestore Rules must enforce the same boundary server-side before this is secure.
  if (role === "staff") {
    const session = staffSession();
    if (!session || (session.department !== "leader" && session.department !== record.departmentId)) {
      syncStatus("Daily sync blocked: this Staff account cannot update that department.", true);
      return;
    }
  }
  await waitForLocalStore();
  const store = window.ticketdeskLocalStore;
  const ticket = await store.get("tickets", record.ticketId);
  const catalogTicketId = ticket?.sharedCatalogId || (ticket ? slotCatalogId(ticket) : (String(record.ticketId).startsWith("shared-") ? String(record.ticketId).slice(7) : String(record.ticketId)));
  const ref = doc(db, "sharedDaily", dailyDocId(record.departmentId, catalogTicketId, record.date));
  const proposedTime = Date.parse(record.updatedAt || "") || Date.now();
  const payload = {
    id: dailyDocId(record.departmentId, catalogTicketId, record.date),
    ticketId: catalogTicketId,
    departmentId: record.departmentId,
    date: record.date,
    quantity: Math.max(0, Math.trunc(Number(record.quantity) || 0)),
    notes: String(record.notes || "").slice(0, 1000),
    updatedAt: new Date(proposedTime).toISOString(),
    sourceUid: auth.currentUser.uid,
    sourceName: staffSession()?.name || auth.currentUser.email || "Owner"
  };
  // Serialize concurrent writes so a delayed older device cannot replace a newer quantity.
  await runTransaction(db, async transaction => {
    const current = await transaction.get(ref);
    const currentTime = Date.parse(current.data()?.updatedAt || "") || 0;
    if (current.exists() && currentTime > proposedTime) return;
    transaction.set(ref, payload);
  });
}
async function publishReset(detail) {
  if (!detail || !Array.isArray(detail.records)) return;
  for (const rec of detail.records) await publishDaily({ ...rec, quantity: 0, updatedAt: new Date().toISOString() });
}

// Publish existing Owner daily quantities on sign-in. Skip cloud records that
// are at least as new, so stale local data cannot overwrite newer shared data.
async function publishExistingOwnerDaily() {
  if (role !== "owner" || !auth.currentUser || auth.currentUser.email?.toLowerCase() !== OWNER) return;
  await waitForLocalStore();
  const store = window.ticketdeskLocalStore;
  const results = await Promise.all([store.all("daily"), getDocsFromServer(collection(db, "sharedDaily")), store.all("tickets")]);
  const records = results[0], cloudSnapshot = results[1], tickets = results[2];
  const cloudById = new Map(cloudSnapshot.docs.map(d => [d.id, d.data()]));
  const ticketById = new Map(tickets.map(t => [t.id, t]));
  for (const record of records) {
    if (!record || !DEPTS.includes(record.departmentId) || !record.date || !record.ticketId) continue;
    const ticket = ticketById.get(record.ticketId);
    if (!ticket || !String(ticket.name || "").trim()) continue;
    const cloudTicketId = ticket.sharedCatalogId || slotCatalogId(ticket);
    const cloudId = dailyDocId(record.departmentId, cloudTicketId, record.date);
    const remote = cloudById.get(cloudId);
    const localTime = Date.parse(record.updatedAt || "") || 0;
    const remoteTime = Date.parse(remote?.updatedAt || "") || 0;
    if (remote && remoteTime >= localTime) continue;
    await publishDaily({ ...record, ticketId: ticket.id });
  }
}
async function applyDaily(snapshot, retryAfterCatalog = true) {
  if (role !== "owner" && role !== "staff") return;
  await waitForLocalStore();
  const store = window.ticketdeskLocalStore;
  let tickets = await store.all("tickets");
  let dailyChanged = false;
  let missingTicketMatch = false;
  for (const d of snapshot.docs) {
    const remote = d.data();
    if (!DEPTS.includes(remote.departmentId) || !remote.date || !remote.ticketId) continue;
    // Keep regular Staff local records scoped to their own department; Leaders
    // and Owner can reconcile all departments.
    if (role === "staff") {
      const session = staffSession();
      if (!session || (session.department !== "leader" && session.department !== remote.departmentId)) continue;
    }
    const ticket = tickets.find(t => t.sharedCatalogId === remote.ticketId || t.id === remote.ticketId || t.id === `shared-${remote.ticketId}` || slotCatalogId(t) === remote.ticketId);
    if (!ticket) { missingTicketMatch = true; continue; }
    const id = `${ticket.id}__${remote.date}`;
    const nextRecord = {
      id, ticketId: ticket.id, departmentId: remote.departmentId, date: remote.date,
      quantity: Math.max(0, Math.trunc(Number(remote.quantity) || 0)),
      notes: remote.notes || "", updatedAt: remote.updatedAt || new Date().toISOString(),
      sourceUid: remote.sourceUid, sourceName: remote.sourceName || ""
    };
    const current = await store.get("daily", id);
    const currentTime = Date.parse(current?.updatedAt || "") || 0;
    const remoteTime = Date.parse(nextRecord.updatedAt || "") || 0;
    // Firestore can deliver queued snapshots after a newer write. Never let
    // an older snapshot roll back the visible quantity on this device.
    if (current && currentTime > remoteTime) continue;
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
  // A new/old Staff device can receive quantity snapshots before its catalog
  // mapping is ready. Reconcile the catalog once, then replay this exact snapshot
  // so those quantities are not silently skipped until a later Firestore event.
  if (missingTicketMatch && retryAfterCatalog && role === "staff" && auth.currentUser) {
    try {
      const catalog = await getDocsFromServer(collection(db, "sharedTicketCatalog"));
      await applyCatalog(catalog);
      await applyDaily(snapshot, false);
    } catch (err) {
      syncStatus("Some quantities are waiting for ticket catalog mapping: " + (err?.code || err?.message || "sync error"), true);
    }
  }
}
// Firestore listeners provide live updates. These safe pull checks recover from
// temporary mobile-network/background-tab gaps without requiring a page refresh.
let recoverySyncRunning = false;
async function recoverCloudSync() {
  if (recoverySyncRunning || !auth.currentUser || !started || (role !== "owner" && role !== "staff")) return;
  recoverySyncRunning = true;
  try {
    // Owner is the source of truth for ticket definitions. Never apply a remote
    // catalog snapshot back onto Owner's local ticket list during recovery.
    if (role === "owner") {
      await publishOwnerCatalog();
      await publishExistingOwnerDaily();
    } else {
      const catalog = await getDocsFromServer(collection(db, "sharedTicketCatalog"));
      await applyCatalog(catalog);
      const daily = await getDocsFromServer(collection(db, "sharedDaily"));
      await applyDaily(daily);
    }
    syncStatus("Cloud sync connected; latest tickets and quantities checked.");
  } catch (err) {
    syncStatus("Cloud reconnect sync failed: " + (err?.code || err?.message || "network error"), true);
  } finally { recoverySyncRunning = false; }
}
window.addEventListener("online", () => {
  if (role === "owner") publishOwnerCatalog().catch(err => syncStatus("Owner reconnect publish failed: " + (err?.code || err?.message || "unknown error"), true));
  recoverCloudSync();
});
window.addEventListener("focus", () => {
  if (role === "owner") publishOwnerCatalog().catch(err => syncStatus("Owner focus publish failed: " + (err?.code || err?.message || "unknown error"), true));
  recoverCloudSync();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (role === "owner") publishOwnerCatalog().catch(err => syncStatus("Owner visibility publish failed: " + (err?.code || err?.message || "unknown error"), true));
  recoverCloudSync();
});
// Backgrounded iPhone browsers may suspend listeners. Reconcile once per minute
// while the page is visible; realtime snapshots remain the primary update path.
setInterval(() => { if (document.visibilityState === "visible") recoverCloudSync(); }, 30000);

function startOwner() {
  if (role === "owner") return;
  role = "owner"; started = true;
  document.addEventListener("ticketdesk-daily-changed", e => publishDaily(e.detail).catch(err => console.error("Daily sync failed:", err)));
  document.addEventListener("ticketdesk-daily-reset", e => publishReset(e.detail).catch(err => syncStatus(`Daily reset sync failed: ${err?.code || err?.message || "unknown error"}`, true)));
  syncStatus("Owner connected; checking local and shared ticket catalog…");
  waitForLocalStore().then(async () => {
    const store = window.ticketdeskLocalStore;
    const localTickets = (await store.all("tickets")).filter(t => t && DEPTS.includes(t.departmentId) && String(t.name || "").trim());
    // A newly used Owner device can have an empty local database even though the
    // shared cloud catalog already contains the ticket definitions. Restore only
    // in that empty-local case; never overwrite an existing Owner catalog.
    if (!localTickets.length) {
      const remoteCatalog = await getDocsFromServer(collection(db, "sharedTicketCatalog"));
      if (!remoteCatalog.empty) {
        await applyCatalog(remoteCatalog);
        syncStatus("Restored Owner ticket catalog from shared cloud data.");
      }
    }
    await publishOwnerCatalog();
    if (pendingCatalogPublish) { pendingCatalogPublish = false; await publishOwnerCatalog(); }
    await publishExistingOwnerDaily();
    syncStatus("Owner catalog and existing daily quantities synced.");
  }).catch(err => syncStatus("Initial Owner sync failed: " + (err?.code || err?.message || "unknown error"), true));
  stopCatalog = onSnapshot(collection(db, "sharedTicketCatalog"), snapshot => { lastCatalogIds = new Set(snapshot.docs.map(d => d.id)); syncStatus("Owner catalog snapshot observed; local Owner tickets remain authoritative."); }, err => syncStatus(`Owner catalog listener failed: ${err?.code || err?.message || "unknown error"}`, true));
  stopDaily = onSnapshot(collection(db, "sharedDaily"), snapshot => queueLatestSnapshot("daily", snapshot), err => syncStatus(`Daily sync listener failed: ${err?.code || err?.message || "unknown error"}`, true));
}
let staffHeartbeatTimer = null;
async function updateStaffHeartbeat(){
 const session=staffSession(),user=auth.currentUser;
 if(role!=="staff"||!session||!user?.isAnonymous||document.visibilityState!=="visible")return;
 try{await setDoc(doc(db,"staffDirectory",session.uid),{uid:session.uid,name:session.name,department:session.department,lastSeenAt:serverTimestamp(),lastSeenClientTime:new Date().toISOString(),loginCount:1,source:"staff-share-link"},{merge:true});}
 catch(err){console.warn("Staff live status heartbeat failed:",err?.code||err?.message||err);}
}
function startStaff() {
  if (started || !auth.currentUser) return;
  role = "staff"; started = true;
  syncStatus("Staff connected; loading shared ticket catalog…");
  updateStaffHeartbeat();
  staffHeartbeatTimer = setInterval(updateStaffHeartbeat, 45000);
  document.addEventListener("visibilitychange", updateStaffHeartbeat);
  stopCatalog = onSnapshot(collection(db, "sharedTicketCatalog"), { includeMetadataChanges: true }, snapshot => queueLatestSnapshot("catalog", snapshot), err => syncStatus(`Staff catalog listener failed: ${err?.code || err?.message || "unknown error"}`, true));
  stopDaily = onSnapshot(collection(db, "sharedDaily"), { includeMetadataChanges: true }, snapshot => queueLatestSnapshot("daily", snapshot), err => syncStatus(`Staff quantity listener failed: ${err?.code || err?.message || "unknown error"}`, true));
  document.addEventListener("ticketdesk-daily-changed", e => publishDaily(e.detail).catch(err => syncStatus(`Daily publish failed: ${err?.code || err?.message || "unknown error"}`, true)));
  document.addEventListener("ticketdesk-daily-reset", e => publishReset(e.detail).catch(err => console.error("Daily reset sync failed:", err)));
}
onAuthStateChanged(auth, user => {
  // Staff identity takes priority over any restored Owner session on this browser.
  // Never initialize Owner cloud listeners while a Staff session is active.
  if (staffSession()) {
    if (user && !user.isAnonymous) {
      signOut(auth).catch(err => syncStatus(`Could not separate Staff/Owner auth: ${err?.code || err?.message || "unknown error"}`, true));
      return;
    }
    if (user?.isAnonymous) { startStaff(); return; }
    if (!signingInAnonymously) {
      signingInAnonymously = true;
      signInAnonymously(auth).then(() => startStaff()).catch(err => syncStatus(`Staff cloud authentication failed: ${err?.code || err?.message || "unknown error"}`, true)).finally(() => { signingInAnonymously = false; });
    }
    return;
  }
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
