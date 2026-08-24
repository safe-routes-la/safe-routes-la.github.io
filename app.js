/* Safe Routes to School — client-side risk-aware pedestrian routing.
 *
 * The whole model runs in the browser. The pipeline ships a packed binary
 * graph where every block already carries a risk score per time-of-day
 * bucket, and A* here minimises  length * (1 + lambda * risk^1.5)  rather
 * than plain length.
 */
'use strict';

const WALK_MPS = 1.32;          // ~3 mph, an unhurried kid
const MAX_DRAW_EDGES = 22000;   // viewport cull budget for the heatmap
const RISK_ZOOM = 13;           // below this the heatmap is noise

/* Most streets in LA are ordinary, so colouring all of them paints a uniform
 * mesh and hides the blocks that actually matter. Draw only the top end, and
 * stretch the colour ramp across that band instead of across all of 0..1.
 *
 * The threshold rises as you zoom out: a citywide view showing every
 * above-average block is an unreadable smear, so a wide view shows only real
 * hotspots and detail fills in as you zoom toward a single walk. */
const RISK_FLOOR_BY_ZOOM = { 13: 0.60, 14: 0.50, 15: 0.42, 16: 0.36 };
const riskFloor = z => RISK_FLOOR_BY_ZOOM[Math.min(16, Math.max(13, z))];

const S = {
  meta: null, schools: null,
  nLat: null, nLon: null,                  // node coords
  eu: null, ev: null, ed: null, er: null,  // edge arrays
  gOff: null, gPts: null,                  // packed shape points
  head: null, to: null, eidx: null,        // CSR adjacency
  nNodes: 0, nEdges: 0,
  bucket: 0, lambda: 0.55,
  origin: null, school: null,
  showRisk: true, showSchools: false,
};

/* ------------------------------------------------------------------- map */
const map = L.map('map', { zoomControl: false, preferCanvas: true })
  .setView([34.035, -118.33], 13);
L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO · crime data: LAPD via data.lacity.org',
  maxZoom: 19, subdomains: 'abcd',
}).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
  maxZoom: 19, subdomains: 'abcd', pane: 'shadowPane', opacity: .85,
}).addTo(map);

const riskLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const pinLayer = L.layerGroup().addTo(map);
const schoolLayer = L.layerGroup();

/* ------------------------------------------------------------ utilities */
const $ = id => document.getElementById(id);
const fmtKm = m => m < 950 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
const fmtMin = m => `${Math.max(1, Math.round(m / WALK_MPS / 60))} min`;

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3400);
}

// Green -> yellow -> red ramp for the risk surface.
const RAMP = [[0, 31, 111, 74], [.35, 143, 191, 63], [.6, 255, 176, 32],
              [.8, 255, 107, 53], [1, 255, 45, 45]];
function riskColor(r) {
  for (let i = 1; i < RAMP.length; i++) {
    if (r <= RAMP[i][0]) {
      const a = RAMP[i - 1], b = RAMP[i];
      const t = (r - a[0]) / (b[0] - a[0] || 1);
      return `rgb(${Math.round(a[1] + t * (b[1] - a[1]))},`
           + `${Math.round(a[2] + t * (b[2] - a[2]))},`
           + `${Math.round(a[3] + t * (b[3] - a[3]))})`;
    }
  }
  return 'rgb(255,45,45)';
}

const risk = (ei, b) => S.er[ei * 3 + b] / 255;

/* --------------------------------------------------------- binary heap */
class Heap {
  constructor(cap) {
    this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0;
  }
  get size() { return this.n; }
  push(key, val) {
    if (this.n === this.k.length) this._grow();
    let i = this.n++;
    this.k[i] = key; this.v[i] = val;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      this._swap(i, p); i = p;
    }
  }
  pop() {
    const top = this.v[0];
    const n = --this.n;
    this.k[0] = this.k[n]; this.v[0] = this.v[n];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < n && this.k[l] < this.k[m]) m = l;
      if (r < n && this.k[r] < this.k[m]) m = r;
      if (m === i) break;
      this._swap(i, m); i = m;
    }
    return top;
  }
  _swap(a, b) {
    const tk = this.k[a]; this.k[a] = this.k[b]; this.k[b] = tk;
    const tv = this.v[a]; this.v[a] = this.v[b]; this.v[b] = tv;
  }
  _grow() {
    const k = new Float64Array(this.k.length * 2);
    const v = new Int32Array(this.v.length * 2);
    k.set(this.k); v.set(this.v);
    this.k = k; this.v = v;
  }
}

/* ------------------------------------------------------- binary decode */
/* Section order mirrors the writer: header, nodes(i32), eu(i32), ev(i32),
 * geomOff(u32), geomPts(i32), d(u16), r(u8). Ordering by descending
 * alignment means every view lands on a natural boundary with no padding. */
function decode(buf) {
  const h = new Uint32Array(buf, 0, 5);
  if (h[0] !== 0x53525453) throw new Error('bad graph file (magic mismatch)');
  if (h[1] !== 1) throw new Error(`unsupported graph version ${h[1]}`);
  const nN = h[2], nE = h[3], nG = h[4];
  let o = 20;

  const nll = new Int32Array(buf, o, nN * 2); o += nN * 8;
  S.eu = new Int32Array(buf, o, nE); o += nE * 4;
  S.ev = new Int32Array(buf, o, nE); o += nE * 4;
  S.gOff = new Uint32Array(buf, o, nE + 1); o += (nE + 1) * 4;
  S.gPts = new Int32Array(buf, o, nG * 2); o += nG * 8;
  S.ed = new Uint16Array(buf, o, nE); o += nE * 2;
  S.er = new Uint8Array(buf, o, nE * 3);

  // Float coords once, up front: A* touches these millions of times.
  S.nLat = new Float64Array(nN);
  S.nLon = new Float64Array(nN);
  for (let i = 0; i < nN; i++) {
    S.nLat[i] = nll[i * 2] / 1e6;
    S.nLon[i] = nll[i * 2 + 1] / 1e6;
  }
  S.nNodes = nN; S.nEdges = nE;
}

function buildAdjacency() {
  const nN = S.nNodes, nE = S.nEdges;
  const head = new Int32Array(nN + 1);
  for (let i = 0; i < nE; i++) { head[S.eu[i] + 1]++; head[S.ev[i] + 1]++; }
  for (let i = 0; i < nN; i++) head[i + 1] += head[i];
  const cur = head.slice(0, nN);
  const to = new Int32Array(nE * 2);
  const eidx = new Int32Array(nE * 2);
  for (let i = 0; i < nE; i++) {
    const u = S.eu[i], v = S.ev[i];
    to[cur[u]] = v; eidx[cur[u]++] = i;
    to[cur[v]] = u; eidx[cur[v]++] = i;
  }
  S.head = head; S.to = to; S.eidx = eidx;
}

// Coarse spatial hash so snapping a click to the nearest node is instant.
function buildIndex() {
  const CELL = 0.004;   // ~440 m
  const idx = new Map();
  for (let i = 0; i < S.nNodes; i++) {
    const k = ((Math.floor(S.nLat[i] / CELL) & 0xffff) << 16)
            | (Math.floor(S.nLon[i] / CELL) & 0xffff);
    let a = idx.get(k); if (!a) idx.set(k, a = []);
    a.push(i);
  }
  S.cellIdx = idx; S.CELL = CELL;
}

function nearestNode(lat, lon) {
  const ci = Math.floor(lat / S.CELL), cj = Math.floor(lon / S.CELL);
  let best = -1, bd = Infinity, foundAt = -1;
  for (let ring = 0; ring <= 8; ring++) {
    // Once something is found, scan one extra ring before committing: the
    // true nearest node can sit just across a cell boundary.
    if (foundAt >= 0 && ring > foundAt + 1) break;
    for (let di = -ring; di <= ring; di++) {
      for (let dj = -ring; dj <= ring; dj++) {
        if (ring > 0 && Math.abs(di) !== ring && Math.abs(dj) !== ring) continue;
        const a = S.cellIdx.get((((ci + di) & 0xffff) << 16) | ((cj + dj) & 0xffff));
        if (!a) continue;
        for (const n of a) {
          const dy = (S.nLat[n] - lat) * 111320;
          const dx = (S.nLon[n] - lon) * 92500;
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = n; }
        }
      }
    }
    if (best >= 0 && foundAt < 0) foundAt = ring;
  }
  return best;
}

const metres = (aLat, aLon, bLat, bLon) =>
  Math.hypot((aLon - bLon) * 92500, (aLat - bLat) * 111320);

/* ------------------------------------------------------------------- A* */
/* cost(edge) = length * (1 + lambda * risk^1.5)
 * The heuristic is straight-line distance, which never exceeds the true
 * remaining cost because every edge multiplier is >= 1 — so A* stays
 * admissible and the route it returns is genuinely optimal, not approximate. */
function route(src, dst, lambda, bucket) {
  const n = S.nNodes;
  const g = new Float64Array(n).fill(Infinity);
  const prevN = new Int32Array(n).fill(-1);
  const prevE = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const dLat = S.nLat[dst], dLon = S.nLon[dst];
  const er = S.er, ed = S.ed;

  const h = new Heap(1 << 16);
  g[src] = 0;
  h.push(metres(S.nLat[src], S.nLon[src], dLat, dLon), src);

  while (h.size) {
    const u = h.pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === dst) break;
    const gu = g[u];
    for (let p = S.head[u]; p < S.head[u + 1]; p++) {
      const v = S.to[p];
      if (done[v]) continue;
      const ei = S.eidx[p];
      const r = er[ei * 3 + bucket] / 255;
      const ng = gu + ed[ei] * (1 + lambda * r * Math.sqrt(r));
      if (ng < g[v]) {
        g[v] = ng; prevN[v] = u; prevE[v] = ei;
        h.push(ng + metres(S.nLat[v], S.nLon[v], dLat, dLon), v);
      }
    }
  }
  if (!isFinite(g[dst])) return null;

  const nodes = [], edges = [];
  for (let v = dst; v !== -1; v = prevN[v]) {
    nodes.push(v);
    if (prevE[v] >= 0) edges.push(prevE[v]);
    if (v === src) break;
  }
  nodes.reverse(); edges.reverse();

  let dist = 0, exposure = 0, worst = -1, worstR = -1;
  for (const ei of edges) {
    const r = risk(ei, bucket);
    dist += ed[ei];
    exposure += ed[ei] * r;
    if (r > worstR) { worstR = r; worst = ei; }
  }
  return { nodes, edges, dist, exposure, worstR };
}

/* Shape points for edge `ei`, oriented so it starts at node `from`. */
function edgeShape(ei, from) {
  const a = S.gOff[ei], b = S.gOff[ei + 1];
  const out = [];
  for (let k = a; k < b; k++) out.push([S.gPts[k * 2] / 1e6, S.gPts[k * 2 + 1] / 1e6]);
  return (S.eu[ei] === from) ? out : out.reverse();
}

function routeLatLngs(r) {
  const pts = [];
  for (let i = 0; i < r.edges.length; i++) {
    const a = r.nodes[i];
    pts.push([S.nLat[a], S.nLon[a]]);
    for (const p of edgeShape(r.edges[i], a)) pts.push(p);
  }
  const last = r.nodes[r.nodes.length - 1];
  pts.push([S.nLat[last], S.nLon[last]]);
  return pts;
}

/* ------------------------------------------------------- risk heatmap */
let drawPending = null;
function drawRisk() {
  clearTimeout(drawPending);
  if (!S.showRisk || !S.nNodes) { riskLayer.clearLayers(); return; }
  const zoomedOut = map.getZoom() < RISK_ZOOM;
  $('zoomhint').classList.toggle('show', zoomedOut && S.showRisk);
  if (zoomedOut) { riskLayer.clearLayers(); return; }

  drawPending = setTimeout(() => {
    riskLayer.clearLayers();
    const b = map.getBounds().pad(0.1);
    const s = b.getSouth(), n = b.getNorth(), w = b.getWest(), e = b.getEast();
    const picked = [];
    for (let i = 0; i < S.nEdges; i++) {
      const u = S.eu[i], v = S.ev[i];
      const la = S.nLat[u], lb = S.nLat[v];
      if (la < s && lb < s) continue;
      if (la > n && lb > n) continue;
      const lo = S.nLon[u], lob = S.nLon[v];
      if (lo < w && lob < w) continue;
      if (lo > e && lob > e) continue;
      picked.push(i);
    }
    // When the viewport holds more than we can draw, show the worst blocks —
    // those are the ones a routing decision actually turns on.
    let list = picked;
    if (picked.length > MAX_DRAW_EDGES) {
      const bk = S.bucket;
      picked.sort((x, y) => S.er[y * 3 + bk] - S.er[x * 3 + bk]);
      list = picked.slice(0, MAX_DRAW_EDGES);
    }
    const z = map.getZoom();
    const weight = z >= 16 ? 3.6 : z >= 15 ? 2.8 : z >= 14 ? 2.0 : 1.4;
    const floor = riskFloor(z);
    const span = Math.max(0.05, 1 - floor);
    let drawn = 0;
    for (const i of list) {
      const r = risk(i, S.bucket);
      if (r < floor) continue;                     // keep ordinary streets quiet
      const t = (r - floor) / span;                // 0..1 across the drawn band
      const u = S.eu[i];
      const line = [[S.nLat[u], S.nLon[u]]];
      for (const p of edgeShape(i, u)) line.push(p);
      line.push([S.nLat[S.ev[i]], S.nLon[S.ev[i]]]);
      L.polyline(line, {
        color: riskColor(t), weight: weight * (0.75 + 0.55 * t),
        opacity: 0.3 + 0.62 * t,
        interactive: false, lineCap: 'round',
      }).addTo(riskLayer);
      drawn++;
    }
    $('lg-count').textContent = drawn.toLocaleString();
  }, 90);
}
map.on('moveend zoomend', drawRisk);

/* ------------------------------------------------------------- markers */
function pin(latlng, color, label) {
  return L.marker(latlng, {
    icon: L.divIcon({
      className: '', iconSize: [15, 15], iconAnchor: [7, 7],
      html: `<div class="marker-pin" style="background:${color}"></div>`,
    }),
    title: label,
  });
}

function redrawPins() {
  pinLayer.clearLayers();
  if (S.origin) {
    pin([S.origin.lat, S.origin.lon], '#5aa9ff', 'Start')
      .bindTooltip('Start', { direction: 'top', offset: [0, -9] }).addTo(pinLayer);
  }
  if (S.school) {
    pin([S.school.lat, S.school.lon], '#35d98a', S.school.name)
      .bindTooltip(S.school.name, { direction: 'top', offset: [0, -9] })
      .addTo(pinLayer);
  }
}

/* ------------------------------------------------------------ compute */
function compute() {
  if (!S.origin || !S.school) return;
  const src = nearestNode(S.origin.lat, S.origin.lon);
  const dst = nearestNode(S.school.lat, S.school.lon);
  if (src < 0 || dst < 0) { toast('No walkable street found nearby.'); return; }
  if (src === dst) { toast('Start and school are on the same block.'); return; }

  const t0 = performance.now();
  const lam = S.lambda * 7;               // slider 0..1 -> detour tolerance
  const safe = route(src, dst, lam, S.bucket);
  const fast = route(src, dst, 0, S.bucket);
  const ms = performance.now() - t0;
  if (!safe || !fast) { toast('No walking route found between those points.'); return; }

  routeLayer.clearLayers();
  L.polyline(routeLatLngs(fast), {
    color: '#ffb020', weight: 5, opacity: .9, dashArray: '2,8',
    lineCap: 'round', interactive: false,
  }).addTo(routeLayer);
  L.polyline(routeLatLngs(safe), {
    color: '#000', weight: 9, opacity: .45, interactive: false,
  }).addTo(routeLayer);
  L.polyline(routeLatLngs(safe), {
    color: '#35d98a', weight: 5, opacity: .97,
    lineCap: 'round', interactive: false,
  }).addTo(routeLayer);

  $('safe-dist').textContent = fmtKm(safe.dist);
  $('safe-time').textContent = fmtMin(safe.dist);
  $('fast-dist').textContent = fmtKm(fast.dist);
  $('fast-time').textContent = fmtMin(fast.dist);

  // Intensity, not a raw total: the safer route is longer, so comparing sums
  // would flatter it unfairly. Per-100 m is the honest comparison.
  $('safe-risk').textContent = (safe.exposure / safe.dist * 100).toFixed(1);
  $('fast-risk').textContent = (fast.exposure / fast.dist * 100).toFixed(1);

  const cut = fast.exposure > 0
    ? Math.round((1 - safe.exposure / fast.exposure) * 100) : 0;
  const extraM = safe.dist - fast.dist;
  const extraMin = Math.round(extraM / WALK_MPS / 60);
  $('r-safe-note').textContent = extraM < 15 ? 'same route' : `+${fmtKm(extraM)}`;

  const vd = $('verdict');
  vd.classList.remove('flat');
  if (extraM < 15) {
    vd.innerHTML = 'The shortest route here is already the safest one — '
                 + 'no detour needed.';
  } else if (cut <= 2) {
    vd.classList.add('flat');
    vd.innerHTML = 'Every path between these points carries similar risk. '
                 + 'The detour buys little — a different meeting point would '
                 + 'help more than a different route.';
  } else {
    vd.innerHTML = `Walking <b>${extraMin} minute${extraMin === 1 ? '' : 's'}</b> `
                 + `longer cuts exposure to violent street crime by <b>${cut}%</b>.`;
  }

  $('worst').innerHTML =
    `Worst block on the shortest route scores <b>${fast.worstR.toFixed(2)}</b>; `
    + `on the safest route, <b>${safe.worstR.toFixed(2)}</b>. `
    + `<span style="color:var(--ink-faint)">Solved ${S.nNodes.toLocaleString()} `
    + `intersections in ${ms.toFixed(0)} ms.</span>`;

  $('results').classList.add('show');
  // Snap rather than glide: a routing result should be on screen immediately,
  // and the pan animation only delays the heatmap redraw behind it.
  map.fitBounds(L.featureGroup(routeLayer.getLayers()).getBounds().pad(0.16),
                { animate: false });
}

/* ---------------------------------------------------------------- UI */
document.querySelector('.tabs').addEventListener('click', e => {
  const t = e.target.closest('.tab'); if (!t) return;
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.pane').forEach(x => x.classList.remove('on'));
  t.classList.add('on');
  $('p-' + t.dataset.p).classList.add('on');
});

map.on('click', ev => {
  const p = { lat: ev.latlng.lat, lon: ev.latlng.lng };
  if (ev.originalEvent.shiftKey) {
    S.school = { name: 'Custom destination', ...p };
    $('school').value = 'Custom destination';
  } else {
    S.origin = p;
    $('origin').value = `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
  }
  redrawPins();
  $('go').disabled = !(S.origin && S.school);
  if (S.origin && S.school) compute();
});

$('school').addEventListener('change', e => {
  const s = S.schools.find(x => x.name === e.target.value);
  if (!s) return;
  S.school = s;
  redrawPins();
  $('go').disabled = !S.origin;
  if (S.origin) compute(); else map.setView([s.lat, s.lon], 15);
});

$('timepills').addEventListener('click', e => {
  const p = e.target.closest('.pill'); if (!p) return;
  [...$('timepills').children].forEach(c => c.classList.remove('on'));
  p.classList.add('on');
  S.bucket = +p.dataset.b;
  $('lg-time').textContent = ['morning', 'afternoon', 'after dark'][S.bucket];
  drawRisk();
  if (S.origin && S.school) compute();
});

$('lam').addEventListener('input', e => { S.lambda = e.target.value / 100; });
$('lam').addEventListener('change', () => { if (S.origin && S.school) compute(); });
$('go').addEventListener('click', compute);

$('t-risk').addEventListener('click', e => {
  S.showRisk = !S.showRisk;
  e.target.classList.toggle('on', S.showRisk);
  drawRisk();
});
$('t-schools').addEventListener('click', e => {
  S.showSchools = !S.showSchools;
  e.target.classList.toggle('on', S.showSchools);
  if (S.showSchools) {
    if (!schoolLayer.getLayers().length) {
      for (const s of S.schools) {
        L.circleMarker([s.lat, s.lon], {
          radius: 3, color: '#35d98a', weight: 1, fillOpacity: .5,
        }).bindTooltip(s.name, { direction: 'top' }).addTo(schoolLayer);
      }
    }
    schoolLayer.addTo(map);
  } else map.removeLayer(schoolLayer);
});

/* -------------------------------------------------------------- boot */
/* The graph ships pre-gzipped (9.9 MB -> 5.0 MB) and is inflated here, so the
 * transfer size is the same whether or not the host compresses .bin itself.
 * Progress is reported against the compressed bytes, which is what the user is
 * actually waiting on. Falls back to the raw file on older browsers. */
async function fetchGraph(onPct) {
  if (typeof DecompressionStream === 'function') {
    const res = await fetch('data/graph.bin.gz');
    if (res.ok && res.body) {
      const total = +(res.headers.get('content-length') || 0);
      let got = 0;
      const counter = new TransformStream({
        transform(chunk, ctrl) {
          got += chunk.length;
          if (total) onPct(got / total, got, total);
          ctrl.enqueue(chunk);
        },
      });
      return new Response(
        res.body.pipeThrough(counter).pipeThrough(new DecompressionStream('gzip'))
      ).arrayBuffer();
    }
  }
  const res = await fetch('data/graph.bin');
  if (!res.ok) throw new Error(`graph.bin: HTTP ${res.status}`);
  const total = +(res.headers.get('content-length') || 0);
  if (!total || !res.body) return res.arrayBuffer();
  const chunks = [];
  let got = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onPct(got / total, got, total);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out.buffer;
}

async function boot() {
  const [meta, schools] = await Promise.all([
    fetch('data/graph_meta.json').then(r => r.json()),
    fetch('data/schools.json').then(r => r.json()),
  ]);
  S.meta = meta; S.schools = schools;

  $('s-schools').textContent = schools.length;
  $('s-blocks').textContent = Math.round(meta.edges / 1000) + 'k';
  $('s-crimes').textContent = Math.round(meta.crimes / 1000) + 'k';
  $('load-sub').textContent =
    `${meta.crimes.toLocaleString()} incidents · ${meta.km.toLocaleString()} km of street`;

  $('schoollist').innerHTML =
    schools.map(s => `<option value="${s.name.replace(/"/g, '&quot;')}">`).join('');

  const buf = await fetchGraph((pct, got, total) => {
    $('load-msg').textContent =
      `Loading the street network… ${Math.round(pct * 100)}%`;
    $('load-sub').textContent =
      `${(got / 1e6).toFixed(1)} of ${(total / 1e6).toFixed(1)} MB`;
  });

  $('load-msg').textContent = 'Building the routing graph…';
  $('load-sub').textContent = `${meta.edges.toLocaleString()} blocks`;
  decode(buf);
  buildAdjacency();
  buildIndex();

  $('loading').classList.add('done');
  drawRisk();
}

boot().catch(err => {
  $('loading').classList.remove('done');
  document.querySelector('.spin').style.display = 'none';
  $('load-msg').textContent = 'Could not load the data files.';
  $('load-sub').textContent = err.message;
  console.error(err);
});
