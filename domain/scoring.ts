import type { ScenarioState } from '@/domain/types';

export type PlanSummary = {
  readiness: number;
  budgetSpent: number;
  coveredTasks: number;
  totalTasks: number;
  openGaps: number;
  commitmentRequests: number;
  risk: 'Low' | 'Medium' | 'High';
};

export function calculatePlanSummary(state: ScenarioState): PlanSummary {
  const coveredTasks = state.plan.tasks.filter((task) => task.status !== 'gap' && task.status !== 'declined').length;
  const openGaps = state.plan.tasks.length - coveredTasks;
  const assignedContributionIds = new Set(state.plan.tasks.flatMap((task) => task.contributionIds));
  const budgetSpent = state.contributions
    .filter((contribution) => assignedContributionIds.has(contribution.id))
    .reduce((total, contribution) => total + contribution.cost, 0);
  const overBudget = budgetSpent > state.goal.budgetLimit;

  return {
    readiness: overBudget ? Math.max(0, Math.floor((coveredTasks / state.plan.tasks.length) * 100) - 25) : Math.floor((coveredTasks / state.plan.tasks.length) * 100),
    budgetSpent,
    coveredTasks,
    totalTasks: state.plan.tasks.length,
    openGaps,
    commitmentRequests: state.commitments.filter((commitment) => commitment.status !== 'not_requested').length,
    risk: overBudget ? 'High' : openGaps > 0 ? 'Medium' : 'Low',
  };
}
