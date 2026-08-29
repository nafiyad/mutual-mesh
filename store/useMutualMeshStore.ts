'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createSeedScenario } from '@/data/seedScenario';
import type { MutationResult, ScenarioState } from '@/domain/types';
import { approvePendingIntent, rejectPendingIntent, stageCommitmentRequestIntent, stagePublicationIntent } from '@/services/approvalService';
import {
  publishCoordinationPlan,
  requestPlanCommitments,
  simulateCommitmentResponses,
  type CommitmentRequestResult,
  type PublishCoordinationPlanInput,
  type RequestCommitmentsInput,
  type SimulateCommitmentResponsesInput,
} from '@/services/commitmentService';
import {
  assignContributionToTask,
  replaceDraftCoordinationPlan,
  reviseDraftCoordinationPlan,
  type DraftCoordinationPlanInput,
  type ReviseCoordinationPlanInput,
} from '@/services/coordinationService';
import { previewPlanDisruption, type PreviewDisruptionInput } from '@/services/disruptionService';
import { migratePersistedScenario } from '@/store/migrations';

type MutualMeshActions = {
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  resetDemo: () => void;
  assignContribution: (taskId: string, contributionId: string, expectedVersion: number) => MutationResult;
  replaceDraft: (input: DraftCoordinationPlanInput) => MutationResult;
  reviseDraft: (input: ReviseCoordinationPlanInput) => MutationResult;
  previewDisruption: (input: PreviewDisruptionInput) => MutationResult;
  requestCommitments: (input: RequestCommitmentsInput) => CommitmentRequestResult;
  simulateResponses: (input: SimulateCommitmentResponsesInput) => MutationResult;
  publishPlan: (input: PublishCoordinationPlanInput) => MutationResult;
  stageCommitmentIntent: (input: RequestCommitmentsInput) => MutationResult;
  stagePublicationIntent: (input: PublishCoordinationPlanInput) => MutationResult;
  approveIntent: (intentId: string) => MutationResult;
  rejectIntent: (intentId: string) => MutationResult;
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
    disruptionPreview: store.disruptionPreview,
    approvalIntent: store.approvalIntent,
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
      previewDisruption: (input) => {
        const result = previewPlanDisruption(scenarioFromStore(get()), input);
        if (result.ok) set({ ...result.scenario });
        return result;
      },
      requestCommitments: (input) => {
        const result = requestPlanCommitments(scenarioFromStore(get()), input);
        if (result.ok) set({ ...result.scenario });
        return result;
      },
      simulateResponses: (input) => {
        const result = simulateCommitmentResponses(scenarioFromStore(get()), input);
        if (result.ok) set({ ...result.scenario });
        return result;
      },
      publishPlan: (input) => {
        const result = publishCoordinationPlan(scenarioFromStore(get()), input);
        if (result.ok) set({ ...result.scenario });
        return result;
      },
      stageCommitmentIntent: (input) => {
        const result = stageCommitmentRequestIntent(scenarioFromStore(get()), input);
        if (result.ok) set({ ...result.scenario });
        return result;
      },
      stagePublicationIntent: (input) => {
        const result = stagePublicationIntent(scenarioFromStore(get()), input);
        if (result.ok) set({ ...result.scenario });
        return result;
      },
      approveIntent: (intentId) => {
        const result = approvePendingIntent(scenarioFromStore(get()), intentId);
        if (result.ok) set({ ...result.scenario });
        return result;
      },
      rejectIntent: (intentId) => {
        const result = rejectPendingIntent(scenarioFromStore(get()), intentId);
        if (result.ok) set({ ...result.scenario });
        return result;
      },
    }),
    {
      name: 'mutual-mesh-demo-v2',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => scenarioFromStore(state as MutualMeshStore),
      merge: (persisted, current) => ({ ...current, ...migratePersistedScenario(persisted) }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          useMutualMeshStore.setState({ ...createSeedScenario(), hasHydrated: true });
          return;
        }
        (state ?? useMutualMeshStore.getState()).setHasHydrated(true);
      },
    },
  ),
);
