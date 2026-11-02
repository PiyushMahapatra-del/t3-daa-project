'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// DeliverOpt — Enterprise JS Engine
// ═══════════════════════════════════════════════════════════════════════════

// ── State ─────────────────────────────────────────────────────────────────
let graphData = null, graphN = 14, graphSeed = 42;
let dijkPath  = [], tspTour = [];
const orders  = [], drivers = [], ksPkgs = [];
let benchCostChart = null, benchTimeChart = null;

// ── Helpers ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = (n, d = 1) => typeof n === 'number' ? n.toFixed(d) : '—';

async function api(endpoint, body) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

// Animated KPI counter
function animateValue(el, target, suffix = '') {
  const start     = parseFloat(el.dataset.raw || '0') || 0;
  const isFloat   = String(target).includes('.');
  const duration  = 500;
  const startTime = performance.now();

  el.dataset.raw = target;
  el.classList.remove('num-flash');
  void el.offsetWidth;
  el.classList.add('num-flash');

  function step(now) {
    const pct  = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - pct, 3);
    const cur  = start + (target - start) * ease;
    el.textContent = (isFloat ? cur.toFixed(1) : Math.round(cur)) + suffix;
    if (pct < 1) requestAnimationFrame(step);
    else el.textContent = (isFloat ? target.toFixed(1) : target) + suffix;
  }
  requestAnimationFrame(step);
}

function toast(msg, type = 'success') {
  const t    = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'i' };
  t.innerHTML = `<strong>${icons[type] || '·'}</strong> ${msg}`;
  $('toast-container').appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toastOut 300ms ease forwards';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// ── Live clock ────────────────────────────────────────────────────────────
function tickClock() {
  const now = new Date();
  $('live-clock').textContent =
    now.toLocaleTimeString('en-IN', { hour12: false });
}
tickClock();
setInterval(tickClock, 1000);

// ── Sidebar toggle ────────────────────────────────────────────────────────
$('sidebar-toggle').addEventListener('click', () => {
  document.body.classList.toggle('sidebar-collapsed');
  $('sidebar').classList.toggle('collapsed');
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
    $(`tab-${btn.dataset.tab}`).classList.add('active');
    $('bc-current').textContent = PAGE_TITLES[btn.dataset.tab];
    // Redraw canvases after tab show
    if (btn.dataset.tab === 'routing' && graphData) {
      drawCanvas('route-canvas', graphData, dijkPath, tspTour);
    }
  });
});

// ── Mode pill (C++ vs Python) ─────────────────────────────────────────────
fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"n":2,"seed":1}' })
  .then(r => r.json()).then(d => {
    const pill = $('mode-pill');
    if (d._mode === 'cpp') {
      pill.className = 'mode-pill cpp';
      $('mode-text').textContent = 'C++ Mode';
    }
  }).catch(() => {});

// ══════════════════════════════════════════════════════════════════════════
// CANVAS ENGINE — Dark glowing graph
// ══════════════════════════════════════════════════════════════════════════

function scaleCoords(nodes, W, H, pad = 60) {
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rX   = maxX - minX || 1, rY = maxY - minY || 1;
  return nodes.map(n => ({
    ...n,
    cx: pad + (n.x - minX) / rX * (W - 2 * pad),
    cy: pad + (n.y - minY) / rY * (H - 2 * pad),
  }));
}

function drawCanvas(canvasId, data, pathIdxs = [], tourIdxs = []) {
  if (!data) return;
  const canvas = $(canvasId);
  const ctx    = canvas.getContext('2d');
  const W      = canvas.parentElement.clientWidth;
  const H      = Math.min(440, window.innerHeight * 0.55);
  canvas.width  = W;
  canvas.height = H;

  // Dark background
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);

  // Subtle dot-grid
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let x = 30; x < W; x += 38)
    for (let y = 30; y < H; y += 38)
      ctx.fillRect(x, y, 1.5, 1.5);

  const scaled = scaleCoords(data.nodes, W, H);

  const pathSet = new Set(), tspSet = new Set();
  for (let i = 0; i + 1 < pathIdxs.length; i++) {
    pathSet.add(`${pathIdxs[i]}-${pathIdxs[i+1]}`);
    pathSet.add(`${pathIdxs[i+1]}-${pathIdxs[i]}`);
  }
  for (let i = 0; i + 1 < tourIdxs.length; i++) {
    tspSet.add(`${tourIdxs[i]}-${tourIdxs[i+1]}`);
    tspSet.add(`${tourIdxs[i+1]}-${tourIdxs[i]}`);
  }

  // ── Draw edges ───────────────────────────────────────────────────────
  data.edges.forEach(e => {
    const a = scaled[e.from], b = scaled[e.to];
    const key = `${e.from}-${e.to}`;
    const inPath = pathSet.has(key), inTSP = tspSet.has(key);

    if (!inPath && !inTSP) {
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth   = 0.5;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke();
    }
  });

  // ── TSP tour (amber glow) ─────────────────────────────────────────────
  if (tourIdxs.length > 1) {
    for (let i = 0; i + 1 < tourIdxs.length; i++) {
      const a = scaled[tourIdxs[i]], b = scaled[tourIdxs[i+1]];
      // Glow layer
      ctx.shadowColor  = '#f59e0b';
      ctx.shadowBlur   = 14;
      ctx.strokeStyle  = '#f59e0b';
      ctx.lineWidth    = 2.5;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke();
      ctx.shadowBlur = 0;
      drawArrow(ctx, a.cx, a.cy, b.cx, b.cy, '#f59e0b');
    }
  }

  // ── Dijkstra path (cyan glow) ─────────────────────────────────────────
  if (pathIdxs.length > 1) {
    for (let i = 0; i + 1 < pathIdxs.length; i++) {
      const a = scaled[pathIdxs[i]], b = scaled[pathIdxs[i+1]];
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur  = 18;
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth   = 3;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke();
      ctx.shadowBlur = 0;
      drawArrow(ctx, a.cx, a.cy, b.cx, b.cy, '#00d4ff');
    }
  }

  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  // ── Draw nodes ────────────────────────────────────────────────────────
  scaled.forEach((node, i) => {
    const inPath = pathIdxs.includes(i);
    const inTSP  = tourIdxs.includes(i);
    const isDepot = tourIdxs.length > 0 && i === tourIdxs[0];
    const r      = inPath ? 13 : inTSP ? 12 : 8;

    const color = isDepot   ? '#10b981'
                : inPath    ? '#00d4ff'
                : inTSP     ? '#f59e0b'
                : '#1e2840';
    const border = isDepot  ? '#10b981'
                 : inPath   ? '#00d4ff'
                 : inTSP    ? '#f59e0b'
                 : 'rgba(255,255,255,0.15)';
    const glow   = isDepot  ? '#10b981'
                 : inPath   ? '#00d4ff'
                 : inTSP    ? '#f59e0b'
                 : null;

    // Outer glow
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur  = 20;
    }

    // Circle
    ctx.beginPath();
    ctx.arc(node.cx, node.cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    // Index label
    ctx.fillStyle    = inPath || inTSP || isDepot ? '#0d1117' : 'rgba(255,255,255,0.7)';
    ctx.font         = `bold ${inPath || inTSP ? 10 : 9}px 'JetBrains Mono', monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(i, node.cx, node.cy);

    // City name
    ctx.fillStyle    = inPath || inTSP || isDepot ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)';
    ctx.font         = `10px 'Inter', sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(node.id, node.cx, node.cy - r - 4);
  });
}

function drawArrow(ctx, x1, y1, x2, y2, color) {
  const dx  = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return;
  const mx = x1 + dx * 0.58, my = y1 + dy * 0.58;
  const ux = dx / len, uy = dy / len;
  const s  = 7;
  ctx.beginPath();
  ctx.moveTo(mx + ux * s, my + uy * s);
  ctx.lineTo(mx - uy * s * 0.5 - ux * s * 0.5, my + ux * s * 0.5 - uy * s * 0.5);
  ctx.lineTo(mx + uy * s * 0.5 - ux * s * 0.5, my - ux * s * 0.5 - uy * s * 0.5);
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
$('btn-generate').addEventListener('click', async () => {
  graphN    = parseInt($('gen-n').value)    || 14;
  graphSeed = parseInt($('gen-seed').value) || 42;
  const btn = $('btn-generate');
  btn.textContent = '…'; btn.disabled = true;

  const data = await api('/api/generate', { n: graphN, seed: graphSeed });
  btn.textContent = '⊕ Generate Graph'; btn.disabled = false;

  if (data.error) { toast(data.error, 'error'); return; }
  graphData = data;

  $('graph-empty').style.display = 'none';
  drawCanvas('graph-canvas', data);
  drawCanvas('route-canvas', data, dijkPath, tspTour);

  animateValue($('kpi-cities'), data.n);
  animateValue($('kpi-edges'),  data.edges.length);

  const info = $('graph-info');
  info.style.display = 'block';
  info.innerHTML = `
    <span style="color:var(--cyan);font-family:var(--mono)">✓</span>
    Generated <strong style="color:var(--text)">${data.n}</strong> cities ·
    <strong style="color:var(--text)">${data.edges.length}</strong> road edges ·
    seed <code style="color:var(--amber)">${graphSeed}</code>
  `;
  toast(`Network ready — ${data.n} cities, ${data.edges.length} edges`);
});

// ══════════════════════════════════════════════════════════════════════════
// TAB 2 — Route Planning
// ══════════════════════════════════════════════════════════════════════════
$('btn-dijkstra').addEventListener('click', async () => {
  if (!graphData) { toast('Generate a city graph first', 'error'); return; }
  const src = parseInt($('dijk-src').value);
  const dst = parseInt($('dijk-dst').value);
  const btn = $('btn-dijkstra');
  btn.disabled = true; btn.textContent = '…';
  const res = await api('/api/shortest', { n: graphN, seed: graphSeed, src, dst });
  btn.disabled = false; btn.textContent = 'Find Shortest Path →';
  const box = $('dijkstra-result');
  box.style.display = 'block';

  if (!res.reachable || res.error) {
    box.innerHTML = `<div class="result-stat">
      <span class="result-key">Status</span>
      <span class="result-val" style="color:var(--rose)">No path — cities ${src} and ${dst} are disconnected</span>
    </div>`;
    return;
  }

  dijkPath = res.path.map(p => p.idx);
  const names = res.path.map(p => `${p.name}(${p.idx})`).join(' → ');

  box.innerHTML = `
    <div class="result-stat">
      <span class="result-key">Total Distance</span>
      <span class="result-val accent">${fmt(res.cost, 1)} km</span>
    </div>
    <div class="result-stat">
      <span class="result-key">Hops</span>
      <span class="result-val">${res.path.length} cities</span>
    </div>
    <div class="result-stat">
      <span class="result-key">Path</span>
      <span class="result-val" style="font-size:11px">${res.src_name}(${src}) → ${res.dst_name}(${dst})</span>
    </div>
    <div class="route-path-display">${names}</div>`;

  animateValue($('kpi-algo'), res.cost, ' km');
  drawCanvas('route-canvas', graphData, dijkPath, tspTour);
  toast(`Shortest path: ${fmt(res.cost, 1)} km`);
});

$('btn-tsp').addEventListener('click', async () => {
  if (!graphData) { toast('Generate a city graph first', 'error'); return; }
  const depot = parseInt($('tsp-depot').value);
  const stops = $('tsp-stops').value.split(',')
    .map(s => parseInt(s.trim())).filter(s => !isNaN(s));
  const algo  = $('tsp-algo').value;

  if (!stops.length) { toast('Enter at least one delivery stop', 'error'); return; }
  if (algo === 'dp' && stops.length > 12) {
    toast('DP exact mode supports ≤ 12 stops — switching to 2-Opt', 'info');
  }

  const btn = $('btn-tsp');
  btn.disabled = true; btn.textContent = '…';
  const res = await api('/api/tsp', { n: graphN, seed: graphSeed, depot, stops, algo });
  btn.disabled = false; btn.textContent = 'Plan TSP Route →';

  const box = $('tsp-result');
  box.style.display = 'block';

  if (res.error) { box.innerHTML = `<div class="result-stat"><span class="result-val" style="color:var(--rose)">${res.error}</span></div>`; return; }

  tspTour = res.tour.map(t => t.idx);
  const names  = res.tour.map(t => `${t.name}(${t.idx})`).join(' → ');
  const labels = { greedy: 'Nearest Neighbor', '2opt': '2-Opt', dp: 'Held-Karp DP' };

  box.innerHTML = `
    <div class="result-stat">
      <span class="result-key">Algorithm</span>
      <span class="result-val">${labels[res.algo] || res.algo}</span>
    </div>
    <div class="result-stat">
      <span class="result-key">Tour Cost</span>
      <span class="result-val accent">${fmt(res.cost, 1)} km</span>
    </div>
    <div class="result-stat">
      <span class="result-key">Stops</span>
      <span class="result-val">${tspTour.length} cities incl. depot</span>
    </div>
    <div class="route-path-display">${names}</div>`;

  animateValue($('kpi-algo'), res.cost, ' km');
  drawCanvas('route-canvas', graphData, dijkPath, tspTour);
  toast(`TSP route: ${fmt(res.cost, 1)} km (${labels[res.algo]})`);
});

// ══════════════════════════════════════════════════════════════════════════
// TAB 3 — Orders & Drivers
// ══════════════════════════════════════════════════════════════════════════
function renderOrders() {
  const tbody = document.querySelector('#orders-table tbody');
  $('order-count-badge').textContent = `${orders.length} order${orders.length !== 1 ? 's' : ''}`;
  animateValue($('kpi-orders'), orders.length);
  if (!orders.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No orders yet</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map((o, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>City <strong>${o.src}</strong> → City <strong>${o.dst}</strong></td>
      <td class="num">${o.weight} kg</td>
      <td><span class="badge badge-${o.priority}">${o.priority}</span></td>
      <td><button class="del-btn" onclick="orders.splice(${i},1);renderOrders()">×</button></td>
    </tr>`).join('');
}

function renderDrivers() {
  const tbody = document.querySelector('#drivers-table tbody');
  $('driver-count-badge').textContent = `${drivers.length} driver${drivers.length !== 1 ? 's' : ''}`;
  animateValue($('kpi-drivers'), drivers.length);
  if (!drivers.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No drivers yet</td></tr>';
    return;
  }
  tbody.innerHTML = drivers.map((d, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td><strong>${d.name}</strong></td>
      <td class="num">${d.capacity} kg</td>
      <td><button class="del-btn" onclick="drivers.splice(${i},1);renderDrivers()">×</button></td>
    </tr>`).join('');
}

$('btn-add-order').addEventListener('click', () => {
  orders.push({
    src:      parseInt($('o-src').value)    || 0,
    dst:      parseInt($('o-dst').value)    || 3,
    weight:   parseInt($('o-weight').value) || 20,
    priority: $('o-priority').value
  });
  renderOrders();
  toast('Order added', 'success');
});

$('btn-add-driver').addEventListener('click', () => {
  const name = $('d-name').value.trim() || 'Driver';
  drivers.push({ name, capacity: parseInt($('d-cap').value) || 100 });
  renderDrivers();
  $('d-name').value = `Driver ${String.fromCharCode(65 + drivers.length)}`;
  toast(`${name} added`, 'success');
});

$('btn-load-demo').addEventListener('click', () => {
  orders.length = 0; drivers.length = 0;
  [
    { src:0, dst:4, weight:30,  priority:'URGENT' },
    { src:1, dst:7, weight:50,  priority:'NORMAL' },
    { src:2, dst:5, weight:20,  priority:'LOW'    },
    { src:0, dst:9, weight:80,  priority:'URGENT' },
    { src:3, dst:6, weight:15,  priority:'NORMAL' },
    { src:4, dst:8, weight:45,  priority:'LOW'    },
    { src:1, dst:3, weight:35,  priority:'URGENT' },
  ].forEach(o => orders.push(o));
  [
    { name:'Arjun',  capacity:120 },
    { name:'Priya',  capacity:100 },
    { name:'Rahul',  capacity:80  },
    { name:'Neha',   capacity:60  },
  ].forEach(d => drivers.push(d));
  renderOrders(); renderDrivers();
  toast('Demo data loaded — 7 orders, 4 drivers');
});

$('btn-assign').addEventListener('click', async () => {
  if (!orders.length)  { toast('Add at least one order', 'error');  return; }
  if (!drivers.length) { toast('Add at least one driver', 'error'); return; }

  const res = await api('/api/assign', { orders, drivers });
  if (res.error) { toast(res.error, 'error'); return; }

  const card = $('assign-result-card');
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const nAssigned   = res.assignments.filter(a => a.driver !== 'UNASSIGNED').length;
  const nUnassigned = res.assignments.length - nAssigned;
  $('assign-summary-badge').textContent =
    `${nAssigned} assigned · ${nUnassigned} unassigned`;

  // Assignment table
  let html = `<table class="assign-table">
    <thead><tr>
      <th>#</th><th>Route</th><th>Weight</th><th>Priority</th><th>Assigned To</th>
    </tr></thead><tbody>`;
  res.assignments.forEach(a => {
    const unasn = a.driver === 'UNASSIGNED';
    html += `<tr class="${unasn ? 'unassigned-row' : ''}">
      <td>${a.order_id}</td>
      <td>City ${a.src} → City ${a.dst}</td>
      <td>${a.weight} kg</td>
      <td><span class="badge badge-${a.priority}">${a.priority}</span></td>
      <td style="color:${unasn ? 'var(--rose)' : 'var(--emerald)'}">
        ${unasn ? '✗ Unassigned' : '✓ ' + a.driver}
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  $('assign-result').innerHTML = html;

  // Driver load cards
  const loadsEl = $('driver-loads');
  loadsEl.innerHTML = res.drivers.map(d => {
    const pct = Math.round(d.load / d.capacity * 100);
    const cls = pct >= 100 ? 'full' : pct >= 80 ? 'high' : '';
    return `<div class="driver-load-card">
      <div class="driver-load-name">${d.name}</div>
      <div class="driver-load-bar-wrap">
        <div class="driver-load-bar-fill ${cls}" style="width:0%" data-pct="${Math.min(pct,100)}"></div>
      </div>
      <div class="driver-load-text">
        <span>${d.load} / ${d.capacity} kg</span>
        <span style="color:${cls==='full'?'var(--rose)':cls==='high'?'var(--amber)':'var(--emerald)'}">${pct}%</span>
      </div>
    </div>`;
  }).join('');

  // Animate bars
  requestAnimationFrame(() => {
    document.querySelectorAll('.driver-load-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.pct + '%';
    });
  });

  toast(`${nAssigned}/${res.assignments.length} orders assigned`);
});

// ══════════════════════════════════════════════════════════════════════════
// TAB 4 — Benchmarks
// ══════════════════════════════════════════════════════════════════════════
const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: '#94a3b8',
        font: { family: "'JetBrains Mono', monospace", size: 11 },
        boxWidth: 10, boxHeight: 10
      }
    }
  },
  scales: {
    x: {
      ticks: { color: '#4a5568', font: { family: "'JetBrains Mono', monospace", size: 10 } },
      grid:  { color: 'rgba(255,255,255,0.04)' }
    },
    y: {
      ticks: { color: '#4a5568', font: { family: "'JetBrains Mono', monospace", size: 10 } },
      grid:  { color: 'rgba(255,255,255,0.04)' }
    }
  }
};

$('btn-benchmark').addEventListener('click', async () => {
  const sizes = $('bench-sizes').value.split(',')
    .map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 1);
  if (!sizes.length) { toast('Enter valid city counts', 'error'); return; }

  $('bench-loading').style.display = 'flex';
  const res = await api('/api/benchmark', { sizes });
  $('bench-loading').style.display = 'none';
  if (res.error || !Array.isArray(res)) { toast('Benchmark failed', 'error'); return; }

  const labels  = res.map(r => `n=${r.n_cities}`);
  const gCosts  = res.map(r => +r.greedy_cost.toFixed(1));
  const oCosts  = res.map(r => +r.two_opt_cost.toFixed(1));
  const dCosts  = res.map(r => r.dp_cost > 0 ? +r.dp_cost.toFixed(1) : null);
  const gMs     = res.map(r => +r.greedy_ms.toFixed(3));
  const oMs     = res.map(r => +r.two_opt_ms.toFixed(3));
  const dMs     = res.map(r => r.dp_ms > 0 ? +r.dp_ms.toFixed(3) : null);

  if (benchCostChart) benchCostChart.destroy();
  benchCostChart = new Chart($('bench-cost-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Greedy NN',   data: gCosts, backgroundColor: 'rgba(0,212,255,0.6)',   borderColor: '#00d4ff', borderWidth: 1 },
        { label: '2-Opt',       data: oCosts, backgroundColor: 'rgba(139,92,246,0.6)',  borderColor: '#8b5cf6', borderWidth: 1 },
        { label: 'Held-Karp DP',data: dCosts, backgroundColor: 'rgba(245,158,11,0.6)',  borderColor: '#f59e0b', borderWidth: 1 }
      ]
    },
    options: { ...chartDefaults }
  });

  if (benchTimeChart) benchTimeChart.destroy();
  benchTimeChart = new Chart($('bench-time-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Greedy NN',    data: gMs, borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.08)', tension: 0.4, fill: true, pointRadius: 5, pointHoverRadius: 7 },
        { label: '2-Opt',        data: oMs, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.08)', tension: 0.4, fill: true, pointRadius: 5, pointHoverRadius: 7 },
        { label: 'Held-Karp DP', data: dMs, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', tension: 0.4, fill: true, pointRadius: 5, pointHoverRadius: 7 }
      ]
    },
    options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, type: 'logarithmic' } } }
  });

  // Table
  let tbl = `<table class="bench-table">
    <thead><tr>
      <th>Cities</th><th>Stops</th>
      <th>Greedy cost</th><th>2-Opt cost</th><th>DP cost</th>
      <th>2-Opt gain</th><th>DP gain</th>
      <th>Greedy ms</th><th>2-Opt ms</th><th>DP ms</th>
    </tr></thead><tbody>`;
  res.forEach(r => {
    tbl += `<tr>
      <td>${r.n_cities}</td><td>${r.n_stops}</td>
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
  tbl += '</tbody></table>';
  $('bench-table-wrap').innerHTML = tbl;
  toast(`Benchmark complete — ${res.length} scenarios`);
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
      <td class="num">${i + 1}</td>
      <td><strong>${p.name}</strong></td>
      <td class="num">${p.weight} kg</td>
      <td class="num">${p.value}</td>
      <td><button class="del-btn" onclick="ksPkgs.splice(${i},1);renderKsTable()">×</button></td>
    </tr>`).join('');
}

$('btn-add-pkg').addEventListener('click', () => {
  ksPkgs.push({
    name:   $('ks-name').value.trim() || 'Package',
    weight: parseInt($('ks-weight').value) || 1,
    value:  parseInt($('ks-value').value)  || 1
  });
  renderKsTable();
  $('ks-name').value = `Pkg ${String.fromCharCode(65 + ksPkgs.length)}`;
});

$('btn-demo-knapsack').addEventListener('click', () => {
  ksPkgs.length = 0;
  [
    { name:'Electronics',  weight:10, value:80 },
    { name:'Pharmaceuticals', weight:20, value:100 },
    { name:'Machinery',    weight:30, value:60 },
    { name:'Textiles',     weight:5,  value:40 },
    { name:'Perishables',  weight:15, value:90 },
    { name:'Auto Parts',   weight:25, value:75 },
    { name:'Chemicals',    weight:18, value:55 },
  ].forEach(p => ksPkgs.push(p));
  $('ks-cap').value = 50;
  renderKsTable();
  toast('Demo packages loaded');
});

$('btn-knapsack').addEventListener('click', async () => {
  if (!ksPkgs.length) { toast('Add packages first', 'error'); return; }
  const cap     = parseInt($('ks-cap').value) || 50;
  const weights = ksPkgs.map(p => p.weight);
  const values  = ksPkgs.map(p => p.value);
  const res     = await api('/api/knapsack', { weights, values, capacity: cap });
  if (res.error) { toast(res.error, 'error'); return; }

  const selSet   = new Set(res.selected);
  const badge    = $('ks-result-badge');
  badge.style.display = 'inline-flex';
  badge.textContent   = `Max value: ${res.max_value} · ${res.selected.length} pkg${res.selected.length !== 1 ? 's' : ''}`;

  let html = '';
  ksPkgs.forEach((p, i) => {
    const sel = selSet.has(i);
    html += `<div class="ks-item-row ${sel ? 'ks-item-selected' : 'ks-item-skipped'}">
      <span class="ks-check">${sel ? '✓' : '✗'}</span>
      <span class="ks-item-name">${p.name}</span>
      <span class="ks-item-meta">
        <span>${p.weight} kg</span>
        <span style="color:var(--text-3)">val ${p.value}</span>
        ${sel ? `<span style="color:var(--cyan)">+${p.value}</span>` : ''}
      </span>
    </div>`;
  });
  $('ks-result').innerHTML = html || '<div class="empty-msg">No items selected</div>';

  $('ks-visual').style.display = 'block';
  const pct = Math.round(res.total_weight / cap * 100);
  $('ks-cap-text').textContent  = `${res.total_weight} / ${cap} kg (${pct}%)`;
  $('ks-cap-fill').style.width  = '0%';
  requestAnimationFrame(() => {
    $('ks-cap-fill').style.width = Math.min(pct, 100) + '%';
  });

  toast(`Optimal: ${res.selected.length} packages, total value ${res.max_value}`);
});

// ── Boot ──────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  $('btn-generate').click();
});
