import { z } from 'zod';

const contributionKinds = ['skill', 'resource', 'space', 'transport', 'funding', 'food'] as const;
const isoDateTime = z.string().datetime({ offset: true });

export const emptyInputSchema = z.strictObject({});

export const searchContributionsInputSchema = z.strictObject({
  capabilityQuery: z.string().trim().min(1).max(80).optional(),
  kinds: z.array(z.enum(contributionKinds)).max(6).optional(),
  availableFrom: isoDateTime.optional(),
  availableUntil: isoDateTime.optional(),
  minCapacity: z.number().nonnegative().optional(),
  maxCost: z.number().nonnegative().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  availability: z.enum(['available', 'tentative', 'unavailable']).optional(),
  limit: z.number().int().min(1).max(25).default(10),
});

export const inspectPlanInputSchema = z.strictObject({
  planId: z.string().trim().min(1).max(120).optional(),
  version: z.number().int().positive().optional(),
});

export const validatePlanInputSchema = z.strictObject({
  planId: z.string().trim().min(1).max(120),
  expectedVersion: z.number().int().positive(),
});

export const draftPlanTaskSchema = z.strictObject({
  key: z.string().trim().min(1).max(50).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  label: z.string().trim().min(1).max(100),
  requiredCapability: z.string().trim().min(1).max(80),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  capacityRequired: z.number().positive().optional(),
  contributionIds: z.array(z.string().trim().min(1).max(120)).max(4),
  dependencyKeys: z.array(z.string().trim().min(1).max(50)).max(8),
});

export const draftCoordinationPlanInputSchema = z.strictObject({
  goalId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  rationale: z.string().trim().min(1).max(300),
  tasks: z.array(draftPlanTaskSchema).min(1).max(12),
  draftOnly: z.literal(true),
});

const taskId = z.string().trim().min(1).max(120);
export const revisePlanOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('assign'), taskId, contributionId: taskId }),
  z.strictObject({ type: z.literal('unassign'), taskId, contributionId: taskId }),
  z.strictObject({ type: z.literal('add_task'), task: draftPlanTaskSchema }),
  z.strictObject({ type: z.literal('remove_task'), taskId }),
  z.strictObject({ type: z.literal('update_time'), taskId, startsAt: isoDateTime, endsAt: isoDateTime }),
  z.strictObject({ type: z.literal('add_dependency'), taskId, dependencyTaskId: taskId }),
  z.strictObject({ type: z.literal('remove_dependency'), taskId, dependencyTaskId: taskId }),
]);

export const reviseCoordinationPlanInputSchema = z.strictObject({
  planId: taskId,
  expectedVersion: z.number().int().positive(),
  operations: z.array(revisePlanOperationSchema).min(1).max(10),
  rationale: z.string().trim().min(1).max(300),
});

export const previewDisruptionInputSchema = z.strictObject({
  planId: taskId,
  expectedVersion: z.number().int().positive(),
  type: z.enum(['contribution_unavailable', 'participant_unavailable', 'task_time_shift', 'capacity_reduction']),
  targetId: taskId,
  replacementValue: z.union([z.string().trim().min(1).max(120), z.number().nonnegative()]).optional(),
  replacementEndsAt: isoDateTime.optional(),
});

export const requestCommitmentsInputSchema = z.strictObject({
  planId: taskId,
  expectedVersion: z.number().int().positive(),
  participantIds: z.array(taskId).min(1).max(25),
  message: z.string().trim().min(1).max(240),
  inAppOnly: z.literal(true),
});

export const publishCoordinationPlanInputSchema = z.strictObject({
  planId: taskId,
  expectedVersion: z.number().int().positive(),
  acknowledgement: z.literal('Publish the accepted plan'),
});

const closedObject = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const stringValue = { type: 'string' };
const positiveInteger = { type: 'integer', minimum: 1 };
const isoString = { type: 'string', format: 'date-time' };

export const emptyInputJsonSchema = closedObject({});

export const searchContributionsInputJsonSchema = closedObject({
  capabilityQuery: { type: 'string', minLength: 1, maxLength: 80 },
  kinds: { type: 'array', maxItems: 6, items: { type: 'string', enum: contributionKinds } },
  availableFrom: isoString,
  availableUntil: isoString,
  minCapacity: { type: 'number', minimum: 0 },
  maxCost: { type: 'number', minimum: 0 },
  tags: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 40 } },
  availability: { type: 'string', enum: ['available', 'tentative', 'unavailable'] },
  limit: { ...positiveInteger, maximum: 25, default: 10 },
});

export const inspectPlanInputJsonSchema = closedObject({
  planId: { type: 'string', minLength: 1, maxLength: 120 },
  version: positiveInteger,
});

export const validatePlanInputJsonSchema = closedObject({
  planId: { type: 'string', minLength: 1, maxLength: 120 },
  expectedVersion: positiveInteger,
}, ['planId', 'expectedVersion']);

export const draftPlanTaskJsonSchema = closedObject({
  key: { type: 'string', minLength: 1, maxLength: 50, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
  label: { type: 'string', minLength: 1, maxLength: 100 },
  requiredCapability: { type: 'string', minLength: 1, maxLength: 80 },
  startsAt: isoString,
  endsAt: isoString,
  capacityRequired: { type: 'number', exclusiveMinimum: 0 },
  contributionIds: { type: 'array', maxItems: 4, items: { type: 'string', minLength: 1, maxLength: 120 } },
  dependencyKeys: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 50 } },
}, ['key', 'label', 'requiredCapability', 'startsAt', 'endsAt', 'contributionIds', 'dependencyKeys']);

export const draftCoordinationPlanInputJsonSchema = closedObject({
  goalId: { type: 'string', minLength: 1, maxLength: 120 },
  title: { type: 'string', minLength: 1, maxLength: 120 },
  rationale: { type: 'string', minLength: 1, maxLength: 300 },
  tasks: { type: 'array', minItems: 1, maxItems: 12, items: draftPlanTaskJsonSchema },
  draftOnly: { type: 'boolean', const: true },
}, ['goalId', 'title', 'rationale', 'tasks', 'draftOnly']);

const operationSchemas = [
  closedObject({ type: { type: 'string', const: 'assign' }, taskId: stringValue, contributionId: stringValue }, ['type', 'taskId', 'contributionId']),
  closedObject({ type: { type: 'string', const: 'unassign' }, taskId: stringValue, contributionId: stringValue }, ['type', 'taskId', 'contributionId']),
  closedObject({ type: { type: 'string', const: 'add_task' }, task: draftPlanTaskJsonSchema }, ['type', 'task']),
  closedObject({ type: { type: 'string', const: 'remove_task' }, taskId: stringValue }, ['type', 'taskId']),
  closedObject({ type: { type: 'string', const: 'update_time' }, taskId: stringValue, startsAt: isoString, endsAt: isoString }, ['type', 'taskId', 'startsAt', 'endsAt']),
  closedObject({ type: { type: 'string', const: 'add_dependency' }, taskId: stringValue, dependencyTaskId: stringValue }, ['type', 'taskId', 'dependencyTaskId']),
  closedObject({ type: { type: 'string', const: 'remove_dependency' }, taskId: stringValue, dependencyTaskId: stringValue }, ['type', 'taskId', 'dependencyTaskId']),
];

export const reviseCoordinationPlanInputJsonSchema = closedObject({
  planId: { type: 'string', minLength: 1, maxLength: 120 },
  expectedVersion: positiveInteger,
  operations: { type: 'array', minItems: 1, maxItems: 10, items: { oneOf: operationSchemas } },
  rationale: { type: 'string', minLength: 1, maxLength: 300 },
}, ['planId', 'expectedVersion', 'operations', 'rationale']);

export const previewDisruptionInputJsonSchema = closedObject({
  planId: { type: 'string', minLength: 1, maxLength: 120 },
  expectedVersion: positiveInteger,
  type: { type: 'string', enum: ['contribution_unavailable', 'participant_unavailable', 'task_time_shift', 'capacity_reduction'] },
  targetId: { type: 'string', minLength: 1, maxLength: 120 },
  replacementValue: { oneOf: [{ type: 'string', minLength: 1, maxLength: 120 }, { type: 'number', minimum: 0 }] },
  replacementEndsAt: isoString,
}, ['planId', 'expectedVersion', 'type', 'targetId']);

export const requestCommitmentsInputJsonSchema = closedObject({
  planId: { type: 'string', minLength: 1, maxLength: 120 },
  expectedVersion: positiveInteger,
  participantIds: { type: 'array', minItems: 1, maxItems: 25, items: { type: 'string', minLength: 1, maxLength: 120 } },
  message: { type: 'string', minLength: 1, maxLength: 240 },
  inAppOnly: { type: 'boolean', const: true },
}, ['planId', 'expectedVersion', 'participantIds', 'message', 'inAppOnly']);

export const publishCoordinationPlanInputJsonSchema = closedObject({
  planId: { type: 'string', minLength: 1, maxLength: 120 },
  expectedVersion: positiveInteger,
  acknowledgement: { type: 'string', const: 'Publish the accepted plan' },
}, ['planId', 'expectedVersion', 'acknowledgement']);

export type SearchContributionsInput = z.infer<typeof searchContributionsInputSchema>;
export type DraftCoordinationPlanToolInput = z.infer<typeof draftCoordinationPlanInputSchema>;
export type ReviseCoordinationPlanToolInput = z.infer<typeof reviseCoordinationPlanInputSchema>;
export type PreviewDisruptionToolInput = z.infer<typeof previewDisruptionInputSchema>;
export type RequestCommitmentsToolInput = z.infer<typeof requestCommitmentsInputSchema>;
export type PublishCoordinationPlanToolInput = z.infer<typeof publishCoordinationPlanInputSchema>;
