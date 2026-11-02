'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// DeliverOpt India — front-end
// ═══════════════════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const km  = n => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + ' km';
const pid = p => (p.idx !== undefined ? p.idx : p.id);       // C++ and Python name this differently

const SPEED_KMH = 55;      // average truck speed used for the time estimate
const FUEL_PER_KM = 12;    // ₹ per km used for the cost estimate

function hours(kmv) {
  const m = Math.round(kmv / SPEED_KMH * 60), h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}
const rupees = kmv => '₹' + Math.round(kmv * FUEL_PER_KM).toLocaleString('en-IN');

async function api(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, 2800);
}

// ── State ─────────────────────────────────────────────────────────────────
let G = null;                       // {nodes, edges, n}
let weightOf = {};                  // "i-j" -> km
let adjList = [];
const stops = new Set([1, 2, 3, 4]);
const orders = [], drivers = [], pkgs = [];
let first = true;

// ── Tabs ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + btn.dataset.tab));
  if (btn.dataset.tab === 'planner') setTimeout(() => map.invalidateSize(), 50);
}));

fetch('/api/mode').then(r => r.json()).then(d => {
  if (d.mode === 'cpp') { $('mode-pill').classList.add('cpp'); $('mode-text').textContent = 'C++ engine'; }
}).catch(() => {});

// ══════════════════════════════════════════════════════════════════════════
// MAP
// ══════════════════════════════════════════════════════════════════════════
const map = L.map('map', { zoomSnap: 0.25, minZoom: 4, maxZoom: 12 }).setView([22.6, 79.5], 5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);

const edgeLayer = L.layerGroup().addTo(map);
const cityLayer = L.layerGroup().addTo(map);
const pathLayer = L.layerGroup().addTo(map);
const tourLayer = L.layerGroup().addTo(map);
const markers = {};

const ll = i => [G.nodes[i].lat, G.nodes[i].lng];
const pin = (cls, text) => L.divIcon({ className: '', html: `<div class="pin ${cls}">${text}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });

function drawNetwork() {
  edgeLayer.clearLayers(); cityLayer.clearLayers();
  Object.keys(markers).forEach(k => delete markers[k]);

  G.edges.forEach(e => {
    L.polyline([ll(e.from), ll(e.to)], { color: '#94a3b8', weight: 1.6, opacity: .65 })
      .bindTooltip(`${G.nodes[e.from].id} – ${G.nodes[e.to].id}: ${km(e.weight)}`, { sticky: true })
      .addTo(edgeLayer);
  });

  G.nodes.forEach(n => {
    const m = L.circleMarker([n.lat, n.lng], { radius: 7, weight: 2, color: '#fff', fillOpacity: 1, fillColor: '#475569' });
    if (G.n <= 20) m.bindTooltip(n.id, { permanent: true, direction: 'right', offset: [8, 0], className: 'city-label' });
    else m.bindTooltip(`<b>${n.id}</b><br><span style="color:#66708a">${n.state}</span>`, { direction: 'top', offset: [0, -6] });
    m.on('click', () => toggleStop(n.idx));
    m.addTo(cityLayer);
    markers[n.idx] = m;
  });
  styleMarkers();
  map.fitBounds(L.latLngBounds(G.nodes.map(n => [n.lat, n.lng])).pad(0.12));
}

function styleMarkers() {
  const depot = +$('tsp-depot').value;
  Object.entries(markers).forEach(([i, m]) => {
    i = +i;
    const isD = i === depot, isS = stops.has(i);
    m.setStyle({ fillColor: isD ? '#16a34a' : isS ? '#f97316' : '#475569', radius: isD ? 10 : isS ? 9 : 7 });
    if (isD || isS) m.bringToFront();
  });
}

// ── client-side Dijkstra (only used to draw each tour leg along real links) ─
function legPath(src, dst) {
  const dist = Array(G.n).fill(Infinity), prev = Array(G.n).fill(-1), done = Array(G.n).fill(false);
  dist[src] = 0;
  for (let k = 0; k < G.n; k++) {
    let u = -1;
    for (let i = 0; i < G.n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    done[u] = true;
    adjList[u].forEach(([v, w]) => { if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; } });
  }
  const path = [];
  for (let c = dst; c !== -1; c = prev[c]) path.push(c);
  return { path: path.reverse(), cost: dist[dst] };
}

// ══════════════════════════════════════════════════════════════════════════
// NETWORK + CONTROLS
// ══════════════════════════════════════════════════════════════════════════
function fillSelect(sel, keep) {
  const cur = keep !== undefined ? keep : sel.value;
  sel.innerHTML = G.nodes.map(n => `<option value="${n.idx}">${n.id}</option>`).join('');
  if (cur !== '' && cur !== null && +cur < G.n) sel.value = cur;
}

function renderChips() {
  const depot = +$('tsp-depot').value;
  $('stop-chips').innerHTML = G.nodes.map(n =>
    `<button class="chip ${n.idx === depot ? 'depot' : stops.has(n.idx) ? 'on' : ''}" data-i="${n.idx}">${n.id}</button>`).join('');
  $('stop-chips').querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => toggleStop(+c.dataset.i)));
  $('stop-count').textContent = `· ${stops.size} selected`;
}

function toggleStop(i) {
  if (i === +$('tsp-depot').value) return;
  stops.has(i) ? stops.delete(i) : stops.add(i);
  renderChips(); styleMarkers();
}

async function loadNetwork() {
  const n = +$('gen-n').value;
  const data = await api('/api/generate', { n, seed: 42 });
  if (data.error) { toast(data.error, 'error'); return; }
  G = data;
  weightOf = {}; adjList = Array.from({ length: G.n }, () => []);
  G.edges.forEach(e => {
    weightOf[`${e.from}-${e.to}`] = weightOf[`${e.to}-${e.from}`] = e.weight;
    adjList[e.from].push([e.to, e.weight]); adjList[e.to].push([e.from, e.weight]);
  });
  [...stops].forEach(s => { if (s >= G.n) stops.delete(s); });

  const keepSrc = first ? 0 : $('dijk-src').value, keepDst = first ? 3 : $('dijk-dst').value, keepDepot = first ? 0 : $('tsp-depot').value;
  fillSelect($('dijk-src'), keepSrc); fillSelect($('dijk-dst'), keepDst); fillSelect($('tsp-depot'), keepDepot);
  ['o-src', 'o-dst'].forEach((id, k) => fillSelect($(id), k ? 3 : 0));
  stops.delete(+$('tsp-depot').value);

  pathLayer.clearLayers(); tourLayer.clearLayers();
  $('dijkstra-result').innerHTML = ''; $('tsp-result').innerHTML = '';
  $('net-badge').textContent = `${G.n} cities · ${G.edges.length} roads`;
  drawNetwork(); renderChips();
  renderOrders();
}

$('gen-n').addEventListener('input', () => { $('n-val').textContent = $('gen-n').value; });
let genTimer;
$('gen-n').addEventListener('change', () => { clearTimeout(genTimer); genTimer = setTimeout(loadNetwork, 150); });
$('tsp-depot').addEventListener('change', () => { stops.delete(+$('tsp-depot').value); renderChips(); styleMarkers(); });
$('btn-swap').addEventListener('click', () => { const a = $('dijk-src').value; $('dijk-src').value = $('dijk-dst').value; $('dijk-dst').value = a; });

// ── shared result pieces ──────────────────────────────────────────────────
function statsHtml(total, extra) {
  return `<div class="stats">
    <div class="stat ${extra || 'hi'}"><b>${km(total)}</b><span>Distance</span></div>
    <div class="stat"><b>${hours(total)}</b><span>Drive time</span></div>
    <div class="stat"><b>${rupees(total)}</b><span>Fuel cost</span></div>
  </div>`;
}
const NOTE = `<div class="note">Estimates: ${SPEED_KMH} km/h average speed, ₹${FUEL_PER_KM}/km fuel &amp; running cost.</div>`;

function timelineHtml(seq, mode) {
  const last = seq.length - 1;
  return '<ul class="timeline">' + seq.map((idx, k) => {
    const n = G.nodes[idx];
    const leg = k > 0 ? legPath(seq[k - 1], idx).cost : null;
    let cls, txt;
    if (mode === 'path') { cls = k === 0 ? 'depot' : k === last ? '' : 'mid'; txt = k === 0 ? 'A' : k === last ? 'B' : '·'; }
    else { cls = (k === 0 || k === last) ? 'depot' : 'stop'; txt = (k === 0 || k === last) ? '⌂' : k; }
    return `<li><span class="t-dot ${cls}">${txt}</span>
      <span class="t-name">${n.id}<small>${n.state}</small></span>
      <span class="t-km">${leg !== null ? '+' + km(leg) : 'Start'}</span></li>`;
  }).join('') + '</ul>';
}

// ══════════════════════════════════════════════════════════════════════════
// SHORTEST PATH
// ══════════════════════════════════════════════════════════════════════════
$('btn-dijkstra').addEventListener('click', runDijkstra);
async function runDijkstra() {
  if (!G) return;
  const src = +$('dijk-src').value, dst = +$('dijk-dst').value;
  if (src === dst) { toast('Pick two different cities', 'error'); return; }
  const btn = $('btn-dijkstra'); btn.disabled = true;
  const res = await api('/api/shortest', { n: G.n, seed: 42, src, dst });
  btn.disabled = false;
  const box = $('dijkstra-result');
  if (res.error || !res.reachable) { box.innerHTML = '<div class="empty">No route found.</div>'; return; }

  const seq = res.path.map(pid);
  pathLayer.clearLayers();
  for (let i = 0; i + 1 < seq.length; i++) {
    L.polyline([ll(seq[i]), ll(seq[i + 1])], { color: '#1d4ed8', weight: 6, opacity: .9, lineCap: 'round' })
      .bindTooltip(km(weightOf[`${seq[i]}-${seq[i + 1]}`]), { sticky: true }).addTo(pathLayer);
  }
  L.marker(ll(seq[0]), { icon: pin('start', 'A'), zIndexOffset: 900 }).addTo(pathLayer);
  L.marker(ll(seq[seq.length - 1]), { icon: pin('end', 'B'), zIndexOffset: 900 }).addTo(pathLayer);
  map.fitBounds(L.latLngBounds(seq.map(ll)).pad(0.3));

  box.innerHTML = `<div class="result">${statsHtml(res.cost)}
    ${timelineHtml(seq, 'path')}${NOTE}</div>`;
  toast(`${G.nodes[src].id} → ${G.nodes[dst].id}: ${km(res.cost)}`);
}

// ══════════════════════════════════════════════════════════════════════════
// TSP TOUR
// ══════════════════════════════════════════════════════════════════════════
$('btn-tsp').addEventListener('click', async () => {
  if (!G) return;
  const depot = +$('tsp-depot').value, list = [...stops].filter(s => s !== depot).sort((a, b) => a - b);
  let algo = document.querySelector('input[name=algo]:checked').value;
  if (!list.length) { toast('Select at least one delivery stop', 'error'); return; }
  if (algo === 'dp' && list.length > 12) { algo = '2opt'; toast('Exact mode handles up to 12 stops — used 2-Opt instead', 'error'); }

  const btn = $('btn-tsp'); btn.disabled = true;
  const res = await api('/api/tsp', { n: G.n, seed: 42, depot, stops: list, algo });
  btn.disabled = false;
  const box = $('tsp-result');
  if (res.error) { box.innerHTML = `<div class="empty">${esc(res.error)}</div>`; return; }

  const seq = res.tour.map(pid);
  tourLayer.clearLayers();
  const bounds = [];
  for (let i = 0; i + 1 < seq.length; i++) {
    const { path } = legPath(seq[i], seq[i + 1]);
    const pts = path.map(ll); bounds.push(...pts);
    L.polyline(pts, { color: '#f97316', weight: 5, opacity: .9, lineCap: 'round', lineJoin: 'round' }).addTo(tourLayer);
  }
  seq.slice(0, -1).forEach((idx, k) => {
    L.marker(ll(idx), { icon: k === 0 ? pin('depot', '⌂') : pin('stop', k), zIndexOffset: 1000 })
      .bindTooltip(G.nodes[idx].id, { direction: 'top', offset: [0, -14] }).addTo(tourLayer);
  });
  map.fitBounds(L.latLngBounds(bounds).pad(0.2));

  const labels = { greedy: 'Nearest neighbour', '2opt': '2-Opt', dp: 'Exact (Held-Karp)' };
  box.innerHTML = `<div class="result">
    <div><span class="chip-tag saffron">${labels[algo]}</span> <span class="chip-tag">${list.length} stops</span></div>
    ${statsHtml(res.cost, 'sf')}
    ${timelineHtml(seq, 'tour')}${NOTE}</div>`;
  toast(`Tour planned: ${km(res.cost)}`);
});

// ══════════════════════════════════════════════════════════════════════════
// ORDERS & DRIVERS
// ══════════════════════════════════════════════════════════════════════════
const cityName = i => (G && G.nodes[i]) ? G.nodes[i].id : 'City ' + i;

function renderOrders() {
  $('order-count').textContent = `${orders.length} order${orders.length === 1 ? '' : 's'}`;
  const tb = document.querySelector('#orders-table tbody');
  tb.innerHTML = orders.length ? orders.map((o, i) => `<tr>
    <td>${i + 1}</td><td><b>${cityName(o.src)}</b> → <b>${cityName(o.dst)}</b></td><td>${o.weight} kg</td>
    <td><span class="badge badge-${o.priority}">${o.priority[0] + o.priority.slice(1).toLowerCase()}</span></td>
    <td><button class="del" data-i="${i}">×</button></td></tr>`).join('')
    : '<tr class="empty-row"><td colspan="5">No orders yet — add one or load sample data.</td></tr>';
  tb.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => { orders.splice(+b.dataset.i, 1); renderOrders(); }));
}
function renderDrivers() {
  $('driver-count').textContent = `${drivers.length} driver${drivers.length === 1 ? '' : 's'}`;
  const tb = document.querySelector('#drivers-table tbody');
  tb.innerHTML = drivers.length ? drivers.map((d, i) => `<tr><td>${i + 1}</td><td><b>${esc(d.name)}</b></td><td>${d.capacity} kg</td>
    <td><button class="del" data-i="${i}">×</button></td></tr>`).join('')
    : '<tr class="empty-row"><td colspan="4">No drivers yet.</td></tr>';
  tb.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => { drivers.splice(+b.dataset.i, 1); renderDrivers(); }));
}

$('btn-add-order').addEventListener('click', () => {
  const src = +$('o-src').value, dst = +$('o-dst').value;
  if (src === dst) { toast('Pick different pickup and drop cities', 'error'); return; }
  orders.push({ src, dst, weight: +$('o-weight').value || 10, priority: $('o-priority').value });
  renderOrders();
});
$('btn-add-driver').addEventListener('click', () => {
  drivers.push({ name: $('d-name').value.trim() || 'Driver', capacity: +$('d-cap').value || 100 });
  $('d-name').value = 'Driver ' + String.fromCharCode(65 + drivers.length);
  renderDrivers();
});
$('btn-load-demo').addEventListener('click', () => {
  orders.length = 0; drivers.length = 0;
  orders.push(
    { src: 0, dst: 4, weight: 30, priority: 'URGENT' }, { src: 1, dst: 7, weight: 50, priority: 'NORMAL' },
    { src: 2, dst: 5, weight: 20, priority: 'LOW' },    { src: 0, dst: 9, weight: 80, priority: 'URGENT' },
    { src: 3, dst: 6, weight: 15, priority: 'NORMAL' }, { src: 4, dst: 8, weight: 45, priority: 'LOW' },
    { src: 1, dst: 3, weight: 35, priority: 'URGENT' });
  drivers.push({ name: 'Arjun', capacity: 120 }, { name: 'Priya', capacity: 100 }, { name: 'Rahul', capacity: 80 }, { name: 'Neha', capacity: 60 });
  renderOrders(); renderDrivers(); toast('Sample data loaded');
});

$('btn-assign').addEventListener('click', async () => {
  if (!orders.length || !drivers.length) { toast('Add at least one order and one driver', 'error'); return; }
  const res = await api('/api/assign', { orders, drivers });
  if (res.error) { toast(res.error, 'error'); return; }
  $('assign-card').style.display = 'block';
  const done = res.assignments.filter(a => a.driver !== 'UNASSIGNED').length;
  $('assign-badge').textContent = `${done} of ${res.assignments.length} assigned`;

  $('assign-result').innerHTML = `<table class="tbl"><thead><tr><th>Order</th><th>Route</th><th>Weight</th><th>Priority</th><th>Driver</th></tr></thead><tbody>` +
    res.assignments.map(a => {
      const un = a.driver === 'UNASSIGNED';
      return `<tr><td>#${a.order_id}</td><td>${cityName(a.src)} → ${cityName(a.dst)}</td><td>${a.weight} kg</td>
        <td><span class="badge badge-${a.priority}">${a.priority[0] + a.priority.slice(1).toLowerCase()}</span></td>
        <td class="${un ? 'bad' : 'ok'}">${un ? 'No capacity' : esc(a.driver)}</td></tr>`;
    }).join('') + '</tbody></table>';

  $('driver-loads').innerHTML = res.drivers.map(d => {
    const pct = Math.round(d.load / d.capacity * 100), cls = pct >= 100 ? 'full' : pct >= 80 ? 'high' : '';
    return `<div class="load-card"><b>${esc(d.name)}</b><div class="bar"><div class="${cls}" data-w="${Math.min(pct, 100)}"></div></div>
      <div class="meta"><span>${d.load} / ${d.capacity} kg</span><b>${pct}%</b></div></div>`;
  }).join('');
  requestAnimationFrame(() => requestAnimationFrame(() =>
    document.querySelectorAll('#driver-loads .bar > div').forEach(b => b.style.width = b.dataset.w + '%')));
  $('assign-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  toast(`${done} of ${res.assignments.length} orders assigned`);
});

// ══════════════════════════════════════════════════════════════════════════
// LOAD PLANNER (knapsack)
// ══════════════════════════════════════════════════════════════════════════
function renderPkgs() {
  $('ks-count').textContent = `${pkgs.length} package${pkgs.length === 1 ? '' : 's'}`;
  const tb = document.querySelector('#ks-table tbody');
  tb.innerHTML = pkgs.length ? pkgs.map((p, i) => `<tr><td>${i + 1}</td><td><b>${esc(p.name)}</b></td><td>${p.weight} kg</td>
    <td>₹${p.value.toLocaleString('en-IN')}</td><td><button class="del" data-i="${i}">×</button></td></tr>`).join('')
    : '<tr class="empty-row"><td colspan="5">No packages yet.</td></tr>';
  tb.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => { pkgs.splice(+b.dataset.i, 1); renderPkgs(); }));
}
$('btn-add-pkg').addEventListener('click', () => {
  pkgs.push({ name: $('ks-name').value.trim() || 'Package', weight: +$('ks-weight').value || 1, value: +$('ks-value').value || 1 });
  $('ks-name').value = 'Package ' + String.fromCharCode(65 + pkgs.length);
  renderPkgs();
});
$('btn-demo-ks').addEventListener('click', () => {
  pkgs.length = 0;
  pkgs.push({ name: 'Electronics', weight: 10, value: 8000 }, { name: 'Medicines', weight: 20, value: 10000 },
    { name: 'Machinery', weight: 30, value: 6000 }, { name: 'Textiles', weight: 5, value: 4000 },
    { name: 'Fresh produce', weight: 15, value: 9000 }, { name: 'Auto parts', weight: 25, value: 7500 },
    { name: 'Chemicals', weight: 18, value: 5500 });
  $('ks-cap').value = 50; renderPkgs(); toast('Sample packages loaded');
});
$('btn-ks').addEventListener('click', async () => {
  if (!pkgs.length) { toast('Add some packages first', 'error'); return; }
  const cap = +$('ks-cap').value || 50;
  const res = await api('/api/knapsack', { weights: pkgs.map(p => p.weight), values: pkgs.map(p => p.value), capacity: cap });
  if (res.error) { toast(res.error, 'error'); return; }
  const sel = new Set(res.selected);
  $('ks-badge').style.display = 'inline-block';
  $('ks-badge').textContent = `Best value ₹${res.max_value.toLocaleString('en-IN')}`;
  $('ks-result').innerHTML = pkgs.map((p, i) => `<div class="ks-row ${sel.has(i) ? 'sel' : 'skip'}">
    <span class="mark">${sel.has(i) ? '✓' : '–'}</span><span class="nm">${esc(p.name)}</span>
    <span class="mt"><span>${p.weight} kg</span><span>₹${p.value.toLocaleString('en-IN')}</span></span></div>`).join('');
  const pct = Math.round(res.total_weight / cap * 100);
  $('ks-cap-box').style.display = 'block';
  $('ks-cap-text').textContent = `${res.total_weight} / ${cap} kg (${pct}%)`;
  $('ks-cap-fill').style.width = '0';
  requestAnimationFrame(() => requestAnimationFrame(() => $('ks-cap-fill').style.width = Math.min(pct, 100) + '%'));
  toast(`Load ${res.selected.length} of ${pkgs.length} packages`);
});

// ══════════════════════════════════════════════════════════════════════════
// BENCHMARKS
// ══════════════════════════════════════════════════════════════════════════
let chartCost, chartTime;
const axis = { ticks: { color: '#66708a' }, grid: { color: '#edf0f6' } };
const chartOpts = extra => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#1a2236', usePointStyle: true, boxWidth: 8, font: { family: 'Inter', weight: 600 } } } },
  scales: { x: axis, y: { ...axis, ...(extra || {}) } }
});

$('btn-bench').addEventListener('click', async () => {
  const sizes = $('bench-sizes').value.split(',').map(s => parseInt(s.trim())).filter(n => n > 1);
  if (!sizes.length) { toast('Enter city counts like 5,10,20', 'error'); return; }
  $('bench-loading').style.display = 'flex';
  $('btn-bench').disabled = true;
  const res = await api('/api/benchmark', { sizes });
  $('bench-loading').style.display = 'none'; $('btn-bench').disabled = false;
  if (!Array.isArray(res)) { toast('Benchmark failed', 'error'); return; }

  const labels = res.map(r => r.n_cities + ' cities');
  const ds = (label, data, color) => ({ label, data, backgroundColor: color, borderColor: color, borderWidth: 2, borderRadius: 4, tension: .35, pointRadius: 4 });
  const col = { g: '#1d4ed8', o: '#f97316', d: '#16a34a' };
  const dp = f => res.map(r => r.dp_cost > 0 ? f(r) : null);

  if (chartCost) chartCost.destroy();
  chartCost = new Chart($('chart-cost'), { type: 'bar', options: chartOpts(), data: { labels, datasets: [
    ds('Nearest neighbour', res.map(r => r.greedy_cost), col.g), ds('2-Opt', res.map(r => r.two_opt_cost), col.o), ds('Exact', dp(r => r.dp_cost), col.d)] } });
  if (chartTime) chartTime.destroy();
  chartTime = new Chart($('chart-time'), { type: 'line', options: chartOpts({ type: 'logarithmic' }), data: { labels, datasets: [
    ds('Nearest neighbour', res.map(r => r.greedy_ms), col.g), ds('2-Opt', res.map(r => r.two_opt_ms), col.o), ds('Exact', dp(r => r.dp_ms), col.d)] } });

  $('bench-table').innerHTML = `<table class="tbl"><thead><tr><th>Cities</th><th>Stops</th><th class="r">NN km</th><th class="r">2-Opt km</th><th class="r">Exact km</th>
    <th class="r">2-Opt saves</th><th class="r">Exact saves</th><th class="r">NN ms</th><th class="r">2-Opt ms</th><th class="r">Exact ms</th></tr></thead><tbody>` +
    res.map(r => `<tr><td><b>${r.n_cities}</b></td><td>${r.n_stops}</td><td class="r">${r.greedy_cost.toFixed(1)}</td><td class="r">${r.two_opt_cost.toFixed(1)}</td>
      <td class="r">${r.dp_cost > 0 ? r.dp_cost.toFixed(1) : '<span class="na">–</span>'}</td>
      <td class="r gain">${r.improvement_2opt_pct.toFixed(1)}%</td>
      <td class="r">${r.improvement_dp_pct != null ? `<span class="gain">${r.improvement_dp_pct.toFixed(1)}%</span>` : '<span class="na">–</span>'}</td>
      <td class="r">${r.greedy_ms.toFixed(2)}</td><td class="r">${r.two_opt_ms.toFixed(2)}</td>
      <td class="r">${r.dp_ms > 0 ? r.dp_ms.toFixed(2) : '<span class="na">–</span>'}</td></tr>`).join('') + '</tbody></table>';
  toast('Benchmark complete');
});

// ── Boot ──────────────────────────────────────────────────────────────────
renderOrders(); renderDrivers(); renderPkgs();
loadNetwork().then(() => { first = false; runDijkstra(); });
