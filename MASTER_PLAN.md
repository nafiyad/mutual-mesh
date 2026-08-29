# Mutual Mesh master plan

## Product decision

Build a **community coordination compiler**: a shared visual workspace where people define an outcome and lock constraints while agents inspect contributions, assemble a feasible dependency graph, preview real-world changes, repair the plan, and move through consent and publication gates.

Mutual Mesh is not a barter marketplace, generic task board, chatbot wrapper, or system that assigns people without consent.

## Product promise

> Mutual Mesh turns a community goal and scattered contributions into a visible, consent-based plan that people and their AI agents can build and repair together.

The flagship scenario is a free, wheelchair-accessible Career Night for 50 students with a $150 budget. The seeded graph covers venue, two speakers, presentation AV, promotion, hosting, refreshments, and transport. The canonical story compares viable and rejected options, closes one gap, previews a projector cancellation, repairs only the affected AV assignment, validates every hard constraint, and requires separate human approvals for commitment requests and publication.

## Product principles

1. Goal first, not marketplace first.
2. Suggestion and consent are different states.
3. Reversible preview before canonical change.
4. One domain layer for people and agents.
5. Exact-version writes and atomic validation.
6. Visible evidence after every successful action.
7. Human authority over commitments and publication.
8. Fully usable normal interface when WebMCP is unavailable.
9. No fake external effects.

## Shipped scope

- Responsive three-panel coordination workspace and distinct Mutual Mesh brand system.
- Deterministic fictional Career Night state and one-click reset.
- Searchable/filterable contributions, state-driven directed graph, accessible table fallback, inspector, validation, and activity history.
- Typed domain model and invariant checks for IDs, assignments, availability, time, dependency cycles, workload, capacity, accessibility, and budget.
- Draft, revision, disruption, commitment, human-approval, simulated-response, and immutable-publication services.
- Nine top-level imperative WebMCP tools with strict JSON Schemas and Zod execution validation.
- Four reads, three bounded draft/preview operations, and two version-bound human-approval staging operations.
- Exact-version concurrency control and stable recovery errors.
- Device-local persistence with no account, API key, analytics, database, or real participant data.
- Unit, interaction, deterministic agent-eval, mocked-agent contract, and Playwright desktop/mobile/accessibility tests.
- GitHub Actions quality gates, MIT license, WebMCP implementation guide, demo script, and submission copy.
- Hosted Sites deployment and public GitHub repository.

## Canonical acceptance sequence

1. Reset to plan v3 with one equipment-pickup gap.
2. Compare Carlos against the over-budget courier and partial-window cargo bike; verify the rejection reasons and zero locked constraints changed.
3. Apply the revision and reach draft v4 with complete coverage.
4. Preview Maya's projector becoming unavailable; verify the overlay is visible and canonical v4 is unchanged.
5. Repair AV with Priya's portable display and adapter; reach draft v5.
6. Run full validation and verify zero hard blockers.
7. Let the agent stage seven fictional in-app commitment requests; verify none exists until a human approves the visible intent.
8. Simulate a decline and prove publication is blocked, or reset/replay and simulate all accept.
9. Let the agent stage publication; verify plan v5 remains accepted until a human approves, then prove the published snapshot is immutable.
10. Review human, agent, and system activity events, then reset and repeat.

## Release gates

- [x] Complete normal-interface canonical flow.
- [x] Nine WebMCP tools registered after state hydration.
- [x] Read/write annotations and strict schema boundaries.
- [x] Shared state, visible mutations, and activity evidence.
- [x] Preview leaves canonical version unchanged.
- [x] Agent calls cannot bypass separate human approvals for commitments or publication.
- [x] Decline blocks publication.
- [x] Published plan is immutable.
- [x] Automated unit, contract, component, and Chromium flow tests.
- [x] TypeScript, ESLint, and production-build gates.
- [x] Public repository, license, setup guide, and submission materials.
- [ ] Confirm public, signed-out access to the final Sites version.
- [ ] Record and upload the public under-three-minute YouTube demo with audio.
- [x] Complete local ChatGPT in-app-browser WebMCP smoke run.
- [ ] Complete the exact deployed-version ChatGPT in-app-browser and Chrome WebMCP smoke runs after public access is enabled.
- [ ] Submit Devpost entry and retain confirmation.

The unchecked items require deployment visibility, compatible-browser state, recording, or external-account actions; they do not expand product scope.

## Cut line

Authentication, real messaging, multiplayer sync, multiple scenarios, imports, maps, marketplace mechanics, payments, and live participant data remain out of scope. The deterministic demo protects a fast, reliable judge path and keeps consent boundaries honest.

## Success definition

A judge can understand the goal immediately, discover nine meaningful site tools, complete the full shared human-agent story, see validation and consent gates work, inspect who changed what, reset without help, and verify the implementation from a public MIT-licensed repository.
