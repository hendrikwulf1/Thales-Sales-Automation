/* MyService – UI-Schicht. Die gesamte Geschäftslogik liegt in engine.js,
   hier passiert nur Rendern + Events. Zustand wird in localStorage gehalten. */
/* global Engine, DEMO_FOTOS */
const E = Engine;
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const STORAGE_KEY = "myservice_demo_v1";
let store = loadStore();

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* frischer Start */ }
  return E.createStore();
}
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) {} }

/* ---------- Utils ---------- */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function toast(text, err) {
  const el = document.createElement("div");
  el.className = "toast" + (err ? " err" : "");
  el.textContent = text;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 5200);
}
function fmtTime(ts) {
  return new Date(ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function sterneStr(n) { return "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n)); }
function tryAction(fn, okMsg) {
  try { fn(); if (okMsg) toast(okMsg); }
  catch (err) { toast(err.message, true); }
  afterAction();
}
function afterAction() {
  const freigaben = E.tick(store);
  freigaben.forEach((id) => toast(`⏱ 48h abgelaufen – Auftrag ${id} automatisch freigegeben & ausgezahlt.`));
  save(); renderAll();
}

/* ---------- Modal ---------- */
function openModal(html) { $("#modalBox").innerHTML = html; $("#modalBackdrop").classList.add("open"); }
function closeModal() { $("#modalBackdrop").classList.remove("open"); }
$("#modalBackdrop").addEventListener("click", (e) => { if (e.target.id === "modalBackdrop") closeModal(); });

/* ---------- Signatur-Pad ---------- */
function initSigPad(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#0b2f6b";
  let drawing = false, drew = false;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
  };
  canvas.addEventListener("pointerdown", (e) => { drawing = true; drew = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); canvas.classList.add("signed"); });
  canvas.addEventListener("pointerup", () => { drawing = false; });
  return {
    hasInk: () => drew,
    dataUrl: () => canvas.toDataURL("image/png"),
    clear: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); drew = false; canvas.classList.remove("signed"); },
  };
}
/* Automatische Demo-Unterschrift (für den Simulations-Button) */
function autoSignatur(name) {
  const c = document.createElement("canvas"); c.width = 300; c.height = 80;
  const ctx = c.getContext("2d");
  ctx.strokeStyle = "#0b2f6b"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(20, 55);
  for (let x = 20; x <= 270; x += 10) ctx.lineTo(x, 40 + Math.sin(x / 14) * 16 + Math.random() * 8);
  ctx.stroke(); ctx.font = "10px sans-serif"; ctx.fillStyle = "#888"; ctx.fillText(name, 20, 74);
  return c.toDataURL("image/png");
}

/* ---------- Charts (Dataviz-Regeln: dünne Marken, 2px-Lücken, Tooltip, Direktlabels) ---------- */
const vizTip = $("#vizTip");
function tipShow(e, html) { vizTip.innerHTML = html; vizTip.style.display = "block"; tipMove(e); }
function tipMove(e) { vizTip.style.left = Math.min(e.clientX + 14, innerWidth - 240) + "px"; vizTip.style.top = (e.clientY + 14) + "px"; }
function tipHide() { vizTip.style.display = "none"; }

function hBarChart(container, items, { unit = "€" } = {}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const W = 520, rowH = 34, labelW = 150, H = items.length * rowH + 6;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" style="width:100%;height:auto;">`;
  items.forEach((it, i) => {
    const y = i * rowH + 6;
    const w = Math.max(4, (it.value / max) * (W - labelW - 90));
    svg += `<text x="0" y="${y + 15}" font-size="12" fill="var(--ink-2)">${esc(it.label)}</text>`;
    svg += `<rect class="hbar" data-i="${i}" x="${labelW}" y="${y}" width="${w}" height="20" rx="4" fill="${it.color}"></rect>`;
    svg += `<text x="${labelW + w + 8}" y="${y + 15}" font-size="12" font-weight="700" fill="var(--ink)">${esc(it.value.toLocaleString("de-DE"))} ${unit}</text>`;
  });
  svg += `</svg>`;
  container.innerHTML = svg;
  $$(".hbar", container).forEach((r) => {
    const it = items[+r.dataset.i];
    r.addEventListener("pointerenter", (e) => tipShow(e, `<b>${esc(it.label)}</b>${it.value.toLocaleString("de-DE")} ${unit}${it.hint ? "<br>" + esc(it.hint) : ""}`));
    r.addEventListener("pointermove", tipMove);
    r.addEventListener("pointerleave", tipHide);
  });
}

function vBarChart(container, items, { unit = "€" } = {}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const W = 520, H = 200, pad = 26, bw = (W - pad) / items.length;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" style="width:100%;height:auto;">`;
  // dezente Gitterlinien
  for (let g = 1; g <= 3; g++) {
    const gy = H - 30 - (g / 3) * (H - 60);
    svg += `<line x1="${pad}" x2="${W}" y1="${gy}" y2="${gy}" stroke="var(--grid)" stroke-width="1"></line>`;
  }
  svg += `<line x1="${pad}" x2="${W}" y1="${H - 30}" y2="${H - 30}" stroke="var(--baseline)" stroke-width="1"></line>`;
  items.forEach((it, i) => {
    const h = Math.max(3, (it.value / max) * (H - 60));
    const x = pad + i * bw + bw * 0.18, w = bw * 0.64;
    svg += `<rect class="vbar" data-i="${i}" x="${x}" y="${H - 30 - h}" width="${w}" height="${h}" rx="4" fill="${it.color || "var(--s1)"}"></rect>`;
    svg += `<text x="${x + w / 2}" y="${H - 14}" font-size="11" text-anchor="middle" fill="var(--muted)">${esc(it.label)}</text>`;
    if (it.mark) svg += `<text x="${x + w / 2}" y="${H - 36 - h}" font-size="11" font-weight="700" text-anchor="middle" fill="var(--ink)">${esc(it.value.toLocaleString("de-DE"))}</text>`;
  });
  svg += `</svg>`;
  container.innerHTML = svg;
  $$(".vbar", container).forEach((r) => {
    const it = items[+r.dataset.i];
    r.addEventListener("pointerenter", (e) => tipShow(e, `<b>${esc(it.label)}</b>${it.value.toLocaleString("de-DE")} ${unit}`));
    r.addEventListener("pointermove", tipMove);
    r.addEventListener("pointerleave", tipHide);
  });
}

/* Gebühren-Split als gestapelter Balken (Direktlabels, 2px-Lücken) */
function renderFeeSplit() {
  const f = E.gebuehren(200);
  const total = f.kundeZahlt;
  const segs = [
    { label: "Betrieb erhält", val: f.betriebErhaelt, color: "var(--s1)", cls: "" },
    { label: "Provision (10 %)", val: f.provision, color: "var(--s2)", cls: "" },
    { label: "Servicegebühr (2,9 %)", val: f.serviceFee, color: "var(--s3)", cls: "s-fee" },
  ];
  $("#feeSplitViz").innerHTML = `
    <div class="feebar">${segs.map((s) =>
      `<div class="seg ${s.cls}" style="flex:${s.val};background:${s.color}" title="${esc(s.label)}: ${s.val.toLocaleString("de-DE")} €">${s.val.toLocaleString("de-DE")} €</div>`).join("")}
    </div>
    <div class="legend">${segs.map((s) => `<span class="li"><span class="sw" style="background:${s.color}"></span>${esc(s.label)}</span>`).join("")}</div>
    <div class="feelabels"><span>Kunde zahlt gesamt: <b>${total.toLocaleString("de-DE")} €</b></span><span>Plattform-Umsatz: <b>${f.plattformUmsatz.toLocaleString("de-DE")} €</b></span></div>`;
}

/* =========================================================
   NAVIGATION
   ========================================================= */
let activeView = "start";
function showView(v) {
  activeView = v;
  $$("#mainTabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  $$(".view").forEach((s) => s.classList.toggle("active", s.id === "view-" + v));
  renderAll();
  window.scrollTo({ top: 0 });
}
$$("#mainTabs button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-goto]");
  if (g) showView(g.dataset.goto);
});
$("#btnFastForward").addEventListener("click", () => {
  E.zeitVorspulen(store, 12);
  toast("⏩ Simulierte Zeit +12 Stunden");
  afterAction();
});
$("#btnReset").addEventListener("click", () => {
  if (!confirm("Demo komplett zurücksetzen? Alle Aufträge und Änderungen gehen verloren.")) return;
  store = E.createStore(); kunde = neuerKundeState(); save(); renderAll();
  toast("Demo zurückgesetzt.");
});

/* =========================================================
   KUNDE – Wizard
   ========================================================= */
function neuerKundeState() {
  return { kategorie: null, text: "", foto: null, klass: null, problemId: null, slotWahl: {}, highlightBetrieb: null };
}
let kunde = neuerKundeState();

function renderWizardSteps() {
  const steps = [
    { n: 1, t: "Problem beschreiben", done: !!kunde.klass },
    { n: 2, t: "KI-Analyse", done: !!kunde.problemId },
    { n: 3, t: "Vergleichen & anfragen", done: false },
  ];
  const nowIdx = !kunde.klass ? 0 : (!kunde.problemId ? 1 : 2);
  $("#wizardSteps").innerHTML = steps.map((s, i) =>
    `<span class="ws ${s.done ? "done" : ""} ${i === nowIdx ? "now" : ""}">${s.done ? "✓ " : s.n + " · "}${s.t}</span>`).join("");
}

function renderKundeStep1() {
  const kats = Object.entries(E.GEWERKE);
  $("#kundeStep1").innerHTML = `
  <div class="card stack">
    <div>
      <label class="lbl">Kategorie (optional – die KI erkennt sie sonst selbst)</label>
      <div class="cat-grid">
        <button class="chip ${!kunde.kategorie ? "active" : ""}" data-kat="">🤖 Automatisch erkennen</button>
        ${kats.map(([id, g]) => `<button class="chip ${kunde.kategorie === id ? "active" : ""}" data-kat="${id}">${g.icon} ${esc(g.label)}</button>`).join("")}
      </div>
    </div>
    <div>
      <label class="lbl">Beschreibe dein Problem</label>
      <textarea id="problemText" placeholder="z. B. „Mein Abfluss in der Küche ist verstopft, das Wasser läuft nicht mehr ab“">${esc(kunde.text)}</textarea>
    </div>
    <div>
      <label class="lbl">Foto hochladen (optional – verbessert die Erkennung)</label>
      <div class="foto-row">
        <input type="file" id="fotoUpload" accept="image/*" style="width:auto;" />
        ${DEMO_FOTOS.map((f) => `<button class="foto-demo ${kunde.foto && kunde.foto.id === f.id ? "active" : ""}" data-foto="${f.id}">${f.emoji} ${esc(f.label)}</button>`).join("")}
      </div>
      <div id="fotoInfo" style="margin-top:8px;">${kunde.foto ? fotoInfoHtml(kunde.foto) : ""}</div>
    </div>
    <div class="row">
      <button class="btn primary" id="btnAnalyse">🧠 KI analysieren lassen</button>
      <span class="muted">Bild- & Texterkennung → Klassifizierung → Preis-Kalkulation</span>
    </div>
  </div>`;

  $$("#kundeStep1 [data-kat]").forEach((b) => b.addEventListener("click", () => {
    kunde.kategorie = b.dataset.kat || null;
    kunde.text = $("#problemText").value;
    renderKunde();
  }));
  $$("#kundeStep1 [data-foto]").forEach((b) => b.addEventListener("click", () => {
    const f = DEMO_FOTOS.find((x) => x.id === b.dataset.foto);
    kunde.foto = { id: f.id, label: f.label, vision: f.vision, emoji: f.emoji };
    kunde.text = $("#problemText").value;
    renderKunde();
  }));
  $("#fotoUpload").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    kunde.text = $("#problemText").value;
    const reader = new FileReader();
    reader.onload = () => {
      // Simulierte Bildanalyse: Labels aus dem Dateinamen (in Produktion: Vision-Modell)
      const name = E.norm(file.name);
      const vision = [];
      E.PROBLEME.forEach((p) => p.fotoLabels.forEach((l) => { if (name.includes(E.norm(l)) && !vision.includes(l)) vision.push(l); }));
      kunde.foto = { id: "upload", label: file.name, vision, dataUrl: reader.result };
      renderKunde();
    };
    reader.readAsDataURL(file);
  });
  $("#btnAnalyse").addEventListener("click", () => {
    kunde.text = $("#problemText").value;
    const klass = E.klassifiziere({ text: kunde.text, kategorie: kunde.kategorie, fotoLabels: kunde.foto ? kunde.foto.vision : [] });
    if (!klass) { toast("Die KI konnte nichts erkennen – bitte beschreibe das Problem genauer oder wähle eine Kategorie.", true); return; }
    kunde.klass = klass;
    kunde.problemId = klass.problem.id;
    renderKunde();
    $("#kundeStep2").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
function fotoInfoHtml(foto) {
  const labels = foto.vision.length ? foto.vision.map((v) => `<span class="chip mini">🏷 ${esc(v)}</span>`).join(" ") : `<span class="chip mini">🏷 Objekt unklar</span>`;
  const img = foto.dataUrl ? `<img class="foto-preview" src="${foto.dataUrl}" alt="Foto" /> ` : (foto.emoji ? `<span style="font-size:2rem;">${foto.emoji}</span> ` : "");
  return `<div class="row">${img}<span class="muted">Bildanalyse:</span> ${labels}</div>`;
}

function renderKundeStep2() {
  const box = $("#kundeStep2");
  if (!kunde.klass) { box.innerHTML = ""; return; }
  const k = kunde.klass;
  const aktiv = E.findProblem(kunde.problemId);
  const g = E.GEWERKE[aktiv.gewerk];
  const konf = Math.round(k.konfidenz * 100);
  box.innerHTML = `
  <div class="card ki-result stack" style="margin-top:16px;">
    <div class="row spread">
      <h3 style="margin:0;">🧠 KI-Ergebnis: ${g.icon} ${esc(aktiv.label)}</h3>
      <span class="badge b-blue">${esc(g.label)}</span>
    </div>
    <div class="row">
      <span class="muted">Konfidenz:</span>
      <div class="confbar"><div style="width:${konf}%"></div></div>
      <b>${konf} %</b>
      <span class="muted">· typische Dauer: ${esc(aktiv.dauer)}</span>
    </div>
    <div class="row">
      ${k.treffer.length ? `<span class="muted">Erkannt im Text:</span> ${k.treffer.map((t) => `<span class="chip mini">„${esc(t)}“</span>`).join(" ")}` : ""}
      ${k.fotoTreffer.length ? `<span class="muted">Erkannt im Foto:</span> ${k.fotoTreffer.map((t) => `<span class="chip mini">📷 ${esc(t)}</span>`).join(" ")}` : ""}
    </div>
    ${k.alternativen.length ? `<div class="row"><span class="muted">Nicht richtig? Meintest du:</span>
      ${k.alternativen.map((a) => `<button class="chip mini ${kunde.problemId === a.id ? "active" : ""}" data-alt="${a.id}">${esc(a.label)}</button>`).join(" ")}
      <button class="chip mini ${kunde.problemId === k.problem.id ? "active" : ""}" data-alt="${k.problem.id}">${esc(k.problem.label)}</button>
    </div>` : ""}
  </div>`;
  $$("#kundeStep2 [data-alt]").forEach((b) => b.addEventListener("click", () => {
    kunde.problemId = b.dataset.alt;
    renderKunde();
  }));
}

/* ---- Karte ---- */
function mapSvg(ranking) {
  const sx = (km) => 60 + km * 88, sy = (km) => 30 + km * 60;
  const pins = ranking.map((r, i) => {
    const b = r.betrieb, x = sx(b.pos.x), y = sy(b.pos.y);
    return `<g class="pin ${kunde.highlightBetrieb === b.id ? "highlight" : ""}" data-pin="${b.id}" transform="translate(${x},${y})">
      <circle class="body" r="15" fill="${b.premium ? "var(--ink)" : "var(--s1)"}" stroke="var(--surface)" stroke-width="2"></circle>
      <text y="5" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">${i + 1}</text>
      <text y="30" text-anchor="middle" font-size="10" fill="var(--ink-2)">${esc(b.name.split(" ")[0])}</text>
    </g>`;
  }).join("");
  const u = store.userPos;
  return `<svg viewBox="0 0 1000 700" id="cityMap" aria-label="Karte der Dienstleister">
    <rect width="1000" height="700" fill="var(--page)"></rect>
    <path d="M0,520 C240,470 420,590 680,540 S920,470 1000,500 L1000,700 L0,700 Z" fill="var(--brand-soft)" opacity="0.55"></path>
    <rect x="640" y="80" width="190" height="130" rx="14" fill="var(--s4)" opacity="0.16"></rect>
    <rect x="120" y="330" width="150" height="110" rx="14" fill="var(--s4)" opacity="0.16"></rect>
    ${[130, 260, 390].map((y) => `<line x1="0" x2="1000" y1="${y}" y2="${y}" stroke="var(--grid)" stroke-width="6"></line>`).join("")}
    ${[220, 460, 700, 880].map((x) => `<line x1="${x}" x2="${x}" y1="0" y2="700" stroke="var(--grid)" stroke-width="6"></line>`).join("")}
    <g transform="translate(${sx(u.x)},${sy(u.y)})">
      <circle r="26" fill="var(--s1)" opacity="0.15"></circle>
      <circle r="8" fill="var(--s1)" stroke="var(--surface)" stroke-width="2.5"></circle>
      <text y="44" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">📍 Du</text>
    </g>
    ${pins}
  </svg>`;
}

function renderKundeStep3() {
  const box = $("#kundeStep3");
  if (!kunde.problemId) { box.innerHTML = ""; return; }
  const problem = E.findProblem(kunde.problemId);
  const ranking = E.sucheBetriebe(store.betriebe, problem.id, problem.gewerk, store.userPos);
  if (!ranking.length) { box.innerHTML = `<div class="card" style="margin-top:16px;">Aktuell bietet kein Betrieb diese Leistung an.</div>`; return; }

  box.innerHTML = `
  <h3 class="section-title">Passende Betriebe in deiner Nähe (${ranking.length})</h3>
  <div class="grid c2">
    <div>
      <div class="mapwrap">${mapSvg(ranking)}</div>
      <div class="map-hint">💡 Klicke auf die Karte, um deinen Standort zu ändern – das Ranking sortiert sich live neu. Schwarze Pins = Premium-Betriebe.</div>
    </div>
    <div class="stack" id="providerList">
      ${ranking.map((r, i) => providerCard(r, i, problem)).join("")}
    </div>
  </div>`;

  // Karte: Klick setzt Standort, Pins highlighten Karten
  const svg = $("#cityMap");
  svg.addEventListener("click", (e) => {
    const pin = e.target.closest(".pin");
    if (pin) { kunde.highlightBetrieb = pin.dataset.pin; renderKundeStep3(); return; }
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    store.userPos = { x: Math.max(0, Math.min(10, (p.x - 60) / 88)), y: Math.max(0, Math.min(10, (p.y - 30) / 60)) };
    save(); renderKundeStep3();
    toast("📍 Standort aktualisiert – Ranking neu berechnet.");
  });

  $$("#providerList .slot:not(.belegt)").forEach((s) => s.addEventListener("click", () => {
    kunde.slotWahl[s.dataset.b] = s.dataset.slot;
    renderKundeStep3();
  }));
  $$("#providerList [data-anfrage]").forEach((b) => b.addEventListener("click", () => {
    const bid = b.dataset.anfrage;
    const slot = kunde.slotWahl[bid];
    if (!slot) { toast("Bitte wähle zuerst einen freien Termin.", true); return; }
    openDisclaimerModal(bid, problem, slot);
  }));
  $$("#providerList [data-showreviews]").forEach((b) => b.addEventListener("click", () => {
    const el = $("#reviews-" + b.dataset.showreviews);
    el.hidden = !el.hidden;
  }));
}

function providerCard(r, i, problem) {
  const b = r.betrieb;
  const slots = E.freieSlots(store, b, 4).slice(0, 6);
  const gewaehlt = kunde.slotWahl[b.id];
  return `
  <div class="card provider ${kunde.highlightBetrieb === b.id ? "highlight" : ""}">
    <div class="row spread">
      <div>
        <b>#${i + 1} · ${esc(b.name)}</b> ${b.premium ? '<span class="badge b-premium">★ Premium</span>' : ""}
        <div class="muted" style="font-size:.82rem;">seit ${b.gegruendet} · ${r.dist.toLocaleString("de-DE")} km entfernt</div>
      </div>
      <div style="text-align:right;">
        <div class="price">${r.preis.min}–${r.preis.max} €</div>
        <div class="muted" style="font-size:.76rem;">KI-Preisvorschlag inkl. ${r.preis.anfahrt} € Anfahrt</div>
      </div>
    </div>
    <div class="row">
      <span class="stars">${sterneStr(b.rating)}</span>
      <b>${b.rating.toLocaleString("de-DE")}</b>
      <button class="btn small ghost" data-showreviews="${b.id}">${b.reviews.length} Bewertungen ▾</button>
    </div>
    <div id="reviews-${b.id}" class="reviews" hidden>
      ${b.reviews.slice(0, 4).map((rv) => `<div class="review"><b>${esc(rv.autor)}</b> <span class="stars">${"★".repeat(rv.sterne)}</span>${rv.ausApp ? ' <span class="badge b-good">✓ Verifizierter App-Auftrag</span>' : ""}<br>${esc(rv.text)}</div>`).join("")}
    </div>
    <div>
      <span class="muted" style="font-size:.8rem;">Freie Termine (live vom Betrieb):</span>
      <div class="slotrow" style="margin-top:4px;">
        ${slots.map((s) => `<button class="slot ${s.belegt ? "belegt" : ""} ${gewaehlt === s.key ? "active" : ""}" data-b="${b.id}" data-slot="${esc(s.key)}" ${s.belegt ? "disabled" : ""}>${esc(s.key)}</button>`).join("")}
      </div>
    </div>
    <div class="row spread">
      <span class="muted" style="font-size:.8rem;">🤫 Anonyme Anfrage – kein Anruf nötig</span>
      <button class="btn primary" data-anfrage="${b.id}">Anfrage schicken</button>
    </div>
  </div>`;
}

/* ---- Transparenz-Disclaimer + Anfrage ---- */
function openDisclaimerModal(betriebId, problem, slot) {
  const b = E.findBetrieb(store, betriebId);
  const preis = E.preisSchaetzung(b, problem.id);
  openModal(`
    <h3>Anfrage an ${esc(b.name)}</h3>
    <p class="sub">${esc(problem.label)} · Wunschtermin <b>${esc(slot)}</b> · geschätzt <b>${preis.min}–${preis.max} €</b></p>
    <div class="disclaimer">
      ⚠️ <b>Transparenz-Hinweis:</b> Dies ist eine <b>Preisschätzung auf Basis deiner Angaben</b>.
      Bei ungenauen Beschreibungen oder unvorhergesehenen Umständen (z.&nbsp;B. versteckte Stromkabel)
      kann der finale Preis abweichen.
    </div>
    <label class="checkline"><input type="checkbox" id="ckDisclaimer" /> Verstanden – die Schätzung ist unverbindlich.</label>
    <p class="muted" style="font-size:.8rem;">Deine Anfrage wird <b>anonymisiert</b> übermittelt. Der Betrieb sieht nur dein Problem, das Foto und den Wunschtermin – keine Kontaktdaten, kein Telefonat.</p>
    <div class="row" style="justify-content:flex-end;">
      <button class="btn" id="mAbbrechen">Abbrechen</button>
      <button class="btn primary" id="mSenden">📨 Anonyme Anfrage senden</button>
    </div>`);
  $("#mAbbrechen").addEventListener("click", closeModal);
  $("#mSenden").addEventListener("click", () => {
    tryAction(() => {
      E.anfrageSenden(store, {
        betriebId, problemId: problem.id, text: kunde.text,
        fotoLabel: kunde.foto ? kunde.foto.label : null, slot,
        disclaimerAkzeptiert: $("#ckDisclaimer").checked,
      });
      closeModal();
      toast("📨 Anfrage anonym gesendet! Verfolge sie unter „Meine Aufträge“.");
      showView("auftraege");
    });
  });
}

function renderKunde() { renderWizardSteps(); renderKundeStep1(); renderKundeStep2(); renderKundeStep3(); }

/* =========================================================
   MEINE AUFTRÄGE (Kundensicht)
   ========================================================= */
const PIPELINE = ["ANGEFRAGT", "ANGENOMMEN", "BEZAHLT", "IN_ARBEIT", "DOKU", "PRUEFUNG", "ABGESCHLOSSEN"];
const ST_CLS = {
  ANGEFRAGT: "st-blue", ANGENOMMEN: "st-blue", BEZAHLT: "st-blue", IN_ARBEIT: "st-warn",
  DOKU: "st-warn", PRUEFUNG: "st-warn", PROBLEM: "st-serious", NACHBESSERUNG: "st-serious",
  MEDIATION: "st-critical", ABGESCHLOSSEN: "st-good", ERSTATTET: "st-good", STORNIERT: "st-good", ABGELEHNT: "",
};
const ST_BADGE = {
  ANGEFRAGT: "b-blue", ANGENOMMEN: "b-blue", BEZAHLT: "b-blue", IN_ARBEIT: "b-warn", DOKU: "b-warn",
  PRUEFUNG: "b-warn", PROBLEM: "b-serious", NACHBESSERUNG: "b-serious", MEDIATION: "b-critical",
  ABGESCHLOSSEN: "b-good", ERSTATTET: "b-muted", STORNIERT: "b-muted", ABGELEHNT: "b-muted",
};

function pipelineHtml(order) {
  const idx = PIPELINE.indexOf(order.status);
  const abweichung = ["PROBLEM", "NACHBESSERUNG", "MEDIATION", "ERSTATTET", "STORNIERT", "ABGELEHNT"].includes(order.status);
  return `<div class="pipeline">
    ${PIPELINE.map((s, i) => {
      let cls = "";
      if (!abweichung) { if (i < idx || order.status === "ABGESCHLOSSEN") cls = "done"; if (i === idx && order.status !== "ABGESCHLOSSEN") cls = "now"; }
      else if (i <= PIPELINE.indexOf("PRUEFUNG") && order.escrow.state !== "OFFEN") cls = "done";
      return `<span class="p ${cls}">${E.STATUS_LABEL[s].split(" ")[0].replace("–", "")}</span>`;
    }).join("")}
    ${abweichung ? `<span class="p bad">${esc(E.STATUS_LABEL[order.status])}</span>` : ""}
  </div>`;
}

function escrowHtml(order) {
  if (order.escrow.state === "OFFEN") return "";
  const map = {
    EINGEZAHLT: ["🔒", "Geld sicher im Treuhandkonto", ""],
    EINGEFROREN: ["🧊", "Eingefroren wegen Problemmeldung", "frozen"],
    AUSGEZAHLT: ["✅", "An den Betrieb ausgezahlt", ""],
    ERSTATTET: ["↩️", "An dich zurückerstattet (Käuferschutz)", ""],
  };
  const [icon, txt, cls] = map[order.escrow.state];
  return `<div class="escrowbox ${cls}"><span style="font-size:1.4rem;">${icon}</span>
    <div><div class="amt">${(order.escrow.amount + order.escrow.serviceFee).toLocaleString("de-DE")} €</div>
    <div class="muted" style="font-size:.8rem;">${txt} · davon ${order.escrow.serviceFee.toLocaleString("de-DE")} € Servicegebühr</div></div></div>`;
}

function countdownHtml(order) {
  if (order.status !== "PRUEFUNG" || !order.releaseDeadline) return "";
  const rest = order.releaseDeadline - E.now(store);
  if (rest <= 0) return "";
  const h = Math.floor(rest / 3600000), m = Math.floor((rest % 3600000) / 60000);
  return `<span class="badge b-warn">⏱ Freigabefenster: noch <span class="countdown">${h} h ${String(m).padStart(2, "0")} min</span></span>`;
}

function invoiceHtml(order) {
  const inv = order.invoice;
  if (!inv) return "";
  return `<div class="invoice">
    <div class="row spread"><b>Rechnung ${esc(inv.nr)}</b><span class="muted">${fmtTime(inv.ts)}</span></div>
    <table>
      ${inv.positionen.map((p) => `<tr><td>${esc(p.text)}</td><td>${p.betrag.toLocaleString("de-DE")} €</td></tr>`).join("")}
      <tr><td class="muted">Netto</td><td>${inv.netto.toLocaleString("de-DE")} €</td></tr>
      <tr><td class="muted">MwSt. 19 %</td><td>${inv.mwst.toLocaleString("de-DE")} €</td></tr>
      <tr class="total"><td>Gesamt</td><td>${inv.brutto.toLocaleString("de-DE")} €</td></tr>
    </table>
    <div class="row" style="margin-top:8px;">
      <span class="badge b-good">📷 Nachher-Foto: ${esc(typeof inv.nachherFoto === "string" && inv.nachherFoto.length < 60 ? inv.nachherFoto : "hinterlegt")}</span>
      ${inv.signaturBetrieb && inv.signaturBetrieb.startsWith && inv.signaturBetrieb.startsWith("data:") ? `<img class="sigimg" src="${inv.signaturBetrieb}" alt="Signatur Betrieb" title="Unterschrift Betrieb" />` : '<span class="badge b-good">✍️ Betrieb</span>'}
      ${inv.signaturKunde && inv.signaturKunde.startsWith && inv.signaturKunde.startsWith("data:") ? `<img class="sigimg" src="${inv.signaturKunde}" alt="Signatur Kunde" title="Unterschrift Kunde" />` : '<span class="badge b-good">✍️ Kunde</span>'}
    </div>
  </div>`;
}

function chatHtml(order, wer) {
  return `<div class="chatbox" id="chat-${order.id}">
    ${order.chat.map((m) => `<div class="msg ${m.von}"><span class="who">${m.von === "kunde" ? esc(order.alias) : m.von === "betrieb" ? "Betrieb" : m.von === "plattform" ? "MyService Mediation" : "System"} · ${fmtTime(m.ts)}</span>${esc(m.text)}</div>`).join("")}
  </div>
  <div class="row" style="margin-top:6px;">
    <input type="text" id="chatIn-${order.id}" placeholder="Nachricht (asynchron & über die Plattform)…" style="flex:1;" />
    <button class="btn small" data-chat="${order.id}" data-von="${wer}">Senden</button>
  </div>`;
}

function kundeActions(order) {
  const b = E.findBetrieb(store, order.betriebId);
  switch (order.status) {
    case "ANGEFRAGT":
      return `<span class="muted">Warte auf Bestätigung des Betriebs …</span>
        <button class="btn small ghost" data-sim-accept="${order.id}">🤖 Demo: Antwort des Betriebs simulieren</button>`;
    case "ANGENOMMEN":
      return `<button class="btn primary" data-buchen="${order.id}">Kostenpflichtig buchen (${(E.gebuehren(order.estimate.mid).kundeZahlt).toLocaleString("de-DE")} €)</button>`;
    case "BEZAHLT":
      return `<span class="muted">Termin fix: <b>${esc(order.slot)}</b></span>
        <button class="btn small ghost" data-sim-arbeit="${order.id}">🤖 Demo: Arbeitstag simulieren</button>
        <button class="btn small danger" data-kschutz="${order.id}">🛡 Käuferschutz (Betrieb erschienen?)</button>`;
    case "IN_ARBEIT":
    case "DOKU":
      return `<span class="muted">${b ? esc(b.name) : ""} arbeitet / dokumentiert …</span>
        <button class="btn small ghost" data-sim-arbeit="${order.id}">🤖 Demo: Doku des Betriebs simulieren</button>
        <button class="btn small danger" data-kschutz="${order.id}">🛡 Käuferschutz</button>`;
    case "PRUEFUNG":
      return `<button class="btn primary" data-abnahme="${order.id}">✍️ Arbeit freigeben (digitale Abnahme)</button>
        <button class="btn danger" data-problem="${order.id}">⚠️ Problem melden</button>`;
    case "PROBLEM":
      return `<span class="muted">Der Betrieb muss einen kostenlosen Nachbesserungstermin vorschlagen.</span>
        <button class="btn small ghost" data-sim-nach="${order.id}">🤖 Demo: Vorschlag des Betriebs simulieren</button>`;
    case "NACHBESSERUNG":
      return `<span class="muted">Nachbesserung am <b>${esc(order.dispute.nachbesserungSlot || "–")}</b>. Danach lädt der Betrieb erneut Doku + Rechnung hoch.</span>
        <button class="btn small ghost" data-sim-arbeit="${order.id}">🤖 Demo: Nachbesserung simulieren</button>`;
    case "MEDIATION":
      return `<input type="text" id="bew-${order.id}" placeholder="Beweis beschreiben (z. B. Foto Wasserfleck)" style="max-width:280px;" />
        <button class="btn small" data-beweis="${order.id}" data-partei="kunde">📎 Beweis einreichen</button>
        <button class="btn small ghost" data-goto="plattform">Zur Mediation →</button>`;
    case "ABGESCHLOSSEN":
      return order.rated ? `<span class="badge b-good">✓ Bewertet – danke!</span>` : `
        <span class="muted">Wie war ${b ? esc(b.name) : "der Betrieb"}?</span>
        <select id="rate-${order.id}" style="width:auto;"><option value="5">★★★★★</option><option value="4">★★★★</option><option value="3">★★★</option><option value="2">★★</option><option value="1">★</option></select>
        <input type="text" id="ratetxt-${order.id}" placeholder="Kurzes Feedback" style="max-width:220px;" />
        <button class="btn small primary" data-rate="${order.id}">Bewertung abgeben</button>`;
    default:
      return "";
  }
}

function renderOrders() {
  const list = $("#ordersList");
  const orders = [...store.orders].reverse();
  if (!orders.length) {
    list.innerHTML = `<div class="card" style="text-align:center; padding:40px;">
      <h3>Noch keine Aufträge</h3><p class="muted">Starte im Tab „Problem lösen“ – beschreibe dein Problem und schicke eine anonyme Anfrage.</p>
      <button class="btn primary" data-goto="kunde">Problem lösen →</button></div>`;
    return;
  }
  list.innerHTML = orders.map((o) => {
    const b = E.findBetrieb(store, o.betriebId);
    const p = E.findProblem(o.problemId);
    return `<div class="card order-card ${ST_CLS[o.status] || ""}">
      <div class="row spread">
        <div><b>${esc(p.label)}</b> · ${esc(b.name)} <span class="muted">(${o.id} · als ${esc(o.alias)})</span></div>
        <div class="row"><span class="badge ${ST_BADGE[o.status]}">${esc(E.STATUS_LABEL[o.status])}</span>${countdownHtml(o)}</div>
      </div>
      ${pipelineHtml(o)}
      <div class="grid c2" style="margin-top:8px;">
        <div class="stack">
          ${escrowHtml(o)}
          ${invoiceHtml(o)}
          <div class="row" style="gap:8px;">${kundeActions(o)}</div>
        </div>
        <div>${chatHtml(o, "kunde")}</div>
      </div>
    </div>`;
  }).join("");
  bindOrderActions(list);
}

function bindOrderActions(root) {
  const byId = (id) => store.orders.find((o) => o.id === id);
  $$("[data-chat]", root).forEach((b) => b.addEventListener("click", () => {
    const o = byId(b.dataset.chat);
    const inp = $("#chatIn-" + o.id);
    if (!inp.value.trim()) return;
    E.chat(store, o, b.dataset.von, inp.value.trim());
    afterAction();
  }));
  $$("[data-sim-accept]", root).forEach((b) => b.addEventListener("click", () =>
    tryAction(() => E.anfrageAnnehmen(store, byId(b.dataset.simAccept)), "🤖 Der Betrieb hat den Termin bestätigt – du kannst jetzt verbindlich buchen.")));
  $$("[data-buchen]", root).forEach((b) => b.addEventListener("click", () => openBuchenModal(byId(b.dataset.buchen))));
  $$("[data-sim-arbeit]", root).forEach((b) => b.addEventListener("click", () => simulateBetriebArbeit(byId(b.dataset.simArbeit))));
  $$("[data-kschutz]", root).forEach((b) => b.addEventListener("click", () => {
    if (confirm("Käuferschutz auslösen? Das gilt für den Fall, dass keine Leistung erbracht und keine Rechnung gestellt wurde. Du erhältst dein Geld vollständig zurück."))
      tryAction(() => E.kaeuferschutz(store, byId(b.dataset.kschutz)));
  }));
  $$("[data-abnahme]", root).forEach((b) => b.addEventListener("click", () => openAbnahmeModal(byId(b.dataset.abnahme))));
  $$("[data-problem]", root).forEach((b) => b.addEventListener("click", () => openProblemModal(byId(b.dataset.problem))));
  $$("[data-sim-nach]", root).forEach((b) => b.addEventListener("click", () => {
    const o = byId(b.dataset.simNach);
    const bb = E.findBetrieb(store, o.betriebId);
    const slot = E.freieSlots(store, bb).find((s) => !s.belegt);
    tryAction(() => E.nachbesserungVorschlagen(store, o, slot.key), "🤖 Betrieb hat kostenlosen Nachbesserungstermin vorgeschlagen.");
  }));
  $$("[data-beweis]", root).forEach((b) => b.addEventListener("click", () => {
    const o = byId(b.dataset.beweis);
    const inp = $("#bew-" + o.id) || $("#bewB-" + o.id);
    if (!inp.value.trim()) { toast("Bitte Beweis beschreiben.", true); return; }
    tryAction(() => E.beweisEinreichen(store, o, b.dataset.partei, inp.value.trim()), "📎 Beweis eingereicht.");
  }));
  $$("[data-rate]", root).forEach((b) => b.addEventListener("click", () => {
    const o = byId(b.dataset.rate);
    tryAction(() => E.bewerten(store, o, +$("#rate-" + o.id).value, $("#ratetxt-" + o.id).value || "Ohne Kommentar"),
      "⭐ Danke! Deine Bewertung fließt sofort in Rating & Ranking ein.");
  }));
}

/* Demo-Helfer: führt die jeweils nächsten Schritte des Betriebs automatisch aus */
function simulateBetriebArbeit(order) {
  tryAction(() => {
    if (order.status === "BEZAHLT") E.arbeitBeginnen(store, order);
    if (order.status === "IN_ARBEIT") E.arbeitAbschliessen(store, order);
    if (order.status === "DOKU" || order.status === "NACHBESSERUNG") {
      E.rechnungHochladen(store, order, {
        betragBrutto: order.estimate.mid,
        nachherFoto: "Nachher-Foto (automatisch dokumentiert)",
        signaturBetrieb: autoSignatur("Betrieb"), signaturKunde: autoSignatur("Kunde vor Ort"),
      });
    }
  }, "🤖 Betrieb simuliert: Arbeit erledigt, Nachher-Foto + Rechnung + Unterschriften hochgeladen. Das 48h-Fenster läuft.");
}

/* ---- Buchen: Zwei-Vertrags-Modell ---- */
function openBuchenModal(order) {
  const b = E.findBetrieb(store, order.betriebId);
  const f = E.gebuehren(order.estimate.mid);
  openModal(`
    <h3>Kostenpflichtig buchen</h3>
    <p class="sub">${esc(b.name)} · Termin <b>${esc(order.slot)}</b></p>
    <div class="invoice">
      <table>
        <tr><td>Auftragswert (KI-Schätzung, Mittelwert)</td><td>${f.brutto.toLocaleString("de-DE")} €</td></tr>
        <tr><td>Servicegebühr / Käuferschutz (2,9 %)</td><td>${f.serviceFee.toLocaleString("de-DE")} €</td></tr>
        <tr class="total"><td>Einzahlung ins Treuhandkonto</td><td>${f.kundeZahlt.toLocaleString("de-DE")} €</td></tr>
      </table>
    </div>
    <p class="muted" style="font-size:.82rem; margin-top:8px;">🔒 Dein Geld liegt sicher bei MyService (Treuhand). Der Betrieb wird erst bezahlt, wenn du die Arbeit abgenommen hast – sonst greift der Käuferschutz.</p>
    <label class="checkline"><input type="checkbox" id="ck1" /> <span><b>Vertrag 1:</b> Ich akzeptiere die Nutzungsbedingungen der Plattform MyService.</span></label>
    <label class="checkline"><input type="checkbox" id="ck2" /> <span><b>Vertrag 2:</b> Ich schließe einen verbindlichen Werkvertrag mit <b>${esc(b.name)}</b> und akzeptiere dessen Ausführungsbedingungen.<br><small class="muted">${esc(b.agb)}</small></span></label>
    <div class="row" style="justify-content:flex-end;">
      <button class="btn" id="mAbbrechen">Abbrechen</button>
      <button class="btn primary" id="mZahlen">🔒 ${f.kundeZahlt.toLocaleString("de-DE")} € treuhänderisch zahlen</button>
    </div>`);
  $("#mAbbrechen").addEventListener("click", closeModal);
  $("#mZahlen").addEventListener("click", () => {
    tryAction(() => {
      E.buchen(store, order, { agbPlattform: $("#ck1").checked, werkvertrag: $("#ck2").checked });
      closeModal();
    });
  });
}

/* ---- Digitale Abnahme mit Unterschrift ---- */
function openAbnahmeModal(order) {
  openModal(`
    <h3>Digitale Abnahme</h3>
    <p class="sub">Mit deiner Unterschrift gilt die Arbeit als <b>formell abgenommen</b> – die Freigabe des Treuhandgeldes ist dann <b>unwiderruflich</b>.</p>
    ${invoiceHtml(order)}
    <label class="lbl" style="margin-top:12px;">Deine Unterschrift:</label>
    <canvas class="sigpad" id="sigAbnahme" width="480" height="120"></canvas>
    <div class="row spread" style="margin-top:10px;">
      <button class="btn small ghost" id="sigClear">Löschen</button>
      <div class="row">
        <button class="btn" id="mAbbrechen">Abbrechen</button>
        <button class="btn primary" id="mFreigeben">✍️ Abnehmen & Geld freigeben</button>
      </div>
    </div>`);
  const pad = initSigPad($("#sigAbnahme"));
  $("#sigClear").addEventListener("click", pad.clear);
  $("#mAbbrechen").addEventListener("click", closeModal);
  $("#mFreigeben").addEventListener("click", () => {
    if (!pad.hasInk()) { toast("Bitte unterschreibe zuerst im Feld.", true); return; }
    tryAction(() => {
      order.abnahmeSignatur = pad.dataUrl();
      const f = E.freigeben(store, order, "manuell");
      closeModal();
      toast(`✅ Abgenommen! ${f.betriebErhaelt.toLocaleString("de-DE")} € an den Betrieb ausgezahlt (Provision ${f.provision.toLocaleString("de-DE")} €).`);
    });
  });
}

/* ---- Problem melden ---- */
function openProblemModal(order) {
  openModal(`
    <h3>⚠️ Problem melden</h3>
    <p class="sub">Das Treuhandgeld wird <b>sofort eingefroren</b>. Der Betrieb hat nach deutschem Werkvertragsrecht zunächst das Recht auf kostenlose Nachbesserung.</p>
    <label class="lbl">Grund</label>
    <select id="pmGrund">
      <option>Mangelhafte Ausführung</option>
      <option>Leistung nicht erbracht</option>
      <option>Unterschrift gefälscht / nie geleistet</option>
      <option>Rechnung weicht stark von der Schätzung ab</option>
    </select>
    <label class="lbl">Beschreibung</label>
    <textarea id="pmText" placeholder="Was genau ist das Problem? (Fotos kannst du im Konflikt-Chat nachreichen)"></textarea>
    <p class="muted" style="font-size:.8rem;">Bei Verdacht auf gefälschte Unterschrift geht der Fall <b>direkt in die Mediation</b> der Plattform – ohne Nachbesserungsschleife.</p>
    <div class="row" style="justify-content:flex-end;">
      <button class="btn" id="mAbbrechen">Abbrechen</button>
      <button class="btn danger" id="mMelden">🧊 Problem melden & Geld einfrieren</button>
    </div>`);
  $("#mAbbrechen").addEventListener("click", closeModal);
  $("#mMelden").addEventListener("click", () => {
    tryAction(() => {
      E.problemMelden(store, order, $("#pmGrund").value, $("#pmText").value);
      closeModal();
    });
  });
}

/* =========================================================
   BETRIEB (B2B-Cockpit)
   ========================================================= */
let aktiverBetriebId = null;
let betriebTab = "anfragen";

function renderBetrieb() {
  const sel = $("#betriebSelect");
  if (!aktiverBetriebId) aktiverBetriebId = store.betriebe[0].id;
  sel.innerHTML = store.betriebe.map((b) => `<option value="${b.id}" ${b.id === aktiverBetriebId ? "selected" : ""}>${esc(b.name)} (${E.GEWERKE[b.gewerk].label})</option>`).join("");
  const b = E.findBetrieb(store, aktiverBetriebId);
  const meine = store.orders.filter((o) => o.betriebId === b.id);
  const offen = meine.filter((o) => o.status === "ANGEFRAGT");
  const umsatz = store.ledger.filter((l) => l.typ === "AUSZAHLUNG" && meine.some((o) => o.id === l.orderId)).reduce((a, l) => a + l.betrag, 0);

  $("#betriebStats").innerHTML = `
    <div class="tile"><div class="t-label">Auszahlungen (Demo)</div><div class="t-value">${umsatz.toLocaleString("de-DE")} €</div><div class="t-sub">nach Abzug von 10 % Provision</div></div>
    <div class="tile"><div class="t-label">Offene Anfragen</div><div class="t-value">${offen.length}</div><div class="t-sub">anonymisiert, ohne Anrufe</div></div>
    <div class="tile"><div class="t-label">Bewertung</div><div class="t-value">${b.rating.toLocaleString("de-DE")} <span class="stars" style="font-size:1rem;">★</span></div><div class="t-sub">${b.reviews.length} Bewertungen</div></div>
    <div class="tile"><div class="t-label">Ranking-Status</div><div class="t-value">${b.premium ? "Premium" : "Standard"}</div><div class="t-sub">${b.premium ? "79 €/Monat · bevorzugt gelistet" : "kostenlos gelistet"}</div></div>`;

  $$("#betriebTabs button").forEach((t) => t.classList.toggle("active", t.dataset.bt === betriebTab));
  const c = $("#betriebContent");
  if (betriebTab === "anfragen") renderBAnfragen(c, b, meine);
  else if (betriebTab === "auftraege") renderBAuftraege(c, b, meine);
  else if (betriebTab === "kalender") renderBKalender(c, b, meine);
  else if (betriebTab === "preise") renderBPreise(c, b);
  else if (betriebTab === "schnittstellen") renderBSchnittstellen(c, b, meine);
  else if (betriebTab === "statistik") renderBStatistik(c, b, meine);
}
$("#betriebSelect").addEventListener("change", (e) => { aktiverBetriebId = e.target.value; renderBetrieb(); });
$$("#betriebTabs button").forEach((t) => t.addEventListener("click", () => { betriebTab = t.dataset.bt; renderBetrieb(); }));

function renderBAnfragen(c, b, meine) {
  const offen = meine.filter((o) => o.status === "ANGEFRAGT");
  c.innerHTML = offen.length ? `<div class="stack">${offen.map((o) => {
    const p = E.findProblem(o.problemId);
    return `<div class="card order-card st-blue">
      <div class="row spread">
        <div><b>${esc(p.label)}</b> <span class="muted">von ${esc(o.alias)} (anonymisiert)</span></div>
        <span class="badge b-blue">Wunschtermin: ${esc(o.slot)}</span>
      </div>
      <p class="sub" style="margin:8px 0;">„${esc(o.text || "keine Beschreibung")}“ ${o.fotoLabel ? `<span class="chip mini">📷 ${esc(o.fotoLabel)}</span>` : ""}</p>
      <div class="row spread">
        <span class="muted">KI-Schätzung an den Kunden: <b>${o.estimate.min}–${o.estimate.max} €</b> (dein Grundpreis: ${o.estimate.base} € + ${o.estimate.anfahrt} € Anfahrt)</span>
        <div class="row">
          <button class="btn small" data-ablehnen="${o.id}">Ablehnen</button>
          <button class="btn small primary" data-annehmen="${o.id}">✓ Termin bestätigen</button>
        </div>
      </div>
    </div>`;
  }).join("")}</div>` : `<div class="card muted" style="text-align:center;">Keine offenen Anfragen. Neue Anfragen landen hier – ${b.interface === "email" ? "zusätzlich per E-Mail" : b.interface === "crm" ? "zusätzlich direkt in deinem CRM" : "zusätzlich im Excel-Export"} (Tab „Schnittstellen“).</div>`;
  const byId = (id) => store.orders.find((o) => o.id === id);
  $$("[data-annehmen]", c).forEach((x) => x.addEventListener("click", () => tryAction(() => E.anfrageAnnehmen(store, byId(x.dataset.annehmen)), "Termin bestätigt – der Kunde kann jetzt verbindlich buchen.")));
  $$("[data-ablehnen]", c).forEach((x) => x.addEventListener("click", () => tryAction(() => E.anfrageAblehnen(store, byId(x.dataset.ablehnen), "Kapazität ausgelastet"))));
}

function renderBAuftraege(c, b, meine) {
  const aktiv = meine.filter((o) => !["ANGEFRAGT", "ABGELEHNT"].includes(o.status));
  if (!aktiv.length) { c.innerHTML = `<div class="card muted" style="text-align:center;">Noch keine Aufträge. Sobald ein Kunde verbindlich bucht, erscheint der Auftrag hier.</div>`; return; }
  c.innerHTML = `<div class="stack">${[...aktiv].reverse().map((o) => {
    const p = E.findProblem(o.problemId);
    let actions = "";
    if (o.status === "BEZAHLT") actions = `<button class="btn small primary" data-start="${o.id}">🔨 Arbeit beginnen</button>`;
    if (o.status === "IN_ARBEIT") actions = `<button class="btn small primary" data-fertig="${o.id}">Arbeit abschließen → Doku</button>`;
    if (o.status === "DOKU" || (o.status === "NACHBESSERUNG" && o.dispute && o.dispute.nachbesserungSlot)) actions = `<button class="btn small primary" data-rechnung="${o.id}">📄 Rechnung + Doku hochladen</button>`;
    if (o.status === "PROBLEM") actions = `<button class="btn small" data-nachb="${o.id}">🛠 Kostenlosen Nachbesserungstermin vorschlagen</button>`;
    if (o.status === "MEDIATION") actions = `<input type="text" id="bewB-${o.id}" placeholder="Beweis (z. B. Abnahmeprotokoll)" style="max-width:240px;" />
      <button class="btn small" data-beweis="${o.id}" data-partei="betrieb">📎 Beweis einreichen</button>`;
    return `<div class="card order-card ${ST_CLS[o.status] || ""}">
      <div class="row spread">
        <div><b>${esc(p.label)}</b> <span class="muted">· ${esc(o.alias)} · ${o.id} · Termin ${esc(o.slot)}</span></div>
        <span class="badge ${ST_BADGE[o.status]}">${esc(E.STATUS_LABEL[o.status])}</span>
      </div>
      <div class="grid c2" style="margin-top:8px;">
        <div class="stack">
          ${escrowHtml(o)}
          ${o.invoice ? invoiceHtml(o) : ""}
          <div class="row">${actions}</div>
        </div>
        <div>${chatHtml(o, "betrieb")}</div>
      </div>
    </div>`;
  }).join("")}</div>`;
  const byId = (id) => store.orders.find((o) => o.id === id);
  bindOrderActions(c);
  $$("[data-start]", c).forEach((x) => x.addEventListener("click", () => tryAction(() => E.arbeitBeginnen(store, byId(x.dataset.start)))));
  $$("[data-fertig]", c).forEach((x) => x.addEventListener("click", () => tryAction(() => E.arbeitAbschliessen(store, byId(x.dataset.fertig)))));
  $$("[data-rechnung]", c).forEach((x) => x.addEventListener("click", () => openRechnungModal(byId(x.dataset.rechnung))));
  $$("[data-nachb]", c).forEach((x) => x.addEventListener("click", () => {
    const o = byId(x.dataset.nachb);
    const bb = E.findBetrieb(store, o.betriebId);
    const slot = E.freieSlots(store, bb).find((s) => !s.belegt);
    tryAction(() => E.nachbesserungVorschlagen(store, o, slot.key), "Nachbesserungstermin an den Kunden übermittelt.");
  }));
}

/* Rechnung nur mit Nachher-Foto + beiden Unterschriften (Prävention!) */
function openRechnungModal(order) {
  const p = E.findProblem(order.problemId);
  openModal(`
    <h3>📄 Rechnung & Pflicht-Doku hochladen</h3>
    <p class="sub">Ohne <b>Nachher-Foto</b> und <b>beide Unterschriften</b> lässt das System keine Rechnung zu – das schützt dich gegen falsche Behauptungen und den Kunden gegen Fälschung.</p>
    <label class="lbl">Rechnungsbetrag (brutto) – Schätzung war ${order.estimate.min}–${order.estimate.max} €</label>
    <input type="number" id="rgBetrag" value="${order.estimate.mid}" min="1" step="0.01" />
    <label class="lbl">Leistung</label>
    <input type="text" id="rgPos" value="${esc(p.label)}" />
    <label class="lbl">📷 Nachher-Foto der reparierten Stelle (Pflicht)</label>
    <div class="row">
      <input type="file" id="rgFoto" accept="image/*" style="width:auto;" />
      <button class="btn small ghost" id="rgFotoDemo">Demo-Foto verwenden</button>
      <span id="rgFotoState" class="muted">– noch kein Foto –</span>
    </div>
    <label class="lbl">✍️ Unterschrift Betrieb</label>
    <canvas class="sigpad" id="sigB" width="480" height="90"></canvas>
    <label class="lbl">✍️ Unterschrift Kunde (unterschreibt vor Ort auf deinem Gerät)</label>
    <canvas class="sigpad" id="sigK" width="480" height="90"></canvas>
    <div class="row spread" style="margin-top:10px;">
      <button class="btn small ghost" id="sigClear2">Unterschriften löschen</button>
      <div class="row">
        <button class="btn" id="mAbbrechen">Abbrechen</button>
        <button class="btn primary" id="mHochladen">Hochladen → 48h-Fenster starten</button>
      </div>
    </div>`);
  let foto = null;
  const padB = initSigPad($("#sigB")), padK = initSigPad($("#sigK"));
  $("#sigClear2").addEventListener("click", () => { padB.clear(); padK.clear(); });
  $("#rgFotoDemo").addEventListener("click", () => { foto = "Nachher-Foto (Demo)"; $("#rgFotoState").textContent = "✓ Demo-Foto hinterlegt"; });
  $("#rgFoto").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => { foto = file.name; $("#rgFotoState").textContent = "✓ " + file.name; };
    r.readAsDataURL(file);
  });
  $("#mAbbrechen").addEventListener("click", closeModal);
  $("#mHochladen").addEventListener("click", () => {
    tryAction(() => {
      E.rechnungHochladen(store, order, {
        betragBrutto: +$("#rgBetrag").value,
        positionen: [{ text: $("#rgPos").value, betrag: +$("#rgBetrag").value }],
        nachherFoto: foto,
        signaturBetrieb: padB.hasInk() ? padB.dataUrl() : null,
        signaturKunde: padK.hasInk() ? padK.dataUrl() : null,
      });
      closeModal();
      toast("📄 Rechnung hochgeladen. Der Kunde hat jetzt 48 Stunden für Freigabe oder Einspruch.");
    });
  });
}

function renderBKalender(c, b, meine) {
  const belegt = meine.filter((o) => !["ABGELEHNT", "STORNIERT", "ERSTATTET"].includes(o.status));
  c.innerHTML = `
  <div class="grid c2">
    <div class="card">
      <h3>Meine täglichen Zeitfenster</h3>
      <p class="muted">Diese Slots werden Kunden <b>live</b> als buchbar angezeigt (nächste 5 Werktage).</p>
      <div class="row" id="slotChips">${b.slotsProTag.map((s) => `<span class="chip">${s} <b data-delslot="${s}" style="cursor:pointer;">×</b></span>`).join("")}</div>
      <div class="row" style="margin-top:10px;">
        <input type="text" id="neuerSlot" placeholder="z. B. 17:30" style="max-width:120px;" />
        <button class="btn small" id="btnAddSlot">+ Zeitfenster</button>
      </div>
    </div>
    <div class="card">
      <h3>Gebuchte Termine</h3>
      ${belegt.length ? belegt.map((o) => `<div class="review"><b>${esc(o.slot)}</b> · ${esc(E.findProblem(o.problemId).label)} · ${esc(o.alias)} <span class="badge ${ST_BADGE[o.status]}">${o.status}</span></div>`).join("") : '<p class="muted">Noch keine Buchungen.</p>'}
    </div>
  </div>`;
  $("#btnAddSlot").addEventListener("click", () => {
    const v = $("#neuerSlot").value.trim();
    if (!/^\d{1,2}:\d{2}$/.test(v)) { toast("Format bitte HH:MM", true); return; }
    b.slotsProTag.push(v); b.slotsProTag.sort();
    save(); renderBetrieb(); toast("Zeitfenster live geschaltet – sofort für Kunden buchbar.");
  });
  $$("[data-delslot]", c).forEach((x) => x.addEventListener("click", () => {
    b.slotsProTag = b.slotsProTag.filter((s) => s !== x.dataset.delslot);
    save(); renderBetrieb();
  }));
}

function renderBPreise(c, b) {
  const probleme = E.PROBLEME.filter((p) => p.gewerk === b.gewerk);
  c.innerHTML = `
  <div class="card">
    <h3>Grundpreise – das Fundament der KI-Schätzungen</h3>
    <p class="muted">Jede Änderung wirkt <b>sofort</b> auf die Preisvorschläge, die Kunden bei der Suche sehen. Leer lassen = Leistung wird nicht angeboten.</p>
    <table class="pricetable">
      <tr><th>Standardleistung</th><th>Richtwert Markt</th><th>Dein Grundpreis (€)</th></tr>
      ${probleme.map((p) => `<tr><td>${esc(p.label)}</td><td class="muted">~${p.richtpreis} €</td>
        <td><input type="number" min="0" step="1" data-preis="${p.id}" value="${b.prices[p.id] != null ? b.prices[p.id] : ""}" placeholder="–" /></td></tr>`).join("")}
      <tr><td><b>Anfahrtspauschale</b></td><td></td><td><input type="number" min="0" step="1" id="prAnfahrt" value="${b.anfahrt}" /></td></tr>
    </table>
    <div class="row spread" style="margin-top:14px;">
      <label class="checkline" style="margin:0;"><input type="checkbox" id="prPremium" ${b.premium ? "checked" : ""} />
        <span><b>★ Premium-Ranking</b> (79 €/Monat) – bevorzugte Listung, immer transparent als „Premium“ markiert</span></label>
      <button class="btn primary" id="btnPreiseSpeichern">Speichern → wirkt live</button>
    </div>
  </div>`;
  $("#btnPreiseSpeichern").addEventListener("click", () => {
    $$("[data-preis]", c).forEach((inp) => {
      const v = inp.value.trim();
      if (v === "") delete b.prices[inp.dataset.preis];
      else b.prices[inp.dataset.preis] = Math.max(0, +v);
    });
    b.anfahrt = Math.max(0, +$("#prAnfahrt").value || 0);
    const neuPremium = $("#prPremium").checked;
    if (neuPremium !== b.premium) {
      b.premium = neuPremium;
      store.premiumAbos += neuPremium ? 1 : -1;
    }
    save(); renderBetrieb();
    toast("💾 Gespeichert. Die KI kalkuliert ab sofort mit deinen neuen Grundpreisen.");
  });
}

function renderBSchnittstellen(c, b, meine) {
  const kanaele = [
    { id: "crm", label: "🔗 Direkt ins CRM", desc: "Anfragen werden als Webhook (JSON) an dein Betriebssystem gepusht." },
    { id: "excel", label: "📊 Excel-Export", desc: "Alle Anfragen als CSV-Datei zum Import in deine Tabellen." },
    { id: "email", label: "✉️ Per E-Mail", desc: "Jede Anfrage kommt formatiert in dein Postfach – ganz simpel." },
  ];
  c.innerHTML = `
  <div class="card">
    <h3>Wie möchtest du Anfragen erhalten?</h3>
    <div class="grid c3" style="margin-top:10px;">
      ${kanaele.map((k) => `<label class="card" style="cursor:pointer; ${b.interface === k.id ? "outline:2px solid var(--brand);" : ""}">
        <input type="radio" name="iface" value="${k.id}" ${b.interface === k.id ? "checked" : ""} style="width:auto;" /> <b>${k.label}</b>
        <p class="muted" style="font-size:.82rem; margin:6px 0 0;">${k.desc}</p></label>`).join("")}
    </div>
    <div class="row" style="margin-top:14px;">
      <button class="btn" id="btnCsv">⬇️ Excel/CSV-Export herunterladen</button>
      <button class="btn" id="btnWebhook">👁 CRM-Webhook ansehen</button>
      <button class="btn" id="btnMail">👁 E-Mail-Vorschau ansehen</button>
    </div>
  </div>`;
  $$("input[name=iface]", c).forEach((r) => r.addEventListener("change", () => {
    b.interface = r.value; save(); renderBetrieb();
    toast("Anfrage-Kanal umgestellt auf: " + r.value.toUpperCase());
  }));
  $("#btnCsv").addEventListener("click", () => {
    const rows = [["AuftragsID", "Status", "Leistung", "Kunde(anonym)", "Termin", "Schätzung Min", "Schätzung Max", "Beschreibung"]];
    meine.forEach((o) => rows.push([o.id, o.status, E.findProblem(o.problemId).label, o.alias, o.slot, o.estimate.min, o.estimate.max, (o.text || "").replace(/[\n;]/g, " ")]));
    const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `myservice_anfragen_${b.id}.csv`;
    a.click();
    toast("CSV mit " + meine.length + " Anfragen exportiert.");
  });
  $("#btnWebhook").addEventListener("click", () => {
    const o = meine[meine.length - 1];
    const payload = o ? { event: "anfrage.neu", auftrag: { id: o.id, leistung: o.problemId, kunde: o.alias, termin: o.slot, schaetzung: o.estimate, beschreibung: o.text } } : { event: "anfrage.neu", hinweis: "Noch keine Anfrage vorhanden – Beispielstruktur", auftrag: { id: "A-1001", leistung: "rohr_verstopft", kunde: "Kunde #4821", termin: "Mi 02.07. 08:00", schaetzung: { min: 132, mid: 144, max: 174 } } };
    openModal(`<h3>CRM-Webhook (POST an dein System)</h3><pre style="background:var(--page);border-radius:10px;padding:14px;overflow-x:auto;font-size:.8rem;">${esc(JSON.stringify(payload, null, 2))}</pre><div class="row" style="justify-content:flex-end;"><button class="btn" onclick="document.getElementById('modalBackdrop').classList.remove('open')">Schließen</button></div>`);
  });
  $("#btnMail").addEventListener("click", () => {
    const o = meine[meine.length - 1];
    const p = o ? E.findProblem(o.problemId) : null;
    openModal(`<h3>E-Mail-Vorschau</h3><div class="invoice" style="font-size:.86rem;">
      <b>Von:</b> anfragen@myservice.app<br><b>An:</b> ${esc(b.name.toLowerCase().replace(/[^a-z]/g, ""))}@betrieb.de<br>
      <b>Betreff:</b> Neue Anfrage${o ? ": " + esc(p.label) : ""}<hr>
      ${o ? `Hallo ${esc(b.name)},<br><br>${esc(o.alias)} (anonymisiert) hat angefragt:<br>
      <b>Leistung:</b> ${esc(p.label)}<br><b>Wunschtermin:</b> ${esc(o.slot)}<br>
      <b>Beschreibung:</b> „${esc(o.text || "-")}“<br><b>KI-Schätzung an den Kunden:</b> ${o.estimate.min}–${o.estimate.max} €<br><br>
      → Annehmen oder ablehnen direkt in der App.` : "Noch keine Anfragen vorhanden."}
    </div><div class="row" style="justify-content:flex-end;"><button class="btn" onclick="document.getElementById('modalBackdrop').classList.remove('open')">Schließen</button></div>`);
  });
}

function renderBStatistik(c, b, meine) {
  const live = store.ledger.filter((l) => l.typ === "AUSZAHLUNG" && meine.some((o) => o.id === l.orderId)).reduce((a, l) => a + l.betrag, 0);
  // Seed-Historie (statisch) + laufender Monat live aus dem Ledger
  const basis = { b1: [2100, 2400, 1900, 2800, 2600], b4: [3100, 2900, 3300, 3000, 3500] }[b.id] || [1400, 1700, 1500, 1900, 1800];
  const monate = ["Feb", "Mär", "Apr", "Mai", "Jun"];
  const items = basis.map((v, i) => ({ label: monate[i], value: v, color: "var(--s1)" }));
  items.push({ label: "Jul (live)", value: Math.round(live), color: "var(--s2)", mark: true });
  const fertig = meine.filter((o) => o.status === "ABGESCHLOSSEN").length;
  const conv = meine.length ? Math.round((fertig / meine.length) * 100) : 0;
  c.innerHTML = `
  <div class="grid c2">
    <div class="card viz-root">
      <div class="viz-title">Umsatz über MyService</div>
      <div class="viz-sub">Auszahlungen nach Provision · Juli live aus dieser Demo</div>
      <div id="bChart"></div>
      <div class="legend"><span class="li"><span class="sw" style="background:var(--s1)"></span>Historie (Demo-Daten)</span><span class="li"><span class="sw" style="background:var(--s2)"></span>Laufender Monat (live)</span></div>
    </div>
    <div class="card">
      <h3>Kennzahlen</h3>
      <div class="grid c2">
        <div class="tile"><div class="t-label">Aufträge gesamt</div><div class="t-value">${meine.length}</div></div>
        <div class="tile"><div class="t-label">Abgeschlossen</div><div class="t-value">${fertig}</div></div>
        <div class="tile"><div class="t-label">Abschlussquote</div><div class="t-value">${conv} %</div></div>
        <div class="tile"><div class="t-label">Ø Rechnungswert</div><div class="t-value">${fertig ? Math.round(meine.filter((o) => o.invoice).reduce((a, o) => a + o.invoice.brutto, 0) / Math.max(1, meine.filter((o) => o.invoice).length)) : 0} €</div></div>
      </div>
      <p class="muted" style="margin-top:12px;">💡 Zeitersparnis: Terminfindung, Rechnungsstellung und Zahlungsabwicklung laufen komplett über die Plattform – kein Telefon, kein Papier.</p>
    </div>
  </div>`;
  vBarChart($("#bChart"), items);
}

/* =========================================================
   PLATTFORM (Betreiber-Cockpit)
   ========================================================= */
function renderPlattform() {
  const u = E.plattformUmsatz(store);
  const mediationen = store.orders.filter((o) => o.status === "MEDIATION");
  $("#plattformStats").innerHTML = `
    <div class="tile"><div class="t-label">🔒 Im Treuhandkonto</div><div class="t-value">${u.imTreuhand.toLocaleString("de-DE")} €</div><div class="t-sub">wartet auf Abnahme</div></div>
    <div class="tile"><div class="t-label">Plattform-Umsatz</div><div class="t-value">${(u.provision + u.serviceFee).toLocaleString("de-DE")} €</div><div class="t-sub">+ ${u.premium.toLocaleString("de-DE")} €/Monat Premium-Abos</div></div>
    <div class="tile"><div class="t-label">An Betriebe ausgezahlt</div><div class="t-value">${u.ausgezahlt.toLocaleString("de-DE")} €</div><div class="t-sub">nach digitaler Abnahme</div></div>
    <div class="tile"><div class="t-label">⚖️ Offene Mediationen</div><div class="t-value">${mediationen.length}</div><div class="t-sub">Rückerstattet bisher: ${u.erstattet.toLocaleString("de-DE")} €</div></div>`;

  hBarChart($("#umsatzViz"), [
    { label: "Provision (10 %)", value: u.provision, color: "var(--s1)", hint: "Anteil an jeder erfolgreichen Transaktion" },
    { label: "Servicegebühr (2,9 %)", value: u.serviceFee, color: "var(--s2)", hint: "Käuferschutz, zahlt der Kunde" },
    { label: "Premium-Abos / Monat", value: u.premium, color: "var(--s3)", hint: store.premiumAbos + " Betriebe × 79 €" },
  ]);

  $("#mediationList").innerHTML = mediationen.length ? mediationen.map((o) => {
    const b = E.findBetrieb(store, o.betriebId);
    return `<div class="card order-card st-critical">
      <b>${o.id}</b> · ${esc(E.findProblem(o.problemId).label)} · ${esc(b.name)} vs. ${esc(o.alias)}
      <div class="muted" style="font-size:.84rem;">Grund: ${esc(o.dispute.grund)} – „${esc(o.dispute.beschreibung || "")}“ (Runde ${o.dispute.runde})</div>
      <div class="grid c2" style="margin:8px 0;">
        <div><b style="font-size:.8rem;">Beweise Kunde (${o.dispute.beweise.kunde.length})</b>${o.dispute.beweise.kunde.map((x) => `<div class="review">📎 ${esc(x.text)}</div>`).join("") || '<div class="muted" style="font-size:.8rem;">– keine –</div>'}</div>
        <div><b style="font-size:.8rem;">Beweise Betrieb (${o.dispute.beweise.betrieb.length})</b>${o.dispute.beweise.betrieb.map((x) => `<div class="review">📎 ${esc(x.text)}</div>`).join("") || '<div class="muted" style="font-size:.8rem;">– keine –</div>'}</div>
      </div>
      <input type="text" id="med-${o.id}" placeholder="Begründung der Entscheidung" style="margin-bottom:8px;" />
      <div class="row">
        <button class="btn small" data-med="${o.id}" data-fuer="kunde">↩️ Für den Kunden (volle Rückerstattung)</button>
        <button class="btn small" data-med="${o.id}" data-fuer="betrieb">✅ Für den Betrieb (Auszahlung)</button>
      </div>
    </div>`;
  }).join("") : `<p class="muted">Keine offenen Fälle. Eskalationen aus „Problem melden“ landen hier.</p>`;
  $$("#mediationList [data-med]").forEach((x) => x.addEventListener("click", () => {
    const o = store.orders.find((oo) => oo.id === x.dataset.med);
    const beg = $("#med-" + o.id).value.trim() || "Entscheidung nach Plattform-Richtlinien.";
    tryAction(() => E.mediationEntscheiden(store, o, x.dataset.fuer, beg), "⚖️ Mediation entschieden.");
  }));

  const rows = [...store.ledger].reverse();
  $("#ledgerTable").innerHTML = `<tr><th>Zeit</th><th>Auftrag</th><th>Typ</th><th>Notiz</th><th style="text-align:right;">Betrag</th></tr>` +
    (rows.length ? rows.map((l) => `<tr><td>${fmtTime(l.ts)}</td><td>${esc(l.orderId || "–")}</td>
      <td><span class="badge ${l.typ === "RUECKERSTATTUNG" || l.typ === "TEILERSTATTUNG" ? "b-serious" : l.typ === "AUSZAHLUNG" ? "b-good" : "b-blue"}">${esc(l.typ)}</span></td>
      <td class="muted">${esc(l.notiz)}</td><td class="num"><b>${l.betrag.toLocaleString("de-DE")} €</b></td></tr>`).join("")
      : `<tr><td colspan="5" class="muted" style="text-align:center; padding:20px;">Noch keine Geldflüsse – buche als Kunde einen Auftrag, um das Treuhand-System in Aktion zu sehen.</td></tr>`);
}

/* =========================================================
   Global Rendering
   ========================================================= */
function renderHeader() {
  const offen = store.orders.filter((o) => !["ABGESCHLOSSEN", "ERSTATTET", "STORNIERT", "ABGELEHNT"].includes(o.status)).length;
  const anfr = store.orders.filter((o) => o.status === "ANGEFRAGT").length;
  const med = store.orders.filter((o) => o.status === "MEDIATION").length;
  const set = (id, n) => { const el = $(id); el.hidden = !n; el.textContent = n; };
  set("#cntOrders", offen); set("#cntAnfragen", anfr); set("#cntMediation", med);
  const t = new Date(E.now(store));
  $("#clock").textContent = "🕐 " + t.toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + (store.clockOffsetMs ? " (simuliert)" : "");
}

function renderAll() {
  renderHeader();
  if (activeView === "start") renderFeeSplit();
  if (activeView === "kunde") renderKunde();
  if (activeView === "auftraege") renderOrders();
  if (activeView === "betrieb") renderBetrieb();
  if (activeView === "plattform") renderPlattform();
}

/* Automatik: 48h-Fenster regelmäßig prüfen, Uhr aktualisieren */
setInterval(() => {
  const rel = E.tick(store);
  if (rel.length) { rel.forEach((id) => toast(`⏱ 48h abgelaufen – Auftrag ${id} automatisch freigegeben & ausgezahlt.`)); save(); renderAll(); }
  renderHeader();
}, 5000);

renderFeeSplit();
renderAll();
