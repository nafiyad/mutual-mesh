import { calculatePlanSummary } from '@/domain/scoring';
import type { DomainError, MutationResult, ScenarioState } from '@/domain/types';
import { validatePlan } from '@/domain/validation';
import type { PublishCoordinationPlanInput, RequestCommitmentsInput } from '@/services/commitmentService';
import type { DraftCoordinationPlanInput, ReviseCoordinationPlanInput } from '@/services/coordinationService';
import type { PreviewDisruptionInput } from '@/services/disruptionService';
import {
  draftCoordinationPlanInputSchema,
  emptyInputSchema,
  inspectPlanInputSchema,
  previewDisruptionInputSchema,
  publishCoordinationPlanInputSchema,
  requestCommitmentsInputSchema,
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
  | 'revise_coordination_plan'
  | 'preview_disruption'
  | 'request_commitments'
  | 'publish_coordination_plan';

export type ToolExecutionEvent = {
  name: WebMCPToolName;
  status: 'succeeded' | 'rejected';
  timestamp: string;
};

type HandlerDependencies = {
  getScenario: () => ScenarioState;
  replaceDraft: (input: DraftCoordinationPlanInput) => MutationResult;
  reviseDraft: (input: ReviseCoordinationPlanInput) => MutationResult;
  previewDisruption: (input: PreviewDisruptionInput) => MutationResult;
  stageCommitments: (input: RequestCommitmentsInput) => MutationResult;
  stagePublication: (input: PublishCoordinationPlanInput) => MutationResult;
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

function normalizeSearchText(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
}

function mutationPlanView(state: ScenarioState) {
  const summary = calculatePlanSummary(state);
  return {
    id: state.plan.id,
    version: state.plan.version,
    status: state.plan.status,
    summary,
    gaps: state.plan.tasks
      .filter((task) => task.status === 'gap' || task.contributionIds.length === 0)
      .map((task) => ({ id: task.id, label: task.label, requiredCapability: task.requiredCapability })),
  };
}

function planView(state: ScenarioState, taskOffset = 0, taskLimit = 2) {
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
    tasks: state.plan.tasks.slice(taskOffset, taskOffset + taskLimit).map((task) => ({
      id: task.id,
      key: task.key,
      label: task.label,
      requiredCapability: task.requiredCapability,
      startsAt: task.startsAt,
      endsAt: task.endsAt,
      ...(task.capacityRequired ? { capacityRequired: task.capacityRequired } : {}),
      contributionIds: task.contributionIds,
      dependencyTaskIds: task.dependencyTaskIds,
      status: task.status,
      contributions: task.contributionIds.map((id) => {
        const contribution = state.contributions.find((item) => item.id === id);
        return contribution ? { id: contribution.id, participantId: contribution.participantId, label: contribution.label } : null;
      }).filter(Boolean),
    })),
    taskPage: {
      offset: taskOffset,
      returned: Math.min(taskLimit, Math.max(0, state.plan.tasks.length - taskOffset)),
      total: state.plan.tasks.length,
      hasMore: taskOffset + taskLimit < state.plan.tasks.length,
      nextOffset: taskOffset + taskLimit < state.plan.tasks.length ? taskOffset + taskLimit : null,
    },
    gaps,
    commitmentSummary: {
      pending: state.commitments.filter((item) => item.planId === state.plan.id && item.planVersion === state.plan.version && item.status === 'pending').length,
      accepted: state.commitments.filter((item) => item.planId === state.plan.id && item.planVersion === state.plan.version && item.status === 'accepted').length,
      declined: state.commitments.filter((item) => item.planId === state.plan.id && item.planVersion === state.plan.version && item.status === 'declined').length,
    },
    ...(state.approvalIntent ? { pendingHumanApproval: state.approvalIntent } : {}),
    summary,
    lastChange: state.activity[0] ? {
      action: state.activity[0].action,
      summary: state.activity[0].summary,
      planVersionAfter: state.activity[0].planVersionAfter,
    } : null,
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
          workspace: { name: 'Mutual Mesh', schemaVersion: state.schemaVersion },
          demoMode: true,
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
          ...(state.approvalIntent ? { pendingHumanApproval: state.approvalIntent } : {}),
          nextSafeOperations: ['Search each gap.', `Inspect and validate version ${state.plan.version} before writing.`],
        },
      };
      return report('get_coordination_context', result);
    },

    searchContributions(input: unknown) {
      const parsed = searchContributionsInputSchema.safeParse(input ?? {});
      if (!parsed.success) return report('search_contributions', invalidInput(parsed.error));
      const state = dependencies.getScenario();
      const filters = parsed.data;
      const queryTokens = filters.capabilityQuery ? normalizeSearchText(filters.capabilityQuery).split(' ').filter(Boolean) : [];
      const requestedTags = filters.tags?.map(normalizeSearchText) ?? [];
      const evaluated = state.contributions.map((contribution) => {
        const reasons: string[] = [];
        const searchable = normalizeSearchText([contribution.capability, contribution.label, contribution.description].join(' '));
        const capabilityMatched = queryTokens.length === 0 || queryTokens.every((token) => searchable.includes(token));
        if (!capabilityMatched) reasons.push(`Capability does not match “${filters.capabilityQuery}”.`);
        if (filters.kinds && !filters.kinds.includes(contribution.kind)) reasons.push(`Kind ${contribution.kind} is outside the requested kinds.`);
        if (filters.availability && contribution.availability !== filters.availability) reasons.push(`Availability is ${contribution.availability}, not ${filters.availability}.`);
        if (filters.availableFrom && new Date(contribution.availableFrom).getTime() > new Date(filters.availableFrom).getTime()) reasons.push('Availability starts after the requested window begins.');
        if (filters.availableUntil && new Date(contribution.availableUntil).getTime() < new Date(filters.availableUntil).getTime()) reasons.push('Availability ends before the requested window closes.');
        if (filters.minCapacity !== undefined && (contribution.capacity ?? 0) < filters.minCapacity) reasons.push(`Capacity ${(contribution.capacity ?? 0)} is below ${filters.minCapacity}.`);
        if (filters.maxCost !== undefined && contribution.cost > filters.maxCost) reasons.push(`Cost $${contribution.cost} exceeds $${filters.maxCost}.`);
        const contributionTags = contribution.accessibilityTags.map(normalizeSearchText);
        const missingTags = requestedTags.filter((tag) => !contributionTags.includes(tag));
        if (missingTags.length) reasons.push(`Missing tags: ${missingTags.join(', ')}.`);
        return { contribution, reasons, capabilityMatched };
      });
      const matching = evaluated
        .filter((item) => item.reasons.length === 0)
        .sort((a, b) => a.contribution.cost - b.contribution.cost || a.contribution.label.localeCompare(b.contribution.label));
      const matches = matching.slice(0, filters.limit).map((item) => contributionView(state, item.contribution.id));
      const rejected = evaluated
        .filter((item) => item.reasons.length > 0)
        .sort((a, b) => Number(b.capabilityMatched) - Number(a.capabilityMatched)
          || a.reasons.length - b.reasons.length
          || a.contribution.cost - b.contribution.cost);
      const result: ToolResult<unknown> = {
        ok: true,
        data: {
          query: filters,
          matchCount: matching.length,
          matches,
          hasMoreMatches: matching.length > matches.length,
          rejectedSummary: {
            count: rejected.length,
            examples: rejected.slice(0, 3).map((item) => ({ id: item.contribution.id, rejectionReasons: item.reasons.slice(0, 2) })),
          },
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
      return report('inspect_plan', { ok: true, data: planView(state, parsed.data.taskOffset, parsed.data.taskLimit) });
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
          planId: validation.planId,
          planVersion: validation.planVersion,
          summary: validation.summary,
          blockingCount: validation.blockingCount,
          warningCount: validation.warningCount,
          readyForCommitmentRequests: validation.readyForCommitmentRequests,
          readyToPublish: validation.readyToPublish,
          issues: validation.issues,
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
          plan: mutationPlanView(result.scenario),
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
          plan: mutationPlanView(result.scenario),
          message: `Revision committed as draft version ${result.scenario.plan.version}. No participant was contacted and nothing was published.`,
        },
      });
    },

    previewDisruption(input: unknown) {
      const parsed = previewDisruptionInputSchema.safeParse(input ?? {});
      if (!parsed.success) return report('preview_disruption', invalidInput(parsed.error));
      const result = dependencies.previewDisruption({ ...parsed.data, actor: 'agent' });
      if (!result.ok) return report('preview_disruption', domainFailure(result.error));
      return report('preview_disruption', {
        ok: true,
        data: {
          visibleChange: true,
          canonicalPlanChanged: false,
          preview: result.scenario.disruptionPreview,
          message: 'A temporary impact overlay is visible. The canonical plan and its version are unchanged.',
        },
      });
    },

    requestCommitments(input: unknown) {
      const parsed = requestCommitmentsInputSchema.safeParse(input ?? {});
      if (!parsed.success) return report('request_commitments', invalidInput(parsed.error));
      const result = dependencies.stageCommitments({ ...parsed.data, actor: 'agent' });
      if (!result.ok) return report('request_commitments', domainFailure(result.error));
      const intent = result.scenario.approvalIntent;
      return report('request_commitments', {
        ok: true,
        data: {
          visibleChange: true,
          canonicalPlanChanged: false,
          awaitingHumanApproval: true,
          inAppOnly: true,
          intent: intent?.type === 'request_commitments' ? {
            id: intent.id,
            planVersion: intent.planVersion,
            participantCount: intent.participantIds.length,
          } : null,
          plan: mutationPlanView(result.scenario),
          requiredNextStep: 'A human must approve the visible version-bound intent in the UI before any commitment request exists.',
          message: 'Commitment requests were staged for human approval. No participant was contacted and no external message was sent.',
        },
      });
    },

    publishCoordinationPlan(input: unknown) {
      const parsed = publishCoordinationPlanInputSchema.safeParse(input ?? {});
      if (!parsed.success) return report('publish_coordination_plan', invalidInput(parsed.error));
      const result = dependencies.stagePublication({ ...parsed.data, actor: 'agent' });
      if (!result.ok) return report('publish_coordination_plan', domainFailure(result.error));
      const intent = result.scenario.approvalIntent;
      return report('publish_coordination_plan', {
        ok: true,
        data: {
          visibleChange: true,
          canonicalPlanChanged: false,
          awaitingHumanApproval: true,
          intent: intent?.type === 'publish_plan' ? { id: intent.id, planVersion: intent.planVersion } : null,
          publicationStatus: 'pending_human_approval',
          immutableVersion: null,
          externalCommunication: false,
          message: 'Publication was staged for human approval. Nothing was published and no external message was sent.',
        },
      });
    },
  };
}

export type MutualMeshToolHandlers = ReturnType<typeof createToolHandlers>;
