# Careers Applications — Location Resolution & State → City Filter

How a single free-text location from the public careers form becomes a
canonical `current_city` + `state`, and how the dependent **State → City**
filter on the admin screen works, end to end.

- Backend module: `src/modules/invictusEnquiry/`
- Location resolver: `src/services/locationResolver.js`
- Geoapify config: `src/config/geoapify.config.js`
- Shared helpers: `src/utils/locationText.js`, `src/utils/filterOptions.js`, `src/utils/ttlCache.js`
- Frontend: `invictus_lead_admin/src/components/common/LocationFilter.tsx`
- Screens: `pages/enquiries/CareersApplicationsPage.tsx`, `pages/enquiries/EnquiriesPage.tsx` (careers tab)

---

## 1. Design goals

| Goal | How |
|---|---|
| Applicant enters free-text city + state; we store a canonical verified pair when possible | `resolveLocation()` — alias map → Geoapify city search (India-only) → confidence check → fallback |
| Geocoding must never block an application | every resolver path returns a usable object; failures fall back to normalized text + `state = null` |
| Geoapify key stays server-side | only read in `src/config/geoapify.config.js` / `locationResolver.js`; never sent to the browser |
| Admin filter reflects **verified applicant data**, not a hardcoded India list | state/city queries require `location_verified = true` |
| City works standalone, narrows under State | `/careers/filters` (no `?state=`) returns the **full** city list; `?state=` returns only that state's cities. Picking a State resets + re-scopes City. |
| No garbage / duplicate values | canonicalized on write + `backfill:locations` for history |
| Fast | per-list SQL `GROUP BY`, cached 7 min, composite `(location_verified, state, current_city)` index; only verified geocode results cached 24 h |
| Reusable | `<LocationFilter cityRequiresState />` component; generic `filterOptions.js` helpers |
| Admin actions avoid unnecessary Geoapify calls | resolver runs on create and when an update changes city or state; status/notes-only updates skip it |

---

## 2. Data model

`invictus_careers_applications` (`src/database/tables/InvictusCareersApplicationTable/index.js`)

| Column | Type | Notes |
|---|---|---|
| `current_city` | STRING `NOT NULL` | canonical city |
| `state` | STRING nullable | canonical Indian state / UT, or `NULL` |
| `location_verified` | BOOLEAN `NOT NULL` | `true` only for an accepted Geoapify city result or a city in the offline map |

Indexes: `current_city`, `state`, and composite
**`invictus_careers_verified_state_city_idx (location_verified, state, current_city)`** — declared on the model and ensured at boot for existing DBs by
`src/database/migrations/ensureInvictusEnquiryColumns.js`.
The same boot migration adds `location_verified` with a safe `false` default,
then marks only existing rows resolved by the offline city map as verified.

---

## 3. `src/utils/locationText.js`

| Export | Purpose |
|---|---|
| `normalizeLocationValue(raw)` | trim → collapse spaces → Title Case; `""` for junk (`n/a`, `none`, `city`, `state`, `-`, numeric-only, …) |
| `isValidLocationValue(raw)` | boolean form of the above |
| `CITY_ALIASES` | lower-cased alias map: `bangalore→Bengaluru`, `trichy→Tiruchirappalli`, `madras→Chennai`, spelling fixes (`jhanshi→Jhansi`, `manglore→Mangaluru`, `trivandrum→Thiruvananthapuram`), and common localities → parent city (`vadapalani/nungambakkam/velachery→Chennai`, `whitefield→Bengaluru`). Deliberately NOT a full city list. |
| `canonicalizeCity(raw)` | `normalizeLocationValue` + alias map |
| `canonicalizeState(raw)` | returns the canonical name only if `raw` is a recognised Indian state / UT, else `""` |
| `CITY_STATE` / `stateForCity(city)` | deterministic city → state map for the metros / tier-2 cities that turn up in applications (TN-heavy). Lets the resolver infer a state **without Geoapify** — on write and in the backfill. |

---

## 4. Geoapify config — `src/config/geoapify.config.js`

`getGeoapifyConfig()` reads env **fresh on each call** (test-friendly):

```
GEOAPIFY_API_KEY            backend-only secret. Optional.
GEOAPIFY_GEOCODING_ENABLED  "true" / "1" to enable. Optional — defaults to
                            enabled when a key is present.
```

`enabled` is `true` only when a non-empty key is present **and** the flag isn't
explicitly `false`. Neither var is required by `server.config.js` — a missing
key just means the resolver always uses its fallback. Endpoint / timeout:
`https://api.geoapify.com/v1/geocode/search`, 4 s.

---

## 5. Location resolver — `src/services/locationResolver.js`

`resolveLocation(rawLocation, rawState)` →
`{ city, state, country, countryCode, source: "geoapify" | "fallback", verified }`

```
normalizeLocationValue(raw)                       ── "" ? → { city:"", state:null, fallback }
        │
parseCommaInput()   "Chennai, Tamil Nadu" / "Tamil Nadu, Chennai"
        │           → cityGuess (canonicalizeCity), stateGuess (canonicalizeState)
        │
24h in-process cache  key = location:<lowercased normalized>   ── verified hit → return
        │
getGeoapifyConfig().enabled === false  ── → fallback { cityGuess, stateGuess||null }
        │
fetch  GET /v1/geocode/search?text=<cityGuess[, stateGuess]>
              &filter=countrycode:in&type=city&limit=1&format=json&apiKey=***
       AbortSignal.timeout(4s)
        │
   !res.ok | no results | non-India | non-city | confidence < 0.7 ── → unverified fallback
        │
   extractCity(r) = r.city || r.town || r.municipality || r.county
                    || r.village || r.suburb        ← locality → parent city
        │
   { city: canonicalizeCity(extractCity), state: canonicalizeState(r.state) || stateGuess || null,
     country, countryCode:"in", source:"geoapify", verified:true }
        │
   verified ? cache.set(key) : do not cache ; return
```

Any `throw` (timeout / HTTP error / bad JSON / network) is caught, logged as
`[Geoapify] location resolution failed for "<city>": <message>. Using fallback.`
(no key in the message), and the fallback object is returned.

---

## 6. Create / update — `invictusEnquiry.service.js`

`resolveCareersLocation(rawCity, providedState)` wraps the resolver:

```
current_city = resolved.city  || canonicalizeCity(rawCity)
state        = resolved.state || canonicalizeState(providedState)
                              || stateForCity(current_city)
location_verified = resolved.verified === true
```

- **`createCareersApplicationPublic`** — rejects numeric/symbol-only cities, then calls `resolveCareersLocation(current_city, state)`; Geoapify receives both fields, the canonical pair is stored, and `invalidateCareersFiltersCache()` is called.
- **`updateCareersApplication`** — re-resolves when either `payload.current_city`
  or `payload.state` actually changes. Status / notes edits never trigger geocoding.

Backward compatible: a caller still sending `{ current_city, state }` works —
the resolved city wins, and the provided state is the last-resort fallback
(after resolver + `canonicalizeState`).

---

## 7. Filter options — `GET /api/v1/invictus-enquiries/careers/filters[?state=]`

Auth-protected. Controller `getCareersApplicationFilters` → `getCareersFilters({ state })`.

```json
{ "success": true, "data": {
    "state": "Tamil Nadu" | null,
    "states":   [{ "name": "Tamil Nadu", "count": 21 }, ...],   // always full list
    "cities":   [{ "name": "Chennai", "count": 12 }, ...],      // full list, or scoped when ?state= given
    "roles":    [{ "name": "Video Editor", "count": 3 }, ...],
    "statuses": [{ "name": "New", "count": 8 }, ...]
}}
```

`getCareersFilters`:

| List | Query | Cache key |
|---|---|---|
| states | `SELECT state, COUNT(id) … WHERE location_verified=1 AND state<>'' GROUP BY state` | `careers:states` |
| roles | `GROUP BY role` | `careers:roles` |
| statuses | `GROUP BY status` | `careers:statuses` |
| cities | always `location_verified=1`; optionally adds `state = :state`; groups by `current_city` | `careers:cities:__all__` / `careers:cities:<State>` |

`buildCareersFilterResult()` (pure, unit-tested) normalizes location options
and excludes invalid legacy values such as numeric-only cities. The caller
(`getCareersFilters`) picks the full-list or state-scoped query.

`GET /careers/locations` (legacy) still works and returns the **full** city list
as plain string arrays.

---

## 8. Cache — `src/utils/ttlCache.js`

`TtlCache`, 7-minute TTL, one instance holding the keys above.
`invalidateCareersFiltersCache()` = `cache.clear()` — called on every careers
**create / update / delete**. The resolver has its own separate 24 h cache.

> Single-process. Multi-instance → swap both `TtlCache` instances for Redis
> behind the same `get / set / clear` interface.

---

## 9. List + CSV filtering — strict, canonical

`listCareersApplications` and `exportCareersApplicationsCSV`:

```js
if (state) andConditions.push({ state });            // exact (MySQL '=' is case-insensitive)
if (city)  andConditions.push({ current_city: city }); // exact
```

No fuzzy fallback. A **State filter never searches `current_city`**. Incoming
values are run through `normalizeLocationValue` first. CSV export now honours
`state` + `city` in addition to `search` / `status` / `role`.

---

## 10. Frontend — `<LocationFilter cityRequiresState />`

Props: `value {state, city}`, `onChange`, `fetchOptions({state?})`, `dark?`,
`cityRequiresState?`.

- Both dropdowns are MUI `Autocomplete` (searchable); label shows the count
  (`Chennai (12)`).
- **No state selected** → City is enabled and shows the **full** city list
  (`fetchOptions({})` → backend full list). Admin can filter by city directly.
- Selecting a State → `onChange({ state, city: '' })` (city reset; page → 1)
  → `load(state)` **clears `cities` to `[]` before** the request (no stale
  Tamil Nadu list while Karnataka loads) → City now shows only that state's cities.
- `cityRequiresState` prop (default `false`, **not set** on the careers screens):
  set it `true` on a screen that should force State-first (City disabled,
  placeholder “Select a state first”).
- **Race guard**: `requestSeq` ref — if Tamil Nadu's response lands after the
  user has moved to Maharashtra, it is discarded.
- Selected value falls back to a synthetic `{ name, count: 0 }` option so a
  filter restored across pagination still displays before options load.
- Clearing State → `onChange({ state:'', city:'' })` → City goes back to the
  full list, table refetches unconstrained.

Filter state lives on the page (`stateFilter` / `cityFilter`) so it survives
pagination and is independent of search / role / status.

---

## 11. Environment

```
# invictus_lead_backend/.env  (and .env.example)
GEOAPIFY_API_KEY=""             # optional
GEOAPIFY_GEOCODING_ENABLED="true"
```

| Env | `GEOAPIFY_API_KEY` | Behaviour |
|---|---|---|
| Local | optional | without it, resolver uses alias map + comma parse only |
| Stage | recommended | live geocoding for realistic data |
| Production | recommended | live geocoding; absence is safe (fallback), just less state coverage |

Never expose the key to the frontend, never log it, never commit a real value.

---

## 12. Backfill — `npm run backfill:locations [-- --dry-run]`

`src/scripts/backfillInvictusLocations.js` runs `resolveLocationOffline`
(normalize + alias + `"City, State"` comma parse + `CITY_STATE` map) over
existing rows:

- canonicalizes `current_city` (`bangalore` → `Bengaluru`, `Erode, Tamilnadu` → `Erode`)
- **fills `state` for rows that never had one**, inferred from the city map
- normalizes existing state values; nulls invalid ones
- marks offline-map matches verified; unresolved rows remain stored but hidden from filters
- prints cities it could not resolve (genuine junk like `city`, `test`) for manual review

**It does not call Geoapify** — no bulk geocoding on deploy. Run it once after
deploying this change; on the current data it canonicalizes 21 cities and
infers a state for ~197 / 209 careers rows (the rest are junk city values).

---

## 13. Tests

```bash
npm test                     # full suite (includes the two below)
npm run test:careers-filters   # normalization, option assembly, full vs state-scoped city list, city→state map
npm run test:careers-resolver  # resolver with a fully MOCKED Geoapify (no network / key / quota)
```

`verifyCareersLocationResolver.js` covers: `Chennai`, `Bangalore`→`Bengaluru`,
`Trichy`→`Tiruchirappalli`, already-canonical, `"Chennai, Tamil Nadu"`,
`"Tamil Nadu, Chennai"`, whitespace/case, locality→parent city, timeout,
HTTP 500, empty results, non-India result, geocoding disabled, missing key.

---

## 14. End-to-end

```
PUBLIC FORM  current_city: "Bangalore"
  POST /careers/public
    → resolveLocation("Bangalore", providedState)
        alias → "Bengaluru"
        Geoapify (if enabled) → city "Bengaluru", state "Karnataka"
        (disabled/failed → fallback: city "Bengaluru", state "Karnataka")
    → INSERT current_city="Bengaluru", state="Karnataka", location_verified=true
    → invalidateCareersFiltersCache()

ADMIN  Careers Applications
  <LocationFilter>  → GET /careers/filters
    → states=[Karnataka, …]  cities=[<full list>]   (City usable on its own)
  pick State = Karnataka
    → onChange({state:"Karnataka", city:""})  → cities cleared
    → GET /careers/filters?state=Karnataka
    → cities=[Bengaluru (7), Mysuru (1), …]   (Karnataka only)
  pick City = Bengaluru
    → GET /careers?state=Karnataka&city=Bengaluru&page=1
    → WHERE state='Karnataka' AND current_city='Bengaluru'

  change State Karnataka → Maharashtra
    → Bengaluru selection cleared, Karnataka cities removed immediately,
      Maharashtra cities loaded (stale response race-guarded)
  clear State
    → city cleared + disabled, table refetches unconstrained

CSV export respects state + city + role + status + search.
```
