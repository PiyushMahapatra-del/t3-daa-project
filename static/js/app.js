/**
 * LOGIX // ENTERPRISE LOGISTICS OPTIMIZER
 * Frontend Application & Canvas Engine
 * Aesthetic: Bloomberg Terminal × Vercel Dashboard × Linear.app
 */

'use strict';

// ── Application State ───────────────────────────────────────────────────────
const state = {
  graph: null,
  graphN: 12,
  graphSeed: 42,
  selectedNode: null,
  dijkstraPath: [],
  dijkstraCost: null,
  tspTour: [],
  tspCost: null,
  tspAlgo: '2opt',
  orders: [],
  drivers: [],
  knapsackPkgs: [],
  activeTab: 'graph',
  // Canvas animation
  animDashOffset: 0,
  animPulsePhase: 0,
  // Live Vehicle Simulation
  simActive: false,
  simProgress: 0,
  simPath: [],
  simStep: 0,
  simTimer: null
};

// ── Utility Helpers ────────────────────────────────────────────────────────
const el = id => document.getElementById(id);
const fmt = (n, d = 1) => (typeof n === 'number' && !isNaN(n)) ? n.toFixed(d) : '—';

async function api(endpoint, payload) {
  const t0 = performance.now();
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    const t1 = performance.now();
    const elapsed = (t1 - t0).toFixed(2);
    // Update KPI latency card
    const kpiAlgo = el('kpi-algo');
    if (kpiAlgo) kpiAlgo.textContent = elapsed;
    return json;
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    return { error: err.message || 'Network error' };
  }
}

function toast(msg, type = 'info') {
  const container = el('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span style="margin-right:6px">${type === 'error' ? '⚠' : type === 'warning' ? '⚡' : '✓'}</span> ${msg}`;
  container.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(30px)';
    t.style.transition = 'all 200ms ease-out';
    setTimeout(() => t.remove(), 220);
  }, 3400);
}

// ── Live UTC Clock ─────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const utc = now.toUTCString().split(' ')[4] + ' UTC';
  const clockEl = el('topbar-clock');
  if (clockEl) clockEl.textContent = utc;
}
setInterval(updateClock, 1000);
updateClock();

// ── Sidebar & Navigation ───────────────────────────────────────────────────
const BREADCRUMB_MAP = {
  graph:     'City Network Topology',
  routing:   'Route Planning // Dijkstra & TSP',
  orders:    'Fleet Dispatch // Orders & Carriers',
  benchmark: 'DAA Algorithm Benchmark Suite',
  knapsack:  '0/1 Knapsack // Vehicle Capacity'
};

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });
  const bc = el('bc-current');
  if (bc && BREADCRUMB_MAP[tabId]) bc.textContent = BREADCRUMB_MAP[tabId];

  // Refresh canvases if active
  if (tabId === 'graph' || tabId === 'routing') {
    requestAnimationFrame(renderCanvases);
  }
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Sidebar collapse toggle
const sidebarToggle = el('sidebar-toggle');
if (sidebarToggle) {
  sidebarToggle.addEventListener('click', () => {
    const sidebar = el('sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed');
  });
}

// Keyboard shortcuts: 1-5 to switch tabs, R to randomize seed
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key >= '1' && e.key <= '5') {
    const tabs = ['graph', 'routing', 'orders', 'benchmark', 'knapsack'];
    switchTab(tabs[parseInt(e.key) - 1]);
  } else if (e.key.toLowerCase() === 'r') {
    const randBtn = el('btn-seed-rand');
    if (randBtn) randBtn.click();
  }
});

// ── KPI Strip Updates ──────────────────────────────────────────────────────
function updateKPIs() {
  if (state.graph) {
    const citiesEl = el('kpi-cities');
    const edgesEl = el('kpi-edges');
    if (citiesEl) citiesEl.textContent = state.graph.n;
    if (edgesEl) edgesEl.textContent = state.graph.edges.length;

    const tagCities = el('tag-cities-count');
    if (tagCities) tagCities.textContent = `${state.graph.n} HUBS`;
  }

  const ordersEl = el('kpi-orders');
  if (ordersEl) ordersEl.textContent = state.orders.length;

  const driversEl = el('kpi-drivers');
  if (driversEl) driversEl.textContent = state.drivers.length;

  const tagOrders = el('tag-orders-count');
  if (tagOrders) tagOrders.textContent = `${state.orders.length} QUEUED`;

  const priorityBreakdown = el('kpi-priority-breakdown');
  if (priorityBreakdown) {
    const urgentCount = state.orders.filter(o => o.priority === 'URGENT').length;
    priorityBreakdown.textContent = `${urgentCount} URGENT`;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CANVAS GRAPH ENGINE & ANIMATION (Dark #0a0e1a, Glowing Nodes, Pulsing Halos)
// ══════════════════════════════════════════════════════════════════════════

function getCanvasCoordinates(nodes, width, height, padding = 48) {
  if (!nodes || !nodes.length) return [];
  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  return nodes.map(n => ({
    ...n,
    cx: padding + ((n.x - minX) / spanX) * (width - 2 * padding),
    cy: padding + ((n.y - minY) / spanY) * (height - 2 * padding)
  }));
}

function initCanvasDPI(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const displayW = rect.width || canvas.parentElement.clientWidth || 800;
  const displayH = Math.min(460, Math.max(340, window.innerHeight * 0.44));

  if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr) {
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: displayW, height: displayH };
}

function drawBackgroundGrid(ctx, w, h) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.lineWidth = 1;
  const step = 40;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // Subtle radial vignette
  const grad = ctx.createRadialGradient(w/2, h/2, 20, w/2, h/2, Math.max(w, h)*0.75);
  grad.addColorStop(0, 'rgba(10, 14, 26, 0)');
  grad.addColorStop(1, 'rgba(6, 9, 17, 0.85)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawNetworkCanvas(canvasId, options = {}) {
  const canvas = el(canvasId);
  if (!canvas || !state.graph) return;
  const { ctx, width: W, height: H } = initCanvasDPI(canvas);

  ctx.clearRect(0, 0, W, H);
  drawBackgroundGrid(ctx, W, H);

  const scaled = getCanvasCoordinates(state.graph.nodes, W, H);
  const { pathIdxs = [], tourIdxs = [], isRoute = false } = options;

  // Active edge sets
  const pathEdgeSet = new Set();
  for (let i = 0; i + 1 < pathIdxs.length; i++) {
    pathEdgeSet.add(`${pathIdxs[i]}-${pathIdxs[i+1]}`);
    pathEdgeSet.add(`${pathIdxs[i+1]}-${pathIdxs[i]}`);
  }

  const tourEdgeSet = new Set();
  for (let i = 0; i + 1 < tourIdxs.length; i++) {
    tourEdgeSet.add(`${tourIdxs[i]}-${tourIdxs[i+1]}`);
    tourEdgeSet.add(`${tourIdxs[i+1]}-${tourIdxs[i]}`);
  }

  // 1. Draw Inactive / Base Edges
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.09)';
  ctx.lineWidth = 1;
  state.graph.edges.forEach(e => {
    const a = scaled[e.from], b = scaled[e.to];
    if (!a || !b) return;
    const key = `${e.from}-${e.to}`;
    if (!pathEdgeSet.has(key) && !tourEdgeSet.has(key)) {
      ctx.beginPath();
      ctx.moveTo(a.cx, a.cy);
      ctx.lineTo(b.cx, b.cy);
      ctx.stroke();
    }
  });
  ctx.restore();

  // 2. Draw TSP Tour (Gradient stroke: Amber #f59e0b to Rose #ec4899)
  if (tourIdxs.length > 1) {
    ctx.save();
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.45)';
    ctx.shadowBlur = 10;

    for (let i = 0; i + 1 < tourIdxs.length; i++) {
      const a = scaled[tourIdxs[i]], b = scaled[tourIdxs[i+1]];
      if (!a || !b) continue;

      const grad = ctx.createLinearGradient(a.cx, a.cy, b.cx, b.cy);
      grad.addColorStop(0, '#f59e0b');
      grad.addColorStop(1, '#ec4899');
      ctx.strokeStyle = grad;

      ctx.beginPath();
      ctx.moveTo(a.cx, a.cy);
      ctx.lineTo(b.cx, b.cy);
      ctx.stroke();

      // Directional Flow Arrow
      drawFlowArrow(ctx, a.cx, a.cy, b.cx, b.cy, '#f59e0b');
    }
    ctx.restore();
  }

  // 3. Draw Dijkstra Shortest Path (Animated Dashed Edges with Cyan Glow)
  if (pathIdxs.length > 1) {
    ctx.save();
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([8, 5]);
    ctx.lineDashOffset = -state.animDashOffset;
    ctx.shadowColor = 'rgba(0, 212, 255, 0.7)';
    ctx.shadowBlur = 12;

    ctx.beginPath();
    for (let i = 0; i + 1 < pathIdxs.length; i++) {
      const a = scaled[pathIdxs[i]], b = scaled[pathIdxs[i+1]];
      if (!a || !b) continue;
      if (i === 0) ctx.moveTo(a.cx, a.cy);
      ctx.lineTo(b.cx, b.cy);
    }
    ctx.stroke();
    ctx.restore();

    // Solid directional arrows for Dijkstra
    for (let i = 0; i + 1 < pathIdxs.length; i++) {
      const a = scaled[pathIdxs[i]], b = scaled[pathIdxs[i+1]];
      if (a && b) drawFlowArrow(ctx, a.cx, a.cy, b.cx, b.cy, '#00d4ff');
    }
  }

  // 4. Draw Nodes with Glowing Circles and Monospace Labels
  scaled.forEach((node, i) => {
    const isSelected = state.selectedNode === i;
    const isDijkstra = pathIdxs.includes(i);
    const isTour = tourIdxs.includes(i);
    const isDepot = tourIdxs.length > 0 && tourIdxs[0] === i;
    const isSrc = pathIdxs.length > 0 && pathIdxs[0] === i;
    const isDst = pathIdxs.length > 0 && pathIdxs[pathIdxs.length - 1] === i;

    let nodeColor = '#38bdf8'; // Default tactical cyan-blue
    let glowColor = 'rgba(56, 189, 248, 0.4)';
    let radius = 9;

    if (isDepot) {
      nodeColor = '#f59e0b'; // Amber
      glowColor = 'rgba(245, 158, 11, 0.75)';
      radius = 12;
    } else if (isSrc) {
      nodeColor = '#00d4ff'; // Electric cyan
      glowColor = 'rgba(0, 212, 255, 0.8)';
      radius = 12;
    } else if (isDst) {
      nodeColor = '#10b981'; // Emerald
      glowColor = 'rgba(16, 185, 129, 0.8)';
      radius = 12;
    } else if (isTour) {
      nodeColor = '#ec4899'; // Rose
      glowColor = 'rgba(236, 72, 153, 0.6)';
      radius = 10;
    } else if (isDijkstra) {
      nodeColor = '#00d4ff';
      glowColor = 'rgba(0, 212, 255, 0.6)';
      radius = 10;
    } else if (isSelected) {
      nodeColor = '#ffffff';
      glowColor = 'rgba(255, 255, 255, 0.9)';
      radius = 11;
    }

    // Canvas nodes pulse subtly when selected
    if (isSelected || isSrc || isDst || isDepot) {
      ctx.save();
      const pulseR = radius + 4 + Math.sin(state.animPulsePhase) * 3;
      ctx.beginPath();
      ctx.arc(node.cx, node.cy, pulseR, 0, Math.PI * 2);
      ctx.strokeStyle = nodeColor;
      ctx.globalAlpha = 0.35 + Math.sin(state.animPulsePhase) * 0.25;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // Outer glow circle
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = isSelected || isSrc || isDst || isDepot ? 14 : 7;

    // Node Dark Background
    ctx.beginPath();
    ctx.arc(node.cx, node.cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();

    // Node Glowing Border
    ctx.strokeStyle = nodeColor;
    ctx.lineWidth = isSelected || isSrc || isDst || isDepot ? 2.5 : 1.8;
    ctx.stroke();
    ctx.restore();

    // Monospace Node Index inside circle
    ctx.fillStyle = '#f8fafc';
    ctx.font = `700 ${radius >= 11 ? '10px' : '9px'} 'JetBrains Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(i.toString().padStart(2, '0'), node.cx, node.cy);

    // City Name Label above node
    ctx.fillStyle = isSelected || isSrc || isDst || isDepot ? '#f8fafc' : '#94a3b8';
    ctx.font = `600 10px 'Inter', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(node.id.toUpperCase(), node.cx, node.cy - radius - 3);
  });

  // 5. Live Courier Vehicle Beacon Simulation
  if (isRoute && state.simActive && state.simPath.length > 1) {
    const curIdx = state.simPath[state.simStep];
    const nxtIdx = state.simPath[state.simStep + 1];
    if (curIdx !== undefined && nxtIdx !== undefined) {
      const a = scaled[curIdx], b = scaled[nxtIdx];
      if (a && b) {
        const vx = a.cx + (b.cx - a.cx) * state.simProgress;
        const vy = a.cy + (b.cy - a.cy) * state.simProgress;

        // Vehicle Beacon Pulsing Ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(vx, vy, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(vx, vy, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 12;
        ctx.fill();

        // Monospace Telemetry tag above vehicle
        ctx.font = `700 9px 'JetBrains Mono', monospace`;
        ctx.fillStyle = '#10b981';
        ctx.textAlign = 'center';
        ctx.fillText('DISPATCH-01', vx, vy - 14);
        ctx.restore();
      }
    }
  }
}

function drawFlowArrow(ctx, x1, y1, x2, y2, color) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 10) return;
  const mx = x1 + dx * 0.62, my = y1 + dy * 0.62;
  const ux = dx / len, uy = dy / len;
  const arrowSize = 6;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(mx + ux * arrowSize, my + uy * arrowSize);
  ctx.lineTo(mx - uy * arrowSize * 0.6 - ux * arrowSize * 0.5, my + ux * arrowSize * 0.6 - uy * arrowSize * 0.5);
  ctx.lineTo(mx + uy * arrowSize * 0.6 - ux * arrowSize * 0.5, my - ux * arrowSize * 0.6 - uy * arrowSize * 0.5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function renderCanvases() {
  if (!state.graph) return;
  drawNetworkCanvas('graph-canvas');
  drawNetworkCanvas('route-canvas', {
    pathIdxs: state.dijkstraPath,
    tourIdxs: state.tspTour,
    isRoute: true
  });
}

// Global Animation Loop for 60fps flowing dashes & pulsing halos
function animationTick() {
  state.animDashOffset = (state.animDashOffset + 0.6) % 60;
  state.animPulsePhase = (state.animPulsePhase + 0.06) % (Math.PI * 2);

  // Update vehicle simulation position if running
  if (state.simActive && state.simPath.length > 1) {
    state.simProgress += 0.025;
    if (state.simProgress >= 1) {
      state.simProgress = 0;
      state.simStep++;
      if (state.simStep >= state.simPath.length - 1) {
        state.simStep = 0; // Loop or finish
      }
    }
  }

  renderCanvases();
  requestAnimationFrame(animationTick);
}
requestAnimationFrame(animationTick);

// Handle window resizing
window.addEventListener('resize', () => {
  requestAnimationFrame(renderCanvases);
});

// ── Interactive Canvas Node Selection & HUD Overlay ────────────────────────
function setupCanvasInteractions(canvasId) {
  const canvas = el(canvasId);
  if (!canvas) return;

  function findNodeUnderPointer(e) {
    if (!state.graph) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const scaled = getCanvasCoordinates(state.graph.nodes, rect.width, rect.height);

    for (let i = 0; i < scaled.length; i++) {
      const node = scaled[i];
      const dist = Math.hypot(node.cx - x, node.cy - y);
      if (dist <= 18) return { node, index: i };
    }
    return null;
  }

  canvas.addEventListener('mousemove', e => {
    const hit = findNodeUnderPointer(e);
    const hud = el('graph-hud');
    if (hit) {
      canvas.style.cursor = 'pointer';
      if (hud && canvasId === 'graph-canvas') {
        hud.style.display = 'block';
        el('hud-node-title').textContent = `NODE #${hit.index.toString().padStart(2, '0')} [${hit.node.id}]`;
        el('hud-node-coords').textContent = `X: ${hit.node.x}, Y: ${hit.node.y}`;
        const degree = state.graph.edges.filter(ed => ed.from === hit.index || ed.to === hit.index).length;
        el('hud-node-deg').textContent = `${degree} connected links`;

        // Configure HUD action buttons
        el('hud-set-src').onclick = () => { el('dijk-src').value = hit.index; toast(`Set Node #${hit.index} as Dijkstra Source`); };
        el('hud-set-dst').onclick = () => { el('dijk-dst').value = hit.index; toast(`Set Node #${hit.index} as Dijkstra Destination`); };
        el('hud-set-depot').onclick = () => { el('tsp-depot').value = hit.index; toast(`Set Node #${hit.index} as TSP Depot`); };
      }
    } else {
      canvas.style.cursor = 'crosshair';
    }
  });

  canvas.addEventListener('click', e => {
    const hit = findNodeUnderPointer(e);
    if (hit) {
      state.selectedNode = hit.index;
      toast(`Selected Vertex #${hit.index} [${hit.node.id}]`);
    } else {
      state.selectedNode = null;
    }
  });
}

setupCanvasInteractions('graph-canvas');
setupCanvasInteractions('route-canvas');

// ══════════════════════════════════════════════════════════════════════════
// TAB 1 — CITY NETWORK TOPOLOGY GENERATOR
// ══════════════════════════════════════════════════════════════════════════

async function generateNetwork(n, seed) {
  const btn = el('btn-generate');
  if (btn) {
    btn.disabled = true;
    btn.querySelector('.btn-text').textContent = 'Synthesizing...';
  }

  const res = await api('/api/generate', { n, seed });

  if (btn) {
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Generate Network';
  }

  if (res.error) {
    toast(`Generation failed: ${res.error}`, 'error');
    return;
  }

  state.graph = res;
  state.graphN = n;
  state.graphSeed = seed;

  // Clear previous route solutions that matched old graph
  state.dijkstraPath = [];
  state.tspTour = [];
  state.selectedNode = null;

  // Telemetry widget update
  const teleSeed = el('tele-seed');
  if (teleSeed) teleSeed.textContent = `#${seed}`;

  const graphInfo = el('graph-info');
  if (graphInfo) {
    graphInfo.textContent = `Euclidean Mesh: ${res.n} nodes, ${res.edges.length} edges (seed #${seed})`;
  }

  updateKPIs();
  renderVertexRegistryTable(res.nodes, res.edges);
  renderCanvases();
  toast(`Synthesized network with ${res.n} nodes & ${res.edges.length} edges`, 'info');
}

function renderVertexRegistryTable(nodes, edges) {
  const tbody = el('nodes-table-body');
  if (!tbody || !nodes) return;

  const badgeEl = el('vertex-count-badge');
  if (badgeEl) badgeEl.textContent = `${nodes.length} Vertices`;

  tbody.innerHTML = nodes.map((node, i) => {
    const degree = edges.filter(e => e.from === i || e.to === i).length;
    return `
      <tr>
        <td class="mono-cell" style="color:var(--cyan); font-weight:700;">#${i.toString().padStart(2, '0')}</td>
        <td style="font-weight:600;">${node.id.toUpperCase()}-HUB</td>
        <td class="text-right mono-cell">${node.x.toFixed(1)}</td>
        <td class="text-right mono-cell">${node.y.toFixed(1)}</td>
        <td class="text-right mono-cell">${degree} links</td>
        <td class="text-right"><span class="badge badge-LOW"><span class="badge-dot"></span>ACTIVE</span></td>
      </tr>
    `;
  }).join('');
}

// Generate button listener
const btnGenerate = el('btn-generate');
if (btnGenerate) {
  btnGenerate.addEventListener('click', () => {
    const n = parseInt(el('gen-n').value) || 12;
    const seed = parseInt(el('gen-seed').value) || 42;
    generateNetwork(n, seed);
  });
}

// Randomize Seed button
const btnRandSeed = el('btn-seed-rand');
if (btnRandSeed) {
  btnRandSeed.addEventListener('click', () => {
    const rand = Math.floor(Math.random() * 8999) + 1000;
    el('gen-seed').value = rand;
    generateNetwork(parseInt(el('gen-n').value) || 12, rand);
  });
}

// Fit View button
const btnResetView = el('btn-reset-view');
if (btnResetView) {
  btnResetView.addEventListener('click', () => {
    renderCanvases();
    toast('Canvas view calibrated');
  });
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 2 — ROUTE PLANNING (Dijkstra Shortest Path & TSP Multi-Stop)
// ══════════════════════════════════════════════════════════════════════════

// 1. Dijkstra Shortest Path
const btnDijkstra = el('btn-dijkstra');
if (btnDijkstra) {
  btnDijkstra.addEventListener('click', async () => {
    if (!state.graph) {
      toast('Generate a network graph first', 'warning');
      return;
    }
    const src = parseInt(el('dijk-src').value);
    const dst = parseInt(el('dijk-dst').value);

    if (isNaN(src) || isNaN(dst) || src < 0 || dst < 0 || src >= state.graph.n || dst >= state.graph.n) {
      toast(`Enter valid city indices (0 to ${state.graph.n - 1})`, 'error');
      return;
    }

    const res = await api('/api/shortest', {
      n: state.graphN,
      seed: state.graphSeed,
      src,
      dst
    });

    const box = el('dijkstra-result');
    if (res.error || !res.reachable) {
      box.style.display = 'block';
      box.innerHTML = `<div style="color:var(--rose)">⚠ Path unreachable between vertex #${src} and #${dst}</div>`;
      return;
    }

    state.dijkstraPath = res.path.map(p => p.idx);
    state.dijkstraCost = res.cost;

    // Build Step Chain HTML
    const stepsHtml = res.path.map(p => `<span class="route-node-pill">#${p.idx} ${p.name}</span>`).join('<span class="route-arrow">→</span>');

    box.style.display = 'block';
    box.innerHTML = `
      <div class="result-stat-grid">
        <div class="result-stat-card">
          <div class="stat-card-label">TOTAL DISTANCE</div>
          <div class="stat-card-val">${fmt(res.cost)} km</div>
        </div>
        <div class="result-stat-card">
          <div class="stat-card-label">NODES TRAVERSED</div>
          <div class="stat-card-val">${res.path.length} vertices</div>
        </div>
        <div class="result-stat-card">
          <div class="stat-card-label">COMPLEXITY</div>
          <div class="stat-card-val">O((V+E)logV)</div>
        </div>
      </div>
      <div class="route-step-chain">${stepsHtml}</div>
    `;

    // Configure simulation path
    state.simPath = state.dijkstraPath;
    state.simStep = 0;
    state.simProgress = 0;

    renderCanvases();
    toast(`Dijkstra path calculated: ${fmt(res.cost)} km`);
  });
}

// 2. TSP Route Planner
const btnTsp = el('btn-tsp');
if (btnTsp) {
  btnTsp.addEventListener('click', async () => {
    if (!state.graph) {
      toast('Generate a network graph first', 'warning');
      return;
    }
    const depot = parseInt(el('tsp-depot').value);
    const stopsStr = el('tsp-stops').value;
    const stops = stopsStr.split(',')
      .map(s => parseInt(s.trim()))
      .filter(s => !isNaN(s) && s >= 0 && s < state.graph.n && s !== depot);
    const algo = el('tsp-algo').value;

    if (!stops.length) {
      toast('Specify at least 1 valid delivery stop index', 'error');
      return;
    }

    if (algo === 'dp' && stops.length > 12) {
      toast('Held-Karp Exact DP limited to ≤ 12 stops. Falling back to 2-Opt.', 'warning');
    }

    const res = await api('/api/tsp', {
      n: state.graphN,
      seed: state.graphSeed,
      depot,
      stops,
      algo
    });

    const box = el('tsp-result');
    if (res.error) {
      box.style.display = 'block';
      box.innerHTML = `<div style="color:var(--rose)">⚠ TSP computation failed: ${res.error}</div>`;
      return;
    }

    state.tspTour = res.tour.map(t => t.idx);
    state.tspCost = res.cost;

    const algoNames = {
      greedy: 'Nearest Neighbor (Greedy)',
      '2opt': '2-Opt Local Search',
      dp: 'Held-Karp Exact DP'
    };

    const stepsHtml = res.tour.map(p => `<span class="route-node-pill">#${p.idx} ${p.name}</span>`).join('<span class="route-arrow" style="color:var(--amber);">→</span>');

    box.style.display = 'block';
    box.innerHTML = `
      <div class="result-stat-grid">
        <div class="result-stat-card">
          <div class="stat-card-label">TOTAL TOUR COST</div>
          <div class="stat-card-val" style="color:var(--amber);">${fmt(res.cost)} km</div>
        </div>
        <div class="result-stat-card">
          <div class="stat-card-label">ALGORITHM</div>
          <div class="stat-card-val" style="font-size:11px;">${algoNames[res.algo] || res.algo}</div>
        </div>
        <div class="result-stat-card">
          <div class="stat-card-label">TOTAL STOPS</div>
          <div class="stat-card-val">${res.tour.length - 1} stops</div>
        </div>
      </div>
      <div class="route-step-chain">${stepsHtml}</div>
    `;

    // Configure simulation path
    state.simPath = state.tspTour;
    state.simStep = 0;
    state.simProgress = 0;

    renderCanvases();
    toast(`TSP tour optimized (${algoNames[res.algo]}): ${fmt(res.cost)} km`);
  });
}

// Quick Preset Stops button
const btnQuickStops = el('btn-quick-stops');
if (btnQuickStops) {
  btnQuickStops.addEventListener('click', () => {
    if (!state.graph) return;
    const maxStops = Math.min(6, state.graph.n - 1);
    const set = new Set();
    while (set.size < maxStops) {
      const idx = Math.floor(Math.random() * (state.graph.n - 1)) + 1;
      set.add(idx);
    }
    el('tsp-stops').value = Array.from(set).sort((a,b)=>a-b).join(', ');
    toast('Loaded random delivery stop preset');
  });
}

// Live Dispatch Simulation Controls
const btnSimDispatch = el('btn-sim-dispatch');
if (btnSimDispatch) {
  btnSimDispatch.addEventListener('click', () => {
    if (!state.simPath.length) {
      if (state.dijkstraPath.length) state.simPath = state.dijkstraPath;
      else if (state.tspTour.length) state.simPath = state.tspTour;
      else {
        toast('Calculate a Dijkstra path or TSP tour first', 'warning');
        return;
      }
    }
    state.simActive = !state.simActive;
    btnSimDispatch.innerHTML = state.simActive
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Pause`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Simulate Dispatch`;
    toast(state.simActive ? 'Live courier dispatch simulation active' : 'Simulation paused');
  });
}

const btnSimReset = el('btn-sim-reset');
if (btnSimReset) {
  btnSimReset.addEventListener('click', () => {
    state.simActive = false;
    state.simStep = 0;
    state.simProgress = 0;
    if (btnSimDispatch) {
      btnSimDispatch.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Simulate Dispatch`;
    }
    renderCanvases();
    toast('Simulation telemetry reset');
  });
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 3 — FLEET & ORDERS MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════

function renderOrdersTable() {
  const tbody = document.querySelector('#orders-table tbody');
  const badge = el('order-count-badge');
  if (badge) badge.textContent = `${state.orders.length} Orders`;
  if (!tbody) return;

  if (!state.orders.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No active orders queued</td></tr>';
    updateKPIs();
    return;
  }

  tbody.innerHTML = state.orders.map((o, i) => `
    <tr>
      <td class="mono-cell" style="color:var(--text-muted);">#${(i + 1).toString().padStart(2, '0')}</td>
      <td class="mono-cell">Hub #${o.src} → Hub #${o.dst}</td>
      <td class="text-right mono-cell" style="font-weight:700;">${o.weight} kg</td>
      <td>
        <span class="badge badge-${o.priority}">
          <span class="badge-dot"></span>${o.priority}
        </span>
      </td>
      <td class="text-right">
        <button class="del-btn" onclick="deleteOrder(${i})" title="Remove Order">✕</button>
      </td>
    </tr>
  `).join('');

  updateKPIs();
}

window.deleteOrder = function(i) {
  state.orders.splice(i, 1);
  renderOrdersTable();
};

function renderDriversTable() {
  const tbody = document.querySelector('#drivers-table tbody');
  const badge = el('driver-count-badge');
  if (badge) badge.textContent = `${state.drivers.length} Drivers`;
  if (!tbody) return;

  if (!state.drivers.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No drivers in roster</td></tr>';
    updateKPIs();
    return;
  }

  tbody.innerHTML = state.drivers.map((d, i) => `
    <tr>
      <td class="mono-cell" style="color:var(--text-muted);">#${(i + 1).toString().padStart(2, '0')}</td>
      <td style="font-weight:600;">${d.name}</td>
      <td class="text-right mono-cell" style="font-weight:700;">${d.capacity} kg</td>
      <td class="text-right">
        <button class="del-btn" onclick="deleteDriver(${i})" title="Remove Driver">✕</button>
      </td>
    </tr>
  `).join('');

  updateKPIs();
}

window.deleteDriver = function(i) {
  state.drivers.splice(i, 1);
  renderDriversTable();
};

// Add Order
const btnAddOrder = el('btn-add-order');
if (btnAddOrder) {
  btnAddOrder.addEventListener('click', () => {
    state.orders.push({
      src: parseInt(el('o-src').value) || 0,
      dst: parseInt(el('o-dst').value) || 1,
      weight: parseInt(el('o-weight').value) || 20,
      priority: el('o-priority').value || 'NORMAL'
    });
    renderOrdersTable();
    toast('Order added to dispatch queue');
  });
}

// Add Driver
const btnAddDriver = el('btn-add-driver');
if (btnAddDriver) {
  btnAddDriver.addEventListener('click', () => {
    const name = el('d-name').value.trim() || `Courier Van ${String.fromCharCode(65 + state.drivers.length)}`;
    const capacity = parseInt(el('d-cap').value) || 100;
    state.drivers.push({ name, capacity });
    renderDriversTable();
    el('d-name').value = `Courier Van ${String.fromCharCode(65 + state.drivers.length)}`;
    toast(`Driver ${name} registered`);
  });
}

// Load Enterprise Manifest Preset
const btnLoadDemo = el('btn-load-demo');
if (btnLoadDemo) {
  btnLoadDemo.addEventListener('click', () => {
    state.orders = [
      { src: 0, dst: 4, weight: 35, priority: 'URGENT' },
      { src: 1, dst: 3, weight: 50, priority: 'NORMAL' },
      { src: 2, dst: 5, weight: 20, priority: 'LOW' },
      { src: 0, dst: 6, weight: 80, priority: 'URGENT' },
      { src: 3, dst: 7, weight: 15, priority: 'NORMAL' },
      { src: 5, dst: 2, weight: 40, priority: 'URGENT' },
      { src: 4, dst: 8, weight: 25, priority: 'LOW' }
    ];

    state.drivers = [
      { name: 'Sprinter Rig Alpha', capacity: 120 },
      { name: 'Heavy Cargo Beta', capacity: 160 },
      { name: 'EV Courier Express', capacity: 80 }
    ];

    renderOrdersTable();
    renderDriversTable();
    toast('Loaded Enterprise Manifest: 7 Orders & 3 Carrier Vehicles');
  });
}

// Execute Greedy Assignment
const btnAssign = el('btn-assign');
if (btnAssign) {
  btnAssign.addEventListener('click', async () => {
    if (!state.orders.length) {
      toast('Add at least one order to the queue', 'warning');
      return;
    }
    if (!state.drivers.length) {
      toast('Register at least one carrier driver', 'warning');
      return;
    }

    const res = await api('/api/assign', {
      orders: state.orders,
      drivers: state.drivers
    });

    if (res.error) {
      toast(res.error, 'error');
      return;
    }

    const card = el('assign-result-card');
    card.style.display = 'block';

    const assignedCount = res.assignments.filter(a => a.driver !== 'UNASSIGNED').length;
    const unassignedCount = res.assignments.length - assignedCount;

    const summaryBadge = el('assign-summary-badge');
    if (summaryBadge) {
      summaryBadge.textContent = `${assignedCount} ASSIGNED · ${unassignedCount} UNASSIGNED`;
    }

    // Render Assignment Table
    let tableHtml = `
      <div class="table-container">
        <table class="terminal-table">
          <thead>
            <tr>
              <th style="width:50px;">ORDER</th>
              <th>TRANSIT PATH</th>
              <th class="text-right">PAYLOAD</th>
              <th>PRIORITY</th>
              <th>ASSIGNED CARRIER</th>
            </tr>
          </thead>
          <tbody>
    `;

    res.assignments.forEach(a => {
      const isUn = a.driver === 'UNASSIGNED';
      tableHtml += `
        <tr>
          <td class="mono-cell">#${a.order_id.toString().padStart(2, '0')}</td>
          <td class="mono-cell">Hub #${a.src} → Hub #${a.dst}</td>
          <td class="text-right mono-cell" style="font-weight:700;">${a.weight} kg</td>
          <td><span class="badge badge-${a.priority}"><span class="badge-dot"></span>${a.priority}</span></td>
          <td style="font-weight:600; color:${isUn ? 'var(--rose)' : 'var(--cyan)'};">
            ${isUn ? '⚠ UNASSIGNED (CAPACITY EXCEEDED)' : `✓ ${a.driver}`}
          </td>
        </tr>
      `;
    });
    tableHtml += `</tbody></table></div>`;

    // Render Driver Capacity Bars
    let barsHtml = `<div style="margin-top:1rem;"><span class="card-title" style="font-size:10px; color:var(--text-muted);">FLEET CAPACITY UTILIZATION</span></div>`;
    res.drivers.forEach(d => {
      const pct = Math.round((d.load / d.capacity) * 100);
      const barClass = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : '';
      barsHtml += `
        <div class="driver-load-card">
          <div class="driver-load-info">
            <span style="font-weight:700;">${d.name}</span>
            <span class="mono-cell" style="color:var(--text-secondary);">${d.load} / ${d.capacity} kg (${pct}%)</span>
          </div>
          <div class="load-bar-track">
            <div class="load-bar-fill ${barClass}" style="width: ${Math.min(pct, 100)}%;"></div>
          </div>
        </div>
      `;
    });

    el('assign-result').innerHTML = tableHtml;
    el('driver-loads').innerHTML = barsHtml;
    toast(`Assignment complete: ${assignedCount}/${res.assignments.length} orders dispatched`);
  });
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 4 — BENCHMARK SUITE (Chart.js Bloomberg Terminal Theme)
// ══════════════════════════════════════════════════════════════════════════

let benchCostChart = null;
let benchTimeChart = null;

async function runBenchmark(sizes) {
  const loading = el('bench-loading');
  if (loading) loading.style.display = 'flex';

  const res = await api('/api/benchmark', { sizes });

  if (loading) loading.style.display = 'none';

  if (res.error) {
    toast(`Benchmark failed: ${res.error}`, 'error');
    return;
  }

  const labels = res.map(r => `N=${r.n_cities}`);
  const greedyCosts = res.map(r => +r.greedy_cost.toFixed(1));
  const twoOptCosts = res.map(r => +r.two_opt_cost.toFixed(1));
  const dpCosts = res.map(r => r.dp_cost > 0 ? +r.dp_cost.toFixed(1) : null);

  const greedyMs = res.map(r => +r.greedy_ms.toFixed(3));
  const twoOptMs = res.map(r => +r.two_opt_ms.toFixed(3));
  const dpMs = res.map(r => r.dp_ms > 0 ? +r.dp_ms.toFixed(3) : null);

  const terminalChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#94a3b8',
          font: { family: "'JetBrains Mono', monospace", size: 10 }
        }
      },
      tooltip: {
        backgroundColor: '#161b27',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        titleFont: { family: "'JetBrains Mono', monospace", size: 11 },
        bodyFont: { family: "'JetBrains Mono', monospace", size: 11 },
        padding: 10
      }
    },
    scales: {
      x: {
        ticks: { color: '#64748b', font: { family: "'JetBrains Mono', monospace", size: 10 } },
        grid: { color: 'rgba(255, 255, 255, 0.04)' }
      },
      y: {
        ticks: { color: '#64748b', font: { family: "'JetBrains Mono', monospace", size: 10 } },
        grid: { color: 'rgba(255, 255, 255, 0.04)' }
      }
    }
  };

  // Cost Comparison Chart
  if (benchCostChart) benchCostChart.destroy();
  benchCostChart = new Chart(el('bench-cost-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Greedy Heuristic', data: greedyCosts, backgroundColor: '#334155' },
        { label: '2-Opt Local Search', data: twoOptCosts, backgroundColor: '#00d4ff' },
        { label: 'Held-Karp Exact DP', data: dpCosts, backgroundColor: '#f59e0b' }
      ]
    },
    options: terminalChartOptions
  });

  // Time Comparison Chart
  if (benchTimeChart) benchTimeChart.destroy();
  benchTimeChart = new Chart(el('bench-time-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Greedy Heuristic (ms)', data: greedyMs, borderColor: '#64748b', tension: 0.25, pointRadius: 4 },
        { label: '2-Opt Local Search (ms)', data: twoOptMs, borderColor: '#00d4ff', tension: 0.25, pointRadius: 4 },
        { label: 'Held-Karp Exact DP (ms)', data: dpMs, borderColor: '#f59e0b', tension: 0.25, pointRadius: 4 }
      ]
    },
    options: terminalChartOptions
  });

  // Results Table
  let tableHtml = `
    <table class="terminal-table">
      <thead>
        <tr>
          <th>CITIES</th>
          <th>STOPS</th>
          <th class="text-right">GREEDY COST</th>
          <th class="text-right">2-OPT COST</th>
          <th class="text-right">DP EXACT COST</th>
          <th class="text-right">2-OPT GAIN</th>
          <th class="text-right">DP GAIN</th>
          <th class="text-right">GREEDY MS</th>
          <th class="text-right">2-OPT MS</th>
          <th class="text-right">DP MS</th>
        </tr>
      </thead>
      <tbody>
  `;

  res.forEach(r => {
    tableHtml += `
      <tr>
        <td class="mono-cell" style="font-weight:700;">N=${r.n_cities}</td>
        <td class="mono-cell">${r.n_stops}</td>
        <td class="text-right mono-cell">${fmt(r.greedy_cost)}</td>
        <td class="text-right mono-cell" style="color:var(--cyan); font-weight:700;">${fmt(r.two_opt_cost)}</td>
        <td class="text-right mono-cell" style="color:var(--amber); font-weight:700;">
          ${r.dp_cost > 0 ? fmt(r.dp_cost) : '<span class="pct-na">N/A (&gt;10 stops)</span>'}
        </td>
        <td class="text-right pct-gain">▼ ${fmt(r.improvement_2opt_pct)}%</td>
        <td class="text-right">
          ${r.improvement_dp_pct != null
            ? `<span class="pct-gain">▼ ${fmt(r.improvement_dp_pct)}%</span>`
            : '<span class="pct-na">N/A</span>'}
        </td>
        <td class="text-right mono-cell">${fmt(r.greedy_ms, 3)}</td>
        <td class="text-right mono-cell">${fmt(r.two_opt_ms, 3)}</td>
        <td class="text-right mono-cell">
          ${r.dp_ms > 0 ? fmt(r.dp_ms, 3) : '<span class="pct-na">—</span>'}
        </td>
      </tr>
    `;
  });
  tableHtml += `</tbody></table>`;
  el('bench-table-wrap').innerHTML = tableHtml;
  toast('Benchmark suite execution completed');
}

const btnBenchmark = el('btn-benchmark');
if (btnBenchmark) {
  btnBenchmark.addEventListener('click', () => {
    const raw = el('bench-sizes').value;
    const sizes = raw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 1);
    if (!sizes.length) {
      toast('Enter valid city counts (e.g. 5, 10, 20)', 'error');
      return;
    }
    runBenchmark(sizes);
  });
}

const btnBenchQuick = el('btn-bench-preset-quick');
if (btnBenchQuick) {
  btnBenchQuick.addEventListener('click', () => {
    el('bench-sizes').value = '5, 10';
    runBenchmark([5, 10]);
  });
}

const btnBenchDeep = el('btn-bench-preset-deep');
if (btnBenchDeep) {
  btnBenchDeep.addEventListener('click', () => {
    el('bench-sizes').value = '5, 10, 20, 50';
    runBenchmark([5, 10, 20, 50]);
  });
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 5 — KNAPSACK DP (VEHICLE PACKING)
// ══════════════════════════════════════════════════════════════════════════

function renderKnapsackTable() {
  const tbody = document.querySelector('#ks-table tbody');
  const badge = el('ks-manifest-badge');
  if (badge) badge.textContent = `${state.knapsackPkgs.length} Packages`;
  if (!tbody) return;

  if (!state.knapsackPkgs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No packages registered</td></tr>';
    return;
  }

  tbody.innerHTML = state.knapsackPkgs.map((p, i) => `
    <tr>
      <td class="mono-cell" style="color:var(--text-muted);">#${(i + 1).toString().padStart(2, '0')}</td>
      <td style="font-weight:600;">${p.name}</td>
      <td class="text-right mono-cell">${p.weight} kg</td>
      <td class="text-right mono-cell" style="font-weight:700; color:var(--cyan);">${p.value} pts</td>
      <td class="text-right">
        <button class="del-btn" onclick="deleteKnapsackPkg(${i})" title="Remove Package">✕</button>
      </td>
    </tr>
  `).join('');
}

window.deleteKnapsackPkg = function(i) {
  state.knapsackPkgs.splice(i, 1);
  renderKnapsackTable();
};

const btnAddPkg = el('btn-add-pkg');
if (btnAddPkg) {
  btnAddPkg.addEventListener('click', () => {
    const name = el('ks-name').value.trim() || `Parcel ${String.fromCharCode(65 + state.knapsackPkgs.length)}`;
    const weight = parseInt(el('ks-weight').value) || 10;
    const value = parseInt(el('ks-value').value) || 50;
    state.knapsackPkgs.push({ name, weight, value });
    renderKnapsackTable();
    el('ks-name').value = `Parcel ${String.fromCharCode(65 + state.knapsackPkgs.length)}`;
    toast(`Registered parcel ${name}`);
  });
}

const btnDemoKnapsack = el('btn-demo-knapsack');
if (btnDemoKnapsack) {
  btnDemoKnapsack.addEventListener('click', () => {
    state.knapsackPkgs = [
      { name: 'Surgical Sterilizers', weight: 10, value: 65 },
      { name: 'ICU Ventilator Modules', weight: 20, value: 110 },
      { name: 'Cold-Chain Insulin', weight: 12, value: 95 },
      { name: 'Satellite Transceiver', weight: 8,  value: 80 },
      { name: 'Emergency Plasma Units', weight: 15, value: 90 },
      { name: 'Diagnostic Defibrillator', weight: 25, value: 105 }
    ];
    el('ks-cap').value = 50;
    renderKnapsackTable();
    toast('Loaded high-value medical cargo manifest');
  });
}

const btnKnapsack = el('btn-knapsack');
if (btnKnapsack) {
  btnKnapsack.addEventListener('click', async () => {
    if (!state.knapsackPkgs.length) {
      toast('Register at least one parcel first', 'warning');
      return;
    }
    const capacity = parseInt(el('ks-cap').value) || 50;
    const weights = state.knapsackPkgs.map(p => p.weight);
    const values = state.knapsackPkgs.map(p => p.value);

    const res = await api('/api/knapsack', { weights, values, capacity });

    if (res.error) {
      toast(res.error, 'error');
      return;
    }

    const selSet = new Set(res.selected);
    const badge = el('ks-result-badge');
    if (badge) {
      badge.style.display = 'inline-block';
      badge.textContent = `VAL: ${res.max_value} PTS (${res.selected.length}/${state.knapsackPkgs.length} PKGS)`;
    }

    // Render Progress Bar
    const pct = Math.round((res.total_weight / capacity) * 100);
    el('ks-visual').style.display = 'block';
    el('ks-cap-text').textContent = `${res.total_weight} / ${capacity} kg (${pct}% capacity)`;
    el('ks-cap-fill').style.width = `${Math.min(pct, 100)}%`;

    // Render selected item list
    let html = '';
    state.knapsackPkgs.forEach((p, i) => {
      const selected = selSet.has(i);
      html += `
        <div class="ks-item-row ${selected ? 'ks-item-selected' : 'ks-item-skipped'}">
          <span style="font-weight:700; color:${selected ? 'var(--emerald)' : 'var(--text-muted)'};">
            ${selected ? '✓ LOADED' : '✕ EXCLUDED'}
          </span>
          <span style="flex:1; font-weight:600;">${p.name}</span>
          <span class="mono-cell" style="color:var(--text-secondary);">${p.weight} kg</span>
          <span class="mono-cell" style="font-weight:700; color:var(--cyan);">${p.value} pts</span>
        </div>
      `;
    });

    el('ks-result').innerHTML = html;
    toast(`Optimal Packing Found: Value ${res.max_value} (${res.total_weight} kg)`);
  });
}

// ══════════════════════════════════════════════════════════════════════════
// SCENARIO SWITCHERS & INITIALIZATION
// ══════════════════════════════════════════════════════════════════════════

function applyScenario(scenario) {
  document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
  if (scenario === 'default') {
    el('btn-scenario-default').classList.add('active');
    el('gen-n').value = 12;
    el('gen-seed').value = 42;
    generateNetwork(12, 42);
    el('btn-load-demo').click();
    el('btn-demo-knapsack').click();
  } else if (scenario === 'urban') {
    el('btn-scenario-urban').classList.add('active');
    el('gen-n').value = 16;
    el('gen-seed').value = 101;
    generateNetwork(16, 101);
  } else if (scenario === 'regional') {
    el('btn-scenario-regional').classList.add('active');
    el('gen-n').value = 8;
    el('gen-seed').value = 777;
    generateNetwork(8, 777);
  }
}

el('btn-scenario-default').addEventListener('click', () => applyScenario('default'));
el('btn-scenario-urban').addEventListener('click', () => applyScenario('urban'));
el('btn-scenario-regional').addEventListener('click', () => applyScenario('regional'));

// ── Application Startup ────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Apply default scenario on startup
  applyScenario('default');
  toast('LOGIX // DAA Engine Online');
});
