// In-memory hex grid store. Loads web/data/hex.bin once (~0.8 MB gzipped) and answers
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

export class HexStore {
  constructor(meta, buffer) {
    this.meta = meta;
    this.n = meta.rows;
    this.col = {};
    for (const c of meta.columns) {
      this.col[c.name] = new TYPED[c.dtype](buffer, c.offset, this.n);
    }
    this.scoreCols = meta.columns.filter((c) => c.missing === 65535).map((c) => c.name);
  }

  static async load(baseUrl = "data") {
    const [meta, buf] = await Promise.all([
      fetch(`${baseUrl}/hex.json`).then((r) => r.json()),
      fetch(`${baseUrl}/hex.bin`).then((r) => r.arrayBuffer()),
    ]);
    return new HexStore(meta, buf);
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

  // Summary of a footprint: area, mean score per layer, category mix, siting context.
  summarize(bbox) {
    const idx = this.select(bbox);
    const c = this.col;
    const k = idx.length;
    const res = {
      hexes: k,
      acres: k * this.meta.hex_acres,
      coveredByModel: k > 0,
      mean: {},
      share: { constrained: 0, inWEA: 0, inHighHighCluster: 0 },
      finalCategory: new Array(this.meta.columns.find((x) => x.name === "final_cat").categories.length).fill(0),
      depth: { min: Infinity, max: -Infinity, mean: 0 },
      shoreKm: { min: Infinity, mean: 0 },
      nearestPorts: {},
    };
    if (!k) return res;

    const sums = Object.fromEntries(this.scoreCols.map((s) => [s, 0]));
    let constrained = 0, wea = 0, hh = 0, depthSum = 0, shoreSum = 0;
    for (const i of idx) {
      for (const s of this.scoreCols) sums[s] += c[s][i];
      if (c.constraint[i] === 0) constrained++;
      if (c.wea[i]) wea++;
      if (c.hh_cluster[i]) hh++;
      const cat = c.final_cat[i];
      if (cat < res.finalCategory.length) res.finalCategory[cat]++;
      const d = c.depth_m[i];
      depthSum += d;
      if (d < res.depth.min) res.depth.min = d;
      if (d > res.depth.max) res.depth.max = d;
      const sk = c.shore_km[i] * 0.1;
      shoreSum += sk;
      if (sk < res.shoreKm.min) res.shoreKm.min = sk;
      const p = this.meta.ports[c.port_idx[i]].port;
      res.nearestPorts[p] = (res.nearestPorts[p] || 0) + 1;
    }
    for (const s of this.scoreCols) res.mean[s] = sums[s] / k / 65534;
    res.share.constrained = constrained / k;
    res.share.inWEA = wea / k;
    res.share.inHighHighCluster = hh / k;
    res.depth.mean = depthSum / k;
    res.shoreKm.mean = shoreSum / k;
    return res;
  }
}
