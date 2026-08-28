import { checkScenarioInvariants } from '@/domain/invariants';
import type { MutationResult, ScenarioState } from '@/domain/types';

export type AssignContributionInput = {
  taskId: string;
  contributionId: string;
  expectedVersion: number;
  actor?: 'human' | 'agent';
};

export function assignContributionToTask(
  current: ScenarioState,
  input: AssignContributionInput,
): MutationResult {
  if (input.expectedVersion !== current.plan.version) {
    return {
      ok: false,
      error: {
        code: 'STALE_PLAN_VERSION',
        message: `The plan changed after version ${input.expectedVersion} was inspected.`,
        currentVersion: current.plan.version,
        recoveryHint: `Inspect the plan again, then retry against version ${current.plan.version}.`,
      },
    };
  }

  const task = current.plan.tasks.find((item) => item.id === input.taskId);
  if (!task) {
    return { ok: false, error: { code: 'UNKNOWN_TASK', message: 'That task does not exist.', recoveryHint: 'Inspect the current plan and choose a valid task ID.' } };
  }

  const contribution = current.contributions.find((item) => item.id === input.contributionId);
  if (!contribution) {
    return { ok: false, error: { code: 'UNKNOWN_CONTRIBUTION', message: 'That contribution does not exist.', recoveryHint: 'Search the current contributions and choose a valid contribution ID.' } };
  }
  if (contribution.availability !== 'available') {
    return { ok: false, error: { code: 'CONTRIBUTION_UNAVAILABLE', message: 'That contribution is not currently available.', recoveryHint: 'Choose an available contribution or revise the task.' } };
  }
  if (contribution.capability !== task.requiredCapability) {
    return { ok: false, error: { code: 'CAPABILITY_MISMATCH', message: 'That contribution cannot cover this task.', recoveryHint: `Choose a contribution with the ${task.requiredCapability} capability.` } };
  }

  const next = structuredClone(current);
  const nextTask = next.plan.tasks.find((item) => item.id === input.taskId)!;
  const versionBefore = next.plan.version;
  nextTask.contributionIds = [input.contributionId];
  nextTask.status = 'suggested';
  next.plan.version += 1;
  next.plan.updatedAt = new Date().toISOString();
  next.activity.unshift({
    id: `activity-assign-${next.plan.version}-${input.taskId}`,
    actor: input.actor ?? 'human',
    action: `Assigned ${contribution.label}`,
    summary: `${contribution.label} now covers ${task.label}.`,
    planVersionBefore: versionBefore,
    planVersionAfter: next.plan.version,
    timestamp: next.plan.updatedAt,
    changedEntityIds: [next.plan.id, task.id, contribution.id],
  });

  const issues = checkScenarioInvariants(next);
  if (issues.length) {
    return {
      ok: false,
      error: {
        code: 'INVARIANT_VIOLATION',
        message: issues[0].message,
        recoveryHint: 'Inspect the current plan constraints and choose a different contribution.',
      },
    };
  }

  return { ok: true, scenario: next };
}
