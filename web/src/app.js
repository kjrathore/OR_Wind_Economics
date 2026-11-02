// Oregon Wind Footprint Explorer — map, box drawing, live panels.
// All data is static (web/data); every interaction is answered in-browser by HexStore.
import { HexStore } from "./hexstore.js";

const PRESETS = {
  coos: [-125.106, 43.724, -124.849, 43.95],      // 2024 Coos Bay WEA extent
  brookings: [-125.057, 41.984, -124.725, 42.288], // 2024 Brookings WEA extent
  pilot: [-124.93, 42.10, -124.88, 42.137],        // ~4 x 4 km, inside Brookings WEA
};
const INITIAL_VIEW = { center: [-124.6, 43.0], zoom: 6.6 };
const DARK = matchMedia("(prefers-color-scheme: dark)").matches;
const $ = (id) => document.getElementById(id);
const fmt = {
  int: (v) => Math.round(v).toLocaleString(),
  pct: (v) => (v >= 0.995 || v === 0 ? (v * 100).toFixed(0) : v < 0.01 ? "<1" : (v * 100).toFixed(0)) + "%",
  km: (v) => v.toFixed(v < 10 ? 1 : 0),
  usd: (v) =>
    v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v)}`,
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const state = { box: null, layer: "final", cvd: false, opacity: 0.75, density: 3, portTab: null };
let store, econ, map;

// ------------------------------------------------------------------ boot

async function boot() {
  readHash();
  [store, econ] = await Promise.all([
    HexStore.load("data"),
    fetch("data/econ.json").then((r) => r.json()),
  ]);
  initControls();
  initMap();
  window.__orwind = { store, econ, map, state }; // handle for debugging and automated checks
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const b = p.get("box")?.split(",").map(Number);
  if (b?.length === 4 && b.every(Number.isFinite)) state.box = b;
  if (p.get("layer")) state.layer = p.get("layer");
  if (p.get("cvd") === "1") state.cvd = true;
}

function writeHash() {
  const p = new URLSearchParams();
  if (state.box) p.set("box", state.box.map((v) => v.toFixed(4)).join(","));
  p.set("layer", state.layer);
  if (state.cvd) p.set("cvd", "1");
  history.replaceState(null, "", "#" + p.toString());
}

// ------------------------------------------------------------------ controls

function initControls() {
  const sel = $("sel-layer");
  for (const [key, o] of Object.entries(store.meta.overlays)) {
    sel.add(new Option(o.label, key, false, key === state.layer));
  }
  sel.add(new Option("None", "none", false, state.layer === "none"));
  if (!store.meta.overlays[state.layer] && state.layer !== "none") state.layer = "final";
  sel.value = state.layer;
  sel.onchange = () => { state.layer = sel.value; updateOverlay(); writeHash(); };

  $("chk-cvd").checked = state.cvd;
  $("chk-cvd").onchange = (e) => { state.cvd = e.target.checked; updateOverlay(); scheduleUpdate(); writeHash(); };
  $("rng-opacity").oninput = (e) => {
    state.opacity = +e.target.value;
    if (map.getLayer("overlay")) map.setPaintProperty("overlay", "raster-opacity", state.opacity);
  };
  $("btn-draw").onclick = () => setDrawMode(!draw.active);
  $("btn-clear").onclick = () => setBox(null);
  $("btn-layers").onclick = (e) => {
    const open = $("mapctl").classList.toggle("open");
    e.target.setAttribute("aria-expanded", String(open));
  };
  document.querySelectorAll("[data-preset]").forEach((b) => {
    b.onclick = () => {
      const box = PRESETS[b.dataset.preset];
      setBox(box);
      fitBox(box, 600);
    };
  });
  document.querySelectorAll("[data-ctx]").forEach((c) => {
    c.onchange = () => setContextVisible(c.dataset.ctx, c.checked);
  });
}

function palette() {
  return state.cvd ? store.meta.palettes.cvd : store.meta.palettes.nccos;
}

function renderLegend() {
  const el = $("legend");
  if (state.layer === "none") { el.innerHTML = ""; return; }
  const kind = store.meta.overlays[state.layer].legend;
  const pal = palette();
  let items;
  if (kind === "nccos_categories") {
    items = store.categories.map((c, i) => [pal[i], c]);
    items.push(["", "Lower → higher suitability for wind, relative within this layer"]);
  } else if (kind === "constraint") {
    items = [[pal[0], "Constrained: DoD exclusion or shipping fairway"]];
  } else {
    items = [[pal[0], "Zero (unsuitable)"], [pal[1], "Lowest fifth"], [pal[3], "Middle"], [pal[5], "Highest fifth"]];
    items.push(["", "Quintiles of non-zero scores"]);
  }
  el.innerHTML = items
    .map(([c, t]) => c
      ? `<div class="item"><span class="swatch" style="background:${c}"></span>${esc(t)}</div>`
      : `<div class="small muted">${esc(t)}</div>`)
    .join("");
}

// ------------------------------------------------------------------ map

function initMap() {
  // Esri basemaps: no API key; ocean base shows bathymetry. Confirm terms before public deployment (TODO.md).
  const esri = (svc) => `https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`;
  const sources = DARK
    ? { base: ["Canvas/World_Dark_Gray_Base"], ref: ["Canvas/World_Dark_Gray_Reference"] }
    : { base: ["Ocean/World_Ocean_Base"], ref: ["Ocean/World_Ocean_Reference"] };
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: Object.fromEntries(Object.entries(sources).map(([k, [svc]]) => [k, {
        type: "raster", tiles: [esri(svc)], tileSize: 256, maxzoom: 13,
        ...(k === "base" && { attribution: "Basemap: Esri, GEBCO, NOAA, National Geographic, Garmin, HERE and contributors" }),
      }])),
      layers: [
        { id: "base", type: "raster", source: "base" },
        { id: "ref", type: "raster", source: "ref" },
      ],
    },
    ...INITIAL_VIEW,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
  });
  // missing basemap tiles over open ocean are expected; log anything else
  map.on("error", (e) => { if (!e.tile) console.error("map:", e.error?.message || e); });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

  map.on("load", async () => {
    const [[s, w], [n, e]] = store.meta.overlay_bounds;
    map.addSource("overlay", {
      type: "image",
      url: overlayUrl(),
      coordinates: [[w, n], [e, n], [e, s], [w, s]],
    });
    map.addLayer({
      id: "overlay", type: "raster", source: "overlay",
      paint: { "raster-opacity": state.opacity, "raster-resampling": "nearest", "raster-fade-duration": 0 },
      layout: { visibility: state.layer === "none" ? "none" : "visible" },
    }, "ref"); // keep basemap place labels above the overlay

    const ctx = await fetch("data/context.geojson").then((r) => r.json());
    map.addSource("ctx", { type: "geojson", data: ctx });
    const ink = DARK ? "#f0efec" : "#0b0b0b";
    const lyr = (id, filter, type, paint, visible = true) => map.addLayer({
      id, type, source: "ctx", filter: ["==", ["get", "layer"], filter], paint,
      layout: { visibility: visible ? "visible" : "none" },
    });
    lyr("county", "county", "line", { "line-color": ink, "line-opacity": 0.35, "line-width": 1 }, false);
    lyr("cable", "cable", "line", { "line-color": "#6250d6", "line-width": 1.5, "line-opacity": 0.8 });
    lyr("call_area", "call_area", "line", { "line-color": ink, "line-opacity": 0.55, "line-width": 1 });
    lyr("wea", "wea", "line", { "line-color": ink, "line-width": 2.25 });

    portMarkers = ctx.features
      .filter((f) => f.properties.layer === "port")
      .map((f) => {
        const el = document.createElement("div");
        el.className = "portmarker";
        el.textContent = f.properties.name;
        return new maplibregl.Marker({ element: el, anchor: "left", offset: [-4, 0] })
          .setLngLat(f.geometry.coordinates).addTo(map);
      });

    map.addSource("box", { type: "geojson", data: emptyFC() });
    map.addSource("handles", { type: "geojson", data: emptyFC() });
    map.addLayer({ id: "box-fill", type: "fill", source: "box", paint: { "fill-color": DARK ? "#ffffff" : "#0b0b0b", "fill-opacity": 0.06 } });
    map.addLayer({ id: "box-line", type: "line", source: "box", paint: { "line-color": DARK ? "#ffffff" : "#0b0b0b", "line-width": 2 } });
    map.addLayer({
      id: "handles", type: "circle", source: "handles",
      paint: { "circle-radius": 6, "circle-color": DARK ? "#1a1a19" : "#ffffff", "circle-stroke-width": 2, "circle-stroke-color": DARK ? "#ffffff" : "#0b0b0b" },
    });

    renderLegend();
    initDrawing();
    if (state.box) {
      setBox(state.box);
      fitBox(state.box, 0);
    }
  });
}

// Keep the box clear of the floating control card (desktop) when zooming to it.
function fitBox(b, duration) {
  const ctl = $("mapctl").getBoundingClientRect();
  const wide = innerWidth > 860;
  const padding = { top: 60, bottom: 60, right: 60, left: wide ? ctl.width + 40 : 40 };
  if (!wide) padding.top = ctl.height + 30;
  map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding, duration });
}

let portMarkers = [];
function setContextVisible(id, on) {
  if (id === "port") { portMarkers.forEach((m) => (m.getElement().style.display = on ? "" : "none")); return; }
  if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
}

function overlayUrl() {
  const o = store.meta.overlays[state.layer] || store.meta.overlays.final;
  return "data/" + (state.cvd ? o.file_cvd : o.file);
}

function updateOverlay() {
  if (!map?.getSource("overlay")) return;
  if (state.layer === "none") {
    map.setLayoutProperty("overlay", "visibility", "none");
  } else {
    map.setLayoutProperty("overlay", "visibility", "visible");
    map.getSource("overlay").updateImage({ url: overlayUrl() });
  }
  renderLegend();
}

const emptyFC = () => ({ type: "FeatureCollection", features: [] });

// ------------------------------------------------------------------ box drawing / editing

const draw = { active: false, mode: null, start: null, corner: null, grab: null };

function setDrawMode(on) {
  draw.active = on;
  $("btn-draw").setAttribute("aria-pressed", String(on));
  $("btn-draw").textContent = on ? "Cancel drawing" : state.box ? "Draw a new box" : "Draw a box";
  $("hint").hidden = !on;
  map.getCanvas().style.cursor = on ? "crosshair" : "";
}

function normBox(a, b) {
  return [Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)];
}

function boxCorners([w, s, e, n]) {
  return [[w, s], [e, s], [e, n], [w, n]];
}

function setBox(box) {
  state.box = box;
  const fc = emptyFC(), hc = emptyFC();
  if (box) {
    const ring = boxCorners(box);
    fc.features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] } });
    ring.forEach((c, i) => hc.features.push({ type: "Feature", properties: { i }, geometry: { type: "Point", coordinates: c } }));
  }
  map.getSource("box")?.setData(fc);
  map.getSource("handles")?.setData(hc);
  $("btn-clear").disabled = !box;
  $("btn-draw").textContent = box ? "Draw a new box" : "Draw a box";
  writeHash();
  scheduleUpdate();
}

// Which corner (0..3) is within 12 px of the pointer, or -1.
function hitCorner(point) {
  if (!state.box) return -1;
  return boxCorners(state.box).findIndex((c) => {
    const p = map.project(c);
    return Math.hypot(p.x - point.x, p.y - point.y) < 12;
  });
}

function inBox(ll) {
  const b = state.box;
  return b && ll.lng >= b[0] && ll.lng <= b[2] && ll.lat >= b[1] && ll.lat <= b[3];
}

function initDrawing() {
  const begin = (e) => {
    if (e.originalEvent.touches?.length > 1) return;
    if (draw.active) {
      draw.mode = "draw";
      draw.start = e.lngLat;
    } else {
      const c = hitCorner(e.point);
      if (c >= 0) {
        draw.mode = "resize";
        draw.corner = boxCorners(state.box)[(c + 2) % 4]; // anchor = opposite corner
      } else if (inBox(e.lngLat)) {
        draw.mode = "move";
        draw.grab = { ll: e.lngLat, box: state.box.slice() };
      } else return;
    }
    e.preventDefault();
    map.dragPan.disable();
    hideTip();
  };

  const move = (e) => {
    if (!draw.mode) return hover(e);
    if (draw.mode === "draw") {
      setBox(normBox(draw.start, e.lngLat));
    } else if (draw.mode === "resize") {
      setBox(normBox({ lng: draw.corner[0], lat: draw.corner[1] }, e.lngLat));
    } else if (draw.mode === "move") {
      const dx = e.lngLat.lng - draw.grab.ll.lng, dy = e.lngLat.lat - draw.grab.ll.lat;
      const [w, s, ee, n] = draw.grab.box;
      setBox([w + dx, s + dy, ee + dx, n + dy]);
    }
  };

  const end = () => {
    if (!draw.mode) return;
    const wasDraw = draw.mode === "draw";
    draw.mode = null;
    map.dragPan.enable();
    if (wasDraw) {
      setDrawMode(false);
      // a click without a drag makes a degenerate box: discard it
      const b = state.box;
      if (b && (b[2] - b[0] < 0.002 || b[3] - b[1] < 0.002)) setBox(null);
    }
  };

  map.on("mousedown", begin);
  map.on("touchstart", begin);
  map.on("mousemove", move);
  map.on("touchmove", move);
  // listen on window too, so releasing the mouse outside the map still ends the drag
  addEventListener("mouseup", end);
  map.on("touchend", end);
  map.getCanvas().addEventListener("mouseleave", hideTip);
  addEventListener("keydown", (e) => { if (e.key === "Escape" && draw.active) setDrawMode(false); });
}

// ------------------------------------------------------------------ hover readout

let hoverQueued = null;
function hover(e) {
  if (draw.active) return;
  const canvas = map.getCanvas();
  canvas.style.cursor = hitCorner(e.point) >= 0 ? "nwse-resize" : inBox(e.lngLat) ? "move" : "";
  if (hoverQueued) { hoverQueued = e; return; }
  hoverQueued = e;
  requestAnimationFrame(() => {
    const ev = hoverQueued;
    hoverQueued = null;
    showTip(ev);
  });
}

function showTip(e) {
  const i = store.nearest(e.lngLat.lng, e.lngLat.lat);
  const tip = $("tip");
  if (i < 0) return hideTip();
  const c = store.col;
  const layer = state.layer === "none" ? "final" : state.layer;
  const label = store.meta.overlays[layer].label;
  const cat = c[`${layer}_cat`] ? store.categories[c[`${layer}_cat`][i]] : null;
  const val = layer === "constraint"
    ? (c.constraint[i] === 0 ? "Constrained" : "Not constrained")
    : `${cat ? cat + " · " : ""}${store.score(layer, i).toFixed(3)}`;
  const port = store.meta.ports[c.port_idx[i]].port;
  tip.innerHTML = `<b>${esc(label)}</b><div style="margin:2px 0 6px">${esc(val)}</div>` +
    `<div class="row"><span>Depth</span><span>${c.depth_m[i]} m</span></div>` +
    `<div class="row"><span>To shore</span><span>${fmt.km(c.shore_km[i] / 10)} km</span></div>` +
    `<div class="row"><span>Nearest port</span><span>${esc(port)} · ${fmt.km(c.port_km[i] / 10)} km</span></div>`;
  const { x, y } = e.point;
  const w = map.getCanvas().clientWidth;
  tip.style.left = `${x + 260 > w ? x - 252 : x + 14}px`;
  tip.style.top = `${y + 14}px`;
  tip.hidden = false;
}

function hideTip() { $("tip").hidden = true; }

// ------------------------------------------------------------------ panels

let updateQueued = false;
function scheduleUpdate() {
  if (updateQueued) return;
  updateQueued = true;
  requestAnimationFrame(() => { updateQueued = false; renderPanels(); });
}

function boxKm2([w, s, e, n]) {
  const mid = ((s + n) / 2) * (Math.PI / 180);
  return (e - w) * 111.32 * Math.cos(mid) * (n - s) * 110.57;
}

function renderPanels() {
  const box = state.box;
  $("empty").hidden = !!box;
  $("results").hidden = !box;
  if (!box) return;
  const r = store.summarize(box);
  const coverage = Math.min(1, r.km2 / boxKm2(box));
  renderFootprint(r, box, coverage);
  renderMix(r);
  renderFishing(r);
  renderPorts(r);
  renderCounties(r);
  renderCapacity(r);
}

function tile(label, value, unit = "") {
  return `<div class="tile"><div class="label">${label}</div><div class="value">${value} <span class="unit">${unit}</span></div></div>`;
}

function renderFootprint(r, box, coverage) {
  const totalKm2 = boxKm2(box);
  $("tiles").innerHTML =
    tile("Box area", fmt.int(totalKm2), "km²") +
    tile("Modelled area", fmt.int(r.km2), `km² · ${fmt.int(r.acres)} ac`) +
    tile("Constrained", r.hexes ? fmt.pct(r.share.constrained) : "–", "of modelled") +
    tile("Depth", r.hexes ? `${fmt.int(r.depth.min)}–${fmt.int(r.depth.max)}` : "–", "m");

  const note = $("coverage-note");
  if (!r.hexes) {
    note.className = "note warn";
    note.textContent = "This box is outside the NOAA model's coverage (2022 Coos Bay and Brookings Call Areas). Coast-wide data is planned.";
  } else if (coverage < 0.95) {
    note.className = "note warn";
    note.textContent = `Only ${fmt.pct(coverage)} of the box is covered by the model; results describe that part.`;
  } else {
    note.className = "note";
    note.textContent = `${fmt.int(r.hexes)} ten-acre cells analysed.`;
  }

  $("facts").innerHTML = !r.hexes ? "" : [
    ["Distance to shore", `${fmt.km(r.shoreKm.min)}–${fmt.km(r.shoreKm.max)} km`],
    ["Nearest port (straight line)", `${fmt.km(r.portKm.min)} km`],
    ["Inside 2024 WEAs", fmt.pct(r.share.inWEA)],
    ["In NCCOS high-suitability clusters", fmt.pct(r.share.inHighHighCluster)],
    ["Mean depth", `${fmt.int(r.depth.mean)} m${r.depth.mean > 60 ? " · floating foundations" : ""}`],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

const MIX_ROWS = [
  ["final", "Overall"],
  ["fisheries", "Fisheries"],
  ["industry", "Industry & ops"],
  ["natres", "Natural resources"],
  ["wind", "Wind resource"],
  ["birds", "Marine birds"],
];

function segBar(counts, total) {
  const pal = palette();
  return `<div class="seg">` + counts.map((n, i) => n
    ? `<div style="flex:${n};background:${pal[i]}" title="${store.categories[i]}: ${fmt.pct(n / total)}"></div>`
    : "").join("") + `</div>`;
}

function renderMix(r) {
  if (!r.hexes) { $("mix").innerHTML = `<p class="small muted">No model data in this box.</p>`; $("mix-legend").innerHTML = ""; return; }
  $("mix").innerHTML = MIX_ROWS.map(([key, label]) =>
    `<div class="mixrow"><span>${label}</span>${segBar(r.categoryMix[key], r.hexes)}</div>`).join("");
  const pal = palette();
  $("mix-legend").innerHTML = store.categories.map((c, i) =>
    `<span class="item"><span class="swatch" style="background:${pal[i]}"></span>${c}</span>`).join("");
}

function renderFishing(r) {
  if (!r.hexes) { $("fishing").innerHTML = `<p class="small muted">No model data in this box.</p>`; return; }
  const share = r.fishingCore.shareOfCallAreas;
  const inBoxShare = r.fishingCore.hexes / r.hexes;
  $("fishing").innerHTML =
    `<div class="hero">${fmt.pct(share)}</div>` +
    `<div class="hero-sub">of the Call Areas' most important fishing grounds fall in this box</div>` +
    `<div class="meter" role="img" aria-label="${fmt.pct(share)}"><div style="width:${Math.max(share * 100, 0.5)}%"></div></div>` +
    `<p class="small muted">${fmt.pct(inBoxShare)} of the box is in NCCOS's top fishing-importance class, built from 9 fisheries ` +
    `(bottom trawl, at-sea and shoreside hake, pink shrimp, fixed-gear pot, longline, commercial and charter albacore, Dungeness crab). ` +
    `It is a relative index, not dollars: per-fishery revenue maps are needed for that.</p>`;
}

function renderPorts(r) {
  const el = $("ports");
  const counts = Object.entries(r.nearestPorts).sort((a, b) => b[1] - a[1]);
  if (!counts.length) { el.innerHTML = `<p class="small muted">No model data in this box.</p>`; return; }

  const groups = {};
  for (const [port, n] of counts) {
    const g = store.meta.ports.find((p) => p.port === port).odfw_group;
    groups[g] = (groups[g] || 0) + n;
  }
  const order = Object.keys(groups).sort((a, b) => groups[b] - groups[a]);
  if (!order.includes(state.portTab)) state.portTab = order[0];
  const g = econ.port_groups[state.portTab];
  const fish = Object.entries(g.by_fishery).filter(([, v]) => v.usd > 0).sort((a, b) => b[1].usd - a[1].usd);
  const max = fish[0][1].usd;
  const title = (s) => s.toLowerCase().replace(/(^|[\s-])\w/g, (m) => m.toUpperCase());

  el.innerHTML =
    `<p class="small muted">Closest port for each cell in the box (straight line):</p>` +
    `<div class="tabs" role="tablist">` + order.map((k) =>
      `<button class="chip" role="tab" aria-selected="${k === state.portTab}" data-group="${esc(k)}">${esc(title(k))} · ${fmt.pct(groups[k] / r.hexes)}</button>`).join("") + `</div>` +
    `<div class="small" style="margin-top:8px"><b>${esc(econ.port_groups[state.portTab].ports.join(", "))}</b> landed ` +
    `<b>${fmt.usd(g.usd_2024)}</b> ex-vessel in 2024, from all fishing areas:</div>` +
    `<div class="bars">` + fish.map(([k, v]) =>
      `<div class="bar" title="${esc(econ.fishery_labels[k])}: ${fmt.usd(v.usd)} · ${fmt.int(v.pounds)} lb">` +
      `<span>${esc(econ.fishery_labels[k])}</span><div class="track"><div class="fill" style="width:${(v.usd / max) * 100}%"></div></div>` +
      `<span class="val">${fmt.usd(v.usd)}</span></div>`).join("") + `</div>` +
    `<p class="small muted">Shows what this port depends on overall, not revenue caught inside the box. Fleets often fish far from their home port.</p>`;

  el.querySelectorAll("[data-group]").forEach((b) => (b.onclick = () => { state.portTab = b.dataset.group; renderPorts(r); }));
}

function renderCounties(r) {
  const el = $("counties");
  const fipsSet = new Set();
  for (const port of Object.keys(r.nearestPorts)) fipsSet.add(store.meta.ports.find((p) => p.port === port).county_fips);
  const fips = [...fipsSet].map(String).sort();
  if (!fips.length) { el.innerHTML = `<p class="small muted">No model data in this box.</p>`; return; }

  const get = (f, code, source) => econ.counties[f]?.find((x) => x.code === code && x.source.startsWith(source));
  const noisy = (row) => row && ["J", "D", "S"].includes(row.flag);
  const num = (row, field, f = fmt.int) =>
    !row || row[field] == null ? "–" : (noisy(row) ? "~" : "") + f(row[field]);
  const sum = (rows, field) => rows.every((x) => x?.[field] == null) ? null : rows.reduce((a, x) => a + (x?.[field] || 0), 0);

  const rows = [
    ["Fishing businesses, self-employed", (f) => num(get(f, "1141", "NES"), "estab")],
    ["Their receipts", (f) => num(get(f, "1141", "NES"), "receipts_k", (v) => fmt.usd(v * 1000))],
    ["Fishing businesses with employees", (f) => num(get(f, "1141", "CBP"), "estab")],
    ["Seafood processing jobs", (f) => num(get(f, "3117", "CBP"), "emp")],
    ["Lodging & food service jobs", (f) => {
      const v = sum([get(f, "7211", "CBP"), get(f, "722", "CBP")], "emp");
      return v == null ? "–" : fmt.int(v);
    }],
    ["All jobs at employers", (f) => num(get(f, "------", "CBP"), "emp")],
  ];
  const name = (f) => econ.counties[f]?.[0]?.county ?? f;
  el.innerHTML =
    `<p class="small muted">Counties of the ports above. Most fishing businesses are self-employed, so both counts matter.</p>` +
    `<table class="kv"><thead><tr><th></th>${fips.map((f) => `<th>${esc(name(f))}</th>`).join("")}</tr></thead><tbody>` +
    rows.map(([label, fn]) => `<tr><th>${label}</th>${fips.map((f) => `<td>${fn(f)}</td>`).join("")}</tr>`).join("") +
    `</tbody></table><p class="small muted">Census CBP &amp; Nonemployer Statistics 2023. "~" = high Census noise; "–" = not published.</p>`;
}

function renderCapacity(r) {
  const el = $("capacity");
  const mw = r.unconstrainedKm2 * state.density;
  el.innerHTML =
    `<div class="hero">${fmt.int(mw)} <span class="unit" style="font-size:14px;font-weight:400">MW</span></div>` +
    `<div class="hero-sub">if the ${fmt.int(r.unconstrainedKm2)} km² of unconstrained area were built at ${state.density} MW/km²</div>` +
    `<div class="slider-row"><span>Density</span><input id="rng-density" type="range" min="2" max="6" step="0.5" value="${state.density}"><span>${state.density} MW/km²</span></div>` +
    `<p class="small muted">≈${fmt.int(mw * 1e3 * 8760 * 0.45 / 1e6 / 10.5)}k Oregon homes at a 45% capacity factor and 10.5 MWh/home/yr. Illustrative only; ` +
    `job and spending estimates come in a later version.</p>`;
  $("rng-density").oninput = (e) => { state.density = +e.target.value; renderCapacity(r); };
}

boot().catch((err) => {
  console.error(err);
  $("empty").innerHTML = `<h2>Couldn't load data</h2><p class="small">Run <code>make build</code> and serve <code>web/</code> over HTTP (<code>make serve</code>).</p>`;
});
