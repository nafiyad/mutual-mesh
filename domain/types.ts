export type GoalStatus = 'open' | 'drafted' | 'requesting' | 'ready' | 'published';

export type Goal = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  budgetLimit: number;
  locationLabel: string;
  attendanceTarget?: number;
  status: GoalStatus;
  constraintIds: string[];
};

export type Constraint = {
  id: string;
  kind: 'time' | 'budget' | 'capacity' | 'accessibility' | 'workload' | 'dependency';
  label: string;
  hard: boolean;
  value: string | number | boolean;
  lockedByHuman: boolean;
};

export type Participant = {
  id: string;
  displayName: string;
  avatarSeed: string;
  maxAssignments: number;
  trustLabel: 'demo' | 'verified' | 'unverified';
};

export type Contribution = {
  id: string;
  participantId: string;
  kind: 'skill' | 'resource' | 'space' | 'transport' | 'funding' | 'food';
  capability: string;
  label: string;
  description: string;
  capacity?: number;
  cost: number;
  availableFrom: string;
  availableUntil: string;
  locationLabel: string;
  accessibilityTags: string[];
  conditions: string[];
  availability: 'available' | 'tentative' | 'unavailable';
};

export type PlanTask = {
  id: string;
  key: string;
  label: string;
  requiredCapability: string;
  startsAt: string;
  endsAt: string;
  capacityRequired?: number;
  contributionIds: string[];
  dependencyTaskIds: string[];
  status: 'gap' | 'suggested' | 'requested' | 'accepted' | 'declined' | 'complete';
};

export type CoordinationPlan = {
  id: string;
  goalId: string;
  title: string;
  version: number;
  status: 'draft' | 'requesting' | 'ready' | 'published';
  tasks: PlanTask[];
  rationale: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
};

export type Commitment = {
  id: string;
  planId: string;
  planVersion: number;
  participantId: string;
  taskIds: string[];
  status: 'not_requested' | 'pending' | 'accepted' | 'declined';
  respondedAt?: string;
};

export type ActivityEvent = {
  id: string;
  actor: 'human' | 'agent' | 'system';
  action: string;
  summary: string;
  planVersionBefore?: number;
  planVersionAfter?: number;
  timestamp: string;
  changedEntityIds: string[];
};

export type DisruptionPreview = {
  token: string;
  planId: string;
  planVersion: number;
  type: 'contribution_unavailable' | 'participant_unavailable' | 'task_time_shift' | 'capacity_reduction';
  targetId: string;
  summary: string;
  affectedTaskIds: string[];
  brokenDependencyTaskIds: string[];
  newGapTaskIds: string[];
  candidateAlternativeContributionIds: string[];
  riskBefore: 'Low' | 'Medium' | 'High';
  riskAfter: 'Low' | 'Medium' | 'High';
  createdAt: string;
};

export type ApprovalIntent =
  | {
      id: string;
      type: 'request_commitments';
      planId: string;
      planVersion: number;
      participantIds: string[];
      message: string;
      createdBy: 'agent';
      createdAt: string;
    }
  | {
      id: string;
      type: 'publish_plan';
      planId: string;
      planVersion: number;
      createdBy: 'agent';
      createdAt: string;
    };

export type ScenarioState = {
  schemaVersion: 1;
  goal: Goal;
  constraints: Constraint[];
  participants: Participant[];
  contributions: Contribution[];
  plan: CoordinationPlan;
  commitments: Commitment[];
  activity: ActivityEvent[];
  disruptionPreview?: DisruptionPreview;
  approvalIntent?: ApprovalIntent;
};

export type DomainError = {
  code: string;
  message: string;
  currentVersion?: number;
  recoveryHint: string;
};

export type MutationResult =
  | { ok: true; scenario: ScenarioState }
  | { ok: false; error: DomainError };
