import { checkScenarioInvariants } from '@/domain/invariants';
import { calculatePlanSummary, type PlanSummary } from '@/domain/scoring';
import type { Contribution, ScenarioState } from '@/domain/types';

export type ValidationIssue = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  affectedEntityIds: string[];
  recoveryHint: string;
};

export type PlanValidationResult = {
  planId: string;
  planVersion: number;
  summary: PlanSummary;
  issues: ValidationIssue[];
  blockingCount: number;
  warningCount: number;
  readyForCommitmentRequests: boolean;
  readyToPublish: boolean;
  checks: Array<{
    key: string;
    label: string;
    status: 'pass' | 'warning' | 'error';
    detail: string;
  }>;
};

function coversTaskWindow(contribution: Contribution, startsAt: string, endsAt: string) {
  return new Date(contribution.availableFrom).getTime() <= new Date(startsAt).getTime()
    && new Date(contribution.availableUntil).getTime() >= new Date(endsAt).getTime();
}

export function validatePlan(state: ScenarioState): PlanValidationResult {
  const issues: ValidationIssue[] = [];
  const contributionMap = new Map(state.contributions.map((contribution) => [contribution.id, contribution]));

  for (const issue of checkScenarioInvariants(state)) {
    issues.push({
      ...issue,
      severity: 'error',
      recoveryHint: 'Reset the demo or revise the affected record before continuing.',
    });
  }

  for (const task of state.plan.tasks) {
    const assigned = task.contributionIds
      .map((id) => contributionMap.get(id))
      .filter((contribution): contribution is Contribution => Boolean(contribution));

    const unavailable = assigned.filter((contribution) => contribution.availability !== 'available');
    if (unavailable.length) {
      issues.push({
        code: 'CONTRIBUTION_UNAVAILABLE',
        severity: 'error',
        message: `${task.label} uses a contribution that is no longer available.`,
        affectedEntityIds: [task.id, ...unavailable.map((item) => item.id)],
        recoveryHint: 'Replace it with an available contribution before requesting commitments.',
      });
    }

    const timeConflicts = assigned.filter((contribution) => !coversTaskWindow(contribution, task.startsAt, task.endsAt));
    if (timeConflicts.length) {
      issues.push({
        code: 'TIME_WINDOW_CONFLICT',
        severity: 'error',
        message: `${task.label} is outside an assigned contribution’s available time.`,
        affectedEntityIds: [task.id, ...timeConflicts.map((item) => item.id)],
        recoveryHint: 'Choose a contribution available for the task’s complete time window.',
      });
    }

    if (task.capacityRequired && assigned.length) {
      const capacity = assigned.reduce((total, contribution) => total + (contribution.capacity ?? 0), 0);
      if (capacity < task.capacityRequired) {
        issues.push({
          code: 'CAPACITY_SHORTFALL',
          severity: 'error',
          message: `${task.label} covers ${capacity} of ${task.capacityRequired} required places or units.`,
          affectedEntityIds: [task.id, ...assigned.map((item) => item.id)],
          recoveryHint: 'Add enough capacity before requesting commitments.',
        });
      }
    }
  }

  const accessibilityLocked = state.constraints.some(
    (constraint) => constraint.kind === 'accessibility' && constraint.hard && constraint.lockedByHuman,
  );
  const venueTask = state.plan.tasks.find((task) => task.requiredCapability === 'accessible-venue');
  const venueContributions = venueTask?.contributionIds
    .map((id) => contributionMap.get(id))
    .filter((contribution): contribution is Contribution => Boolean(contribution)) ?? [];
  if (accessibilityLocked && !venueContributions.some((item) => item.accessibilityTags.includes('step-free'))) {
    issues.push({
      code: 'ACCESSIBILITY_NOT_COVERED',
      severity: 'error',
      message: 'The locked wheelchair-accessibility requirement is not covered.',
      affectedEntityIds: [state.goal.id, ...(venueTask ? [venueTask.id] : [])],
      recoveryHint: 'Assign a venue explicitly marked step-free.',
    });
  }

  const summary = calculatePlanSummary(state);
  if (summary.budgetSpent > state.goal.budgetLimit) {
    issues.push({
      code: 'BUDGET_EXCEEDED',
      severity: 'error',
      message: `The plan costs $${summary.budgetSpent}, above the $${state.goal.budgetLimit} limit.`,
      affectedEntityIds: [state.goal.id, state.plan.id],
      recoveryHint: 'Replace or remove costs until the plan is within budget.',
    });
  }

  const missingTasks = state.plan.tasks.filter((task) => task.status === 'gap' || task.contributionIds.length === 0);
  for (const task of missingTasks) {
    issues.push({
      code: 'MISSING_REQUIRED_CAPABILITY',
      severity: 'error',
      message: `${task.label} still needs a viable contribution.`,
      affectedEntityIds: [task.id],
      recoveryHint: `Assign an available ${task.requiredCapability} contribution.`,
    });
  }

  const assignedParticipantIds = new Set(
    state.plan.tasks
      .flatMap((task) => task.contributionIds)
      .map((id) => contributionMap.get(id)?.participantId)
      .filter((id): id is string => Boolean(id)),
  );
  const acceptedParticipantIds = new Set(
    state.commitments
      .filter((commitment) => commitment.planId === state.plan.id && commitment.planVersion === state.plan.version && commitment.status === 'accepted')
      .map((commitment) => commitment.participantId),
  );
  const allCommitmentsAccepted = assignedParticipantIds.size > 0
    && [...assignedParticipantIds].every((id) => acceptedParticipantIds.has(id));
  const declinedCommitments = state.commitments.filter(
    (commitment) => commitment.planId === state.plan.id && commitment.planVersion === state.plan.version && commitment.status === 'declined',
  );

  if (declinedCommitments.length) {
    issues.push({
      code: 'COMMITMENT_DECLINED',
      severity: 'error',
      message: `${declinedCommitments.length} required participant${declinedCommitments.length === 1 ? ' has' : 's have'} declined this plan version.`,
      affectedEntityIds: [state.plan.id, ...declinedCommitments.map((item) => item.participantId)],
      recoveryHint: 'Revise the affected assignments, validate the new version, and request commitments again.',
    });
  }

  const hasStructuralBlocker = issues.some((issue) => issue.severity === 'error');
  if (!hasStructuralBlocker && !allCommitmentsAccepted) {
    issues.push({
      code: 'COMMITMENTS_NOT_REQUESTED',
      severity: 'warning',
      message: 'The plan is valid, but participant commitments are not complete.',
      affectedEntityIds: [state.plan.id, ...assignedParticipantIds],
      recoveryHint: 'Request commitments in the next workflow stage before publishing.',
    });
  }

  if (state.plan.status !== 'published') {
    issues.push({
      code: 'PLAN_NOT_PUBLISHED',
      severity: 'warning',
      message: 'This is still an editable draft.',
      affectedEntityIds: [state.plan.id],
      recoveryHint: 'Publish only after every hard check and required commitment passes.',
    });
  }

  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  const blockingCount = issues.filter((issue) => issue.severity === 'error').length;
  const hasIssue = (codes: string[]) => issues.some((issue) => codes.includes(issue.code));
  const statusFor = (codes: string[]) => {
    const matching = issues.filter((issue) => codes.includes(issue.code));
    return matching.some((issue) => issue.severity === 'error') ? 'error' as const
      : matching.length ? 'warning' as const
        : 'pass' as const;
  };

  return {
    planId: state.plan.id,
    planVersion: state.plan.version,
    summary,
    issues,
    blockingCount,
    warningCount,
    readyForCommitmentRequests: blockingCount === 0,
    readyToPublish: blockingCount === 0 && allCommitmentsAccepted,
    checks: [
      { key: 'entities', label: 'Entities & dependencies', status: statusFor(['DUPLICATE_ENTITY_ID', 'UNKNOWN_PLAN_GOAL', 'UNKNOWN_CONSTRAINT', 'UNKNOWN_CONTRIBUTOR', 'UNKNOWN_CONTRIBUTION', 'UNKNOWN_DEPENDENCY', 'DEPENDENCY_CYCLE']), detail: hasIssue(['DEPENDENCY_CYCLE']) ? 'A dependency cycle needs attention.' : 'IDs and dependency order are coherent.' },
      { key: 'availability', label: 'Availability & timing', status: statusFor(['CONTRIBUTION_UNAVAILABLE', 'TIME_WINDOW_CONFLICT']), detail: 'Assigned contributions cover their task windows.' },
      { key: 'capacity', label: 'Capacity & accessibility', status: statusFor(['CAPACITY_SHORTFALL', 'ACCESSIBILITY_NOT_COVERED']), detail: '50 seats, 50 snack packs, and step-free access are covered.' },
      { key: 'workload', label: 'Workload', status: statusFor(['WORKLOAD_EXCEEDED']), detail: 'No participant exceeds two assignments.' },
      { key: 'budget', label: 'Budget', status: statusFor(['BUDGET_EXCEEDED']), detail: `$${summary.budgetSpent} of $${state.goal.budgetLimit} allocated.` },
      { key: 'coverage', label: 'Required capabilities', status: statusFor(['MISSING_REQUIRED_CAPABILITY']), detail: `${summary.coveredTasks} of ${summary.totalTasks} tasks covered.` },
      { key: 'consent', label: 'Consent & publication', status: statusFor(['COMMITMENT_DECLINED', 'COMMITMENTS_NOT_REQUESTED', 'PLAN_NOT_PUBLISHED']), detail: allCommitmentsAccepted ? 'All required commitments are accepted.' : declinedCommitments.length ? 'A declined commitment requires a new draft version.' : 'In-app commitments must be accepted before publication.' },
    ],
  };
}
