import { describe, expect, it } from 'vitest';
import { createSeedScenario } from '@/data/seedScenario';
import { checkScenarioInvariants } from '@/domain/invariants';
import { calculatePlanSummary } from '@/domain/scoring';
import { validatePlan } from '@/domain/validation';
import { assignContributionToTask, previewContributionAssignment } from '@/services/coordinationService';

describe('Mutual Mesh foundation', () => {
  it('creates the same valid scenario every time', () => {
    const first = createSeedScenario();
    const second = createSeedScenario();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(checkScenarioInvariants(first)).toEqual([]);
  });

  it('starts with one visible gap and an 87 percent readiness score', () => {
    const summary = calculatePlanSummary(createSeedScenario());

    expect(summary).toMatchObject({ readiness: 87, coveredTasks: 7, totalTasks: 8, openGaps: 1, budgetSpent: 120 });
  });

  it('closes the equipment pickup gap through a versioned mutation', () => {
    const current = createSeedScenario();
    const result = assignContributionToTask(current, {
      taskId: 'task-transport',
      contributionId: 'contribution-transport',
      expectedVersion: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(current.plan.version).toBe(3);
    expect(result.scenario.plan.version).toBe(4);
    expect(calculatePlanSummary(result.scenario)).toMatchObject({ readiness: 100, openGaps: 0, risk: 'Low' });
    expect(checkScenarioInvariants(result.scenario)).toEqual([]);
  });

  it('rejects an agent or human acting on a stale plan version', () => {
    const result = assignContributionToTask(createSeedScenario(), {
      taskId: 'task-transport',
      contributionId: 'contribution-transport',
      expectedVersion: 2,
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'STALE_PLAN_VERSION', currentVersion: 3 } });
  });

  it('previews a revision without mutating the inspected plan', () => {
    const current = createSeedScenario();
    const result = previewContributionAssignment(current, {
      taskId: 'task-transport',
      contributionId: 'contribution-transport',
      expectedVersion: 3,
    });

    expect(result).toMatchObject({
      ok: true,
      preview: {
        readinessBefore: 87,
        readinessAfter: 100,
        coverageBefore: 7,
        coverageAfter: 8,
        lockedConstraintChanges: 0,
      },
    });
    expect(current.plan.version).toBe(3);
    expect(current.plan.tasks.find((task) => task.id === 'task-transport')?.status).toBe('gap');
  });

  it('validates the human workflow before and after the gap is resolved', () => {
    const current = createSeedScenario();
    const before = validatePlan(current);
    expect(before).toMatchObject({ blockingCount: 1, readyForCommitmentRequests: false, readyToPublish: false });
    expect(before.issues.map((issue) => issue.code)).toContain('MISSING_REQUIRED_CAPABILITY');

    const assigned = assignContributionToTask(current, {
      taskId: 'task-transport',
      contributionId: 'contribution-transport',
      expectedVersion: 3,
    });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;

    const after = validatePlan(assigned.scenario);
    expect(after).toMatchObject({ blockingCount: 0, readyForCommitmentRequests: true, readyToPublish: false });
    expect(after.issues.map((issue) => issue.code)).toContain('COMMITMENTS_NOT_REQUESTED');
  });
});
