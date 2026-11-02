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

## Phase 1 — MVP dashboard
- [ ] **P1** `web/index.html`: MapLibre (or Leaflet) basemap, PNG overlays, context layers, legend
- [ ] **P1** Draw/drag rectangle → `HexStore.summarize` → live footprint panel
- [ ] **P1** Port panel: nearest ports' 2024 revenue by fishery (ODFW), tagged "context"
- [ ] **P1** County panel: fishing employers + nonemployers, seafood processing, tourism vs totals
- [ ] "Outside model coverage" message + share of box covered
- [ ] Preset boxes: 2024 Coos Bay WEA, Brookings WEA, a pilot-scale (~15 km²) example
- [ ] Methods & caveats page generated from `hex.json` / `sources.yaml` citations
- [ ] Mobile layout check; accessibility (colour-blind safe legend alongside NCCOS colours)
- [ ] Usability pass with 2–3 non-GIS colleagues

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
