import { calculatePlanSummary } from '@/domain/scoring';
import type { MutationResult, PlanTask, ScenarioState } from '@/domain/types';

export type PreviewDisruptionInput = {
  planId: string;
  expectedVersion: number;
  type: 'contribution_unavailable' | 'participant_unavailable' | 'task_time_shift' | 'capacity_reduction';
  targetId: string;
  replacementValue?: string | number;
  replacementEndsAt?: string;
  actor?: 'human' | 'agent';
};

function failure(code: string, message: string, recoveryHint: string, currentVersion?: number): MutationResult {
  return { ok: false, error: { code, message, recoveryHint, currentVersion } };
}

function coversTask(contribution: ScenarioState['contributions'][number], task: PlanTask) {
  return new Date(contribution.availableFrom).getTime() <= new Date(task.startsAt).getTime()
    && new Date(contribution.availableUntil).getTime() >= new Date(task.endsAt).getTime();
}

export function previewPlanDisruption(current: ScenarioState, input: PreviewDisruptionInput): MutationResult {
  if (input.planId !== current.plan.id) {
    return failure('UNKNOWN_PLAN', 'That plan does not exist in this workspace.', `Use planId ${current.plan.id}.`);
  }
  if (input.expectedVersion !== current.plan.version) {
    return failure('STALE_PLAN_VERSION', `The plan changed after version ${input.expectedVersion} was inspected.`, `Inspect the plan again, then retry against version ${current.plan.version}.`, current.plan.version);
  }

  let affectedTasks: PlanTask[] = [];
  let excludedContributionIds = new Set<string>();
  let summary = '';

  if (input.type === 'contribution_unavailable') {
    const contribution = current.contributions.find((item) => item.id === input.targetId);
    if (!contribution) return failure('UNKNOWN_CONTRIBUTION', 'That contribution does not exist.', 'Inspect or search contributions and retry with a current ID.');
    affectedTasks = current.plan.tasks.filter((task) => task.contributionIds.includes(contribution.id));
    excludedContributionIds = new Set([contribution.id]);
    summary = `${contribution.label} becoming unavailable would uncover ${affectedTasks.length} task${affectedTasks.length === 1 ? '' : 's'}.`;
  } else if (input.type === 'participant_unavailable') {
    const participant = current.participants.find((item) => item.id === input.targetId);
    if (!participant) return failure('UNKNOWN_PARTICIPANT', 'That participant does not exist.', 'Inspect the current coordination context and retry with a participant ID.');
    excludedContributionIds = new Set(current.contributions.filter((item) => item.participantId === participant.id).map((item) => item.id));
    affectedTasks = current.plan.tasks.filter((task) => task.contributionIds.some((id) => excludedContributionIds.has(id)));
    summary = `${participant.displayName} becoming unavailable would affect ${affectedTasks.length} task${affectedTasks.length === 1 ? '' : 's'}.`;
  } else if (input.type === 'task_time_shift') {
    const task = current.plan.tasks.find((item) => item.id === input.targetId);
    if (!task) return failure('UNKNOWN_TASK', 'That task does not exist.', 'Inspect the current plan and retry with a task ID.');
    if (typeof input.replacementValue !== 'string' || !input.replacementEndsAt) {
      return failure('MISSING_REPLACEMENT_VALUE', 'A time shift needs new start and end timestamps.', 'Provide replacementValue as the new start and replacementEndsAt as the new end.');
    }
    const shiftedStart = new Date(input.replacementValue).getTime();
    const shiftedEnd = new Date(input.replacementEndsAt).getTime();
    if (!Number.isFinite(shiftedStart) || !Number.isFinite(shiftedEnd) || shiftedStart >= shiftedEnd) {
      return failure('INVALID_TIME_WINDOW', 'The proposed time shift is not a valid forward time window.', 'Provide valid ISO timestamps with the start before the end.');
    }
    const shifted = { ...task, startsAt: input.replacementValue, endsAt: input.replacementEndsAt };
    const invalidAssigned = task.contributionIds.some((id) => {
      const contribution = current.contributions.find((item) => item.id === id);
      return !contribution || !coversTask(contribution, shifted);
    });
    affectedTasks = invalidAssigned ? [shifted] : [];
    summary = invalidAssigned ? `${task.label} would lose time-compatible coverage.` : `${task.label} remains covered after the proposed time shift.`;
  } else {
    const contribution = current.contributions.find((item) => item.id === input.targetId);
    if (!contribution) return failure('UNKNOWN_CONTRIBUTION', 'That contribution does not exist.', 'Inspect or search contributions and retry with a current ID.');
    const reducedCapacity = input.replacementValue;
    if (typeof reducedCapacity !== 'number' || reducedCapacity < 0) {
      return failure('INVALID_CAPACITY', 'A capacity reduction needs a non-negative numeric replacement.', 'Provide replacementValue as the remaining capacity.');
    }
    affectedTasks = current.plan.tasks.filter((task) => task.contributionIds.includes(contribution.id)
      && Boolean(task.capacityRequired && reducedCapacity < task.capacityRequired));
    excludedContributionIds = new Set([contribution.id]);
    summary = affectedTasks.length ? `${contribution.label} would no longer meet required capacity.` : 'The reduced capacity still satisfies the assigned tasks.';
  }

  const affectedCapabilities = new Set(affectedTasks.map((task) => task.requiredCapability));
  const assignedContributionIds = new Set(current.plan.tasks.flatMap((task) => task.contributionIds));
  const replacedContributionIds = new Set(affectedTasks.flatMap((task) => task.contributionIds));
  const retainedBudget = current.contributions
    .filter((contribution) => assignedContributionIds.has(contribution.id) && !replacedContributionIds.has(contribution.id))
    .reduce((total, contribution) => total + contribution.cost, 0);
  const candidateAlternativeContributionIds = current.contributions
    .filter((contribution) => contribution.availability === 'available'
      && !excludedContributionIds.has(contribution.id)
      && affectedCapabilities.has(contribution.capability)
      && affectedTasks.some((task) => task.requiredCapability === contribution.capability
        && coversTask(contribution, task)
        && (!task.capacityRequired || (contribution.capacity ?? 0) >= task.capacityRequired))
      && retainedBudget + (assignedContributionIds.has(contribution.id) ? 0 : contribution.cost) <= current.goal.budgetLimit)
    .map((contribution) => contribution.id);
  const affectedTaskIds = affectedTasks.map((task) => task.id);
  const brokenDependencyTaskIds = current.plan.tasks
    .filter((task) => task.dependencyTaskIds.some((id) => affectedTaskIds.includes(id)))
    .map((task) => task.id);
  const riskBefore = calculatePlanSummary(current).risk;
  const riskAfter = affectedTasks.length > 1 ? 'High' as const : affectedTasks.length ? 'Medium' as const : riskBefore;
  const next = structuredClone(current);
  const createdAt = new Date().toISOString();
  const token = `preview-${current.plan.version}-${input.type}-${input.targetId}-${current.activity.length + 1}`;
  next.disruptionPreview = {
    token,
    planId: current.plan.id,
    planVersion: current.plan.version,
    type: input.type,
    targetId: input.targetId,
    summary,
    affectedTaskIds,
    brokenDependencyTaskIds,
    newGapTaskIds: affectedTaskIds,
    candidateAlternativeContributionIds,
    riskBefore,
    riskAfter,
    createdAt,
  };
  next.activity.unshift({
    id: `activity-${token}`,
    actor: input.actor ?? 'agent',
    action: 'Previewed plan disruption',
    summary,
    planVersionBefore: current.plan.version,
    planVersionAfter: current.plan.version,
    timestamp: createdAt,
    changedEntityIds: [current.plan.id, input.targetId, ...affectedTaskIds],
  });
  return { ok: true, scenario: next };
}
