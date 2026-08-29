# Mutual Mesh WebMCP implementation

Mutual Mesh exposes nine imperative site tools over the same live coordination state used by the human interface. The top-level page registers them only after device-local state has hydrated, preventing an agent from reading seed data while the UI shows restored data.

## Tool contract

| Tool | Annotation | Input guard | Effect |
| --- | --- | --- | --- |
| `get_coordination_context` | Read-only | Empty closed object | Goal, constraints, summary, gaps, commitments, and next safe operations. |
| `search_contributions` | Read-only | Bounded filters and result limit | Viable matches plus exact rejection reasons. |
| `inspect_plan` | Read-only | Optional current plan ID/version and bounded pagination | Current task-graph page, disruption overlay, gaps, summary, and latest change. |
| `validate_plan` | Read-only | Exact plan ID/version | Deterministic checks, errors, warnings, and recovery actions. |
| `draft_coordination_plan` | Mutating | `draftOnly: true`, 1–12 tasks | Atomically replaces the unpublished draft and increments its version. |
| `revise_coordination_plan` | Mutating | Exact version, 1–10 operations | Atomically assigns, unassigns, adds/removes tasks, changes time, or changes dependencies. |
| `preview_disruption` | Visible preview | Exact version and one bounded disruption | Adds a temporary impact overlay and activity event; canonical version stays unchanged. |
| `request_commitments` | Approval staging | Exact valid version, assigned participants, `inAppOnly: true` | Stages a visible intent. A human must approve before fictional commitments exist. |
| `publish_coordination_plan` | Approval staging | Exact accepted version and literal acknowledgement | Stages a visible intent. A human must approve before an immutable snapshot exists. |

The browser registration loop is in [`webmcp/registerTools.ts`](webmcp/registerTools.ts):

```ts
await document.modelContext.registerTool({
  name: 'search_contributions',
  description: 'Find viable people and resources using bounded filters.',
  inputSchema: {
    type: 'object',
    properties: { capabilityQuery: { type: 'string' } },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  execute: async (input) => handlers.searchContributions(input),
});
```

The production implementation creates all nine definitions from one catalog. Every JSON Schema is closed with `additionalProperties: false`, and every execution handler independently validates the input with the matching Zod schema.

## Registration lifecycle

1. React renders the normal interface and restores local state.
2. The client feature-detects `document.modelContext?.registerTool`.
3. A shared registration record prevents duplicate names during development remounts.
4. The nine tools register with one `AbortSignal`.
5. Handlers read the current Zustand snapshot at call time rather than a captured render.
6. Cleanup aborts and unregisters the tools.
7. Unsupported browsers retain the complete human workflow and show an honest fallback status.

## State and safety model

- The UI and WebMCP adapters call the same domain services.
- Read calls never mutate state.
- Draft/revision calls operate on a clone and commit only when every structural and assignment invariant passes.
- Every write requires the exact current version; `STALE_PLAN_VERSION` returns the live version and a recovery hint.
- A disruption preview visibly records the hypothetical change while keeping the canonical plan and version unchanged.
- A contribution being suggested, requested, accepted, declined, complete, and published are distinct states.
- Agent calls can stage version-bound commitment and publication intents, but only a visible human action can approve or reject either consequential transition.
- A decline is a blocking validation error. It cannot be overwritten by publication; the assignment must be revised in a new draft version.
- Publication requires every hard validation and every assigned participant acceptance, plus the exact acknowledgement `Publish the accepted plan`.
- Published plans reject later draft or revision calls.
- Commitment requests and publication exist only in this fictional app. They send no email, SMS, calendar invitation, API call, or other external message.

Tool responses use stable JSON-safe envelopes:

```ts
type ToolResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        recoveryHint: string;
        currentVersion?: number;
        details?: Array<{ path: string; message: string }>;
      };
    };
```

## Agent acceptance path

1. Call `get_coordination_context`.
2. Call `inspect_plan` for current v3.
3. Call `search_contributions` for `equipment-transport`.
4. Call `revise_coordination_plan` against v3 to assign Carlos; the plan becomes v4.
5. Call `preview_disruption` against v4 for `contribution-projector`; the overlay appears and the plan remains v4.
6. Call `search_contributions` for `presentation-av` and select the portable display.
7. Call `revise_coordination_plan` against v4; the repaired plan becomes v5.
8. Call `validate_plan` against v5 and confirm zero blockers.
9. Call `request_commitments` with assigned participant IDs and `inAppOnly: true`; confirm the plan is unchanged and a human-approval intent is visible.
10. A human approves the intent in the page, then the deterministic demo simulates responses.
11. Call `validate_plan` again, then call `publish_coordination_plan` with the literal acknowledgement; confirm nothing publishes yet.
12. A human approves the publication intent in the page, creating the immutable snapshot.

The visible graph, readiness metrics, commitment states, tool-call inventory, and activity history provide evidence after every stage.

## Automated proof

`test/webmcp-contract.test.ts` installs a mock `ModelContext`, captures all registered definitions, and acts only through their published schemas and `execute` functions. It verifies:

- nine unique tools and correct read/write annotations;
- strict top-level schemas and handler re-validation;
- discovery through the full inspect, search, revise, preview, repair, staged-request, and staged-publication path;
- stale-version and unknown-field rejection;
- visible plan changes and immutable publication; and
- abort-driven unregistration.

Additional service and UI tests cover the simulated-decline branch and the complete fallback flow. Run all automated checks with:

```bash
npm test
npm run test:agent-evals
npm run test:e2e
npm run lint
npx tsc --noEmit
npm run build
```

## Test in a compatible browser

1. Open the live HTTPS URL directly in ChatGPT's in-app browser or a WebMCP-enabled Chrome build.
2. Reset the deterministic demo.
3. Open the WebMCP badge and confirm **nine tools** and **four reads · three draft/preview actions · two approval-staging actions**.
4. Run the canonical prompt from [README.md](README.md).
5. Confirm each site-tool call is reflected in the canvas and recent-call state.
6. Reset and repeat; no account or API key is required.
