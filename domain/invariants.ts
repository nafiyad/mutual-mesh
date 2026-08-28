import type { ScenarioState } from '@/domain/types';

export type InvariantIssue = {
  code: string;
  message: string;
  affectedEntityIds: string[];
};

function findDuplicates(ids: string[]) {
  const seen = new Set<string>();
  return ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
}

function hasDependencyCycle(state: ScenarioState) {
  const tasks = new Map(state.plan.tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (taskId: string): boolean => {
    if (visiting.has(taskId)) return true;
    if (visited.has(taskId)) return false;
    visiting.add(taskId);
    const task = tasks.get(taskId);
    const cyclic = task?.dependencyTaskIds.some(visit) ?? false;
    visiting.delete(taskId);
    visited.add(taskId);
    return cyclic;
  };

  return state.plan.tasks.some((task) => visit(task.id));
}

export function checkScenarioInvariants(state: ScenarioState): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  const participantIds = new Set(state.participants.map((participant) => participant.id));
  const contributionIds = new Set(state.contributions.map((contribution) => contribution.id));
  const constraintIds = new Set(state.constraints.map((constraint) => constraint.id));
  const taskIds = new Set(state.plan.tasks.map((task) => task.id));

  const duplicateIds = findDuplicates([
    state.goal.id,
    state.plan.id,
    ...state.constraints.map((item) => item.id),
    ...state.participants.map((item) => item.id),
    ...state.contributions.map((item) => item.id),
    ...state.plan.tasks.map((item) => item.id),
    ...state.commitments.map((item) => item.id),
    ...state.activity.map((item) => item.id),
  ]);
  if (duplicateIds.length) {
    issues.push({ code: 'DUPLICATE_ENTITY_ID', message: 'Every scenario entity must have a unique ID.', affectedEntityIds: duplicateIds });
  }

  if (state.plan.goalId !== state.goal.id) {
    issues.push({ code: 'UNKNOWN_PLAN_GOAL', message: 'The plan must reference the active goal.', affectedEntityIds: [state.plan.id, state.plan.goalId] });
  }

  const unknownConstraints = state.goal.constraintIds.filter((id) => !constraintIds.has(id));
  if (unknownConstraints.length) {
    issues.push({ code: 'UNKNOWN_CONSTRAINT', message: 'The goal references an unknown constraint.', affectedEntityIds: unknownConstraints });
  }

  for (const contribution of state.contributions) {
    if (!participantIds.has(contribution.participantId)) {
      issues.push({ code: 'UNKNOWN_CONTRIBUTOR', message: 'A contribution references an unknown participant.', affectedEntityIds: [contribution.id, contribution.participantId] });
    }
  }

  for (const task of state.plan.tasks) {
    const unknownContributions = task.contributionIds.filter((id) => !contributionIds.has(id));
    if (unknownContributions.length) {
      issues.push({ code: 'UNKNOWN_CONTRIBUTION', message: 'A task references an unknown contribution.', affectedEntityIds: [task.id, ...unknownContributions] });
    }
    const unknownDependencies = task.dependencyTaskIds.filter((id) => !taskIds.has(id));
    if (unknownDependencies.length) {
      issues.push({ code: 'UNKNOWN_DEPENDENCY', message: 'A task references an unknown dependency.', affectedEntityIds: [task.id, ...unknownDependencies] });
    }
    if (task.status === 'gap' && task.contributionIds.length > 0) {
      issues.push({ code: 'GAP_HAS_ASSIGNMENT', message: 'A gap cannot already have a contribution assigned.', affectedEntityIds: [task.id, ...task.contributionIds] });
    }
  }

  if (hasDependencyCycle(state)) {
    issues.push({ code: 'DEPENDENCY_CYCLE', message: 'Task dependencies must not form a cycle.', affectedEntityIds: state.plan.tasks.map((task) => task.id) });
  }

  for (const participant of state.participants) {
    const ownedContributionIds = new Set(
      state.contributions.filter((item) => item.participantId === participant.id).map((item) => item.id),
    );
    const assignmentCount = state.plan.tasks.filter((task) => task.contributionIds.some((id) => ownedContributionIds.has(id))).length;
    if (assignmentCount > participant.maxAssignments) {
      issues.push({ code: 'WORKLOAD_EXCEEDED', message: `${participant.displayName} has more assignments than allowed.`, affectedEntityIds: [participant.id] });
    }
  }

  return issues;
}
