# Dev mock

`npm run dev:mock` serves the UI against an in-memory fake of the FatoorahFlow API (no backend needed).

- `sample-invoice.pdf / .png` is a bilingual tax invoice. Its grand total is deliberately wrong
  (2,873.00 instead of 2,783.00) so the review flow has a real finding to correct.
- Uploading any PDF runs a ~8 s fake job (render, extract, validate), then opens the sample invoice data.
- `build_sample.py` regenerates the sample and its evidence boxes (needs Playwright).

Only imported when `VITE_MOCK` is set; not part of the production bundle.
