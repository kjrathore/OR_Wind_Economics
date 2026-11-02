// In-memory hex grid store. Loads web/data/hex.bin once (~0.9 MB gzipped) and answers
// "what is inside this box?" with a linear scan — no server round trip, so a drawn
// footprint updates the dashboard in a few milliseconds.
//
// Works in the browser and in Node (see bench/query_bench.mjs).

const TYPED = {
  float32: Float32Array,
  uint16: Uint16Array,
  int16: Int16Array,
  uint8: Uint8Array,
};

const KM2_PER_ACRE = 0.00404686;

export class HexStore {
  constructor(meta, buffer) {
    this.meta = meta;
    this.n = meta.rows;
    this.col = {};
    for (const c of meta.columns) {
      this.col[c.name] = new TYPED[c.dtype](buffer, c.offset, this.n);
    }
    this.scoreCols = meta.columns.filter((c) => c.missing === 65535).map((c) => c.name);
    this.catCols = meta.columns.filter((c) => c.categories).map((c) => c.name);
    this.categories = meta.columns.find((c) => c.categories).categories;
    this.hexKm2 = meta.hex_acres * KM2_PER_ACRE;

    // NCCOS fisheries submodel "Low" suitability = the most important fishing grounds
    this.LOW = this.categories.indexOf("Low");
    this.fishingCoreTotal = 0;
    for (let i = 0; i < this.n; i++) if (this.col.fisheries_cat[i] === this.LOW) this.fishingCoreTotal++;
  }

  static async load(baseUrl = "data") {
    const [meta, buf] = await Promise.all([
      fetch(`${baseUrl}/hex.json`).then((r) => r.json()),
      fetch(`${baseUrl}/hex.bin`).then((r) => r.arrayBuffer()),
    ]);
    return new HexStore(meta, buf);
  }

  score(name, i) {
    return this.col[name][i] / 65534;
  }

  // Indices of hexes whose centroid falls inside [west, south, east, north].
  select([w, s, e, n]) {
    const { lon, lat } = this.col;
    const out = [];
    for (let i = 0; i < this.n; i++) {
      const x = lon[i], y = lat[i];
      if (x >= w && x <= e && y >= s && y <= n) out.push(i);
    }
    return out;
  }

  // Nearest hex centroid to a point, or -1 if none within ~250 m (used for hover).
  nearest(lon0, lat0) {
    const [w, s, e, n] = this.meta.bbox;
    if (lon0 < w - 0.01 || lon0 > e + 0.01 || lat0 < s - 0.01 || lat0 > n + 0.01) return -1;
    const { lon, lat } = this.col;
    const kx = Math.cos((lat0 * Math.PI) / 180);
    let best = -1, bestD = (0.00225) ** 2; // 0.00225° lat ≈ 250 m
    for (let i = 0; i < this.n; i++) {
      const dy = lat[i] - lat0;
      if (dy > 0.00225 || dy < -0.00225) continue;
      const dx = (lon[i] - lon0) * kx;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // Summary of a footprint: area, mean score per layer, category mix, siting context.
  summarize(bbox) {
    const idx = this.select(bbox);
    const c = this.col;
    const k = idx.length;
    const nCat = this.categories.length;
    const res = {
      hexes: k,
      acres: k * this.meta.hex_acres,
      km2: k * this.hexKm2,
      mean: {},
      categoryMix: Object.fromEntries(this.catCols.map((s) => [s.replace("_cat", ""), new Array(nCat).fill(0)])),
      share: { constrained: 0, inWEA: 0, inHighHighCluster: 0 },
      unconstrainedKm2: 0,
      fishingCore: { hexes: 0, shareOfCallAreas: 0 },
      depth: { min: Infinity, max: -Infinity, mean: 0 },
      shoreKm: { min: Infinity, max: -Infinity, mean: 0 },
      portKm: { min: Infinity },
      nearestPorts: {},
    };
    if (!k) return res;

    const sums = Object.fromEntries(this.scoreCols.map((s) => [s, 0]));
    let constrained = 0, wea = 0, hh = 0, core = 0, depthSum = 0, shoreSum = 0;
    for (const i of idx) {
      for (const s of this.scoreCols) sums[s] += c[s][i];
      for (const s of this.catCols) {
        const v = c[s][i];
        if (v < nCat) res.categoryMix[s.replace("_cat", "")][v]++;
      }
      if (c.constraint[i] === 0) constrained++;
      if (c.wea[i]) wea++;
      if (c.hh_cluster[i]) hh++;
      if (c.fisheries_cat[i] === this.LOW) core++;
      const d = c.depth_m[i];
      depthSum += d;
      if (d < res.depth.min) res.depth.min = d;
      if (d > res.depth.max) res.depth.max = d;
      const sk = c.shore_km[i] * 0.1;
      shoreSum += sk;
      if (sk < res.shoreKm.min) res.shoreKm.min = sk;
      if (sk > res.shoreKm.max) res.shoreKm.max = sk;
      const pk = c.port_km[i] * 0.1;
      if (pk < res.portKm.min) res.portKm.min = pk;
      const p = this.meta.ports[c.port_idx[i]].port;
      res.nearestPorts[p] = (res.nearestPorts[p] || 0) + 1;
    }
    for (const s of this.scoreCols) res.mean[s] = sums[s] / k / 65534;
    res.share.constrained = constrained / k;
    res.share.inWEA = wea / k;
    res.share.inHighHighCluster = hh / k;
    res.unconstrainedKm2 = (k - constrained) * this.hexKm2;
    res.fishingCore = { hexes: core, shareOfCallAreas: core / this.fishingCoreTotal };
    res.depth.mean = depthSum / k;
    res.shoreKm.mean = shoreSum / k;
    return res;
  }
}
