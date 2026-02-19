const API = "https://script.google.com/macros/s/AKfycbwys6CfGsgwppK1Hod-I39HPWKqZP6lPRTAH7Z9gQKMnXqBKVz4_UWdjkE5NTWQ95JK/exec";
const SECRET = "consorcio2026";




//https://script.google.com/macros/s/AKfycbx4Gvh3vom37_C0dTweRXNc_oaWVzKdtM48xlv3eSvYAYIG_vojIe4nJIWK4ia6qvX6/exec?sheet=gastos&secret=consorcio2026
//https://script.google.com/macros/s/AKfycbxouRnIRVvuN6vNvMwvcZzM5hdNb5qg6ZH8Yvc9uocs-TDMMMK6OOEhY9Cl8ag_OS0/exec

const TAB_TO_SHEET = {
  gastos: "Gastos",
  pagos: "Pagos",
  unidades: "Unidades"
};

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    loadAndRender(btn.dataset.tab);
  });
});

async function apiLoad(tabKey) {
  const sheetName = TAB_TO_SHEET[tabKey];
  const url = `${API}?sheet=${sheetName}&secret=${SECRET}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.values;
}

async function apiSave(tabKey, values) {
  const sheetName = TAB_TO_SHEET[tabKey];

  const body = new URLSearchParams();
  body.set("secret", SECRET);
  body.set("sheet", sheetName);
  body.set("values", JSON.stringify(values));

  const res = await fetch(API, {
    method: "POST",
    body, // <-- form-urlencoded
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "save_failed");
  return data;
}
async function loadAndRender(tabKey) {
  const values = await apiLoad(tabKey);
  const headers = values[0] || [];
  const rows = values.slice(1) || [];
  renderGrid(tabKey, headers, rows);
}

function renderGrid(tabKey, headers, rows) {
  const table = document.getElementById("grid-" + tabKey);
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
  rows.forEach((row, r) => {
    const tr = document.createElement("tr");
    headers.forEach((_, c) => {
      const td = document.createElement("td");
      td.contentEditable = true;
      td.textContent = row[c] || "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
}

function readGrid(tabKey) {
  const table = document.getElementById("grid-" + tabKey);
  const headers = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent);
  const rows = Array.from(table.querySelectorAll("tbody tr")).map(tr =>
    Array.from(tr.querySelectorAll("td")).map(td => td.textContent)
  );
  return { headers, rows };
}

async function saveFromGrid(tabKey) {
  const { headers, rows } = readGrid(tabKey);
  await apiSave(tabKey, [headers, ...rows]);
  alert("Guardado correctamente");
}

// Carga inicial
loadAndRender("gastos");
