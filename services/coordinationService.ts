import { checkScenarioInvariants } from '@/domain/invariants';
import { calculatePlanSummary } from '@/domain/scoring';
import type { DomainError, MutationResult, ScenarioState } from '@/domain/types';

export type AssignContributionInput = {
  taskId: string;
  contributionId: string;
  expectedVersion: number;
  actor?: 'human' | 'agent';
};

export type AssignmentPreviewResult =
  | {
      ok: true;
      preview: {
        planId: string;
        expectedVersion: number;
        taskId: string;
        taskLabel: string;
        contributionId: string;
        contributionLabel: string;
        participantName: string;
        readinessBefore: number;
        readinessAfter: number;
        coverageBefore: number;
        coverageAfter: number;
        blockingGapsBefore: number;
        blockingGapsAfter: number;
        lockedConstraintChanges: 0;
      };
    }
  | { ok: false; error: DomainError };

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

export function previewContributionAssignment(
  current: ScenarioState,
  input: AssignContributionInput,
): AssignmentPreviewResult {
  const result = assignContributionToTask(current, input);
  if (!result.ok) return result;

  const before = calculatePlanSummary(current);
  const after = calculatePlanSummary(result.scenario);
  const task = current.plan.tasks.find((item) => item.id === input.taskId)!;
  const contribution = current.contributions.find((item) => item.id === input.contributionId)!;
  const participant = current.participants.find((item) => item.id === contribution.participantId)!;

  return {
    ok: true,
    preview: {
      planId: current.plan.id,
      expectedVersion: current.plan.version,
      taskId: task.id,
      taskLabel: task.label,
      contributionId: contribution.id,
      contributionLabel: contribution.label,
      participantName: participant.displayName,
      readinessBefore: before.readiness,
      readinessAfter: after.readiness,
      coverageBefore: before.coveredTasks,
      coverageAfter: after.coveredTasks,
      blockingGapsBefore: before.openGaps,
      blockingGapsAfter: after.openGaps,
      lockedConstraintChanges: 0,
    },
  };
}
