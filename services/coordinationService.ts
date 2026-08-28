import { checkScenarioInvariants } from '@/domain/invariants';
import { calculatePlanSummary } from '@/domain/scoring';
import type { DomainError, MutationResult, PlanTask, ScenarioState } from '@/domain/types';

export type DraftPlanTaskInput = {
  key: string;
  label: string;
  requiredCapability: string;
  startsAt: string;
  endsAt: string;
  capacityRequired?: number;
  contributionIds: string[];
  dependencyKeys: string[];
};

export type DraftCoordinationPlanInput = {
  goalId: string;
  title: string;
  rationale: string;
  tasks: DraftPlanTaskInput[];
  draftOnly: true;
};

export type RevisePlanOperation =
  | { type: 'assign'; taskId: string; contributionId: string }
  | { type: 'unassign'; taskId: string; contributionId: string }
  | { type: 'add_task'; task: DraftPlanTaskInput }
  | { type: 'remove_task'; taskId: string }
  | { type: 'update_time'; taskId: string; startsAt: string; endsAt: string }
  | { type: 'add_dependency'; taskId: string; dependencyTaskId: string }
  | { type: 'remove_dependency'; taskId: string; dependencyTaskId: string };

export type ReviseCoordinationPlanInput = {
  planId: string;
  expectedVersion: number;
  operations: RevisePlanOperation[];
  rationale: string;
};

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

function failure(code: string, message: string, recoveryHint: string, currentVersion?: number): MutationResult {
  return { ok: false, error: { code, message, recoveryHint, currentVersion } };
}

function taskIdForKey(planId: string, key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${planId}-task-${normalized}`;
}

function validateTaskWindow(task: Pick<PlanTask, 'startsAt' | 'endsAt'>) {
  const start = new Date(task.startsAt).getTime();
  const end = new Date(task.endsAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start < end;
}

function validateAssignments(state: ScenarioState): MutationResult | null {
  const contributions = new Map(state.contributions.map((item) => [item.id, item]));
  for (const task of state.plan.tasks) {
    if (!validateTaskWindow(task)) {
      return failure('INVALID_TIME_WINDOW', `${task.label} must end after it starts.`, 'Revise the task with a valid ISO 8601 time window.');
    }
    for (const contributionId of task.contributionIds) {
      const contribution = contributions.get(contributionId);
      if (!contribution) {
        return failure('UNKNOWN_CONTRIBUTION', `${task.label} references an unknown contribution.`, 'Search contributions again and use a current contribution ID.');
      }
      if (contribution.availability !== 'available') {
        return failure('CONTRIBUTION_UNAVAILABLE', `${contribution.label} is not available.`, 'Choose a contribution whose availability is available.');
      }
      if (contribution.capability !== task.requiredCapability) {
        return failure('CAPABILITY_MISMATCH', `${contribution.label} cannot cover ${task.label}.`, `Choose a ${task.requiredCapability} contribution.`);
      }
      const coversWindow = new Date(contribution.availableFrom).getTime() <= new Date(task.startsAt).getTime()
        && new Date(contribution.availableUntil).getTime() >= new Date(task.endsAt).getTime();
      if (!coversWindow) {
        return failure('TIME_WINDOW_CONFLICT', `${contribution.label} does not cover the full ${task.label} window.`, 'Search for another contribution or revise the task time.');
      }
    }
  }
  return null;
}

function validateCandidate(state: ScenarioState): MutationResult | null {
  const assignmentFailure = validateAssignments(state);
  if (assignmentFailure) return assignmentFailure;
  const issues = checkScenarioInvariants(state);
  if (issues.length) {
    return failure('INVARIANT_VIOLATION', issues[0].message, 'Inspect the current plan, then revise the affected IDs or dependencies.');
  }
  return null;
}

function taskFromInput(planId: string, input: DraftPlanTaskInput, keyToId: Map<string, string>): PlanTask {
  return {
    id: taskIdForKey(planId, input.key),
    key: input.key,
    label: input.label,
    requiredCapability: input.requiredCapability,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    capacityRequired: input.capacityRequired,
    contributionIds: [...new Set(input.contributionIds)],
    dependencyTaskIds: input.dependencyKeys.map((key) => keyToId.get(key) ?? `unknown-task-key-${key}`),
    status: input.contributionIds.length ? 'suggested' : 'gap',
  };
}

export function replaceDraftCoordinationPlan(
  current: ScenarioState,
  input: DraftCoordinationPlanInput,
): MutationResult {
  if (input.goalId !== current.goal.id) {
    return failure('UNKNOWN_GOAL', 'The requested goal is not active in this workspace.', `Use goalId ${current.goal.id}.`);
  }
  if (current.plan.status === 'published') {
    return failure('PUBLISHED_PLAN_IMMUTABLE', 'Published plans cannot be replaced.', 'Start a new draft workflow instead of editing the published plan.');
  }
  const keys = input.tasks.map((task) => task.key);
  if (new Set(keys).size !== keys.length) {
    return failure('DUPLICATE_TASK_KEY', 'Every draft task needs a unique key.', 'Rename duplicate task keys and retry the complete draft.');
  }

  const next = structuredClone(current);
  const versionBefore = next.plan.version;
  const keyToId = new Map(keys.map((key) => [key, taskIdForKey(next.plan.id, key)]));
  next.plan = {
    ...next.plan,
    goalId: input.goalId,
    title: input.title,
    rationale: input.rationale,
    version: versionBefore + 1,
    status: 'draft',
    tasks: input.tasks.map((task) => taskFromInput(next.plan.id, task, keyToId)),
    updatedAt: new Date().toISOString(),
    publishedAt: undefined,
  };
  next.activity.unshift({
    id: `activity-agent-draft-v${next.plan.version}`,
    actor: 'agent',
    action: 'Drafted coordination plan',
    summary: `Replaced the unpublished draft with ${next.plan.tasks.length} version-safe tasks.`,
    planVersionBefore: versionBefore,
    planVersionAfter: next.plan.version,
    timestamp: next.plan.updatedAt,
    changedEntityIds: [next.plan.id, ...next.plan.tasks.map((task) => task.id)],
  });

  const invalid = validateCandidate(next);
  return invalid ?? { ok: true, scenario: next };
}

export function reviseDraftCoordinationPlan(
  current: ScenarioState,
  input: ReviseCoordinationPlanInput,
): MutationResult {
  if (input.planId !== current.plan.id) {
    return failure('UNKNOWN_PLAN', 'That plan does not exist in this workspace.', `Use planId ${current.plan.id}.`);
  }
  if (input.expectedVersion !== current.plan.version) {
    return failure('STALE_PLAN_VERSION', `The plan changed after version ${input.expectedVersion} was inspected.`, `Inspect the plan again, then retry against version ${current.plan.version}.`, current.plan.version);
  }
  if (current.plan.status === 'published') {
    return failure('PUBLISHED_PLAN_IMMUTABLE', 'Published plans cannot be revised.', 'Start a new draft workflow instead of editing the published plan.');
  }

  const next = structuredClone(current);
  const changedIds = new Set<string>([next.plan.id]);
  const findTask = (taskId: string) => next.plan.tasks.find((task) => task.id === taskId);

  for (const operation of input.operations) {
    if (operation.type === 'add_task') {
      if (next.plan.tasks.some((task) => task.key === operation.task.key)) {
        return failure('DUPLICATE_TASK_KEY', `Task key ${operation.task.key} already exists.`, 'Use a unique task key or revise the existing task.');
      }
      const keyToId = new Map(next.plan.tasks.map((task) => [task.key, task.id]));
      keyToId.set(operation.task.key, taskIdForKey(next.plan.id, operation.task.key));
      const task = taskFromInput(next.plan.id, operation.task, keyToId);
      next.plan.tasks.push(task);
      changedIds.add(task.id);
      continue;
    }

    const task = findTask(operation.taskId);
    if (!task) {
      return failure('UNKNOWN_TASK', `Task ${operation.taskId} does not exist.`, 'Inspect the current plan and retry with a valid task ID.');
    }
    changedIds.add(task.id);

    if (operation.type === 'assign') {
      if (!task.contributionIds.includes(operation.contributionId)) task.contributionIds.push(operation.contributionId);
      task.status = 'suggested';
      changedIds.add(operation.contributionId);
    } else if (operation.type === 'unassign') {
      if (!task.contributionIds.includes(operation.contributionId)) {
        return failure('ASSIGNMENT_NOT_FOUND', 'That contribution is not assigned to the task.', 'Inspect the plan and remove an assignment that currently exists.');
      }
      task.contributionIds = task.contributionIds.filter((id) => id !== operation.contributionId);
      task.status = task.contributionIds.length ? 'suggested' : 'gap';
      changedIds.add(operation.contributionId);
    } else if (operation.type === 'remove_task') {
      const dependent = next.plan.tasks.find((candidate) => candidate.dependencyTaskIds.includes(task.id));
      if (dependent) {
        return failure('TASK_HAS_DEPENDENTS', `${task.label} is still required by ${dependent.label}.`, 'Remove dependent links before removing the task.');
      }
      next.plan.tasks = next.plan.tasks.filter((candidate) => candidate.id !== task.id);
    } else if (operation.type === 'update_time') {
      task.startsAt = operation.startsAt;
      task.endsAt = operation.endsAt;
    } else if (operation.type === 'add_dependency') {
      if (!findTask(operation.dependencyTaskId)) {
        return failure('UNKNOWN_DEPENDENCY', `Dependency ${operation.dependencyTaskId} does not exist.`, 'Inspect the current plan and use a valid dependency task ID.');
      }
      if (!task.dependencyTaskIds.includes(operation.dependencyTaskId)) task.dependencyTaskIds.push(operation.dependencyTaskId);
      changedIds.add(operation.dependencyTaskId);
    } else if (operation.type === 'remove_dependency') {
      if (!task.dependencyTaskIds.includes(operation.dependencyTaskId)) {
        return failure('DEPENDENCY_NOT_FOUND', 'That dependency is not attached to the task.', 'Inspect the current plan and remove a dependency that exists.');
      }
      task.dependencyTaskIds = task.dependencyTaskIds.filter((id) => id !== operation.dependencyTaskId);
      changedIds.add(operation.dependencyTaskId);
    }
  }

  const invalid = validateCandidate(next);
  if (invalid) return invalid;

  const versionBefore = next.plan.version;
  next.plan.version += 1;
  next.plan.rationale = input.rationale;
  next.plan.status = 'draft';
  next.plan.updatedAt = new Date().toISOString();
  next.activity.unshift({
    id: `activity-agent-revise-v${next.plan.version}`,
    actor: 'agent',
    action: 'Revised coordination plan',
    summary: `Applied ${input.operations.length} transactional operation${input.operations.length === 1 ? '' : 's'}: ${input.rationale}`,
    planVersionBefore: versionBefore,
    planVersionAfter: next.plan.version,
    timestamp: next.plan.updatedAt,
    changedEntityIds: [...changedIds],
  });

  const finalInvalid = validateCandidate(next);
  return finalInvalid ?? { ok: true, scenario: next };
}

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
