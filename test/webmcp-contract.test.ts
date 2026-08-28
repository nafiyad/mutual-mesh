import { describe, expect, it } from 'vitest';
import { createSeedScenario } from '@/data/seedScenario';
import type { MutationResult, ScenarioState } from '@/domain/types';
import { publishCoordinationPlan, requestPlanCommitments, simulateCommitmentResponses } from '@/services/commitmentService';
import {
  replaceDraftCoordinationPlan,
  reviseDraftCoordinationPlan,
  type DraftCoordinationPlanInput,
  type ReviseCoordinationPlanInput,
} from '@/services/coordinationService';
import { previewPlanDisruption } from '@/services/disruptionService';
import type { WebMCPModelContext, WebMCPTool } from '@/webmcp/modelContext';
import { createRegisteredTools, registerMutualMeshTools } from '@/webmcp/registerTools';
import { createToolHandlers, type WebMCPToolName } from '@/webmcp/toolHandlers';

class MockModelContext implements WebMCPModelContext {
  readonly tools = new Map<string, WebMCPTool>();

  async registerTool(tool: WebMCPTool, options?: { signal?: AbortSignal }) {
    if (this.tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
    this.tools.set(tool.name, tool);
    options?.signal?.addEventListener('abort', () => this.tools.delete(tool.name), { once: true });
  }
}

type ToolEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; currentVersion?: number } };
type InspectedTask = {
  id: string;
  key: string;
  label: string;
  requiredCapability: string;
  startsAt: string;
  endsAt: string;
  capacityRequired?: number;
  contributionIds: string[];
  dependencyTaskIds: string[];
  contributions?: Array<{ id: string; participantId: string } | null>;
};

function successData<T>(value: unknown): T {
  const envelope = value as ToolEnvelope<T>;
  expect(envelope.ok).toBe(true);
  if (!envelope.ok) throw new Error(envelope.error.message);
  return envelope.data;
}

function createAgentHarness() {
  let liveScenario: ScenarioState = createSeedScenario();
  const apply = (result: MutationResult) => {
    if (result.ok) liveScenario = result.scenario;
    return result;
  };
  const handlers = createToolHandlers({
    getScenario: () => structuredClone(liveScenario),
    replaceDraft: (input: DraftCoordinationPlanInput) => apply(replaceDraftCoordinationPlan(liveScenario, input)),
    reviseDraft: (input: ReviseCoordinationPlanInput) => apply(reviseDraftCoordinationPlan(liveScenario, input)),
    previewDisruption: (input) => apply(previewPlanDisruption(liveScenario, input)),
    requestCommitments: (input) => {
      const result = requestPlanCommitments(liveScenario, input);
      if (result.ok) liveScenario = result.scenario;
      return result;
    },
    publishPlan: (input) => apply(publishCoordinationPlan(liveScenario, input)),
  });
  const context = new MockModelContext();
  const invoke = async (name: WebMCPToolName, input: unknown) => {
    const tool = context.tools.get(name);
    if (!tool) throw new Error(`Tool ${name} is not registered.`);
    return Promise.resolve(tool.execute(input, { signal: new AbortController().signal }));
  };
  const simulateAllAccepted = () => {
    const pending = liveScenario.commitments.filter((item) => item.planVersion === liveScenario.plan.version && item.status === 'pending');
    return apply(simulateCommitmentResponses(liveScenario, {
      planId: liveScenario.plan.id,
      expectedVersion: liveScenario.plan.version,
      responses: pending.map((item) => ({ participantId: item.participantId, status: 'accepted' })),
      actor: 'system',
    }));
  };
  return { context, handlers, invoke, simulateAllAccepted };
}

describe('WebMCP contract', () => {
  it('publishes nine strict, clearly annotated tools and unregisters them on abort', async () => {
    const { context, handlers } = createAgentHarness();
    const controller = new AbortController();
    const names = await registerMutualMeshTools(context, handlers, controller.signal);

    expect(names).toEqual([
      'get_coordination_context',
      'search_contributions',
      'inspect_plan',
      'validate_plan',
      'draft_coordination_plan',
      'revise_coordination_plan',
      'preview_disruption',
      'request_commitments',
      'publish_coordination_plan',
    ]);
    expect(context.tools.size).toBe(9);
    for (const tool of context.tools.values()) {
      expect(tool.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    }
    const registered = createRegisteredTools(handlers);
    expect(registered.slice(0, 4).every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(registered.slice(4).every((tool) => tool.annotations?.readOnlyHint === false)).toBe(true);

    controller.abort();
    expect(context.tools.size).toBe(0);
  });

  it('lets a mocked agent inspect, search, draft, revise, and validate without store access', async () => {
    const { context, handlers, invoke, simulateAllAccepted } = createAgentHarness();
    await registerMutualMeshTools(context, handlers);

    const contextData = successData<{ activePlan: { id: string; version: number }; openGaps: Array<{ requiredCapability: string }> }>(
      await invoke('get_coordination_context', {}),
    );
    expect(contextData.activePlan).toMatchObject({ id: 'plan-career-night', version: 3 });
    expect(contextData.openGaps).toEqual(expect.arrayContaining([expect.objectContaining({ requiredCapability: 'equipment-transport' })]));

    const searchData = successData<{ matches: Array<{ id: string; participantName: string }>; rejected: Array<{ rejectionReasons: string[] }> }>(
      await invoke('search_contributions', { capabilityQuery: 'equipment-transport', availability: 'available', maxCost: 0, limit: 5 }),
    );
    expect(searchData.matches).toEqual([expect.objectContaining({ id: 'contribution-transport', participantName: 'Carlos' })]);
    expect(searchData.rejected.every((item) => item.rejectionReasons.length > 0)).toBe(true);

    const inspected = successData<{ id: string; goalId: string; version: number; title: string; rationale: string; tasks: InspectedTask[] }>(
      await invoke('inspect_plan', { planId: contextData.activePlan.id, version: contextData.activePlan.version }),
    );
    const idToKey = new Map(inspected.tasks.map((task) => [task.id, task.key]));
    const draft = successData<{ plan: { version: number; tasks: InspectedTask[] }; visibleChange: boolean }>(
      await invoke('draft_coordination_plan', {
        goalId: inspected.goalId,
        title: inspected.title,
        rationale: 'Preserve the inspected plan as an explicit agent-created draft before closing its remaining gap.',
        draftOnly: true,
        tasks: inspected.tasks.map((task) => ({
          key: task.key,
          label: task.label,
          requiredCapability: task.requiredCapability,
          startsAt: task.startsAt,
          endsAt: task.endsAt,
          ...(task.capacityRequired ? { capacityRequired: task.capacityRequired } : {}),
          contributionIds: task.contributionIds,
          dependencyKeys: task.dependencyTaskIds.map((id) => idToKey.get(id)),
        })),
      }),
    );
    expect(draft.visibleChange).toBe(true);
    expect(draft.plan.version).toBe(4);

    const transportTask = draft.plan.tasks.find((task) => task.key === 'transport');
    if (!transportTask) throw new Error('Draft did not preserve the equipment transport task.');
    const revised = successData<{ appliedOperations: number; plan: { version: number; gaps: unknown[] } }>(
      await invoke('revise_coordination_plan', {
        planId: inspected.id,
        expectedVersion: draft.plan.version,
        operations: [{ type: 'assign', taskId: transportTask.id, contributionId: searchData.matches[0].id }],
        rationale: 'Carlos covers the equipment pickup window at no cost while every locked constraint remains intact.',
      }),
    );
    expect(revised).toMatchObject({ appliedOperations: 1, plan: { version: 5, gaps: [] } });

    const validated = successData<{ readyForCommitmentRequests: boolean; readyToPublish: boolean; blockingCount: number }>(
      await invoke('validate_plan', { planId: inspected.id, expectedVersion: revised.plan.version }),
    );
    expect(validated).toMatchObject({ readyForCommitmentRequests: true, readyToPublish: false, blockingCount: 0 });

    const disruption = successData<{ canonicalPlanChanged: boolean; preview: { planVersion: number; affectedTaskIds: string[]; candidateAlternativeContributionIds: string[] } }>(
      await invoke('preview_disruption', {
        planId: inspected.id,
        expectedVersion: revised.plan.version,
        type: 'contribution_unavailable',
        targetId: 'contribution-projector',
      }),
    );
    expect(disruption).toMatchObject({
      canonicalPlanChanged: false,
      preview: {
        planVersion: 5,
        affectedTaskIds: expect.arrayContaining([expect.stringContaining('task-av')]),
        candidateAlternativeContributionIds: ['contribution-backup-display'],
      },
    });

    const liveAfterPreview = successData<{ version: number; tasks: InspectedTask[] }>(await invoke('inspect_plan', {}));
    const avTask = liveAfterPreview.tasks.find((task) => task.key === 'av');
    if (!avTask) throw new Error('AV task missing after preview.');
    expect(avTask.contributionIds).toEqual(['contribution-projector']);
    const repaired = successData<{ plan: { version: number; tasks: InspectedTask[] } }>(
      await invoke('revise_coordination_plan', {
        planId: inspected.id,
        expectedVersion: liveAfterPreview.version,
        operations: [
          { type: 'unassign', taskId: avTask.id, contributionId: 'contribution-projector' },
          { type: 'assign', taskId: avTask.id, contributionId: 'contribution-backup-display' },
        ],
        rationale: 'Replace the unavailable projector with Priya’s backup display and adapter while preserving the pickup dependency.',
      }),
    );
    expect(repaired.plan).toMatchObject({ version: 6, tasks: expect.arrayContaining([expect.objectContaining({ key: 'av', contributionIds: ['contribution-backup-display'] })]) });

    const assignedParticipantIds = [...new Set(repaired.plan.tasks.flatMap((task) => task.contributionIds.map((id) => {
      const contribution = task.contributions?.find((item) => item?.id === id);
      return contribution?.participantId;
    })).filter((id): id is string => Boolean(id)))];
    const requested = successData<{ requestedParticipantIds: string[]; inAppOnly: boolean; plan: { status: string } }>(
      await invoke('request_commitments', {
        planId: inspected.id,
        expectedVersion: repaired.plan.version,
        participantIds: assignedParticipantIds,
        message: 'Please confirm this fictional in-app assignment.',
        inAppOnly: true,
      }),
    );
    expect(requested).toMatchObject({ inAppOnly: true, plan: { status: 'requesting' } });
    expect(requested.requestedParticipantIds.length).toBeGreaterThan(0);

    expect(simulateAllAccepted().ok).toBe(true);
    const published = successData<{ publicationStatus: string; immutableVersion: number; externalCommunication: boolean }>(
      await invoke('publish_coordination_plan', {
        planId: inspected.id,
        expectedVersion: repaired.plan.version,
        acknowledgement: 'Publish the accepted plan',
      }),
    );
    expect(published).toMatchObject({ publicationStatus: 'published', immutableVersion: 6, externalCommunication: false });
  });

  it('returns stable recovery errors for unknown fields and stale revisions', async () => {
    const { context, handlers, invoke } = createAgentHarness();
    await registerMutualMeshTools(context, handlers);

    const invalid = await invoke('get_coordination_context', { unexpected: true }) as ToolEnvelope<never>;
    expect(invalid).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });

    const stale = await invoke('validate_plan', { planId: 'plan-career-night', expectedVersion: 2 }) as ToolEnvelope<never>;
    expect(stale).toMatchObject({ ok: false, error: { code: 'STALE_PLAN_VERSION', currentVersion: 3 } });
  });
});
