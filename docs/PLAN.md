# Plan

## 1. Goal

Give Oregon coastal community members (fishers, port managers, county staff, tribal members,
residents) a way to **ask "what if a wind farm were here?" and get an answer in seconds**:
what the ocean space is used for, which ports and fisheries depend on it, and what economic
upside or downside is plausible — with sources and uncertainty shown honestly.

Research questions this tool supports:
1. How does the economic exposure of individual ports differ between candidate footprints?
2. Where do siting suitability (NCCOS) and community economic dependence disagree?
3. What data would most reduce uncertainty for communities (value of information)?

## 2. Policy context (Nov 2026)

- BOEM rescinded all Wind Energy Areas, incl. Coos Bay and Brookings, in July 2025. No federal
  leasing in Oregon is active.
- DLCD's Offshore Wind Energy Roadmap (HB 4080) was finalized 2026-07-24 and goes to the 2027
  Legislature. Four pathways: no offshore wind, full-scale, economic participation without hosting,
  pilot project. It sets standards (community, economy, workforce, tribes) but has no spatial
  impact model.
- OPAC began the Territorial Sea Plan review in Nov 2026 (up to 9 meetings through Aug 2027).
- **Implication:** the tool should be pathway-neutral, support *comparing* footprints
  (including "pilot-scale" ones), and be ready for OPAC / 2027 session conversations.

## 3. What v0 can and cannot say

| Question | v0 (public data) | Needs |
|---|---|---|
| How big is my box, how deep, how far from shore/port? | ✅ anywhere in Call Areas | coast-wide grid for elsewhere |
| How suitable is it per NCCOS, and why (which submodel drags it down)? | ✅ Call Areas | — |
| Is it in the DoD exclusion / shipping fairway? | ✅ Call Areas | — |
| How important is it for fishing, relative to the rest of the Call Area? | ✅ relative index | per-fishery maps for absolute $ |
| Which ports' fleets likely fish there, and what are those ports' landings? | ⚠️ context only (nearest port + ODFW port revenue) | port-of-landing by area (restricted) |
| How many $ of crab/hake/albacore revenue is inside the box? | ❌ | per-fishery effort/revenue maps |
| Jobs / local spending from building it? | ⚠️ scenario-scaled from NREL 2016 | updated I-O model (IMPLAN license or open alternative) |

The app must label each number with its tier: **measured**, **modelled (relative)**, or **scenario**.

## 4. Architecture

```
public sources ──fetch.py──> data/raw ──build_*.py──> web/data (static) ──> browser app
   (sources.yaml)            (sha256 lock)           hex.bin  hex.json            HexStore (in-memory)
                                                     layers/*.png                 map + draw box
                                                     econ.json context.geojson    panels/charts
```

- **No runtime dependency on remote GIS servers.** Remote services (BOEM GeoSEAS, WCODP) were
  slow, blocked, or offline in testing; every layer is pre-fetched and pre-computed.
- **Static deploy.** `web/` is plain HTML/JS + data files — any OSU static host, Nginx on an OSU
  VM, or GitHub Pages works. No database, no backend to maintain.
- **Latency budget:** first load < 2 s on campus Wi-Fi (≈1.0 MB total gzipped today);
  box → results < 16 ms (one frame) so results update *while dragging*.
  Measured: summarize p50 0.6 ms, p95 7.7 ms over 117k hexes (`make bench`).
- If data grows (coast-wide grid, many layers): add a coarse spatial index (grid buckets) in
  `HexStore`, split columns into lazily-loaded files, and serve overlays as PMTiles.

## 5. Methods

### 5.1 Footprint metrics (v0)
For hexes whose centroid is inside the box: count × 10 acres; mean and category mix of each
NCCOS score; % constrained; % overlapping 2024 WEAs and high-high clusters; depth min/mean/max;
distance to shore and to nearest port. Report "outside model coverage" for the rest of the box.

### 5.2 Fishing exposure (v0 → v1)
- **v0 relative index:** share of the Call Area's *most important fishing cells* (NCCOS fisheries
  submodel category "Low" suitability = high fishing importance) that the box captures. Unitless.
- **v1 revenue exposure:** for each fishery *f* with a public effort/revenue surface *Eₓ,f*:
  `share_f = Σ_box E_f / Σ_coast E_f`;  `exposed_$_{p,f} = share_f × Revenue_{p,f}`,
  where `Revenue_{p,f}` is ODFW port-group revenue. Assumes the box's effort is landed in ports in
  proportion to statewide landings for that fishery — a strong assumption, stated in the UI,
  replaced by port-of-landing data when available (restricted; §DATA_POLICY).
- Show ranges, not points: use multi-year (2015–2024 FOSS) min/max for revenue.

### 5.3 Community dependence (v0)
Per county: commercial fishing nonemployers + employers, seafood processing employment,
accommodation & food services, versus county totals (CBP/NES 2023). Pair with NOAA Social
Indicators (fishing engagement/reliance) in v1.

### 5.4 Benefits side (scenario, v1)
Capacity from area (MW = acres × density, default ~3 MW/km², slider). Jobs and GDP scaled from
NREL 2016 Oregon scenarios with an in-state-content slider; cost context from NREL 2019 Oregon
cost study. Always labelled *scenario*, never *forecast*.

### 5.5 Validation
- Re-derive published WEA acreages from hexes (done: within 0.7%).
- Re-create one NCCOS map figure from our overlays (visual check, done for final/fisheries).
- Compare v1 exposure numbers with BOEM 2024-015 and any EA fisheries figures.
- Community review sessions (IRB) for usability and meaning — see TODO Phase 4.

## 6. Phases

| Phase | Output | Exit criterion |
|---|---|---|
| **0 — Foundation** ✅ | repo, pipeline, public data, fast query engine, docs | `make all` reproduces everything; bench < 16 ms p95 |
| **1 — MVP dashboard** | map + draw box + footprint panel + port/county panels + layer toggles + methods page | non-GIS user answers "what's in this box?" in < 1 min |
| **2 — Coast-wide** | H3 grid for whole Oregon shelf: depth, distance, cables, fairways, public fishing effort | boxes anywhere off Oregon return data |
| **3 — Economics v1** | per-fishery revenue exposure, multi-year ranges, jobs scenarios, compare 2 boxes, export PDF | method note reviewed by advisor |
| **4 — Community testing & deploy** | IRB-approved sessions, fixes, OSU hosting | deployed URL, feedback summary |
| **5 — Restricted-data upgrade** | DUA data integrated with confidentiality checks | outputs pass DATA_POLICY §3 |

## 7. Risks

| Risk | Mitigation |
|---|---|
| Over-precise numbers mislead communities | Tier labels, ranges, prominent caveats, methods page |
| Seen as advocacy for/against wind | Pathway-neutral language; show costs and benefits side by side; cite sources |
| Public data is old (fishing 2002–2021) | Show vintage on every panel; prioritize data requests |
| Remote data sources disappear (WCODP already offline) | Everything archived locally with sha256 lock; prefer NCEI/DOI sources |
| Confidential data leaks via outputs | DATA_POLICY §3 checks before anything restricted-derived ships |
