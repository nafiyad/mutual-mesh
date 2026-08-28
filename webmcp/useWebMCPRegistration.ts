'use client';

import { useEffect, useState } from 'react';
import { scenarioFromStore, useMutualMeshStore } from '@/store/useMutualMeshStore';
import type { WebMCPModelContext } from '@/webmcp/modelContext';
import { registerMutualMeshTools } from '@/webmcp/registerTools';
import { createToolHandlers, type ToolExecutionEvent, type WebMCPToolName } from '@/webmcp/toolHandlers';

export type WebMCPRegistrationState = {
  status: 'restoring' | 'unavailable' | 'registering' | 'ready' | 'failed';
  registeredTools: WebMCPToolName[];
  error?: string;
};

type SharedRegistration = {
  context: WebMCPModelContext;
  controller: AbortController;
  promise: Promise<WebMCPToolName[]>;
  consumers: number;
  releaseTimer?: ReturnType<typeof setTimeout>;
};

let sharedRegistration: SharedRegistration | undefined;
const executionListeners = new Set<(event: ToolExecutionEvent) => void>();

function createSharedRegistration(context: WebMCPModelContext): SharedRegistration {
  const controller = new AbortController();
  const handlers = createToolHandlers({
    getScenario: () => scenarioFromStore(useMutualMeshStore.getState()),
    replaceDraft: (input) => useMutualMeshStore.getState().replaceDraft(input),
    reviseDraft: (input) => useMutualMeshStore.getState().reviseDraft(input),
    previewDisruption: (input) => useMutualMeshStore.getState().previewDisruption(input),
    requestCommitments: (input) => useMutualMeshStore.getState().requestCommitments(input),
    publishPlan: (input) => useMutualMeshStore.getState().publishPlan(input),
    onExecuted: (event) => executionListeners.forEach((listener) => listener(event)),
  });
  return {
    context,
    controller,
    promise: registerMutualMeshTools(context, handlers, controller.signal),
    consumers: 0,
  };
}

function acquireRegistration(context: WebMCPModelContext) {
  if (!sharedRegistration || sharedRegistration.context !== context || sharedRegistration.controller.signal.aborted) {
    sharedRegistration = createSharedRegistration(context);
  }
  if (sharedRegistration.releaseTimer) clearTimeout(sharedRegistration.releaseTimer);
  sharedRegistration.consumers += 1;
  return sharedRegistration;
}

function releaseRegistration(registration: SharedRegistration) {
  registration.consumers = Math.max(0, registration.consumers - 1);
  registration.releaseTimer = setTimeout(() => {
    if (registration.consumers === 0) {
      registration.controller.abort();
      if (sharedRegistration === registration) sharedRegistration = undefined;
    }
  }, 25);
}

export function useWebMCPRegistration(hasHydrated: boolean) {
  const [registration, setRegistration] = useState<WebMCPRegistrationState>({
    status: hasHydrated ? 'registering' : 'restoring',
    registeredTools: [],
  });
  const [recentCalls, setRecentCalls] = useState<ToolExecutionEvent[]>([]);

  useEffect(() => {
    let active = true;
    const updateRegistration = (next: WebMCPRegistrationState) => {
      queueMicrotask(() => {
        if (active) setRegistration(next);
      });
    };
    if (!hasHydrated) {
      return () => { active = false; };
    }
    const context = document.modelContext;
    if (typeof context?.registerTool !== 'function') {
      updateRegistration({ status: 'unavailable', registeredTools: [] });
      return () => { active = false; };
    }

    const listener = (event: ToolExecutionEvent) => {
      setRecentCalls((current) => [event, ...current].slice(0, 8));
    };
    executionListeners.add(listener);
    const live = acquireRegistration(context);
    updateRegistration({ status: 'registering', registeredTools: [] });
    void live.promise.then((registeredTools) => {
      if (active) setRegistration({ status: 'ready', registeredTools });
    }).catch((error: unknown) => {
      const wasAlreadyAborted = live.controller.signal.aborted;
      if (!wasAlreadyAborted) live.controller.abort();
      if (sharedRegistration === live) sharedRegistration = undefined;
      if (active && !wasAlreadyAborted) {
        setRegistration({
          status: 'failed',
          registeredTools: [],
          error: error instanceof Error ? error.message : 'Tool registration failed.',
        });
      }
    });

    return () => {
      active = false;
      executionListeners.delete(listener);
      releaseRegistration(live);
    };
  }, [hasHydrated]);

  return { registration, recentCalls };
}
