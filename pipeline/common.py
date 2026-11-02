"""Shared paths and constants for the build scripts."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
WEB_DATA = ROOT / "web" / "data"

UTM = "EPSG:26910"  # NAD83 / UTM 10N, native CRS of the NCCOS grid
WGS84 = "EPSG:4326"
MERC = "EPSG:3857"

NCCOS_DIR = RAW / "nccos_oregon_2023" / "WindEnergyAnalysis_Oregon_Shapefiles"
HEX_ACRES = 10.0  # each NCCOS hex is 4.05 ha / 10 ac (DataDocumentation.pdf, Methods 1)

# Oregon ocean-facing counties (state FIPS 41)
COASTAL_COUNTIES = {
    "41007": "Clatsop",
    "41057": "Tillamook",
    "41041": "Lincoln",
    "41039": "Lane",
    "41019": "Douglas",
    "41011": "Coos",
    "41015": "Curry",
}

# ODFW / FOSS species name -> fishery group used in the dashboard.
# Groups line up with the fisheries NCCOS included in its model where possible.
def fishery_group(species):
    s = species.lower()
    if s.startswith("withheld"):
        return "withheld"
    if s.startswith("crab, dungeness"):
        return "dungeness_crab"
    if s in ("shrimp, pink", "shrimp, ocean"):
        return "pink_shrimp"
    if s.startswith(("whiting", "hake, pacific")):
        return "hake_whiting"
    if s == "tuna, albacore":
        return "albacore"
    if s.startswith("salmon,"):
        return "salmon"
    if s.startswith("halibut"):
        return "halibut"
    groundfish = ("rockfish", "sole,", "flounder", "sablefish", "lingcod", "thornyhead",
                  "pacific ocean perch", "cod, pacific", "sanddab", "greenling", "cabezon",
                  "skate", "shark, spiny dogfish", "grenadier", "ratfish", "pollock")
    if s.startswith(groundfish):
        return "groundfish"
    return "other"


FISHERY_LABELS = {
    "dungeness_crab": "Dungeness crab",
    "pink_shrimp": "Pink shrimp",
    "hake_whiting": "Pacific hake (whiting)",
    "albacore": "Albacore tuna",
    "salmon": "Salmon",
    "halibut": "Pacific halibut",
    "groundfish": "Groundfish (trawl, fixed gear)",
    "other": "Other species",
    "withheld": "Withheld for confidentiality (FOSS)",
}

# Industries tracked per coastal county (2017/2022 NAICS codes used by CBP 2023 / NES 2023)
NAICS = {
    "------": "All industries (CBP total)",
    "00": "All industries (NES total)",
    "1141": "Commercial fishing",
    "3117": "Seafood product preparation & packaging",
    "4883": "Support activities for water transportation",
    "3366": "Ship & boat building",
    "2211": "Electric power generation, transmission & distribution",
    "2371": "Utility system construction",
    "7211": "Traveler accommodation",
    "722": "Food services & drinking places",
    "4872": "Scenic & sightseeing transportation, water",
    "7139": "Other amusement & recreation (incl. marinas)",
}
