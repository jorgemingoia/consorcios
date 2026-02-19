const API = "https://script.google.com/macros/s/AKfycbwys6CfGsgwppK1Hod-I39HPWKqZP6lPRTAH7Z9gQKMnXqBKVz4_UWdjkE5NTWQ95JK/exec";
const SECRET = "consorcio2026";

const CONSORCIO_STORAGE_KEY = "selectedConsorcio";
let selectedConsorcio = null;

const TAB_TO_SHEET = {
  consorcios: "Consorcios",
  gastos: "Gastos",
  pagos: "Pagos",
  unidades: "Unidades",
};

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));

    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");

    const tabKey = btn.dataset.tab;

    if (tabKey === "resumen") {
      await renderResumen();
      return;
    }

    if (tabKey === "consorcios") {
      await loadAndRender("consorcios");
      return;
    }

    await loadAndRenderFiltered(tabKey);
  });
});

// ---------- API helpers ----------
async function apiLoadBySheetName(sheetName) {
  const url = `${API}?sheet=${encodeURIComponent(sheetName)}&secret=${encodeURIComponent(SECRET)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.ok && data.error) throw new Error(data.error);
  // compatible con tu versión vieja que devuelve {sheet, values}
  return data.values || [];
}

async function apiLoad(tabKey) {
  const sheetName = TAB_TO_SHEET[tabKey];
  return await apiLoadBySheetName(sheetName);
}

async function apiSaveBySheetName(sheetName, values) {
  const body = new URLSearchParams();
  body.set("secret", SECRET);
  body.set("sheet", sheetName);
  body.set("values", JSON.stringify(values));

  const res = await fetch(API, { method: "POST", body });
  const data = await res.json();

  if (!data.ok) throw new Error(data.error || "save_failed");
  return data;
}

async function apiSave(tabKey, values) {
  const sheetName = TAB_TO_SHEET[tabKey];
  return await apiSaveBySheetName(sheetName, values);
}

// ---------- Load + Render ----------
async function loadAndRender(tabKey) {
  const values = await apiLoad(tabKey);
  const headers = values[0] || [];
  const rows = values.slice(1) || [];
  renderGrid(tabKey, headers, rows);
}

async function loadAndRenderFiltered(tabKey) {
  const sheetName = TAB_TO_SHEET[tabKey];
  const values = await apiLoadBySheetName(sheetName);

  const headers = values[0] || [];
  let rows = values.slice(1) || [];

  // filtrar por consorcio seleccionado (si existe columna)
  if (selectedConsorcio) {
    const consIdx = findCol(headers, "consorcio");
    if (consIdx >= 0) {
      rows = rows.filter((r) => norm(r[consIdx]) === norm(selectedConsorcio));
    }
  }

  renderGrid(tabKey, headers, rows);
}

// ---------- Grid ----------
function renderGrid(tabKey, headers, rows) {
  const table = document.getElementById("grid-" + tabKey);
  table.innerHTML = "";

  // THEAD
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");

  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    trh.appendChild(th);
  });

  // Columna extra Acciones
  const thActions = document.createElement("th");
  thActions.textContent = "Acciones";
  trh.appendChild(thActions);

  thead.appendChild(trh);

  // TBODY
  const tbody = document.createElement("tbody");

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    headers.forEach((h, c) => {
      const td = document.createElement("td");
      td.contentEditable = true;

      // Autocompleta Consorcio si corresponde y viene vacío
      if (h.trim().toLowerCase() === "consorcio" && tabKey !== "consorcios") {
        td.textContent = row[c] ?? (selectedConsorcio || "");
      } else {
        td.textContent = row[c] ?? "";
      }

      tr.appendChild(td);
    });

    // Botón eliminar por fila
    const tdDel = document.createElement("td");
    tdDel.contentEditable = "false";
    const btn = document.createElement("button");
    btn.className = "btn ghost";
    btn.type = "button";
    btn.textContent = "🗑";
    btn.title = "Eliminar fila";
    btn.onclick = () => tr.remove();

    tdDel.appendChild(btn);
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
}

function addRow(tabKey) {
  const table = document.getElementById("grid-" + tabKey);
  const headers = Array.from(table.querySelectorAll("thead th"))
    .map(th => th.textContent)
    .filter(h => h !== "Acciones");

  if (!headers.length) return;

  let tbody = table.querySelector("tbody");
  if (!tbody) {
    tbody = document.createElement("tbody");
    table.appendChild(tbody);
  }

  const tr = document.createElement("tr");

  headers.forEach((h) => {
    const td = document.createElement("td");
    td.contentEditable = true;

    if (h.trim().toLowerCase() === "consorcio" && tabKey !== "consorcios") {
      td.textContent = selectedConsorcio || "";
    } else {
      td.textContent = "";
    }

    tr.appendChild(td);
  });

  // Acciones
  const tdDel = document.createElement("td");
  tdDel.contentEditable = "false";
  const btn = document.createElement("button");
  btn.className = "btn ghost";
  btn.type = "button";
  btn.textContent = "🗑";
  btn.title = "Eliminar fila";
  btn.onclick = () => tr.remove();
  tdDel.appendChild(btn);
  tr.appendChild(tdDel);

  tbody.appendChild(tr);
  tr.scrollIntoView({ behavior: "smooth", block: "end" });
}

function readGrid(tabKey) {
  const table = document.getElementById("grid-" + tabKey);

  // headers sin "Acciones"
  const allTh = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent);
  const headers = allTh.filter(h => h !== "Acciones");

  const rows = Array.from(table.querySelectorAll("tbody tr")).map(tr => {
    const tds = Array.from(tr.querySelectorAll("td"));
    // excluir última celda (acciones)
    return tds.slice(0, headers.length).map(td => td.textContent);
  });

  return { headers, rows };
}


// ---------- Save (merge por consorcio) ----------
async function saveFromGrid(tabKey) {
  if (tabKey === "consorcios") {
    // Consorcios se guarda tal cual
    const { headers, rows } = readGrid(tabKey);
    await apiSave(tabKey, [headers, ...rows]);
    alert("Guardado correctamente");
    await initConsorcioSelector(); // refresca selector si cambiaron consorcios
    return;
  }

  if (!selectedConsorcio) {
    alert("Elegí un consorcio primero.");
    return;
  }

  const sheetName = TAB_TO_SHEET[tabKey];

  // 1) lo que el usuario editó (solo filas del consorcio seleccionado)
  const { headers, rows } = readGrid(tabKey);
  const consIdxLocal = findCol(headers, "consorcio");

  // si no existe columna consorcio, no podemos mergear seguro
  if (consIdxLocal < 0) {
    alert('Falta la columna "Consorcio" en esta hoja.');
    return;
  }

  // Asegurar que todas las filas guardadas tengan el consorcio seleccionado en esa columna
  const rowsToSave = rows.map((r) => {
    const rr = [...r];
    rr[consIdxLocal] = selectedConsorcio;
    return rr;
  });

  // 2) traer hoja completa para no pisar otros consorcios
  const allValues = await apiLoadBySheetName(sheetName);
  const allHeaders = allValues[0] || headers;
  const allRows = allValues.slice(1) || [];

  const consIdxAll = findCol(allHeaders, "consorcio");
  if (consIdxAll < 0) {
    alert(`En la hoja "${sheetName}" falta la columna "Consorcio".`);
    return;
  }

  // 3) conservar filas de otros consorcios
  const keep = allRows.filter((r) => norm(r[consIdxAll]) !== norm(selectedConsorcio));

  // 4) unir: otros + actuales
  const mergedRows = [...keep, ...rowsToSave];

  // 5) guardar completo
  await apiSaveBySheetName(sheetName, [allHeaders, ...mergedRows]);
  alert("Guardado correctamente");
}

// ---------- Selector de consorcio ----------
async function initConsorcioSelector() {
  const select = document.getElementById("consorcioSelect");
  if (!select) {
    // No existe en HTML (todavía). Igual cargamos sin filtro.
    selectedConsorcio = null;
    await loadAndRenderFiltered("gastos");
    return;
  }

  const values = await apiLoadBySheetName("Consorcios");
  const headers = values[0] || [];
  const rows = values.slice(1) || [];

  const consIdx = findCol(headers, "consorcio");
  if (consIdx < 0) {
    select.innerHTML = `<option value="">Falta columna "Consorcio" en hoja Consorcios</option>`;
    selectedConsorcio = null;
    return;
  }

  const ids = rows.map((r) => String(r[consIdx] ?? "").trim()).filter(Boolean);

  select.innerHTML = ids.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join("");

  const saved = localStorage.getItem(CONSORCIO_STORAGE_KEY);
  selectedConsorcio = (saved && ids.includes(saved)) ? saved : (ids[0] || null);

  if (selectedConsorcio) select.value = selectedConsorcio;

  select.onchange = async () => {
    selectedConsorcio = select.value || null;
    localStorage.setItem(CONSORCIO_STORAGE_KEY, selectedConsorcio || "");
    await refreshAllDataTabs();
  };

  await refreshAllDataTabs();
}

async function refreshAllDataTabs() {
  // refrescar tabs de datos según consorcio
  await loadAndRenderFiltered("gastos");
  await loadAndRenderFiltered("pagos");
  await loadAndRenderFiltered("unidades");
}

// ---------- Utils ----------
function findCol(headers, name) {
  const target = norm(name);
  return (headers || []).findIndex((h) => norm(h) === target);
}
function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

// ---------- Inicio ----------
(async function start() {
  // Si tenés tab "Consorcios", lo podés cargar también cuando se haga click.
  await initConsorcioSelector();

  // Carga inicial: gastos filtrado
  await loadAndRenderFiltered("gastos");
})();

function getPeriodoSelected() {
  const el = document.getElementById("periodoInput");
  const savedKey = "selectedPeriodo";
  const saved = localStorage.getItem(savedKey);

  if (el && el.value && el.value.trim()) {
    localStorage.setItem(savedKey, el.value.trim());
    return el.value.trim();
  }
  if (el && saved) el.value = saved;
  return saved || "";
}

function sumImporte(headers, rows) {
  const idx = headers.findIndex(h => String(h).trim().toLowerCase() === "importe");
  if (idx < 0) return 0;
  return rows.reduce((acc, r) => acc + parseMoney(r[idx]), 0);
}

function parseMoney(v) {
  // soporta "95.000", "95000", "$ 95.000,50"
  const s = String(v ?? "")
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function findIdx(headers, name) {
  const t = String(name).trim().toLowerCase();
  return headers.findIndex(h => String(h).trim().toLowerCase() === t);
}

function fmtARS(n) {
  try { return n.toLocaleString("es-AR", { style:"currency", currency:"ARS" }); }
  catch { return "$ " + Math.round(n); }
}

async function renderResumen() {
  if (!selectedConsorcio) {
    alert("Elegí un consorcio primero.");
    return;
  }
  const periodo = getPeriodoSelected();
  if (!periodo) {
    alert("Ingresá un Periodo (ej: 2026-01).");
    return;
  }

  // cargar hojas completas
  const gastosV = await apiLoadBySheetName("Gastos");
  const pagosV = await apiLoadBySheetName("Pagos");
  const unidadesV = await apiLoadBySheetName("Unidades");

  const gH = gastosV[0] || []; const gR = (gastosV.slice(1) || []);
  const pH = pagosV[0] || [];  const pR = (pagosV.slice(1) || []);
  const uH = unidadesV[0] || []; const uR = (unidadesV.slice(1) || []);

  const gCons = findIdx(gH, "Consorcio");
  const gPer  = findIdx(gH, "Periodo");

  const pCons = findIdx(pH, "Consorcio");
  const pPer  = findIdx(pH, "Periodo");

  const uCons = findIdx(uH, "Consorcio");
  const uUF   = findIdx(uH, "UF");
  const uTit  = findIdx(uH, "Titular");
  const uCoef = findIdx(uH, "Coeficiente");

  if (gCons < 0 || gPer < 0) return alert('En "Gastos" faltan columnas Consorcio y/o Periodo.');
  if (pCons < 0 || pPer < 0) return alert('En "Pagos" faltan columnas Consorcio y/o Periodo.');
  if (uCons < 0 || uUF < 0 || uCoef < 0) return alert('En "Unidades" faltan columnas Consorcio, UF o Coeficiente.');

  // filtrar por consorcio + periodo
  const gastos = gR.filter(r => String(r[gCons]).trim() === selectedConsorcio && String(r[gPer]).trim() === periodo);
  const pagos  = pR.filter(r => String(r[pCons]).trim() === selectedConsorcio && String(r[pPer]).trim() === periodo);
  const unidades = uR.filter(r => String(r[uCons]).trim() === selectedConsorcio);

  const totalGastos = sumImporte(gH, gastos);
  const totalPagos  = sumImporte(pH, pagos);

  // mapa pagos por UF (si existe columna UF)
  const pUF = findIdx(pH, "UF");
  const pagosPorUF = new Map();
  if (pUF >= 0) {
    const impIdx = findIdx(pH, "Importe");
    for (const r of pagos) {
      const uf = String(r[pUF] ?? "").trim();
      const imp = parseMoney(r[impIdx]);
      if (!uf) continue;
      pagosPorUF.set(uf, (pagosPorUF.get(uf) || 0) + imp);
    }
  }

  // calcular expensa por unidad (prorrateo por coeficiente)
  // asume coeficiente suma ~1. Si no, lo normalizamos.
  const coefs = unidades.map(r => parseMoney(r[uCoef]));
  const sumCoef = coefs.reduce((a,b)=>a+b,0) || 1;

  const detalle = unidades.map(r => {
    const uf = String(r[uUF] ?? "").trim();
    const titular = uTit >= 0 ? String(r[uTit] ?? "").trim() : "";
    const coef = parseMoney(r[uCoef]);
    const coefNorm = coef / sumCoef;
    const expensa = totalGastos * coefNorm;
    const pagado = pagosPorUF.get(uf) || 0;
    const saldo = expensa - pagado;
    return { uf, titular, coef, expensa, pagado, saldo };
  });

  // Header info
  const hdr = document.getElementById("resumenHeader");
  if (hdr) hdr.textContent = `Consorcio: ${selectedConsorcio} • Periodo: ${periodo} • Unidades: ${detalle.length}`;

  // Tabla Totales
  renderSimpleTable("resumenTotales",
    ["Concepto", "Importe"],
    [
      ["Total Gastos", fmtARS(totalGastos)],
      ["Total Pagos registrados", fmtARS(totalPagos)],
      ["Saldo global (Gastos - Pagos)", fmtARS(totalGastos - totalPagos)],
    ]
  );

  // Tabla por UF
  renderSimpleTable("resumenUnidades",
    ["UF", "Titular", "Coeficiente", "Expensa UF", "Pagado", "Saldo"],
    detalle.map(d => [
      d.uf,
      d.titular,
      d.coef.toFixed(4),
      fmtARS(d.expensa),
      fmtARS(d.pagado),
      fmtARS(d.saldo),
    ])
  );
}

function renderSimpleTable(tableId, headers, rows) {
  const table = document.getElementById(tableId);
  if (!table) return;

  table.innerHTML = "";

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    trh.appendChild(th);
  });
  thead.appendChild(trh);

  const tbody = document.createElement("tbody");
  rows.forEach(r => {
    const tr = document.createElement("tr");
    r.forEach(cell => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
}
