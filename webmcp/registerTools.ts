import type { WebMCPModelContext, WebMCPTool } from '@/webmcp/modelContext';
import {
  draftCoordinationPlanInputJsonSchema,
  emptyInputJsonSchema,
  inspectPlanInputJsonSchema,
  previewDisruptionInputJsonSchema,
  publishCoordinationPlanInputJsonSchema,
  requestCommitmentsInputJsonSchema,
  reviseCoordinationPlanInputJsonSchema,
  searchContributionsInputJsonSchema,
  validatePlanInputJsonSchema,
} from '@/webmcp/schemas';
import type { MutualMeshToolHandlers, WebMCPToolName } from '@/webmcp/toolHandlers';

export type ToolCatalogEntry = {
  name: WebMCPToolName;
  title: string;
  description: string;
  access: 'read' | 'write';
};

export const WEBMCP_TOOL_CATALOG: ToolCatalogEntry[] = [
  { name: 'get_coordination_context', title: 'Get coordination context', description: 'Read the active goal, locked constraints, plan summary, gaps, commitments, and safe next operations.', access: 'read' },
  { name: 'search_contributions', title: 'Search contributions', description: 'Find viable people and resources using capability, availability, capacity, cost, kind, and accessibility filters.', access: 'read' },
  { name: 'inspect_plan', title: 'Inspect plan', description: 'Read the live versioned task graph, assignments, gaps, costs, commitments, rationale, and last change.', access: 'read' },
  { name: 'validate_plan', title: 'Validate plan', description: 'Run the same deterministic constraints, coverage, budget, workload, dependency, and consent checks used by the UI.', access: 'read' },
  { name: 'draft_coordination_plan', title: 'Draft coordination plan', description: 'Replace the unpublished draft with a complete bounded task proposal. This never contacts participants or publishes.', access: 'write' },
  { name: 'revise_coordination_plan', title: 'Revise coordination plan', description: 'Apply up to ten version-safe operations as one transactional draft revision. This never contacts participants or publishes.', access: 'write' },
  { name: 'preview_disruption', title: 'Preview disruption', description: 'Show the visible impact of an unavailable contribution, unavailable participant, time shift, or capacity reduction without changing the canonical plan.', access: 'write' },
  { name: 'request_commitments', title: 'Request commitments', description: 'Create simulated in-app commitment requests for assigned participants on a validated plan. This sends no external messages.', access: 'write' },
  { name: 'publish_coordination_plan', title: 'Publish coordination plan', description: 'Publish the exact accepted plan version as an immutable in-app snapshot after every validation and consent gate passes.', access: 'write' },
];

export function createRegisteredTools(handlers: MutualMeshToolHandlers): WebMCPTool[] {
  return [
    {
      ...WEBMCP_TOOL_CATALOG[0],
      inputSchema: emptyInputJsonSchema,
      annotations: { readOnlyHint: true },
      execute: (input) => handlers.getCoordinationContext(input),
    },
    {
      ...WEBMCP_TOOL_CATALOG[1],
      inputSchema: searchContributionsInputJsonSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => handlers.searchContributions(input),
    },
    {
      ...WEBMCP_TOOL_CATALOG[2],
      inputSchema: inspectPlanInputJsonSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => handlers.inspectPlan(input),
    },
    {
      ...WEBMCP_TOOL_CATALOG[3],
      inputSchema: validatePlanInputJsonSchema,
      annotations: { readOnlyHint: true },
      execute: (input) => handlers.validatePlan(input),
    },
    {
      ...WEBMCP_TOOL_CATALOG[4],
      inputSchema: draftCoordinationPlanInputJsonSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => handlers.draftCoordinationPlan(input),
    },
    {
      ...WEBMCP_TOOL_CATALOG[5],
      inputSchema: reviseCoordinationPlanInputJsonSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => handlers.reviseCoordinationPlan(input),
    },
    {
      ...WEBMCP_TOOL_CATALOG[6],
      inputSchema: previewDisruptionInputJsonSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => handlers.previewDisruption(input),
    },
    {
      ...WEBMCP_TOOL_CATALOG[7],
      inputSchema: requestCommitmentsInputJsonSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => handlers.requestCommitments(input),
    },
    {
      ...WEBMCP_TOOL_CATALOG[8],
      inputSchema: publishCoordinationPlanInputJsonSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => handlers.publishCoordinationPlan(input),
    },
  ];
}

export async function registerMutualMeshTools(
  context: WebMCPModelContext,
  handlers: MutualMeshToolHandlers,
  signal?: AbortSignal,
) {
  const tools = createRegisteredTools(handlers);
  const browserContext = typeof document !== 'undefined' ? document.modelContext : undefined;
  const register = browserContext === context && document.modelContext
    ? document.modelContext.registerTool.bind(document.modelContext)
    : context.registerTool.bind(context);

  for (const tool of tools) {
    await register(tool, { signal });
  }
  return tools.map((tool) => tool.name as WebMCPToolName);
}
