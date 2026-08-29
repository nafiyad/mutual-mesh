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
  limit: z.number().int().min(1).max(10).default(5),
}).superRefine((value, context) => {
  if (value.availableFrom && value.availableUntil && new Date(value.availableFrom) > new Date(value.availableUntil)) {
    context.addIssue({
      code: 'custom',
      path: ['availableUntil'],
      message: 'availableUntil must be the same as or later than availableFrom.',
    });
  }
});

export const inspectPlanInputSchema = z.strictObject({
  planId: z.string().trim().min(1).max(120).optional(),
  version: z.number().int().positive().optional(),
  taskOffset: z.number().int().min(0).max(11).default(0),
  taskLimit: z.number().int().min(1).max(3).default(2),
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
  planId: z.string().trim().min(1).max(120),
  expectedVersion: z.number().int().positive(),
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

const describedString = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const describedPositiveInteger = (description: string) => ({ type: 'integer', minimum: 1, description });
const describedIsoString = (description: string) => ({ type: 'string', format: 'date-time', description });

export const emptyInputJsonSchema = closedObject({});

export const searchContributionsInputJsonSchema = closedObject({
  capabilityQuery: describedString('Words describing the needed capability or resource; spaces and hyphens are treated equivalently.', { minLength: 1, maxLength: 80 }),
  kinds: { type: 'array', description: 'Optional contribution categories to include.', maxItems: 6, items: describedString('A contribution category.', { enum: contributionKinds }) },
  availableFrom: describedIsoString('Required start of the availability window, including a timezone offset.'),
  availableUntil: describedIsoString('Required end of the availability window; must not be earlier than availableFrom.'),
  minCapacity: { type: 'number', minimum: 0, description: 'Minimum required people, seats, items, or service units.' },
  maxCost: { type: 'number', minimum: 0, description: 'Maximum acceptable contribution cost in the workspace currency.' },
  tags: { type: 'array', description: 'Accessibility or delivery tags that every match must contain.', maxItems: 8, items: describedString('A required tag.', { minLength: 1, maxLength: 40 }) },
  availability: describedString('Required availability state.', { enum: ['available', 'tentative', 'unavailable'] }),
  limit: { ...describedPositiveInteger('Maximum number of matching contributions to return. Narrow filters if more are available.'), maximum: 10, default: 5 },
});

export const inspectPlanInputJsonSchema = closedObject({
  planId: describedString('Plan to inspect. Omit to inspect the active plan.', { minLength: 1, maxLength: 120 }),
  version: describedPositiveInteger('Exact live plan version to inspect. Omit to inspect the current version.'),
  taskOffset: { type: 'integer', minimum: 0, maximum: 11, default: 0, description: 'Zero-based task offset for bounded task pagination.' },
  taskLimit: { type: 'integer', minimum: 1, maximum: 3, default: 2, description: 'Number of tasks to return. Use taskPage.nextOffset until hasMore is false.' },
});

export const validatePlanInputJsonSchema = closedObject({
  planId: describedString('Active plan identifier returned by inspect_plan.', { minLength: 1, maxLength: 120 }),
  expectedVersion: describedPositiveInteger('Exact inspected plan version; stale versions are rejected.'),
}, ['planId', 'expectedVersion']);

export const draftPlanTaskJsonSchema = closedObject({
  key: describedString('Stable kebab-case key unique within this draft.', { minLength: 1, maxLength: 50, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
  label: describedString('Short human-facing task name.', { minLength: 1, maxLength: 100 }),
  requiredCapability: describedString('Exact capability a contribution must provide.', { minLength: 1, maxLength: 80 }),
  startsAt: describedIsoString('Task start time including a timezone offset.'),
  endsAt: describedIsoString('Task end time including a timezone offset; must be after startsAt.'),
  capacityRequired: { type: 'number', exclusiveMinimum: 0, description: 'Minimum capacity needed when the task has a capacity constraint.' },
  contributionIds: { type: 'array', description: 'Current contribution IDs assigned to this task; use an empty list for a gap.', maxItems: 4, items: describedString('Contribution ID returned by search_contributions.', { minLength: 1, maxLength: 120 }) },
  dependencyKeys: { type: 'array', description: 'Task keys that must be completed before this task.', maxItems: 8, items: describedString('A prerequisite task key from the same draft.', { minLength: 1, maxLength: 50 }) },
}, ['key', 'label', 'requiredCapability', 'startsAt', 'endsAt', 'contributionIds', 'dependencyKeys']);

export const draftCoordinationPlanInputJsonSchema = closedObject({
  planId: describedString('Active plan identifier returned by inspect_plan.', { minLength: 1, maxLength: 120 }),
  expectedVersion: describedPositiveInteger('Exact inspected plan version; stale replacements are rejected.'),
  goalId: describedString('Active goal identifier returned by get_coordination_context.', { minLength: 1, maxLength: 120 }),
  title: describedString('Human-facing title for the proposed plan.', { minLength: 1, maxLength: 120 }),
  rationale: describedString('Concise explanation of how the draft respects the goal and locked constraints.', { minLength: 1, maxLength: 300 }),
  tasks: { type: 'array', description: 'Complete replacement task set. Include every task, not only changed tasks.', minItems: 1, maxItems: 12, items: draftPlanTaskJsonSchema },
  draftOnly: { type: 'boolean', const: true, description: 'Safety acknowledgement. Must be true; drafting never contacts participants or publishes.' },
}, ['planId', 'expectedVersion', 'goalId', 'title', 'rationale', 'tasks', 'draftOnly']);

const operationSchemas = [
  closedObject({ type: describedString('Assign a contribution to a task.', { const: 'assign' }), taskId: describedString('Task receiving the contribution.'), contributionId: describedString('Contribution to assign.') }, ['type', 'taskId', 'contributionId']),
  closedObject({ type: describedString('Remove an existing task assignment.', { const: 'unassign' }), taskId: describedString('Task losing the contribution.'), contributionId: describedString('Currently assigned contribution to remove.') }, ['type', 'taskId', 'contributionId']),
  closedObject({ type: describedString('Add one task to the draft.', { const: 'add_task' }), task: { ...draftPlanTaskJsonSchema, description: 'Complete definition of the task to add.' } }, ['type', 'task']),
  closedObject({ type: describedString('Remove a task that has no dependents.', { const: 'remove_task' }), taskId: describedString('Task to remove. The plan must retain at least one task.') }, ['type', 'taskId']),
  closedObject({ type: describedString('Change a task time window.', { const: 'update_time' }), taskId: describedString('Task whose time changes.'), startsAt: describedIsoString('New task start time.'), endsAt: describedIsoString('New task end time; must be after startsAt.') }, ['type', 'taskId', 'startsAt', 'endsAt']),
  closedObject({ type: describedString('Add a prerequisite relationship.', { const: 'add_dependency' }), taskId: describedString('Dependent task.'), dependencyTaskId: describedString('Prerequisite task that must happen first.') }, ['type', 'taskId', 'dependencyTaskId']),
  closedObject({ type: describedString('Remove a prerequisite relationship.', { const: 'remove_dependency' }), taskId: describedString('Dependent task.'), dependencyTaskId: describedString('Existing prerequisite task to detach.') }, ['type', 'taskId', 'dependencyTaskId']),
];

export const reviseCoordinationPlanInputJsonSchema = closedObject({
  planId: describedString('Active plan identifier returned by inspect_plan.', { minLength: 1, maxLength: 120 }),
  expectedVersion: describedPositiveInteger('Exact inspected plan version; all operations fail atomically if stale.'),
  operations: { type: 'array', description: 'Ordered atomic edits. If any edit is invalid, none are committed.', minItems: 1, maxItems: 10, items: { oneOf: operationSchemas } },
  rationale: describedString('Human-readable explanation of the complete revision.', { minLength: 1, maxLength: 300 }),
}, ['planId', 'expectedVersion', 'operations', 'rationale']);

export const previewDisruptionInputJsonSchema = closedObject({
  planId: describedString('Active plan identifier returned by inspect_plan.', { minLength: 1, maxLength: 120 }),
  expectedVersion: describedPositiveInteger('Exact inspected plan version; the preview never changes it.'),
  type: describedString('Disruption to simulate without changing the canonical plan.', { enum: ['contribution_unavailable', 'participant_unavailable', 'task_time_shift', 'capacity_reduction'] }),
  targetId: describedString('Contribution, participant, or task ID affected by the selected disruption.', { minLength: 1, maxLength: 120 }),
  replacementValue: { description: 'For task_time_shift, the new start time; for capacity_reduction, the new nonnegative capacity.', oneOf: [describedString('New ISO start time for a task shift.', { minLength: 1, maxLength: 120 }), { type: 'number', minimum: 0, description: 'Reduced capacity to preview.' }] },
  replacementEndsAt: describedIsoString('New task end time when previewing a task_time_shift.'),
}, ['planId', 'expectedVersion', 'type', 'targetId']);

export const requestCommitmentsInputJsonSchema = closedObject({
  planId: describedString('Validated active plan identifier.', { minLength: 1, maxLength: 120 }),
  expectedVersion: describedPositiveInteger('Exact validated plan version to request commitments for.'),
  participantIds: { type: 'array', description: 'Assigned participants who must explicitly accept this plan version.', minItems: 1, maxItems: 25, items: describedString('Participant ID from an assigned contribution.', { minLength: 1, maxLength: 120 }) },
  message: describedString('In-app context shown with the commitment request.', { minLength: 1, maxLength: 240 }),
  inAppOnly: { type: 'boolean', const: true, description: 'Safety acknowledgement. Must be true; no external communication is sent.' },
}, ['planId', 'expectedVersion', 'participantIds', 'message', 'inAppOnly']);

export const publishCoordinationPlanInputJsonSchema = closedObject({
  planId: describedString('Accepted plan identifier approved for publication.', { minLength: 1, maxLength: 120 }),
  expectedVersion: describedPositiveInteger('Exact accepted and human-approved plan version.'),
  acknowledgement: describedString('Required publication acknowledgement after every participant has accepted.', { const: 'Publish the accepted plan' }),
}, ['planId', 'expectedVersion', 'acknowledgement']);

export type SearchContributionsInput = z.infer<typeof searchContributionsInputSchema>;
export type DraftCoordinationPlanToolInput = z.infer<typeof draftCoordinationPlanInputSchema>;
export type ReviseCoordinationPlanToolInput = z.infer<typeof reviseCoordinationPlanInputSchema>;
export type PreviewDisruptionToolInput = z.infer<typeof previewDisruptionInputSchema>;
export type RequestCommitmentsToolInput = z.infer<typeof requestCommitmentsInputSchema>;
export type PublishCoordinationPlanToolInput = z.infer<typeof publishCoordinationPlanInputSchema>;
