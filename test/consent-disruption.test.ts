import { describe, expect, it } from 'vitest';
import { createSeedScenario } from '@/data/seedScenario';
import { validatePlan } from '@/domain/validation';
import { publishCoordinationPlan, requestPlanCommitments, simulateCommitmentResponses } from '@/services/commitmentService';
import { assignContributionToTask } from '@/services/coordinationService';
import { previewPlanDisruption } from '@/services/disruptionService';

function closeInitialGap() {
  const result = assignContributionToTask(createSeedScenario(), {
    taskId: 'task-transport',
    contributionId: 'contribution-transport',
    expectedVersion: 3,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.scenario;
}

function assignedParticipantIds(state: ReturnType<typeof closeInitialGap>) {
  const owners = new Map(state.contributions.map((item) => [item.id, item.participantId]));
  return [...new Set(state.plan.tasks.flatMap((task) => task.contributionIds.map((id) => owners.get(id))).filter((id): id is string => Boolean(id)))];
}

describe('disruption, consent, and publication', () => {
  it('previews a projector cancellation without changing the canonical plan', () => {
    const current = closeInitialGap();
    const activityBefore = current.activity.length;
    const result = previewPlanDisruption(current, {
      planId: current.plan.id,
      expectedVersion: current.plan.version,
      type: 'contribution_unavailable',
      targetId: 'contribution-projector',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(current.disruptionPreview).toBeUndefined();
    expect(result.scenario.plan.version).toBe(current.plan.version);
    expect(result.scenario.plan.tasks.find((task) => task.id === 'task-av')?.contributionIds).toEqual(['contribution-projector']);
    expect(result.scenario.disruptionPreview).toMatchObject({
      affectedTaskIds: ['task-av'],
      candidateAlternativeContributionIds: ['contribution-backup-display'],
      riskBefore: 'Low',
      riskAfter: 'Medium',
    });
    expect(result.scenario.activity).toHaveLength(activityBefore + 1);
  });

  it('runs the complete consent and immutable publication state machine', () => {
    const gapClosed = closeInitialGap();
    const repaired = assignContributionToTask(gapClosed, {
      taskId: 'task-av',
      contributionId: 'contribution-backup-display',
      expectedVersion: gapClosed.plan.version,
    });
    expect(repaired.ok).toBe(true);
    if (!repaired.ok) return;
    expect(validatePlan(repaired.scenario).readyForCommitmentRequests).toBe(true);

    const requested = requestPlanCommitments(repaired.scenario, {
      planId: repaired.scenario.plan.id,
      expectedVersion: repaired.scenario.plan.version,
      participantIds: assignedParticipantIds(repaired.scenario),
      message: 'Please confirm this fictional in-app assignment.',
      inAppOnly: true,
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    expect(requested.scenario.plan.status).toBe('requesting');
    expect(requested.requestedParticipantIds).toHaveLength(7);
    expect(requested.scenario.commitments.every((item) => item.status === 'pending')).toBe(true);

    const responded = simulateCommitmentResponses(requested.scenario, {
      planId: requested.scenario.plan.id,
      expectedVersion: requested.scenario.plan.version,
      responses: requested.scenario.commitments.map((item) => ({ participantId: item.participantId, status: 'accepted' })),
      actor: 'system',
    });
    expect(responded.ok).toBe(true);
    if (!responded.ok) return;
    expect(responded.scenario.plan.status).toBe('ready');
    expect(validatePlan(responded.scenario)).toMatchObject({ readyToPublish: true, blockingCount: 0 });

    const published = publishCoordinationPlan(responded.scenario, {
      planId: responded.scenario.plan.id,
      expectedVersion: responded.scenario.plan.version,
      acknowledgement: 'Publish the accepted plan',
    });
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.scenario.plan).toMatchObject({ status: 'published', version: 5 });
    expect(published.scenario.plan.publishedAt).toBeTruthy();
    expect(published.scenario.plan.tasks.every((task) => task.status === 'complete')).toBe(true);

    const attemptedEdit = assignContributionToTask(published.scenario, {
      taskId: 'task-av',
      contributionId: 'contribution-projector',
      expectedVersion: published.scenario.plan.version,
    });
    expect(attemptedEdit).toMatchObject({ ok: false, error: { code: 'PUBLISHED_PLAN_IMMUTABLE' } });
  });

  it('blocks publication after a simulated decline', () => {
    const valid = closeInitialGap();
    const requested = requestPlanCommitments(valid, {
      planId: valid.plan.id,
      expectedVersion: valid.plan.version,
      participantIds: assignedParticipantIds(valid),
      message: 'Please confirm this fictional in-app assignment.',
      inAppOnly: true,
    });
    if (!requested.ok) throw new Error(requested.error.message);
    const [first, ...rest] = requested.scenario.commitments;
    const responded = simulateCommitmentResponses(requested.scenario, {
      planId: requested.scenario.plan.id,
      expectedVersion: requested.scenario.plan.version,
      responses: [
        { participantId: first.participantId, status: 'declined' },
        ...rest.map((item) => ({ participantId: item.participantId, status: 'accepted' as const })),
      ],
    });
    if (!responded.ok) throw new Error(responded.error.message);
    expect(validatePlan(responded.scenario)).toMatchObject({
      blockingCount: 1,
      readyForCommitmentRequests: false,
      readyToPublish: false,
    });
    expect(validatePlan(responded.scenario).issues.map((issue) => issue.code)).toContain('COMMITMENT_DECLINED');

    const emptyResponse = simulateCommitmentResponses(responded.scenario, {
      planId: responded.scenario.plan.id,
      expectedVersion: responded.scenario.plan.version,
      responses: [],
    });
    expect(emptyResponse).toMatchObject({ ok: false, error: { code: 'NO_RESPONSES' } });

    const publication = publishCoordinationPlan(responded.scenario, {
      planId: responded.scenario.plan.id,
      expectedVersion: responded.scenario.plan.version,
      acknowledgement: 'Publish the accepted plan',
    });
    expect(publication).toMatchObject({ ok: false, error: { code: 'PLAN_NOT_READY_TO_PUBLISH' } });
  });
});
