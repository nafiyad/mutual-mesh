'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createSeedScenario } from '@/data/seedScenario';
import type { MutationResult, ScenarioState } from '@/domain/types';
import {
  assignContributionToTask,
  replaceDraftCoordinationPlan,
  reviseDraftCoordinationPlan,
  type DraftCoordinationPlanInput,
  type ReviseCoordinationPlanInput,
} from '@/services/coordinationService';
import { migratePersistedScenario } from '@/store/migrations';

type MutualMeshActions = {
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  resetDemo: () => void;
  assignContribution: (taskId: string, contributionId: string, expectedVersion: number) => MutationResult;
  replaceDraft: (input: DraftCoordinationPlanInput) => MutationResult;
  reviseDraft: (input: ReviseCoordinationPlanInput) => MutationResult;
};

export type MutualMeshStore = ScenarioState & MutualMeshActions;

export function scenarioFromStore(store: MutualMeshStore): ScenarioState {
  return {
    schemaVersion: store.schemaVersion,
    goal: store.goal,
    constraints: store.constraints,
    participants: store.participants,
    contributions: store.contributions,
    plan: store.plan,
    commitments: store.commitments,
    activity: store.activity,
  };
}

export const useMutualMeshStore = create<MutualMeshStore>()(
  persist(
    (set, get) => ({
      ...createSeedScenario(),
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      resetDemo: () => set({ ...createSeedScenario() }),
      assignContribution: (taskId, contributionId, expectedVersion) => {
        const result = assignContributionToTask(scenarioFromStore(get()), {
          taskId,
          contributionId,
          expectedVersion,
          actor: 'human',
        });
        if (result.ok) set({ ...result.scenario });
        return result;
      },
      replaceDraft: (input) => {
        const result = replaceDraftCoordinationPlan(scenarioFromStore(get()), input);
        if (result.ok) set({ ...result.scenario });
        return result;
      },
      reviseDraft: (input) => {
        const result = reviseDraftCoordinationPlan(scenarioFromStore(get()), input);
        if (result.ok) set({ ...result.scenario });
        return result;
      },
    }),
    {
      name: 'mutual-mesh-demo-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => scenarioFromStore(state as MutualMeshStore),
      merge: (persisted, current) => ({ ...current, ...migratePersistedScenario(persisted) }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);
