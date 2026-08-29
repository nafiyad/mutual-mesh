import { z } from 'zod';
import { createSeedScenario } from '@/data/seedScenario';
import { checkScenarioInvariants } from '@/domain/invariants';
import type { ScenarioState } from '@/domain/types';

const isoDateTime = z.string().datetime({ offset: true });
const entityId = z.string().trim().min(1).max(160);

const goalSchema = z.strictObject({
  id: entityId,
  title: z.string(),
  description: z.string(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  budgetLimit: z.number().nonnegative(),
  locationLabel: z.string(),
  attendanceTarget: z.number().positive().optional(),
  status: z.enum(['open', 'drafted', 'requesting', 'ready', 'published']),
  constraintIds: z.array(entityId),
});

const constraintSchema = z.strictObject({
  id: entityId,
  kind: z.enum(['time', 'budget', 'capacity', 'accessibility', 'workload', 'dependency']),
  label: z.string(),
  hard: z.boolean(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  lockedByHuman: z.boolean(),
});

const participantSchema = z.strictObject({
  id: entityId,
  displayName: z.string(),
  avatarSeed: z.string(),
  maxAssignments: z.number().int().nonnegative(),
  trustLabel: z.enum(['demo', 'verified', 'unverified']),
});

const contributionSchema = z.strictObject({
  id: entityId,
  participantId: entityId,
  kind: z.enum(['skill', 'resource', 'space', 'transport', 'funding', 'food']),
  capability: z.string(),
  label: z.string(),
  description: z.string(),
  capacity: z.number().nonnegative().optional(),
  cost: z.number().nonnegative(),
  availableFrom: isoDateTime,
  availableUntil: isoDateTime,
  locationLabel: z.string(),
  accessibilityTags: z.array(z.string()),
  conditions: z.array(z.string()),
  availability: z.enum(['available', 'tentative', 'unavailable']),
});

const taskSchema = z.strictObject({
  id: entityId,
  key: z.string(),
  label: z.string(),
  requiredCapability: z.string(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  capacityRequired: z.number().positive().optional(),
  contributionIds: z.array(entityId).max(4),
  dependencyTaskIds: z.array(entityId).max(8),
  status: z.enum(['gap', 'suggested', 'requested', 'accepted', 'declined', 'complete']),
});

const planSchema = z.strictObject({
  id: entityId,
  goalId: entityId,
  title: z.string(),
  version: z.number().int().positive(),
  status: z.enum(['draft', 'requesting', 'ready', 'published']),
  tasks: z.array(taskSchema).min(1).max(12),
  rationale: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  publishedAt: isoDateTime.optional(),
});

const commitmentSchema = z.strictObject({
  id: entityId,
  planId: entityId,
  planVersion: z.number().int().positive(),
  participantId: entityId,
  taskIds: z.array(entityId),
  status: z.enum(['not_requested', 'pending', 'accepted', 'declined']),
  respondedAt: isoDateTime.optional(),
});

const activitySchema = z.strictObject({
  id: entityId,
  actor: z.enum(['human', 'agent', 'system']),
  action: z.string(),
  summary: z.string(),
  planVersionBefore: z.number().int().positive().optional(),
  planVersionAfter: z.number().int().positive().optional(),
  timestamp: isoDateTime,
  changedEntityIds: z.array(entityId),
});

const disruptionPreviewSchema = z.strictObject({
  token: entityId,
  planId: entityId,
  planVersion: z.number().int().positive(),
  type: z.enum(['contribution_unavailable', 'participant_unavailable', 'task_time_shift', 'capacity_reduction']),
  targetId: entityId,
  summary: z.string(),
  affectedTaskIds: z.array(entityId),
  brokenDependencyTaskIds: z.array(entityId),
  newGapTaskIds: z.array(entityId),
  candidateAlternativeContributionIds: z.array(entityId),
  riskBefore: z.enum(['Low', 'Medium', 'High']),
  riskAfter: z.enum(['Low', 'Medium', 'High']),
  createdAt: isoDateTime,
});

const approvalIntentSchema = z.discriminatedUnion('type', [
  z.strictObject({
    id: entityId,
    type: z.literal('request_commitments'),
    planId: entityId,
    planVersion: z.number().int().positive(),
    participantIds: z.array(entityId).min(1).max(25),
    message: z.string().min(1).max(240),
    createdBy: z.literal('agent'),
    createdAt: isoDateTime,
  }),
  z.strictObject({
    id: entityId,
    type: z.literal('publish_plan'),
    planId: entityId,
    planVersion: z.number().int().positive(),
    createdBy: z.literal('agent'),
    createdAt: isoDateTime,
  }),
]);

const persistedScenarioSchema = z.strictObject({
  schemaVersion: z.literal(1),
  goal: goalSchema,
  constraints: z.array(constraintSchema),
  participants: z.array(participantSchema),
  contributions: z.array(contributionSchema),
  plan: planSchema,
  commitments: z.array(commitmentSchema),
  activity: z.array(activitySchema),
  disruptionPreview: disruptionPreviewSchema.optional(),
  approvalIntent: approvalIntentSchema.optional(),
});

export function migratePersistedScenario(value: unknown): ScenarioState {
  const parsed = persistedScenarioSchema.safeParse(value);
  if (!parsed.success) return createSeedScenario();
  return checkScenarioInvariants(parsed.data).length ? createSeedScenario() : parsed.data;
}
