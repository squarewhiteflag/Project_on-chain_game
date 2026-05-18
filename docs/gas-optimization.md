# Gas Optimization

## Implemented Choices

### Packed Integer Sizes

The contract uses smaller integer widths where values are naturally bounded:

- `uint64` for timestamps and `uint256` for Chainlink-compatible request ids
- `uint32` for ticket counts and winning tickets
- `uint128` for wagers, bonds, ticket prices, and pots
- `uint8` for dice roll thresholds

This reduces storage use for game records.

### Liability Buckets

Reserved funds are tracked per token in aggregate mappings. This avoids scanning active games when calculating available bankroll.

### Bounded Raffle Rounds

Each raffle round accepts at most 500 entries. This keeps the finalization loop predictable and gives the team a clear gas bound to explain during the presentation.

### Batch Seed Reveals

`batchRevealRaffleSeeds` lets one player reveal several raffle entries in one transaction. It validates the reveal window once, refunds the aggregate bond once, and reduces frontend transaction friction compared with repeated single-entry reveals.

### Paged Entry Reads

`getRaffleEntries` returns bounded slices of raffle entries for the frontend and audits. This avoids trying to return an unbounded dynamic array from a public view path.

### Single Randomness Request Per Game Action

Dice and raffle draw flows request one random word and reuse it through settlement. There is no polling loop.

### Stale Callback No-Op

Stale callbacks return early rather than reverting. This keeps retry handling simple and avoids blocking the coordinator if an old request eventually arrives.

### Memory Config Reads

Token configuration is copied into memory where it is reused for payout and fee calculations.

## Gas-Sensitive Functions

- `commitDiceBet`: ERC-20 transfers and VRF request dominate.
- `revealDiceSeed`: payout transfer plus settlement state writes.
- `buyRaffleTickets`: entry write and accounting updates.
- `batchRevealRaffleSeeds`: loop over caller-owned entries and one aggregate payout.
- `finalizeRaffle`: loops over all entries to slash unrevealed bonds and find the winning ticket.

## Measured Commands

```bash
forge test --gas-report
forge test -vv --gas-report
```

## Latest Gas Report

Measured after the raffle cap and batch reveal enhancement with `forge test --gas-report`.

| Operation | Average Gas | Notes |
| --- | ---: | --- |
| `commitDiceBet` | 311,078 | Includes payment collection and mock randomness request. |
| `revealDiceSeed` | 61,213 | Includes settlement, accounting, and payout/refund. |
| `buyRaffleTickets` | 147,637 | Average includes many cap-test entries; max observed 219,032. |
| `drawRaffle` | 147,844 | Includes guarded coordinator request. |
| `revealRaffleSeed` | 78,076 | Includes aggregate seed update and bond refund. |
| `batchRevealRaffleSeeds` | 98,275 | Reveals two entries and performs one aggregate refund in the regression test. |
| `finalizeRaffle` | 103,201 | Current tests use small rounds; the contract caps each round at 500 entries. |

Deployment size for `ChainFateArena` is 15,609 bytes, below the 24KB EVM contract-size limit discussed in the course material.

## Future Optimizations

- Replace linear winner lookup with an indexed cumulative tree for large raffles.
- Split dice and raffle modules if code size becomes a constraint.
- Use unchecked increments in loops after bounds are formally justified.
- Replace local mock/demo code with production dependencies only in deployment builds.
