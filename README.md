# OR_Wind_Economics — Oregon offshore wind × coastal economies

An academic research dashboard (Oregon State University) that lets coastal community members
**draw a box where a wind farm might go and immediately see what is there** — siting
suitability, fishing importance, depth and distance, and the ports and county economies that
depend on that ocean space.

It complements, not replaces, [OROWindMap](https://offshorewind.westcoastoceans.org/), which shows
layers but doesn't translate a footprint into community-level consequences.

> Status: **Phase 1 MVP.** Map with draw/move/resize box, live footprint, suitability, fishing,
> port, county and capacity panels. See [TODO.md](TODO.md) and [docs/PLAN.md](docs/PLAN.md).

## Quick start

```bash
git clone git@github.com:kjrathore/OR_Wind_Economics.git && cd OR_Wind_Economics
make setup     # Python venv + pinned deps (requirements.txt)
make fetch     # download public sources -> data/raw/   (~800 MB, one time)
make build     # data/raw -> data/processed/ + web/data/ (~35 s)
make bench     # in-browser query latency check (Node 18+)
make serve     # open http://localhost:8000
```

Conda instead of venv: `conda env create -f environment.yml && conda activate orwind`, then
`make fetch build PY=python`.

## Deploy

The site is static: `web/` plus the built `web/data/` (~6 MB, public data only, committed to `main`).
Every push to `main` that touches `web/` publishes it to https://kjrathore.github.io/OR_Wind_Economics/
via [.github/workflows/pages.yml](.github/workflows/pages.yml). CI doesn't build anything. After a
data change, run `make build` locally and commit `web/data/`. Any static host works the same way, an
OSU server included: copy `web/` without `bench/`.

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
  index.html        the dashboard (static; no build step)
  methods.html      methods & caveats shown to users
  src/app.js        map, box drawing, panels
  src/hexstore.js   in-memory footprint query engine (browser + Node)
  bench/            latency benchmark
  data/             build output served to the browser (gitignored)
data/               raw + processed data (gitignored; reproducible via make)
docs/               PLAN, DATA_SOURCES, DATA_POLICY
```

## Why it's fast

All map data are pre-computed offline and shipped as static files: a 0.9 MB (gzipped)
packed grid of 117,300 hexes plus pre-rendered layer images. A drawn box is answered by
scanning that grid in the browser — **<1 ms median, <10 ms p95** — with no calls to remote
GIS servers. Deployment is plain static hosting.

## Data & ethics

Public, aggregated data only. See [docs/DATA_POLICY.md](docs/DATA_POLICY.md) before adding any
source, and [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) for citations and known gaps.
Outputs are for research and public discussion — **not** regulatory, legal or navigational use.
