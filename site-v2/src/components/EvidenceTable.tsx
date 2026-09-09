import { useId, useRef, useState } from 'react';

const stages = [
  {
    id: 'requirement',
    label: 'Requirement',
    rows: [
      ['Input', 'As a registered user, I want to reset my password so that I can regain access.'],
      ['Ambiguity', 'Does “registered” include an account that has not verified its email address?'],
      ['Risk', 'Account enumeration and reusable reset links can expose customer accounts.'],
      ['Next action', 'Clarify identity rules, define expiry, and add negative and abuse-path coverage.']
    ]
  },
  {
    id: 'risks',
    label: 'Risks',
    rows: [
      ['Identity', 'The reset flow may reveal whether an email address belongs to an account.'],
      ['Token', 'A reset link that can be reused or does not expire creates an account-takeover path.'],
      ['Delivery', 'Delayed or duplicated email delivery can leave the user blocked or confused.'],
      ['Priority', 'Treat enumeration and token lifecycle as release-blocking security risks.']
    ]
  },
  {
    id: 'test-ideas',
    label: 'Test ideas',
    rows: [
      ['Happy path', 'A verified user receives a link, resets the password, and signs in with the new credential.'],
      ['Negative', 'Unknown and unverified accounts receive the same neutral response without leaking identity state.'],
      ['Security', 'Verify token expiry, single use, tamper resistance, and invalidation after a successful reset.'],
      ['Resilience', 'Exercise duplicate requests, delayed email delivery, rate limits, and interrupted sessions.']
    ]
  },
  {
    id: 'evidence',
    label: 'Evidence',
    rows: [
      ['Traceability', 'Each accepted risk maps to an automated or exploratory test with a stable identifier.'],
      ['Execution', 'The release record includes passing results for reset, expiry, reuse, and enumeration scenarios.'],
      ['Review', 'Security and product owners confirm the identity rules and residual-risk decision.'],
      ['Outcome', 'The team can explain what was verified, what remains uncertain, and why the release is acceptable.']
    ]
  }
] as const;

export default function EvidenceTable() {
  const instanceId = useId().replaceAll(':', '');
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeId, setActiveId] = useState<(typeof stages)[number]['id']>('requirement');

  const moveFocus = (nextIndex: number) => {
    const nextStage = stages[(nextIndex + stages.length) % stages.length];
    const normalizedIndex = (nextIndex + stages.length) % stages.length;
    const nextTab = tabRefs.current[normalizedIndex];
    const tabList = tabListRef.current;

    setActiveId(nextStage.id);
    nextTab?.focus({ preventScroll: true });

    if (nextTab && tabList) {
      const tabLeft = nextTab.offsetLeft;
      const tabRight = tabLeft + nextTab.offsetWidth;

      if (tabLeft < tabList.scrollLeft) tabList.scrollLeft = tabLeft;
      if (tabRight > tabList.scrollLeft + tabList.clientWidth) {
        tabList.scrollLeft = tabRight - tabList.clientWidth;
      }
    }
  };

  return (
    <div
      className="evidence-table"
      role="region"
      aria-label="Illustrative requirement review"
      aria-describedby={`${instanceId}-evidence-disclaimer`}
    >
      <div ref={tabListRef} className="evidence-tabs" role="tablist" aria-label="Requirement review stages">
        {stages.map((stage, index) => (
          <button
            key={stage.id}
            ref={(element) => { tabRefs.current[index] = element; }}
            id={`${instanceId}-evidence-tab-${stage.id}`}
            className={stage.id === activeId ? 'is-active' : ''}
            type="button"
            role="tab"
            aria-selected={stage.id === activeId}
            aria-controls={`${instanceId}-evidence-panel-${stage.id}`}
            tabIndex={stage.id === activeId ? 0 : -1}
            onClick={() => setActiveId(stage.id)}
            onFocus={() => setActiveId(stage.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                moveFocus(index + 1);
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                moveFocus(index - 1);
              } else if (event.key === 'Home') {
                event.preventDefault();
                moveFocus(0);
              } else if (event.key === 'End') {
                event.preventDefault();
                moveFocus(stages.length - 1);
              }
            }}
          >
            {stage.label}
          </button>
        ))}
      </div>
      <div className="evidence-panels">
        {stages.map((stage) => {
          const isActive = stage.id === activeId;

          return (
            <div
              key={stage.id}
              id={`${instanceId}-evidence-panel-${stage.id}`}
              className={`evidence-panel ${isActive ? 'is-active' : ''}`}
              role="tabpanel"
              aria-labelledby={`${instanceId}-evidence-tab-${stage.id}`}
              aria-hidden={!isActive}
              tabIndex={isActive ? 0 : -1}
            >
              <dl>
                {stage.rows.map(([term, description]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
      <p id={`${instanceId}-evidence-disclaimer`} className="illustrative-label">
        Illustrative analysis · not a client artifact
      </p>
    </div>
  );
}
