# Financing stage taxonomy

The `inv_stages` lookup table is the single source of truth for a financing
round's stage. Its `code` column is the value shared across repositories: the
postsig-droid ingester maps document and CSV labels onto these codes, the
extractor enum offers them to the model, and postsig-nextjs renders their
`display_name`.

## Code convention

Every stage is an ordinary `inv_stages` row. A sub-stage or extension code is
*named after* another stage, but it is not subordinate to it: `series_a_1` is
no more a child of `series_a` than `series_b` is. Nothing in the schema links
the two, and no query rolls one into the other.

| Kind | Code | Display name |
|---|---|---|
| Plain | `<stage>` | e.g. `series_a` -> "Series A" |
| Sub-stage | `<stage>_<n>`, n in 1..5 | `series_a_3` -> "Series A-3" |
| Extension | `<stage>_ext` | `series_a_ext` -> "Series A Extension" |

The suffix is a naming convention that keeps related codes legible and lets
them sort together. It carries no hierarchy. A round sits on exactly one stage
and is reported under that stage.

## What an extension is

An extension round is a financing round in its own right, not a second closing
of the round it extends. Laura DeWitt confirmed the definition on PSK-1991
(2026-09-14): an extension is an SPA amendment, or an amended and restated SPA
with a Charter authorising additional stock of an existing series. It carries
different terms from the round it extends but belongs to the same series.

A numbered series name such as "Series A-1 Preferred" is a sub-stage rather
than an extension: it is a distinct share class within the series.

## The table

Sub-stages exist for the nine priced stages below; `pre_seed` takes an
extension but no numbered sub-stages. Sort order is display-only — nothing
joins, filters or orders data by it — and is spaced so codes that read as a
family list together: the plain stage at B, sub-stages at B+1..B+5, the
extension at B+6.

| Stage code | Display | Sort | Sub-stages | Extension |
|---|---|---|---|---|
| `pre_seed` | Pre-Seed | 10 | none | `pre_seed_ext` "Pre-Seed Extension" (16) |
| `seed` | Seed | 20 | `seed_1`..`seed_5` "Seed-1".."Seed-5" (21-25) | `seed_ext` "Seed Extension" (26) |
| `series_seed` | Series Seed | 30 | `series_seed_1`..`_5` "Series Seed-1".. (31-35) | `series_seed_ext` (36) |
| `series_a` | Series A | 40 | `series_a_1`..`_5` "Series A-1".. (41-45) | `series_a_ext` (46) |
| `series_b` | Series B | 50 | `series_b_1`..`_5` (51-55) | `series_b_ext` (56) |
| `series_c` | Series C | 60 | `series_c_1`..`_5` (61-65) | `series_c_ext` (66) |
| `series_d` | Series D | 70 | `series_d_1`..`_5` (71-75) | `series_d_ext` (76) |
| `series_e` | Series E | 80 | `series_e_1`..`_5` (81-85) | `series_e_ext` (86) |
| `series_f` | Series F | 90 | `series_f_1`..`_5` (91-95) | `series_f_ext` (96) |
| `series_g` | Series G | 100 | `series_g_1`..`_5` (101-105) | `series_g_ext` (106) |

55 granular rows in total (1 + 9 x 6), each a stage in its own right.

### Non-granular rows

These keep their code and display name; only `sort_order` was re-spaced.

| Code | Display | Sort | Notes |
|---|---|---|---|
| `growth` | Growth | 110 | |
| `pre_ipo` | Pre-IPO | 120 | |
| `merged` | Merged | 130 | lifecycle |
| `acquired` | Acquired | 140 | lifecycle |
| `dissolved` | Dissolved | 150 | lifecycle |
| `reclassification` | Reclassification | 940 | synthetic |
| `reverse_split` | Reverse Split | 950 | synthetic |
| `forward_split` | Forward Split | 960 | synthetic |
| `other` | Other | 990 | fallback |

The three synthetic codes mark rounds portops creates by hand. They are never
derived from a document, so the ingester's label patterns and the extractor
enum must never produce them.

## Non-goals

These are deliberately *not* part of the taxonomy and map to the plain stage:

- **"+" suffixes** — "Series A+" maps to `series_a`. No `_plus` rows exist.
- **"Prime"** — "Series A Prime" maps to `series_a`.
- **Bridge** — bridge rounds are not a granular stage of the series they
  bridge; existing "Bridge" handling in the ingester is unchanged.
- **Numbers outside 1..5** — "Series A-6" maps to `series_a` rather than
  creating a row on demand.
- **Roll-up** — there is no base-stage column and no automatic aggregation of
  a sub-stage or extension into the stage it is named after. Reporting that
  wants to group them must do so explicitly, by code.

## Changing the taxonomy

Adding a granular row means adding it in all three places that pin the list:
the `inv_stages` seed migration here, the ingester mapper and extractor enum in
postsig-droid, and the display maps and stage colours in postsig-nextjs. Deploy
postsig-nextjs first: if the ingester emits a code whose row does not exist
yet, the round is written with a NULL stage.
