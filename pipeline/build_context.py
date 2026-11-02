"""Small vector context layers for the map: Call Areas, WEAs, coastal counties, ports, cables.

Output: web/data/context.geojson (simplified, WGS84) — one FeatureCollection, `layer` property per feature.
"""
import json

import geopandas as gpd
import pandas as pd
import pyogrio

from common import COASTAL_COUNTIES, NCCOS_DIR, RAW, ROOT, UTM, WEB_DATA, WGS84


def nccos(stem, rename):
    g = pyogrio.read_dataframe(NCCOS_DIR / f"{stem}.shp").set_crs(UTM, allow_override=True)
    g["geometry"] = g.geometry.force_2d().simplify(50)
    return g.rename(columns=rename)[list(rename.values()) + ["geometry"]]


def main():
    parts = []

    ca = nccos("OR_BOEMCallAreas_Outline_20220422", {"Call_Area_": "name", "Acres": "acres"})
    parts.append(ca.assign(layer="call_area", note="BOEM 2022 Call Area"))

    wea = nccos("OR_WindEnergyAreas", {"WEA": "name", "Acreage": "acres"})
    parts.append(wea.assign(layer="wea", note="BOEM 2024 Wind Energy Area; rescinded July 2025"))

    c = pyogrio.read_dataframe(RAW / "census_counties_2023" / "cb_2023_us_county_500k.shp",
                               columns=["GEOID", "NAME"])
    c = c[c.GEOID.isin(COASTAL_COUNTIES)].to_crs(UTM)
    c["geometry"] = c.geometry.simplify(200)
    parts.append(c.rename(columns={"GEOID": "fips", "NAME": "name"}).assign(layer="county"))

    ports = pd.read_csv(ROOT / "pipeline" / "ports.csv")
    pg = gpd.GeoDataFrame(ports.rename(columns={"port": "name", "county_fips": "fips"}),
                          geometry=gpd.points_from_xy(ports.lon, ports.lat), crs=WGS84).to_crs(UTM)
    parts.append(pg[["name", "odfw_group", "fips", "geometry"]].assign(layer="port"))

    cables = pyogrio.read_dataframe(RAW / "marinecadastre_cables" / "SubmarineCable.gpkg")
    cables = cables.to_crs(WGS84).cx[-127:-123.5, 41.8:46.4].to_crs(UTM)
    cables["geometry"] = cables.geometry.simplify(100)
    name_col = next((col for col in cables.columns if col.lower() in ("name", "owner", "status")), None)
    cables = cables.assign(name=cables[name_col] if name_col else None)
    parts.append(cables[["name", "geometry"]].assign(layer="cable"))

    out = pd.concat([p.to_crs(WGS84) for p in parts], ignore_index=True)
    out = gpd.GeoDataFrame(out, geometry="geometry", crs=WGS84)
    gj = json.loads(out.to_json(drop_id=True, na="drop"))
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "context.geojson").write_text(json.dumps(gj, separators=(",", ":")))
    print(out.layer.value_counts().to_dict(), f"{(WEB_DATA / 'context.geojson').stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
