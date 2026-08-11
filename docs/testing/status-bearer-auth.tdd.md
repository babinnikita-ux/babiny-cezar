# Cezar status Bearer authentication — TDD evidence

## RED

- Baseline: `c4246646cab290ed2c8e20f7d07485ade5ee3631`
- Command: `npm run test:babiny` with Node.js `v22.23.2`
- Result: expected failure, `9 passed / 1 failed`.
- Regression: an unauthenticated `GET /api/status` returned HTTP `200`; the
  new test required HTTP `401`.
- Test checkpoint: `e97a5283` (`test: require bearer auth for status API`).

## GREEN

- Added a dedicated absolute `statusTokenFile` deployment setting.
- The adapter reads and validates the status token before opening its socket;
  a missing or invalid token prevents startup.
- Both `/api/status` and `/status` require an exact Bearer credential checked
  with fixed-length HMAC digests and `timingSafeEqual`.
- `/healthz` remains public on loopback and GitHub webhook HMAC verification is
  unchanged.
- Command: `npm run test:babiny` with Node.js `v22.23.2`.
- Initial GREEN result: `10 passed / 0 failed`.

The final commit and CI checks retain this file so the RED/GREEN sequence is
reviewable after squash merge.
