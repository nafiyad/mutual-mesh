import { z } from 'zod';
import { createSeedScenario } from '@/data/seedScenario';
import { checkScenarioInvariants } from '@/domain/invariants';
import type { ScenarioState } from '@/domain/types';

const persistedScenarioSchema = z.object({
  schemaVersion: z.literal(1),
  goal: z.object({ id: z.string().min(1), constraintIds: z.array(z.string()) }).passthrough(),
  constraints: z.array(z.object({ id: z.string().min(1) }).passthrough()),
  participants: z.array(z.object({ id: z.string().min(1) }).passthrough()),
  contributions: z.array(z.object({ id: z.string().min(1), participantId: z.string().min(1) }).passthrough()),
  plan: z.object({
    id: z.string().min(1),
    goalId: z.string().min(1),
    version: z.number().int().positive(),
    tasks: z.array(z.object({ id: z.string().min(1), contributionIds: z.array(z.string()) }).passthrough()),
  }).passthrough(),
  commitments: z.array(z.object({ id: z.string().min(1) }).passthrough()),
  activity: z.array(z.object({ id: z.string().min(1) }).passthrough()),
}).passthrough();

export function migratePersistedScenario(value: unknown): ScenarioState {
  const parsed = persistedScenarioSchema.safeParse(value);
  if (!parsed.success) return createSeedScenario();
  const scenario = parsed.data as unknown as ScenarioState;
  return checkScenarioInvariants(scenario).length ? createSeedScenario() : scenario;
}
