// Latency benchmark for the in-browser query path.
// Usage: node web/bench/query_bench.mjs
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { HexStore } from "../src/hexstore.js";

const dir = new URL("../data/", import.meta.url);
const t0 = performance.now();
const raw = readFileSync(new URL("hex.bin", dir));
const meta = JSON.parse(readFileSync(new URL("hex.json", dir), "utf8"));
const store = new HexStore(meta, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
const tLoad = performance.now() - t0;

const [W, S, E, N] = meta.bbox;
const rand = (a, b) => a + Math.random() * (b - a);
const boxes = Array.from({ length: 1000 }, () => {
  const w = rand(W, E), s = rand(S, N);
  return [w, s, w + rand(0.05, 0.4), s + rand(0.05, 0.6)]; // ~4-35 km boxes
});

for (let i = 0; i < 20; i++) store.summarize(boxes[i]); // warm-up (JIT)
const times = boxes.map((b) => {
  const t = performance.now();
  store.summarize(b);
  return performance.now() - t;
}).sort((a, b) => a - b);
const pct = (p) => times[Math.floor(p * (times.length - 1))].toFixed(2);

// Bounding box of the 2024 Coos Bay WEA
const ex = store.summarize([-125.106, 43.724, -124.849, 43.95]);

console.log(`rows                 ${store.n.toLocaleString()}`);
console.log(`hex.bin              ${(raw.length / 1e6).toFixed(2)} MB raw, ${(gzipSync(raw).length / 1e6).toFixed(2)} MB gzip`);
console.log(`parse (node, local)  ${tLoad.toFixed(1)} ms`);
console.log(`summarize(box) x1000 p50 ${pct(0.5)} ms | p95 ${pct(0.95)} ms | max ${pct(1)} ms`);
console.log(`example box          ${ex.hexes} hexes, ${ex.acres.toLocaleString()} acres, ` +
  `${(ex.share.constrained * 100).toFixed(0)}% constrained, mean final ${ex.mean.final.toFixed(3)}, ` +
  `depth ${ex.depth.min}-${ex.depth.max} m`);
