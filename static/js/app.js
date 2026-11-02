'use strict';

// ── State ─────────────────────────────────────────────────────────────────
let graphData = null, graphN = 12, graphSeed = 42;
let dijkPath  = [], tspTour  = [];
const orders  = [], drivers  = [], ksPkgs = [];
let benchCostChart = null, benchTimeChart = null;

// ── Helpers ───────────────────────────────────────────────────────────────
async function api(endpoint, body) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}
const fmt  = (n, d = 1) => typeof n === 'number' ? n.toFixed(d) : '—';
const el   = id => document.getElementById(id);

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  el('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ── Sidebar toggle ────────────────────────────────────────────────────────
el('sidebar-toggle').addEventListener('click', () => {
  document.body.classList.toggle('sidebar-collapsed');
  document.getElementById('sidebar').classList.toggle('collapsed');
});

// ── Tab switching ─────────────────────────────────────────────────────────
const PAGE_TITLES = {
  graph:     'City Network',
  routing:   'Route Planning',
  orders:    'Orders & Drivers',
  benchmark: 'Benchmarks',
  knapsack:  'Capacity Planner'
};

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    el(`tab-${btn.dataset.tab}`).classList.add('active');
    el('bc-current').textContent = PAGE_TITLES[btn.dataset.tab];
  });
});

// ── Date in topbar ────────────────────────────────────────────────────────
el('topbar-date').textContent = new Date().toLocaleDateString('en-IN', {
  weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
});

// ── KPI updates ───────────────────────────────────────────────────────────
function updateKPIs() {
  el('kpi-orders').textContent  = orders.length;
  el('kpi-drivers').textContent = drivers.length;
}

// ══════════════════════════════════════════════════════════════════════════
// CANVAS DRAWING
// ══════════════════════════════════════════════════════════════════════════

function scaleCoords(nodes, W, H, pad = 52) {
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rngX = maxX - minX || 1, rngY = maxY - minY || 1;
  return nodes.map(n => ({
    ...n,
    cx: pad + (n.x - minX) / rngX * (W - 2 * pad),
    cy: pad + (n.y - minY) / rngY * (H - 2 * pad)
  }));
}

function drawCanvas(canvasId, data, pathIdxs = [], tourIdxs = []) {
  if (!data) return;
  const canvas = el(canvasId);
  const ctx    = canvas.getContext('2d');
  const wrap   = canvas.parentElement;
  canvas.width  = wrap.clientWidth - 48;
  canvas.height = Math.min(430, window.innerHeight * 0.52);
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const scaled = scaleCoords(data.nodes, W, H);

  // Build highlight sets
  const pathSet = new Set(), tspSet = new Set();
  for (let i = 0; i + 1 < pathIdxs.length; i++) {
    const k = `${pathIdxs[i]}-${pathIdxs[i+1]}`;
    pathSet.add(k); pathSet.add(`${pathIdxs[i+1]}-${pathIdxs[i]}`);
  }
  for (let i = 0; i + 1 < tourIdxs.length; i++) {
    const k = `${tourIdxs[i]}-${tourIdxs[i+1]}`;
    tspSet.add(k); tspSet.add(`${tourIdxs[i+1]}-${tourIdxs[i]}`);
  }

  // Draw background grid lines (subtle)
  ctx.strokeStyle = '#eef0f5';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Draw edges
  data.edges.forEach(e => {
    const a = scaled[e.from], b = scaled[e.to];
    const key = `${e.from}-${e.to}`;
    const inPath = pathSet.has(key), inTSP = tspSet.has(key);
    ctx.beginPath();
    ctx.moveTo(a.cx, a.cy);
    ctx.lineTo(b.cx, b.cy);
    if (inPath) {
      ctx.strokeStyle = '#2d5fa6'; ctx.lineWidth = 3;
    } else if (inTSP) {
      ctx.strokeStyle = '#f0a500'; ctx.lineWidth = 2.5;
    } else {
      ctx.strokeStyle = '#dde3ee'; ctx.lineWidth = 1;
    }
    ctx.stroke();
  });

  // Draw TSP arrows
  if (tourIdxs.length > 1) {
    for (let i = 0; i + 1 < tourIdxs.length; i++) {
      const a = scaled[tourIdxs[i]], b = scaled[tourIdxs[i+1]];
      drawArrow(ctx, a.cx, a.cy, b.cx, b.cy, '#f0a500');
    }
  }

  // Draw Dijkstra arrows
  if (pathIdxs.length > 1) {
    for (let i = 0; i + 1 < pathIdxs.length; i++) {
      const a = scaled[pathIdxs[i]], b = scaled[pathIdxs[i+1]];
      drawArrow(ctx, a.cx, a.cy, b.cx, b.cy, '#2d5fa6');
    }
  }

  // Draw nodes
  scaled.forEach((node, i) => {
    const inPath = pathIdxs.includes(i), inTSP = tourIdxs.includes(i);
    const r = inPath || inTSP ? 11 : 8;

    // Shadow
    ctx.beginPath();
    ctx.arc(node.cx, node.cy, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30,58,95,.1)';
    ctx.fill();

    // Circle fill
    ctx.beginPath();
    ctx.arc(node.cx, node.cy, r, 0, Math.PI * 2);
    ctx.fillStyle = inPath ? '#2d5fa6' : inTSP ? '#f0a500' : '#fff';
    ctx.fill();
    ctx.strokeStyle = inPath ? '#1e3a5f' : inTSP ? '#c88000' : '#8899bb';
    ctx.lineWidth = inPath || inTSP ? 2 : 1.5;
    ctx.stroke();

    // Node index label inside
    ctx.fillStyle = inPath ? '#fff' : inTSP ? '#fff' : '#1e3a5f';
    ctx.font = `bold ${inPath || inTSP ? 10 : 9}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(i, node.cx, node.cy);

    // City name label above
    ctx.fillStyle = '#1a2133';
    ctx.font = '10px Inter, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText(node.id, node.cx, node.cy - r - 3);
  });
}

function drawArrow(ctx, x1, y1, x2, y2, color) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx*dx + dy*dy);
  if (len < 1) return;
  const mx = x1 + dx * 0.65, my = y1 + dy * 0.65;
  const ux = dx/len, uy = dy/len;
  const size = 7;
  ctx.beginPath();
  ctx.moveTo(mx + ux*size, my + uy*size);
  ctx.lineTo(mx - uy*size*.5 - ux*size*.5, my + ux*size*.5 - uy*size*.5);
  ctx.lineTo(mx + uy*size*.5 - ux*size*.5, my - ux*size*.5 - uy*size*.5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

window.addEventListener('resize', () => {
  if (graphData) {
    drawCanvas('graph-canvas', graphData);
    drawCanvas('route-canvas', graphData, dijkPath, tspTour);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// TAB 1 — City Network
// ══════════════════════════════════════════════════════════════════════════
el('btn-generate').addEventListener('click', async () => {
  graphN    = parseInt(el('gen-n').value)    || 12;
  graphSeed = parseInt(el('gen-seed').value) || 42;
  const btn = el('btn-generate');
  btn.textContent = 'Generating…'; btn.disabled = true;
  const data = await api('/api/generate', { n: graphN, seed: graphSeed });
  btn.textContent = 'Generate Graph'; btn.disabled = false;
  if (data.error) { toast('Error: ' + data.error, 'error'); return; }
  graphData = data;
  drawCanvas('graph-canvas', data);
  el('kpi-cities').textContent = data.n;
  el('kpi-edges').textContent  = data.edges.length;
  el('graph-info').innerHTML =
    `✅ <strong>${data.n}</strong> cities · <strong>${data.edges.length}</strong> road edges · seed <strong>${graphSeed}</strong>`;
  toast(`Graph generated — ${data.n} cities`);
});

// ══════════════════════════════════════════════════════════════════════════
// TAB 2 — Route Planning
// ══════════════════════════════════════════════════════════════════════════
el('btn-dijkstra').addEventListener('click', async () => {
  if (!graphData) { toast('Generate a graph first', 'error'); return; }
  const src = parseInt(el('dijk-src').value), dst = parseInt(el('dijk-dst').value);
  const res = await api('/api/shortest', { n: graphN, seed: graphSeed, src, dst });
  const box = el('dijkstra-result');
  if (res.error || !res.reachable) {
    box.style.display = 'block';
    box.innerHTML = `<div style="color:var(--danger)">⚠ No path found between cities ${src} and ${dst}</div>`;
    return;
  }
  dijkPath = res.path.map(p => p.idx);
  const names = res.path.map(p => `${p.name}(${p.idx})`).join(' → ');
  box.style.display = 'block';
  box.innerHTML = `
    <div class="result-stat"><span class="result-stat-label">Path</span>
      <span class="result-stat-value route-path">${names}</span></div>
    <div class="result-stat"><span class="result-stat-label">Total distance</span>
      <span class="result-stat-value">${fmt(res.cost)} km</span></div>
    <div class="result-stat"><span class="result-stat-label">Stops</span>
      <span class="result-stat-value">${res.path.length} cities</span></div>`;
  el('kpi-algo').textContent = fmt(res.cost) + ' km';
  drawCanvas('route-canvas', graphData, dijkPath, tspTour);
  toast('Shortest path found');
});

el('btn-tsp').addEventListener('click', async () => {
  if (!graphData) { toast('Generate a graph first', 'error'); return; }
  const depot = parseInt(el('tsp-depot').value);
  const stops = el('tsp-stops').value.split(',').map(s => parseInt(s.trim())).filter(s => !isNaN(s));
  const algo  = el('tsp-algo').value;
  if (!stops.length) { toast('Enter at least one delivery stop', 'error'); return; }
  const res = await api('/api/tsp', { n: graphN, seed: graphSeed, depot, stops, algo });
  const box = el('tsp-result');
  if (res.error) { box.style.display='block'; box.innerHTML = '❌ ' + res.error; return; }
  tspTour = res.tour.map(t => t.idx);
  const names = res.tour.map(t => `${t.name}(${t.idx})`).join(' → ');
  const algoLabels = { greedy: 'Nearest Neighbor', '2opt': '2-Opt Improved', dp: 'Held-Karp DP' };
  box.style.display = 'block';
  box.innerHTML = `
    <div class="result-stat"><span class="result-stat-label">Algorithm</span>
      <span class="result-stat-value">${algoLabels[res.algo] || res.algo}</span></div>
    <div class="result-stat"><span class="result-stat-label">Tour</span>
      <span class="result-stat-value route-path">${names}</span></div>
    <div class="result-stat"><span class="result-stat-label">Total tour cost</span>
      <span class="result-stat-value">${fmt(res.cost)} km</span></div>`;
  el('kpi-algo').textContent = fmt(res.cost) + ' km';
  drawCanvas('route-canvas', graphData, dijkPath, tspTour);
  toast(`TSP route planned — cost: ${fmt(res.cost)} km`);
});

// ══════════════════════════════════════════════════════════════════════════
// TAB 3 — Orders & Drivers
// ══════════════════════════════════════════════════════════════════════════
function renderOrdersTable() {
  const tbody = document.querySelector('#orders-table tbody');
  el('order-count-badge').textContent = `${orders.length} order${orders.length !== 1 ? 's' : ''}`;
  if (!orders.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No orders yet</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map((o, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>City ${o.src} → City ${o.dst}</td>
      <td>${o.weight} kg</td>
      <td><span class="badge badge-${o.priority}">${o.priority}</span></td>
      <td><button class="del-btn" onclick="orders.splice(${i},1);renderOrdersTable();updateKPIs()">✕</button></td>
    </tr>`).join('');
  updateKPIs();
}

function renderDriversTable() {
  const tbody = document.querySelector('#drivers-table tbody');
  el('driver-count-badge').textContent = `${drivers.length} driver${drivers.length !== 1 ? 's' : ''}`;
  if (!drivers.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No drivers yet</td></tr>';
    return;
  }
  tbody.innerHTML = drivers.map((d, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${d.name}</td>
      <td>${d.capacity} kg</td>
      <td><button class="del-btn" onclick="drivers.splice(${i},1);renderDriversTable();updateKPIs()">✕</button></td>
    </tr>`).join('');
  updateKPIs();
}

el('btn-add-order').addEventListener('click', () => {
  orders.push({
    src:      parseInt(el('o-src').value)    || 0,
    dst:      parseInt(el('o-dst').value)    || 1,
    weight:   parseInt(el('o-weight').value) || 10,
    priority: el('o-priority').value
  });
  renderOrdersTable();
});

el('btn-add-driver').addEventListener('click', () => {
  const name = el('d-name').value.trim() || 'Driver';
  drivers.push({ name, capacity: parseInt(el('d-cap').value) || 100 });
  renderDriversTable();
  el('d-name').value = `Driver ${String.fromCharCode(65 + drivers.length)}`;
});

el('btn-load-demo').addEventListener('click', () => {
  orders.length = 0; drivers.length = 0;
  [
    { src:0, dst:4, weight:30, priority:'URGENT' },
    { src:1, dst:3, weight:50, priority:'NORMAL' },
    { src:2, dst:5, weight:20, priority:'LOW'    },
    { src:0, dst:6, weight:80, priority:'URGENT' },
    { src:3, dst:7, weight:15, priority:'NORMAL' }
  ].forEach(o => orders.push(o));
  [
    { name:'Alice',   capacity:100 },
    { name:'Bob',     capacity:80  },
    { name:'Carol',   capacity:60  }
  ].forEach(d => drivers.push(d));
  renderOrdersTable(); renderDriversTable();
  toast('Demo data loaded');
});

el('btn-assign').addEventListener('click', async () => {
  if (!orders.length)  { toast('Add at least one order', 'error');  return; }
  if (!drivers.length) { toast('Add at least one driver', 'error'); return; }
  const res = await api('/api/assign', { orders, drivers });
  if (res.error) { toast(res.error, 'error'); return; }

  const card = el('assign-result-card');
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const assigned   = res.assignments.filter(a => a.driver !== 'UNASSIGNED').length;
  const unassigned = res.assignments.length - assigned;
  el('assign-summary-badge').textContent =
    `${assigned} assigned · ${unassigned} unassigned`;

  // Table
  let html = `<table class="assign-table">
    <thead><tr><th>Order</th><th>Route</th><th>Weight</th><th>Priority</th><th>Assigned To</th></tr></thead>
    <tbody>`;
  res.assignments.forEach(a => {
    const isUnassigned = a.driver === 'UNASSIGNED';
    html += `<tr class="${isUnassigned ? 'unassigned-row' : ''}">
      <td>#${a.order_id}</td>
      <td>City ${a.src} → City ${a.dst}</td>
      <td>${a.weight} kg</td>
      <td><span class="badge badge-${a.priority}">${a.priority}</span></td>
      <td>${isUnassigned ? '⚠ Unassigned' : '✅ ' + a.driver}</td>
    </tr>`;
  });
  html += '</tbody></table>';

  // Driver load bars
  html += `<div class="card-header" style="margin-top:1rem">
    <span class="card-title" style="font-size:.85rem">Driver Capacity Usage</span></div>`;
  res.drivers.forEach(d => {
    const pct = Math.round(d.load / d.capacity * 100);
    const cls = pct >= 100 ? 'full' : pct >= 80 ? 'high' : '';
    html += `<div class="driver-load-row">
      <span><strong>${d.name}</strong></span>
      <div class="load-bar-wrap">
        <div class="load-bar-fill ${cls}" style="width:${Math.min(pct,100)}%"></div>
      </div>
      <span class="load-text">${d.load}/${d.capacity} kg (${pct}%)</span>
    </div>`;
  });

  el('assign-result').innerHTML = html;
  el('driver-loads').innerHTML  = '';
  toast(`${assigned}/${res.assignments.length} orders assigned`);
});

// ══════════════════════════════════════════════════════════════════════════
// TAB 4 — Benchmarks
// ══════════════════════════════════════════════════════════════════════════
el('btn-benchmark').addEventListener('click', async () => {
  const sizes = el('bench-sizes').value.split(',')
    .map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 1);
  if (!sizes.length) { toast('Enter valid city counts', 'error'); return; }

  el('bench-loading').style.display = 'block';
  const res = await api('/api/benchmark', { sizes });
  el('bench-loading').style.display = 'none';

  if (res.error) { toast(res.error, 'error'); return; }

  const labels      = res.map(r => `n=${r.n_cities}`);
  const greedyCosts = res.map(r => +r.greedy_cost.toFixed(1));
  const twoOptCosts = res.map(r => +r.two_opt_cost.toFixed(1));
  const dpCosts     = res.map(r => r.dp_cost > 0 ? +r.dp_cost.toFixed(1) : null);
  const greedyMs    = res.map(r => +r.greedy_ms.toFixed(3));
  const twoOptMs    = res.map(r => +r.two_opt_ms.toFixed(3));
  const dpMs        = res.map(r => r.dp_ms > 0 ? +r.dp_ms.toFixed(3) : null);

  const chartOpts = {
    responsive: true,
    plugins: {
      legend: { labels: { color: '#5a6a84', font: { family: 'Inter', size: 11 } } }
    },
    scales: {
      x: { ticks: { color: '#5a6a84' }, grid: { color: '#eef0f5' } },
      y: { ticks: { color: '#5a6a84' }, grid: { color: '#eef0f5' } }
    }
  };

  if (benchCostChart) benchCostChart.destroy();
  benchCostChart = new Chart(el('bench-cost-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Greedy',   data: greedyCosts, backgroundColor: '#1e3a5f' },
        { label: '2-Opt',    data: twoOptCosts, backgroundColor: '#2d5fa6' },
        { label: 'Exact DP', data: dpCosts,     backgroundColor: '#f0a500' }
      ]
    },
    options: chartOpts
  });

  if (benchTimeChart) benchTimeChart.destroy();
  benchTimeChart = new Chart(el('bench-time-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Greedy',   data: greedyMs, borderColor: '#1e3a5f', tension: 0.3, fill: false, pointRadius: 5 },
        { label: '2-Opt',    data: twoOptMs, borderColor: '#2d5fa6', tension: 0.3, fill: false, pointRadius: 5 },
        { label: 'Exact DP', data: dpMs,     borderColor: '#f0a500', tension: 0.3, fill: false, pointRadius: 5 }
      ]
    },
    options: chartOpts
  });

  // Results table
  let tableHtml = `<table class="bench-table">
    <thead><tr>
      <th>Cities</th><th>Stops</th>
      <th>Greedy cost</th><th>2-Opt cost</th><th>DP cost</th>
      <th>2-Opt gain</th><th>DP gain</th>
      <th>Greedy ms</th><th>2-Opt ms</th><th>DP ms</th>
    </tr></thead><tbody>`;
  res.forEach(r => {
    tableHtml += `<tr>
      <td>${r.n_cities}</td>
      <td>${r.n_stops}</td>
      <td>${fmt(r.greedy_cost)}</td>
      <td>${fmt(r.two_opt_cost)}</td>
      <td>${r.dp_cost > 0 ? fmt(r.dp_cost) : '<span class="pct-na">N/A</span>'}</td>
      <td class="pct-gain">▼ ${fmt(r.improvement_2opt_pct)}%</td>
      <td>${r.improvement_dp_pct != null
        ? `<span class="pct-gain">▼ ${fmt(r.improvement_dp_pct)}%</span>`
        : '<span class="pct-na">N/A</span>'}</td>
      <td>${fmt(r.greedy_ms, 2)}</td>
      <td>${fmt(r.two_opt_ms, 2)}</td>
      <td>${r.dp_ms > 0 ? fmt(r.dp_ms, 2) : '<span class="pct-na">N/A</span>'}</td>
    </tr>`;
  });
  tableHtml += '</tbody></table>';
  el('bench-table-wrap').innerHTML = tableHtml;
  toast('Benchmark complete');
});

// ══════════════════════════════════════════════════════════════════════════
// TAB 5 — Knapsack
// ══════════════════════════════════════════════════════════════════════════
function renderKsTable() {
  const tbody = document.querySelector('#ks-table tbody');
  if (!ksPkgs.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No packages yet</td></tr>';
    return;
  }
  tbody.innerHTML = ksPkgs.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${p.name}</td>
      <td>${p.weight} kg</td>
      <td>${p.value}</td>
      <td><button class="del-btn" onclick="ksPkgs.splice(${i},1);renderKsTable()">✕</button></td>
    </tr>`).join('');
}

el('btn-add-pkg').addEventListener('click', () => {
  ksPkgs.push({
    name:   el('ks-name').value.trim() || 'Package',
    weight: parseInt(el('ks-weight').value) || 1,
    value:  parseInt(el('ks-value').value)  || 1
  });
  renderKsTable();
  el('ks-name').value = `Pkg ${String.fromCharCode(65 + ksPkgs.length)}`;
});

el('btn-demo-knapsack').addEventListener('click', () => {
  ksPkgs.length = 0;
  [
    { name:'Box A', weight:10, value:60 },
    { name:'Box B', weight:20, value:100 },
    { name:'Box C', weight:30, value:120 },
    { name:'Box D', weight:5,  value:40  },
    { name:'Box E', weight:15, value:80  },
    { name:'Box F', weight:25, value:90  }
  ].forEach(p => ksPkgs.push(p));
  el('ks-cap').value = 50;
  renderKsTable();
  toast('Demo packages loaded');
});

el('btn-knapsack').addEventListener('click', async () => {
  if (!ksPkgs.length) { toast('Add packages first', 'error'); return; }
  const cap     = parseInt(el('ks-cap').value) || 50;
  const weights = ksPkgs.map(p => p.weight);
  const values  = ksPkgs.map(p => p.value);
  const res     = await api('/api/knapsack', { weights, values, capacity: cap });
  if (res.error) { toast(res.error, 'error'); return; }

  const selSet  = new Set(res.selected);
  const badge   = el('ks-result-badge');
  badge.style.display = 'inline-block';
  badge.textContent   = `Max value: ${res.max_value} · ${res.selected.length}/${ksPkgs.length} packages`;

  let html = '';
  ksPkgs.forEach((p, i) => {
    const sel  = selSet.has(i);
    const icon = sel ? '✅' : '❌';
    const cls  = sel ? 'ks-item-selected' : 'ks-item-skipped';
    html += `<div class="ks-item-row ${cls}">
      <span class="ks-icon">${icon}</span>
      <span style="flex:1">${p.name}</span>
      <span>${p.weight} kg</span>
      <span style="color:var(--muted)">val ${p.value}</span>
    </div>`;
  });
  el('ks-result').innerHTML = html || '<span class="empty-msg">No result</span>';

  // Capacity bar
  const pct = Math.round(res.total_weight / cap * 100);
  el('ks-visual').style.display = 'block';
  el('ks-cap-text').textContent  = `${res.total_weight} / ${cap} kg (${pct}%)`;
  el('ks-cap-fill').style.width  = Math.min(pct, 100) + '%';
  toast(`Optimal: ${res.selected.length} packages, value ${res.max_value}`);
});

// ── Auto-generate on load ─────────────────────────────────────────────────
window.addEventListener('load', () => el('btn-generate').click());
