# Hoard public API

A small, read-only JSON API over your own library: titles, tier lists, Up next and
stats. It is meant for scripts, dashboards and home automation. Everything it returns
belongs to the token's owner; no other user's data is reachable through it.

Base URL: your Hoard address, for example `https://hoard.timhufnagel.org`. All paths
below start with `/api/v1`.

## Authentication

1. In Hoard, open **Settings → API tokens**, give the token a name (up to 40 characters)
   and choose **Create token**.
2. Copy the token straight away. It looks like `hoard_` followed by 43 letters, digits,
   `-` and `_`, and it is shown **only once**: Hoard keeps just its SHA-256 hash.
3. Send it on every request:

   ```
   Authorization: Bearer hoard_…
   ```

Cookies are ignored: being signed in to Hoard in a browser does not authorise API calls.
You can have up to 10 tokens. **Revoke** deletes a token, and requests that use it get
`401` from then on. The Settings list shows when each token was created and last used
(updated at most once a minute).

Treat a token like a password. It can read everything in your library, notes and diary
included.

## Rate limit

60 requests a minute per token, counted over a sliding minute. Every authorised response
carries:

- `X-RateLimit-Limit: 60`
- `X-RateLimit-Remaining: <requests left in the current minute>`

Over the limit you get `429 Too Many Requests` with a `Retry-After` header (seconds).
The counter lives in the server's memory and starts over when Hoard restarts.

## Errors

Errors are JSON with a stable `code` and a readable `message`:

```json
{ "error": { "code": "unauthorized", "message": "This token is unknown or has been revoked." } }
```

| Status | `code`         | When |
|--------|----------------|------|
| 400    | `bad_request`  | An unknown `category` or `status`, a `limit` that isn't 1–100, or a cursor Hoard didn't issue. |
| 401    | `unauthorized` | No `Authorization: Bearer` header, a malformed token, or an unknown or revoked one. The response has `WWW-Authenticate: Bearer realm="hoard"` (with `error="invalid_token"` when a token was sent). |
| 404    | `not_found`    | The title isn't in your library, or the category doesn't exist. |
| 429    | `rate_limited` | More than 60 requests in a minute. See `Retry-After`. |
| 500    | `internal`     | Something broke on the server. Try again later. |

Responses are never cached (`Cache-Control: no-store`).

## Values used everywhere

- **`category`**: `books`, `movies`, `tv`, `anime`, `manga`, `games`, `music`.
- **`status`**: `PLANNED`, `CONSUMING` (reading, watching, playing, listening),
  `COMPLETED`, `ON_HOLD`, `RETIRED` (set aside for good), `DROPPED`.
- **`score`**: 0.0–10.0, or `null` when unscored (whatever score format you display in
  Hoard, the API always uses 0–10).
- **`tier`**: `S`, `A`, `B`, `C`, `D`, `F` or `null`.
- Times are ISO 8601 in UTC (`2026-10-28T09:30:00.000Z`); diary days are calendar days
  (`2026-10-28`) in your time zone.

### A title (`Activity`)

```json
{
  "id": "cmvreeqfo0003c47jbrokho4n",
  "category": "books",
  "status": "COMPLETED",
  "score": 9.2,
  "tier": "S",
  "favourite": true,
  "progress": null,
  "tags": ["Classic", "Sci-fi"],
  "notes": "Better than [[Dune Messiah]].",
  "franchise": "Dune",
  "startedAt": null,
  "finishedAt": "2026-10-28T00:50:51.345Z",
  "createdAt": "2026-10-28T00:50:51.348Z",
  "updatedAt": "2026-10-28T16:22:20.974Z",
  "media": {
    "externalId": "/works/OL893415W",
    "title": "Dune",
    "titleEnglish": null,
    "titleRomaji": null,
    "titleNative": null,
    "year": 1965,
    "releaseDate": "1965-08-01",
    "imageUrl": "https://covers.openlibrary.org/b/id/123-L.jpg",
    "genres": ["Science Fiction"]
  }
}
```

`progress` counts pages, chapters, episodes or tracks done (`null` when not tracked).
`media.externalId` is the provider's id: TMDB for movies and TV, MyAnimeList (or
`al-<AniList id>`) for anime and manga, an OpenLibrary key for books, IGDB for games,
a MusicBrainz id or `artist::album` for music, and `manual:…` for titles you entered by
hand. The title variants (`titleEnglish`, `titleRomaji`, `titleNative`) are only filled
for anime and manga.

## Endpoints

### `GET /api/v1/library`

Your titles, oldest added first, one page at a time.

| Query      | Meaning |
|------------|---------|
| `category` | Only this section (optional). |
| `status`   | Only this status (optional, any case). |
| `limit`    | Titles per page, 1–100 (default 50). |
| `cursor`   | The `nextCursor` of the previous page. |

```json
{ "items": [Activity, …], "nextCursor": "eyJ0IjoiMjAyNi0xMC0yOFQw…" }
```

`nextCursor` is `null` on the last page. Cursors are opaque; pass them back unchanged.
Paging is stable while titles are added, because new titles always sort last.

```sh
curl -s -H "Authorization: Bearer $HOARD_TOKEN" \
  "https://hoard.timhufnagel.org/api/v1/library?category=movies&status=completed&limit=100"
```

Fetching everything:

```sh
cursor=""
while :; do
  page=$(curl -s -H "Authorization: Bearer $HOARD_TOKEN" \
    "https://hoard.timhufnagel.org/api/v1/library?limit=100${cursor:+&cursor=$cursor}")
  echo "$page" | jq -r '.items[] | "\(.category)\t\(.media.title)\t\(.score // "-")"'
  cursor=$(echo "$page" | jq -r '.nextCursor // empty')
  [ -z "$cursor" ] && break
done
```

### `GET /api/v1/activity/:id`

One title with its diary (one entry per finished run, newest first) and, for games, its
play sessions.

```json
{
  "activity": {
    …Activity,
    "diary": [{ "date": "2026-10-28", "score": 8.5, "again": false, "review": "Still great." }],
    "playSessions": [{ "date": "2026-10-20", "minutes": 90, "note": "Chapter 3" }]
  }
}
```

`again` is true for a rewatch, reread or replay. A title that isn't yours answers `404`.

```sh
curl -s -H "Authorization: Bearer $HOARD_TOKEN" \
  https://hoard.timhufnagel.org/api/v1/activity/cmvreeqfo0003c47jbrokho4n
```

### `GET /api/v1/tiers/:category`

The section's tier list: each tier in order with 1-based places, then the titles not
placed yet (`unranked`: finished, retired or dropped titles without a tier).

```json
{
  "category": "movies",
  "tiers": {
    "S": [{ "id": "…", "position": 1, "title": "Alien", "year": 1979, "score": 8.8, "status": "COMPLETED", "imageUrl": null }],
    "A": [], "B": [], "C": [], "D": [], "F": []
  },
  "unranked": [{ "id": "…", "position": 1, "title": "Heat", "year": 1995, "score": 8.1, "status": "COMPLETED", "imageUrl": null }]
}
```

```sh
curl -s -H "Authorization: Bearer $HOARD_TOKEN" https://hoard.timhufnagel.org/api/v1/tiers/movies
```

### `GET /api/v1/queue/:category`

The section's Up next: planned titles in your order.

```json
{ "category": "books", "items": [{ "id": "…", "position": 1, "title": "Foundation", "year": 1951, "score": null, "status": "PLANNED", "imageUrl": null }] }
```

```sh
curl -s -H "Authorization: Bearer $HOARD_TOKEN" https://hoard.timhufnagel.org/api/v1/queue/books
```

### `GET /api/v1/stats`

The numbers behind the Stats page's Overview, for the sections you haven't hidden.

```json
{
  "today": "2026-10-28",
  "sections": [{ "slug": "movies", "total": 6, "ongoing": 0, "planned": 2, "completed": 3, "onHold": 0, "retired": 0, "dropped": 1, "avgRating": 7.8, "metricValue": 6, "metricUnit": "hours", "metricVerb": "watched" }],
  "statusMix": [{ "slug": "movies", "total": 6, "counts": { "PLANNED": 2, "CONSUMING": 0, "COMPLETED": 3, "ON_HOLD": 0, "RETIRED": 0, "DROPPED": 1 } }],
  "dropRates": [{ "slug": "movies", "dropped": 1, "ended": 4, "rate": 0.25 }],
  "streaks": { "current": 1, "longest": 4, "longestEnd": "2026-10-28", "activeDays": 12 },
  "year": 2026,
  "finishedPerMonth": { "sections": ["books", "movies"], "months": [{ "month": 1, "counts": { "books": 2 }, "total": 2 }] },
  "topGenres": [{ "genre": "Science Fiction", "count": 5, "avgScore": 8.4 }],
  "scoreByYear": [{ "year": 2026, "avgScore": 8.6, "count": 8 }]
}
```

`finishedPerMonth` covers the current year (12 months). `dropRates.rate` is dropped
÷ ended (finished, retired or dropped), `null` when nothing has ended.

```sh
curl -s -H "Authorization: Bearer $HOARD_TOKEN" https://hoard.timhufnagel.org/api/v1/stats | jq .streaks
```

## Stability

The `v1` shapes only grow: new fields may appear, existing ones keep their names and
meaning. Read-only by design; there are no write endpoints.
