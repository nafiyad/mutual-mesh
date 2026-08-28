import { calculatePlanSummary } from '@/domain/scoring';
import type { DomainError, MutationResult, ScenarioState } from '@/domain/types';
import { validatePlan } from '@/domain/validation';
import type { DraftCoordinationPlanInput, ReviseCoordinationPlanInput } from '@/services/coordinationService';
import {
  draftCoordinationPlanInputSchema,
  emptyInputSchema,
  inspectPlanInputSchema,
  reviseCoordinationPlanInputSchema,
  searchContributionsInputSchema,
  validatePlanInputSchema,
} from '@/webmcp/schemas';

export type WebMCPToolName =
  | 'get_coordination_context'
  | 'search_contributions'
  | 'inspect_plan'
  | 'validate_plan'
  | 'draft_coordination_plan'
  | 'revise_coordination_plan';

export type ToolExecutionEvent = {
  name: WebMCPToolName;
  status: 'succeeded' | 'rejected';
  timestamp: string;
};

type HandlerDependencies = {
  getScenario: () => ScenarioState;
  replaceDraft: (input: DraftCoordinationPlanInput) => MutationResult;
  reviseDraft: (input: ReviseCoordinationPlanInput) => MutationResult;
  onExecuted?: (event: ToolExecutionEvent) => void;
};

type ToolError = {
  code: string;
  message: string;
  recoveryHint: string;
  currentVersion?: number;
  details?: Array<{ path: string; message: string }>;
};

type ToolResult<T> = { ok: true; data: T } | { ok: false; error: ToolError };

function invalidInput(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): ToolResult<never> {
  return {
    ok: false,
    error: {
      code: 'INVALID_INPUT',
      message: 'The tool input does not match the published schema.',
      recoveryHint: 'Correct the listed fields and call the tool again.',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    },
  };
}

function domainFailure(error: DomainError): ToolResult<never> {
  return { ok: false, error: { ...error } };
}

function unknownPlan(state: ScenarioState): ToolResult<never> {
  return {
    ok: false,
    error: {
      code: 'UNKNOWN_PLAN',
      message: 'That plan does not exist in this workspace.',
      recoveryHint: `Inspect planId ${state.plan.id}.`,
    },
  };
}

function stalePlan(state: ScenarioState, inspectedVersion: number): ToolResult<never> {
  return {
    ok: false,
    error: {
      code: 'STALE_PLAN_VERSION',
      message: `The plan changed after version ${inspectedVersion} was inspected.`,
      currentVersion: state.plan.version,
      recoveryHint: `Inspect the plan again, then retry against version ${state.plan.version}.`,
    },
  };
}

function contributionView(state: ScenarioState, contributionId: string) {
  const contribution = state.contributions.find((item) => item.id === contributionId);
  if (!contribution) return null;
  const participant = state.participants.find((item) => item.id === contribution.participantId);
  return {
    id: contribution.id,
    participantId: contribution.participantId,
    participantName: participant?.displayName ?? 'Unknown participant',
    kind: contribution.kind,
    capability: contribution.capability,
    label: contribution.label,
    description: contribution.description,
    capacity: contribution.capacity ?? null,
    cost: contribution.cost,
    availableFrom: contribution.availableFrom,
    availableUntil: contribution.availableUntil,
    locationLabel: contribution.locationLabel,
    accessibilityTags: contribution.accessibilityTags,
    conditions: contribution.conditions,
    availability: contribution.availability,
  };
}

function planView(state: ScenarioState) {
  const summary = calculatePlanSummary(state);
  const gaps = state.plan.tasks
    .filter((task) => task.status === 'gap' || task.contributionIds.length === 0)
    .map((task) => ({ id: task.id, label: task.label, requiredCapability: task.requiredCapability, startsAt: task.startsAt, endsAt: task.endsAt }));
  return {
    id: state.plan.id,
    goalId: state.plan.goalId,
    title: state.plan.title,
    version: state.plan.version,
    status: state.plan.status,
    rationale: state.plan.rationale,
    updatedAt: state.plan.updatedAt,
    tasks: state.plan.tasks.map((task) => ({
      ...task,
      contributions: task.contributionIds.map((id) => contributionView(state, id)).filter(Boolean),
    })),
    gaps,
    commitments: state.commitments.filter((item) => item.planId === state.plan.id && item.planVersion === state.plan.version),
    summary,
    lastChange: state.activity[0] ?? null,
  };
}

export function createToolHandlers(dependencies: HandlerDependencies) {
  const report = (name: WebMCPToolName, result: ToolResult<unknown>) => {
    dependencies.onExecuted?.({
      name,
      status: result.ok ? 'succeeded' : 'rejected',
      timestamp: new Date().toISOString(),
    });
    return result;
  };

  return {
    getCoordinationContext(input: unknown) {
      const parsed = emptyInputSchema.safeParse(input ?? {});
      if (!parsed.success) return report('get_coordination_context', invalidInput(parsed.error));
      const state = dependencies.getScenario();
      const summary = calculatePlanSummary(state);
      const result: ToolResult<unknown> = {
        ok: true,
        data: {
          workspace: { name: 'Mutual Mesh demo', schemaVersion: state.schemaVersion },
          goal: state.goal,
          constraints: state.constraints,
          activePlan: { id: state.plan.id, title: state.plan.title, version: state.plan.version, status: state.plan.status },
          planSummary: summary,
          openGaps: state.plan.tasks
            .filter((task) => task.status === 'gap' || task.contributionIds.length === 0)
            .map((task) => ({ id: task.id, label: task.label, requiredCapability: task.requiredCapability, startsAt: task.startsAt, endsAt: task.endsAt })),
          commitments: {
            total: state.commitments.length,
            pending: state.commitments.filter((item) => item.status === 'pending').length,
            accepted: state.commitments.filter((item) => item.status === 'accepted').length,
          },
          nextSafeOperations: [
            'Search contributions for each open capability gap.',
            `Inspect and validate plan version ${state.plan.version} before revising it.`,
            'Keep draftOnly true; participant contact and publication require separate human-authorized tools.',
          ],
        },
      };
      return report('get_coordination_context', result);
    },

    searchContributions(input: unknown) {
      const parsed = searchContributionsInputSchema.safeParse(input ?? {});
      if (!parsed.success) return report('search_contributions', invalidInput(parsed.error));
      const state = dependencies.getScenario();
      const filters = parsed.data;
      const query = filters.capabilityQuery?.toLowerCase();
      const requestedTags = filters.tags?.map((tag) => tag.toLowerCase()) ?? [];
      const evaluated = state.contributions.map((contribution) => {
        const reasons: string[] = [];
        const searchable = [contribution.capability, contribution.label, contribution.description].join(' ').toLowerCase();
        if (query && !searchable.includes(query)) reasons.push(`Capability text does not contain “${filters.capabilityQuery}”.`);
        if (filters.kinds && !filters.kinds.includes(contribution.kind)) reasons.push(`Kind ${contribution.kind} is outside the requested kinds.`);
        if (filters.availability && contribution.availability !== filters.availability) reasons.push(`Availability is ${contribution.availability}, not ${filters.availability}.`);
        if (filters.availableFrom && new Date(contribution.availableFrom).getTime() > new Date(filters.availableFrom).getTime()) reasons.push('Availability starts after the requested window begins.');
        if (filters.availableUntil && new Date(contribution.availableUntil).getTime() < new Date(filters.availableUntil).getTime()) reasons.push('Availability ends before the requested window closes.');
        if (filters.minCapacity !== undefined && (contribution.capacity ?? 0) < filters.minCapacity) reasons.push(`Capacity ${(contribution.capacity ?? 0)} is below ${filters.minCapacity}.`);
        if (filters.maxCost !== undefined && contribution.cost > filters.maxCost) reasons.push(`Cost $${contribution.cost} exceeds $${filters.maxCost}.`);
        const contributionTags = contribution.accessibilityTags.map((tag) => tag.toLowerCase());
        const missingTags = requestedTags.filter((tag) => !contributionTags.includes(tag));
        if (missingTags.length) reasons.push(`Missing tags: ${missingTags.join(', ')}.`);
        return { contribution, reasons };
      });
      const matches = evaluated
        .filter((item) => item.reasons.length === 0)
        .sort((a, b) => a.contribution.cost - b.contribution.cost || a.contribution.label.localeCompare(b.contribution.label))
        .slice(0, filters.limit)
        .map((item) => contributionView(state, item.contribution.id));
      const result: ToolResult<unknown> = {
        ok: true,
        data: {
          query: filters,
          matchCount: matches.length,
          matches,
          rejected: evaluated
            .filter((item) => item.reasons.length > 0)
            .map((item) => ({ id: item.contribution.id, label: item.contribution.label, rejectionReasons: item.reasons })),
        },
      };
      return report('search_contributions', result);
    },

    inspectPlan(input: unknown) {
      const parsed = inspectPlanInputSchema.safeParse(input ?? {});
      if (!parsed.success) return report('inspect_plan', invalidInput(parsed.error));
      const state = dependencies.getScenario();
      if (parsed.data.planId && parsed.data.planId !== state.plan.id) return report('inspect_plan', unknownPlan(state));
      if (parsed.data.version && parsed.data.version !== state.plan.version) {
        const result: ToolResult<never> = {
          ok: false,
          error: {
            code: 'PLAN_VERSION_NOT_AVAILABLE',
            message: `Only the live version ${state.plan.version} is available for inspection.`,
            currentVersion: state.plan.version,
            recoveryHint: `Inspect version ${state.plan.version}; history remains visible in the activity log.`,
          },
        };
        return report('inspect_plan', result);
      }
      return report('inspect_plan', { ok: true, data: planView(state) });
    },

    validatePlan(input: unknown) {
      const parsed = validatePlanInputSchema.safeParse(input ?? {});
      if (!parsed.success) return report('validate_plan', invalidInput(parsed.error));
      const state = dependencies.getScenario();
      if (parsed.data.planId !== state.plan.id) return report('validate_plan', unknownPlan(state));
      if (parsed.data.expectedVersion !== state.plan.version) return report('validate_plan', stalePlan(state, parsed.data.expectedVersion));
      const validation = validatePlan(state);
      return report('validate_plan', {
        ok: true,
        data: {
          ...validation,
          errors: validation.issues.filter((issue) => issue.severity === 'error'),
          warnings: validation.issues.filter((issue) => issue.severity === 'warning'),
          recommendedActions: validation.issues.map((issue) => issue.recoveryHint),
        },
      });
    },

    draftCoordinationPlan(input: unknown) {
      const parsed = draftCoordinationPlanInputSchema.safeParse(input ?? {});
      if (!parsed.success) return report('draft_coordination_plan', invalidInput(parsed.error));
      const result = dependencies.replaceDraft(parsed.data);
      if (!result.ok) return report('draft_coordination_plan', domainFailure(result.error));
      return report('draft_coordination_plan', {
        ok: true,
        data: {
          visibleChange: true,
          plan: planView(result.scenario),
          message: `Draft saved as version ${result.scenario.plan.version}. No participant was contacted and nothing was published.`,
        },
      });
    },

    reviseCoordinationPlan(input: unknown) {
      const parsed = reviseCoordinationPlanInputSchema.safeParse(input ?? {});
      if (!parsed.success) return report('revise_coordination_plan', invalidInput(parsed.error));
      const result = dependencies.reviseDraft(parsed.data);
      if (!result.ok) return report('revise_coordination_plan', domainFailure(result.error));
      return report('revise_coordination_plan', {
        ok: true,
        data: {
          visibleChange: true,
          appliedOperations: parsed.data.operations.length,
          plan: planView(result.scenario),
          message: `Revision committed as draft version ${result.scenario.plan.version}. No participant was contacted and nothing was published.`,
        },
      });
    },
  };
}

export type MutualMeshToolHandlers = ReturnType<typeof createToolHandlers>;
