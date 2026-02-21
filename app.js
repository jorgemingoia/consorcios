const API = "https://script.google.com/macros/s/AKfycbyzsK4M11fQl9uZGAfUURwnrdwfdEn8XE8_b3XHv1Rpshbw9yku1TwcOIsANyhW9tRs/exec";

const SECRET = "consorcio2026";


const PERIODO_STORAGE_KEY = "selectedPeriodo";
let selectedPeriodo = null;


let lastResumen = null;

const CONSORCIO_STORAGE_KEY = "selectedConsorcio";
let selectedConsorcio = null;

const TAB_TO_SHEET = {
  consorcios: "Consorcios",
  gastos: "Gastos",
  pagos: "Pagos",
  unidades: "Unidades",
};



function initPeriodoSelector() {
  const el = document.getElementById("periodoSelect");
  if (!el) return;

  const saved = localStorage.getItem(PERIODO_STORAGE_KEY);
  if (saved) el.value = saved;

  selectedPeriodo = el.value || saved || "";

  el.addEventListener("change", async () => {
    selectedPeriodo = el.value || "";
    localStorage.setItem(PERIODO_STORAGE_KEY, selectedPeriodo);
    await refreshAllDataTabs();
  });
}


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

  const consIdx = findCol(headers, "consorcio");
  const perIdx  = findCol(headers, "periodo");

  if (selectedConsorcio && consIdx >= 0) {
    rows = rows.filter(r => norm(r[consIdx]) === norm(selectedConsorcio));
  }

  // Solo filtra por periodo si existe columna "Periodo" y hay periodo seleccionado
  if (selectedPeriodo && perIdx >= 0) {
    rows = rows.filter(r => normalizePeriodo(r[perIdx]) === selectedPeriodo);
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
        td.textContent = formatCellValue(h, row[c]);
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
  // si el tab activo es resumen, refrescarlo
  const activeTab = document.querySelector(".tab.active")?.dataset?.tab;
  if (activeTab === "resumen") {
    await renderResumen();
  }
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
  initPeriodoSelector();   
  // Carga inicial: gastos filtrado
  await loadAndRenderFiltered("gastos");
})();

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

function normalizePeriodo(value) {
  if (!value) return "";

  const s = String(value);

  // Si ya viene en formato 2026-01
  if (/^\d{4}-\d{2}$/.test(s)) return s;

  // Si viene como fecha ISO 2026-01-01T03:00:00.000Z
  const d = new Date(s);
  if (!isNaN(d)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  return s;
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

  const periodo = selectedPeriodo || "";
  if (!periodo) {
    alert("Elegí un Periodo arriba (YYYY-MM).");
    return;
  }


  // cargar hojas completas
  const gastosV = await apiLoadBySheetName("Gastos");
  const pagosV = await apiLoadBySheetName("Pagos");
  const unidadesV = await apiLoadBySheetName("Unidades");

  const gH = gastosV[0] || []; const gR = gastosV.slice(1) || [];
  const pH = pagosV[0] || [];  const pR = pagosV.slice(1) || [];
  const uH = unidadesV[0] || []; const uR = unidadesV.slice(1) || [];

  const gCons = findIdx(gH, "Consorcio");
  const gPer  = findIdx(gH, "Periodo");

  const pCons = findIdx(pH, "Consorcio");
  const pPer  = findIdx(pH, "Periodo");
  const pUF   = findIdx(pH, "UF");
  const pImp  = findIdx(pH, "Importe");

  const uCons = findIdx(uH, "Consorcio");
  const uUF   = findIdx(uH, "UF");
  const uTit  = findIdx(uH, "Titular");
  const uCoef = findIdx(uH, "Coeficiente");

  if (gCons < 0 || gPer < 0) return alert('En "Gastos" faltan columnas Consorcio y/o Periodo.');
  if (pCons < 0 || pPer < 0) return alert('En "Pagos" faltan columnas Consorcio y/o Periodo.');
  if (uCons < 0 || uUF < 0 || uCoef < 0) return alert('En "Unidades" faltan columnas Consorcio, UF o Coeficiente.');
  if (pImp < 0) return alert('En "Pagos" falta columna "Importe".');

  // filtrar por consorcio + periodo
const gastos = gR.filter(r =>
  String(r[gCons]).trim() === selectedConsorcio &&
  normalizePeriodo(r[gPer]) === periodo
);

const pagos  = pR.filter(r =>
  String(r[pCons]).trim() === selectedConsorcio &&
  normalizePeriodo(r[pPer]) === periodo
);
  const unidades = uR.filter(r => String(r[uCons]).trim() === selectedConsorcio);

  const totalGastos = sumImporte(gH, gastos);
  const totalPagos  = sumImporte(pH, pagos);

  // pagos por UF (si existe columna UF)
  const pagosPorUF = new Map();
  if (pUF >= 0) {
    for (const r of pagos) {
      const uf = String(r[pUF] ?? "").trim();
      const imp = parseMoney(r[pImp]);
      if (!uf) continue;
      pagosPorUF.set(uf, (pagosPorUF.get(uf) || 0) + imp);
    }
  }

  // calcular expensa por unidad (prorrateo por coeficiente)
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

  // ✅ guardar “snapshot” para PDF (DESPUÉS de tener detalle)
  lastResumen = {
    consorcio: selectedConsorcio,
    periodo,
    totales: [
      ["Total Gastos", fmtARS(totalGastos)],
      ["Total Pagos registrados", fmtARS(totalPagos)],
      ["Saldo global (Gastos - Pagos)", fmtARS(totalGastos - totalPagos)],
    ],
    unidades: detalle.map(d => [
      d.uf,
      d.titular,
      d.coef.toFixed(4),
      fmtARS(d.expensa),
      fmtARS(d.pagado),
      fmtARS(d.saldo),
    ])
  };

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


function formatCellValue(header, value) {
  const h = String(header || "").trim().toLowerCase();

  if (h === "periodo") {
    return normalizePeriodo(value);
  }
  return value ?? "";
}



async function exportResumenPDF() {
  // Si no hay resumen generado, lo generamos
  if (!lastResumen) {
    await renderResumen();
  }
  if (!lastResumen) {
    alert("No hay resumen para exportar.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const marginX = 40;
  let y = 50;

  doc.setFontSize(16);
  doc.text("Boleta de Expensas", marginX, y);
  y += 20;

  doc.setFontSize(11);
  doc.text(`Consorcio: ${lastResumen.consorcio}`, marginX, y);
  y += 14;
  doc.text(`Periodo: ${lastResumen.periodo}`, marginX, y);
  y += 18;

  // Tabla de totales
  doc.autoTable({
    startY: y,
    head: [["Concepto", "Importe"]],
    body: lastResumen.totales,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [230, 230, 230], textColor: 20 },
    margin: { left: marginX, right: marginX },
  });

  y = doc.lastAutoTable.finalY + 20;

  // Tabla por unidad
  doc.setFontSize(12);
  doc.text("Detalle por Unidad Funcional", marginX, y);
  y += 10;

  doc.autoTable({
    startY: y,
    head: [["UF", "Titular", "Coef.", "Expensa", "Pagado", "Saldo"]],
    body: lastResumen.unidades,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [230, 230, 230], textColor: 20 },
    margin: { left: marginX, right: marginX },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
  });

  const filename = `expensas_${lastResumen.consorcio}_${lastResumen.periodo}.pdf`;
  doc.save(filename);
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

async function sendResumenEmails() {
  // Asegurarnos de tener resumen calculado
  if (!lastResumen) await renderResumen();
  if (!lastResumen) {
    alert("No hay resumen para enviar.");
    return;
  }

  // Generar PDF en memoria (sin descargar)
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const marginX = 40;
  let y = 50;

  doc.setFontSize(16);
  doc.text("Boleta de Expensas", marginX, y);
  y += 20;

  doc.setFontSize(11);
  doc.text(`Consorcio: ${lastResumen.consorcio}`, marginX, y);
  y += 14;
  doc.text(`Periodo: ${lastResumen.periodo}`, marginX, y);
  y += 18;

  doc.autoTable({
    startY: y,
    head: [["Concepto", "Importe"]],
    body: lastResumen.totales,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [230, 230, 230], textColor: 20 },
    margin: { left: marginX, right: marginX },
  });

  y = doc.lastAutoTable.finalY + 20;

  doc.setFontSize(12);
  doc.text("Detalle por Unidad Funcional", marginX, y);
  y += 10;

  doc.autoTable({
    startY: y,
    head: [["UF", "Titular", "Coef.", "Expensa", "Pagado", "Saldo"]],
    body: lastResumen.unidades,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [230, 230, 230], textColor: 20 },
    margin: { left: marginX, right: marginX },
  });

  // PDF -> base64
  const dataUri = doc.output("datauristring"); // "data:application/pdf;...base64,XXXX"
  const base64 = dataUri.split(",")[1];

  // Enviar al Apps Script (sin CORS preflight: form-urlencoded)
  const body = new URLSearchParams();
  body.set("secret", SECRET);
  body.set("action", "sendEmails");
  body.set("consorcio", lastResumen.consorcio);
  body.set("periodo", lastResumen.periodo);
  body.set("filename", `expensas_${lastResumen.consorcio}_${lastResumen.periodo}.pdf`);
  body.set("pdfBase64", base64);

  const res = await fetch(API, { method: "POST", body });
  const data = await res.json();

  if (!data.ok) {
    alert(`Error enviando: ${data.error || "unknown"}`);
    return;
  }

  alert(`Listo ✅ Enviados: ${data.sent} | Fallidos: ${data.failed}`);
}

async function preguntarIA() {
  const input = document.getElementById("aiPregunta");
  const btn = document.getElementById("btnIA");
  const respuestaDiv = document.getElementById("aiRespuesta");
  
  const pregunta = input.value.trim();
  if (!pregunta) return;

  // 1. Feedback visual para el usuario
  btn.disabled = true;
  btn.textContent = "Pensando...";
  respuestaDiv.style.display = "block";
  respuestaDiv.innerHTML = "<em>Analizando datos del consorcio...</em>";

  // 2. Preparamos los datos para enviar
  const body = new URLSearchParams();
  body.set("secret", SECRET);
  body.set("action", "askIA");
  body.set("pregunta", pregunta);
  body.set("consorcio", selectedConsorcio);
  
  // Enviamos el resumen actual (lastResumen) como contexto
  // Esto hace que la IA sepa de qué estamos hablando sin leer todo el Excel de nuevo
  if (lastResumen) {
    body.set("contexto", JSON.stringify(lastResumen));
  }

  try {
    const res = await fetch(API, { method: "POST", body });
    const data = await res.json();
    
    if (data.ok) {
      // Reemplazamos los saltos de línea de la IA por <br> para que se vea bien en HTML
      respuestaDiv.innerHTML = `<strong>Asistente:</strong><br>${data.respuesta.replace(/\n/g, '<br>')}`;
    } else {
      respuestaDiv.innerHTML = `<span style="color: #ff6e6e;">Error: ${data.error}</span>`;
    }
  } catch (err) {
    respuestaDiv.innerHTML = "Error de conexión con el script de Google.";
    console.error(err);
  } finally {
    // 3. Restaurar el botón
    btn.disabled = false;
    btn.textContent = "Preguntar";
  }
}