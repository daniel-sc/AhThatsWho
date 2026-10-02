# Local image storage benchmark

Run on 2026-10-02 using the Playwright CLI. These are synthetic measurements, not production or physical mobile-device results.

## Method

- Linux x86_64, Intel Xeon 2.20 GHz, 2 logical CPUs, approximately 7.75 GiB RAM; headless browsers with persistent profiles.
- Dexie asset table storing JPEG Blobs versus OPFS files containing identical JPEG bytes within each browser. OPFS uses `getFileHandle().getFile()`, not worker-only synchronous access handles. Directory/database initialization is outside timed sections; per-file lookup is inside.
- Synthetic textured 1024-pixel JPEG images and 192-pixel previews, encoded at quality 0.82. Images are not real portraits. Encoded size varies; total assets at 1,000 portraits are approximately 128 MiB per backend in Chromium/WebKit and 140 MiB in Firefox.
- Grow from 100 to 1,000 portraits plus their previews. Reads use the same first 100 asset IDs at both sizes, so 900 additional portraits simulate accumulated assets outside the working set.
- Twenty rounds, alternating backend order. Each preview batch contains 12 parallel images; each portrait batch contains four parallel images. Distinct measurements: Blob/File lookup, lookup plus consuming an ArrayBuffer, and lookup plus `Image.decode()` via a fresh object URL. URLs are revoked afterward.
- Byte-read and decode tests follow lookup tests, so these are warmed workloads. Separate first-access-after-page-reload measurements are recorded, but neither page reload nor browser restart clears OS disk caches. No claim of physical cold-disk performance or paint/frame-rate performance.
- The initial private-context trial was discarded: WebKit failed setup, and private contexts do not establish normal disk-backed behavior. All tables below use the successful persistent-profile run.

## Image reads

Times in milliseconds, median / nearest-rank p95 for the whole batch; 20 samples per cell.

| Browser | Portraits stored | Image size | Operation | IndexedDB | OPFS |
|---|---:|---:|---|---:|---:|
| chromium 153.0.8010.12 | 100 | 192 | lookup | 2.8 / 6.8 | 3.4 / 4.0 |
| chromium 153.0.8010.12 | 100 | 192 | bytes | 5.7 / 8.1 | 7.9 / 11.7 |
| chromium 153.0.8010.12 | 100 | 192 | decode | 29.2 / 31.5 | 31.5 / 38.0 |
| chromium 153.0.8010.12 | 100 | 1024 | lookup | 1.3 / 1.5 | 1.5 / 1.7 |
| chromium 153.0.8010.12 | 100 | 1024 | bytes | 3.8 / 4.0 | 5.1 / 7.0 |
| chromium 153.0.8010.12 | 100 | 1024 | decode | 51.8 / 64.9 | 53.9 / 58.1 |
| chromium 153.0.8010.12 | 1000 | 192 | lookup | 2.8 / 4.1 | 3.4 / 4.1 |
| chromium 153.0.8010.12 | 1000 | 192 | bytes | 5.9 / 6.3 | 7.8 / 8.5 |
| chromium 153.0.8010.12 | 1000 | 192 | decode | 27.5 / 33.2 | 30.3 / 38.3 |
| chromium 153.0.8010.12 | 1000 | 1024 | lookup | 1.3 / 1.7 | 1.6 / 2.3 |
| chromium 153.0.8010.12 | 1000 | 1024 | bytes | 3.7 / 4.7 | 5.3 / 6.2 |
| chromium 153.0.8010.12 | 1000 | 1024 | decode | 42.2 / 55.7 | 46.7 / 58.9 |
| webkit 26.6 | 100 | 192 | lookup | 3.0 / 5.0 | 4.0 / 5.0 |
| webkit 26.6 | 100 | 192 | bytes | 10.0 / 13.0 | 7.0 / 9.0 |
| webkit 26.6 | 100 | 192 | decode | 91.0 / 99.0 | 89.0 / 93.0 |
| webkit 26.6 | 100 | 1024 | lookup | 2.0 / 3.0 | 2.0 / 4.0 |
| webkit 26.6 | 100 | 1024 | bytes | 7.0 / 8.0 | 6.0 / 7.0 |
| webkit 26.6 | 100 | 1024 | decode | 123.0 / 133.0 | 123.0 / 135.0 |
| webkit 26.6 | 1000 | 192 | lookup | 5.0 / 8.0 | 3.0 / 4.0 |
| webkit 26.6 | 1000 | 192 | bytes | 11.0 / 15.0 | 7.0 / 9.0 |
| webkit 26.6 | 1000 | 192 | decode | 93.0 / 109.0 | 88.0 / 94.0 |
| webkit 26.6 | 1000 | 1024 | lookup | 2.0 / 3.0 | 1.0 / 3.0 |
| webkit 26.6 | 1000 | 1024 | bytes | 7.0 / 9.0 | 6.0 / 7.0 |
| webkit 26.6 | 1000 | 1024 | decode | 125.0 / 133.0 | 124.0 / 131.0 |
| firefox 155.0 | 100 | 192 | lookup | 6.0 / 9.0 | 9.0 / 11.0 |
| firefox 155.0 | 100 | 192 | bytes | 8.0 / 12.0 | 10.0 / 12.0 |
| firefox 155.0 | 100 | 192 | decode | 20.0 / 42.0 | 22.0 / 24.0 |
| firefox 155.0 | 100 | 1024 | lookup | 3.0 / 3.0 | 3.0 / 4.0 |
| firefox 155.0 | 100 | 1024 | bytes | 5.0 / 7.0 | 6.0 / 8.0 |
| firefox 155.0 | 100 | 1024 | decode | 39.0 / 45.0 | 40.0 / 51.0 |
| firefox 155.0 | 1000 | 192 | lookup | 6.0 / 12.0 | 9.0 / 20.0 |
| firefox 155.0 | 1000 | 192 | bytes | 8.0 / 9.0 | 10.0 / 14.0 |
| firefox 155.0 | 1000 | 192 | decode | 19.0 / 24.0 | 21.0 / 26.0 |
| firefox 155.0 | 1000 | 1024 | lookup | 2.0 / 3.0 | 3.0 / 4.0 |
| firefox 155.0 | 1000 | 1024 | bytes | 4.0 / 7.0 | 5.0 / 7.0 |
| firefox 155.0 | 1000 | 1024 | decode | 39.0 / 45.0 | 39.0 / 42.0 |

## Unrelated text-read follow-up

In the main run, the median time to read 500 text records in WebKit rose from 9 ms at 100 portraits to 52 ms at 1,000 portraits. Chromium remained at 4.3 ms; Firefox went from 4 ms to 3 ms.

A second Playwright run reopened each persistent profile, copied those exact 500 records into a fresh text-only database, and alternated 30 reads from each database. It then cleared only the synthetic IndexedDB asset table and repeated the reads. OPFS files remained. Each cell is median / p95 milliseconds.

| Browser | With assets: existing DB | With assets: control DB | After clearing assets: existing DB | After clearing assets: control DB |
|---|---:|---:|---:|---:|
| chromium | 3.8 / 5.5 | 3.8 / 5.1 | 4.3 / 4.6 | 3.8 / 6.1 |
| webkit | 51.0 / 53.0 | 4.0 / 6.0 | 50.0 / 53.0 | 4.0 / 7.0 |
| firefox | 4.0 / 7.0 | 4.0 / 6.0 | 3.0 / 6.0 | 3.0 / 4.0 |

## Interpretation

Image retrieval was not universally faster through either backend. In this workload, Chromium generally favored IndexedDB, WebKit favored OPFS for byte reads, and Firefox favored IndexedDB or tied. Differences in complete decode times were modest relative to decode cost.

The WebKit text-read result is a material reason not to assume adding asset storage to the main notebook database is free. It survives browser restart and asset-table clearing. Its underlying cause is not isolated: this could involve the database's growth/history or an engine-specific behavior; it is not proof that every large IndexedDB database has this slowdown. A separate text-only database on the same origin stayed fast.

Recommendation: keep the concrete backend decision open, and avoid committing to the shared-database layout. OPFS assets with IndexedDB notebook metadata (high integration complexity) fit the originally proposed file-store model. A separate IndexedDB asset database (medium integration complexity) is another candidate, but also loses atomic transactions with the notebook database. Neither candidate has been implemented in the app.

Subsequent decision: the user selected OPFS with immutable files written and verified before saving references, accepting unused files until later cleanup. The accepted policy is in [the design decisions](person-image-design-decisions.md); the recommendation above records the state at the time of this benchmark.

## Reproduction artifacts

The benchmark lives at `/tmp/person-image-storage-bench/` in this workspace session. It contains `bench.html`, `server.cjs`, `bench.spec.cjs`, `playwright.config.cjs`, `textprobe.spec.cjs`, `probe.config.cjs`, `summarize.cjs`, raw per-browser JSON samples, and `summary.json`.

Run from the repository root:

```sh
npx playwright test --config=/tmp/person-image-storage-bench/playwright.config.cjs
npx playwright test --config=/tmp/person-image-storage-bench/probe.config.cjs
node /tmp/person-image-storage-bench/summarize.cjs
```

The follow-up clears only the benchmark asset table; it does not touch application data. The harness uses local absolute paths and installed Playwright browsers. Main run: 3 passed; follow-up: 3 passed. Physical iPhone/Android testing and worker-based OPFS comparisons remain unperformed.
