/* app.js — Delivery Optimizer frontend logic */
'use strict';

// ── State ─────────────────────────────────────────────────────────────────
let graphData   = null;  // {nodes, edges, n}
let graphN      = 10;
let graphSeed   = 42;
let dijkPath    = null;
let tspTour     = null;

const orders    = [];
const drivers   = [];
const ksPkgs    = [];

let benchCostChart = null;
let benchTimeChart = null;

// ── Tab switching ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────
async function api(endpoint, body) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  });
  return r.json();
}

function fmt(n, d=1) { return typeof n === 'number' ? n.toFixed(d) : '—'; }

// ══════════════════════════════════════════════════════════════════════════
// TAB 1 — Graph canvas rendering
// ══════════════════════════════════════════════════════════════════════════
const gCanvas = document.getElementById('graph-canvas');
const gCtx    = gCanvas.getContext('2d');

function resizeCanvas(canvas) {
  const wrap = canvas.parentElement;
  canvas.width  = wrap.clientWidth - 32;
  canvas.height = Math.min(480, window.innerHeight * 0.55);
}

function drawGraph(data, highlightPath = [], tspTourNodes = []) {
  if (!data) return;
  resizeCanvas(gCanvas);
  const W = gCanvas.width, H = gCanvas.height;
  gCtx.clearRect(0, 0, W, H);

  // Scale node coords to canvas
  const xs = data.nodes.map(n => n.x);
  const ys = data.nodes.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad  = 50;
  const sx   = n => pad + (n.x - minX) / (maxX - minX + 1) * (W - 2*pad);
  const sy   = n => pad + (n.y - minY) / (maxY - minY + 1) * (H - 2*pad);

  // Build highlight sets
  const pathSet = new Set();
  for (let i = 0; i + 1 < highlightPath.length; i++) {
    pathSet.add(`${highlightPath[i]}-${highlightPath[i+1]}`);
    pathSet.add(`${highlightPath[i+1]}-${highlightPath[i]}`);
  }
  const tspSet = new Set();
  for (let i = 0; i + 1 < tspTourNodes.length; i++) {
    tspSet.add(`${tspTourNodes[i]}-${tspTourNodes[i+1]}`);
    tspSet.add(`${tspTourNodes[i+1]}-${tspTourNodes[i]}`);
  }

  // Draw edges
  data.edges.forEach(e => {
    const a = data.nodes[e.from], b = data.nodes[e.to];
    const key = `${e.from}-${e.to}`;
    const inPath = pathSet.has(key);
    const inTSP  = tspSet.has(key);
    gCtx.beginPath();
    gCtx.moveTo(sx(a), sy(a));
    gCtx.lineTo(sx(b), sy(b));
    if (inPath) {
      gCtx.strokeStyle = '#6c63ff';
      gCtx.lineWidth = 3;
    } else if (inTSP) {
      gCtx.strokeStyle = '#ff6584';
      gCtx.lineWidth = 2.5;
    } else {
      gCtx.strokeStyle = 'rgba(255,255,255,0.06)';
      gCtx.lineWidth = 1;
    }
    gCtx.stroke();
  });

  // Draw nodes
  data.nodes.forEach((node, i) => {
    const x = sx(node), y = sy(node);
    const inPath = highlightPath.includes(i);
    const inTSP  = tspTourNodes.includes(i);

    gCtx.beginPath();
    gCtx.arc(x, y, inPath || inTSP ? 10 : 7, 0, Math.PI * 2);
    gCtx.fillStyle = inPath ? '#6c63ff' : inTSP ? '#ff6584' : '#22263a';
    gCtx.fill();
    gCtx.strokeStyle = inPath ? '#a29bfe' : inTSP ? '#ff8fab' : '#4a5080';
    gCtx.lineWidth = 2;
    gCtx.stroke();

    // Label
    gCtx.fillStyle = '#e8eaf6';
    gCtx.font = '11px Segoe UI, sans-serif';
    gCtx.textAlign = 'center';
    gCtx.fillText(`${node.id}(${i})`, x, y - 13);
  });
}

document.getElementById('btn-generate').addEventListener('click', async () => {
  graphN    = parseInt(document.getElementById('gen-n').value)   || 10;
  graphSeed = parseInt(document.getElementById('gen-seed').value) || 42;
  const data = await api('/api/generate', {n: graphN, seed: graphSeed});
  if (data.error) { document.getElementById('graph-info').textContent = '❌ ' + data.error; return; }
  graphData = data;
  drawGraph(data);
  document.getElementById('graph-info').textContent =
    `✅ ${data.n} cities, ${data.edges.length} edges generated (seed ${graphSeed})`;
});

window.addEventListener('resize', () => { if (graphData) drawGraph(graphData, dijkPath || [], tspTour || []); });

// ══════════════════════════════════════════════════════════════════════════
// TAB 2 — Routing
// ══════════════════════════════════════════════════════════════════════════
const rCanvas = document.getElementById('route-canvas');
const rCtx    = rCanvas.getContext('2d');

function drawRouteCanvas(data, dijkNodes, tspNodes) {
  if (!data) return;
  resizeCanvas(rCanvas);
  const W = rCanvas.width, H = rCanvas.height;
  rCtx.clearRect(0, 0, W, H);

  const xs = data.nodes.map(n => n.x);
  const ys = data.nodes.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad  = 50;
  const sx   = n => pad + (n.x - minX) / (maxX - minX + 1) * (W - 2*pad);
  const sy   = n => pad + (n.y - minY) / (maxY - minY + 1) * (H - 2*pad);

  // Highlight sets
  const dijkSet = new Set(), tspSet = new Set();
  for (let i = 0; i+1 < dijkNodes.length; i++) {
    dijkSet.add(`${dijkNodes[i]}-${dijkNodes[i+1]}`);
    dijkSet.add(`${dijkNodes[i+1]}-${dijkNodes[i]}`);
  }
  for (let i = 0; i+1 < tspNodes.length; i++) {
    tspSet.add(`${tspNodes[i]}-${tspNodes[i+1]}`);
    tspSet.add(`${tspNodes[i+1]}-${tspNodes[i]}`);
  }

  // Edges
  data.edges.forEach(e => {
    const a = data.nodes[e.from], b = data.nodes[e.to];
    const key = `${e.from}-${e.to}`;
    rCtx.beginPath();
    rCtx.moveTo(sx(a), sy(a));
    rCtx.lineTo(sx(b), sy(b));
    if (dijkSet.has(key)) { rCtx.strokeStyle='#6c63ff'; rCtx.lineWidth=3; }
    else if (tspSet.has(key)) { rCtx.strokeStyle='#ff6584'; rCtx.lineWidth=2.5; }
    else { rCtx.strokeStyle='rgba(255,255,255,0.05)'; rCtx.lineWidth=1; }
    rCtx.stroke();
  });

  // Nodes
  data.nodes.forEach((node, i) => {
    const x = sx(node), y = sy(node);
    rCtx.beginPath();
    rCtx.arc(x, y, dijkNodes.includes(i)||tspNodes.includes(i)?10:7, 0, Math.PI*2);
    rCtx.fillStyle = dijkNodes.includes(i) ? '#6c63ff' : tspNodes.includes(i) ? '#ff6584' : '#22263a';
    rCtx.fill();
    rCtx.strokeStyle='#4a5080'; rCtx.lineWidth=2; rCtx.stroke();
    rCtx.fillStyle='#e8eaf6'; rCtx.font='11px Segoe UI,sans-serif';
    rCtx.textAlign='center';
    rCtx.fillText(`${node.id}(${i})`, x, y-13);
  });
}

// Dijkstra
document.getElementById('btn-dijkstra').addEventListener('click', async () => {
  if (!graphData) { alert('Generate a graph first on the City Map tab.'); return; }
  const src = parseInt(document.getElementById('dijk-src').value);
  const dst = parseInt(document.getElementById('dijk-dst').value);
  const res = await api('/api/shortest', {n: graphN, seed: graphSeed, src, dst});
  const box = document.getElementById('dijkstra-result');
  if (res.error) { box.innerHTML = '❌ ' + res.error; return; }
  dijkPath = res.path.map(p => p.idx);
  const names = res.path.map(p => p.name + `(${p.idx})`).join(' → ');
  box.innerHTML = `<b>Path:</b> ${names}<br><b>Total cost:</b> ${fmt(res.cost)} units`;
  drawRouteCanvas(graphData, dijkPath, tspTour ? tspTour.map(t=>t.idx) : []);
  document.getElementById('route-legend').innerHTML = `
    <div class="legend-item"><div class="legend-dot" style="background:#6c63ff"></div>Dijkstra path</div>
    <div class="legend-item"><div class="legend-dot" style="background:#ff6584"></div>TSP tour</div>`;
});

// TSP
document.getElementById('btn-tsp').addEventListener('click', async () => {
  if (!graphData) { alert('Generate a graph first on the City Map tab.'); return; }
  const depot = parseInt(document.getElementById('tsp-depot').value);
  const stops = document.getElementById('tsp-stops').value
    .split(',').map(s => parseInt(s.trim())).filter(s => !isNaN(s));
  const algo  = document.getElementById('tsp-algo').value;
  const res   = await api('/api/tsp', {n: graphN, seed: graphSeed, depot, stops, algo});
  const box   = document.getElementById('tsp-result');
  if (res.error) { box.innerHTML = '❌ ' + res.error; return; }
  tspTour = res.tour;
  const names = res.tour.map(t => t.name + `(${t.idx})`).join(' → ');
  box.innerHTML = `<b>Algorithm:</b> ${res.algo}<br><b>Tour:</b> ${names}<br><b>Total cost:</b> ${fmt(res.cost)} units`;
  drawRouteCanvas(graphData, dijkPath || [], tspTour.map(t => t.idx));
});

// ══════════════════════════════════════════════════════════════════════════
// TAB 3 — Orders & Drivers
// ══════════════════════════════════════════════════════════════════════════
function renderOrdersTable() {
  const tbody = document.querySelector('#orders-table tbody');
  tbody.innerHTML = '';
  orders.forEach((o, i) => {
    tbody.innerHTML += `<tr>
      <td>${i+1}</td>
      <td>${o.src} → ${o.dst}</td>
      <td>${o.weight} kg</td>
      <td><span class="badge badge-${o.priority}">${o.priority}</span></td>
      <td><button class="del-btn" onclick="orders.splice(${i},1);renderOrdersTable()">✕</button></td>
    </tr>`;
  });
}

function renderDriversTable() {
  const tbody = document.querySelector('#drivers-table tbody');
  tbody.innerHTML = '';
  drivers.forEach((d, i) => {
    tbody.innerHTML += `<tr>
      <td>${i+1}</td>
      <td>${d.name}</td>
      <td>${d.capacity} kg</td>
      <td><button class="del-btn" onclick="drivers.splice(${i},1);renderDriversTable()">✕</button></td>
    </tr>`;
  });
}

document.getElementById('btn-add-order').addEventListener('click', () => {
  orders.push({
    src:      parseInt(document.getElementById('o-src').value)    || 0,
    dst:      parseInt(document.getElementById('o-dst').value)    || 1,
    weight:   parseInt(document.getElementById('o-weight').value) || 10,
    priority: document.getElementById('o-priority').value
  });
  renderOrdersTable();
});

document.getElementById('btn-add-driver').addEventListener('click', () => {
  drivers.push({
    name:     document.getElementById('d-name').value || 'Driver',
    capacity: parseInt(document.getElementById('d-cap').value) || 100
  });
  renderDriversTable();
});

document.getElementById('btn-load-demo').addEventListener('click', () => {
  orders.length = 0;
  drivers.length = 0;
  [{src:0,dst:4,weight:30,priority:'URGENT'},
   {src:1,dst:3,weight:50,priority:'NORMAL'},
   {src:2,dst:5,weight:20,priority:'LOW'},
   {src:0,dst:6,weight:80,priority:'URGENT'},
   {src:3,dst:7,weight:15,priority:'NORMAL'}].forEach(o => orders.push(o));
  [{name:'Alice',capacity:100},
   {name:'Bob',capacity:80},
   {name:'Carol',capacity:60}].forEach(d => drivers.push(d));
  renderOrdersTable();
  renderDriversTable();
});

document.getElementById('btn-assign').addEventListener('click', async () => {
  if (!orders.length || !drivers.length) {
    alert('Add at least one order and one driver first.');
    return;
  }
  const res = await api('/api/assign', {orders, drivers});
  if (res.error) { alert('Error: ' + res.error); return; }

  const card = document.getElementById('assign-result-card');
  card.style.display = 'block';

  let html = '';
  res.assignments.forEach(a => {
    const badge = `<span class="badge badge-${a.priority}">${a.priority}</span>`;
    const driver = a.driver === 'UNASSIGNED'
      ? `<span style="color:var(--red)">⚠ UNASSIGNED</span>`
      : `<span style="color:var(--green)">✅ ${a.driver}</span>`;
    html += `<div class="assign-row">
      <span><b>Order #${a.order_id}</b></span>
      ${badge}
      <span>City ${a.src}→${a.dst}</span>
      <span>${a.weight} kg</span>
      ${driver}
    </div>`;
  });
  document.getElementById('assign-result').innerHTML = html;

  let loadHtml = '<h4 style="margin:1rem 0 0.5rem;color:var(--muted)">Driver Loads</h4>';
  res.drivers.forEach(d => {
    const pct = Math.round(d.load / d.capacity * 100);
    loadHtml += `<div class="driver-load">
      <span style="width:80px">${d.name}</span>
      <div class="bar-wrap"><div class="bar-fill" style="width:${pct}%"></div></div>
      <span style="color:var(--muted)">${d.load}/${d.capacity} kg (${pct}%)</span>
    </div>`;
  });
  document.getElementById('driver-loads').innerHTML = loadHtml;
});

// ══════════════════════════════════════════════════════════════════════════
// TAB 4 — Benchmark
// ══════════════════════════════════════════════════════════════════════════
document.getElementById('btn-benchmark').addEventListener('click', async () => {
  const raw   = document.getElementById('bench-sizes').value;
  const sizes = raw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 1);
  if (!sizes.length) { alert('Enter at least one city count.'); return; }

  document.getElementById('bench-loading').style.display = 'block';
  const res = await api('/api/benchmark', {sizes});
  document.getElementById('bench-loading').style.display = 'none';

  if (res.error) { alert('Error: ' + res.error); return; }

  const labels      = res.map(r => `n=${r.n_cities}`);
  const greedyCosts = res.map(r => r.greedy_cost);
  const twoOptCosts = res.map(r => r.two_opt_cost);
  const dpCosts     = res.map(r => r.dp_cost > 0 ? r.dp_cost : null);
  const greedyMs    = res.map(r => r.greedy_ms);
  const twoOptMs    = res.map(r => r.two_opt_ms);
  const dpMs        = res.map(r => r.dp_ms > 0 ? r.dp_ms : null);

  const chartDefaults = {
    responsive: true,
    plugins: { legend: { labels: { color: '#8892b0' } } },
    scales: {
      x: { ticks: { color:'#8892b0' }, grid: { color:'#2e3352' } },
      y: { ticks: { color:'#8892b0' }, grid: { color:'#2e3352' } }
    }
  };

  if (benchCostChart) benchCostChart.destroy();
  benchCostChart = new Chart(document.getElementById('bench-cost-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Greedy',  data: greedyCosts, backgroundColor: '#6c63ff' },
        { label: '2-Opt',   data: twoOptCosts, backgroundColor: '#43e97b' },
        { label: 'DP Exact',data: dpCosts,     backgroundColor: '#f9ca24' }
      ]
    },
    options: chartDefaults
  });

  if (benchTimeChart) benchTimeChart.destroy();
  benchTimeChart = new Chart(document.getElementById('bench-time-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'Greedy',   data:greedyMs, borderColor:'#6c63ff', tension:0.3, fill:false },
        { label:'2-Opt',    data:twoOptMs, borderColor:'#43e97b', tension:0.3, fill:false },
        { label:'DP Exact', data:dpMs,     borderColor:'#f9ca24', tension:0.3, fill:false }
      ]
    },
    options: chartDefaults
  });

  // Table
  let tableHtml = `<table class="bench-table">
    <thead><tr>
      <th>Cities</th><th>Greedy Cost</th><th>2-Opt Cost</th><th>DP Cost</th>
      <th>2-Opt Gain</th><th>DP Gain</th>
      <th>Greedy ms</th><th>2-Opt ms</th><th>DP ms</th>
    </tr></thead><tbody>`;
  res.forEach(r => {
    tableHtml += `<tr>
      <td>${r.n_cities}</td>
      <td>${fmt(r.greedy_cost)}</td>
      <td>${fmt(r.two_opt_cost)}</td>
      <td>${r.dp_cost>0?fmt(r.dp_cost):'<span class="pct-na">N/A</span>'}</td>
      <td class="pct-good">${fmt(r.improvement_2opt_pct)}%</td>
      <td>${r.improvement_dp_pct!=null?`<span class="pct-good">${fmt(r.improvement_dp_pct)}%</span>`:'<span class="pct-na">N/A</span>'}</td>
      <td>${fmt(r.greedy_ms,2)}</td>
      <td>${fmt(r.two_opt_ms,2)}</td>
      <td>${r.dp_ms>0?fmt(r.dp_ms,2):'<span class="pct-na">N/A</span>'}</td>
    </tr>`;
  });
  tableHtml += '</tbody></table>';
  document.getElementById('bench-table-wrap').innerHTML = tableHtml;
});

// ══════════════════════════════════════════════════════════════════════════
// TAB 5 — Knapsack
// ══════════════════════════════════════════════════════════════════════════
function renderKsTable() {
  const tbody = document.querySelector('#ks-table tbody');
  tbody.innerHTML = '';
  ksPkgs.forEach((p, i) => {
    tbody.innerHTML += `<tr>
      <td>${i+1}</td>
      <td>${p.name}</td>
      <td>${p.weight} kg</td>
      <td>${p.value}</td>
      <td><button class="del-btn" onclick="ksPkgs.splice(${i},1);renderKsTable()">✕</button></td>
    </tr>`;
  });
}

document.getElementById('btn-add-pkg').addEventListener('click', () => {
  ksPkgs.push({
    name:   document.getElementById('ks-name').value   || 'Pkg',
    weight: parseInt(document.getElementById('ks-weight').value) || 1,
    value:  parseInt(document.getElementById('ks-value').value)  || 1
  });
  renderKsTable();
});

document.getElementById('btn-demo-knapsack').addEventListener('click', () => {
  ksPkgs.length = 0;
  [{name:'Box A',weight:10,value:60},{name:'Box B',weight:20,value:100},
   {name:'Box C',weight:30,value:120},{name:'Box D',weight:5,value:40},
   {name:'Box E',weight:15,value:80},{name:'Box F',weight:25,value:90}]
    .forEach(p => ksPkgs.push(p));
  document.getElementById('ks-cap').value = 50;
  renderKsTable();
});

document.getElementById('btn-knapsack').addEventListener('click', async () => {
  if (!ksPkgs.length) { alert('Add packages first.'); return; }
  const cap    = parseInt(document.getElementById('ks-cap').value) || 50;
  const weights = ksPkgs.map(p => p.weight);
  const values  = ksPkgs.map(p => p.value);
  const res = await api('/api/knapsack', {weights, values, capacity: cap});
  if (res.error) { document.getElementById('ks-result').innerHTML = '❌ '+res.error; return; }

  const selSet = new Set(res.selected);
  let html = `<p><b>Max Priority Value:</b> ${res.max_value}</p>
    <p><b>Total Weight Used:</b> ${res.total_weight} / ${cap} kg</p>
    <p><b>Packages (${res.selected.length}/${ksPkgs.length}):</b></p>
    <ul style="margin-top:0.5rem;list-style:none;padding:0">`;
  ksPkgs.forEach((p, i) => {
    const cls = selSet.has(i) ? 'ks-selected' : 'ks-skipped';
    const icon = selSet.has(i) ? '✅' : '❌';
    html += `<li class="${cls}">${icon} ${p.name} — ${p.weight}kg, value ${p.value}</li>`;
  });
  html += '</ul>';
  document.getElementById('ks-result').innerHTML = html;
});

// ── Initial generate on load ───────────────────────────────────────────────
window.addEventListener('load', () => {
  document.getElementById('btn-generate').click();
});
