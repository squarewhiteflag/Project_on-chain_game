# Test and Coverage Report

Generated locally on Foundry `1.5.1-stable`.

## Commands

```bash
cp .env.example .env   # optional; only needed for deployments
npm ci
npm --prefix frontend ci
forge fmt --check
forge build
forge test
forge coverage --report summary
forge test --gas-report
npm --prefix frontend run build
/Users/zhy/Library/Python/3.13/bin/slither . --exclude-dependencies
```

If `npm --prefix frontend ci` is not available on your npm version, use:

```bash
npm --prefix frontend install
```

## Results

- Build: successful.
- Tests: 16 passed, 0 failed.
- Coverage summary including scripts and imported Chainlink base contracts: 337 / 449 lines, **75.06% line coverage**.
- Core game contract coverage: 249 / 284 lines, **87.68% line coverage**.
- Chainlink adapter contract coverage: 29 / 33 lines, **87.88% line coverage**.
- Frontend Vite/React production build: successful.
- Frontend helper tests: 3 passed, 0 failed.
- Slither static analysis: completed; residual design findings are documented in `slither-report.md`.
- Chainlink adapter integration tests: successful.
- New regression coverage: batch raffle seed reveal, paged raffle entry reads, and round entry cap.

## What Each Test Group Proves

- Unit tests cover dice win/loss settlement, wrong seed rejection, randomness retry, expired reveal slashing, raffle purchase, seed reveal, finalization, treasury fees, ERC-20 gameplay, and owner/pause controls.
- Integration tests cover game contract interaction with the local VRF coordinator and the Chainlink VRF adapter boundary.
- Fuzz tests cover invalid dice roll thresholds and raffle ticket accounting.
- Invariant-style testing checks that reserved ETH/ERC-20 liabilities remain solvent.
- Gas evidence is produced with `forge test --gas-report`, including the capped raffle finalization path and the batch reveal path.

## CI

The repository includes `.github/workflows/ci.yml`. On push or pull request, it runs:

- `npm ci`
- `forge fmt --check`
- `forge build`
- `forge test`
- `forge test --gas-report`
- frontend dependency install, `npm test`, and `npm run build`

## Notes

- `forge test` currently passes in this environment.
- `forge coverage --report summary` can take longer because it instruments contracts and compiles third-party dependencies.
