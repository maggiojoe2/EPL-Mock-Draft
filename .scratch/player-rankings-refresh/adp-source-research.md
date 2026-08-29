# ADP data source research

Date: 2026-08-28
Status: research

## Summary / top-line recommendation

**Mode A (dev-time `npm run update-adp` script, no CORS constraint):** best option is FantasyPros' official "Consensus Rankings" developer API (`GET /nfl/{season}/consensus-rankings?type=ADP`, documented at `https://api.fantasypros.com/public/v2/docs`) — verified against its real OpenAPI spec to return a genuine, separately-modeled `ADP.ALL` field (not ECR relabeled), covering STD/PPR/HALF scoring and K/DST. It requires applying for an API key and the free tier is explicitly "sample data"/"non-production use," so production use may require the $8.99/mo Premium tier. If that's a blocker, fall back to scraping the embedded JSON in FantasyPros' free page `https://www.fantasypros.com/nfl/adp/overall.php` (and its `ppr-`/`half-point-ppr-` siblings) with a headless browser — the full ~300+ row table is populated client-side, so a plain `curl`/`fetch` only yields ~5 preview rows.

**Mode B (live in-browser fetch, no backend):** **not realistically achievable against FantasyPros** — no `Access-Control-Allow-Origin` header on any FantasyPros URL tested, confirmed by raw header dumps below. However, **ESPN's undocumented public Fantasy API is realistically usable for mode B**: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/players?...` returned `access-control-allow-origin` reflecting whatever `Origin` header was sent (tested with three different origins, all reflected back), and its player objects carry a genuine `ownership.averageDraftPosition` field. This is undocumented and unstable (no official docs found, could change/break without notice), so it should be treated as a "nice to have, degrade gracefully" live-refresh source, not a load-bearing one.

---

## Section 1: FantasyPros findings

### 1a. URL variants tried

| URL | HTTP status | `content-type` | CORS header |
|---|---|---|---|
| `https://www.fantasypros.com/nfl/adp/overall.php` | 200 | `text/html; charset=UTF-8` | none |
| `https://www.fantasypros.com/nfl/adp/overall.php?export=xls` | 200 | `text/html; charset=UTF-8` (identical to above — `export=xls` did **not** change response format) | none |
| `https://www.fantasypros.com/nfl/adp/half-point-ppr-overall.php` | 200 | `text/html; charset=UTF-8` | none |
| `https://www.fantasypros.com/nfl/adp/ppr-overall.php` | 200 | `text/html; charset=UTF-8` | none |

All fetched with `curl -sD - -A "Mozilla/5.0"` on 2026-08-28. Full header dumps in the appendix.

**Scoring formats offered:** confirmed three, directly from an embedded config object in the page (`"id":"scoring"` dropdown): `STD` → `/nfl/adp/overall.php`, `PPR` → `/nfl/adp/ppr-overall.php`, `HALF` → `/nfl/adp/half-point-ppr-overall.php`. There's also a year selector going back to 2015 (`?year=2015` … `?year=2020`, same base URL).

**Is the response a real CSV/JSON, or HTML to scrape?** HTML. There is no dedicated CSV/JSON endpoint reachable without login. The page does reference an `exportFilename":"FantasyPros_2026_Overall_ADP_Rankings.csv"` inside its config object, but this is metadata for a client-side "download as CSV" button (JS converts the already-rendered table to CSV in-browser) — it is not a URL you can `curl`/`fetch` directly for a file.

**Is current data gated behind login/paywall for viewing?** No — the page renders real, current-season player data (e.g. `Bijan Robinson`, `Christian McCaffrey` confirmed present in the raw HTML) without authentication. The word "premium"/"subscribe" appears repeatedly on the page (ads/upsells for FantasyPros HOF), but the ADP table itself is publicly viewable.

**Important scraping caveat discovered:** the raw HTML returned by a plain HTTP GET (`curl`, or any non-JS-executing fetch) only contains **5** player rows inline (a small SEO/preview snippet embedded as JSON: `{"id":22968,"rank":1,"player":{"name":"Jahmyr Gibbs",...},"avg":1.5,...}`). The full ~300+ row table is populated by client-side JavaScript after page load; no separate AJAX/JSON endpoint for it was found in the static HTML/JS. **This means a Node `fetch`/`curl`-based scraper will not get the full table — a headless browser (e.g. Playwright/Puppeteer) is required to render the page and read the DOM/table, or to intercept whatever internal XHR the JS bundle issues.** This is a materially different (harder) scraping job than "parse an HTML table from the raw response."

**Does the response include CORS headers?** No. Verified directly:
```
$ curl -s -D - -o /dev/null "https://www.fantasypros.com/nfl/adp/overall.php" -H "Origin: https://example.com" -A "Mozilla/5.0" | grep -i "access-control"
(no output — header absent)
```

### 1b. FantasyPros' own official Public API (separate product)

FantasyPros also sells a documented REST API at `https://www.fantasypros.com/api-data/`, with endpoints like `GET /{sport}/{season}/rankings` and `GET /{sport}/{season}/consensus-rankings` which explicitly cover "ECR and ADP aggregated from 130+ ranked experts." Pricing, read directly from the page:
- **Free** ($0/mo): "All endpoints, sample data" / "Generous daily call limit" / "Live explorer & full docs" / **"Non-production use"** — requires requesting an API key (signup), and is explicitly not for production/current real data.
- **Premium** ($8.99/mo, bundled with a FantasyPros HOF subscription): "Personal & non-commercial apps" — production access.

So this is a real JSON API for ADP, but it is **not** "free, no-login" in the sense the project needs — it requires account creation, and the free tier is sample data only, not live production ADP.

---

## Section 2: Alternative sources

### 2a. Sleeper public API — does NOT expose ADP

- Docs: `https://docs.sleeper.com` (fetched directly, 2026-08-28).
- Searched the full docs page text for `adp` / `average draft position` — **zero matches**. The only draft-related endpoints documented are league/user-scoped: "Get a specific draft," "Get all drafts for a league," "Get all drafts for user," "Get all picks in a draft," "Get traded picks in a draft" — these expose picks made *inside actual Sleeper leagues*, not an aggregate market ADP metric. **Confirmed (not assumed): Sleeper's public API surface does not include ADP.**
- The other well-known Sleeper endpoint, `https://api.sleeper.app/v1/players/nfl` (bulk player metadata — names, teams, positions, IDs), **does** support CORS:
  ```
  $ curl -s -D - -o /dev/null "https://api.sleeper.app/v1/players/nfl" -H "Origin: https://example.com"
  access-control-allow-origin: *
  access-control-allow-credentials: true
  ```
  but it carries no draft-position/ADP field, only player metadata (~14.6 MB JSON payload, all NFL players). Useful only as an ID/name/position/team reference table, not as an ADP source.

**Verdict: not usable for ADP at all**, for either mode. Ruled out.

### 2b. ESPN Fantasy API (undocumented) — has ADP, has permissive CORS

- No official public docs found for this endpoint family (ESPN does not publish developer docs for it) — findings below come from directly querying the live endpoint and reading its JSON, which is as close to primary-source as available; flagging clearly as **unverified against any ESPN-authored documentation**.
- Endpoint used: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/players?scoringPeriodId=0&view=kona_player_info` with header `x-fantasy-filter: {"players":{"limit":N,...}}`.
- Response is clean JSON (`content-type: application/json;charset=utf-8`), no HTML scraping needed. Each player object includes:
  ```json
  "ownership": {
    "averageDraftPosition": 170.14,
    "averageDraftPositionPercentChange": -0.04,
    "percentOwned": 1.32,
    ...
  }
  ```
  confirmed present on 2,616 of the returned player records in a real fetch on 2026-08-28. Position/team come back as numeric IDs (`defaultPositionId`, `proTeamId`) requiring a lookup table (standard ESPN convention, not independently re-verified here) rather than human-readable strings.
- **Free/no-auth**: yes, no API key or login required for this public-league-data endpoint (as tested).
- **CORS evidence** (this is the notable finding): tested with three different `Origin` header values against the same endpoint —
  ```
  Origin: https://eplmockdrafter.pages.dev  → access-control-allow-origin: https://eplmockdrafter.pages.dev
  Origin: https://evil.example.org          → access-control-allow-origin: https://evil.example.org
  Origin: https://example.com               → access-control-allow-origin: https://example.com
  ```
  plus `access-control-allow-credentials: true` and `access-control-allow-methods: GET,PUT,POST,DELETE,OPTIONS,HEAD`. The server reflects **any** origin back — effectively permissive CORS, even though the header value isn't a literal `*`. This means a browser-side `fetch()` from the deployed Cloudflare Pages app would not be blocked by CORS.
- **Caveats**: this is an internal/undocumented API ESPN uses for its own fantasy.espn.com frontend. No official terms of service or stability guarantee was found for third-party use; it could change shape or start requiring auth/rate-limiting without notice. Not something to build mode B around as a sole dependency without a fallback.

### 2c. `dynastyprocess/data` GitHub-hosted open dataset — CORS-friendly but no ADP field

- Repo: `https://github.com/dynastyprocess/data`, maintained via weekly GitHub Actions (per its README, fetched directly).
- Files served raw via `raw.githubusercontent.com`, e.g. `https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_fpecr_latest.csv`.
- **CORS evidence**: `raw.githubusercontent.com` sends `access-control-allow-origin: *` on this file (verified via header dump, see appendix) — GitHub's raw-content CDN is CORS-permissive generally, which is useful to know for *any* future GitHub-hosted CSV/JSON this project might pull client-side.
- **Format**: real CSV, free, no auth.
- **Important negative finding**: this dataset's main file (`db_fpecr_latest.csv`) is FantasyPros **ECR** (expert consensus rank) data scraped from FantasyPros' `/nfl/rankings/*.php` pages, **not** their `/nfl/adp/*.php` pages. Checked its header row and full `fp_page` column values — no ADP-specific page type present, and no `adp` column exists in the file. So despite being an attractively CORS-friendly, pre-scraped, actively-maintained CSV, **it does not actually contain ADP** as this project defines it (average *draft* position) — it's expert ranking consensus, a related but distinct metric. Not a drop-in replacement without relabeling what the field means.
- The `database.csv` file referenced in older docs is deprecated (confirmed: fetching it returns a one-line "moved to archives/" notice, not data).

### 2d. Other sources noted but not pursued in depth

- `joshuarichard/fantasy-adp-csv` (GitHub) — a small scraper of ESPN's HTML ADP tables; its `README` describes dependencies (`jsdom@3.0.0`) that indicate it's old/unmaintained tooling, not a live data source itself. Not evaluated further; ESPN's underlying JSON API (2b) is a strictly better source than scraping ESPN's HTML via this tool's approach.
- NFL.com — not investigated with live requests in this pass; deprioritized once ESPN's JSON API with working CORS was confirmed, since it already satisfies the mode-B requirement.

---

## Section 1c: FantasyPros official "Consensus Rankings" developer API (follow-up investigation)

FantasyPros does have a real, documented developer API, distinct from the free `/nfl/adp/*.php` HTML export page (Section 1a) and separately from the marketing page summarized in 1b — this section verifies it against the actual OpenAPI spec, not just the marketing copy.

**1. Does it exist, and where are the docs?**
Yes. Linked from the `/api-data/` marketing page (footer "API" link from `fantasypros.com`, confirmed in Section 1b). The actual interactive docs are a ReDoc-rendered page at `https://api.fantasypros.com/public/v2/docs`, which loads a public OpenAPI 3.1.1 spec directly fetchable (no auth) at:
```
https://api.fantasypros.com/public/v2/docs/fantasypros_v2_public.yml
```
Fetched directly (149,922 bytes, `openapi: 3.1.1`, title `FantasyPros Public API`). Base URL for all calls, per the spec's own `info.description`: `https://api.fantasypros.com/public/v2/json`. This is the same host/path referenced in the `/api-data/` marketing page's endpoint cards (Section 1b), confirmed consistent between the two primary sources.

**2. Free or paid? Auth method? Rate limits?**
- **Auth**: API key via `x-api-key` request header (OpenAPI `securitySchemes.api_key: {type: apiKey, name: x-api-key, in: header}` — every operation in the spec requires `security: [{api_key: []}]`). No OAuth.
- **Signup**: the spec's own description says "This is the free limited public API. To request an API key, go to https://secure.fantasypros.com/api-keys/request/ and apply." So a free key requires requesting/applying — not instant, not anonymous, and not literally "no-login" (an account is implied by "apply").
- **Verified live**: calling the endpoint with no key returns a clean 403 from AWS API Gateway:
  ```
  $ curl -s -D - "https://api.fantasypros.com/public/v2/json/nfl/2026/consensus-rankings?type=ADP" -H "Origin: https://example.com"
  HTTP/2 403
  content-type: application/json
  x-amzn-errortype: ForbiddenException
  {"message":"Forbidden"}
  ```
  confirming the key requirement is enforced, not just documented.
- **Pricing tiers** (from the marketing page, Section 1b, restated here for context): Free ($0/mo, "sample data," "non-production use," "generous daily call limit" — no exact number found in either the marketing page or the OpenAPI spec); Premium ($8.99/mo bundled with FantasyPros HOF, production/personal use). **No numeric rate limit was found in the primary sources checked** (spec has no `x-rate-limit` extension or documented header) — unverified beyond the qualitative "generous daily call limit" / "non-production use" wording on the pricing page.

**3. ADP vs ECR — critical distinction, resolved from the spec itself:**
The `consensus-rankings` operation (`GET /{sport}/{season}/consensus-rankings`) takes a `type` query parameter (`RankingType`) whose NFL enum is:
```yaml
NFLRankingTypes:
  enum: [WW, WAIVER, ROS, DRAFT, PRESEASON, SLEEPERS, ADP, BEST, PROSPECT, PRO, DEVY, ROOKIES, DYNADP, RKADP, BESTADP, DYNASTY, PRE, DRAFTERS, MOCK]
```
`ADP` is one specific, separately-named value in that enum, distinct from `DRAFT`/`ROS`/`PRESEASON` (which are ECR-style consensus rank types). More conclusively, the shared `PlayerRank` response schema carries **both** metrics as separate, independently-populated fields:
```yaml
PlayerRank:
  properties:
    ECR: {$ref: '#/components/schemas/ECRMetrics'}
    ECR_MIN / ECR_MAX / ECR_AVG / ECR_STD: {...}
    ADP:
      type: object
      required: [ALL]
      properties:
        ALL: {type: integer}
```
So the API explicitly models ADP (`players[].ADP.ALL`, an integer) as a field separate from the ECR family. **Verdict: this API does return real ADP, not just ECR relabeled** — it's a valid conceptual match for this project's `adp` column, contingent on paying/qualifying for production access.

**4. CORS evidence:**
No `Access-Control-Allow-Origin` header on any response tested from this API family, checked with an `Origin` header present on both the public spec file and the authenticated endpoint's 403 error response:
```
$ curl -s -D - "https://api.fantasypros.com/public/v2/docs/fantasypros_v2_public.yml" -H "Origin: https://example.com" | grep -i access-control
(no output)
$ curl -s -D - "https://api.fantasypros.com/public/v2/json/nfl/2026/consensus-rankings?position=RB&scoring=PPR" -H "Origin: https://example.com" | grep -i access-control
(no output — only "HTTP/2 403")
```
Not tested with a valid API key (none available), so a `200` response's headers weren't directly observed — but AWS API Gateway/CloudFront deployments (visible in the `via`/`x-amz-apigw-id` headers on every response from this host) do not add CORS headers by default unless explicitly configured on the gateway, and the 403 error path — which API Gateway generates independently of the backend Lambda/app logic — already shows none. Treating "no CORS" as the safe reading, but flagging explicitly that the 200 path with a real key is **unverified**.

**5. K/DST coverage and scoring variants:**
- **K/DST**: confirmed via the endpoint's own documented 400-error example for an invalid `position` value: `"valid_format": "QB, RB, WR, TE, K, DST"` — both covered.
- **Scoring formats**: `NFLScoringTypes` enum = `STD | PPR | HALF` (default `STD`) — identical three variants to the free HTML page (Section 1a).

---

## Section 3: Recommendation

### Mode A — dev-time `npm run update-adp` script (CORS irrelevant)

Two realistic options, in order of preference:

1. **FantasyPros official "Consensus Rankings" API** (Section 1c) if the project is willing to apply for a key at `https://secure.fantasypros.com/api-keys/request/` — it's a clean JSON endpoint (`GET /nfl/{season}/consensus-rankings?type=ADP&position=...&scoring=STD|PPR|HALF`), confirmed to return a genuine, separately-modeled `ADP.ALL` field (not ECR relabeled), covers K/DST, and matches the STD/PPR/HALF scoring split already in use. Since it's a stable, versioned, auth'd API rather than a scraped page, it's far less brittle than option 2 for a script that's meant to be re-run periodically. Caveat: the Free tier is explicitly documented as "sample data" / "non-production use," so it may not be usable for the real committed CSV without qualifying for/paying for the Premium tier ($8.99/mo) — worth applying for a free key first to see in practice what "sample data" actually withholds (full player universe? just row count? unverified without a key in hand) before assuming it's a dead end.
2. **FantasyPros free HTML ADP page** (Section 1a), scraped with a headless browser (Playwright/Puppeteer via `tsx`), if the official API's free tier turns out to be too limited. This matches the project's original manual-export source. Must render the page (a plain fetch only returns 5 preview rows, confirmed above) and should assert a minimum row count (~300) so silent breakage doesn't ship stale/truncated data.

ESPN's undocumented JSON API (Section 2b) remains a viable no-signup fallback/secondary source for either path — trivially fetchable (plain `fetch`, no headless browser) and includes `ownership.averageDraftPosition` directly — at the cost of being unofficial/unstable and needing a positionId/teamId → string lookup table.

### Mode B — live in-browser refresh (no backend, CORS-constrained)

**FantasyPros cannot be used for mode B** in any form — neither the free HTML page (Section 1a: no CORS headers on any tested URL) nor the official Consensus Rankings API (Section 1c: no CORS headers on the spec file or the live endpoint's error response, and it additionally requires an `x-api-key` secret that must never ship in client-side JS in the first place, which would rule it out for browser use even if CORS were open). A proxy would be required for either (which the project doesn't have). Don't build this against FantasyPros without adding serverless infrastructure.

**ESPN's undocumented Fantasy API (2b) is realistically usable for mode B** as-is, purely on CORS grounds — permissive/reflected `Access-Control-Allow-Origin` was verified directly from three different Origin values in real requests. If a "live refresh" button is wanted with zero backend changes, this is the only source in this investigation that clears the CORS bar today. Honest caveat: it's an internal API ESPN doesn't publish docs for; recommend feature-flagging it as best-effort ("live refresh (beta)") with a clear fallback to the bundled CSV on failure, rather than treating it as a guaranteed-stable dependency.

If the project later adds any serverless function (even a minimal Cloudflare Pages Function acting as a same-origin proxy), that reopens FantasyPros for mode B too, since the proxy would do the fetch server-side just like mode A's script — but that's out of scope of "no backend" as currently constrained.

---

## Appendix: raw evidence

### FantasyPros — header dumps

```
$ curl -sD - -o /tmp/fp_overall.html "https://www.fantasypros.com/nfl/adp/overall.php" -A "Mozilla/5.0"
HTTP/2 200
content-type: text/html; charset=UTF-8
cache-control: max-age=300, must-revalidate
server: Apache/2.4.52 (Ubuntu)
vary: Accept-Encoding,Cookie
x-cache: Miss from cloudfront
via: 1.1 8ce3c4c57ea16145b2cade4ce92236d8.cloudfront.net (CloudFront)
(no access-control-* header present)

$ curl -sD - -o /tmp/fp_export.html "https://www.fantasypros.com/nfl/adp/overall.php?export=xls" -A "Mozilla/5.0"
HTTP/2 200
content-type: text/html; charset=UTF-8   # identical to non-export URL — no real export happens server-side
(no access-control-* header present)

$ curl -s -D - -o /dev/null "https://www.fantasypros.com/nfl/adp/overall.php" -H "Origin: https://example.com" -A "Mozilla/5.0" | grep -i access-control
(no output)
```

Embedded preview JSON found in the raw HTML (only 5 rows present — full table is client-rendered):
```json
{"id":22968,"rank":1,"player":{"id":22968,"name":"Jahmyr Gibbs","team":"DET (6)","url":"/nfl/players/jahmyr-gibbs.php"},"pos":"RB1","avg":1.5,"realtime":1},
{"id":23133,"rank":2,"player":{"id":23133,"name":"Bijan Robinson","team":"ATL (11)","url":"/nfl/players/bijan-robinson.php"},"pos":"RB2","avg":1.5,"realtime":2},
{"id":19788,"rank":3,"player":{"id":19788,"name":"Ja'Marr Chase","team":"CIN (6)","url":"/nfl/players/jamarr-chase.php"},"pos":"WR1","avg":4.5,"realtime":3}
```

Scoring-format config object found embedded in the page:
```json
{"id":"scoring","label":"Scoring","type":"dropdown",
 "options":{"STD":{"text":"STD Scoring"},"PPR":{"text":"PPR Scoring"},"HALF":{"text":"Half PPR Scoring"}},
 "selected":"STD",
 "onSelectUrlMap":{"STD":"/nfl/adp/overall.php","PPR":"/nfl/adp/ppr-overall.php","HALF":"/nfl/adp/half-point-ppr-overall.php"}}
```

### FantasyPros Public API pricing (from `https://www.fantasypros.com/api-data/`)

```
"Free to build. Priced to scale."
Free   — $0/mo  — "All endpoints, sample data" / "Non-production use"
Premium — $8.99/mo (bundled w/ HOF) — "Personal & non-commercial apps"
Endpoints shown: GET /{sport}/{season}/rankings, GET /{sport}/{season}/consensus-rankings
```

### Sleeper — docs and header dump

```
$ curl -s "https://docs.sleeper.com" | grep -io "adp\|average draft position"
(no matches)

Documented draft-related endpoints (verbatim anchor text from docs.sleeper.com):
#get-a-specific-draft
#get-all-drafts-for-a-league
#get-all-drafts-for-user
#get-all-picks-in-a-draft
#get-traded-picks-in-a-draft

$ curl -s -D - -o /tmp/sleeper_players.json "https://api.sleeper.app/v1/players/nfl" -H "Origin: https://example.com"
HTTP/2 200
content-type: application/json; charset=utf-8
access-control-allow-credentials: true
access-control-allow-origin: *
access-control-expose-headers: etag,date
```
(This endpoint is bulk player metadata, ~14.6MB, no ADP field.)

### ESPN — header dump and sample record

```
$ curl -s -D - -o /dev/null "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/players?scoringPeriodId=0&view=kona_player_info" \
    -H 'x-fantasy-filter: {"players":{"limit":1}}' -H "Origin: https://eplmockdrafter.pages.dev" -A "Mozilla/5.0" | grep -i access-control
access-control-allow-origin: https://eplmockdrafter.pages.dev
access-control-allow-credentials: true
access-control-allow-methods: GET,PUT,POST,DELETE,OPTIONS,HEAD

# Repeated with a different Origin — reflected again:
Origin: https://evil.example.org → access-control-allow-origin: https://evil.example.org
Origin: https://example.com      → access-control-allow-origin: https://example.com
```

Sample player record (trimmed) showing the ADP field:
```json
{
  "fullName": "Jaishawn Barham",
  "id": 4685266,
  "defaultPositionId": 11,
  "proTeamId": 6,
  "ownership": {
    "averageDraftPosition": 170.14,
    "averageDraftPositionPercentChange": -0.04,
    "percentOwned": 1.32,
    "percentStarted": 0.27
  }
}
```

### FantasyPros official Consensus Rankings API — spec fetch and auth check

```
$ curl -s -D - "https://api.fantasypros.com/public/v2/docs/fantasypros_v2_public.yml" -A "Mozilla/5.0" | head -5
HTTP/2 200
content-type: application/json      # (mislabeled — body is actually YAML)

$ head -c 300 /tmp/fp_spec.yml
openapi: 3.1.1
info:
  title: FantasyPros Public API
  description: >-
    This is the free limited public API. To request an API key, go to
    https://secure.fantasypros.com/api-keys/request/ and apply. The base url for
    this API is: https://api.fantasypros.com/public/v2/json

$ curl -s -D - "https://api.fantasypros.com/public/v2/json/nfl/2026/consensus-rankings?type=ADP" -H "Origin: https://example.com" -A "Mozilla/5.0"
HTTP/2 403
content-type: application/json
x-amzn-errortype: ForbiddenException
{"message":"Forbidden"}
(no access-control-* header present)
```

Relevant OpenAPI schema excerpts (from `fantasypros_v2_public.yml`):
```yaml
securitySchemes:
  api_key:
    type: apiKey
    name: x-api-key
    in: header

NFLRankingTypes:
  enum: [WW, WAIVER, ROS, DRAFT, PRESEASON, SLEEPERS, ADP, BEST, PROSPECT, PRO,
         DEVY, ROOKIES, DYNADP, RKADP, BESTADP, DYNASTY, PRE, DRAFTERS, MOCK]

NFLScoringTypes:
  enum: [STD, PPR, HALF]
  default: STD

PlayerRank:
  properties:
    ECR: {$ref: '#/components/schemas/ECRMetrics'}
    ECR_MIN / ECR_MAX / ECR_AVG / ECR_STD: {...}
    ADP:
      type: object
      required: [ALL]
      properties:
        ALL: {type: integer}
```
`consensus-rankings` 400-error example (confirms K/DST are valid positions):
```yaml
valid_format: "QB, RB, WR, TE, K, DST"
```

### dynastyprocess/data — header dump and column check

```
$ curl -s -D - -o /tmp/db_fpecr_latest.csv \
    "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_fpecr_latest.csv" \
    -H "Origin: https://example.com" | grep -i "access-control\|content-type"
content-type: text/plain; charset=utf-8
access-control-allow-origin: *

$ head -1 /tmp/db_fpecr_latest.csv
fp_page,page_type,ecr_type,player,id,pos,team,ecr,sd,best,worst,sportsdata_id,player_filename,yahoo_id,cbs_id,player_owned_avg,player_owned_espn,player_owned_yahoo,player_image_url,player_square_image_url,rank_delta,bye,mergename,scrape_date,tm
# no "adp" column present; fp_page values are /nfl/rankings/*.php, not /nfl/adp/*.php
```
