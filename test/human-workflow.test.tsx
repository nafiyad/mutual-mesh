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

  it('lets a human complete the canonical story without WebMCP', async () => {
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
    expect(screen.getByText('What if Maya’s projector disappears?')).toBeInTheDocument();
    expect(screen.getByText('8 / 8 tasks')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Preview projector cancellation' }));
    expect(screen.getByText('Temporary preview · plan unchanged')).toBeInTheDocument();
    expect(screen.getAllByText(/Projector cancellation affects Presentation AV/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Draft v4')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Repair with backup display' }));
    expect(screen.getByText('Draft v5')).toBeInTheDocument();
    expect(screen.getByText('The repaired plan is valid')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Open plan inspector/i }));
    await user.click(screen.getByRole('button', { name: 'Run full validation' }));

    expect(screen.getByText('Every hard constraint passes')).toBeInTheDocument();
    expect(screen.getByText(/ready for in-app commitment requests/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close plan inspector' }));

    await user.click(screen.getByRole('button', { name: 'Request in-app commitments' }));
    expect(screen.getByText('7 fictional responses pending')).toBeInTheDocument();
    expect(screen.getAllByText(/No external messages were sent/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Simulate all accept' }));
    expect(screen.getByText('Every required commitment is accepted')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publish accepted plan' }));
    expect(screen.getByText('Plan v5 is immutable')).toBeInTheDocument();
    expect(screen.getByText('Canonical end-to-end story complete')).toBeInTheDocument();
  });
});
