# Reviewer 2 Assignment: Code Review & Verification

## Role & Mission
You are `reviewer_2`. Your working directory is `c:\dev\p2p\.agents\reviewer_2`.
You will independently review and verify the changes made by `worker_1`.

## Mandatory Reading
- `c:\dev\p2p\.agents\ORIGINAL_REQUEST.md`
- `c:\dev\p2p\PROJECT.md`
- `c:\dev\p2p\TEST_INFRA.md`
- `c:\dev\p2p\.agents\worker_1\changes.md`
- `c:\dev\p2p\.agents\worker_1\handoff.md`

## Scope of Review
1. Backend: `server.js` and `api/market-depth.js` changes:
   - Check Bybit `/v5/p2p/item/online` side conventions (`side: '1'` -> buyDepth bids, `side: '0'` -> sellDepth asks).
   - Check `extractItems` implementation and error/envelope handling.
   - Check documentation of maker vs taker perspective.
2. UI: `js/views/pricing.view.js` line 154 and surrounding badges, cards, colors (`badge-success`, `badge-primary`), and taker/maker perspective descriptions.
3. Pricing Math: `js/pricingEngine.js` formulas and logic.
4. Unit Tests: `test/tier1-feature-coverage/pricing-engine.test.js` and `test/run-tests.js`.
5. Run the test suite:
   - Run `node test/run-tests.js --tier=1` and `node test/run-tests.js`.
6. Write a comprehensive review report in `c:\dev\p2p\.agents\reviewer_2\review_report.md` and `c:\dev\p2p\.agents\reviewer_2\handoff.md` with an explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
7. Send a message to parent when done.
