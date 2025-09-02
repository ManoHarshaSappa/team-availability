// ========= Team Availability — app.js =========

// --- CONFIG ---
const API_URL = "/api/availability"; // Vercel serverless route that reads/writes availability.json in your repo
const DEFAULT_USERS = ["Harsha","Sarmad","Sneha Deshpande","Vinay","Bhavishya"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const START_MIN = 0;                     // 00:00
const END_MIN   = 24 * 60;               // 24h
const STEP_MIN  = 30;                    // 30-min slots
const SLOTS     = Math.floor((END_MIN - START_MIN) / STEP_MIN);

// --- Shortcuts ---
const $ = (id) => document.getElementById(id);
const setStatus = (t) => { const el = $("status"); if (el) el.textContent = t; };

// --- Time labels ---
function minutesToLabel(m) {
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const am = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${mm.toString().padStart(2, "0")} ${am}`;
}

// --- State ---
let state = { users: {}, log: [] };
const blankWeek = () =>
  Object.fromEntries(Array.from({ length: 7 }, (_, d) => [`d${d}`, Array.from({ length: SLOTS }, () => 0)]));

function ensureUser(name) {
  if (!state.users[name]) state.users[name] = blankWeek();
}

// --- Initialize dropdowns (5 names + days) ---
function ensureDropdowns() {
  const userSel = $("user");
  const daySel = $("viewDay");
  if (userSel && !userSel.options.length) {
    DEFAULT_USERS.forEach((n) => {
      const o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      userSel.appendChild(o);
    });
  }
  if (daySel && !daySel.options.length) {
    DAYS.forEach((n, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = n;
      daySel.appendChild(o);
    });
  }
}

// --- Build weekly grid (Time + 7 day columns) ---
const grid = $("grid");

function colHead(text) {
  const el = document.createElement("div");
  el.className = "col-head";
  el.textContent = text;
  return el;
}
function timeCell(text) {
  const el = document.createElement("div");
  el.className = "time";
  el.textContent = text;
  return el;
}

function buildGrid() {
  if (!grid) return;
  grid.innerHTML = "";
  grid.appendChild(colHead("Time"));
  DAYS.forEach((d) => grid.appendChild(colHead(d)));
  for (let i = 0; i < SLOTS; i++) {
    grid.appendChild(timeCell(minutesToLabel(START_MIN + i * STEP_MIN)));
    for (let d = 0; d < 7; d++) {
      const b = document.createElement("button");
      b.className = "cell";
      b.type = "button";
      b.dataset.day = d;
      b.dataset.slot = i;
      b.addEventListener("click", onCellClick);
      grid.appendChild(b);
    }
  }
}

function renderForUser(name) {
  ensureUser(name);
  document.querySelectorAll(".cell").forEach((b) => b.classList.remove("busy"));
  for (let d = 0; d < 7; d++) {
    const arr = state.users[name][`d${d}`] || [];
    for (let i = 0; i < SLOTS; i++) {
      if (arr[i] === 1) {
        const btn = document.querySelector(`.cell[data-day="${d}"][data-slot="${i}"]`);
        if (btn) btn.classList.add("busy");
      }
    }
  }
}

// --- API sync (GET/POST availability.json via serverless) ---
async function pullLatest(silent = false) {
  try {
    const res = await fetch(API_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`GET failed: ${res.status}`);
    const latest = await res.json();
    state = {
      users: latest?.users || {},
      log: Array.isArray(latest?.log) ? latest.log : []
    };
    ensureUser($("user").value);
    renderForUser($("user").value);
    if (!silent) setStatus("Up to date.");
    if (currentMode === "see") renderDayMatrix();
  } catch (err) {
    if (!silent) setStatus("Failed to pull latest.");
  }
}

// serialize saves to avoid concurrent posts stomping each other
let saveQueue = Promise.resolve();
async function pushLatest(commitUser) {
  saveQueue = saveQueue.then(async () => {
    try {
      setStatus("Saving…");
      // pull latest first, then merge our local state to avoid overwriting others
      const base = await fetch(API_URL, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { users: {}, log: [] }));
      const merged = {
        users: { ...base.users, ...state.users },
        log: [{ ts: new Date().toISOString(), user: commitUser || $("user").value, reason: "update" }, ...(base.log || [])].slice(0, 5000)
      };
      const r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged)
      });
      if (!r.ok) {
        setStatus("Save failed.");
        return;
      }
      const out = await r.json();
      setStatus(`Saved${out.commit ? ` (${out.commit})` : ""}.`);
    } catch (e) {
      setStatus("Save failed (network).");
    }
  });
  return saveQueue;
}

// --- Interactions ---
function onCellClick(e) {
  if (currentMode !== "fill") return;
  const name = $("user").value;
  ensureUser(name);

  const d = +e.currentTarget.dataset.day;
  const i = +e.currentTarget.dataset.slot;
  const toBusy = $("edit").value === "mark" ? 1 : 0;

  if (state.users[name][`d${d}`][i] !== toBusy) {
    state.users[name][`d${d}`][i] = toBusy;
    e.currentTarget.classList.toggle("busy", toBusy === 1);
    pushLatest(name);
  }
}

// --- See-by-day matrix ---
function renderDayMatrix() {
  const dayIdx = +$("viewDay").value || 0;
  const container = $("dayMatrix");
  if (!container) return;

  const cols = ["Time", ...DEFAULT_USERS];
  let html = `<table class="matrix"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
  for (let i = 0; i < SLOTS; i++) {
    const t = minutesToLabel(START_MIN + i * STEP_MIN);
    const row = DEFAULT_USERS
      .map((u) => {
        const a = state.users[u]?.[`d${dayIdx}`] || [];
        const busy = a[i] === 1;
        return `<td class="${busy ? "x" : ""}">${busy ? "✕" : ""}</td>`;
      })
      .join("");
    html += `<tr><td class="timeCol">${t}</td>${row}</tr>`;
  }
  html += `</tbody></table>`;
  container.innerHTML = html;
}

// --- Clear my availability ---
function hookClearMine() {
  const btn = $("clearMine");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const who = $("user").value;
    if (!confirm(`Clear ALL availability for ${who}? This updates the shared file for everyone.`)) return;
    ensureUser(who);
    for (let d = 0; d < 7; d++) state.users[who][`d${d}`] = Array.from({ length: SLOTS }, () => 0);
    renderForUser(who);
    await pushLatest(who);
    if (currentMode === "see") renderDayMatrix();
  });
}

// --- Mode switch (exactly one visible at a time) ---
let currentMode = "fill";
function goFill() {
  currentMode = "fill";
  $("btnFill")?.classList.add("active");
  $("btnSee")?.classList.remove("active");
  $("barFill")?.removeAttribute("hidden");
  $("legendFill")?.removeAttribute("hidden");
  $("gridWrap")?.removeAttribute("hidden");
  $("barSee")?.setAttribute("hidden", "");
  $("dayMatrix")?.setAttribute("hidden", "");
}
function goSee() {
  currentMode = "see";
  $("btnSee")?.classList.add("active");
  $("btnFill")?.classList.remove("active");
  $("barSee")?.removeAttribute("hidden");
  $("dayMatrix")?.removeAttribute("hidden");
  $("barFill")?.setAttribute("hidden", "");
  $("legendFill")?.setAttribute("hidden", "");
  $("gridWrap")?.setAttribute("hidden", "");
  renderDayMatrix();
}

function hookSwitcher() {
  $("btnFill")?.addEventListener("click", goFill);
  $("btnSee")?.addEventListener("click", goSee);
}

// --- Other hooks ---
function hookSelects() {
  $("user")?.addEventListener("change", () => {
    ensureUser($("user").value);
    renderForUser($("user").value);
  });
  $("viewDay")?.addEventListener("change", renderDayMatrix);
}

// --- Boot ---
(function boot() {
  ensureDropdowns();
  buildGrid();
  hookSwitcher();
  hookSelects();
  hookClearMine();

  if ($("user")) $("user").value = DEFAULT_USERS[0];
  if ($("viewDay")) $("viewDay").value = "0";

  pullLatest();                 // initial shared load
  setInterval(() => pullLatest(true), 10_000); // silent refresh every 10s
})();
