"""Build the coastal-economy tables the dashboard joins to a drawn footprint.

Outputs:
  data/processed/odfw_port_species_2024.csv   port group x species, pounds and ex-vessel $
  data/processed/foss_oregon_species_year.csv statewide species x year (2015-2024)
  data/processed/county_industry_2023.csv     coastal county x NAICS, CBP employers + NES nonemployers
  web/data/econ.json                          compact summary for the browser

All inputs are public, already aggregated releases. Census suppression / noise flags and
FOSS "withheld" rows are carried through, never back-filled. See docs/DATA_POLICY.md.
"""
import glob
import json
import re

import pandas as pd
import pdfplumber
import yaml

from common import COASTAL_COUNTIES, FISHERY_LABELS, NAICS, PROCESSED, RAW, ROOT, WEB_DATA, fishery_group

ROW = re.compile(r"^(.*?)\s*([#$])\s+([\d,\s-]+)$")
SUBTOTALS = {"Fish", "Crustaceans", "Molluscs", "Other Invertebrates", "Total"}


def parse_odfw_port_pdf(path):
    """ODFW FTR205 report: each species has a '#' (pounds) row and a '$' row; last number is the annual total."""
    rows, name = [], None
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for line in (page.extract_text() or "").splitlines():
                m = ROW.match(line)
                if not m:
                    continue
                label, kind, nums = m.groups()
                if label:
                    name = label.strip()
                rows.append((name, kind, int(nums.split()[-1].replace(",", ""))))
    df = pd.DataFrame(rows, columns=["species", "kind", "value"])
    return df.pivot_table(index="species", columns="kind", values="value", aggfunc="sum").rename(
        columns={"#": "pounds", "$": "usd"}).reset_index()


def odfw_ports():
    frames = []
    for f in sorted(glob.glob(str(RAW / "odfw_landings_2024" / "2024 - *.pdf"))):
        group = f.split("2024 - ")[1][:-4]
        df = parse_odfw_port_pdf(f)
        species = df[~df.species.isin(SUBTOTALS)]
        total = df.loc[df.species == "Total", "usd"].sum()
        # parse check: species rows must add up to the report's own grand total
        assert abs(species.usd.sum() - total) <= max(1000, 0.001 * total), (group, species.usd.sum(), total)
        species = species.assign(port_group=group)
        frames.append(species)
    df = pd.concat(frames, ignore_index=True)
    df["fishery"] = df.species.map(fishery_group)
    df["year"] = 2024
    return df[["year", "port_group", "species", "fishery", "pounds", "usd"]]


def foss_state():
    items = []
    for f in sorted(glob.glob(str(RAW / "noaa_foss_oregon" / "foss_oregon_*.json"))):
        items += json.load(open(f))["items"]
    df = pd.DataFrame(items)[["year", "ts_afs_name", "collection", "pounds", "dollars"]]
    df = df[df.collection == "Commercial"].rename(columns={"ts_afs_name": "species", "dollars": "usd"})
    df["fishery"] = df.species.map(fishery_group)
    return df.drop(columns="collection")


def county_industry():
    fips = {k[2:]: v for k, v in COASTAL_COUNTIES.items()}
    cbp = pd.read_csv(RAW / "census_cbp_2023" / "cbp23co.txt", dtype=str)
    cbp = cbp[(cbp.fipstate == "41") & cbp.fipscty.isin(fips)]
    cbp["code"] = cbp.naics.str.rstrip("/").replace({"": "------"})
    cbp = cbp[cbp.code.isin(NAICS)]
    cbp = cbp.assign(source="CBP employer", estab=cbp.est.astype(int), emp=pd.to_numeric(cbp.emp),
                     payroll_k=pd.to_numeric(cbp.ap), receipts_k=None, flag=cbp.emp_nf)

    nes = pd.read_csv(RAW / "census_nes_2023" / "nonemp23co.txt", dtype=str)
    nes = nes[(nes.ST == "41") & nes.CTY.isin(fips)]
    nes["code"] = nes.NAICS.str.rstrip("/")
    nes = nes[nes.code.isin(NAICS)]
    nes = nes.assign(source="NES nonemployer", fipscty=nes.CTY, estab=pd.to_numeric(nes.ESTAB),
                     emp=None, payroll_k=None, receipts_k=pd.to_numeric(nes.RCPTOT), flag=nes.RCPTOT_N_F)

    cols = ["fipscty", "code", "source", "estab", "emp", "payroll_k", "receipts_k", "flag"]
    df = pd.concat([cbp[cols], nes[cols]], ignore_index=True)
    df.insert(0, "county", df.fipscty.map(fips))
    df.insert(0, "county_fips", "41" + df.fipscty)
    df["industry"] = df.code.map(NAICS)
    return df.drop(columns="fipscty").sort_values(["county_fips", "code", "source"])


def jobs_factors():
    """Per-MW statewide impact factors from NREL 2016 (see pipeline/nrel_2016_jobs.yaml)."""
    src = yaml.safe_load((ROOT / "pipeline" / "nrel_2016_jobs.yaml").read_text())
    per_mw = lambda v, mw: [x / mw for x in v] if isinstance(v, list) else v
    out = {"cite": src["cite"].strip(), "dollar_year": src["dollar_year"], "scenarios": {}}
    for key, s in src["scenarios"].items():
        mw = s["mw"]
        out["scenarios"][key] = {
            "label": s["label"],
            "description": s["description"],
            "reference_mw": mw,
            "construction_job_years_per_mw": per_mw(s["construction_job_years"], mw),
            "construction_gdp_per_mw": per_mw(s["construction_gdp_usd"], mw),
            "operations_jobs_per_mw": per_mw(s["operations_jobs"], mw),
            "operations_gdp_per_mw_year": per_mw(s["operations_gdp_usd_per_year"], mw),
            "construction_earnings_per_job": s["construction_earnings_per_job"],
            "operations_earnings_per_job": s["operations_earnings_per_job"],
        }
    return out


def main():
    PROCESSED.mkdir(parents=True, exist_ok=True)
    ports = odfw_ports()
    ports.to_csv(PROCESSED / "odfw_port_species_2024.csv", index=False)
    foss = foss_state()
    foss.to_csv(PROCESSED / "foss_oregon_species_year.csv", index=False)
    county = county_industry()
    county.to_csv(PROCESSED / "county_industry_2023.csv", index=False)

    port_fishery = ports.groupby(["port_group", "fishery"])[["pounds", "usd"]].sum().reset_index()
    port_list = pd.read_csv(ROOT / "pipeline" / "ports.csv")
    econ = {
        "fishery_labels": FISHERY_LABELS,
        "port_groups": {
            g: {
                "ports": port_list.loc[port_list.odfw_group == g, "port"].tolist(),
                "usd_2024": int(sub.usd.sum()),
                "by_fishery": {r.fishery: {"usd": int(r.usd), "pounds": int(r.pounds)} for r in sub.itertuples()},
            }
            for g, sub in port_fishery.groupby("port_group")
        },
        "state_by_year": {
            int(y): {k: int(v) for k, v in sub.groupby("fishery").usd.sum().items()}
            for y, sub in foss.groupby("year")
        },
        "counties": {
            fips: [
                {k: (None if pd.isna(v) else v) for k, v in r.items() if k not in ("county_fips",)}
                for r in sub.to_dict("records")
            ]
            for fips, sub in county.groupby("county_fips")
        },
        "jobs": jobs_factors(),
        "sources": {
            "port_groups": "ODFW Commercial Landing Statistics 2024 Final (ex-vessel $)",
            "state_by_year": "NOAA Fisheries FOSS commercial landings, Oregon",
            "counties": "U.S. Census Bureau CBP 2023 (employers) and Nonemployer Statistics 2023",
            "jobs": "NREL 2016 / OCS Study BOEM 2016-030 (statewide JEDI scenarios, 2014 $)",
        },
    }
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "econ.json").write_text(json.dumps(econ, indent=1, default=str))
    print(f"ports: {ports.port_group.nunique()} groups, ${ports.usd.sum():,.0f} ex-vessel 2024")
    print(f"foss:  {foss.year.min()}-{foss.year.max()}, {len(foss):,} rows")
    print(f"county rows: {len(county)}")


if __name__ == "__main__":
    main()
