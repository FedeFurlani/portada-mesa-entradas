/* =========================================================
   Portada Mesa de Entradas · UNSJ
   Datos -> portada vectorial -> PNG/JPG en alta calidad
   ========================================================= */

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT = '"Times New Roman", Times, serif';
const BASE_SIZE = 9.2;
const MIN_SIZE = 5.6;

/* Lienzo A4: 210×297 mm → 511 × PAGE_H */
const PAGE_W = 511;
const PAGE_H = +(511 * 297 / 210).toFixed(2); /* 722.56 */

/* geometría de cada campo (unidades del SVG) */
const GEO = {
  exp:       { x: 276, y: 297, maxW: 103 },
  letra:     { x: 419, y: 297, maxW: 36  },
  dia:       { x: 290, y: 487, maxW: 30  },
  mes:       { x: 322, y: 487, maxW: 62  },
  anio:      { x: 401, y: 487, maxW: 54  },
  iniciador: { x: [278, 230], y: [349, 368.5], maxW: [175, 224] },
  extracto:  { x: [278, 230, 230], y: [394, 411.5, 429.5], maxW: [175, 224, 224] },
};

/* estado guardado (posiciones que quedaron bien) */
const DEFAULT_OFFSETS = {
  exp:   [-4.12, 92.31],
  letra: [20.60, 96.43],
  ini:   [-5.77, 112.09],
  ext:   [-4.90, 118.84],
  fecha: [-17.31, 154.95]
};

/* ancla de escala por casilla (sobre el renglón) para que al agrandar no se desfase */
const ANCHOR = {
  exp:   [328, 299.5],
  letra: [437, 299.5],
  ini:   [342, 360],
  ext:   [342, 413],
  fecha: [340, 487]
};

function fontScale() {
  return Math.min(200, Math.max(70, parseFloat($("#f-font").value) || 100)) / 100;
}

const $ = (s) => document.querySelector(s);
const meas = document.createElement("canvas").getContext("2d");

function width(text, size, weight = 400) {
  meas.font = `${weight} ${size}px ${FONT}`;
  return meas.measureText(text).width;
}

/* ---------- una línea, ajustando tamaño ---------- */
function renderSingle(el, text, g) {
  el.textContent = text || "";
  el.style.fontSize = BASE_SIZE + "px";
  if (!text) return;
  let size = BASE_SIZE;
  while (size > MIN_SIZE && width(text, size) > g.maxW) size -= 0.2;
  el.style.fontSize = size.toFixed(2) + "px";
}

/* ---------- varias líneas ---------- */
function wrapLines(text, size, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  const limit = (i) => (Array.isArray(maxW) ? maxW[Math.min(i, maxW.length - 1)] : maxW);

  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (!cur || width(test, size) <= limit(lines.length)) cur = test;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function renderLines(el, text, g) {
  el.textContent = "";
  if (!text) return;
  const maxLines = g.y.length;

  let size = BASE_SIZE, lines = wrapLines(text, size, g.maxW);
  while (lines.length > maxLines && size > MIN_SIZE) {
    size -= 0.2;
    lines = wrapLines(text, size, g.maxW);
  }
  lines = lines.slice(0, maxLines);
  el.style.fontSize = size.toFixed(2) + "px";

  lines.forEach((line, i) => {
    const t = document.createElementNS(SVG_NS, "tspan");
    t.setAttribute("x", g.x[Math.min(i, g.x.length - 1)]);
    t.setAttribute("y", g.y[i]);
    t.textContent = line;
    el.appendChild(t);
  });
}

/* ---------- inputs ---------- */
const FIELDS = ["exp", "letra", "iniciador", "extracto", "dia", "mes", "anio"];
const els = Object.fromEntries(FIELDS.map(f => [f, $("#f-" + f)]));

const SAMPLE = {
  exp: "15-2026",
  letra: "A",
  iniciador: "TEST IMPRESION",
  extracto: "TEST IMPRESION",
  dia: "30",
  mes: "octubre",
  anio: "2026"
};

function fillSample({ silent = false } = {}) {
  FIELDS.forEach(f => { els[f].value = SAMPLE[f] || ""; });
  save();
  update();
  if (!silent) toast("Datos de prueba cargados");
}

function valueOf(key) {
  const raw = els[key].value.trim();
  if (key === "exp" || key === "letra") return raw.toUpperCase();
  return raw;
}

function update() {
  renderSingle($("#v-exp"), valueOf("exp"), GEO.exp);
  renderSingle($("#v-letra"), valueOf("letra"), GEO.letra);
  renderSingle($("#v-dia"), valueOf("dia"), GEO.dia);
  renderSingle($("#v-mes"), valueOf("mes"), GEO.mes);
  renderSingle($("#v-anio"), valueOf("anio"), GEO.anio);
  renderLines($("#v-ini"), els.iniciador.value.trim(), GEO.iniciador);
  renderLines($("#v-ext"), els.extracto.value.trim(), GEO.extracto);
  $("#fileName").textContent = fileName("png");
  refreshBoxes();
}

function fileName(ext) {
  const exp = valueOf("exp").replace(/[^\w\-.]+/g, "-").replace(/^-|-$/g, "");
  const suffix = mode === "text" ? " - solo texto" : "";
  return `Portada Mesa de Entradas${exp ? " " + exp : ""}${suffix}.${ext}`;
}

/* ---------- posiciones individuales (arrastrar cada dato) ---------- */
const OFFSETS_KEY = "unsj-offsets";
const VFIELDS = ["exp", "letra", "ini", "ext", "fecha"];
let offsets = {};

/* historial de movimientos: Ctrl+Z deshace · Ctrl+Shift+Z / Ctrl+Y rehace */
const HIST_MAX = 60;
let hist = [];
let histIdx = -1;
let histLock = false;

function cloneOffsets(src = offsets) {
  const o = {};
  VFIELDS.forEach(f => { o[f] = [...(src[f] || [0, 0])]; });
  return o;
}

function offsetsEqual(a, b) {
  return VFIELDS.every(f => {
    const aa = a[f] || [0, 0], bb = b[f] || [0, 0];
    return aa[0] === bb[0] && aa[1] === bb[1];
  });
}

function syncHistButtons() {
  const canUndo = histIdx > 0;
  const canRedo = histIdx >= 0 && histIdx < hist.length - 1;
  ["btnUndo", "btnUndoPaper", "btnRedo", "btnRedoPaper"].forEach(id => {
    const el = $("#" + id);
    if (!el) return;
    const isUndo = id.toLowerCase().includes("undo");
    el.disabled = isUndo ? !canUndo : !canRedo;
  });
}

function pushHistory() {
  if (histLock) return;
  const snap = cloneOffsets();
  if (histIdx >= 0 && offsetsEqual(hist[histIdx], snap)) return;
  hist = hist.slice(0, histIdx + 1);
  hist.push(snap);
  if (hist.length > HIST_MAX) hist.shift();
  histIdx = hist.length - 1;
  syncHistButtons();
}

function applyHistorySnap(snap) {
  histLock = true;
  VFIELDS.forEach(f => { offsets[f] = [...(snap[f] || [0, 0])]; });
  applyOffsets();
  saveOffsets();
  histLock = false;
  syncHistButtons();
}

function undoMove() {
  if (histIdx <= 0) { toast("Nada para deshacer"); syncHistButtons(); return false; }
  histIdx -= 1;
  applyHistorySnap(hist[histIdx]);
  toast("Movimiento deshecho");
  return true;
}

function redoMove() {
  if (histIdx >= hist.length - 1) { toast("Nada para rehacer"); syncHistButtons(); return false; }
  histIdx += 1;
  applyHistorySnap(hist[histIdx]);
  toast("Movimiento rehecho");
  return true;
}

function loadOffsets() {
  try { offsets = JSON.parse(localStorage.getItem(OFFSETS_KEY) || "{}"); } catch { offsets = {}; }
  VFIELDS.forEach(f => {
    const v = offsets[f];
    if (!Array.isArray(v) || v.length !== 2 || !isFinite(v[0]) || !isFinite(v[1])) {
      offsets[f] = [...(DEFAULT_OFFSETS[f] || [0, 0])];
    }
  });
}

/* ---------- guardado compartido (ajustes.json, entre navegadores) ---------- */
const API_URL = ""; /* sync local opcional; en hosting público no hay servidor */
const STAMP_KEY = "unsj-offsets-stamp";
let pushTimer = null;
let syncing = false;
let ready = false;

function localStamp() {
  try { return localStorage.getItem(STAMP_KEY) || ""; } catch { return ""; }
}

function stampNow() {
  const iso = new Date().toISOString();
  try { localStorage.setItem(STAMP_KEY, iso); } catch {}
  return iso;
}

function pushShared(force = false) {
  if (syncing || (!ready && !force)) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const iso = stampNow();
    const payload = {
      updated: iso,
      offsets,
      adjust: {
        s: $("#f-scale").value,
        x: $("#f-dx").value,
        y: $("#f-dy").value,
        font: $("#f-font").value
      }
    };
    try {
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(payload)
      });
    } catch {}
  }, 250);
}

async function pullShared() {
  try {
    const r = await fetch(API_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json();
    if (!data || typeof data !== "object") return;

    const remote = data.updated || "";
    if (!remote || remote <= localStamp()) {
      if (localStamp()) pushShared(true);
      return;
    }

    syncing = true;
    if (data.offsets) {
      VFIELDS.forEach(f => {
        const v = data.offsets[f];
        if (Array.isArray(v) && v.length === 2 && isFinite(v[0]) && isFinite(v[1])) offsets[f] = v;
      });
    }
    if (data.adjust) {
      if (data.adjust.s != null) $("#f-scale").value = data.adjust.s;
      if (data.adjust.x != null) $("#f-dx").value = data.adjust.x;
      if (data.adjust.y != null) $("#f-dy").value = data.adjust.y;
      if (data.adjust.font != null) $("#f-font").value = data.adjust.font;
    }
    try {
      localStorage.setItem(OFFSETS_KEY, JSON.stringify(offsets));
      localStorage.setItem(STAMP_KEY, remote);
      localStorage.setItem("unsj-adjust", JSON.stringify({
        s: $("#f-scale").value, x: $("#f-dx").value, y: $("#f-dy").value, font: $("#f-font").value
      }));
    } catch {}
    applyOffsets();
    applyAdjust();
    applyFont();
    update();
    pushHistory();
    syncing = false;
    toast("Posiciones sincronizadas");
  } catch {}
}

function saveOffsets() {
  try { localStorage.setItem(OFFSETS_KEY, JSON.stringify(offsets)); } catch {}
  pushShared();
}

function applyOffsets() {
  const s = fontScale();
  document.querySelectorAll(".fgroup").forEach(g => {
    const field = g.dataset.field;
    const [dx, dy] = offsets[field] || [0, 0];
    const [ax, ay] = ANCHOR[field] || [0, 0];
    const parts = [];
    if (dx || dy) parts.push(`translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
    if (Math.abs(s - 1) > 0.001) {
      parts.push(`translate(${ax} ${ay}) scale(${s.toFixed(4)}) translate(${(-ax).toFixed(2)} ${(-ay).toFixed(2)})`);
    }
    if (parts.length) g.setAttribute("transform", parts.join(" "));
    else g.removeAttribute("transform");
  });
}

function visibleBBox(g) {
  let b = null;
  [...g.children].forEach(ch => {
    if (ch.classList.contains("vbox")) return;
    if (getComputedStyle(ch).display === "none") return;
    let cb = null;
    try { cb = ch.getBBox(); } catch {}
    if (!cb || (!cb.width && !cb.height)) return;
    b = b
      ? {
          x: Math.min(b.x, cb.x),
          y: Math.min(b.y, cb.y),
          x2: Math.max(b.x2, cb.x + cb.width),
          y2: Math.max(b.y2, cb.y + cb.height)
        }
      : { x: cb.x, y: cb.y, x2: cb.x + cb.width, y2: cb.y + cb.height };
  });
  return b ? { x: b.x, y: b.y, width: b.x2 - b.x, height: b.y2 - b.y } : null;
}

function refreshBoxes() {
  document.querySelectorAll(".fgroup").forEach(g => {
    let box = g.querySelector(".vbox");
    if (!box) {
      box = document.createElementNS(SVG_NS, "rect");
      box.setAttribute("class", "vbox");
      g.insertBefore(box, g.firstChild);
    }

    const b = visibleBBox(g);
    if (!b || !b.width || !b.height) {
      box.setAttribute("width", 0);
      box.setAttribute("height", 0);
      return;
    }
    const pad = 3;
    box.setAttribute("x", b.x - pad);
    box.setAttribute("y", b.y - pad);
    box.setAttribute("width", b.width + pad * 2);
    box.setAttribute("height", b.height + pad * 2);
  });
}

let selectedGroup = null;
function selectGroup(g) {
  document.querySelectorAll(".fgroup.is-selected").forEach(n => n.classList.remove("is-selected"));
  selectedGroup = g || null;
  if (selectedGroup) selectedGroup.classList.add("is-selected");
}

function initDrag() {
  document.querySelectorAll(".fgroup").forEach(g => {
    g.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      selectGroup(g);

      const rect = $("#cover").getBoundingClientRect();
      const k = PAGE_W / rect.width;
      const field = g.dataset.field;
      const [x0, y0] = offsets[field];
      const before = cloneOffsets();
      const sx = e.clientX, sy = e.clientY;

      g.classList.add("dragging");
      const move = (ev) => {
        offsets[field] = [x0 + (ev.clientX - sx) * k, y0 + (ev.clientY - sy) * k];
        applyOffsets();
      };
      const up = () => {
        g.classList.remove("dragging");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (!offsetsEqual(before, offsets)) {
          hist = hist.slice(0, histIdx + 1);
          if (histIdx < 0 || !offsetsEqual(hist[histIdx], before)) hist.push(before);
          hist.push(cloneOffsets());
          if (hist.length > HIST_MAX) hist = hist.slice(hist.length - HIST_MAX);
          histIdx = hist.length - 1;
          syncHistButtons();
        }
        saveOffsets();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  });

  $("#cover").addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".fgroup")) selectGroup(null);
  });
}

/* ---------- guía de diseño ---------- */
function setGuide(on) {
  const active = !!on && mode === "text";
  $("#cover").classList.toggle("guide", active);
  document.body.classList.toggle("guide-on", active);
  $("#f-guide").checked = !!on;
  try { localStorage.setItem("unsj-guide", on ? "1" : "0"); } catch {}
  if (mode === "text") refreshBoxes();
}

/* ---------- modo: portada completa / solo texto ---------- */
let mode = "full";

function setMode(m, { silent = false } = {}) {
  mode = m === "text" ? "text" : "full";
  const cover = $("#cover");
  cover.classList.toggle("text-only", mode === "text");
  document.body.classList.toggle("mode-text", mode === "text");

  document.querySelectorAll(".seg__btn[data-mode]").forEach(b => {
    b.classList.toggle("is-on", b.dataset.mode === mode);
  });

  $("#adjust").hidden = false;
  $("#guideLabel").hidden = mode === "full";
  $("#adjustTip").textContent = mode === "text"
    ? "Arrastrá un dato · flechas = ajuste fino"
    : "Arrastrá una casilla completa (etiqueta + renglón + dato)";
  setGuide($("#f-guide").checked);

  $("#hint").textContent = mode === "text"
    ? "Arrastrá cada dato para moverlo. Usá A− / A+ en la hoja para el tamaño. Flechas = ajuste fino. Al imprimir: Márgenes «Ninguno» y Escala 100%."
    : "Arrastrá cualquier casilla para moverla. Usá A− / A+ en la hoja para el tamaño. Flechas = ajuste fino.";

  $("#noteText").innerHTML = mode === "text"
    ? "Modo <strong>solo texto</strong>: se descarga un PNG transparente con los datos, listo para superponer a la hoja preimpresa."
    : "El archivo se genera a <strong>300 dpi</strong>. Los datos quedan guardados en este navegador.";

  try { localStorage.setItem("unsj-mode", mode); } catch {}
  applyAdjust();
  applyOffsets();
  update();
  if (!silent) toast(mode === "text" ? "Modo solo texto" : "Portada completa");
}

/* ---------- ajuste fino ---------- */
const UNITS_PER_MM = PAGE_W / 210;

function syncFontHud() {
  const el = $("#fontHudVal");
  if (el) el.textContent = `${Math.round(parseFloat($("#f-font").value) || 100)}%`;
}

function applyFont() {
  const pct = Math.min(200, Math.max(70, parseFloat($("#f-font").value) || 100));
  $("#f-font").value = pct;
  syncFontHud();
  try {
    const a = JSON.parse(localStorage.getItem("unsj-adjust") || "{}");
    a.font = String(pct);
    localStorage.setItem("unsj-adjust", JSON.stringify(a));
  } catch {}
  applyOffsets();
  refreshBoxes();
  pushShared();
}

function nudgeFont(delta) {
  const cur = Math.min(200, Math.max(70, parseFloat($("#f-font").value) || 100));
  $("#f-font").value = Math.round(cur + delta);
  applyFont();
}

function applyAdjust() {
  const g = $("#page");
  const s = Math.min(160, Math.max(40, parseFloat($("#f-scale").value) || 100)) / 100;
  const dx = (parseFloat($("#f-dx").value) || 0) * UNITS_PER_MM;
  const dy = (parseFloat($("#f-dy").value) || 0) * UNITS_PER_MM;
  if (s === 1 && dx === 0 && dy === 0) g.removeAttribute("transform");
  else g.setAttribute("transform", `translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${s.toFixed(4)})`);
  try {
    localStorage.setItem("unsj-adjust", JSON.stringify({
      s: $("#f-scale").value,
      x: $("#f-dx").value,
      y: $("#f-dy").value,
      font: $("#f-font").value
    }));
  } catch {}
  pushShared();
}

function restoreAdjust() {
  try {
    const a = JSON.parse(localStorage.getItem("unsj-adjust") || "{}");
    if (a.s != null) $("#f-scale").value = a.s;
    if (a.x != null) $("#f-dx").value = a.x;
    if (a.y != null) $("#f-dy").value = a.y;
    if (a.font != null) $("#f-font").value = a.font;
  } catch {}
  applyAdjust();
  applyFont();
}

/* ---------- persistencia ---------- */
const KEY = "unsj-portada-v1";

function save() {
  const data = {};
  FIELDS.forEach(f => { data[f] = els[f].value; });
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

function restore() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "{}");
    FIELDS.forEach(f => { if (data[f] != null) els[f].value = data[f]; });
  } catch {}
}

/* ---------- export ---------- */
async function exportImage(format, height) {
  const source = $("#cover");
  const clone = source.cloneNode(true);
  clone.querySelectorAll(".vbox").forEach(n => n.remove());
  const w = Math.round(height * PAGE_W / PAGE_H);

  if (mode === "text") {
    clone.querySelectorAll(".design, .dp").forEach(n => n.remove());
    /* PNG: transparente. JPG: necesita fondo blanco. */
    if (format === "jpeg") {
      const sheet = clone.querySelector(".sheet");
      if (sheet) sheet.setAttribute("fill", "#ffffff");
    } else {
      clone.querySelector(".sheet")?.remove();
    }
  }

  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("width", w);
  clone.setAttribute("height", height);
  clone.setAttribute("viewBox", `0 0 ${PAGE_W} ${PAGE_H}`);
  clone.setAttribute("preserveAspectRatio", "xMinYMin meet");

  const xml = new XMLSerializer().serializeToString(clone);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);

  const img = new Image();
  img.decoding = "sync";
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("No se pudo dibujar la portada"));
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (format === "jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, height);
  }
  ctx.drawImage(img, 0, 0, w, height);

  const ext = format === "jpeg" ? "jpg" : "png";
  const blob = await new Promise(res =>
    canvas.toBlob(res, format === "jpeg" ? "image/jpeg" : "image/png", 0.94)
  );

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName(ext);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);

  toast(`Descargado: ${a.download} · ${w} × ${height} px`);
}

/* ---------- UI ---------- */
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), 3200);
}

$("#btnPng").addEventListener("click", async (e) => {
  const b = e.currentTarget;
  b.disabled = true;
  try { await exportImage("png", 3508); }
  catch (err) { toast("No se pudo generar el PNG. Probá de nuevo."); console.error(err); }
  finally { b.disabled = false; }
});

$("#btnJpg").addEventListener("click", async () => {
  try { await exportImage("jpeg", 1754); }
  catch (err) { toast("No se pudo generar el JPG."); console.error(err); }
});

let printLayout = "full"; /* full = opción 1 · half = opción 2 media hoja */

const PRINT_DESC = {
  full: "Opción 1 · Hoja A4 completa (portada entera)",
  half: "Opción 2 · Solo casillas en la mitad superior del A4"
};

function setPrintLayout(layout, { silent = false } = {}) {
  printLayout = layout === "half" ? "half" : "full";
  document.querySelectorAll("[data-print]").forEach(b => {
    b.classList.toggle("is-on", b.dataset.print === printLayout);
  });
  const desc = $("#printOptDesc");
  if (desc) desc.textContent = PRINT_DESC[printLayout];
  try { localStorage.setItem("unsj-print-layout", printLayout); } catch {}
  if (!silent) toast(PRINT_DESC[printLayout]);
}

function coverSvgMarkup(layout = printLayout) {
  const clone = $("#cover").cloneNode(true);
  clone.querySelectorAll(".vbox").forEach(n => n.remove());
  clone.removeAttribute("class");
  clone.removeAttribute("id");
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("preserveAspectRatio", "xMinYMin meet");

  if (layout === "half") {
    /* solo el bloque Expie / Letra / Iniciador / Extracto / fecha */
    clone.querySelectorAll(".design").forEach(n => n.remove());
    let b = { x: 220, y: 285, width: 250, height: 220 };
    try {
      const live = $("#fields").getBBox();
      if (live && live.width && live.height) b = live;
    } catch {}
    const padX = 16, padY = 18;
    const x = Math.max(0, b.x - padX);
    const y = Math.max(0, b.y - padY);
    const w = Math.min(PAGE_W - x, b.width + padX * 2);
    const h = Math.min(PAGE_H - y, b.height + padY * 2);
    const sheet = clone.querySelector(".sheet");
    if (sheet) {
      sheet.setAttribute("x", x);
      sheet.setAttribute("y", y);
      sheet.setAttribute("width", w);
      sheet.setAttribute("height", h);
      sheet.setAttribute("fill", "#FFFFFF");
    }
    clone.setAttribute("viewBox", `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
  } else {
    if (mode === "text") clone.querySelectorAll(".design, .dp").forEach(n => n.remove());
    clone.setAttribute("viewBox", `0 0 ${PAGE_W} ${PAGE_H}`);
  }
  return new XMLSerializer().serializeToString(clone);
}

function printPreviewHtml(markup, layout = printLayout) {
  const autoPrint = `
<script>
(function(){
  function go(){ try { focus(); print(); } catch(e) {} }
  if (document.readyState === "complete") setTimeout(go, 250);
  else addEventListener("load", function(){ setTimeout(go, 250); });
})();
<\/script>`;

  if (layout === "half") {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Imprimir · media hoja</title>
<style>
  @page{ size: A4 portrait; margin: 0; }
  html, body{ margin: 0; padding: 0; width: 210mm; height: 297mm; overflow: hidden; background: #fff; }
  .slot{
    position: absolute; top: 0; left: 0;
    width: 210mm; height: 148.5mm;
    box-sizing: border-box; padding: 10mm 14mm 8mm;
  }
  .slot svg{ display: block; width: 100%; height: 100%; }
</style></head><body>
<div class="slot">${markup}</div>
${autoPrint}
</body></html>`;
  }

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Imprimir · hoja completa</title>
<style>
  @page{ size: A4 portrait; margin: 0; }
  html, body{ margin: 0; padding: 0; width: 210mm; height: 297mm; overflow: hidden; background: #fff; }
  svg{ position: absolute; top: 0; left: 0; width: 210mm; height: 297mm; }
</style></head><body>
${markup}
${autoPrint}
</body></html>`;
}

function openPrintDialog() {
  const html = printPreviewHtml(coverSvgMarkup(printLayout), printLayout);
  const w = window.open("", "_blank");
  if (!w) {
    toast("Permití las ventanas emergentes para imprimir");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  try { w.focus(); } catch {}
}

$("#btnPrint").addEventListener("click", () => openPrintDialog());

document.querySelectorAll("[data-print]").forEach(btn => {
  btn.addEventListener("click", () => setPrintLayout(btn.dataset.print));
});

$("#btnClear").addEventListener("click", () => {
  FIELDS.forEach(f => { els[f].value = ""; });
  save(); update();
  toast("Datos borrados");
});

$("#btnSample").addEventListener("click", () => fillSample());

$("#btnToday").addEventListener("click", () => {
  const now = new Date();
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                 "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  els.dia.value = now.getDate();
  els.mes.value = meses[now.getMonth()];
  els.anio.value = now.getFullYear();
  save(); update();
});

document.querySelectorAll(".seg__btn[data-mode]").forEach(btn => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

const previewEl = document.querySelector(".preview");
function syncFullscreen() {
  const on = document.fullscreenElement === previewEl;
  $("#btnFs").setAttribute("aria-pressed", on ? "true" : "false");
  $("#btnFs").textContent = on ? "Salir de pantalla completa" : "Pantalla completa";
}
$("#btnFs").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement === previewEl) await document.exitFullscreen();
    else await previewEl.requestFullscreen();
  } catch {
    toast("No se pudo abrir la pantalla completa");
  }
});
document.addEventListener("fullscreenchange", syncFullscreen);

FIELDS.forEach(f => {
  els[f].addEventListener("input", () => { save(); update(); });
});

/* atajos: Ctrl/Cmd + S exporta; Ctrl+Z / Ctrl+Y movimientos; +/− letra */
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    $("#btnPng").click();
    return;
  }

  const tag = (document.activeElement || {}).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) redoMove();
    else undoMove();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
    e.preventDefault();
    redoMove();
    return;
  }

  if (e.key === "+" || e.key === "=") {
    e.preventDefault();
    nudgeFont(e.shiftKey ? 10 : 5);
    return;
  }
  if (e.key === "-" || e.key === "_") {
    e.preventDefault();
    nudgeFont(e.shiftKey ? -10 : -5);
    return;
  }

  if (!selectedGroup) return;

  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!dir) return;

  e.preventDefault();
  const step = e.shiftKey ? 4 : 1;
  const f = selectedGroup.dataset.field;
  offsets[f] = [offsets[f][0] + dir[0] * step, offsets[f][1] + dir[1] * step];
  applyOffsets();
  pushHistory();
  saveOffsets();
});

$("#btnFontUp").addEventListener("click", () => nudgeFont(5));
$("#btnFontDown").addEventListener("click", () => nudgeFont(-5));

["f-scale", "f-dx", "f-dy"].forEach(id => {
  $("#" + id).addEventListener("input", applyAdjust);
});
$("#f-font").addEventListener("input", applyFont);

$("#f-guide").addEventListener("change", (e) => setGuide(e.target.checked));

["btnUndo", "btnUndoPaper"].forEach(id => {
  $("#" + id).addEventListener("click", () => undoMove());
});
["btnRedo", "btnRedoPaper"].forEach(id => {
  $("#" + id).addEventListener("click", () => redoMove());
});

$("#btnResetFields").addEventListener("click", () => {
  VFIELDS.forEach(f => { offsets[f] = [...(DEFAULT_OFFSETS[f] || [0, 0])]; });
  applyOffsets();
  pushHistory();
  saveOffsets();
  toast("Posiciones restablecidas");
});

$("#btnResetAdjust").addEventListener("click", () => {
  $("#f-scale").value = 100;
  $("#f-dx").value = 0;
  $("#f-dy").value = 0;
  $("#f-font").value = 100;
  applyAdjust();
  applyFont();
  toast("Ajuste reiniciado");
});

/* init */
restore();
fillSample({ silent: true }); /* datos de prueba al abrir */
restoreAdjust();
loadOffsets();
applyOffsets();
pushHistory(); /* estado inicial para poder deshacer */
syncHistButtons();
initDrag();
try { $("#f-guide").checked = localStorage.getItem("unsj-guide") !== "0"; } catch {}
try { mode = localStorage.getItem("unsj-mode") || "full"; } catch {}
setMode(mode, { silent: true });
try { printLayout = localStorage.getItem("unsj-print-layout") || "full"; } catch {}
setPrintLayout(printLayout, { silent: true });
applyFont();
update();
/* fijar el estado bueno en localStorage si aún no hay posiciones */
try {
  if (!localStorage.getItem(OFFSETS_KEY)) {
    localStorage.setItem(OFFSETS_KEY, JSON.stringify(offsets));
  }
} catch {}
pullShared().finally(() => { ready = true; pushShared(true); });
