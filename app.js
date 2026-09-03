/* Safe Routes to School / Los Angeles
 *
 * Everything runs in the browser. The pipeline ships a packed binary graph
 * where each block already carries a risk score per time-of-day window, and
 * A* here minimises  length * (1 + lambda * risk^1.5)  instead of length.
 */
'use strict';

const MAGIC = 0x53525453;        // "SRTS"
const NO_NAME = 0xFFFF;
const WALK_MPS = 1.32;           // about 3 mph, an unhurried kid
const MAX_DRAW = 22000;          // viewport budget for the risk layer
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/* Named options rather than a slider. A slider invites fiddling and never says
 * what its ends mean, while a route you can point at is a choice you can make.
 *
 * A fixed pair of lambdas often returns the same path twice, because past some
 * threshold the search has already routed around everything it can. So walk a
 * ladder, throw away duplicates, and offer only the options that differ. */
const LADDER = [0, 0.5, 1, 1.75, 2.75, 4.25, 7];

const WINDOWS = ['morning', 'afternoon', 'evening'];
const WINDOW_CLOCK = ['5am to 10am', '10am to 5pm', '5pm to 5am'];
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/* Zoomed out, drawing every above-average block is an unreadable smear, so the
 * threshold rises with distance and detail fills in as you approach one walk. */
const FLOOR_BY_ZOOM = { 13: 0.60, 14: 0.50, 15: 0.42, 16: 0.36 };
const floorFor = z => FLOOR_BY_ZOOM[Math.min(16, Math.max(13, z))];

const S = {
  meta: null, schools: null, names: null,
  nLat: null, nLon: null,
  eu: null, ev: null, ed: null, er: null, ename: null,
  gOff: null, gPts: null,
  head: null, to: null, eidx: null,
  nNodes: 0, nEdges: 0,
  bucket: 1, pick: 2, mode: 'foot',
  origin: null, school: null,
  routes: null,
  showRisk: true, showSchools: false,
};

/* ------------------------------------------------------------------- map */
const map = L.map('map', { zoomControl: false, preferCanvas: true })
  .setView([34.035, -118.33], 13);
L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO / crime records: LAPD via data.lacity.org',
  maxZoom: 19, subdomains: 'abcd',
}).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
  maxZoom: 19, subdomains: 'abcd', pane: 'shadowPane',
}).addTo(map);

const riskLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const spokeLayer = L.layerGroup().addTo(map);
const pinLayer = L.layerGroup().addTo(map);
const schoolLayer = L.layerGroup();

/* ------------------------------------------------------------ utilities */
const $ = id => document.getElementById(id);
const fmtM = m => m < 950 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
const fmtMin = m => `${Math.max(1, Math.round(m / WALK_MPS / 60))} min`;
const risk = (ei, b) => S.er[ei * 3 + b] / 255;
const streetName = ei => (S.ename[ei] === NO_NAME ? null : S.names[S.ename[ei]]);

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3600);
}

/* Five flat steps rather than a smooth ramp, so the legend and the map agree
 * and a colour always maps back to a readable band. */
const BANDS = [
  { upto: 0.20, hex: '#3c7a4e' },
  { upto: 0.40, hex: '#7d9b3f' },
  { upto: 0.60, hex: '#c8912b' },
  { upto: 0.80, hex: '#c8622b' },
  { upto: 1.01, hex: '#a52714' },
];
const bandColor = v => (BANDS.find(b => v <= b.upto) || BANDS[4]).hex;

const metres = (aLat, aLon, bLat, bLon) =>
  Math.hypot((aLon - bLon) * 92500, (aLat - bLat) * 111320);

/* --------------------------------------------------------- binary heap */
class Heap {
  constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
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
    const k = new Float64Array(this.k.length * 2), v = new Int32Array(this.v.length * 2);
    k.set(this.k); v.set(this.v); this.k = k; this.v = v;
  }
}

/* ------------------------------------------------------- binary decode */
/* Section order mirrors the writer: header, nodes(i32), eu(i32), ev(i32),
 * geomOff(u32), geomPts(i32), d(u16), name(u16), risk(u8). Ordering by
 * descending alignment means each view lands on a natural boundary. */
function decode(buf) {
  const h = new Uint32Array(buf, 0, 6);
  if (h[0] !== MAGIC) throw new Error('not a graph file');
  if (h[1] !== 2) throw new Error(`graph format v${h[1]} is not supported`);
  const nN = h[2], nE = h[3], nG = h[4];
  let o = 24;

  const nll = new Int32Array(buf, o, nN * 2); o += nN * 8;
  S.eu = new Int32Array(buf, o, nE); o += nE * 4;
  S.ev = new Int32Array(buf, o, nE); o += nE * 4;
  S.gOff = new Uint32Array(buf, o, nE + 1); o += (nE + 1) * 4;
  S.gPts = new Int32Array(buf, o, nG * 2); o += nG * 8;
  S.ed = new Uint16Array(buf, o, nE); o += nE * 2;
  S.ename = new Uint16Array(buf, o, nE); o += nE * 2;
  S.er = new Uint8Array(buf, o, nE * 3);

  // Floats once, up front: A* touches these millions of times.
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
  const to = new Int32Array(nE * 2), eidx = new Int32Array(nE * 2);
  for (let i = 0; i < nE; i++) {
    const u = S.eu[i], v = S.ev[i];
    to[cur[u]] = v; eidx[cur[u]++] = i;
    to[cur[v]] = u; eidx[cur[v]++] = i;
  }
  S.head = head; S.to = to; S.eidx = eidx;
}

function buildIndex() {
  const CELL = 0.004;   // about 440 m
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
    if (foundAt >= 0 && ring > foundAt + 1) break;
    for (let di = -ring; di <= ring; di++) {
      for (let dj = -ring; dj <= ring; dj++) {
        if (ring > 0 && Math.abs(di) !== ring && Math.abs(dj) !== ring) continue;
        const a = S.cellIdx.get((((ci + di) & 0xffff) << 16) | ((cj + dj) & 0xffff));
        if (!a) continue;
        for (const n of a) {
          const dy = (S.nLat[n] - lat) * 111320, dx = (S.nLon[n] - lon) * 92500;
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = n; }
        }
      }
    }
    if (best >= 0 && foundAt < 0) foundAt = ring;
  }
  return best;
}

/* ------------------------------------------------------------------- A* */
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

  let dist = 0, exposure = 0;
  for (const ei of edges) { dist += ed[ei]; exposure += ed[ei] * risk(ei, bucket); }
  return { nodes, edges, dist, exposure, score: dist ? exposure / dist * 100 : 0 };
}

/* Mean risk of an existing path measured in a different window, for the
 * "same route, different hour" comparison. */
function scoreAt(r, bucket) {
  let e = 0, d = 0;
  for (const ei of r.edges) { d += S.ed[ei]; e += S.ed[ei] * risk(ei, bucket); }
  return d ? e / d * 100 : 0;
}

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

/* ----------------------------------------------------------- narrative */
/* Group a set of edges by street name and total how much walking and how much
 * exposure each street contributes, so the app can name what it avoided. */
function byStreet(edgeIds, bucket) {
  const acc = new Map();
  for (const ei of edgeIds) {
    const nm = streetName(ei) || ' unnamed';
    let a = acc.get(nm);
    if (!a) acc.set(nm, a = { name: nm, len: 0, worst: 0, weighted: 0 });
    const r = risk(ei, bucket);
    a.len += S.ed[ei];
    a.worst = Math.max(a.worst, r);
    a.weighted += S.ed[ei] * r;
  }
  return [...acc.values()].sort((x, y) => y.weighted - x.weighted);
}

const streetLabel = s =>
  s.name === ' unnamed' ? 'an unnamed path' : s.name;

function explain(sel, base, bucket) {
  if (sel.edges.length === base.edges.length
      && sel.edges.every((e, i) => e === base.edges[i])) {
    return { same: true, html:
      'The shortest way here is also the calmest one the model can find, so '
      + 'there is nothing to trade off.' };
  }
  const selSet = new Set(sel.edges), baseSet = new Set(base.edges);
  const avoided = byStreet(base.edges.filter(e => !selSet.has(e)), bucket);
  const taken = byStreet(sel.edges.filter(e => !baseSet.has(e)), bucket);

  const cut = base.exposure > 0
    ? Math.round((1 - sel.exposure / base.exposure) * 100) : 0;
  const extra = sel.dist - base.dist;
  const mins = Math.round(extra / WALK_MPS / 60);

  const parts = [];
  if (avoided.length) {
    const a = avoided[0];
    parts.push(`Skips <b>${fmtM(a.len)}</b> of `
      + `<span class="st">${streetLabel(a)}</span>, which scores `
      + `<b>${Math.round(a.worst * 100)}</b> at this hour.`);
  }
  if (taken.length) {
    const t = taken.find(x => x.name !== ' unnamed') || taken[0];
    parts.push(`Goes along <span class="st">${streetLabel(t)}</span> instead, `
      + `at <b>${Math.round(t.worst * 100)}</b>.`);
  }
  const cost = extra < 15
    ? 'It comes out the same length.'
    : (mins < 1
        ? `Costs you <b>${Math.round(extra)} m</b>, under a minute of walking.`
        : `Costs you <b>${mins} minute${mins === 1 ? '' : 's'}</b>.`);
  parts.push(`${cost} Total exposure drops <b>${cut}%</b>.`);

  return { same: false, flat: cut <= 2, html: parts.join(' ') };
}

/* Directions, as a person would give them.
 *
 * Walking on separately-mapped sidewalks means the raw path zigzags across
 * junctions, producing runs of two-metre hops that are crossings rather than
 * turns. Merge same-name neighbours, then repeatedly fold anything shorter
 * than a block into whichever neighbour is longer, until the list stops
 * changing. Nothing is thrown away, so the distances still sum to the route. */
const MIN_LEG_M = 35;

function mergeSameName(segs) {
  const out = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.label === s.label) {
      last.len += s.len;
      last.worst = Math.max(last.worst, s.worst);
    } else out.push({ ...s });
  }
  return out;
}

function turnList(r, bucket) {
  let segs = mergeSameName(r.edges.map(ei => ({
    label: streetName(ei) || 'unnamed path',
    len: S.ed[ei],
    worst: risk(ei, bucket),
  })));

  for (let pass = 0; pass < 12; pass++) {
    if (segs.length < 2) break;
    let k = -1;
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].len < MIN_LEG_M && (k < 0 || segs[i].len < segs[k].len)) k = i;
    }
    if (k < 0) break;
    const prev = segs[k - 1], next = segs[k + 1];
    const host = !prev ? next : !next ? prev : (prev.len >= next.len ? prev : next);
    host.len += segs[k].len;
    host.worst = Math.max(host.worst, segs[k].worst);
    segs.splice(k, 1);
    segs = mergeSameName(segs);
  }
  return segs;
}

/* ------------------------------------------------------- risk heatmap */
let drawPending = null;
function drawRisk() {
  clearTimeout(drawPending);
  if (!S.showRisk || !S.nNodes) { riskLayer.clearLayers(); $('hint').classList.remove('show'); return; }
  const out = map.getZoom() < 13;
  $('hint').classList.toggle('show', out);
  if (out) { riskLayer.clearLayers(); $('lg-count').textContent = '0'; return; }

  drawPending = setTimeout(() => {
    riskLayer.clearLayers();
    const b = map.getBounds().pad(0.1);
    const s = b.getSouth(), n = b.getNorth(), w = b.getWest(), e = b.getEast();
    const picked = [];
    for (let i = 0; i < S.nEdges; i++) {
      const u = S.eu[i], v = S.ev[i];
      const la = S.nLat[u], lb = S.nLat[v];
      if ((la < s && lb < s) || (la > n && lb > n)) continue;
      const lo = S.nLon[u], lob = S.nLon[v];
      if ((lo < w && lob < w) || (lo > e && lob > e)) continue;
      picked.push(i);
    }
    let list = picked;
    if (picked.length > MAX_DRAW) {
      const bk = S.bucket;
      picked.sort((x, y) => S.er[y * 3 + bk] - S.er[x * 3 + bk]);
      list = picked.slice(0, MAX_DRAW);
    }
    const z = map.getZoom();
    const base = z >= 16 ? 3.4 : z >= 15 ? 2.6 : z >= 14 ? 1.9 : 1.3;
    const floor = floorFor(z);
    let drawn = 0;
    for (const i of list) {
      const r = risk(i, S.bucket);
      if (r < floor) continue;
      const t = (r - floor) / Math.max(0.05, 1 - floor);
      const u = S.eu[i];
      const line = [[S.nLat[u], S.nLon[u]]];
      for (const p of edgeShape(i, u)) line.push(p);
      line.push([S.nLat[S.ev[i]], S.nLon[S.ev[i]]]);
      L.polyline(line, {
        color: bandColor(r), weight: base * (0.8 + 0.6 * t),
        opacity: 0.4 + 0.5 * t, interactive: false, lineCap: 'butt',
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
      className: '', iconSize: [13, 13], iconAnchor: [6, 6],
      html: `<div class="pin" style="background:${color}"></div>`,
    }),
    title: label,
  });
}

function redrawPins() {
  pinLayer.clearLayers();
  if (S.origin) {
    pin([S.origin.lat, S.origin.lon], '#211f18', 'Start')
      .bindTooltip('Start', { direction: 'top', offset: [0, -8] }).addTo(pinLayer);
  }
  if (S.school) {
    pin([S.school.lat, S.school.lon], '#3c7a4e', S.school.name)
      .bindTooltip(S.school.name, { direction: 'top', offset: [0, -8] }).addTo(pinLayer);
  }
}

/* ------------------------------------------------------------ compute */
/* ---------------------------------------------------------------- transit */
/* Standing at a stop is exposure without progress, so a minute of waiting is
 * charged like this many metres of walking on the same block. Waiting is if
 * anything worse per minute than moving, since you are stationary and
 * predictable, so the rate is set above walking pace on purpose. */
const WAIT_M_PER_MIN = 80;
const MAX_STOP_WALK_M = 900;     // how far a student will walk to a stop
const RIDE_CANDIDATES = 14;      // itineraries worth spending an A* run on

const T = { stops: null, patterns: null, names: null, stopPat: null,
            node: null, grid: null, CELL: 0.006 };

function initTransit(data) {
  T.stops = data.stops; T.patterns = data.patterns; T.names = data.names;
  T.stopPat = new Map();
  data.patterns.forEach((p, pi) => {
    p.s.forEach((sIdx, pos) => {
      let a = T.stopPat.get(sIdx);
      if (!a) T.stopPat.set(sIdx, a = []);
      a.push([pi, pos]);
    });
  });
  T.node = new Int32Array(data.stops.length).fill(-2);   // -2 = not resolved
  T.grid = new Map();
  data.stops.forEach((s, i) => {
    const k = ((Math.floor(s[0] / T.CELL) & 0xffff) << 16)
            | (Math.floor(s[1] / T.CELL) & 0xffff);
    let a = T.grid.get(k);
    if (!a) T.grid.set(k, a = []);
    a.push(i);
  });
}

function stopNode(i) {
  if (T.node[i] === -2) T.node[i] = nearestNode(T.stops[i][0], T.stops[i][1]);
  return T.node[i];
}

function stopsNear(lat, lon, maxM) {
  const out = [];
  const span = Math.ceil(maxM / (T.CELL * 92500)) + 1;
  const ci = Math.floor(lat / T.CELL), cj = Math.floor(lon / T.CELL);
  for (let di = -span; di <= span; di++) {
    for (let dj = -span; dj <= span; dj++) {
      const a = T.grid.get((((ci + di) & 0xffff) << 16) | ((cj + dj) & 0xffff));
      if (!a) continue;
      for (const i of a) {
        const d = metres(lat, lon, T.stops[i][0], T.stops[i][1]);
        if (d <= maxM) out.push({ i, d });
      }
    }
  }
  return out.sort((x, y) => x.d - y.d).slice(0, 40);
}

/* Up to one transfer. Direct rides only covered a minority of real trips: a
 * student in Koreatown heading to a school off Fairfax has no single route, and
 * telling them "walk 8 km instead" is not an answer. Two rides is where most
 * of Los Angeles becomes reachable. We stop there, because a second transfer
 * adds another wait to stand through and is advice nobody follows.
 *
 * Forward pass: everywhere you can get to on one ride from a stop near home.
 * Backward pass: everywhere you can ride to the school from. Any stop in both,
 * or a short walk apart, is a usable transfer. */
const XFER_WALK_M = 260;

function forwardReach(seeds) {
  const best = new Map();
  for (const s of seeds) {
    for (const [pi, posA] of (T.stopPat.get(s.i) || [])) {
      const pat = T.patterns[pi];
      for (let j = posA + 1; j < pat.s.length; j++) {
        const ride = Math.max(0, pat.t[j] - pat.t[posA]) / 60;
        const est = s.d / WALK_MPS / 60 + pat.w + ride;
        const at = pat.s[j];
        const cur = best.get(at);
        if (!cur || est < cur.est) {
          best.set(at, { est, pi, posA, posB: j, seed: s, ride, wait: pat.w });
        }
      }
    }
  }
  return best;
}

function backwardReach(targets) {
  const best = new Map();
  for (const s of targets) {
    for (const [pi, posB] of (T.stopPat.get(s.i) || [])) {
      const pat = T.patterns[pi];
      for (let i = 0; i < posB; i++) {
        const ride = Math.max(0, pat.t[posB] - pat.t[i]) / 60;
        const est = pat.w + ride + s.d / WALK_MPS / 60;
        const from = pat.s[i];
        const cur = best.get(from);
        if (!cur || est < cur.est) {
          best.set(from, { est, pi, posA: i, posB, target: s, ride, wait: pat.w });
        }
      }
    }
  }
  return best;
}

function transitOptions(origin, school, bucket, lambda) {
  if (!T.stops) return [];
  const from = stopsNear(origin.lat, origin.lon, MAX_STOP_WALK_M);
  const to = stopsNear(school.lat, school.lon, MAX_STOP_WALK_M);
  if (!from.length || !to.length) return [];
  const toNear = new Map(to.map(s => [s.i, s.d]));

  const raw = [];

  // ---- direct rides
  for (const fs of from) {
    for (const [pi, posA] of (T.stopPat.get(fs.i) || [])) {
      const pat = T.patterns[pi];
      for (let j = posA + 1; j < pat.s.length; j++) {
        const dOff = toNear.get(pat.s[j]);
        if (dOff === undefined) continue;
        const ride = Math.max(0, pat.t[j] - pat.t[posA]) / 60;
        raw.push({
          legs: [{ pi, posA, posB: j }], xfer: null,
          rideMin: ride, waitMin: pat.w,
          est: fs.d / WALK_MPS / 60 + pat.w + ride + dOff / WALK_MPS / 60,
        });
      }
    }
  }

  // ---- one transfer
  const fwd = forwardReach(from);
  const bwd = backwardReach(to);
  for (const [stopX, f] of fwd) {
    const [lat, lon] = T.stops[stopX];
    const span = Math.ceil(XFER_WALK_M / (T.CELL * 92500)) + 1;
    const ci = Math.floor(lat / T.CELL), cj = Math.floor(lon / T.CELL);
    for (let di = -span; di <= span; di++) {
      for (let dj = -span; dj <= span; dj++) {
        const cell = T.grid.get((((ci + di) & 0xffff) << 16) | ((cj + dj) & 0xffff));
        if (!cell) continue;
        for (const stopY of cell) {
          const b = bwd.get(stopY);
          if (!b) continue;
          if (b.pi === f.pi) continue;              // same bus, not a transfer
          const w = stopX === stopY ? 0 : metres(lat, lon, T.stops[stopY][0], T.stops[stopY][1]);
          if (w > XFER_WALK_M) continue;
          raw.push({
            legs: [{ pi: f.pi, posA: f.posA, posB: f.posB },
                   { pi: b.pi, posA: b.posA, posB: b.posB }],
            xfer: { from: stopX, to: stopY, metres: w },
            rideMin: f.ride + b.ride, waitMin: f.wait + b.wait,
            est: f.est + w / WALK_MPS / 60 + b.est,
          });
        }
      }
    }
  }
  if (!raw.length) return [];
  raw.sort((a, b) => a.est - b.est);

  // ---- cost the plausible handful properly
  const walkCache = new Map();
  const legRoute = (a, b) => {
    const k = `${a}|${b}`;
    if (!walkCache.has(k)) walkCache.set(k, route(a, b, lambda, bucket));
    return walkCache.get(k);
  };
  const srcNode = nearestNode(origin.lat, origin.lon);
  const dstNode = nearestNode(school.lat, school.lon);
  const stopRiskAt = si => {
    const e = firstEdgeAt(stopNode(si));
    return e >= 0 ? risk(e, bucket) : 0.3;
  };

  const out = [];
  const seen = new Set();
  for (const c of raw.slice(0, RIDE_CANDIDATES)) {
    const first = T.patterns[c.legs[0].pi], last = T.patterns[c.legs[c.legs.length - 1].pi];
    const bStop = first.s[c.legs[0].posA];
    const aStop = last.s[c.legs[c.legs.length - 1].posB];
    const key = c.legs.map(l => T.patterns[l.pi].r).join('>') + `|${bStop}|${aStop}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const bn = stopNode(bStop), an = stopNode(aStop);
    if (bn < 0 || an < 0 || bn === an) continue;
    const legA = bn === srcNode ? null : legRoute(srcNode, bn);
    const legB = an === dstNode ? null : legRoute(an, dstNode);
    if ((bn !== srcNode && !legA) || (an !== dstNode && !legB)) continue;

    let waitExp = 0;
    waitExp += stopRiskAt(bStop) * WAIT_M_PER_MIN * first.w;
    if (c.legs.length > 1) {
      waitExp += stopRiskAt(c.xfer.to) * WAIT_M_PER_MIN * last.w;
      waitExp += stopRiskAt(c.xfer.from) * c.xfer.metres;   // the transfer walk
    }
    const walkDist = (legA ? legA.dist : 0) + (legB ? legB.dist : 0)
                   + (c.xfer ? c.xfer.metres : 0);
    const exposure = (legA ? legA.exposure : 0) + (legB ? legB.exposure : 0) + waitExp;
    const timeMin = ((legA ? legA.dist : 0) + (legB ? legB.dist : 0)) / WALK_MPS / 60
                  + (c.xfer ? c.xfer.metres / WALK_MPS / 60 : 0)
                  + c.waitMin + c.rideMin;
    out.push({
      kind: 'transit', legs: c.legs, xfer: c.xfer, bStop, aStop, legA, legB,
      rideMin: c.rideMin, waitMin: c.waitMin, stopRisk: stopRiskAt(bStop),
      dist: walkDist, exposure, timeMin,
      routeLabel: c.legs.map(l => T.patterns[l.pi].r).join(' then '),
      isRail: c.legs.every(l => T.patterns[l.pi].k === 'rail'),
    });
  }

  // One itinerary per combination of routes. Three boarding points on the same
  // bus is not three choices, so keep the calmest version of each.
  const best = new Map();
  for (const o of out) {
    const cur = best.get(o.routeLabel);
    if (!cur || o.exposure < cur.exposure) best.set(o.routeLabel, o);
  }
  return [...best.values()].sort((a, b) => a.exposure - b.exposure);
}

function firstEdgeAt(node) {
  return S.head[node] < S.head[node + 1] ? S.eidx[S.head[node]] : -1;
}

/* Exposure in comparable units across modes: total risk-metres over 100, so a
 * bus trip and a walk can be put side by side honestly. Riding scores near zero
 * because the minutes on board are minutes off the street. */
const expUnits = o => o.exposure / 100;
const optTime = o => (o.kind === 'transit' ? o.timeMin : o.r.dist / WALK_MPS / 60);
const optWalk = o => (o.kind === 'transit' ? o.dist : o.r.dist);

const sig = r => r.edges.join(',');

function buildOptions(src, dst, bucket) {
  const seen = new Map();
  for (const lam of LADDER) {
    const r = route(src, dst, lam, bucket);
    if (r && !seen.has(sig(r))) seen.set(sig(r), r);
  }
  const all = [...seen.values()];
  if (!all.length) return null;

  const foot = (r, label, hint) =>
    ({ kind: 'foot', r, exposure: r.exposure, label, hint });

  const fast = all.reduce((a, b) => (b.dist < a.dist ? b : a));
  const safe = all.reduce((a, b) => (b.exposure < a.exposure ? b : a));
  const out = [foot(fast, 'Shortest', 'what a map app gives you')];
  if (sig(safe) === sig(fast)) return out;

  // A middle option only earns its place if it buys more calm per extra metre
  // than the safest route does. Otherwise there are honestly just two choices.
  let mid = null, bestEff = -Infinity;
  for (const m of all) {
    if (sig(m) === sig(fast) || sig(m) === sig(safe)) continue;
    const cut = fast.exposure - m.exposure;
    if (cut <= 0) continue;
    const eff = cut / Math.max(m.dist - fast.dist, 1);
    if (eff > bestEff) { bestEff = eff; mid = m; }
  }
  if (mid) out.push(foot(mid, 'Balanced', 'most calm per extra step'));
  out.push(foot(safe, 'Safest', 'lowest exposure available'));
  return out;
}

function compute(fit = true) {
  if (!S.origin || !S.school) return;
  const src = nearestNode(S.origin.lat, S.origin.lon);
  const dst = nearestNode(S.school.lat, S.school.lon);
  if (src < 0 || dst < 0) { toast('No walkable street near that point.'); return; }
  if (src === dst) { toast('That start point is already at the school.'); return; }

  spokeLayer.clearLayers();
  const onFoot = buildOptions(src, dst, S.bucket);
  if (!onFoot) { toast('No walking route connects those points.'); return; }

  let opts = onFoot;
  if (S.mode === 'bus') {
    const rides = transitOptions(S.origin, S.school, S.bucket, 3.0);
    if (!rides.length) {
      toast('No single bus or rail ride links those points. Showing the walk.');
      $('mode-note').textContent =
        'Nothing within a 900 m walk of both ends shares one route, so these are '
        + 'walking options. Transfers are out of scope: each change adds another '
        + 'wait to stand through.';
    } else {
      // Always keep the calmest walk on screen, so the bus is compared against
      // the real alternative rather than presented on its own.
      const walkRef = onFoot[onFoot.length - 1];
      opts = rides.slice(0, 3).map(o => ({
        ...o,
        // Rail lines already read as names ("Metro E Line"), so only bus
        // numbers need the word Route in front of them.
        label: /line/i.test(o.routeLabel) ? o.routeLabel : `Route ${o.routeLabel}`,
        hint: `${Math.round(o.rideMin)} min riding, ${fmtM(o.dist)} on foot`
            + (o.xfer ? ', one change' : ''),
      }));
      opts.push({ ...walkRef, label: 'Walk the whole way',
                  hint: 'no bus, for comparison' });
      $('mode-note').textContent =
        'Riding covers distance without putting you on the street. Waiting does '
        + `not, so a minute at a stop is charged like ${WAIT_M_PER_MIN} m of walking there.`;
    }
  }

  S.routes = opts;
  if (S.pick >= opts.length) S.pick = opts.length - 1;
  $('intro').style.display = 'none';
  renderCards();
  select(S.pick, fit);
}

function renderCards() {
  // Compare against the plain walk: in foot mode the shortest route, in bus
  // mode the walking option pinned to the bottom of the list.
  const ref = S.mode === 'bus'
    ? (S.routes.find(o => o.kind === 'foot') || S.routes[0])
    : S.routes[0];
  const refExp = ref ? ref.exposure : 0;

  $('cards').innerHTML = S.routes.map((o, i) => {
    const cut = refExp > 0 ? Math.round((1 - o.exposure / refExp) * 100) : 0;
    const sub = (o === ref || cut <= 0) ? o.hint : `${cut}% less exposure`;
    const intensity = optWalk(o) > 0 ? o.exposure / optWalk(o) : 0;
    return `<div class="rc${i === S.pick ? ' on' : ''}" data-i="${i}">
      <span class="swatch" style="background:${bandColor(intensity)}"></span>
      <span class="who"><b>${o.label}</b><small>${sub}</small></span>
      <span class="num"><b>${Math.max(1, Math.round(optTime(o)))} min</b><small>${fmtM(optWalk(o))} walk / ${expUnits(o).toFixed(1)}</small></span>
    </div>`;
  }).join('');
  $('r-cards').style.display = '';
}

const stopName = si => T.names[T.stops[si][2]] || 'a stop';

function routeExposureAt(r, b) {
  let e = 0;
  for (const ei of r.edges) e += S.ed[ei] * risk(ei, b);
  return e;
}

function exposureAt(o, b) {
  if (o.kind !== 'transit') return routeExposureAt(o.r, b);
  const wr = firstEdgeAt(stopNode(o.bStop));
  const sr = wr >= 0 ? risk(wr, b) : o.stopRisk;
  return (o.legA ? routeExposureAt(o.legA, b) : 0)
       + (o.legB ? routeExposureAt(o.legB, b) : 0)
       + sr * WAIT_M_PER_MIN * o.waitMin;
}

function drawWalk(r, colour, weight) {
  L.polyline(routeLatLngs(r), { color: '#fff', weight: weight + 3.5, opacity: .75,
                                interactive: false }).addTo(routeLayer);
  L.polyline(routeLatLngs(r), { color: colour, weight, opacity: 1,
                                lineCap: 'round', interactive: false }).addTo(routeLayer);
}

function drawSelection(o) {
  routeLayer.clearLayers();
  const ref = S.routes.find(x => x.kind === 'foot' && x.label === 'Shortest');
  if (ref && ref !== o) {
    L.polyline(routeLatLngs(ref.r), {
      color: '#211f18', weight: 2.5, opacity: .45, dashArray: '3,6',
      interactive: false,
    }).addTo(routeLayer);
  }
  if (o.kind !== 'transit') { drawWalk(o.r, '#3c7a4e', 4.5); return; }

  if (o.legA) drawWalk(o.legA, '#3c7a4e', 4);
  if (o.legB) drawWalk(o.legB, '#3c7a4e', 4);

  for (const leg of o.legs) {
    const pat = T.patterns[leg.pi];
    const stops = pat.s.slice(leg.posA, leg.posB + 1);
    const ride = stops.map(si => [T.stops[si][0], T.stops[si][1]]);
    L.polyline(ride, { color: '#fff', weight: 9, opacity: .8, interactive: false })
      .addTo(routeLayer);
    L.polyline(ride, { color: '#211f18', weight: 5, opacity: 1, lineCap: 'round',
                       interactive: false }).addTo(routeLayer);
    for (const si of stops) {
      L.circleMarker([T.stops[si][0], T.stops[si][1]], {
        radius: 2.6, color: '#211f18', weight: 1, fillColor: '#e8e4d6',
        fillOpacity: 1, interactive: false,
      }).addTo(routeLayer);
    }
  }
  // The transfer walk, drawn so a change of bus is visible rather than implied.
  if (o.xfer && o.xfer.metres > 0) {
    L.polyline([[T.stops[o.xfer.from][0], T.stops[o.xfer.from][1]],
                [T.stops[o.xfer.to][0], T.stops[o.xfer.to][1]]], {
      color: '#3c7a4e', weight: 3, opacity: .95, dashArray: '2,5',
      interactive: false,
    }).addTo(routeLayer);
  }
  const marks = [[o.bStop, 'Board'], [o.aStop, 'Get off']];
  if (o.xfer) marks.push([o.xfer.to, 'Change here']);
  for (const [si, lbl] of marks) {
    L.circleMarker([T.stops[si][0], T.stops[si][1]], {
      radius: 5.5, color: '#211f18', weight: 2, fillColor: '#c8912b', fillOpacity: 1,
    }).bindTooltip(`${lbl}: ${stopName(si)}`, { direction: 'top' }).addTo(routeLayer);
  }
}

function renderWhy(o) {
  const el = $('because');
  const walkRef = S.routes.find(x => x.kind === 'foot'
    && (S.mode === 'bus' || x.label === 'Shortest'));

  if (o.kind === 'transit') {
    const cut = walkRef && walkRef.exposure > 0
      ? Math.round((1 - o.exposure / walkRef.exposure) * 100) : 0;
    const ride = o.xfer
      ? `ride <b>${o.routeLabel}</b> for <b>${Math.round(o.rideMin)} min</b> with `
        + `one change at <span class="st">${stopName(o.xfer.to)}</span>`
      : `ride <b>${o.routeLabel}</b> for <b>${Math.round(o.rideMin)} min</b>`;
    const bits = [
      `Walk <b>${fmtM(o.legA ? o.legA.dist : 0)}</b> to `
      + `<span class="st">${stopName(o.bStop)}</span>, wait about `
      + `<b>${Math.round(o.waitMin)} min</b> in total, then ${ride}, `
      + `then walk <b>${fmtM(o.legB ? o.legB.dist : 0)}</b> at the other end.`,
      `Only <b>${fmtM(o.dist)}</b> of this trip happens on the street.`,
    ];
    if (walkRef) {
      bits.push(cut > 2
        ? `Against walking the whole way, exposure drops <b>${cut}%</b>.`
        : `That is about the same exposure as walking it, so take whichever suits you.`);
    }
    el.className = 'because' + (cut <= 2 ? ' flat' : '');
    el.innerHTML = bits.join(' ');
  } else {
    const base = (S.routes.find(x => x.kind === 'foot' && x.label === 'Shortest') || o).r;
    const ex = explain(o.r, base, S.bucket);
    el.className = 'because' + (ex.flat ? ' flat' : '');
    el.innerHTML = ex.html;
  }
  $('r-because').style.display = '';
}

function renderHours(o) {
  const vals = [0, 1, 2].map(b => exposureAt(o, b) / 100);
  const max = Math.max(...vals, 0.01);
  $('hours').innerHTML = vals.map((v, b) => `
    <div class="hrow${b === S.bucket ? ' now' : ''}">
      <span>${WINDOWS[b][0].toUpperCase() + WINDOWS[b].slice(1)}</span>
      <span class="track"><i class="bar" style="width:${(v / max * 100).toFixed(1)}%;background:${bandColor(optWalk(o) ? exposureAt(o, b) / optWalk(o) : 0)}"></i></span>
      <b>${v.toFixed(1)}</b>
    </div>`).join('');
  const worst = vals.indexOf(Math.max(...vals));
  $('hours-note').textContent =
    `This same trip carries the most exposure in the ${WINDOWS[worst]} `
    + `(${WINDOW_CLOCK[worst]}). Changing the window above re-runs the search, `
    + `which often returns a different route entirely.`;
  $('r-hours').style.display = '';
}

const turnRow = (label, len, worst) =>
  `<li><span>${label}</span><span class="m">${len}</span>`
  + `<span class="chip" style="color:${bandColor(worst)}">${Math.round(worst * 100)}</span></li>`;

function renderTurns(o) {
  let html = '';
  if (o.kind === 'transit') {
    if (o.legA) {
      html += turnList(o.legA, S.bucket).map(t =>
        turnRow(t.label, fmtM(t.len), t.worst)).join('');
    }
    o.legs.forEach((leg, k) => {
      const pat = T.patterns[leg.pi];
      const board = pat.s[leg.posA], off = pat.s[leg.posB];
      html += turnRow(`Board ${pat.r} at ${stopName(board)}`,
                      `wait ${Math.round(pat.w)} min`, o.stopRisk);
      html += turnRow(`Ride ${leg.posB - leg.posA} stops`,
                      `${Math.round(Math.max(0, pat.t[leg.posB] - pat.t[leg.posA]) / 60)} min`, 0);
      html += turnRow(`Get off at ${stopName(off)}`, '', o.stopRisk);
      if (k === 0 && o.xfer && o.xfer.metres > 0) {
        html += turnRow(`Walk to ${stopName(o.xfer.to)} to change`,
                        fmtM(o.xfer.metres), o.stopRisk);
      }
    });
    if (o.legB) {
      html += turnList(o.legB, S.bucket).map(t =>
        turnRow(t.label, fmtM(t.len), t.worst)).join('');
    }
  } else {
    html = turnList(o.r, S.bucket).slice(0, 60).map(t =>
      turnRow(t.label, fmtM(t.len), t.worst)).join('');
  }
  $('turnlist').innerHTML = html;
  $('r-turns').style.display = '';
}

function select(i, fit = true) {
  S.pick = i;
  const o = S.routes[i];
  [...$('cards').children].forEach((c, k) => c.classList.toggle('on', k === i));

  drawSelection(o);
  renderWhy(o);
  renderHours(o);
  renderTurns(o);
  $('r-share').style.display = '';

  writeUrl();
  if (fit) {
    map.fitBounds(L.featureGroup(routeLayer.getLayers()).getBounds().pad(0.16),
                  { animate: false });
  }
}

/* -------------------------------------------------------- school report */
function report(school) {
  const dst = nearestNode(school.lat, school.lon);
  if (dst < 0) { toast('That school is not near a walkable street.'); return; }
  const R = 1200;
  const rows = [];
  spokeLayer.clearLayers();
  routeLayer.clearLayers();

  for (let k = 0; k < COMPASS.length; k++) {
    const th = k * 2 * Math.PI / COMPASS.length;
    const lat = school.lat + (R * Math.cos(th)) / 111320;
    const lon = school.lon + (R * Math.sin(th)) / 92500;
    const src = nearestNode(lat, lon);
    if (src < 0 || src === dst) continue;
    // Lambda 0: what a student walks without this tool, which is what makes a
    // direction dangerous in the first place.
    const r = route(src, dst, 0, S.bucket);
    if (!r) continue;
    rows.push({ dir: COMPASS[k], r });
  }
  if (!rows.length) { toast('Could not reach that school from any direction.'); return; }

  rows.sort((a, b) => b.r.score - a.r.score);
  const worst = rows[0], best = rows[rows.length - 1];

  for (const row of rows) {
    L.polyline(routeLatLngs(row.r), {
      color: bandColor(row.r.score / 100), weight: 3.5, opacity: .9,
      interactive: false, lineCap: 'round',
    }).addTo(spokeLayer);
  }
  pinLayer.clearLayers();
  pin([school.lat, school.lon], '#211f18', school.name)
    .bindTooltip(school.name, { direction: 'top', offset: [0, -8] }).addTo(pinLayer);

  $('rc-title').innerHTML = `${rows.length} approaches / <b>${WINDOWS[S.bucket]}</b>`;
  $('rc-body').innerHTML = rows.map(row => {
    const cls = row === worst ? ' class="worst"' : row === best ? ' class="best"' : '';
    return `<tr${cls}><td class="dir"><span class="swatch" style="background:${bandColor(row.r.score / 100)}"></span>${row.dir}</td>`
      + `<td>${fmtM(row.r.dist)}</td><td class="sc">${Math.round(row.r.score)}</td></tr>`;
  }).join('');
  const ratio = best.r.score > 0 ? (worst.r.score / best.r.score) : 0;
  $('rc-note').innerHTML =
    `Approaching ${school.name} from the <b>${worst.dir}</b> means walking through `
    + `${ratio >= 1.15 ? `<b>${ratio.toFixed(1)} times</b> the exposure of` : 'about the same exposure as'} `
    + `the calmest approach, from the <b>${best.dir}</b>. `
    + `That is where a crossing guard, a lighting request or a walking group would do the most good.`;
  $('rc-out').style.display = '';
  map.fitBounds(L.featureGroup(spokeLayer.getLayers()).getBounds().pad(0.08),
                { animate: false });
}

/* --------------------------------------------------------- autocomplete */
function attachAC(inputId, listId, search, onPick) {
  const input = $(inputId), list = $(listId);
  let items = [], sel = -1, timer = null;

  const close = () => { list.classList.remove('on'); sel = -1; };
  const render = () => {
    if (!items.length) { close(); return; }
    list.innerHTML = items.map((it, i) =>
      `<div${i === sel ? ' class="sel"' : ''} data-i="${i}">${it.label}`
      + (it.sub ? `<small>${it.sub}</small>` : '') + '</div>').join('');
    list.classList.add('on');
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { items = []; close(); return; }
    timer = setTimeout(async () => {
      try {
        items = (await search(q)) || [];
      } catch (e) { items = []; }
      if (!items.length) {
        list.innerHTML = '<div class="none">Nothing found for that</div>';
        list.classList.add('on');
        return;
      }
      sel = -1; render();
    }, 260);
  });

  input.addEventListener('keydown', e => {
    if (!list.classList.contains('on') || !items.length) return;
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      onPick(items[sel < 0 ? 0 : sel]); close();
    } else if (e.key === 'Escape') close();
  });

  list.addEventListener('mousedown', e => {
    const d = e.target.closest('div[data-i]'); if (!d) return;
    e.preventDefault();
    onPick(items[+d.dataset.i]); close();
  });
  input.addEventListener('blur', () => setTimeout(close, 140));
}

const searchSchools = q => {
  const v = q.toLowerCase();
  return S.schools
    .filter(s => s.name.toLowerCase().includes(v))
    .slice(0, 8)
    .map(s => ({ label: s.name, sub: `${s.level} / ${s.city}`, school: s }));
};

/* Addresses go through Nominatim, bounded to the study area so a search for
 * "Main Street" lands in Los Angeles rather than Ohio. */
async function searchPlaces(q) {
  const b = S.meta.bbox;
  const url = `${NOMINATIM}?format=jsonv2&limit=6&addressdetails=0`
    + `&countrycodes=us&bounded=1`
    + `&viewbox=${b.west},${b.north},${b.east},${b.south}`
    + `&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('lookup failed');
  const j = await res.json();
  return j.map(p => {
    const bits = p.display_name.split(',').map(s => s.trim());
    return {
      label: bits.slice(0, 2).join(', '),
      sub: bits.slice(2, 5).join(', '),
      lat: +p.lat, lon: +p.lon,
    };
  });
}

/* ------------------------------------------------------------ url state */
function writeUrl() {
  if (!S.origin || !S.school) return;
  const p = new URLSearchParams();
  p.set('from', `${S.origin.lat.toFixed(5)},${S.origin.lon.toFixed(5)}`);
  p.set('to', S.school.id || `${S.school.lat.toFixed(5)},${S.school.lon.toFixed(5)}`);
  p.set('when', String(S.bucket));
  p.set('mode', S.mode);
  p.set('pick', String(S.pick));
  history.replaceState(null, '', `${location.pathname}?${p}`);
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  const from = p.get('from'), to = p.get('to');
  if (!from || !to) return false;
  const [flat, flon] = from.split(',').map(Number);
  if (!isFinite(flat) || !isFinite(flon)) return false;
  S.origin = { lat: flat, lon: flon };
  $('origin').value = `${flat.toFixed(5)}, ${flon.toFixed(5)}`;

  let sc = S.schools.find(s => s.id === to);
  if (!sc && to.includes(',')) {
    const [tlat, tlon] = to.split(',').map(Number);
    if (isFinite(tlat) && isFinite(tlon)) sc = { name: 'Chosen destination', lat: tlat, lon: tlon };
  }
  if (!sc) return false;
  S.school = sc;
  $('school').value = sc.name;

  const m = p.get('mode');
  if (m === 'bus' || m === 'foot') {
    S.mode = m;
    [...$('mode').children].forEach(c => c.classList.toggle('on', c.dataset.m === m));
  }
  const w = +p.get('when');
  if (w >= 0 && w <= 2) setWindow(w, false);
  const k = +p.get('pick');
  if (k >= 0 && k <= 2) S.pick = k;
  return true;
}

/* ---------------------------------------------------------------- UI */
function setWindow(b, recompute = true) {
  S.bucket = b;
  [...$('when').children].forEach(c => c.classList.toggle('on', +c.dataset.b === b));
  $('lg-when').textContent = WINDOWS[b];
  drawRisk();
  if (recompute && S.origin && S.school) compute(false);
}

document.querySelector('.tabs').addEventListener('click', e => {
  const t = e.target.closest('.tab'); if (!t) return;
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.pane').forEach(x => x.classList.remove('on'));
  t.classList.add('on');
  $('p-' + t.dataset.p).classList.add('on');
  if (t.dataset.p !== 'school') spokeLayer.clearLayers();
});

$('when').addEventListener('click', e => {
  const d = e.target.closest('div[data-b]'); if (!d) return;
  setWindow(+d.dataset.b);
});

$('mode').addEventListener('click', e => {
  const d = e.target.closest('div[data-m]'); if (!d) return;
  S.mode = d.dataset.m;
  [...$('mode').children].forEach(c => c.classList.toggle('on', c === d));
  S.pick = 0;
  if (S.origin && S.school) compute(false);
});

$('cards').addEventListener('click', e => {
  const c = e.target.closest('.rc'); if (!c) return;
  select(+c.dataset.i);
});

map.on('click', ev => {
  S.origin = { lat: ev.latlng.lat, lon: ev.latlng.lng };
  $('origin').value = `${S.origin.lat.toFixed(5)}, ${S.origin.lon.toFixed(5)}`;
  redrawPins();
  $('go').disabled = !S.school;
  if (S.school) compute();
});

$('go').addEventListener('click', () => compute());

$('share').addEventListener('click', async () => {
  writeUrl();
  try {
    await navigator.clipboard.writeText(location.href);
    $('share').textContent = 'Link copied';
    setTimeout(() => { $('share').textContent = 'Copy a link to this route'; }, 2200);
  } catch (e) {
    toast('Copy failed. The address bar holds the link.');
  }
});

$('demo').addEventListener('click', () => {
  const sc = S.schools.find(s => /Enriched Studies/i.test(s.name)) || S.schools[0];
  S.school = sc;
  S.origin = { lat: 34.0380, lon: -118.3620 };
  $('school').value = sc.name;
  $('origin').value = 'Near Hauser & Venice, Mid-City';
  setWindow(2, false);
  redrawPins();
  $('go').disabled = false;
  compute();
});

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
          radius: 2.5, color: '#211f18', weight: 1, fillOpacity: .45,
        }).bindTooltip(s.name, { direction: 'top' }).addTo(schoolLayer);
      }
    }
    schoolLayer.addTo(map);
  } else map.removeLayer(schoolLayer);
});

$('rc-run').addEventListener('click', () => {
  if (S.rcSchool) report(S.rcSchool);
});

/* -------------------------------------------------------------- boot */
async function fetchGraph(onPct) {
  if (typeof DecompressionStream === 'function') {
    try {
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
        const buf = await new Response(
          res.body.pipeThrough(counter).pipeThrough(new DecompressionStream('gzip'))
        ).arrayBuffer();
        // A host that sets Content-Encoding: gzip has the browser inflate for
        // us, so inflating twice yields garbage rather than throwing. Check the
        // magic before trusting it.
        if (buf.byteLength > 24 && new Uint32Array(buf, 0, 1)[0] === MAGIC) return buf;
        console.warn('inflated graph failed its magic check, using graph.bin');
      }
    } catch (e) {
      console.warn('gzip path unavailable, using graph.bin', e);
    }
  }
  const res = await fetch('data/graph.bin');
  if (!res.ok) throw new Error(`graph.bin: HTTP ${res.status}`);
  return res.arrayBuffer();
}

function windowForNow() {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return 0;
  if (h >= 10 && h < 17) return 1;
  return 2;
}

async function boot() {
  const [meta, schools, names, transit] = await Promise.all([
    fetch('data/graph_meta.json').then(r => r.json()),
    fetch('data/schools.json').then(r => r.json()),
    fetch('data/street_names.json').then(r => r.json()),
    fetch('data/transit.json').then(r => r.json()).catch(() => null),
  ]);
  S.meta = meta; S.schools = schools; S.names = names;
  if (transit) initTransit(transit);
  else {
    // Without the feed the bus option cannot work, so retire it rather than
    // leaving a control that silently does nothing.
    const bus = document.querySelector('#mode div[data-m="bus"]');
    if (bus) { bus.style.display = 'none'; }
  }
  $('boot-sub').textContent =
    `${meta.crimes.toLocaleString()} incidents / ${meta.km.toLocaleString()} km of street`;

  $('lg-scale').innerHTML =
    BANDS.map(b => `<i style="background:${b.hex}"></i>`).join('');

  const buf = await fetchGraph((pct, got, total) => {
    $('boot-bar').style.width = `${(pct * 100).toFixed(0)}%`;
    $('boot-sub').textContent =
      `${(got / 1e6).toFixed(1)} of ${(total / 1e6).toFixed(1)} MB`;
  });

  $('boot-msg').textContent = 'Building the routing graph';
  $('boot-bar').style.width = '100%';
  decode(buf);
  buildAdjacency();
  buildIndex();

  attachAC('school', 'ac-school', q => searchSchools(q), it => {
    S.school = it.school;
    $('school').value = it.school.name;
    redrawPins();
    $('go').disabled = !S.origin;
    if (S.origin) compute(); else map.setView([it.school.lat, it.school.lon], 15);
  });

  attachAC('origin', 'ac-origin', searchPlaces, it => {
    S.origin = { lat: it.lat, lon: it.lon };
    $('origin').value = it.label;
    redrawPins();
    $('go').disabled = !S.school;
    if (S.school) compute();
  });

  attachAC('rc-school', 'ac-rc', q => searchSchools(q), it => {
    S.rcSchool = it.school;
    $('rc-school').value = it.school.name;
    $('rc-run').disabled = false;
  });

  const now = windowForNow();
  const restored = readUrl();
  if (!restored) {
    setWindow(now, false);
    const clock = new Date().toLocaleTimeString('en-US',
      { hour: 'numeric', minute: '2-digit' });
    $('when-note').textContent =
      `It is ${clock}, so ${WINDOWS[now]} is selected. Change it to plan a different walk.`;
  } else {
    $('when-note').textContent = 'Restored from a shared link.';
  }

  $('boot').classList.add('done');
  drawRisk();
  if (restored) { redrawPins(); compute(); }
}

boot().catch(err => {
  $('boot').classList.remove('done');
  $('boot-msg').textContent = 'The data files did not load.';
  $('boot-sub').textContent = err.message;
  console.error(err);
});
