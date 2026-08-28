import type { ScenarioState } from '@/domain/types';

const START = '2026-09-10T18:00:00-06:00';
const END = '2026-09-10T20:00:00-06:00';
const SETUP = '2026-09-10T17:30:00-06:00';

const seedScenario: ScenarioState = {
  schemaVersion: 1,
  goal: {
    id: 'goal-career-night',
    title: 'Host an accessible career night for 50 students',
    description: 'A free, practical evening built from people and resources already in the community.',
    startsAt: START,
    endsAt: END,
    budgetLimit: 150,
    locationLabel: 'Riverside Community Hub',
    attendanceTarget: 50,
    status: 'drafted',
    constraintIds: ['constraint-access', 'constraint-workload', 'constraint-approval'],
  },
  constraints: [
    {
      id: 'constraint-access',
      kind: 'accessibility',
      label: 'Wheelchair accessible',
      hard: true,
      value: true,
      lockedByHuman: true,
    },
    {
      id: 'constraint-workload',
      kind: 'workload',
      label: 'Max 2 tasks / person',
      hard: true,
      value: 2,
      lockedByHuman: true,
    },
    {
      id: 'constraint-approval',
      kind: 'dependency',
      label: 'Human approval required',
      hard: true,
      value: true,
      lockedByHuman: true,
    },
  ],
  participants: [
    { id: 'participant-jordan', displayName: 'Jordan', avatarSeed: 'JR', maxAssignments: 2, trustLabel: 'demo' },
    { id: 'participant-aisha', displayName: 'Aisha', avatarSeed: 'AS', maxAssignments: 2, trustLabel: 'demo' },
    { id: 'participant-maya', displayName: 'Maya', avatarSeed: 'MK', maxAssignments: 2, trustLabel: 'demo' },
    { id: 'participant-carlos', displayName: 'Carlos', avatarSeed: 'CL', maxAssignments: 2, trustLabel: 'demo' },
    { id: 'participant-priya', displayName: 'Priya', avatarSeed: 'PN', maxAssignments: 2, trustLabel: 'demo' },
    { id: 'participant-noor', displayName: 'Noor', avatarSeed: 'NR', maxAssignments: 2, trustLabel: 'demo' },
    { id: 'participant-dev', displayName: 'Dev', avatarSeed: 'DV', maxAssignments: 1, trustLabel: 'demo' },
    { id: 'participant-malik', displayName: 'Malik', avatarSeed: 'ML', maxAssignments: 1, trustLabel: 'demo' },
  ],
  contributions: [
    {
      id: 'contribution-venue', participantId: 'participant-jordan', kind: 'space', capability: 'accessible-venue',
      label: 'Accessible room · 60 seats', description: 'Step-free community room with accessible washrooms.',
      capacity: 60, cost: 0, availableFrom: SETUP, availableUntil: END, locationLabel: 'Riverside Community Hub',
      accessibilityTags: ['step-free', 'accessible-washroom'], conditions: ['Leave the room reset by 8:30 PM'], availability: 'available',
    },
    {
      id: 'contribution-speaker-aisha', participantId: 'participant-aisha', kind: 'skill', capability: 'career-speaker',
      label: 'Interview speaker · 6–7 PM', description: 'Practical interview preparation session.',
      cost: 0, availableFrom: START, availableUntil: '2026-09-10T19:00:00-06:00', locationLabel: 'Riverside Community Hub',
      accessibilityTags: [], conditions: [], availability: 'available',
    },
    {
      id: 'contribution-projector', participantId: 'participant-maya', kind: 'resource', capability: 'presentation-av',
      label: 'Projector + HDMI adapter', description: 'Portable projector with an HDMI adapter and power cable.',
      cost: 0, availableFrom: SETUP, availableUntil: END, locationLabel: 'Eastside',
      accessibilityTags: [], conditions: ['Requires pickup before 5:30 PM'], availability: 'available',
    },
    {
      id: 'contribution-transport', participantId: 'participant-carlos', kind: 'transport', capability: 'equipment-transport',
      label: 'Equipment transport · after 4:30', description: 'Can collect and deliver the projector before setup.',
      cost: 0, availableFrom: '2026-09-10T16:30:00-06:00', availableUntil: SETUP, locationLabel: 'Eastside',
      accessibilityTags: [], conditions: ['One equipment run'], availability: 'available',
    },
    {
      id: 'contribution-poster', participantId: 'participant-priya', kind: 'skill', capability: 'event-promotion',
      label: 'Event poster · 36h notice', description: 'Accessible digital event poster and social image.',
      cost: 0, availableFrom: '2026-09-08T09:00:00-06:00', availableUntil: START, locationLabel: 'Remote',
      accessibilityTags: ['high-contrast'], conditions: ['Needs final details 36 hours before event'], availability: 'available',
    },
    {
      id: 'contribution-host', participantId: 'participant-noor', kind: 'skill', capability: 'event-hosting',
      label: 'Host + accessibility check', description: 'Welcome desk, room walk-through, and accessibility check.',
      cost: 0, availableFrom: SETUP, availableUntil: END, locationLabel: 'Riverside Community Hub',
      accessibilityTags: ['accessibility-check'], conditions: [], availability: 'available',
    },
    {
      id: 'contribution-speaker-dev', participantId: 'participant-dev', kind: 'skill', capability: 'career-speaker',
      label: 'Resume clinic · 7–8 PM', description: 'Hands-on resume feedback for small groups.',
      cost: 0, availableFrom: '2026-09-10T19:00:00-06:00', availableUntil: END, locationLabel: 'Riverside Community Hub',
      accessibilityTags: [], conditions: [], availability: 'available',
    },
    {
      id: 'contribution-snacks', participantId: 'participant-malik', kind: 'food', capability: 'refreshments',
      label: '50 snack packs · $120', description: 'Nut-free snack packs with ingredient labels.',
      capacity: 50, cost: 120, availableFrom: SETUP, availableUntil: END, locationLabel: 'Riverside Community Hub',
      accessibilityTags: ['ingredient-labels'], conditions: ['Final count needed the day before'], availability: 'available',
    },
  ],
  plan: {
    id: 'plan-career-night',
    goalId: 'goal-career-night',
    title: 'Career Night community plan',
    version: 3,
    status: 'draft',
    rationale: 'Use existing community capacity first while keeping accessibility, budget, and workload constraints locked.',
    createdAt: '2026-08-28T18:00:00.000Z',
    updatedAt: '2026-08-28T18:12:00.000Z',
    tasks: [
      { id: 'task-venue', key: 'venue', label: 'Venue', requiredCapability: 'accessible-venue', startsAt: SETUP, endsAt: END, capacityRequired: 50, contributionIds: ['contribution-venue'], dependencyTaskIds: [], status: 'accepted' },
      { id: 'task-speaker-a', key: 'speaker-a', label: 'Interview speaker', requiredCapability: 'career-speaker', startsAt: START, endsAt: '2026-09-10T19:00:00-06:00', contributionIds: ['contribution-speaker-aisha'], dependencyTaskIds: ['task-venue'], status: 'suggested' },
      { id: 'task-speaker-b', key: 'speaker-b', label: 'Resume clinic', requiredCapability: 'career-speaker', startsAt: '2026-09-10T19:00:00-06:00', endsAt: END, contributionIds: ['contribution-speaker-dev'], dependencyTaskIds: ['task-venue'], status: 'suggested' },
      { id: 'task-av', key: 'av', label: 'Presentation AV', requiredCapability: 'presentation-av', startsAt: SETUP, endsAt: END, contributionIds: ['contribution-projector'], dependencyTaskIds: ['task-transport'], status: 'suggested' },
      { id: 'task-transport', key: 'transport', label: 'Equipment pickup', requiredCapability: 'equipment-transport', startsAt: '2026-09-10T16:30:00-06:00', endsAt: SETUP, contributionIds: [], dependencyTaskIds: [], status: 'gap' },
      { id: 'task-poster', key: 'poster', label: 'Event poster', requiredCapability: 'event-promotion', startsAt: '2026-09-08T09:00:00-06:00', endsAt: '2026-09-09T06:00:00-06:00', contributionIds: ['contribution-poster'], dependencyTaskIds: [], status: 'accepted' },
      { id: 'task-host', key: 'host', label: 'Host and access check', requiredCapability: 'event-hosting', startsAt: SETUP, endsAt: END, contributionIds: ['contribution-host'], dependencyTaskIds: ['task-venue'], status: 'accepted' },
      { id: 'task-refreshments', key: 'refreshments', label: 'Refreshments', requiredCapability: 'refreshments', startsAt: SETUP, endsAt: END, capacityRequired: 50, contributionIds: ['contribution-snacks'], dependencyTaskIds: ['task-venue'], status: 'suggested' },
    ],
  },
  commitments: [],
  activity: [
    { id: 'activity-validate-v3', actor: 'agent', action: 'Validated draft plan', summary: 'Budget, capacity, accessibility, workload, and dependencies checked.', planVersionBefore: 3, planVersionAfter: 3, timestamp: '2026-08-28T18:12:00.000Z', changedEntityIds: ['plan-career-night'] },
    { id: 'activity-lock-access', actor: 'human', action: 'Locked accessibility', summary: 'Wheelchair accessibility remains a hard constraint.', planVersionBefore: 2, planVersionAfter: 3, timestamp: '2026-08-28T18:10:00.000Z', changedEntityIds: ['constraint-access', 'plan-career-night'] },
    { id: 'activity-match', actor: 'agent', action: 'Matched 7 contributions', summary: 'Seven plan tasks now have viable community contributions.', planVersionBefore: 1, planVersionAfter: 2, timestamp: '2026-08-28T18:09:00.000Z', changedEntityIds: ['plan-career-night'] },
  ],
};

export function createSeedScenario(): ScenarioState {
  return structuredClone(seedScenario);
}
