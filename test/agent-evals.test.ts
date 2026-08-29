import { describe, expect, it } from 'vitest';
import { createSeedScenario } from '@/data/seedScenario';
import type { MutationResult, ScenarioState } from '@/domain/types';
import { rejectPendingIntent, stageCommitmentRequestIntent, stagePublicationIntent } from '@/services/approvalService';
import { replaceDraftCoordinationPlan, reviseDraftCoordinationPlan } from '@/services/coordinationService';
import { previewPlanDisruption } from '@/services/disruptionService';
import { createToolHandlers } from '@/webmcp/toolHandlers';

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string } };

function createEvalHarness() {
  let scenario: ScenarioState = createSeedScenario();
  const apply = (result: MutationResult) => {
    if (result.ok) scenario = result.scenario;
    return result;
  };
  const handlers = createToolHandlers({
    getScenario: () => structuredClone(scenario),
    replaceDraft: (input) => apply(replaceDraftCoordinationPlan(scenario, input)),
    reviseDraft: (input) => apply(reviseDraftCoordinationPlan(scenario, input)),
    previewDisruption: (input) => apply(previewPlanDisruption(scenario, input)),
    stageCommitments: (input) => apply(stageCommitmentRequestIntent(scenario, input)),
    stagePublication: (input) => apply(stagePublicationIntent(scenario, input)),
  });
  return {
    handlers,
    getScenario: () => structuredClone(scenario),
    rejectPending: () => {
      if (!scenario.approvalIntent) throw new Error('No pending approval intent.');
      return apply(rejectPendingIntent(scenario, scenario.approvalIntent.id));
    },
  };
}

function success<T>(value: unknown) {
  const result = value as Envelope<T>;
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}

describe('deterministic agent contract evals', () => {
  it.each(['equipment-transport', 'equipment transport', 'Equipment / Transport'])(
    'finds the same viable transport for query variant %s and explains rejected tradeoffs',
    (capabilityQuery) => {
      const { handlers } = createEvalHarness();
      const result = success<{
        matches: Array<{ id: string }>;
        rejectedSummary: { examples: Array<{ id: string; rejectionReasons: string[] }> };
      }>(handlers.searchContributions({
        capabilityQuery,
        availability: 'available',
        availableFrom: '2026-09-10T16:30:00-06:00',
        availableUntil: '2026-09-10T17:30:00-06:00',
        maxCost: 30,
        limit: 5,
      }));
      expect(result.matches.map((item) => item.id)).toEqual(['contribution-transport']);
      expect(result.rejectedSummary.examples).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'contribution-community-courier', rejectionReasons: expect.arrayContaining([expect.stringContaining('exceeds')]) }),
        expect.objectContaining({ id: 'contribution-cargo-bike', rejectionReasons: expect.arrayContaining([expect.stringContaining('ends before')]) }),
      ]));
    },
  );

  it('keeps disruption hypothetical and recommends only the time- and budget-viable display', () => {
    const { handlers, getScenario } = createEvalHarness();
    const before = getScenario();
    const result = success<{
      canonicalPlanChanged: boolean;
      preview: { affectedTaskIds: string[]; candidateAlternativeContributionIds: string[] };
    }>(handlers.previewDisruption({
      planId: before.plan.id,
      expectedVersion: before.plan.version,
      type: 'contribution_unavailable',
      targetId: 'contribution-projector',
    }));
    expect(result.canonicalPlanChanged).toBe(false);
    expect(result.preview.affectedTaskIds).toEqual(['task-av']);
    expect(result.preview.candidateAlternativeContributionIds).toEqual(['contribution-backup-display']);
    expect(getScenario().plan).toEqual(before.plan);
  });

  it('lets an agent stage commitment intent but reserves the consequential action for a human', () => {
    const { handlers, getScenario, rejectPending } = createEvalHarness();
    const start = getScenario();
    success(handlers.reviseCoordinationPlan({
      planId: start.plan.id,
      expectedVersion: start.plan.version,
      operations: [{ type: 'assign', taskId: 'task-transport', contributionId: 'contribution-transport' }],
      rationale: 'Carlos is the only option within the complete pickup window and remaining budget.',
    }));
    const completed = getScenario();
    const participantIds = [...new Set(completed.plan.tasks.flatMap((task) => task.contributionIds.map((contributionId) =>
      completed.contributions.find((contribution) => contribution.id === contributionId)?.participantId,
    )).filter((id): id is string => Boolean(id)))];
    const staged = success<{ awaitingHumanApproval: boolean; canonicalPlanChanged: boolean }>(handlers.requestCommitments({
      planId: completed.plan.id,
      expectedVersion: completed.plan.version,
      participantIds,
      message: 'Please confirm this fictional in-app assignment.',
      inAppOnly: true,
    }));
    expect(staged).toMatchObject({ awaitingHumanApproval: true, canonicalPlanChanged: false });
    expect(getScenario().commitments).toHaveLength(0);
    expect(getScenario().approvalIntent?.createdBy).toBe('agent');
    expect(rejectPending().ok).toBe(true);
    expect(getScenario().approvalIntent).toBeUndefined();
    expect(getScenario().commitments).toHaveLength(0);
  });
});
