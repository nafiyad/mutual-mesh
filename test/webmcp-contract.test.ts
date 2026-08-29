import { describe, expect, it } from 'vitest';
import { createSeedScenario } from '@/data/seedScenario';
import type { MutationResult, ScenarioState } from '@/domain/types';
import { approvePendingIntent, stageCommitmentRequestIntent, stagePublicationIntent } from '@/services/approvalService';
import { simulateCommitmentResponses } from '@/services/commitmentService';
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

type InspectedPlan = {
  id: string;
  goalId: string;
  version: number;
  title: string;
  rationale: string;
  tasks: InspectedTask[];
  taskPage: { hasMore: boolean; nextOffset: number | null };
};

function successData<T>(value: unknown): T {
  const envelope = value as ToolEnvelope<T>;
  expect(envelope.ok).toBe(true);
  if (!envelope.ok) throw new Error(envelope.error.message);
  return envelope.data;
}

async function inspectAllTasks(
  invoke: (name: WebMCPToolName, input: unknown) => Promise<unknown>,
  input: { planId?: string; version?: number } = {},
) {
  let offset = 0;
  let first: InspectedPlan | undefined;
  const tasks: InspectedTask[] = [];
  do {
    const page = successData<InspectedPlan>(await invoke('inspect_plan', { ...input, taskOffset: offset, taskLimit: 2 }));
    first ??= page;
    tasks.push(...page.tasks);
    if (!page.taskPage.hasMore || page.taskPage.nextOffset === null) break;
    offset = page.taskPage.nextOffset;
  } while (true);
  if (!first) throw new Error('Plan inspection returned no page.');
  return { ...first, tasks };
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
    stageCommitments: (input) => apply(stageCommitmentRequestIntent(liveScenario, input)),
    stagePublication: (input) => apply(stagePublicationIntent(liveScenario, input)),
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
  const approvePending = () => {
    if (!liveScenario.approvalIntent) throw new Error('No pending human approval intent.');
    return apply(approvePendingIntent(liveScenario, liveScenario.approvalIntent.id));
  };
  const getLiveScenario = () => structuredClone(liveScenario);
  return { context, handlers, invoke, simulateAllAccepted, approvePending, getLiveScenario };
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
    const { context, handlers, invoke, simulateAllAccepted, approvePending, getLiveScenario } = createAgentHarness();
    await registerMutualMeshTools(context, handlers);

    const contextData = successData<{ activePlan: { id: string; version: number }; openGaps: Array<{ requiredCapability: string }> }>(
      await invoke('get_coordination_context', {}),
    );
    expect(contextData.activePlan).toMatchObject({ id: 'plan-career-night', version: 3 });
    expect(contextData.openGaps).toEqual(expect.arrayContaining([expect.objectContaining({ requiredCapability: 'equipment-transport' })]));

    const searchData = successData<{ matches: Array<{ id: string; participantName: string }>; rejectedSummary: { count: number; examples: Array<{ id: string; rejectionReasons: string[] }> } }>(
      await invoke('search_contributions', {
        capabilityQuery: 'equipment-transport',
        availability: 'available',
        availableFrom: '2026-09-10T16:30:00-06:00',
        availableUntil: '2026-09-10T17:30:00-06:00',
        maxCost: 30,
        limit: 5,
      }),
    );
    expect(searchData.matches).toEqual([expect.objectContaining({ id: 'contribution-transport', participantName: 'Carlos' })]);
    expect(searchData.rejectedSummary.count).toBeGreaterThan(0);
    expect(searchData.rejectedSummary.examples.every((item) => item.rejectionReasons.length > 0)).toBe(true);
    expect(searchData.rejectedSummary.examples).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'contribution-community-courier', rejectionReasons: expect.arrayContaining([expect.stringContaining('exceeds')]) }),
      expect.objectContaining({ id: 'contribution-cargo-bike', rejectionReasons: expect.arrayContaining([expect.stringContaining('ends before')]) }),
    ]));

    const inspected = await inspectAllTasks(invoke, { planId: contextData.activePlan.id, version: contextData.activePlan.version });
    const idToKey = new Map(inspected.tasks.map((task) => [task.id, task.key]));
    const draft = successData<{ plan: { version: number }; visibleChange: boolean }>(
      await invoke('draft_coordination_plan', {
        planId: inspected.id,
        expectedVersion: inspected.version,
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

    const draftInspection = await inspectAllTasks(invoke, { planId: inspected.id, version: draft.plan.version });
    const transportTask = draftInspection.tasks.find((task) => task.key === 'transport');
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

    const liveAfterPreview = await inspectAllTasks(invoke);
    const avTask = liveAfterPreview.tasks.find((task) => task.key === 'av');
    if (!avTask) throw new Error('AV task missing after preview.');
    expect(avTask.contributionIds).toEqual(['contribution-projector']);
    const repaired = successData<{ plan: { version: number } }>(
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
    expect(repaired.plan).toMatchObject({ version: 6 });

    const repairedInspection = await inspectAllTasks(invoke, { planId: inspected.id, version: repaired.plan.version });
    expect(repairedInspection.tasks).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'av', contributionIds: ['contribution-backup-display'] })]));

    const assignedParticipantIds = [...new Set(repairedInspection.tasks.flatMap((task) => task.contributionIds.map((id) => {
      const contribution = task.contributions?.find((item) => item?.id === id);
      return contribution?.participantId;
    })).filter((id): id is string => Boolean(id)))];
    const requested = successData<{ awaitingHumanApproval: boolean; inAppOnly: boolean; intent: { participantCount: number }; plan: { status: string } }>(
      await invoke('request_commitments', {
        planId: inspected.id,
        expectedVersion: repaired.plan.version,
        participantIds: assignedParticipantIds,
        message: 'Please confirm this fictional in-app assignment.',
        inAppOnly: true,
      }),
    );
    expect(requested).toMatchObject({ awaitingHumanApproval: true, inAppOnly: true, plan: { status: 'draft' } });
    expect(requested.intent.participantCount).toBeGreaterThan(0);
    expect(getLiveScenario().commitments).toHaveLength(0);
    expect(approvePending().ok).toBe(true);
    expect(getLiveScenario().plan.status).toBe('requesting');

    expect(simulateAllAccepted().ok).toBe(true);
    const published = successData<{ awaitingHumanApproval: boolean; publicationStatus: string; immutableVersion: number | null; externalCommunication: boolean }>(
      await invoke('publish_coordination_plan', {
        planId: inspected.id,
        expectedVersion: repaired.plan.version,
        acknowledgement: 'Publish the accepted plan',
      }),
    );
    expect(published).toMatchObject({ awaitingHumanApproval: true, publicationStatus: 'pending_human_approval', immutableVersion: null, externalCommunication: false });
    expect(getLiveScenario().plan.status).toBe('ready');
    expect(approvePending().ok).toBe(true);
    expect(getLiveScenario().plan.status).toBe('published');
  });

  it('returns stable recovery errors for unknown fields and stale revisions', async () => {
    const { context, handlers, invoke } = createAgentHarness();
    await registerMutualMeshTools(context, handlers);

    const invalid = await invoke('get_coordination_context', { unexpected: true }) as ToolEnvelope<never>;
    expect(invalid).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });

    const stale = await invoke('validate_plan', { planId: 'plan-career-night', expectedVersion: 2 }) as ToolEnvelope<never>;
    expect(stale).toMatchObject({ ok: false, error: { code: 'STALE_PLAN_VERSION', currentVersion: 3 } });
  });

  it('rejects stale complete-draft replacement instead of overwriting a newer plan', async () => {
    const { context, handlers, invoke } = createAgentHarness();
    await registerMutualMeshTools(context, handlers);
    const inspected = await inspectAllTasks(invoke);
    const transport = inspected.tasks.find((task) => task.key === 'transport');
    if (!transport) throw new Error('Transport task missing.');
    successData(await invoke('revise_coordination_plan', {
      planId: inspected.id,
      expectedVersion: inspected.version,
      operations: [{ type: 'assign', taskId: transport.id, contributionId: 'contribution-transport' }],
      rationale: 'Advance the live plan before attempting a stale replacement.',
    }));

    const keyById = new Map(inspected.tasks.map((task) => [task.id, task.key]));
    const stale = await invoke('draft_coordination_plan', {
      planId: inspected.id,
      expectedVersion: inspected.version,
      goalId: inspected.goalId,
      title: inspected.title,
      rationale: inspected.rationale,
      draftOnly: true,
      tasks: inspected.tasks.map((task) => ({
        key: task.key,
        label: task.label,
        requiredCapability: task.requiredCapability,
        startsAt: task.startsAt,
        endsAt: task.endsAt,
        contributionIds: task.contributionIds,
        dependencyKeys: task.dependencyTaskIds.map((id) => keyById.get(id)),
      })),
    }) as ToolEnvelope<never>;
    expect(stale).toMatchObject({ ok: false, error: { code: 'STALE_PLAN_VERSION', currentVersion: 4 } });
  });

  it('understands space and hyphen variants and rejects inverted availability windows', async () => {
    const { context, handlers, invoke } = createAgentHarness();
    await registerMutualMeshTools(context, handlers);

    const semantic = successData<{ matches: Array<{ id: string }> }>(
      await invoke('search_contributions', { capabilityQuery: 'presentation AV', availability: 'available' }),
    );
    expect(semantic.matches.map((item) => item.id)).toEqual(expect.arrayContaining(['contribution-projector', 'contribution-backup-display']));

    const inverted = await invoke('search_contributions', {
      availableFrom: '2026-09-10T20:00:00-06:00',
      availableUntil: '2026-09-10T18:00:00-06:00',
    }) as ToolEnvelope<never>;
    expect(inverted).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('describes every published input parameter for reliable agent use', () => {
    const { handlers } = createAgentHarness();
    const schemas = createRegisteredTools(handlers).map((tool) => tool.inputSchema as { properties?: Record<string, { description?: string }> });
    for (const schema of schemas) {
      for (const property of Object.values(schema.properties ?? {})) {
        expect(property.description).toEqual(expect.any(String));
      }
    }
  });

  it('keeps common read results within explicit context budgets', async () => {
    const { context, handlers, invoke } = createAgentHarness();
    await registerMutualMeshTools(context, handlers);
    const results = {
      context: await invoke('get_coordination_context', {}),
      search: await invoke('search_contributions', {
        capabilityQuery: 'presentation AV',
        availability: 'available',
        availableFrom: '2026-09-10T17:30:00-06:00',
        availableUntil: '2026-09-10T20:00:00-06:00',
        maxCost: 30,
      }),
      inspect: await invoke('inspect_plan', {}),
      validate: await invoke('validate_plan', { planId: 'plan-career-night', expectedVersion: 3 }),
    };
    const sizes = Object.fromEntries(Object.entries(results).map(([key, value]) => [key, JSON.stringify(value).length]));
    expect(sizes).toEqual({ context: expect.any(Number), search: expect.any(Number), inspect: expect.any(Number), validate: expect.any(Number) });
    expect(sizes.context).toBeLessThanOrEqual(1500);
    expect(sizes.search).toBeLessThanOrEqual(1500);
    expect(sizes.inspect).toBeLessThanOrEqual(1800);
    expect(sizes.validate).toBeLessThanOrEqual(1500);
  });
});
