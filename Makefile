PY := .venv/bin/python

.PHONY: all setup fetch build bench serve clean

all: fetch build bench

setup:
	python3 -m venv .venv
	$(PY) -m pip install -r requirements.txt

fetch:            ## download public sources into data/raw (skips files already present)
	$(PY) pipeline/fetch.py

build:            ## raw -> data/processed + web/data
	$(PY) pipeline/build_hex.py
	$(PY) pipeline/build_econ.py
	$(PY) pipeline/build_context.py

bench:            ## in-browser query latency check
	node web/bench/query_bench.mjs

serve:            ## static preview of web/ at http://localhost:8000
	cd web && python3 -m http.server 8000

clean:            ## remove build outputs (keeps downloaded raw data)
	rm -rf data/processed web/data
