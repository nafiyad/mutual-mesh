'use client';

import { useState } from 'react';

const contributions = [
  { initials: 'JR', name: 'Jordan', detail: 'Accessible room · 60 seats', tone: 'teal' },
  { initials: 'AS', name: 'Aisha', detail: 'Interview speaker · 6–7 PM', tone: 'amber' },
  { initials: 'MK', name: 'Maya', detail: 'Projector + HDMI adapter', tone: 'blue' },
  { initials: 'CL', name: 'Carlos', detail: 'Equipment transport · after 4:30', tone: 'teal' },
  { initials: 'PN', name: 'Priya', detail: 'Event poster · 36h notice', tone: 'amber' },
  { initials: 'NR', name: 'Noor', detail: 'Host + accessibility check', tone: 'blue' },
];

const agentPrompt = 'Use available contributions to close the final gap. Keep every locked constraint.';

const activity = [
  { actor: 'Agent', action: 'Validated draft plan', time: 'Just now', tone: 'agent' },
  { actor: 'You', action: 'Locked accessibility', time: '2 min ago', tone: 'human' },
  { actor: 'Agent', action: 'Matched 8 contributions', time: '3 min ago', tone: 'agent' },
];

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

export default function Home() {
  const [showMoreContributions, setShowMoreContributions] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [fitMode, setFitMode] = useState(false);
  const [copied, setCopied] = useState(false);

  const resetPreview = () => {
    setShowMoreContributions(false);
    setShowAlternatives(false);
    setFitMode(false);
    setCopied(false);
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(agentPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

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
          <span className="tool-status"><StatusDot /> WebMCP design · 9 tools</span>
          <button className="button button-ghost" type="button" onClick={resetPreview}>Reset preview</button>
          <button className="avatar-button" type="button" aria-label="Open coordinator profile">RM</button>
        </div>
      </header>

      <section className="workspace" id="main-canvas">
        <aside className="left-rail" aria-label="Goal and available contributions">
          <section className="panel goal-panel">
            <div className="panel-heading">
              <span className="eyebrow">Active goal</span>
              <span className="version-pill">Draft v3</span>
            </div>
            <h1>Host an accessible career night for 50 students</h1>
            <p className="goal-summary">A free, practical evening built from the people and resources already in this community.</p>

            <dl className="goal-facts">
              <div><dt>When</dt><dd>Thu · 6–8 PM</dd></div>
              <div><dt>Budget</dt><dd>$150 maximum</dd></div>
              <div><dt>Attendance</dt><dd>50 students</dd></div>
            </dl>

            <div className="constraint-heading">
              <span>Locked constraints</span>
              <span className="count-badge">3</span>
            </div>
            <div className="constraint-list">
              <span className="constraint-chip"><span aria-hidden="true">◆</span> Wheelchair accessible</span>
              <span className="constraint-chip"><span aria-hidden="true">◆</span> Max 2 tasks / person</span>
              <span className="constraint-chip"><span aria-hidden="true">◆</span> Human approval required</span>
            </div>
          </section>

          <section className="panel contribution-panel">
            <div className="section-title-row">
              <div>
                <span className="eyebrow">Available now</span>
                <h2>Community contributions</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Add a contribution">+</button>
            </div>
            <div className="contribution-list">
              {contributions.slice(0, showMoreContributions ? 6 : 3).map((contribution) => (
                <article className="contribution" key={contribution.name}>
                  <span className={`contribution-avatar avatar-${contribution.tone}`}>{contribution.initials}</span>
                  <span><strong>{contribution.name}</strong><small>{contribution.detail}</small></span>
                  <span className="availability" aria-label="Available" />
                </article>
              ))}
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => setShowMoreContributions((current) => !current)}
              aria-expanded={showMoreContributions}
            >
              {showMoreContributions ? 'Show fewer contributions' : 'View more contributions'} <span aria-hidden="true">→</span>
            </button>
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

          <div className={`mesh-stage ${fitMode ? 'mesh-stage-fit' : ''}`}>
            <div className="mesh-grid" aria-hidden="true" />
            <div className="mesh-line line-a" aria-hidden="true" />
            <div className="mesh-line line-b" aria-hidden="true" />
            <div className="mesh-line line-c" aria-hidden="true" />
            <div className="mesh-line line-d" aria-hidden="true" />
            <div className="mesh-line line-e" aria-hidden="true" />
            <div className="mesh-line line-f" aria-hidden="true" />

            <MeshNode className="node-goal" eyebrow="Goal" title="Career Night" meta="Thursday · 6–8 PM" status="87% ready" />
            <MeshNode className="node-venue" eyebrow="Task" title="Venue" meta="Accessible · 60 seats" status="covered" />
            <MeshNode className="node-speakers" eyebrow="Task" title="Speakers" meta="2 of 2 matched" status="covered" />
            <MeshNode className="node-av" eyebrow="Task" title="Presentation AV" meta="Projector + adapter" status="review" />
            <MeshNode className="node-refreshments" eyebrow="Task" title="Refreshments" meta="$120 · 50 snack packs" status="covered" />
            <MeshNode className="node-jordan" eyebrow="Contributor" title="Jordan" meta="Community room" status="suggested" />
            <MeshNode className="node-maya" eyebrow="Contributor" title="Maya" meta="Projector" status="suggested" />
            <article className="mesh-gap node-gap">
              <span aria-hidden="true">+</span>
              <strong>1 open gap</strong>
              <small>Equipment pickup</small>
            </article>

            <div className="agent-presence" role="status">
              <span className="agent-spark" aria-hidden="true">✦</span>
              <span><strong>Agent checked this plan</strong><small>Budget, capacity, access & workload</small></span>
            </div>
          </div>

          <div className="agent-prompt">
            <span className="prompt-icon" aria-hidden="true">✦</span>
            <div>
              <span className="eyebrow">Try it with your agent</span>
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
              <span className="trend-pill">+24%</span>
            </div>
            <div className="readiness-score"><strong>87</strong><span>%</span></div>
            <div className="progress-track" aria-label="Plan readiness: 87 percent"><span style={{ width: '87%' }} /></div>
            <div className="metric-grid">
              <div><small>Budget</small><strong>$120 / $150</strong></div>
              <div><small>Coverage</small><strong>7 / 8 tasks</strong></div>
              <div><small>Commitments</small><strong>0 requested</strong></div>
              <div><small>Risk</small><strong className="risk-medium"><StatusDot tone="warning" /> Medium</strong></div>
            </div>
          </section>

          <section className="gap-card">
            <div className="gap-icon" aria-hidden="true">!</div>
            <div>
              <span className="eyebrow">Needs attention</span>
              <h2>Equipment pickup has no owner</h2>
              <p>The projector must arrive before setup begins at 5:30 PM.</p>
              <button
                className="text-button"
                type="button"
                onClick={() => setShowAlternatives((current) => !current)}
                aria-expanded={showAlternatives}
              >
                {showAlternatives ? 'Hide alternatives' : 'Show alternatives'} <span aria-hidden="true">→</span>
              </button>
              {showAlternatives ? (
                <div className="alternative-card" role="status">
                  <strong>Carlos is available</strong>
                  <small>Transport after 4:30 PM · no schedule conflict</small>
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel activity-panel">
            <div className="section-title-row">
              <div><span className="eyebrow">Shared history</span><h2>Recent activity</h2></div>
              <button className="icon-button icon-button-small" type="button" aria-label="Open full activity log">↗</button>
            </div>
            <ol className="activity-list">
              {activity.map((item) => (
                <li key={`${item.actor}-${item.action}`}>
                  <span className={`activity-dot activity-${item.tone}`} aria-hidden="true" />
                  <span><strong>{item.actor}</strong><small>{item.action}</small></span>
                  <time>{item.time}</time>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </section>
    </main>
  );
}
