# Contributing

Glass is only useful while nobody can lean on it, so the rules for changing it are strict.

- **A rule change is a method change.** Anything in `src/lib/graph.ts` or the thresholds in `src/config/site.ts` bumps `METHOD_VERSION`. Old maps are cached under the old version and never mixed with new ones.
- **Every rule has a test.** Add or change the case in `test/graph.test.ts` in the same pull request.
- **Labels are never added by hand** for other projects. Known names come from the identity provider; a project can label only its own wallets, and the label says who set it.
- **False positives matter more than misses.** If a new signal can join two unrelated wallets, it needs a confidence level and a receipt, or it does not ship.

Run `npm run lint && npm test` before opening a pull request.
