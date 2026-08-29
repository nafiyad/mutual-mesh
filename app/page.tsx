'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { calculatePlanSummary } from '@/domain/scoring';
import { validatePlan } from '@/domain/validation';
import type { Contribution, CoordinationPlan, Goal, Participant, PlanTask, ScenarioState } from '@/domain/types';
import { previewContributionAssignment, type AssignmentPreviewResult } from '@/services/coordinationService';
import { useMutualMeshStore } from '@/store/useMutualMeshStore';
import { WEBMCP_TOOL_CATALOG } from '@/webmcp/registerTools';
import { useWebMCPRegistration } from '@/webmcp/useWebMCPRegistration';

const agentPrompt = 'Inspect this Career Night workspace. Compare the equipment-transport options against the pickup window and remaining budget, explain why two alternatives fail, and close the gap with the viable choice. Then preview Maya’s projector becoming unavailable, compare the replacement displays, repair the draft without changing any locked constraint, and validate the current version. Do not request commitments or publish yet.';
const tones = ['teal', 'amber', 'blue'] as const;
type ContributionFilter = 'all' | 'skills' | 'resources' | 'logistics';
type InspectorTab = 'overview' | 'validation' | 'history';
type GraphSelection = { id: string; eyebrow: string; title: string; meta: string; status: string };
type RevisionPreview = Extract<AssignmentPreviewResult, { ok: true }>['preview'];

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span className="brand-node brand-node-a" />
      <span className="brand-node brand-node-b" />
      <span className="brand-node brand-node-c" />
      <span className="brand-node brand-node-d" />
    </span>
  );
}

function StatusDot({ tone = 'ready' }: { tone?: 'ready' | 'warning' }) {
  return <span className={`status-dot status-dot-${tone}`} aria-hidden="true" />;
}

function taskByKey(tasks: PlanTask[], key: string) {
  return tasks.find((task) => task.key === key);
}

function displayTask(tasks: PlanTask[], key: string, label: string, requiredCapability: string): PlanTask {
  return taskByKey(tasks, key) ?? tasks.find((task) => task.requiredCapability === requiredCapability) ?? tasks[0] ?? {
    id: `display-${key}`,
    key,
    label,
    requiredCapability,
    startsAt: '2026-09-10T18:00:00-06:00',
    endsAt: '2026-09-10T20:00:00-06:00',
    contributionIds: [],
    dependencyTaskIds: [],
    status: 'gap',
  };
}

function contributionDetail(contribution: Contribution) {
  return contribution.label;
}

function formatTaskWindow(task: PlanTask) {
  const start = new Date(task.startsAt);
  const end = new Date(task.endsAt);
  const startDate = start.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  const endDate = end.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  const startTime = start.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
  const endTime = end.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
  return startDate === endDate
    ? `${startDate} · ${startTime}–${endTime}`
    : `${startDate} · ${startTime} → ${endDate} · ${endTime}`;
}

function taskDepth(task: PlanTask, tasks: PlanTask[], visiting = new Set<string>()): number {
  if (!task.dependencyTaskIds.length || visiting.has(task.id)) return 0;
  const nextVisiting = new Set(visiting).add(task.id);
  return 1 + Math.max(0, ...task.dependencyTaskIds.map((id) => {
    const dependency = tasks.find((candidate) => candidate.id === id);
    return dependency ? taskDepth(dependency, tasks, nextVisiting) : 0;
  }));
}

function DirectedPlanGraph({
  goal,
  plan,
  contributions,
  participants,
  disruptionPreview,
  selected,
  onSelect,
}: {
  goal: Goal;
  plan: CoordinationPlan;
  contributions: Contribution[];
  participants: Participant[];
  disruptionPreview: ScenarioState['disruptionPreview'];
  selected: GraphSelection | null;
  onSelect: (selection: GraphSelection) => void;
}) {
  const taskMap = new Map(plan.tasks.map((task) => [task.id, task]));
  const contributionMap = new Map(contributions.map((contribution) => [contribution.id, contribution]));
  const participantMap = new Map(participants.map((participant) => [participant.id, participant]));
  const orderedTasks = plan.tasks
    .map((task, index) => ({ task, index, depth: taskDepth(task, plan.tasks) }))
    .sort((a, b) => a.depth - b.depth || a.index - b.index);

  return (
    <div className="directed-plan" aria-label={`Directed plan map with ${plan.tasks.length} tasks`}>
      <button
        className={`graph-goal ${selected?.id === goal.id ? 'graph-node-selected' : ''}`}
        type="button"
        onClick={() => onSelect({ id: goal.id, eyebrow: 'Goal', title: goal.title, meta: goal.description, status: `${plan.tasks.length} tasks · plan v${plan.version}` })}
        aria-pressed={selected?.id === goal.id}
      >
        <span>Goal</span>
        <strong>{goal.title}</strong>
        <small>Locked constraints flow into every task</small>
      </button>

      <div className="goal-flow" aria-hidden="true"><span>Goal → task plan</span></div>

      <div className="plan-map-head" aria-hidden="true">
        <span>Contributor</span><span>Task</span><span>Dependency direction</span>
      </div>

      <div className="plan-map-rows">
        {orderedTasks.map(({ task, depth }) => {
          const assigned = task.contributionIds.map((id) => contributionMap.get(id)).filter((item): item is Contribution => Boolean(item));
          const dependencies = task.dependencyTaskIds.map((id) => taskMap.get(id)).filter((item): item is PlanTask => Boolean(item));
          const atRisk = disruptionPreview?.affectedTaskIds.includes(task.id) ?? false;
          const taskStatus = atRisk ? 'At risk in preview' : plan.status === 'published' ? 'Complete' : task.status === 'gap' ? 'Open gap' : task.status;
          return (
            <article className={`plan-map-row ${task.status === 'gap' ? 'plan-map-row-gap' : ''} ${atRisk ? 'plan-map-row-risk' : ''}`} key={task.id}>
              <div className="graph-contributors">
                {assigned.length ? assigned.map((contribution) => {
                  const participant = participantMap.get(contribution.participantId);
                  return (
                    <button
                      className={`graph-contributor ${selected?.id === contribution.id ? 'graph-node-selected' : ''}`}
                      type="button"
                      key={contribution.id}
                      onClick={() => onSelect({
                        id: contribution.id,
                        eyebrow: 'Contributor',
                        title: participant?.displayName ?? 'Unknown participant',
                        meta: `${contribution.label}. ${contribution.description}`,
                        status: atRisk ? 'Unavailable in preview' : contribution.availability,
                      })}
                      aria-pressed={selected?.id === contribution.id}
                    >
                      <span className="graph-avatar" aria-hidden="true">{participant?.avatarSeed ?? '—'}</span>
                      <span><strong>{participant?.displayName ?? 'Unknown'}</strong><small>{contribution.label}</small></span>
                    </button>
                  );
                }) : (
                  <button
                    className="graph-contributor graph-contributor-gap"
                    type="button"
                    onClick={() => onSelect({ id: `gap-${task.id}`, eyebrow: 'Open contribution', title: 'No owner yet', meta: `Search for ${task.requiredCapability} that covers ${formatTaskWindow(task)}.`, status: 'Unresolved' })}
                    aria-pressed={selected?.id === `gap-${task.id}`}
                  >
                    <span className="graph-avatar" aria-hidden="true">+</span>
                    <span><strong>Open contribution</strong><small>{task.requiredCapability}</small></span>
                  </button>
                )}
              </div>

              <span className="assignment-direction" aria-label="Contributor fulfills task">→</span>

              <button
                className={`graph-task ${selected?.id === task.id ? 'graph-node-selected' : ''}`}
                type="button"
                onClick={() => onSelect({
                  id: task.id,
                  eyebrow: `Task · level ${depth + 1}`,
                  title: task.label,
                  meta: `${task.requiredCapability} · ${formatTaskWindow(task)} · ${assigned.length ? `${assigned.length} contribution${assigned.length === 1 ? '' : 's'}` : 'unassigned'}`,
                  status: taskStatus,
                })}
                aria-pressed={selected?.id === task.id}
              >
                <span className="graph-task-topline"><small>Task {String(orderedTasks.findIndex((item) => item.task.id === task.id) + 1).padStart(2, '0')}</small><b className={task.status === 'gap' || atRisk ? 'status-risk' : ''}>{taskStatus}</b></span>
                <strong>{task.label}</strong>
                <small>{task.requiredCapability} · {formatTaskWindow(task)}</small>
              </button>

              <div className="graph-dependencies">
                {dependencies.length ? dependencies.map((dependency) => (
                  <span className="dependency-route" key={dependency.id}>
                    <span>{dependency.label}</span><b aria-hidden="true">→</b><span>This task</span>
                  </span>
                )) : <span className="dependency-route dependency-root"><span>Goal</span><b aria-hidden="true">→</b><span>This task</span></span>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default function Home() {
  const goal = useMutualMeshStore((state) => state.goal);
  const constraints = useMutualMeshStore((state) => state.constraints);
  const participants = useMutualMeshStore((state) => state.participants);
  const contributions = useMutualMeshStore((state) => state.contributions);
  const plan = useMutualMeshStore((state) => state.plan);
  const commitments = useMutualMeshStore((state) => state.commitments);
  const activity = useMutualMeshStore((state) => state.activity);
  const disruptionPreview = useMutualMeshStore((state) => state.disruptionPreview);
  const approvalIntent = useMutualMeshStore((state) => state.approvalIntent);
  const hasHydrated = useMutualMeshStore((state) => state.hasHydrated);
  const resetDemo = useMutualMeshStore((state) => state.resetDemo);
  const assignContribution = useMutualMeshStore((state) => state.assignContribution);
  const previewDisruption = useMutualMeshStore((state) => state.previewDisruption);
  const requestCommitments = useMutualMeshStore((state) => state.requestCommitments);
  const simulateResponses = useMutualMeshStore((state) => state.simulateResponses);
  const publishPlan = useMutualMeshStore((state) => state.publishPlan);
  const approveIntent = useMutualMeshStore((state) => state.approveIntent);
  const rejectIntent = useMutualMeshStore((state) => state.rejectIntent);
  const { registration: webmcp, recentCalls } = useWebMCPRegistration(hasHydrated);

  const [showMoreContributions, setShowMoreContributions] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [contributionFilter, setContributionFilter] = useState<ContributionFilter>('all');
  const [revisionPreview, setRevisionPreview] = useState<RevisionPreview | null>(null);
  const [selectedGraphNode, setSelectedGraphNode] = useState<GraphSelection | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
  const [validatedVersion, setValidatedVersion] = useState<number | null>(null);
  const [toolInventoryOpen, setToolInventoryOpen] = useState(false);
  const modalOpenerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void useMutualMeshStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = window.setTimeout(() => setActionMessage(''), 4200);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  useEffect(() => {
    if (!inspectorOpen && !toolInventoryOpen) return;
    const selector = inspectorOpen ? '.inspector-drawer' : '.tool-inventory-drawer';
    const dialog = document.querySelector<HTMLElement>(selector);
    if (!dialog) return;
    const background = [
      document.querySelector<HTMLElement>('.topbar'),
      document.querySelector<HTMLElement>('.workspace'),
      document.querySelector<HTMLElement>('.prototype-note'),
    ].filter((element): element is HTMLElement => Boolean(element));
    background.forEach((element) => { element.inert = true; });

    const focusables = () => [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    queueMicrotask(() => (focusables()[0] ?? dialog).focus());
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setInspectorOpen(false);
        setToolInventoryOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
      background.forEach((element) => { element.inert = false; });
      modalOpenerRef.current?.focus();
    };
  }, [inspectorOpen, toolInventoryOpen]);

  const scenario: ScenarioState = useMemo(() => ({
    schemaVersion: 1,
    goal,
    constraints,
    participants,
    contributions,
    plan,
    commitments,
    activity,
    disruptionPreview,
    approvalIntent,
  }), [activity, approvalIntent, commitments, constraints, contributions, disruptionPreview, goal, participants, plan]);

  const summary = useMemo(() => calculatePlanSummary(scenario), [scenario]);
  const validation = useMemo(() => validatePlan(scenario), [scenario]);
  const participantMap = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  );
  const filteredContributions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return contributions.filter((contribution) => {
      const matchesFilter = contributionFilter === 'all'
        || (contributionFilter === 'skills' && contribution.kind === 'skill')
        || (contributionFilter === 'resources' && ['resource', 'space', 'food'].includes(contribution.kind))
        || (contributionFilter === 'logistics' && contribution.kind === 'transport');
      if (!matchesFilter) return false;
      if (!query) return true;
      const participant = participantMap.get(contribution.participantId);
      return [participant?.displayName, contribution.label, contribution.capability]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [contributionFilter, contributions, participantMap, searchQuery]);

  const visibleContributions = filteredContributions.slice(0, showMoreContributions || searchQuery ? 8 : 3);
  const transportTask = taskByKey(plan.tasks, 'transport');
  const transportOpen = transportTask?.status === 'gap';
  const currentCommitments = commitments.filter((item) => item.planId === plan.id && item.planVersion === plan.version);
  const pendingCommitments = currentCommitments.filter((item) => item.status === 'pending');
  const acceptedCommitments = currentCommitments.filter((item) => item.status === 'accepted');
  const declinedCommitments = currentCommitments.filter((item) => item.status === 'declined');

  const reset = () => {
    resetDemo();
    setShowMoreContributions(false);
    setShowAlternatives(false);
    setCopied(false);
    setSearchQuery('');
    setContributionFilter('all');
    setRevisionPreview(null);
    setSelectedGraphNode(null);
    setValidatedVersion(null);
    setToolInventoryOpen(false);
    setActionMessage('Demo reset to the deterministic starting state.');
  };

  const previewTransportRevision = () => {
    const result = previewContributionAssignment(scenario, {
      taskId: 'task-transport',
      contributionId: 'contribution-transport',
      expectedVersion: plan.version,
      actor: 'human',
    });
    if (result.ok) {
      setRevisionPreview(result.preview);
      setActionMessage('Revision preview created. No plan data has changed yet.');
      return;
    }
    setActionMessage(`${result.error.message} ${result.error.recoveryHint}`);
  };

  const applyTransportRevision = () => {
    const result = assignContribution('task-transport', 'contribution-transport', plan.version);
    if (result.ok) {
      setShowAlternatives(false);
      setRevisionPreview(null);
      setValidatedVersion(null);
      setActionMessage('Carlos is now suggested for equipment pickup. Plan advanced to version 4.');
      return;
    }
    setActionMessage(`${result.error.message} ${result.error.recoveryHint}`);
  };

  const previewProjectorDisruption = () => {
    const result = previewDisruption({
      planId: plan.id,
      expectedVersion: plan.version,
      type: 'contribution_unavailable',
      targetId: 'contribution-projector',
      actor: 'human',
    });
    setActionMessage(result.ok
      ? 'Projector cancellation previewed. The canonical plan is unchanged.'
      : `${result.error.message} ${result.error.recoveryHint}`);
  };

  const applyBackupDisplayRepair = () => {
    const result = assignContribution('task-av', 'contribution-backup-display', plan.version);
    setValidatedVersion(null);
    setActionMessage(result.ok
      ? `Backup display and adapter assigned. Draft advanced to version ${result.scenario.plan.version}.`
      : `${result.error.message} ${result.error.recoveryHint}`);
  };

  const requestAllCommitments = () => {
    const contributionOwners = new Map(contributions.map((item) => [item.id, item.participantId]));
    const participantIds = [...new Set(plan.tasks.flatMap((task) => task.contributionIds.map((id) => contributionOwners.get(id))).filter((id): id is string => Boolean(id)))];
    const result = requestCommitments({
      planId: plan.id,
      expectedVersion: plan.version,
      participantIds,
      message: 'Please confirm your fictional Career Night assignment in this Mutual Mesh demo.',
      inAppOnly: true,
      actor: 'human',
    });
    setActionMessage(result.ok
      ? `${result.requestedParticipantIds.length} in-app commitments requested. No external messages were sent.`
      : `${result.error.message} ${result.error.recoveryHint}`);
  };

  const simulateAllAccepted = () => {
    const result = simulateResponses({
      planId: plan.id,
      expectedVersion: plan.version,
      responses: pendingCommitments.map((item) => ({ participantId: item.participantId, status: 'accepted' as const })),
      actor: 'system',
    });
    setActionMessage(result.ok ? 'All fictional participants accepted. Publication is now unlocked.' : `${result.error.message} ${result.error.recoveryHint}`);
  };

  const simulateOneDecline = () => {
    const declining = pendingCommitments[0];
    if (!declining) return;
    const result = simulateResponses({
      planId: plan.id,
      expectedVersion: plan.version,
      responses: pendingCommitments.map((item) => ({ participantId: item.participantId, status: item.participantId === declining.participantId ? 'declined' as const : 'accepted' as const })),
      actor: 'system',
    });
    setActionMessage(result.ok ? 'One fictional participant declined. Publication is correctly blocked.' : `${result.error.message} ${result.error.recoveryHint}`);
  };

  const publishAcceptedPlan = () => {
    const result = publishPlan({
      planId: plan.id,
      expectedVersion: plan.version,
      acknowledgement: 'Publish the accepted plan',
      actor: 'human',
    });
    setActionMessage(result.ok ? `Plan v${result.scenario.plan.version} published as an immutable in-app snapshot.` : `${result.error.message} ${result.error.recoveryHint}`);
  };

  const approveStagedIntent = () => {
    if (!approvalIntent) return;
    const type = approvalIntent.type;
    const result = approveIntent(approvalIntent.id);
    setActionMessage(result.ok
      ? type === 'request_commitments'
        ? 'Human approval recorded. Version-bound in-app commitment requests now exist.'
        : `Human approval recorded. Plan v${result.scenario.plan.version} is now published.`
      : `${result.error.message} ${result.error.recoveryHint}`);
  };

  const rejectStagedIntent = () => {
    if (!approvalIntent) return;
    const result = rejectIntent(approvalIntent.id);
    setActionMessage(result.ok
      ? 'Agent intent rejected. The canonical plan and participant state are unchanged.'
      : `${result.error.message} ${result.error.recoveryHint}`);
  };

  const rememberModalOpener = () => {
    modalOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  const openInspector = (tab: InspectorTab) => {
    rememberModalOpener();
    setToolInventoryOpen(false);
    setInspectorTab(tab);
    setInspectorOpen(true);
  };

  const openToolInventory = () => {
    rememberModalOpener();
    setInspectorOpen(false);
    setToolInventoryOpen(true);
  };

  const runValidation = () => {
    if (!inspectorOpen) rememberModalOpener();
    setValidatedVersion(plan.version);
    setInspectorTab('validation');
    setInspectorOpen(true);
    setActionMessage(validation.blockingCount === 0
      ? `Plan v${plan.version} passed every hard validation check.`
      : `Plan v${plan.version} has ${validation.blockingCount} blocking validation issue.`);
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(agentPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const av = displayTask(plan.tasks, 'av', 'Presentation AV', 'presentation-av');
  const ownersForTask = (task: PlanTask) => task.contributionIds
    .map((id) => contributions.find((contribution) => contribution.id === id))
    .map((contribution) => contribution ? participantMap.get(contribution.participantId)?.displayName : undefined)
    .filter((name): name is string => Boolean(name))
    .join(', ') || 'Unassigned';
  const usingBackupDisplay = av.contributionIds.includes('contribution-backup-display');
  const published = plan.status === 'published';

  return (
    <main className="app-shell" data-hydrated={hasHydrated ? 'true' : 'false'} aria-busy={!hasHydrated}>
      <header className="topbar">
        <a className="brand" href="#main-canvas" aria-label="Mutual Mesh home">
          <BrandMark />
          <span className="brand-copy">
            <strong>Mutual Mesh</strong>
            <small>Community coordination</small>
          </span>
        </a>

        <div className="scenario-switcher" aria-label="Current scenario">
          <span className="scenario-icon" aria-hidden="true">CN</span>
          <span>
            <small>Demo workspace</small>
            <strong>Career Night</strong>
          </span>
          <span className="scenario-static">Flagship demo</span>
        </div>

        <div className="topbar-actions">
          <button
            className="tool-status tool-status-button"
            type="button"
            onClick={openToolInventory}
            aria-haspopup="dialog"
          >
            <StatusDot tone={webmcp.status === 'ready' ? 'ready' : 'warning'} />
            {webmcp.status === 'ready' ? `WebMCP ready · ${webmcp.registeredTools.length} tools`
              : webmcp.status === 'unavailable' ? 'WebMCP unavailable · UI active'
                : webmcp.status === 'failed' ? 'WebMCP registration needs attention'
                  : webmcp.status === 'registering' ? `Registering ${WEBMCP_TOOL_CATALOG.length} WebMCP tools`
                    : 'Restoring local demo'}
          </button>
          <button className="button button-ghost" type="button" onClick={reset}>Reset demo</button>
          <span className="avatar-button" aria-label="Demo coordinator RM">RM</span>
        </div>
      </header>

      {actionMessage ? <div className="action-toast" role="status">{actionMessage}</div> : null}

      <section className="workspace" id="main-canvas">
        <aside className="left-rail" aria-label="Goal and available contributions">
          <section className="panel goal-panel">
            <div className="panel-heading">
              <span className="eyebrow">Active goal</span>
              <span className="version-pill">{plan.status === 'draft' ? 'Draft' : plan.status === 'requesting' ? 'Requesting' : plan.status === 'ready' ? 'Accepted' : 'Published'} v{plan.version}</span>
            </div>
            <h1>{goal.title}</h1>
            <p className="goal-summary">{goal.description}</p>

            <dl className="goal-facts">
              <div><dt>When</dt><dd>Thu · 6–8 PM</dd></div>
              <div><dt>Budget</dt><dd>${goal.budgetLimit} maximum</dd></div>
              <div><dt>Attendance</dt><dd>{goal.attendanceTarget} students</dd></div>
            </dl>

            <div className="constraint-heading">
              <span>Locked constraints</span>
              <span className="count-badge">{constraints.filter((constraint) => constraint.lockedByHuman).length}</span>
            </div>
            <div className="constraint-list">
              {constraints.filter((constraint) => constraint.lockedByHuman).map((constraint) => (
                <span className="constraint-chip" key={constraint.id}><span aria-hidden="true">◆</span> {constraint.label}</span>
              ))}
            </div>
          </section>

          <section className="panel contribution-panel">
            <div className="section-title-row">
              <div>
                <span className="eyebrow">Available now</span>
                <h2>Community contributions</h2>
              </div>
              <span className="inventory-count">{filteredContributions.length}</span>
            </div>
            <label className="search-field">
              <span className="search-icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search people or resources"
                aria-label="Search community contributions"
              />
            </label>
            <div className="filter-row" aria-label="Filter contributions">
              {([
                ['all', 'All'],
                ['skills', 'Skills'],
                ['resources', 'Resources'],
                ['logistics', 'Logistics'],
              ] as Array<[ContributionFilter, string]>).map(([value, label]) => (
                <button
                  className={`filter-chip ${contributionFilter === value ? 'filter-chip-active' : ''}`}
                  type="button"
                  key={value}
                  onClick={() => setContributionFilter(value)}
                  aria-pressed={contributionFilter === value}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="contribution-list">
              {visibleContributions.map((contribution, index) => {
                const participant = participantMap.get(contribution.participantId)!;
                return (
                  <article className="contribution" key={contribution.id}>
                    <span className={`contribution-avatar avatar-${tones[index % tones.length]}`}>{participant.avatarSeed}</span>
                    <span><strong>{participant.displayName}</strong><small>{contributionDetail(contribution)}</small></span>
                    <span className="availability" aria-label={contribution.availability} />
                  </article>
                );
              })}
              {visibleContributions.length === 0 ? (
                <div className="empty-copy empty-contributions">
                  <strong>No matching contributions</strong>
                  <span>Try a skill, person, or resource—or clear the current filters.</span>
                  <button type="button" className="text-button" onClick={() => { setSearchQuery(''); setContributionFilter('all'); }}>Clear search and filters</button>
                </div>
              ) : null}
            </div>
            {!searchQuery && contributionFilter === 'all' && filteredContributions.length > 3 ? (
              <button
                className="text-button"
                type="button"
                onClick={() => setShowMoreContributions((current) => !current)}
                aria-expanded={showMoreContributions}
              >
                {showMoreContributions ? 'Show fewer contributions' : `View all ${filteredContributions.length} contributions`} <span aria-hidden="true">→</span>
              </button>
            ) : null}
          </section>
        </aside>

        <section className="canvas-panel" aria-label="Live coordination graph">
          <div className="canvas-header">
            <div>
              <span className="eyebrow">Live coordination graph</span>
              <h2>The plan, at a glance</h2>
            </div>
            <div className="canvas-legend" aria-label="Relationship direction legend">
              <span>Contributor <b aria-hidden="true">→</b> task</span>
              <span>Prerequisite <b aria-hidden="true">→</b> dependent</span>
            </div>
          </div>

          <div className={`mesh-stage mesh-stage-${plan.status} ${transportOpen ? '' : 'mesh-stage-complete'} ${disruptionPreview ? 'mesh-stage-disrupted' : ''}`}>
            <div className="mesh-grid" aria-hidden="true" />
            <div className="graph-status-row" role="status">
              <span className="agent-spark" aria-hidden="true">M</span>
              <span><strong>{published ? 'Accepted plan is immutable' : 'Shared state is version-safe'}</strong><small>{published ? `Plan version ${plan.version} · immutable publication` : 'Human actions and nine site tools use one canonical plan'}</small></span>
              <span className="graph-tool-evidence">
                <b>{recentCalls[0] ? recentCalls[0].name : 'Agent tools ready'}</b>
                <small>{recentCalls[0] ? `${recentCalls[0].status} · visible in shared history` : `${webmcp.registeredTools.length || WEBMCP_TOOL_CATALOG.length} structured tools share this workspace`}</small>
              </span>
              {disruptionPreview ? <span className="graph-state-alert"><b>Temporary preview · plan unchanged</b>{disruptionPreview.summary}</span> : null}
              {published ? <span className="graph-state-success"><b>Published</b>Every hard check and commitment passed.</span> : null}
            </div>

            {approvalIntent ? (
              <section className="human-approval-gate" aria-labelledby="human-approval-title">
                <div>
                  <span className="eyebrow">Human authority · version-bound</span>
                  <strong id="human-approval-title">{approvalIntent.type === 'request_commitments' ? 'Agent proposes commitment requests' : 'Agent proposes publication'}</strong>
                  <p>{approvalIntent.type === 'request_commitments'
                    ? `${approvalIntent.participantIds.length} in-app requests are prepared for plan v${approvalIntent.planVersion}. Nobody has been contacted.`
                    : `Accepted plan v${approvalIntent.planVersion} is prepared, but remains unpublished until you approve.`}</p>
                </div>
                <div className="approval-actions">
                  <button className="button button-ghost" type="button" onClick={rejectStagedIntent}>Reject</button>
                  <button className="button button-primary" type="button" onClick={approveStagedIntent}>
                    {approvalIntent.type === 'request_commitments' ? 'Approve requests' : 'Approve publication'}
                  </button>
                </div>
              </section>
            ) : null}

            <DirectedPlanGraph
              goal={goal}
              plan={plan}
              contributions={contributions}
              participants={participants}
              disruptionPreview={disruptionPreview}
              selected={selectedGraphNode}
              onSelect={setSelectedGraphNode}
            />

            {selectedGraphNode ? (
              <aside className="graph-selection graph-selection-band" aria-live="polite">
                <button type="button" onClick={() => setSelectedGraphNode(null)} aria-label="Close graph detail">×</button>
                <span className="eyebrow">{selectedGraphNode.eyebrow}</span>
                <strong>{selectedGraphNode.title}</strong>
                <p>{selectedGraphNode.meta}</p>
                <small>Status · {selectedGraphNode.status}</small>
              </aside>
            ) : null}
          </div>

          <div className="agent-prompt">
            <span className="prompt-icon" aria-hidden="true">M</span>
            <div>
              <span className="eyebrow">Canonical agent prompt</span>
              <p>“{agentPrompt}”</p>
            </div>
            <button className="copy-button" type="button" onClick={copyPrompt} aria-live="polite">
              {copied ? 'Copied' : 'Copy prompt'}
            </button>
          </div>

          <details className="graph-fallback">
            <summary>Accessible plan table</summary>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Task</th><th>Owner</th><th>Status</th><th>Depends on</th></tr></thead>
                <tbody>
                  {plan.tasks.map((task) => (
                    <tr key={task.id}>
                      <td>{task.label}</td>
                      <td>{ownersForTask(task)}</td>
                      <td>{task.status}</td>
                      <td>{task.dependencyTaskIds.map((id) => plan.tasks.find((item) => item.id === id)?.label).filter(Boolean).join(', ') || 'None'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <aside className="right-rail" aria-label="Plan readiness and recent activity">
          <section className="panel readiness-panel">
            <div className="panel-heading">
              <span className="eyebrow">Plan readiness</span>
              <span className="trend-pill">v{plan.version}</span>
            </div>
            <div className="readiness-score"><strong>{summary.readiness}</strong><span>%</span></div>
            <div className="progress-track" aria-label={`Plan readiness: ${summary.readiness} percent`}><span style={{ width: `${summary.readiness}%` }} /></div>
            <div className="metric-grid">
              <div><small>Budget</small><strong>${summary.budgetSpent} / ${goal.budgetLimit}</strong></div>
              <div><small>Coverage</small><strong>{summary.coveredTasks} / {summary.totalTasks} tasks</strong></div>
              <div><small>Commitments</small><strong>{summary.commitmentRequests} requested</strong></div>
              <div><small>Risk</small><strong className={`risk-${summary.risk.toLowerCase()}`}><StatusDot tone={summary.risk === 'Low' ? 'ready' : 'warning'} /> {summary.risk}</strong></div>
            </div>
            <button className="button button-inspector" type="button" onClick={() => openInspector('overview')}>
              Open plan inspector <span aria-hidden="true">→</span>
            </button>
          </section>

          <section className={`gap-card workflow-card ${transportOpen || disruptionPreview ? '' : 'gap-card-resolved'} ${published ? 'workflow-card-published' : ''}`}>
            <div className="gap-icon" aria-hidden="true">{transportOpen || disruptionPreview ? '!' : published ? '◆' : '✓'}</div>
            <div>
              <span className="eyebrow">{transportOpen ? 'Step 1 · Close the gap' : disruptionPreview ? 'Step 2 · Repair reality' : plan.status === 'requesting' ? declinedCommitments.length ? 'Step 4 · Consent declined' : 'Step 4 · Consent pending' : plan.status === 'ready' ? 'Step 5 · Human publish gate' : published ? 'Canonical end-to-end story complete' : usingBackupDisplay ? 'Step 3 · Request consent' : 'Step 2 · Stress-test the plan'}</span>
              <h2>{transportOpen ? 'Equipment pickup has no owner' : disruptionPreview ? 'Projector cancellation affects Presentation AV' : plan.status === 'requesting' ? declinedCommitments.length ? 'A fictional participant declined' : `${pendingCommitments.length} fictional responses pending` : plan.status === 'ready' ? 'Every required commitment is accepted' : published ? `Plan v${plan.version} is immutable` : usingBackupDisplay ? 'The repaired plan is valid' : 'What if Maya’s projector disappears?'}</h2>
              <p>{transportOpen ? 'The display must arrive before setup begins at 5:30 PM.' : disruptionPreview ? 'The preview is visible, but the canonical plan has not changed.' : plan.status === 'requesting' ? declinedCommitments.length ? 'Publication stays locked. Revise the assignment in a new draft or reset this deterministic demo.' : 'These requests exist only inside this demo. No external messages were sent.' : plan.status === 'ready' ? 'Publication changes only the in-app plan state and preserves this accepted version.' : published ? 'The complete activity trail proves the draft, disruption, consent, and publication sequence.' : usingBackupDisplay ? 'The backup display and adapter preserve budget, timing, accessibility, workload, and pickup dependencies.' : 'Preview the impact before any assignment changes.'}</p>
              {transportOpen ? (
                <>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setShowAlternatives((current) => !current)}
                    aria-expanded={showAlternatives}
                  >
                    {showAlternatives ? 'Hide viable match' : 'Find a viable match'} <span aria-hidden="true">→</span>
                  </button>
                  {showAlternatives ? (
                    <div className="alternative-card">
                      <div className="decision-heading">
                        <strong>3 candidates evaluated</strong>
                        <small>Time window · remaining $30 budget · capability</small>
                      </div>
                      <div className="decision-candidate decision-candidate-best">
                        <span>Recommended</span><strong>Carlos · equipment run</strong><small>Full 4:30–5:30 PM window · $0 · correct capability</small>
                      </div>
                      <div className="decision-candidate decision-candidate-rejected">
                        <span>Rejected · budget</span><strong>Lina · community courier</strong><small>$45 would put the plan $15 over its locked budget.</small>
                      </div>
                      <div className="decision-candidate decision-candidate-rejected">
                        <span>Rejected · timing</span><strong>Omar · cargo bike</strong><small>Availability ends at 5 PM, thirty minutes before pickup closes.</small>
                      </div>
                      {!revisionPreview ? (
                        <button className="button button-primary" type="button" onClick={previewTransportRevision}>Preview revision</button>
                      ) : (
                        <div className="revision-preview" role="status">
                          <span className="preview-label">No changes applied yet</span>
                          <div><small>Readiness</small><strong>{revisionPreview.readinessBefore}% → {revisionPreview.readinessAfter}%</strong></div>
                          <div><small>Coverage</small><strong>{revisionPreview.coverageBefore} → {revisionPreview.coverageAfter} tasks</strong></div>
                          <div><small>Locked constraints</small><strong>{revisionPreview.lockedConstraintChanges} changed</strong></div>
                          <button className="button button-primary" type="button" onClick={applyTransportRevision}>Apply revision</button>
                          <button className="text-button" type="button" onClick={() => setRevisionPreview(null)}>Discard preview</button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              ) : disruptionPreview ? (
                <button className="button button-primary" type="button" onClick={applyBackupDisplayRepair}>Repair with backup display</button>
              ) : plan.status === 'requesting' ? (
                declinedCommitments.length ? (
                  <button className="text-button" type="button" onClick={reset}>Reset and replay acceptance path <span aria-hidden="true">→</span></button>
                ) : (
                  <div className="workflow-actions">
                    <button className="button button-primary" type="button" onClick={simulateAllAccepted}>Simulate all accept</button>
                    <button className="text-button" type="button" onClick={simulateOneDecline}>Simulate one decline</button>
                  </div>
                )
              ) : plan.status === 'ready' ? (
                <button className="button button-primary" type="button" onClick={publishAcceptedPlan}>Publish accepted plan</button>
              ) : published ? (
                <button className="text-button" type="button" onClick={reset}>Reset and replay the story <span aria-hidden="true">→</span></button>
              ) : usingBackupDisplay ? (
                <button className="button button-primary" type="button" onClick={requestAllCommitments}>Request in-app commitments</button>
              ) : (
                <button className="button button-primary" type="button" onClick={previewProjectorDisruption}>Preview projector cancellation</button>
              )}
            </div>
          </section>

          <section className="panel activity-panel">
            <div className="section-title-row">
              <div><span className="eyebrow">Shared history</span><h2>Recent activity</h2></div>
              <button className="icon-button icon-button-small" type="button" onClick={() => openInspector('history')} aria-label="Open full activity history">↗</button>
            </div>
            <ol className="activity-list">
              {activity.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <span className={`activity-dot activity-${item.actor}`} aria-hidden="true" />
                  <span><strong>{item.actor === 'human' ? 'You' : item.actor === 'agent' ? 'Agent' : 'System'}</strong><small>{item.action}</small></span>
                  <time>v{item.planVersionAfter ?? plan.version}</time>
                </li>
              ))}
            </ol>
            <button className="text-button" type="button" onClick={() => openInspector('history')}>View full history <span aria-hidden="true">→</span></button>
          </section>
        </aside>
      </section>

      <footer className="prototype-note">
        Mutual Mesh is a fictional coordination prototype, not an emergency-response or real-world messaging service.
      </footer>

      {inspectorOpen ? (
        <div className="inspector-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setInspectorOpen(false);
        }}>
          <section className="inspector-drawer" role="dialog" aria-modal="true" aria-labelledby="inspector-title">
            <header className="inspector-header">
              <div>
                <span className="eyebrow">Plan inspector · {plan.status} v{plan.version}</span>
                <h2 id="inspector-title">Career Night coordination plan</h2>
                <p>Inspect the reasoning, run every validation check, and review exactly what changed.</p>
              </div>
              <button className="inspector-close" type="button" onClick={() => setInspectorOpen(false)} aria-label="Close plan inspector" autoFocus>×</button>
            </header>

            <nav className="inspector-tabs" aria-label="Plan inspector sections">
              {([
                ['overview', 'Overview'],
                ['validation', `Validation${validation.blockingCount ? ` · ${validation.blockingCount}` : ''}`],
                ['history', `History · ${activity.length}`],
              ] as Array<[InspectorTab, string]>).map(([tab, label]) => (
                <button
                  type="button"
                  key={tab}
                  className={inspectorTab === tab ? 'inspector-tab-active' : ''}
                  onClick={() => setInspectorTab(tab)}
                  aria-current={inspectorTab === tab ? 'page' : undefined}
                >
                  {label}
                </button>
              ))}
            </nav>

            <div className="inspector-content">
              {inspectorTab === 'overview' ? (
                <div className="inspector-overview">
                  <section className="inspector-score-card">
                    <div><span className="eyebrow">Readiness</span><strong>{summary.readiness}%</strong></div>
                    <div><span className="eyebrow">Coverage</span><strong>{summary.coveredTasks}/{summary.totalTasks}</strong></div>
                    <div><span className="eyebrow">Budget</span><strong>${summary.budgetSpent}</strong><small>of ${goal.budgetLimit}</small></div>
                    <div><span className="eyebrow">Risk</span><strong>{summary.risk}</strong></div>
                  </section>
                  <section className="inspector-section">
                    <span className="eyebrow">Coordination rationale</span>
                    <h3>Use community capacity first</h3>
                    <p>{plan.rationale}</p>
                  </section>
                  <section className="inspector-section consent-section">
                    <div className="inspector-section-heading"><div><span className="eyebrow">Consent is state</span><h3>{currentCommitments.length ? `${acceptedCommitments.length} of ${currentCommitments.length} accepted` : 'No commitments requested'}</h3></div><span className="version-pill">{plan.status}</span></div>
                    <ul className="commitment-list">
                      {currentCommitments.length ? currentCommitments.map((commitment) => (
                        <li key={commitment.id}><strong>{participantMap.get(commitment.participantId)?.displayName ?? commitment.participantId}</strong><span className={`commitment-state commitment-${commitment.status}`}>{commitment.status}</span></li>
                      )) : <li><small>Suggestions are not commitments. Requests begin only after validation.</small></li>}
                    </ul>
                  </section>
                  <section className="inspector-section">
                    <div className="inspector-section-heading"><div><span className="eyebrow">Human authority</span><h3>Locked constraints</h3></div><span className="version-pill">{constraints.length} protected</span></div>
                    <ul className="inspector-constraint-list">
                      {constraints.map((constraint) => <li key={constraint.id}><span aria-hidden="true">◆</span><strong>{constraint.label}</strong><small>Locked by coordinator</small></li>)}
                    </ul>
                  </section>
                  <button className="button button-primary inspector-primary-action" type="button" onClick={runValidation}>Run full validation</button>
                </div>
              ) : null}

              {inspectorTab === 'validation' ? (
                <div className="validation-view">
                  <section className={`validation-hero ${validation.blockingCount ? 'validation-hero-error' : 'validation-hero-pass'}`}>
                    <span className="validation-symbol" aria-hidden="true">{validation.blockingCount ? '!' : '✓'}</span>
                    <div>
                      <span className="eyebrow">{validatedVersion === plan.version ? `Validated against v${plan.version}` : 'Validation available'}</span>
                      <h3>{validation.blockingCount ? `${validation.blockingCount} blocker must be resolved` : 'Every hard constraint passes'}</h3>
                      <p>{validation.blockingCount ? 'Resolve the listed issue, then validate this version again.' : published ? 'This immutable version passed every validation and consent gate.' : validation.readyToPublish ? 'Every validation and consent gate passes. Publication is available.' : 'This draft is ready for in-app commitment requests.'}</p>
                    </div>
                    <button className="button button-primary" type="button" onClick={runValidation}>{validatedVersion === plan.version ? 'Run again' : 'Run validation'}</button>
                  </section>

                  <div className="validation-checks">
                    {validation.checks.map((check) => (
                      <article className="validation-check" key={check.key}>
                        <span className={`check-icon check-${check.status}`} aria-hidden="true">{check.status === 'pass' ? '✓' : check.status === 'warning' ? '•' : '!'}</span>
                        <div><strong>{check.label}</strong><p>{check.detail}</p></div>
                        <span className={`check-label check-label-${check.status}`}>{check.status}</span>
                      </article>
                    ))}
                  </div>

                  {validation.issues.length ? (
                    <section className="inspector-section issue-section">
                      <span className="eyebrow">Plain-language findings</span>
                      <ul className="issue-list">
                        {validation.issues.map((issue) => (
                          <li key={issue.code}>
                            <span className={`issue-severity issue-${issue.severity}`}>{issue.severity}</span>
                            <div><strong>{issue.message}</strong><p>{issue.recoveryHint}</p></div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              ) : null}

              {inspectorTab === 'history' ? (
                <div className="history-view">
                  <section className="inspector-section">
                    <span className="eyebrow">Complete shared history</span>
                    <h3>Human and agent actions remain distinguishable</h3>
                    <p>Every mutation records the actor, affected plan version, and a plain-language summary.</p>
                  </section>
                  <ol className="history-list">
                    {activity.map((item) => (
                      <li key={item.id}>
                        <span className={`history-avatar history-${item.actor}`}>{item.actor === 'human' ? 'Y' : item.actor === 'agent' ? '✦' : 'S'}</span>
                        <div>
                          <span className="history-topline"><strong>{item.actor === 'human' ? 'You' : item.actor === 'agent' ? 'Agent' : 'System'}</strong><small>v{item.planVersionBefore ?? plan.version} → v{item.planVersionAfter ?? plan.version}</small></span>
                          <h4>{item.action}</h4>
                          <p>{item.summary}</p>
                          <time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>

            <footer className="inspector-footer">
              <span><StatusDot tone={validation.blockingCount ? 'warning' : 'ready'} /> {published ? 'Canonical end-to-end story complete' : validation.blockingCount ? `${validation.blockingCount} blocker needs attention` : validation.readyToPublish ? 'Publication gate unlocked' : 'Hard constraints pass'}</span>
              <small>{published ? 'Reset the deterministic demo to replay.' : validation.readyToPublish ? 'Publish the exact accepted version when ready.' : 'Commitment and publication actions remain separate.'}</small>
            </footer>
          </section>
        </div>
      ) : null}

      {toolInventoryOpen ? (
        <div className="inspector-backdrop tool-inventory-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setToolInventoryOpen(false);
        }}>
          <section className="tool-inventory-drawer" role="dialog" aria-modal="true" aria-labelledby="tool-inventory-title">
            <header className="inspector-header">
              <div>
                <span className="eyebrow">Agent interface · imperative WebMCP</span>
                <h2 id="tool-inventory-title">Nine tools share this live workspace</h2>
                <p>Agents inspect the same state you see. Draft, preview, consent, and publication remain separate, version-safe actions.</p>
              </div>
              <button className="inspector-close" type="button" onClick={() => setToolInventoryOpen(false)} aria-label="Close WebMCP tool inventory" autoFocus>×</button>
            </header>

            <div className="tool-inventory-status" role="status">
              <span className={`tool-inventory-orb tool-inventory-orb-${webmcp.status}`} aria-hidden="true" />
              <div>
                <strong>{webmcp.status === 'ready' ? 'Discoverable now' : webmcp.status === 'unavailable' ? 'Compatible browser required for agent discovery' : webmcp.status === 'failed' ? 'Registration failed' : 'Preparing agent tools'}</strong>
                <small>{webmcp.status === 'ready' ? `${webmcp.registeredTools.length} of ${WEBMCP_TOOL_CATALOG.length} tools registered on the top-level page.`
                  : webmcp.status === 'unavailable' ? 'The complete human interface remains available as the normal fallback.'
                    : webmcp.error ?? 'Restoring state before registration prevents tools from reading stale data.'}</small>
              </div>
            </div>

            <div className="tool-inventory-list">
              {WEBMCP_TOOL_CATALOG.map((tool) => {
                const lastCall = recentCalls.find((call) => call.name === tool.name);
                return (
                  <article className="tool-inventory-card" key={tool.name}>
                    <div className="tool-card-heading">
                      <span className={`tool-access tool-access-${tool.access}`}>{tool.access}</span>
                      <span className="tool-call-state">{lastCall ? `${lastCall.status} · ${new Date(lastCall.timestamp).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}` : 'Not called yet'}</span>
                    </div>
                    <h3>{tool.title}</h3>
                    <code>{tool.name}</code>
                    <p>{tool.description}</p>
                  </article>
                );
              })}
            </div>

            <footer className="tool-inventory-footer">
              <span><StatusDot tone={webmcp.status === 'ready' ? 'ready' : 'warning'} /> Four reads · five visible preview or write actions.</span>
              <button className="text-button" type="button" onClick={copyPrompt}>{copied ? 'Prompt copied' : 'Copy canonical agent prompt'} <span aria-hidden="true">→</span></button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
