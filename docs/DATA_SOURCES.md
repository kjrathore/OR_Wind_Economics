# Data sources

Machine-readable manifest: [`pipeline/sources.yaml`](../pipeline/sources.yaml).
Exact bytes used in a build: `data/raw/MANIFEST.lock.json` (sha256 per file).
State as of **2026-11-02**.

## In the pipeline now (all public)

| Source | Gives us | Vintage | Coverage | License |
|---|---|---|---|---|
| **NCCOS Oregon WEA siting analysis** — NCEI 0306723, [doi:10.25921/hwtb-xm63](https://doi.org/10.25921/hwtb-xm63) | 117,300 × 10-acre hexes with final suitability + 5 submodels (constraints, industry/ops, natural resources, fisheries, wind/LCOE) and combined layers (birds, habitats, protected species, surveys); Call Areas; WEAs; high-high clusters | model 2023; inputs 2014–2024 | **BOEM 2022 Call Areas only** (Coos Bay, Brookings) | CC0 |
| **ODFW commercial landings by port group**, 2024 final ([ODFW](https://www.dfw.state.or.us/fish/commercial/landing_stats/)) | Pounds + ex-vessel $ by species for 8 port groups; 10-yr statewide table | 2024 (2015–24) | Oregon ports | Public agency report |
| **NOAA FOSS** commercial landings ([FOSS](https://www.fisheries.noaa.gov/foss)) | Statewide species × year $ / lbs | 2015–2024 | Oregon | Public domain |
| **Census County Business Patterns 2023** | Employer establishments, employment, payroll by NAICS | 2023 | 7 coastal counties | Public domain |
| **Census Nonemployer Statistics 2023** | Self-employed businesses + receipts (most fishing operations are nonemployers) | 2023 | 7 coastal counties | Public domain |
| **Census cartographic counties 1:500k** | County outlines, land mask for distance-to-shore | 2023 | US | Public domain |
| **ETOPO1 via CoastWatch ERDDAP** | Depth at each hex (bilinear, 1-arcmin ≈ 1.8 km) | 2009 | 41.8–46.4N | Public domain |
| **MarineCadastre submarine cables** | Existing cable corridors | per metadata | US | Public domain |
| `pipeline/ports.csv` (hand-curated) | 12 port locations → ODFW port group → county | — | Oregon | approximate coordinates; verify vs USGS GNIS |

### Checks performed on build
- NCCOS WEA acreage from hex counts: Coos Bay 60,820 ac (published 61,204), Brookings 157,860 ac
  (published 158,364). Call Areas: 872,130 / 285,940 ac (published 872,852 / 286,443).
- ODFW parser: species rows must sum to each report's grand total (assertion in `build_econ.py`).
  2024 total across 8 port groups: $178.6 M ex-vessel.

## Known gaps (what v0 cannot answer)

| Gap | Effect | Planned fix |
|---|---|---|
| NCCOS grid covers only the 2022 Call Areas | Boxes drawn elsewhere (e.g. off Newport, Astoria) get no suitability/fisheries scores | Coast-wide analysis grid (H3) with depth, distance, cables, fishing effort — see PLAN Phase 2 |
| Fisheries are a single combined *relative* score | Can't say "X% of crab revenue is inside this box" | Per-fishery effort/revenue maps (ODFW effort layers 2002–2021 published via OROWindMap; NCCOS per-fishery ranked-importance inputs, "unpublished") |
| Port ↔ fishing-ground link is unknown | Nearest-port is a crude proxy; boats travel far | Port-of-landing by area from PacFIN/logbooks (restricted) or fleet-home-port surveys |
| ETOPO1 depth is coarse | Fine for fixed vs floating screening, not engineering | ETOPO 2022 15-arcsec or NOAA CRM via NCEI THREDDS |
| No tourism/recreation spatial data | Charter/rec fishing, viewshed, beach visitation missing | ODFW charter effort; NOAA ENOW tourism sector; viewshed from DEM |
| No transmission/grid interconnection data | Can't show cable landing + substation options | BPA public maps, HIFLD successors, NREL 2019 Oregon cost study points |
| No tribal/cultural layers | Roadmap names these as standards | Only through tribal partnership and consent — not scraped |

## Access attempts that failed (for the record)

- **BOEM GeoSEAS ArcGIS REST** (`geoseas.boem.gov/.../PAC/NCCOS_*_Oregon_2023`) — metadata is
  reachable but `/query` returns 403 from the Azure gateway for scripted clients, and the ArcGIS Hub
  download API proxies the same backend ("Forbidden"). We did **not** try to work around this; the
  NCEI archive above is the authoritative, citable copy of the same data.
- **West Coast Ocean Data Portal / OROWindMap catalog** (`offshore.ecotrust.org`, `prod.wcoa.ecotrust.org`)
  — connection refused on 2026-11-02. Contact for data: portal.westcoastoceans@sccwrp.org (per BOEM).
- **NOAA FOSS** range queries (`$gte`) are rejected (403); per-year queries work and are used.
- **Census Data API** now returns an error page without a key; bulk county files are used instead.
- **NOAA ENOW** bulk download URL not located (app-only "QuickReport"); planned.

## Policy & reference documents (not data)

- DLCD Oregon Offshore Wind Energy Roadmap (HB 4080), final 2026-07-24 — https://www.oregon.gov/lcd/ocmp/pages/offshore-wind-roadmap.aspx
- BOEM 2024-015, *A wind energy area siting analysis for the Oregon Call Areas* — https://www.boem.gov/sites/default/files/documents/environment/BOEM_2024-015.pdf
- NREL (2016) *Floating Offshore Wind in Oregon: Potential for Jobs and Economic Impacts* — https://www.osti.gov/biblio/1251591
- NREL (2019) *Oregon Offshore Wind Site Feasibility and Cost Study* — https://docs.nrel.gov/docs/fy20osti/74597.pdf
- OROWindMap update, Feb 2022 (last dated layer update found) — https://boem.gov/regions/pacific-ocs-region/renewable-energy/orowindmapupdate
