"""Download every public source listed in pipeline/sources.yaml into data/raw/<id>/.

Re-running is cheap: files that already exist are skipped unless --force is given.
A lock file (data/raw/MANIFEST.lock.json) records URL, size, sha256 and fetch date
so a build can be traced back to the exact bytes it used.

Usage:
    python pipeline/fetch.py              # fetch all public sources
    python pipeline/fetch.py etopo_or     # fetch one source
    python pipeline/fetch.py --force      # re-download everything
"""
import argparse
import datetime as dt
import hashlib
import json
import sys
import zipfile
from pathlib import Path

import requests
import yaml

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
LOCK = RAW / "MANIFEST.lock.json"
UA = "ORWind_dash research data pipeline (Oregon State University; academic use)"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url, dest):
    tmp = dest.with_suffix(dest.suffix + ".part")
    with requests.get(url, stream=True, timeout=300, headers={"User-Agent": UA}) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    tmp.rename(dest)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*", help="source ids to fetch (default: all)")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    manifest = yaml.safe_load((ROOT / "pipeline" / "sources.yaml").read_text())
    lock = json.loads(LOCK.read_text()) if LOCK.exists() else {}

    for src in manifest["sources"]:
        if args.ids and src["id"] not in args.ids:
            continue
        if src.get("access") != "public":
            print(f"skip {src['id']}: not public")
            continue
        outdir = RAW / src["id"]
        outdir.mkdir(parents=True, exist_ok=True)
        for f in src["files"]:
            dest = outdir / f["name"]
            key = f"{src['id']}/{f['name']}"
            fetched = lock.get(key, {}).get("fetched")
            if dest.exists() and not args.force:
                print(f"have {key}")
            else:
                print(f"get  {key}")
                try:
                    download(f["url"], dest)
                except requests.RequestException as e:
                    print(f"  FAILED: {e}", file=sys.stderr)
                    continue
                fetched = None
            if f.get("unzip"):
                with zipfile.ZipFile(dest) as z:
                    z.extractall(outdir)
            lock[key] = {
                "url": f["url"],
                "bytes": dest.stat().st_size,
                "sha256": sha256(dest),
                "fetched": fetched or dt.date.today().isoformat(),
            }

    LOCK.write_text(json.dumps(lock, indent=2, sort_keys=True))
    print(f"lock -> {LOCK.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
