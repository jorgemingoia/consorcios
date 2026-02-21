const SECRET = "consorcio2026"; // password simple compartida

const ALLOWED_SHEETS = [
  "Consorcios",
  "Gastos",
  "Pagos",
  "Unidades"
];

function doGet(e) {
  const sheetName = e.parameter.sheet || "gastos";
  const secret = e.parameter.secret || "";
  if (secret !== SECRET) return json({ error: "unauthorizedddd" }, 401);

  const sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sh) return json({ error: "sheet_not_found" }, 404);

  const values = sh.getDataRange().getValues();
  return json({ sheet: sheetName, values });
}

function doPost(e) {
  try {
    const p = (e && e.parameter) ? e.parameter : {};
    const secret = (p.secret || "").trim();
    if (secret !== SECRET) return json({ ok: false, error: "unauthorized" });

    const action = (p.action || "").trim();

    if (action === "sendEmails") {
      return handleSendEmails(p);
    }

    if (action === "askIA") {
      return handleAIConsulta(p);
    }

    // default: guardar grilla (tu lógica actual)
    const sheetName = (p.sheet || "Gastos").trim();
    const values = JSON.parse(p.values || "[]");

    if (!ALLOWED_SHEETS.includes(sheetName)) return json({ ok: false, error: "sheet_not_allowed", sheet: sheetName });
    if (!Array.isArray(values) || !values.length) return json({ ok: false, error: "invalid_values" });

    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sh) return json({ ok: false, error: "sheet_not_found" });

    const rows = values.length;
    const cols = values[0].length;

    sh.clearContents();
    sh.getRange(1, 1, rows, cols).setValues(values);

    return json({ ok: true, sheet: sheetName, rows, cols });

  } catch (err) {
    return json({ ok: false, error: "server_error", details: String(err) });
  }
}

function handleSendEmails(p) {
  const consorcio = (p.consorcio || "").trim();
  const periodo = (p.periodo || "").trim();
  const filename = (p.filename || "expensas.pdf").trim();
  const pdfBase64 = p.pdfBase64 || "";

  if (!consorcio || !periodo || !pdfBase64) {
    return json({ ok: false, error: "missing_params" });
  }

  // Obtener emails desde hoja "Unidades" filtrando por Consorcio
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("Unidades");
  if (!sh) return json({ ok: false, error: "unidades_sheet_not_found" });

  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const rows = values.slice(1);

  const idxCons = headers.findIndex(h => h.trim().toLowerCase() === "consorcio");
  const idxEmail = headers.findIndex(h => h.trim().toLowerCase() === "email");

  if (idxCons < 0 || idxEmail < 0) {
    return json({ ok: false, error: "missing_columns_unidades" }); // necesita Consorcio + Email
  }

  const emails = rows
    .filter(r => String(r[idxCons]).trim() === consorcio)
    .map(r => String(r[idxEmail]).trim())
    .filter(e => e && e.includes("@"));

  if (emails.length === 0) return json({ ok: false, error: "no_emails_found" });

  // Crear blob PDF
  const bytes = Utilities.base64Decode(pdfBase64);
  const blob = Utilities.newBlob(bytes, "application/pdf", filename);

  const subject = `Expensas ${consorcio} - ${periodo}`;
  const bodyText =
    `Hola,\n\nAdjunto boleta de expensas del consorcio ${consorcio} para el período ${periodo}.\n\nSaludos.`;

  let sent = 0, failed = 0;
  const errors = [];

  emails.forEach(email => {
    try {
      MailApp.sendEmail({
        to: email,
        subject,
        body: bodyText,
        attachments: [blob],
      });
      sent++;
    } catch (err) {
      failed++;
      errors.push({ email, error: String(err) });
    }
  });

  return json({ ok: true, sent, failed, errors });
}


function json(obj, code) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


function testMail() {
  MailApp.sendEmail("mingoia@gmail.com", "Test Expensas", "Probando envío desde Apps Script");
}

function testFetch() {
  const r = UrlFetchApp.fetch("https://www.google.com");
  Logger.log(r.getResponseCode());
}

function handleAIConsulta(p) {
  try {
    const apiKey = "AIzaSyAiPGxlZx8-2OyYqPwE16a6d3lHxvVXBqg";
    if (!apiKey) return json({ ok: false, error: "Falta GEMINI_API_KEY en Script Properties." });

    const pregunta = (p.pregunta || "").trim();
    if (!pregunta) return json({ ok: false, error: "missing_pregunta" });

    // Modelo que vos ya viste que existe en tu ListModels:
    const modelName = "models/gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent`;

    // Armado automático de contexto (knowledge source)
    const maxRowsPerSheet = Number(p.maxRowsPerSheet || 200); // podés ajustar desde el front si querés
    const contextObj = buildAutoContextFromSheets_(ALLOWED_SHEETS, {
      maxRowsPerSheet,
      redactSensitive: true
    });

    const systemInstr = `
Sos un asistente de administración de consorcios.
Tenés como fuente de verdad el "Contexto" (datos del spreadsheet ya resumidos/sanitizados).
Reglas:
- Si faltan datos para responder, decilo y pedí exactamente qué hoja/columna faltaría.
- Si el usuario pide rankings ("mejor consorcio"), explicá criterio (morosidad, balance, gastos por unidad, etc.) y mostrás top 3 y bottom 3.
- Si hay números, devolvé también totales y conclusiones accionables.
`;

    const prompt = `${systemInstr}

Contexto (JSON):
${JSON.stringify(contextObj)}

Pregunta:
${pregunta}
`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    const resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      headers: { "x-goog-api-key": apiKey },
      muteHttpExceptions: true
    });

    const resJson = JSON.parse(resp.getContentText());
    if (resJson.error) {
      return json({ ok: false, error: "Error de Gemini: " + resJson.error.message, details: resJson.error });
    }

    const out = resJson?.candidates?.[0]?.content?.parts?.[0]?.text || "(sin respuesta)";
    return json({ ok: true, respuesta: out });

  } catch (e) {
    return json({ ok: false, error: "Error interno: " + e.toString() });
  }
}

/**
 * Construye un contexto automático leyendo hojas permitidas,
 * limitando filas y ocultando columnas sensibles.
 */
function buildAutoContextFromSheets_(sheetNames, opts) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maxRowsPerSheet = Number(opts?.maxRowsPerSheet || 200);
  const redactSensitive = opts?.redactSensitive !== false;

  const out = {
    generatedAt: new Date().toISOString(),
    maxRowsPerSheet,
    sheets: {}
  };

  sheetNames.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) {
      out.sheets[name] = { ok: false, error: "sheet_not_found" };
      return;
    }

    const values = sh.getDataRange().getValues();
    if (!values || values.length === 0) {
      out.sheets[name] = { ok: true, rows: 0, columns: [], preview: [] };
      return;
    }

    const headers = values[0].map(h => String(h || "").trim());
    const rows = values.slice(1);

    // Indices de columnas sensibles a ocultar
    const redactIdx = redactSensitive ? getSensitiveColumnIndexes_(headers) : [];

    // Preview limitado
    const limitedRows = rows.slice(0, maxRowsPerSheet).map(r =>
      r.map((cell, idx) => redactIdx.includes(idx) ? "[REDACTED]" : sanitizeCell_(cell))
    );

    out.sheets[name] = {
      ok: true,
      rows: rows.length,
      columns: headers,
      redactedColumns: redactIdx.map(i => headers[i]).filter(Boolean),
      preview: limitedRows
    };
  });

  return out;
}

function sanitizeCell_(v) {
  // evitamos cosas raras/objetos y normalizamos fechas
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  if (v === null || v === undefined) return "";
  const s = String(v);
  // corta strings enormes
  return s.length > 200 ? (s.slice(0, 200) + "…") : s;
}

function getSensitiveColumnIndexes_(headers) {
  const patterns = [
    "email", "e-mail", "mail",
    "dni", "documento",
    "cuit", "cuil",
    "tel", "telefono", "teléfono", "cel", "celular",
    "direccion", "dirección"
  ].map(s => s.toLowerCase());

  const idx = [];
  headers.forEach((h, i) => {
    const hh = String(h || "").trim().toLowerCase();
    if (!hh) return;
    if (patterns.some(p => hh.includes(p))) idx.push(i);
  });
  return idx;
}

function listGeminiModels() {
  const apiKey = "AIzaSyAiPGxlZx8-2OyYqPwE16a6d3lHxvVXBqg";
  const url = "https://generativelanguage.googleapis.com/v1beta/models";

  const r = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "x-goog-api-key": apiKey }, // recomendado por la doc
    muteHttpExceptions: true
  });

  Logger.log("STATUS: " + r.getResponseCode());
  Logger.log(r.getContentText());
}