import { describe, expect, it } from 'vitest';
import { createSeedScenario } from '@/data/seedScenario';
import { checkScenarioInvariants } from '@/domain/invariants';
import { calculatePlanSummary } from '@/domain/scoring';
import { assignContributionToTask } from '@/services/coordinationService';

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
});
