import type { DomainError, MutationResult, ScenarioState } from '@/domain/types';
import { validatePlan } from '@/domain/validation';

export type RequestCommitmentsInput = {
  planId: string;
  expectedVersion: number;
  participantIds: string[];
  message: string;
  inAppOnly: true;
  actor?: 'human' | 'agent';
};

export type SimulateCommitmentResponsesInput = {
  planId: string;
  expectedVersion: number;
  responses: Array<{ participantId: string; status: 'accepted' | 'declined' }>;
  actor?: 'human' | 'agent' | 'system';
};

export type PublishCoordinationPlanInput = {
  planId: string;
  expectedVersion: number;
  acknowledgement: 'Publish the accepted plan';
  actor?: 'human' | 'agent';
};

export type CommitmentRequestResult =
  | { ok: true; scenario: ScenarioState; requestedParticipantIds: string[]; skippedParticipants: Array<{ participantId: string; reason: string }> }
  | { ok: false; error: DomainError };

function failure(code: string, message: string, recoveryHint: string, currentVersion?: number): { ok: false; error: DomainError } {
  return { ok: false, error: { code, message, recoveryHint, currentVersion } };
}

function checkPlan(current: ScenarioState, planId: string, expectedVersion: number) {
  if (planId !== current.plan.id) return failure('UNKNOWN_PLAN', 'That plan does not exist in this workspace.', `Use planId ${current.plan.id}.`);
  if (expectedVersion !== current.plan.version) {
    return failure('STALE_PLAN_VERSION', `The plan changed after version ${expectedVersion} was inspected.`, `Inspect the plan again, then retry against version ${current.plan.version}.`, current.plan.version);
  }
  return null;
}

function assignedParticipantTasks(state: ScenarioState) {
  const contributionMap = new Map(state.contributions.map((item) => [item.id, item]));
  const tasks = new Map<string, Set<string>>();
  for (const task of state.plan.tasks) {
    for (const contributionId of task.contributionIds) {
      const participantId = contributionMap.get(contributionId)?.participantId;
      if (!participantId) continue;
      if (!tasks.has(participantId)) tasks.set(participantId, new Set());
      tasks.get(participantId)!.add(task.id);
    }
  }
  return tasks;
}

export function requestPlanCommitments(current: ScenarioState, input: RequestCommitmentsInput): CommitmentRequestResult {
  const planFailure = checkPlan(current, input.planId, input.expectedVersion);
  if (planFailure) return planFailure;
  if (current.plan.status === 'published') return failure('PUBLISHED_PLAN_IMMUTABLE', 'A published plan cannot request new commitments.', 'Reset the demo or create a new draft.');
  const validation = validatePlan(current);
  if (!validation.readyForCommitmentRequests) {
    return failure('PLAN_NOT_VALID_FOR_REQUESTS', 'The plan still has blocking validation issues.', 'Call validate_plan, resolve every blocker, then request commitments.');
  }

  const participantTasks = assignedParticipantTasks(current);
  const skippedParticipants: Array<{ participantId: string; reason: string }> = [];
  const requestedParticipantIds: string[] = [];
  for (const participantId of [...new Set(input.participantIds)]) {
    if (!current.participants.some((participant) => participant.id === participantId)) {
      skippedParticipants.push({ participantId, reason: 'Unknown participant.' });
      continue;
    }
    if (!participantTasks.has(participantId)) {
      skippedParticipants.push({ participantId, reason: 'Participant has no assignment in this plan version.' });
      continue;
    }
    const existing = current.commitments.find((item) => item.planId === current.plan.id && item.planVersion === current.plan.version && item.participantId === participantId);
    if (existing) {
      skippedParticipants.push({ participantId, reason: `Commitment is already ${existing.status}.` });
      continue;
    }
    requestedParticipantIds.push(participantId);
  }
  if (!requestedParticipantIds.length) {
    return failure('NO_COMMITMENTS_CREATED', 'No new commitment requests could be created.', 'Inspect skipped participants and request only assigned participants without a current response.');
  }

  const next = structuredClone(current);
  const timestamp = new Date().toISOString();
  for (const participantId of requestedParticipantIds) {
    next.commitments.push({
      id: `commitment-v${next.plan.version}-${participantId}`,
      planId: next.plan.id,
      planVersion: next.plan.version,
      participantId,
      taskIds: [...(participantTasks.get(participantId) ?? [])],
      status: 'pending',
    });
  }
  const requestedSet = new Set(requestedParticipantIds);
  const contributionOwners = new Map(next.contributions.map((item) => [item.id, item.participantId]));
  for (const task of next.plan.tasks) {
    if (task.contributionIds.some((id) => requestedSet.has(contributionOwners.get(id) ?? ''))) task.status = 'requested';
  }
  next.plan.status = 'requesting';
  next.goal.status = 'requesting';
  next.plan.updatedAt = timestamp;
  next.disruptionPreview = undefined;
  next.activity.unshift({
    id: `activity-request-v${next.plan.version}-${next.activity.length + 1}`,
    actor: input.actor ?? 'agent',
    action: 'Requested in-app commitments',
    summary: `Created ${requestedParticipantIds.length} simulated in-app request${requestedParticipantIds.length === 1 ? '' : 's'}. No external message was sent.`,
    planVersionBefore: next.plan.version,
    planVersionAfter: next.plan.version,
    timestamp,
    changedEntityIds: [next.plan.id, ...requestedParticipantIds],
  });
  return { ok: true, scenario: next, requestedParticipantIds, skippedParticipants };
}

export function simulateCommitmentResponses(current: ScenarioState, input: SimulateCommitmentResponsesInput): MutationResult {
  const planFailure = checkPlan(current, input.planId, input.expectedVersion);
  if (planFailure) return planFailure;
  if (current.plan.status !== 'requesting') return failure('PLAN_NOT_REQUESTING', 'The plan has no active commitment round.', 'Request in-app commitments before simulating responses.');
  if (!input.responses.length) return failure('NO_RESPONSES', 'No simulated responses were provided.', 'Respond only to currently pending in-app commitments.');

  const next = structuredClone(current);
  const timestamp = new Date().toISOString();
  const changedParticipants: string[] = [];
  for (const response of input.responses) {
    const commitment = next.commitments.find((item) => item.planId === next.plan.id && item.planVersion === next.plan.version && item.participantId === response.participantId);
    if (!commitment || commitment.status !== 'pending') {
      return failure('COMMITMENT_NOT_PENDING', `No pending commitment exists for ${response.participantId}.`, 'Inspect the plan commitments and respond only to pending requests.');
    }
    commitment.status = response.status;
    commitment.respondedAt = timestamp;
    changedParticipants.push(response.participantId);
  }

  const contributionOwners = new Map(next.contributions.map((item) => [item.id, item.participantId]));
  const currentCommitments = next.commitments.filter((item) => item.planId === next.plan.id && item.planVersion === next.plan.version);
  for (const task of next.plan.tasks) {
    const participantIds = [...new Set(task.contributionIds.map((id) => contributionOwners.get(id)).filter((id): id is string => Boolean(id)))];
    const statuses = participantIds.map((id) => currentCommitments.find((item) => item.participantId === id)?.status);
    task.status = statuses.some((status) => status === 'declined') ? 'declined'
      : statuses.length > 0 && statuses.every((status) => status === 'accepted') ? 'accepted'
        : 'requested';
  }
  const assignedParticipants = [...assignedParticipantTasks(next).keys()];
  const allAccepted = assignedParticipants.length > 0 && assignedParticipants.every((participantId) => currentCommitments.find((item) => item.participantId === participantId)?.status === 'accepted');
  next.plan.status = allAccepted ? 'ready' : 'requesting';
  next.goal.status = allAccepted ? 'ready' : 'requesting';
  next.plan.updatedAt = timestamp;
  next.activity.unshift({
    id: `activity-responses-v${next.plan.version}-${next.activity.length + 1}`,
    actor: input.actor ?? 'system',
    action: 'Simulated participant responses',
    summary: allAccepted ? 'Every required participant accepted the in-app commitment.' : 'The simulated commitment round still needs attention.',
    planVersionBefore: next.plan.version,
    planVersionAfter: next.plan.version,
    timestamp,
    changedEntityIds: [next.plan.id, ...changedParticipants],
  });
  return { ok: true, scenario: next };
}

export function publishCoordinationPlan(current: ScenarioState, input: PublishCoordinationPlanInput): MutationResult {
  const planFailure = checkPlan(current, input.planId, input.expectedVersion);
  if (planFailure) return planFailure;
  if (current.plan.status === 'published') return failure('PLAN_ALREADY_PUBLISHED', 'This plan version is already published.', 'Inspect the immutable published summary or reset the demo.');
  const validation = validatePlan(current);
  if (!validation.readyToPublish) {
    return failure('PLAN_NOT_READY_TO_PUBLISH', 'The plan cannot be published until validation and consent gates pass.', 'Call validate_plan and resolve every blocker or missing commitment.');
  }

  const next = structuredClone(current);
  const timestamp = new Date().toISOString();
  next.plan.status = 'published';
  next.plan.publishedAt = timestamp;
  next.plan.updatedAt = timestamp;
  next.plan.tasks.forEach((task) => { task.status = 'complete'; });
  next.goal.status = 'published';
  next.disruptionPreview = undefined;
  next.activity.unshift({
    id: `activity-publish-v${next.plan.version}`,
    actor: input.actor ?? 'agent',
    action: 'Published accepted plan',
    summary: `Published immutable plan version ${next.plan.version} after every hard constraint and commitment passed. No external message was sent.`,
    planVersionBefore: next.plan.version,
    planVersionAfter: next.plan.version,
    timestamp,
    changedEntityIds: [next.plan.id, next.goal.id, ...next.plan.tasks.map((task) => task.id)],
  });
  return { ok: true, scenario: next };
}
