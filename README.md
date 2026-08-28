# Mutual Mesh

Mutual Mesh is a human-agent community coordination canvas. It turns a goal, locked constraints, and scattered offers of help into a visible, versioned plan that people can inspect and control.

This repository contains the roadmap foundation, complete human interface, and first production WebMCP milestone:

- deterministic Career Night demo scenario;
- typed goal, constraint, participant, contribution, task, plan, commitment, and activity entities;
- invariant checks and version-safe plan mutations;
- local persistence with a safe reset path;
- searchable contributions and a human-operated gap-closing flow;
- contribution filters and keyboard-selectable coordination nodes;
- a non-mutating revision preview before any plan change;
- a complete plan inspector with overview, validation, and activity history;
- an ordered validation pipeline covering entity integrity, availability, timing, dependencies, capacity, accessibility, workload, budget, capabilities, consent, and publication readiness;
- a screen-reader-friendly table representation of the graph;
- six imperative WebMCP tools registered from the top-level page after local state hydration;
- four read tools for context, contribution search, inspection, and deterministic validation;
- two bounded write tools for transactional, draft-only planning and revision;
- strict JSON Schemas plus matching Zod validation at every execution boundary;
- an in-product readiness badge, complete tool inventory, and recent-call status;
- mocked-agent contract tests that exercise discovery through validation without direct store access;
- automated domain, interaction, and WebMCP tests; and
- the responsive Mutual Mesh interface and brand system.

The full normal-UI path works without WebMCP: reset the demo, find Carlos for equipment pickup, preview the revision, apply it, open the inspector, and validate the new plan version. In a compatible browser, an agent can complete the equivalent workflow through structured tools against the same live, visible state.

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

The human interface and WebMCP adapters share one domain layer:

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
- `webmcp/` — schemas, handlers, browser types, registration lifecycle, and tool catalog
- `test/` — automated domain, interaction, and WebMCP contract tests
- `app/` — product interface and metadata

No real participant data is stored. The current MVP uses device-local persistence and requires no API key.

## Human-interface acceptance path

1. Select **Reset demo**.
2. In the equipment-pickup gap, select **Find a viable match**.
3. Select **Preview revision** and verify that readiness changes from 87% to 100% while zero locked constraints change.
4. Select **Apply revision** and confirm the plan advances from version 3 to version 4.
5. Open **Plan inspector** and select **Run full validation**.
6. Confirm every hard constraint passes and the plan is ready for the commitment-request phase.

## WebMCP acceptance path

See [WEBMCP.md](WEBMCP.md) for the complete tool contract, safety boundaries, browser setup, and a canonical agent prompt.

At a high level:

1. Open the deployed site directly in ChatGPT’s in-app browser or a WebMCP-enabled Chrome build.
2. Select the readiness badge in the top bar and confirm six tools are discoverable.
3. Ask the agent to inspect the context and plan, search for equipment transport, revise the current version, and validate the new version.
4. Confirm the visible plan advances by one draft version, Carlos covers equipment pickup, the activity log attributes the change to the agent, and validation reports zero blockers.

## License

MIT — see [LICENSE](LICENSE).
