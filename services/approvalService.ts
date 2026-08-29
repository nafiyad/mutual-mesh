import type { MutationResult, ScenarioState } from '@/domain/types';
import {
  publishCoordinationPlan,
  requestPlanCommitments,
  type PublishCoordinationPlanInput,
  type RequestCommitmentsInput,
} from '@/services/commitmentService';

function failure(code: string, message: string, recoveryHint: string, currentVersion?: number): MutationResult {
  return { ok: false, error: { code, message, recoveryHint, currentVersion } };
}

function ensureNoPendingIntent(current: ScenarioState) {
  return current.approvalIntent
    ? failure('HUMAN_APPROVAL_ALREADY_PENDING', 'A human approval decision is already pending.', 'Wait for the coordinator to approve or reject the visible intent before staging another.')
    : null;
}

export function stageCommitmentRequestIntent(
  current: ScenarioState,
  input: RequestCommitmentsInput,
): MutationResult {
  const pending = ensureNoPendingIntent(current);
  if (pending) return pending;
  const preflight = requestPlanCommitments(current, { ...input, actor: 'agent' });
  if (!preflight.ok) return preflight;

  const next = structuredClone(current);
  const createdAt = new Date().toISOString();
  next.approvalIntent = {
    id: `approval-request-v${current.plan.version}`,
    type: 'request_commitments',
    planId: current.plan.id,
    planVersion: current.plan.version,
    participantIds: preflight.requestedParticipantIds,
    message: input.message,
    createdBy: 'agent',
    createdAt,
  };
  next.activity.unshift({
    id: `activity-approval-request-v${current.plan.version}`,
    actor: 'agent',
    action: 'Staged commitment requests',
    summary: `Prepared ${preflight.requestedParticipantIds.length} in-app commitment request${preflight.requestedParticipantIds.length === 1 ? '' : 's'} for explicit human approval. No request was sent.`,
    planVersionBefore: current.plan.version,
    planVersionAfter: current.plan.version,
    timestamp: createdAt,
    changedEntityIds: [current.plan.id, ...preflight.requestedParticipantIds],
  });
  return { ok: true, scenario: next };
}

export function stagePublicationIntent(
  current: ScenarioState,
  input: PublishCoordinationPlanInput,
): MutationResult {
  const pending = ensureNoPendingIntent(current);
  if (pending) return pending;
  const preflight = publishCoordinationPlan(current, { ...input, actor: 'agent' });
  if (!preflight.ok) return preflight;

  const next = structuredClone(current);
  const createdAt = new Date().toISOString();
  next.approvalIntent = {
    id: `approval-publish-v${current.plan.version}`,
    type: 'publish_plan',
    planId: current.plan.id,
    planVersion: current.plan.version,
    createdBy: 'agent',
    createdAt,
  };
  next.activity.unshift({
    id: `activity-approval-publish-v${current.plan.version}`,
    actor: 'agent',
    action: 'Staged publication',
    summary: `Prepared accepted plan version ${current.plan.version} for explicit human publication approval. Nothing was published.`,
    planVersionBefore: current.plan.version,
    planVersionAfter: current.plan.version,
    timestamp: createdAt,
    changedEntityIds: [current.plan.id],
  });
  return { ok: true, scenario: next };
}

export function approvePendingIntent(current: ScenarioState, intentId: string): MutationResult {
  const intent = current.approvalIntent;
  if (!intent || intent.id !== intentId) {
    return failure('UNKNOWN_APPROVAL_INTENT', 'That approval intent is no longer pending.', 'Inspect the current plan and approval state before retrying.');
  }
  if (intent.planId !== current.plan.id || intent.planVersion !== current.plan.version) {
    return failure('STALE_APPROVAL_INTENT', 'The plan changed after this approval intent was staged.', `Inspect plan version ${current.plan.version} and ask the agent to stage a new intent.`, current.plan.version);
  }

  const result = intent.type === 'request_commitments'
    ? requestPlanCommitments(current, {
        planId: intent.planId,
        expectedVersion: intent.planVersion,
        participantIds: intent.participantIds,
        message: intent.message,
        inAppOnly: true,
        actor: 'human',
      })
    : publishCoordinationPlan(current, {
        planId: intent.planId,
        expectedVersion: intent.planVersion,
        acknowledgement: 'Publish the accepted plan',
        actor: 'human',
      });
  if (!result.ok) return result;

  result.scenario.approvalIntent = undefined;
  result.scenario.activity[0].action = intent.type === 'request_commitments'
    ? 'Approved and requested commitments'
    : 'Approved and published plan';
  result.scenario.activity[0].summary = intent.type === 'request_commitments'
    ? `A human approved ${intent.participantIds.length} version-bound in-app commitment request${intent.participantIds.length === 1 ? '' : 's'}. No external message was sent.`
    : `A human approved immutable publication of accepted plan version ${intent.planVersion}. No external message was sent.`;
  return result;
}

export function rejectPendingIntent(current: ScenarioState, intentId: string): MutationResult {
  const intent = current.approvalIntent;
  if (!intent || intent.id !== intentId) {
    return failure('UNKNOWN_APPROVAL_INTENT', 'That approval intent is no longer pending.', 'Inspect the current plan and approval state before retrying.');
  }
  const next = structuredClone(current);
  next.approvalIntent = undefined;
  const timestamp = new Date().toISOString();
  next.activity.unshift({
    id: `activity-reject-${intent.id}`,
    actor: 'human',
    action: 'Rejected agent intent',
    summary: intent.type === 'request_commitments'
      ? 'A human rejected the staged commitment requests. No participant was contacted.'
      : 'A human rejected the staged publication. The accepted plan remains unpublished.',
    planVersionBefore: current.plan.version,
    planVersionAfter: current.plan.version,
    timestamp,
    changedEntityIds: [current.plan.id],
  });
  return { ok: true, scenario: next };
}
