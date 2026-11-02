# TODO

Legend: `[x]` done · `[ ]` open · **P1** next up · (R) needs restricted-data request

## Phase 0 — Foundation ✅ (2026-11-02)
- [x] Git repo, Makefile, pinned Python deps, `.gitignore` keeps data out of git
- [x] `pipeline/sources.yaml` manifest + `fetch.py` with sha256 lock file
- [x] NCCOS Oregon 2023 hex grid from NCEI archive (CC0) → `hex.parquet`, `hex.bin`, 10 PNG overlays
- [x] Depth (ETOPO1), distance to shore, nearest port per hex
- [x] ODFW 2024 port-group landings parsed (with total check), FOSS 2015–2024, CBP + NES 2023
- [x] Context layers: Call Areas, WEAs, coastal counties, ports, cables
- [x] `HexStore` in-memory query engine + benchmark (p50 0.6 ms, p95 < 8 ms)
- [x] Docs: README, PLAN, DATA_SOURCES, DATA_POLICY

## Phase 1 — MVP dashboard (in progress, 2026-11-02)
- [x] `web/index.html`: MapLibre 4.7.1, Esri ocean basemap, pre-rendered overlays, context layers, legend
- [x] Draw / move / resize box (corner handles) → live footprint panel; shareable URL (`#box=…&layer=…`)
- [x] Hover readout: layer value, depth, distance to shore, nearest port
- [x] Siting suitability category mix per submodel (overall, fisheries, industry, natural resources, wind, birds)
- [x] Fishing-grounds relative index (share of Call Areas' top fishing-importance cells)
- [x] Port panel: 2024 ODFW revenue by fishery for nearest port groups, tagged "context"
- [x] County panel: fishing employers + nonemployers, seafood processing, lodging/food, total jobs
- [x] Capacity scenario (MW/km² slider, homes equivalent)
- [x] "Outside model coverage" / partial-coverage messages
- [x] Presets: 2024 Coos Bay WEA, Brookings WEA, pilot-scale (~17 km²)
- [x] Methods & caveats page; evidence tags (measured / modelled / context / scenario)
- [x] Colour-blind-safe palette toggle (validated one-hue ramp); dark mode; phone layout with Layers toggle
- [ ] **P1** Usability pass with 2–3 non-GIS colleagues; fix wording
- [ ] **P1** Confirm basemap terms for public deployment (Esri tiles) or self-host a PMTiles basemap
- [ ] Keyboard-accessible box entry (type coordinates / pick a preset size) — map dragging isn't keyboard-friendly
- [ ] Table view / CSV download of the footprint summary
- [ ] Compare two boxes side by side (moved up from Phase 3 if users ask for it)
- [ ] Vendor MapLibre locally (no CDN) for OSU hosting
- [ ] Automated browser smoke test (headless Chrome via DevTools protocol) in CI

## Phase 2 — Coast-wide coverage
- [ ] Coast-wide H3 grid (res 8 ≈ 0.74 km²) from Columbia River to California border, 0–1,300 m depth
- [ ] Better bathymetry: ETOPO 2022 15-arcsec or NOAA Coastal Relief Model (NCEI THREDDS)
- [ ] Shipping fairways (USCG PAC-PARS), danger zones, existing cables, MPAs/marine reserves (MarineCadastre)
- [ ] AIS vessel transit counts (MarineCadastre AIS Vessel Transit Counts) for Oregon
- [ ] Public ODFW fishery effort layers (crab 2007–20, albacore, bottom trawl, hagfish, rec bottomfish) — contact WCODP admin (portal.westcoastoceans@sccwrp.org); portal offline 2026-11-02
- [ ] Spatial index in `HexStore` if p95 > 16 ms after grid grows; PMTiles for overlays

## Phase 3 — Economics v1
- [ ] Per-fishery exposure method (PLAN §5.2) with ODFW public effort layers
- [ ] Multi-year ranges: parse ODFW port PDFs for 2015–2023 (same FTR205 format) — add years to sources.yaml
- [ ] NOAA Social Indicators for Coastal Communities (fishing engagement/reliance) — find bulk download
- [ ] NOAA ENOW county ocean economy (tourism & recreation, living resources) — locate bulk file
- [ ] Capacity slider (MW/km²) + NREL 2016 jobs scaling with in-state-content slider
- [ ] Compare two footprints side by side; export a one-page PDF/PNG summary
- [ ] Verify `ports.csv` coordinates against USGS GNIS; add Columbia River ports if relevant
- [ ] Unit tests: ODFW parser on a known year, HexStore against geopandas spatial join

## Phase 4 — Community testing & deployment
- [ ] OSU IRB determination for community feedback sessions (before any recorded input)
- [ ] Partners: Oregon Sea Grant extension, port districts, fishermen's associations, OPAC liaison
- [ ] Tribal engagement only via consent-based partnership (CTCLUSI, Coquille, Siletz, Tolowa Dee-ni')
- [ ] Hosting: OSU static web space / OSU VM with Nginx; HTTPS; gzip/brotli for `.bin`
- [ ] CI: rebuild + bench on push (GitHub Actions), data from cache

## Phase 5 — Restricted data (R)
- [ ] (R) PacFIN data access for port × fishery × area revenue — via PSMFC agreement
- [ ] (R) NMFS VMS / ODFW logbooks aggregated to grid, rule-of-3 screened
- [ ] (R) NCCOS per-fishery ranked-importance inputs + DoD exclusion geometry (listed "unpublished")
- [ ] Store restricted data outside repo; add disclosure-check script before any export

## Open questions for advisor
- Target audience priority: fishers vs. county planners vs. legislators (drives UI language)?
- Is a pilot-scale footprint (Roadmap pathway 4) the main use case to optimise for?
- Any existing OSU agreements for PacFIN / ODFW logbook data we can join?
