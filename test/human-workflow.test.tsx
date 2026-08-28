// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Home from '@/app/page';
import { createSeedScenario } from '@/data/seedScenario';
import { useMutualMeshStore } from '@/store/useMutualMeshStore';

describe('human coordination workflow', () => {
  beforeEach(() => {
    window.localStorage.clear();
    act(() => {
      useMutualMeshStore.setState({ ...createSeedScenario(), hasHydrated: true });
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('lets a human preview, apply, and validate a safe revision without WebMCP', async () => {
    const user = userEvent.setup();
    render(<Home />);

    expect(screen.getByText('Draft v3')).toBeInTheDocument();
    expect(screen.getByText('Equipment pickup has no owner')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Find a viable match' }));
    await user.click(screen.getByRole('button', { name: 'Preview revision' }));

    expect(screen.getByText('No changes applied yet')).toBeInTheDocument();
    expect(screen.getByText('87% → 100%')).toBeInTheDocument();
    expect(screen.getByText('0 changed')).toBeInTheDocument();
    expect(screen.getByText('Draft v3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Apply revision' }));

    expect(screen.getByText('Draft v4')).toBeInTheDocument();
    expect(screen.getByText('Equipment pickup is covered')).toBeInTheDocument();
    expect(screen.getByText('8 / 8 tasks')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Open plan inspector/i }));
    await user.click(screen.getByRole('button', { name: 'Run full validation' }));

    expect(screen.getByText('Every hard constraint passes')).toBeInTheDocument();
    expect(screen.getByText(/ready for the commitment-request phase/i)).toBeInTheDocument();
    expect(screen.getByText('Human-interface phase exit gate passed')).toBeInTheDocument();
  });
});
