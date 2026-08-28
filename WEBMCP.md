# Mutual Mesh WebMCP implementation

Mutual Mesh exposes a structured agent interface over the same live coordination state used by the human UI. The browser receives six imperative tools from the top-level page only after the persisted demo has hydrated, so an agent never reads a stale seed while the interface shows restored state.

## Tool inventory

| Tool | Access | Purpose |
| --- | --- | --- |
| `get_coordination_context` | Read | Return the active goal, locked constraints, plan summary, open gaps, commitments, and safe next operations. |
| `search_contributions` | Read | Search by capability text, kind, time window, availability, capacity, cost, and accessibility tags; rejected candidates include exact reasons. |
| `inspect_plan` | Read | Return the current versioned task graph, assignments, gaps, costs, commitments, rationale, and last change. |
| `validate_plan` | Read | Run the same deterministic integrity, timing, capacity, accessibility, workload, budget, dependency, consent, and publication checks as the UI. |
| `draft_coordination_plan` | Write | Replace the unpublished draft with 1–12 bounded tasks. `draftOnly` must be `true`. |
| `revise_coordination_plan` | Write | Apply 1–10 assign, unassign, task, time, or dependency operations as one version-safe transaction. |

The implementation uses the imperative API directly:

```ts
await document.modelContext.registerTool({
  name: 'search_contributions',
  description: 'Find viable people and resources using bounded filters.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
  execute: async (input) => handlers.searchContributions(input),
});
```

The production registry builds the full definitions in [`webmcp/registerTools.ts`](webmcp/registerTools.ts). Every JSON Schema is closed with `additionalProperties: false`, and every `execute` handler independently re-validates its input with Zod.

## Registration lifecycle

1. The normal React interface renders and restores device-local state.
2. The client feature-detects `document.modelContext?.registerTool`.
3. A shared registration prevents duplicate names during React development remounts.
4. All tools register with one `AbortSignal`; page cleanup aborts and unregisters them.
5. Tool handlers read the current Zustand snapshot at execution time, not a captured render.
6. Unsupported browsers retain the complete human workflow and show an honest fallback status.

## Safety and control boundaries

- Read tools are annotated with `readOnlyHint: true`; the two mutation tools are explicitly marked as writes.
- Every write is draft-only. These tools cannot contact a participant, request a commitment, accept on someone’s behalf, or publish a plan.
- `revise_coordination_plan` requires both a plan ID and the exact inspected version. Stale calls return `STALE_PLAN_VERSION` with the live version and recovery instructions.
- Operations apply to a clone and commit only after all structural, assignment, timing, workload, and dependency invariants pass.
- Unknown IDs, capability mismatches, unavailable offers, time conflicts, invalid dependencies, duplicate task keys, and published-plan edits return stable machine-readable errors.
- Successful writes visibly advance the plan version and add an agent-attributed activity event.
- All outputs are plain JSON-safe values with `{ ok, data }` or `{ ok, error }` envelopes.

## Test in a compatible browser

1. Deploy the site over HTTPS.
2. Open the live URL directly in ChatGPT’s in-app browser, or enable `chrome://flags/#enable-webmcp-testing` in Chrome 149+ and restart Chrome.
3. Select the WebMCP status badge in Mutual Mesh. It should say **WebMCP ready · 6 tools**.
4. Open the tool inventory and confirm four read tools and two write tools.
5. Give the agent this prompt:

> Inspect the live coordination context, search for an available equipment-transport contribution, revise only the current plan version to close the gap, then validate it. Keep every locked constraint and do not contact participants or publish.

6. Confirm the visible result: Carlos covers equipment pickup, readiness reaches 100%, the plan advances from v3 to v4, and the activity history records an agent revision.
7. Call `validate_plan` with an old version to confirm a recoverable stale-version error.
8. Reload or reset the demo to repeat the deterministic path.

## Automated contract test

Run:

```bash
npm test
```

`test/webmcp-contract.test.ts` provides a mock `ModelContext`, captures registered tools, and acts only through their published schemas and `execute` functions. It proves that an agent can inspect, search, draft, revise, and validate without direct access to the application store. It also verifies read/write annotations, strict top-level schemas, stable error codes, and abort-driven unregistration.
