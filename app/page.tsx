'use client';

import { useEffect, useMemo, useState } from 'react';
import { calculatePlanSummary } from '@/domain/scoring';
import type { Contribution, PlanTask, ScenarioState } from '@/domain/types';
import { useMutualMeshStore } from '@/store/useMutualMeshStore';

const agentPrompt = 'Use available contributions to close the final gap. Keep every locked constraint.';
const tones = ['teal', 'amber', 'blue'] as const;

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
}: {
  className: string;
  eyebrow: string;
  title: string;
  meta: string;
  status?: string;
}) {
  return (
    <article className={`mesh-node ${className}`}>
      <div className="mesh-node-topline">
        <span>{eyebrow}</span>
        {status ? <span className="mesh-node-status">{status}</span> : null}
      </div>
      <strong>{title}</strong>
      <small>{meta}</small>
    </article>
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

  useEffect(() => {
    void useMutualMeshStore.persist.rehydrate();
  }, []);

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
  const participantMap = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  );
  const filteredContributions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return contributions;
    return contributions.filter((contribution) => {
      const participant = participantMap.get(contribution.participantId);
      return [participant?.displayName, contribution.label, contribution.capability]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [contributions, participantMap, searchQuery]);

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
    setActionMessage('Demo reset to the deterministic starting state.');
  };

  const closeTransportGap = () => {
    const result = assignContribution('task-transport', 'contribution-transport', plan.version);
    if (result.ok) {
      setShowAlternatives(false);
      setActionMessage('Carlos is now suggested for equipment pickup. Plan advanced to version 4.');
      return;
    }
    setActionMessage(`${result.error.message} ${result.error.recoveryHint}`);
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(agentPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const venue = taskByKey(plan.tasks, 'venue');
  const av = taskByKey(plan.tasks, 'av');
  const refreshments = taskByKey(plan.tasks, 'refreshments');

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
            {!searchQuery && filteredContributions.length > 3 ? (
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

            <MeshNode className="node-goal" eyebrow="Goal" title="Career Night" meta="Thursday · 6–8 PM" status={`${summary.readiness}% ready`} />
            <MeshNode className="node-venue" eyebrow="Task" title={venue.label} meta="Accessible · 60 seats" status="covered" />
            <MeshNode className="node-speakers" eyebrow="Task" title="Speakers" meta="2 of 2 matched" status="covered" />
            <MeshNode className="node-av" eyebrow="Task" title={av.label} meta="Projector + adapter" status={transportOpen ? 'review' : 'covered'} />
            <MeshNode className="node-refreshments" eyebrow="Task" title={refreshments.label} meta="$120 · 50 snack packs" status="covered" />
            <MeshNode className="node-jordan" eyebrow="Contributor" title="Jordan" meta="Community room" status="suggested" />
            <MeshNode className="node-maya" eyebrow="Contributor" title="Maya" meta="Projector" status="suggested" />
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
                      <button className="button button-primary" type="button" onClick={closeTransportGap}>Suggest Carlos</button>
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
              <span className="inventory-count">{activity.length}</span>
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
          </section>
        </aside>
      </section>
    </main>
  );
}
