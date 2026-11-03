# Data policy

This is an academic research project. These rules apply to every source and every output.

## 1. Tiers

| Tier | What | Where it may live | In git? | In the public app? |
|---|---|---|---|---|
| **Public** | Published, already-aggregated releases (NCEI archives, ODFW published reports, Census CBP/NES, NOAA FOSS, MarineCadastre) | `data/raw/` via `pipeline/fetch.py` | No (re-fetched) | Yes, with citation |
| **Restricted** | Anything obtained under a data-use agreement: PacFIN fish tickets, VMS/logbooks, unpublished agency layers, interview/survey data | **Outside this repo**, on OSU-approved storage (e.g. encrypted OSU research drive) | **Never** | Only aggregated outputs that pass §3 and the provider's DUA terms |
| **Derived** | Our computed tables/images | `data/processed/`, `web/data/` | `data/processed/`: no (rebuilt). `web/data/`: **yes**, it is the published site bundle, so anything committed there is public | Yes if every input is Public, or §3 applied |

Because `web/data/` is committed and served by GitHub Pages, a build that uses any Restricted input must pass §3
before its output is committed. `data/restricted/` is gitignored as a safety net only; don't store restricted data there by default.

## 2. Adding a source

1. Add it to `pipeline/sources.yaml` with `license`, `access`, `vintage`, `coverage`, `cite`.
2. If `access` is anything but `public`, list it under `restricted:` instead — `fetch.py` will not touch it.
3. Record the reason it's needed and the access route in `TODO.md`.

## 3. Confidentiality rules for any restricted-derived output

- **Rule of 3**: no published cell (port × fishery × period, grid cell, etc.) may reflect fewer than
  3 vessels, 3 dealers/processors or 3 permit holders. Suppress or aggregate up.
- **No re-identification by subtraction**: if a total and all-but-one component are shown, the last
  component is disclosed. Check complementary suppression.
- **No vessel tracks, vessel IDs, permit numbers, dealer names** in any output, ever.
- Carry provider suppression through: Census noise/suppression flags and FOSS
  "WITHHELD FOR CONFIDENTIALITY" rows are kept as-is, never back-filled or estimated in a way
  that reveals the withheld value.
- Follow the stricter of these rules and the provider's DUA.

## 4. Human subjects

Community surveys, interviews, workshops with recorded input, or analytics on how identifiable
people use the dashboard require OSU IRB review **before** collection. Don't add user tracking
to the web app without it.

## 5. Use limitations shown in the app

- NCCOS layers are "intended solely for planning and visualization… not intended for regulatory,
  legal, or navigational purposes" (NCEI 0306723 documentation).
- Suitability scores are relative within each submodel and must not be compared across submodels.
- Economic figures are context (what depends on an area), not forecasts of loss, unless a method
  in `docs/PLAN.md` explicitly supports that claim.
