'use client';

import { useEffect, useMemo, useState } from 'react';
import { calculatePlanSummary } from '@/domain/scoring';
import { validatePlan } from '@/domain/validation';
import type { Contribution, PlanTask, ScenarioState } from '@/domain/types';
import { previewContributionAssignment, type AssignmentPreviewResult } from '@/services/coordinationService';
import { useMutualMeshStore } from '@/store/useMutualMeshStore';

const agentPrompt = 'Use available contributions to close the final gap. Keep every locked constraint.';
const tones = ['teal', 'amber', 'blue'] as const;
type ContributionFilter = 'all' | 'skills' | 'resources' | 'logistics';
type InspectorTab = 'overview' | 'validation' | 'history';
type GraphSelection = { eyebrow: string; title: string; meta: string; status: string };
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

function MeshNode({
  className,
  eyebrow,
  title,
  meta,
  status,
  selected = false,
  onSelect,
}: {
  className: string;
  eyebrow: string;
  title: string;
  meta: string;
  status?: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      className={`mesh-node ${className} ${selected ? 'mesh-node-selected' : ''}`}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="mesh-node-topline">
        <span>{eyebrow}</span>
        {status ? <span className="mesh-node-status">{status}</span> : null}
      </div>
      <strong>{title}</strong>
      <small>{meta}</small>
    </button>
  );
}

function taskByKey(tasks: PlanTask[], key: string) {
  return tasks.find((task) => task.key === key)!;
}

function contributionDetail(contribution: Contribution) {
  return contribution.label;
}

export default function Home() {
  const goal = useMutualMeshStore((state) => state.goal);
  const constraints = useMutualMeshStore((state) => state.constraints);
  const participants = useMutualMeshStore((state) => state.participants);
  const contributions = useMutualMeshStore((state) => state.contributions);
  const plan = useMutualMeshStore((state) => state.plan);
  const commitments = useMutualMeshStore((state) => state.commitments);
  const activity = useMutualMeshStore((state) => state.activity);
  const hasHydrated = useMutualMeshStore((state) => state.hasHydrated);
  const resetDemo = useMutualMeshStore((state) => state.resetDemo);
  const assignContribution = useMutualMeshStore((state) => state.assignContribution);

  const [showMoreContributions, setShowMoreContributions] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [fitMode, setFitMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [contributionFilter, setContributionFilter] = useState<ContributionFilter>('all');
  const [revisionPreview, setRevisionPreview] = useState<RevisionPreview | null>(null);
  const [selectedGraphNode, setSelectedGraphNode] = useState<GraphSelection | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
  const [validatedVersion, setValidatedVersion] = useState<number | null>(null);

  useEffect(() => {
    void useMutualMeshStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!inspectorOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInspectorOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [inspectorOpen]);

  const scenario: ScenarioState = useMemo(() => ({
    schemaVersion: 1,
    goal,
    constraints,
    participants,
    contributions,
    plan,
    commitments,
    activity,
  }), [activity, commitments, constraints, contributions, goal, participants, plan]);

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
  const transportOpen = transportTask.status === 'gap';

  const reset = () => {
    resetDemo();
    setShowMoreContributions(false);
    setShowAlternatives(false);
    setFitMode(false);
    setCopied(false);
    setSearchQuery('');
    setContributionFilter('all');
    setRevisionPreview(null);
    setSelectedGraphNode(null);
    setValidatedVersion(null);
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

  const openInspector = (tab: InspectorTab) => {
    setInspectorTab(tab);
    setInspectorOpen(true);
  };

  const runValidation = () => {
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

  const venue = taskByKey(plan.tasks, 'venue');
  const av = taskByKey(plan.tasks, 'av');
  const refreshments = taskByKey(plan.tasks, 'refreshments');
  const ownersForTask = (task: PlanTask) => task.contributionIds
    .map((id) => contributions.find((contribution) => contribution.id === id))
    .map((contribution) => contribution ? participantMap.get(contribution.participantId)?.displayName : undefined)
    .filter((name): name is string => Boolean(name))
    .join(', ') || 'Unassigned';

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#main-canvas" aria-label="Mutual Mesh home">
          <BrandMark />
          <span className="brand-copy">
            <strong>Mutual Mesh</strong>
            <small>Community coordination</small>
          </span>
        </a>

        <div className="scenario-switcher" aria-label="Current scenario">
          <span className="scenario-icon" aria-hidden="true">◎</span>
          <span>
            <small>Demo workspace</small>
            <strong>Career Night</strong>
          </span>
          <span className="chevron" aria-hidden="true">⌄</span>
        </div>

        <div className="topbar-actions">
          <span className="tool-status">
            <StatusDot /> {hasHydrated ? 'Foundation live · tools next' : 'Restoring local demo'}
          </span>
          <button className="button button-ghost" type="button" onClick={reset}>Reset demo</button>
          <button className="avatar-button" type="button" aria-label="Open coordinator profile">RM</button>
        </div>
      </header>

      {actionMessage ? <div className="action-toast" role="status">{actionMessage}</div> : null}

      <section className="workspace" id="main-canvas">
        <aside className="left-rail" aria-label="Goal and available contributions">
          <section className="panel goal-panel">
            <div className="panel-heading">
              <span className="eyebrow">Active goal</span>
              <span className="version-pill">Draft v{plan.version}</span>
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
              {visibleContributions.length === 0 ? <p className="empty-copy">No matching contributions. Try a skill, person, or resource.</p> : null}
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
            <div className="canvas-legend" aria-label="Graph legend">
              <span><i className="legend-line legend-suggested" /> Suggested</span>
              <span><i className="legend-line legend-committed" /> Committed</span>
            </div>
            <button
              className="button button-ghost fit-button"
              type="button"
              onClick={() => setFitMode((current) => !current)}
              aria-pressed={fitMode}
            >
              {fitMode ? 'Detail view' : 'Fit view'}
            </button>
          </div>

          <div className={`mesh-stage ${fitMode ? 'mesh-stage-fit' : ''} ${transportOpen ? '' : 'mesh-stage-complete'}`}>
            <div className="mesh-grid" aria-hidden="true" />
            <div className="mesh-line line-a" aria-hidden="true" />
            <div className="mesh-line line-b" aria-hidden="true" />
            <div className="mesh-line line-c" aria-hidden="true" />
            <div className="mesh-line line-d" aria-hidden="true" />
            <div className="mesh-line line-e" aria-hidden="true" />
            <div className="mesh-line line-f" aria-hidden="true" />

            <MeshNode className="node-goal" eyebrow="Goal" title="Career Night" meta="Thursday · 6–8 PM" status={`${summary.readiness}% ready`} selected={selectedGraphNode?.title === 'Career Night'} onSelect={() => setSelectedGraphNode({ eyebrow: 'Goal', title: 'Career Night', meta: goal.description, status: `${summary.readiness}% ready` })} />
            <MeshNode className="node-venue" eyebrow="Task" title={venue.label} meta="Accessible · 60 seats" status="covered" selected={selectedGraphNode?.title === venue.label} onSelect={() => setSelectedGraphNode({ eyebrow: 'Task', title: venue.label, meta: `Assigned to ${ownersForTask(venue)} · step-free capacity for 60`, status: venue.status })} />
            <MeshNode className="node-speakers" eyebrow="Task" title="Speakers" meta="2 of 2 matched" status="covered" selected={selectedGraphNode?.title === 'Speakers'} onSelect={() => setSelectedGraphNode({ eyebrow: 'Task group', title: 'Speakers', meta: 'Aisha leads interview practice; Dev runs the resume clinic.', status: '2 of 2 covered' })} />
            <MeshNode className="node-av" eyebrow="Task" title={av.label} meta="Projector + adapter" status={transportOpen ? 'review' : 'covered'} selected={selectedGraphNode?.title === av.label} onSelect={() => setSelectedGraphNode({ eyebrow: 'Task', title: av.label, meta: `Assigned to ${ownersForTask(av)} · depends on equipment pickup`, status: transportOpen ? 'dependency gap' : 'covered' })} />
            <MeshNode className="node-refreshments" eyebrow="Task" title={refreshments.label} meta="$120 · 50 snack packs" status="covered" selected={selectedGraphNode?.title === refreshments.label} onSelect={() => setSelectedGraphNode({ eyebrow: 'Task', title: refreshments.label, meta: `Assigned to ${ownersForTask(refreshments)} · nut-free packs with ingredient labels`, status: refreshments.status })} />
            <MeshNode className="node-jordan" eyebrow="Contributor" title="Jordan" meta="Community room" status="suggested" selected={selectedGraphNode?.title === 'Jordan'} onSelect={() => setSelectedGraphNode({ eyebrow: 'Contributor', title: 'Jordan', meta: 'Offers the step-free Riverside Community Hub for 60 people.', status: 'available' })} />
            <MeshNode className="node-maya" eyebrow="Contributor" title="Maya" meta="Projector" status="suggested" selected={selectedGraphNode?.title === 'Maya'} onSelect={() => setSelectedGraphNode({ eyebrow: 'Contributor', title: 'Maya', meta: 'Offers a projector, HDMI adapter, cable, and power lead.', status: 'available' })} />
            {transportOpen ? (
              <article className="mesh-gap node-gap">
                <span aria-hidden="true">+</span>
                <strong>1 open gap</strong>
                <small>Equipment pickup</small>
              </article>
            ) : (
              <article className="mesh-gap mesh-gap-resolved node-gap">
                <span aria-hidden="true">✓</span>
                <strong>Gap covered</strong>
                <small>Carlos · equipment pickup</small>
              </article>
            )}

            <div className="agent-presence" role="status">
              <span className="agent-spark" aria-hidden="true">✦</span>
              <span><strong>Shared state is version-safe</strong><small>UI actions and future tools use one plan model</small></span>
            </div>

            {selectedGraphNode ? (
              <aside className="graph-selection" aria-live="polite">
                <button type="button" onClick={() => setSelectedGraphNode(null)} aria-label="Close graph detail">×</button>
                <span className="eyebrow">{selectedGraphNode.eyebrow}</span>
                <strong>{selectedGraphNode.title}</strong>
                <p>{selectedGraphNode.meta}</p>
                <small>Status · {selectedGraphNode.status}</small>
              </aside>
            ) : null}
          </div>

          <div className="agent-prompt">
            <span className="prompt-icon" aria-hidden="true">✦</span>
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
              <div><small>Risk</small><strong className={summary.risk === 'Medium' ? 'risk-medium' : 'risk-low'}><StatusDot tone={summary.risk === 'Medium' ? 'warning' : 'ready'} /> {summary.risk}</strong></div>
            </div>
            <button className="button button-inspector" type="button" onClick={() => openInspector('overview')}>
              Open plan inspector <span aria-hidden="true">→</span>
            </button>
          </section>

          <section className={`gap-card ${transportOpen ? '' : 'gap-card-resolved'}`}>
            <div className="gap-icon" aria-hidden="true">{transportOpen ? '!' : '✓'}</div>
            <div>
              <span className="eyebrow">{transportOpen ? 'Needs attention' : 'Foundation mutation complete'}</span>
              <h2>{transportOpen ? 'Equipment pickup has no owner' : 'Equipment pickup is covered'}</h2>
              <p>{transportOpen ? 'The projector must arrive before setup begins at 5:30 PM.' : 'Carlos is suggested without changing any locked constraint.'}</p>
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
                      <strong>Carlos is available</strong>
                      <small>Transport after 4:30 PM · capability and schedule match</small>
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
              ) : (
                <button className="text-button" type="button" onClick={reset}>Reset and test again <span aria-hidden="true">→</span></button>
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
                  <span className={`activity-dot activity-${item.actor === 'agent' ? 'agent' : 'human'}`} aria-hidden="true" />
                  <span><strong>{item.actor === 'human' ? 'You' : item.actor === 'agent' ? 'Agent' : 'System'}</strong><small>{item.action}</small></span>
                  <time>v{item.planVersionAfter ?? plan.version}</time>
                </li>
              ))}
            </ol>
            <button className="text-button" type="button" onClick={() => openInspector('history')}>View full history <span aria-hidden="true">→</span></button>
          </section>
        </aside>
      </section>

      {inspectorOpen ? (
        <div className="inspector-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setInspectorOpen(false);
        }}>
          <section className="inspector-drawer" role="dialog" aria-modal="true" aria-labelledby="inspector-title">
            <header className="inspector-header">
              <div>
                <span className="eyebrow">Plan inspector · Draft v{plan.version}</span>
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
                      <p>{validation.blockingCount ? 'Resolve the open capability gap, then validate this version again.' : 'This draft is ready for the commitment-request phase. It is not publishable yet.'}</p>
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
              <span><StatusDot tone={validation.blockingCount ? 'warning' : 'ready'} /> {validation.blockingCount ? 'Human workflow has one blocker' : 'Human-interface phase exit gate passed'}</span>
              <small>{validation.blockingCount ? 'Preview and apply the Carlos revision.' : 'Next phase: request participant commitments through WebMCP.'}</small>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
