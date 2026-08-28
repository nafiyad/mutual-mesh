# Mutual Mesh — Devpost submission copy

## Tagline

Turn scattered help into a coordinated plan.

## What Mutual Mesh does

Mutual Mesh is a shared human-agent coordination canvas for student clubs, volunteer organizers, and small community groups. A person defines an outcome and locks constraints; an agent combines available people, skills, spaces, equipment, schedules, capacity, accessibility, budget, and dependencies into one visible plan.

The deterministic demo organizes a free, wheelchair-accessible Career Night for 50 students under a $150 budget. Together, a human and agent close a missing equipment-pickup gap, preview a projector cancellation without changing the real plan, repair the affected AV assignment, validate every hard constraint, request fictional in-app commitments, and publish only after every required acceptance.

## Why this use case is a strong fit for WebMCP

Coordination depends on precise live state and domain meaning. A generic agent clicking through an interface must guess which offer satisfies a capability, whether a line is a dependency, whether a change is only a preview, and whether “assigned” implies consent. Those guesses are risky and brittle.

Mutual Mesh exposes those concepts directly as nine WebMCP tools. The agent can inspect the exact goal, graph, versions, and constraints; search contributions with bounded filters; receive deterministic rejection reasons; revise one exact draft version; preview disruptions; and move through explicit consent and publication gates. The tools operate the same page and session the human is watching, so the result is both structured for the agent and immediately verifiable by the person.

## How it creates a better user experience

Instead of copying facts between chats, spreadsheets, and task boards, the organizer sees one goal-first graph with coverage, budget, risk, consent, validation, and activity history. The agent handles the combinatorial work while the human supplies judgment and authority.

Safety states are part of the UX: suggested, requested, accepted, declined, complete, and published are visibly different. Disruption is previewed before the canonical plan changes. Every write is atomic and version-safe, stale calls mutate nothing, validation errors include recovery guidance, and published versions become immutable. The full workflow also remains available through the normal interface when WebMCP is unavailable.

## What people and agents can do together that was difficult before

Humans can state a goal, lock non-negotiable constraints, inspect trade-offs, simulate changed reality, and decide when consent and publication are appropriate. Agents can search many compatible combinations, construct a dependency-aware plan, identify exactly what a disruption breaks, repair only the affected section, and verify that hard constraints still pass.

Crucially, both operate one living plan rather than exchanging suggestions across disconnected chat and project-management surfaces. They can prove which version was inspected, what changed, who or what caused the change, whether consent exists, and why publication is or is not allowed.

## How WebMCP was implemented

The top-level client feature-detects `document.modelContext` and imperatively registers nine tools after local state hydration. Four tools are read-only: context, contribution search, plan inspection, and validation. Five produce bounded visible preview or write effects: draft, revise, preview disruption, request in-app commitments, and publish the accepted plan.

Every tool publishes a closed JSON Schema with `additionalProperties: false`, and each execution handler independently re-validates input with Zod. Human controls and WebMCP handlers share the same TypeScript domain services, invariants, deterministic validation pipeline, versioned Zustand store, and activity model. Exact-version checks prevent stale writes; transactional clones prevent partial changes; an `AbortSignal` cleans up registration; and unsupported browsers retain the complete human UI.

The demo stores only fictional data in device-local storage. Commitment requests, responses, and publication never contact an external service or person.

## Links

- Live app: https://mutual-mesh.kccdv717.chatgpt.site/
- Public repository: https://github.com/nafiyad/mutual-mesh
- Public YouTube demo: add after upload

## Judge prompt

> Inspect this Career Night workspace. Close the equipment-pickup gap without changing any locked constraint. Preview Maya's projector becoming unavailable, repair the plan with a viable alternative, and validate the result. Keep commitment requests and publication as separate steps; do not publish yet.

Then:

> Request the fictional in-app commitments. Publish the exact accepted version only after every required response is accepted.

## Technical highlights

- Next.js-compatible React app built and hosted with OpenAI Sites
- Nine imperative WebMCP tools over shared live page state
- Strict JSON Schema plus Zod execution validation
- Exact-version, atomic domain mutations and immutable publication
- Deterministic constraint and consent validation
- Visible human/agent/system activity trail
- Unit, component, mocked-agent contract, and Playwright end-to-end coverage
- MIT licensed, no account or API key required
