"""Build the analysis grid from the NCCOS Oregon 2023 hex layers.

Inputs  (data/raw): NCCOS shapefiles, ETOPO subset, Census counties, pipeline/ports.csv
Outputs:
  data/processed/hex.parquet      full-precision table, one row per 10-acre hex (for analysis/notebooks)
  web/data/hex.bin                packed typed arrays the browser scans in-memory (no server queries)
  web/data/hex.json               column layout + labels + provenance for hex.bin
  web/data/layers/<name>.png      pre-rendered map overlays (EPSG:3857) + bounds in hex.json

Why a packed binary: a drawn box is answered by a linear scan over ~117k rows in the
browser (a few ms), so the dashboard never waits on a remote GIS server.
"""
import json

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
import rasterio.features
from PIL import Image
from rasterio.transform import from_origin

from common import HEX_ACRES, MERC, NCCOS_DIR, PROCESSED, RAW, ROOT, UTM, WEB_DATA, WGS84

# (column name in output, shapefile stem, source field, label, has NCCOS category field)
SCORE_LAYERS = [
    ("final", "OR_FinalSuitability", "score", "Final suitability (all submodels)", True),
    ("fisheries", "OR_SuitabillitySubmodel_Fisheries", "score", "Fisheries submodel", True),
    ("industry", "OR_SuitabillitySubmodel_IndustryOperations", "score", "Industry & operations submodel", True),
    ("natres", "OR_SuitabillitySubmodel_NaturalResources", "score", "Natural resources submodel", True),
    ("wind", "OR_SuitabillitySubmodel_Wind", "score", "Wind (LCOE 2027) submodel", True),
    ("birds", "OR_CombinedSuitability_MarineBirds", "score", "Marine birds combined layer", True),
    # Scenario chosen by NCCOS for the submodel run (starred in DataDocumentation.pdf tables 3, 5, 6)
    ("habitat", "OR_CombinedSuitability_NMFS_Habitats", "SCENARIO_2", "NMFS habitats combined layer", False),
    ("protected", "OR_CombinedSuitability_NMFS_ProtectedSpecies", "SCENARIO_3", "NMFS protected species combined layer", False),
    ("surveys", "OR_CombinedSuitability_NMFS_ScientificSurveys", "SCENARIO_2", "NMFS scientific surveys combined layer", False),
    ("constraint", "OR_SuitabillitySubmodel_Constraints", "Constraint", "Constraints (0 = DoD exclusion / shipping fairway)", False),
]

CATEGORIES = ["Constrained", "Low", "Moderately Low", "Moderate", "Moderately High", "High"]
# NCCOS standard palette (DataDocumentation.pdf, Methods 8): red, orange, yellow, light/medium/forest green
CATEGORY_RGB = [(215, 48, 39), (244, 140, 50), (250, 220, 70), (166, 217, 106), (90, 174, 97), (26, 110, 55)]

PIXEL_M = 100  # overlay resolution in EPSG:3857 metres


def shp(stem):
    return NCCOS_DIR / f"{stem}.shp"


def load_grid():
    grid = pyogrio.read_dataframe(shp("OR_HexagonalGrid"), columns=["GRID_ID"])
    grid = grid.set_crs(UTM, allow_override=True)
    grid["geometry"] = grid.geometry.force_2d()
    assert grid.GRID_ID.is_unique
    for col, stem, field, _, has_cat in SCORE_LAYERS:
        cols = ["GRID_ID", field] + (["category"] if has_cat else [])
        t = pyogrio.read_dataframe(shp(stem), columns=cols, read_geometry=False)
        t = t.rename(columns={field: col, "category": f"{col}_cat"})
        assert len(t) == len(grid) and t.GRID_ID.is_unique, stem
        grid = grid.merge(t, on="GRID_ID", how="left", validate="1:1")
    return grid


def add_location(grid):
    cent = grid.geometry.centroid
    grid["x"], grid["y"] = cent.x, cent.y
    ll = gpd.GeoSeries(cent, crs=UTM).to_crs(WGS84)
    grid["lon"], grid["lat"] = ll.x, ll.y
    pts = gpd.GeoDataFrame(grid[["GRID_ID"]], geometry=cent, crs=UTM)

    def tag(stem, field, mapping=None):
        poly = pyogrio.read_dataframe(shp(stem))
        poly = poly.set_crs(UTM, allow_override=True)
        poly["geometry"] = poly.geometry.force_2d()
        j = gpd.sjoin(pts, poly[[field, "geometry"]] if field else poly[["geometry"]], how="left", predicate="within")
        j = j[~j.index.duplicated()]
        if field is None:
            return j["index_right"].notna().astype("uint8")
        return j[field].map(mapping).fillna(0).astype("uint8")

    area_codes = {"Coos Bay": 1, "Brookings": 2}
    grid["call_area"] = tag("OR_BOEMCallAreas_Outline_20220422", "Call_Area_", area_codes).values
    grid["wea"] = tag("OR_WindEnergyAreas", "WEA", area_codes).values
    grid["hh_cluster"] = tag("OR_HighHighClusters", None).values
    return grid


def add_depth(grid):
    # ERDDAP CSV: header row + units row, then latitude, longitude, altitude
    et = pd.read_csv(RAW / "etopo_or" / "etopo180_oregon.csv", skiprows=[1])
    lats = np.sort(et.latitude.unique())
    lons = np.sort(et.longitude.unique())
    z = et.pivot(index="latitude", columns="longitude", values="altitude").loc[lats, lons].to_numpy()
    # bilinear interpolation on the regular 1-arcmin grid
    fi = np.interp(grid.lat, lats, np.arange(len(lats)))
    fj = np.interp(grid.lon, lons, np.arange(len(lons)))
    i0, j0 = np.floor(fi).astype(int), np.floor(fj).astype(int)
    i1, j1 = np.minimum(i0 + 1, len(lats) - 1), np.minimum(j0 + 1, len(lons) - 1)
    di, dj = fi - i0, fj - j0
    v = (z[i0, j0] * (1 - di) * (1 - dj) + z[i1, j0] * di * (1 - dj)
         + z[i0, j1] * (1 - di) * dj + z[i1, j1] * di * dj)
    grid["depth_m"] = np.round(-v).astype("int16")  # positive down
    return grid


def land_polygon():
    c = pyogrio.read_dataframe(RAW / "census_counties_2023" / "cb_2023_us_county_500k.shp",
                               columns=["STATEFP", "COUNTYFP"])
    c = c[c.STATEFP.isin(["41", "06", "53"])].to_crs(UTM)
    c = c.cx[200000:600000, 4500000:5300000]
    return c.union_all().simplify(50)


def add_distances(grid):
    land = land_polygon()
    pts = gpd.GeoSeries(gpd.points_from_xy(grid.x, grid.y), crs=UTM)
    grid["shore_km"] = (pts.distance(land.boundary) / 1000).round(2).astype("float32")

    ports = pd.read_csv(ROOT / "pipeline" / "ports.csv")
    pp = gpd.GeoSeries(gpd.points_from_xy(ports.lon, ports.lat), crs=WGS84).to_crs(UTM)
    d = np.hypot(grid.x.to_numpy()[:, None] - pp.x.to_numpy()[None, :],
                 grid.y.to_numpy()[:, None] - pp.y.to_numpy()[None, :]) / 1000
    grid["port_idx"] = d.argmin(axis=1).astype("uint8")
    grid["port_km"] = d.min(axis=1).round(2).astype("float32")
    return grid, ports


# ---------------------------------------------------------------- web outputs

def pack_web(grid, ports):
    """Write hex.bin as contiguous little-endian column blocks described by hex.json."""
    n = len(grid)
    cols, blobs, offset = [], [], 0

    def add(name, arr, dtype, **meta):
        nonlocal offset
        a = np.ascontiguousarray(arr, dtype=dtype)
        pad = (-offset) % a.dtype.itemsize  # keep typed-array views aligned
        if pad:
            blobs.append(b"\0" * pad)
            offset += pad
        blobs.append(a.tobytes())
        cols.append({"name": name, "dtype": a.dtype.name, "offset": offset, **meta})
        offset += a.nbytes

    add("lon", grid.lon, "<f4")
    add("lat", grid.lat, "<f4")
    for col, stem, field, label, _ in SCORE_LAYERS:
        v = grid[col].to_numpy(dtype="float64")
        q = np.where(np.isnan(v), 65535, np.round(np.clip(v, 0, 1) * 65534)).astype("<u2")
        add(col, q, "<u2", label=label, scale=1 / 65534, missing=65535,
            source=f"NCCOS 2023 {stem}.{field}")
    for col, stem, field, label, has_cat in SCORE_LAYERS:
        if has_cat:
            add(f"{col}_cat", grid[f"{col}_cat"].map({c: i for i, c in enumerate(CATEGORIES)}).fillna(255),
                "u1", label=f"{label} – category", categories=CATEGORIES)
    add("call_area", grid.call_area, "u1", label="BOEM 2022 Call Area", codes={"0": None, "1": "Coos Bay", "2": "Brookings"})
    add("wea", grid.wea, "u1", label="BOEM 2024 Wind Energy Area (rescinded Jul 2025)", codes={"0": None, "1": "Coos Bay", "2": "Brookings"})
    add("hh_cluster", grid.hh_cluster, "u1", label="NCCOS high-high suitability cluster")
    add("depth_m", grid.depth_m, "<i2", label="Water depth (m, ETOPO1 1-arcmin, interpolated)")
    add("shore_km", np.round(grid.shore_km * 10), "<u2", scale=0.1, label="Distance to shore (km, straight line)")
    add("port_idx", grid.port_idx, "u1", label="Nearest port (index into ports)")
    add("port_km", np.round(grid.port_km * 10), "<u2", scale=0.1, label="Distance to nearest port (km, straight line)")

    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "hex.bin").write_bytes(b"".join(blobs))
    return {
        "rows": n,
        "hex_acres": HEX_ACRES,
        "bbox": [float(grid.lon.min()), float(grid.lat.min()), float(grid.lon.max()), float(grid.lat.max())],
        "columns": cols,
        "ports": ports[["port", "odfw_group", "county_fips", "lat", "lon"]].to_dict("records"),
        "source": "NCCOS Oregon WEA siting analysis, NCEI 0306723, doi:10.25921/hwtb-xm63 (CC0)",
        "caveats": [
            "Scores are RELATIVE within each submodel; do not compare scores across submodels.",
            "Coverage is limited to the BOEM 2022 Oregon Call Areas (Coos Bay, Brookings).",
            "Intended for planning and visualization only; not regulatory, legal or navigational.",
        ],
    }


def render_layers(grid, meta):
    """Rasterize each hex layer to an RGBA PNG in EPSG:3857 for fast map display."""
    g = grid.to_crs(MERC)
    xmin, ymin, xmax, ymax = g.total_bounds
    xmin, ymin = np.floor([xmin / PIXEL_M, ymin / PIXEL_M]) * PIXEL_M
    xmax, ymax = np.ceil([xmax / PIXEL_M, ymax / PIXEL_M]) * PIXEL_M
    w, h = int((xmax - xmin) / PIXEL_M), int((ymax - ymin) / PIXEL_M)
    transform = from_origin(xmin, ymax, PIXEL_M, PIXEL_M)
    corners = gpd.GeoSeries(gpd.points_from_xy([xmin, xmax], [ymin, ymax]), crs=MERC).to_crs(WGS84)
    meta["overlay_bounds"] = [[corners.y[0], corners.x[0]], [corners.y[1], corners.x[1]]]  # [[S,W],[N,E]]

    out = WEB_DATA / "layers"
    out.mkdir(parents=True, exist_ok=True)
    palette = np.array(CATEGORY_RGB + [(0, 0, 0)] * (256 - len(CATEGORY_RGB)), dtype=np.uint8)
    meta["overlays"] = {}
    for col, _, _, label, has_cat in SCORE_LAYERS:
        if has_cat:
            vals = g[f"{col}_cat"].map({c: i for i, c in enumerate(CATEGORIES)}).fillna(255).astype(int)
        elif col == "constraint":
            vals = np.where(g[col] == 0, 0, 255)
        else:
            # NCCOS reports these on its own break points; use quintiles of non-zero cells as a neutral display
            v = g[col].to_numpy()
            nz = v[v > 0]
            breaks = np.quantile(nz, [0.2, 0.4, 0.6, 0.8]) if len(nz) else [0.2, 0.4, 0.6, 0.8]
            vals = np.where(v <= 0, 0, 1 + np.searchsorted(breaks, v, side="right"))
        band = rasterio.features.rasterize(
            zip(g.geometry, vals), out_shape=(h, w), transform=transform, fill=255, dtype="uint8")
        rgba = np.zeros((h, w, 4), dtype=np.uint8)
        rgba[..., :3] = palette[band]
        rgba[..., 3] = np.where(band == 255, 0, 210)
        Image.fromarray(rgba, "RGBA").save(out / f"{col}.png", optimize=True)
        meta["overlays"][col] = {"file": f"layers/{col}.png", "label": label,
                                 "legend": "nccos_categories" if has_cat else ("constraint" if col == "constraint" else "quintiles")}


def main():
    print("loading NCCOS layers …")
    grid = load_grid()
    print(f"  {len(grid):,} hexes")
    grid = add_location(grid)
    grid = add_depth(grid)
    grid, ports = add_distances(grid)

    PROCESSED.mkdir(parents=True, exist_ok=True)
    grid.drop(columns="geometry").to_parquet(PROCESSED / "hex.parquet", index=False)

    meta = pack_web(grid, ports)
    print("rendering overlays …")
    render_layers(grid, meta)
    (WEB_DATA / "hex.json").write_text(json.dumps(meta, indent=1))
    print(f"hex.bin {(WEB_DATA / 'hex.bin').stat().st_size / 1e6:.1f} MB, {len(meta['columns'])} columns")


if __name__ == "__main__":
    main()
