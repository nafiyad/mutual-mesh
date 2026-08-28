# Mutual Mesh

Mutual Mesh is a human-agent community coordination canvas. It turns a goal, locked constraints, and scattered offers of help into a visible, versioned plan that people can inspect and control.

This repository currently contains the roadmap foundation milestone:

- deterministic Career Night demo scenario;
- typed goal, constraint, participant, contribution, task, plan, commitment, and activity entities;
- invariant checks and version-safe plan mutations;
- local persistence with a safe reset path;
- searchable contributions and a human-operated gap-closing flow;
- automated foundation tests; and
- the responsive Mutual Mesh interface and brand system.

WebMCP tool registration is the next roadmap milestone. The interface deliberately labels that capability as upcoming until real tools are discoverable.

## Run locally

Requirements: Node.js 22.13 or newer and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validate

```bash
npm test
npm run lint
npm run build
```

## Architecture

The human interface and future WebMCP adapters share one domain layer:

```text
Human UI ─┐
          ├─> coordination services ─> invariant checks ─> versioned store
WebMCP ───┘                                      └───────> activity history
```

Important directories:

- `data/` — deterministic fictional demo data
- `domain/` — shared types, invariants, and scoring
- `services/` — transactional coordination operations
- `store/` — versioned local persistence and migration boundary
- `test/` — automated domain tests
- `app/` — product interface and metadata

No real participant data is stored. The current MVP uses device-local persistence and requires no API key.

## License

MIT — see [LICENSE](LICENSE).
