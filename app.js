// Duo · แอปบันทึกค่าใช้จ่ายและแผนเที่ยวสำหรับ 2 คน
// ใช้ Firebase SDK จาก CDN ไม่ต้องติดตั้งอะไร
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, query, where, orderBy, limit, onSnapshot, getDocs, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";
import { firebaseConfig, MEMBERS, APP_CHECK_SITE_KEY, SPACE } from "./config.js";

// ---------- Firebase ----------
const app = initializeApp(firebaseConfig);
if (APP_CHECK_SITE_KEY) {
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
}
const auth = getAuth(app);
// เก็บข้อมูลไว้ในเครื่องด้วย: เปิดแอปตอนไม่มีเน็ตได้ และรายการที่เพิ่มจะถูกส่งเมื่อกลับมาออนไลน์
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// ---------- ข้อมูลคงที่ ----------
const CATEGORIES = [
  { id: "food", label: "Food & drinks", short: "Food", color: "#E07A5F", path: "M4 3v8a3 3 0 006 0V3M7 3v18M17 3c-2 2-3 5-3 8h3v10" },
  { id: "home", label: "Home & bills", short: "Home", color: "#7A5BA8", path: "M3 11l9-7 9 7v9H3z" },
  { id: "transport", label: "Transport", short: "Transport", color: "#3B78B5", path: "M6 4h12a2 2 0 012 2v9H4V6a2 2 0 012-2zM4 11h16M7 20l2-5M17 20l-2-5" },
  { id: "shopping", label: "Shopping", short: "Shopping", color: "#C9A227", path: "M5 8h14l-1 12H6zM9 8a3 3 0 016 0" },
  { id: "fun", label: "Fun & going out", short: "Fun", color: "#2E9E83", path: "M4 7h16v4a2 2 0 000 4v4H4v-4a2 2 0 000-4z" },
  { id: "health", label: "Health", short: "Health", color: "#D4577A", path: "M12 5v14M5 12h14" },
  { id: "travel", label: "Travel", short: "Travel", color: "#4F6D7A", path: "M2 16l20-7-6 11-3-5z" },
  { id: "other", label: "Other", short: "Other", color: "#8A938E", path: "M6 12h.01M12 12h.01M18 12h.01" },
];
const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
const nameOf = (email) => (MEMBERS.find((m) => m.email === email) || { name: email || "Someone" }).name;

// ---------- ตัวช่วย ----------
const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, "0");
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const baht = (n) => "฿" + Math.round(n).toLocaleString("en-US");

// สร้าง element แบบปลอดภัย: ข้อความทุกอย่างใส่ด้วย textContent กัน XSS
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.setAttribute("style", v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
function icon(path, color = "currentColor", size = 20) {
  const NS = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color,
    "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) s.setAttribute(k, v);
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", path);
  s.append(p);
  return s;
}
function show(id) {
  for (const s of ["loading", "login", "denied", "app"]) $("#" + s).hidden = s !== id;
}
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4000);
}
function handleError(err) {
  console.error(err);
  if (err?.code === "permission-denied") toast("Not allowed: this change was blocked by the security rules.");
  else toast("Something went wrong: " + (err?.message || err));
}
const timeLabel = (ts) =>
  ts?.toDate ? ts.toDate().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "just now";

// ---------- สถานะ ----------
const state = {
  user: null,
  y: new Date().getFullYear(),
  m: new Date().getMonth(),
  expenses: [],
  activities: [],
  tripFilter: "planned",
  unsubExpenses: null,
  unsubActivities: null,
};

// ---------- ล็อกอิน ----------
$("#signin").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    if (err?.code === "auth/unauthorized-domain") toast("Add this website's domain in Firebase → Authentication → Settings → Authorized domains.");
    else if (err?.code !== "auth/popup-closed-by-user") handleError(err);
  }
});
for (const id of ["#signout-denied", "#nav-signout"]) $(id).addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  state.user = user;
  stopListening();
  if (!user) return show("login");
  // ตรวจในหน้าแอปเพื่อแสดงข้อความ (ด่านจริงคือ Security Rules ฝั่ง Google)
  if (!MEMBERS.some((m) => m.email === user.email)) {
    $("#denied-text").textContent = `${user.email} isn't one of the two members of this app.`;
    return show("denied");
  }
  show("app");
  listenExpenses();
  listenActivities();
});

function stopListening() {
  state.unsubExpenses?.();
  state.unsubActivities?.();
  state.unsubExpenses = state.unsubActivities = null;
}

// ---------- อ่านข้อมูลแบบ realtime ----------
function monthRange() {
  const start = `${state.y}-${pad(state.m + 1)}-01`;
  const end = state.m === 11 ? `${state.y + 1}-01-01` : `${state.y}-${pad(state.m + 2)}-01`;
  return [start, end];
}
function listenExpenses() {
  state.unsubExpenses?.();
  const [start, end] = monthRange();
  const q = query(
    collection(db, "spaces", SPACE, "transactions"),
    where("date", ">=", start), where("date", "<", end), orderBy("date", "desc"),
  );
  renderMoney(true);
  state.unsubExpenses = onSnapshot(q, (snap) => {
    state.expenses = snap.docs
      .map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))
      .filter((x) => !x.deleted);
    renderMoney();
  }, handleError);
}
function listenActivities() {
  state.unsubActivities = onSnapshot(collection(db, "spaces", SPACE, "activities"), (snap) => {
    state.activities = snap.docs
      .map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))
      .filter((x) => !x.deleted)
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.title.localeCompare(b.title));
    renderTrips();
  }, handleError);
}

// ---------- บันทึกข้อมูล + ประวัติ (สำเร็จหรือล้มเหลวพร้อมกัน) ----------
function saveDoc(kind, existing, fields) {
  const u = auth.currentUser;
  const colRef = collection(db, "spaces", SPACE, kind);
  const ref = existing ? doc(colRef, existing.id) : doc(colRef);
  const now = serverTimestamp();
  const stamp = { updatedBy: u.uid, updatedByEmail: u.email, updatedAt: now };
  const batch = writeBatch(db);
  let action = "create";
  let changes = fields;
  if (!existing) {
    batch.set(ref, { ...fields, ...stamp, createdBy: u.uid, createdByEmail: u.email, createdAt: now, deleted: false });
  } else {
    changes = {};
    for (const [k, v] of Object.entries(fields)) {
      if (existing[k] !== v) changes[k] = { from: existing[k] ?? null, to: v };
    }
    if (!Object.keys(changes).length) return;
    batch.update(ref, { ...fields, ...stamp });
    action = fields.deleted ? "delete" : "update";
  }
  batch.set(doc(collection(ref, "history")), { by: u.uid, byEmail: u.email, at: now, action, changes });
  // ไม่รอผลจากเซิร์ฟเวอร์: หน้าจออัปเดตทันที ถ้าออฟไลน์จะส่งให้เองภายหลัง
  batch.commit().catch(handleError);
}

// ---------- หน้า Money ----------
$("#prev-month").addEventListener("click", () => moveMonth(-1));
$("#next-month").addEventListener("click", () => moveMonth(1));
function moveMonth(step) {
  state.m += step;
  if (state.m < 0) { state.m = 11; state.y--; }
  if (state.m > 11) { state.m = 0; state.y++; }
  listenExpenses();
}

function renderMoney(loading = false) {
  $("#month-label").textContent = new Date(state.y, state.m, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  const body = $("#money-body");
  body.replaceChildren();
  if (loading) { body.append(h("p", { class: "muted" }, "Loading…")); return; }

  const list = state.expenses;
  const total = list.reduce((s, x) => s + x.amount, 0);
  const paid = MEMBERS.map((m) => list.filter((x) => x.paidBy === m.email).reduce((s, x) => s + x.amount, 0));

  // การ์ดสรุป
  const diff = paid[0] - total / 2;
  const owe = Math.abs(diff) < 1 ? "You're even this month"
    : diff > 0 ? `${MEMBERS[1].name} owes ${MEMBERS[0].name} ${baht(diff)} to split evenly`
      : `${MEMBERS[0].name} owes ${MEMBERS[1].name} ${baht(-diff)} to split evenly`;
  body.append(h("div", { class: "summary" },
    h("div", { class: "row between end" },
      h("div", { class: "col" }, h("span", { class: "on-dark-muted small" }, "Spent this month"), h("span", { class: "big" }, baht(total))),
      h("span", { class: "on-dark-muted small" }, `${list.length} expense${list.length === 1 ? "" : "s"}`)),
    h("div", { class: "grid2" }, MEMBERS.map((m, i) =>
      h("div", { class: "col" }, h("span", { class: "on-dark-muted small" }, `${m.name} paid`), h("strong", {}, baht(paid[i]))))),
    h("div", { class: "owe" }, owe)));

  if (!list.length) {
    body.append(h("div", { class: "card empty" }, "No expenses this month yet. Tap + to add the first one."));
    return;
  }

  // แยกตามหมวด
  const byCat = CATEGORIES.map((c) => ({ ...c, sum: list.filter((x) => x.category === c.id).reduce((s, x) => s + x.amount, 0) }))
    .filter((c) => c.sum > 0).sort((a, b) => b.sum - a.sum);
  body.append(h("div", { class: "card" },
    h("div", { class: "row between" }, h("h2", {}, "By category"), h("span", { class: "muted small" }, `${byCat.length} categories`)),
    h("div", { class: "bar", role: "img", "aria-label": "Share of spending by category" },
      byCat.map((c) => h("span", { style: `flex:${c.sum};background:${c.color}` }))),
    h("div", { class: "stack8" }, byCat.map((c) =>
      h("div", { class: "cat-row" },
        h("span", { class: "dot", style: `background:${c.color}` }),
        h("span", {}, c.label),
        h("span", { class: "muted right" }, Math.round((c.sum / total) * 100) + "%"),
        h("strong", { class: "right" }, baht(c.sum)))))));

  // รายการแยกตามวัน
  const today = toDateStr(new Date());
  const days = [...new Set(list.map((x) => x.date))];
  for (const d of days) {
    const label = d === today ? "TODAY" : new Date(d + "T00:00").toLocaleString("en-US", { day: "numeric", month: "short" }).toUpperCase();
    body.append(h("p", { class: "day" }, label));
    body.append(h("div", { class: "card list" }, list.filter((x) => x.date === d).map(expenseRow)));
  }
}

function expenseRow(x) {
  const c = catOf(x.category);
  const edited = x.updatedAt && x.createdAt && x.updatedAt.toMillis() - x.createdAt.toMillis() > 2000;
  return h("button", { class: "item", onclick: () => openExpense(x) },
    h("span", { class: "cat-icon", style: `background:${c.color}` }, icon(c.path, "#fff", 18)),
    h("span", { class: "col grow" },
      h("strong", {}, x.note || c.label),
      h("span", { class: "muted small" }, `${c.label} · paid by ${nameOf(x.paidBy)}`),
      edited ? h("span", { class: "edited" }, `Edited by ${nameOf(x.updatedByEmail)} · ${timeLabel(x.updatedAt)}`) : null),
    h("strong", {}, baht(x.amount)));
}

// ---------- ฟอร์มรายจ่าย ----------
$("#fab").addEventListener("click", () => openExpense(null));

function openExpense(existing) {
  const x = existing || { amount: "", category: "food", paidBy: state.user.email, note: "", date: toDateStr(new Date()) };
  let category = x.category;
  let paidBy = x.paidBy;
  const sheet = $("#sheet");

  const amount = h("input", { id: "f-amount", type: "number", inputmode: "decimal", min: "0", step: "any", value: x.amount, required: true, class: "amount" });
  const note = h("input", { id: "f-note", type: "text", maxlength: "200", value: x.note || "", placeholder: "e.g. Dinner at the night market" });
  const date = h("input", { id: "f-date", type: "date", value: x.date, required: true });

  const catGrid = h("div", { class: "cat-grid" });
  const drawCats = () => catGrid.replaceChildren(...CATEGORIES.map((c) =>
    h("button", { type: "button", class: "cat-btn" + (c.id === category ? " on" : ""), "aria-pressed": String(c.id === category),
      onclick: () => { category = c.id; drawCats(); } },
    h("span", { class: "cat-icon", style: `background:${c.color}` }, icon(c.path, "#fff", 18)), c.short)));
  drawCats();

  const payGrid = h("div", { class: "grid2" });
  const drawPay = () => payGrid.replaceChildren(...MEMBERS.map((m) =>
    h("button", { type: "button", class: "choice" + (m.email === paidBy ? " on" : ""), "aria-pressed": String(m.email === paidBy),
      onclick: () => { paidBy = m.email; drawPay(); } }, m.name)));
  drawPay();

  const history = h("div", { class: "stack8" });
  const form = h("form", { class: "sheet-body", method: "dialog" },
    h("div", { class: "row between" },
      h("h2", {}, existing ? "Edit expense" : "Add expense"),
      h("button", { type: "button", class: "icon-btn", "aria-label": "Close", onclick: () => sheet.close() }, "✕")),
    h("label", { for: "f-amount", class: "label center-text" }, "Amount (฿)"), amount,
    h("span", { class: "label" }, "Category"), catGrid,
    h("span", { class: "label" }, "Paid by"), payGrid,
    h("label", { for: "f-note", class: "label" }, "Note"), note,
    h("label", { for: "f-date", class: "label" }, "Date"), date,
    existing ? h("p", { class: "muted small" },
      `Added by ${nameOf(existing.createdByEmail)} · ${timeLabel(existing.createdAt)}`) : null,
    existing ? history : null,
    h("button", { type: "submit", class: "btn btn-primary" }, "Save"),
    existing ? h("button", { type: "button", class: "btn btn-danger", onclick: () => {
      if (!confirm("Delete this expense? It stays in the history and can be restored.")) return;
      saveDoc("transactions", existing, { deleted: true });
      sheet.close();
    } }, "Delete") : null);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = Number(amount.value);
    if (!(value > 0)) { toast("Enter an amount greater than 0."); amount.focus(); return; }
    if (!date.value) { toast("Pick a date."); return; }
    saveDoc("transactions", existing, { amount: value, category, paidBy, note: note.value.trim().slice(0, 200), date: date.value });
    sheet.close();
  });

  sheet.replaceChildren(form);
  sheet.showModal();
  if (existing) loadHistory("transactions", existing.id, history);
  else amount.focus();
}

async function loadHistory(kind, id, box) {
  box.append(h("span", { class: "label" }, "History"));
  try {
    const snap = await getDocs(query(collection(db, "spaces", SPACE, kind, id, "history"), orderBy("at", "desc"), limit(10)));
    for (const d of snap.docs) {
      const r = d.data({ serverTimestamps: "estimate" });
      const what = r.action === "update"
        ? Object.entries(r.changes || {}).map(([k, v]) => `${k}: ${v.from ?? "—"} → ${v.to}`).join(", ")
        : r.action;
      box.append(h("p", { class: "history" }, `${timeLabel(r.at)} · ${nameOf(r.byEmail)} · ${what}`));
    }
  } catch (err) { handleError(err); }
}

// ---------- หน้า Trips ----------
$("#nav-money").addEventListener("click", () => switchTab("money"));
$("#nav-trips").addEventListener("click", () => switchTab("trips"));
$("#add-trip").addEventListener("click", () => openActivity(null));
$("#f-planned").addEventListener("click", () => { state.tripFilter = "planned"; renderTrips(); });
$("#f-done").addEventListener("click", () => { state.tripFilter = "done"; renderTrips(); });

function switchTab(tab) {
  $("#money").hidden = tab !== "money";
  $("#trips").hidden = tab !== "trips";
  $("#fab").hidden = tab !== "money";
  $("#nav-money").classList.toggle("active", tab === "money");
  $("#nav-trips").classList.toggle("active", tab === "trips");
}

function renderTrips() {
  const planned = state.activities.filter((a) => !a.done);
  const done = state.activities.filter((a) => a.done);
  $("#f-planned").textContent = `Planned · ${planned.length}`;
  $("#f-done").textContent = `Done · ${done.length}`;
  $("#f-planned").classList.toggle("on", state.tripFilter === "planned");
  $("#f-done").classList.toggle("on", state.tripFilter === "done");
  const items = state.tripFilter === "planned" ? planned : done;
  const body = $("#trips-body");
  body.replaceChildren();
  if (!items.length) {
    body.append(h("div", { class: "card empty" }, state.tripFilter === "planned" ? "No plans yet. Tap + to add one." : "Nothing marked done yet."));
    return;
  }
  for (const a of items) {
    const when = a.date ? new Date(a.date + "T00:00").toLocaleString("en-US", { day: "numeric", month: "short" }).toUpperCase() : "NO DATE YET";
    const box = h("input", { type: "checkbox", "aria-label": `Mark ${a.title} done` });
    box.checked = !!a.done;
    box.addEventListener("change", () => saveDoc("activities", a, { done: box.checked }));
    body.append(h("div", { class: "trip" + (a.done ? " is-done" : "") },
      h("button", { class: "trip-main", onclick: () => openActivity(a) },
        h("span", { class: "trip-date" }, when),
        h("strong", { class: "trip-title" }, a.title),
        h("span", { class: "muted small" }, [a.place, `added by ${nameOf(a.createdByEmail)}`].filter(Boolean).join(" · "))),
      h("label", { class: "check" }, box)));
  }
}

function openActivity(existing) {
  const a = existing || { title: "", place: "", date: "", done: false };
  const sheet = $("#sheet");
  const title = h("input", { id: "a-title", type: "text", maxlength: "100", value: a.title, required: true, placeholder: "e.g. Khao Yai weekend" });
  const place = h("input", { id: "a-place", type: "text", maxlength: "100", value: a.place || "", placeholder: "Where" });
  const date = h("input", { id: "a-date", type: "date", value: a.date || "" });
  const history = h("div", { class: "stack8" });
  const form = h("form", { class: "sheet-body", method: "dialog" },
    h("div", { class: "row between" },
      h("h2", {}, existing ? "Edit plan" : "Add plan"),
      h("button", { type: "button", class: "icon-btn", "aria-label": "Close", onclick: () => sheet.close() }, "✕")),
    h("label", { for: "a-title", class: "label" }, "What"), title,
    h("label", { for: "a-place", class: "label" }, "Place"), place,
    h("label", { for: "a-date", class: "label" }, "Date (optional)"), date,
    existing ? history : null,
    h("button", { type: "submit", class: "btn btn-primary" }, "Save"),
    existing ? h("button", { type: "button", class: "btn btn-danger", onclick: () => {
      if (!confirm("Delete this plan?")) return;
      saveDoc("activities", existing, { deleted: true });
      sheet.close();
    } }, "Delete") : null);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const t = title.value.trim();
    if (!t) { toast("Give the plan a name."); title.focus(); return; }
    saveDoc("activities", existing, { title: t, place: place.value.trim(), date: date.value || "", done: !!a.done });
    sheet.close();
  });
  sheet.replaceChildren(form);
  sheet.showModal();
  if (existing) loadHistory("activities", existing.id, history);
  else title.focus();
}
