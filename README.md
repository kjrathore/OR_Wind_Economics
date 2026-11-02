# ORWind_dash — Oregon offshore wind × coastal economies

An academic research dashboard (Oregon State University) that lets coastal community members
**draw a box where a wind farm might go and immediately see what is there** — siting
suitability, fishing importance, depth and distance, and the ports and county economies that
depend on that ocean space.

It complements, not replaces, [OROWindMap](https://offshorewind.westcoastoceans.org/), which shows
layers but doesn't translate a footprint into community-level consequences.

> Status: **v0 data foundation.** Pipeline, data and fast query engine are in place; the
> interactive map UI is next. See [TODO.md](TODO.md) and [docs/PLAN.md](docs/PLAN.md).

## Quick start

```bash
make setup     # Python venv + pinned deps (requirements.txt)
make fetch     # download public sources -> data/raw/   (~800 MB, one time)
make build     # data/raw -> data/processed/ + web/data/ (~35 s)
make bench     # in-browser query latency check (Node 18+)
make serve     # static preview at http://localhost:8000
```

## Layout

```
pipeline/
  sources.yaml      every data source: URL, license, vintage, coverage, citation
  fetch.py          downloads public sources, writes data/raw/MANIFEST.lock.json (sha256)
  build_hex.py      NCCOS 10-acre hex grid -> hex.parquet, hex.bin (browser), PNG overlays
  build_econ.py     ODFW port landings, NOAA FOSS, Census CBP/NES -> econ tables
  build_context.py  Call Areas, WEAs, counties, ports, cables -> context.geojson
  ports.csv         port locations + ODFW port-group mapping (hand-curated)
web/
  src/hexstore.js   in-memory footprint query engine (browser + Node)
  bench/            latency benchmark
  data/             build output served to the browser (gitignored)
data/               raw + processed data (gitignored; reproducible via make)
docs/               PLAN, DATA_SOURCES, DATA_POLICY
```

## Why it's fast

All map data are pre-computed offline and shipped as static files: a 0.9 MB (gzipped)
packed grid of 117,300 hexes plus pre-rendered layer images. A drawn box is answered by
scanning that grid in the browser — **~0.6 ms median, <8 ms p95** — with no calls to remote
GIS servers. Deployment is plain static hosting.

## Data & ethics

Public, aggregated data only. See [docs/DATA_POLICY.md](docs/DATA_POLICY.md) before adding any
source, and [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) for citations and known gaps.
Outputs are for research and public discussion — **not** regulatory, legal or navigational use.
