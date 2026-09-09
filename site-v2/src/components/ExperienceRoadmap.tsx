import { useState, type CSSProperties } from 'react';

type Outcome = {
  value: string;
  label: string;
  verified: true;
};

export type ExperienceMilestone = {
  id: string;
  sequence: number;
  role: string;
  company: string;
  location: string;
  start: string;
  end: string;
  summary: string;
  responsibilities: string[];
  outcomes: Outcome[];
  skills: string[];
  stage: 'foundation' | 'automation' | 'ai';
};

type RoadmapStyle = CSSProperties & {
  '--roadmap-index': number;
};

export default function ExperienceRoadmap({ roles }: { roles: ExperienceMilestone[] }) {
  const [selectedId, setSelectedId] = useState(roles.find((role) => role.id === '2023-qa-lead')?.id ?? roles.at(-1)?.id ?? '');

  if (roles.length === 0) {
    return <p className="career-roadmap-empty">Experience milestones are temporarily unavailable.</p>;
  }

  return (
    <div className="career-roadmap" data-selected={selectedId}>
      <div className="career-roadmap-coordinates" aria-hidden="true">
        <span>growth</span>
      </div>

      <svg className="career-roadmap-path" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="career-signal" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#38d7c5" />
            <stop offset="0.52" stopColor="#66a4ff" />
            <stop offset="1" stopColor="#2e7dff" />
          </linearGradient>
        </defs>
        <path className="career-roadmap-path-shadow" d="M55 530 C95 430 165 485 215 398 S345 370 420 310 S560 330 645 226 S795 232 900 78" />
        <path className="career-roadmap-path-line" d="M55 530 C95 430 165 485 215 398 S345 370 420 310 S560 330 645 226 S795 232 900 78" />
      </svg>

      <ol className="career-milestones" aria-label="Career milestones, oldest to newest">
        {roles.map((role, index) => {
          const isSelected = selectedId === role.id;
          const detailId = `experience-detail-${role.id}`;
          const time = `${role.start}–${role.end}`;

          return (
            <li
              className={`career-milestone stage-${role.stage} ${isSelected ? 'is-selected' : ''}`}
              key={role.id}
              style={{ '--roadmap-index': index + 1 } as RoadmapStyle}
            >
              <button
                className="career-milestone-trigger"
                type="button"
                aria-expanded={isSelected}
                aria-controls={detailId}
                onPointerEnter={() => setSelectedId(role.id)}
                onFocus={() => setSelectedId(role.id)}
                onClick={() => setSelectedId(role.id)}
              >
                <span className="career-node" aria-hidden="true"><i /></span>
                <span className="career-milestone-copy">
                  <strong>{role.id === '2024-sdet' ? 'SDET' : role.id === '2020-qa-engineer' ? 'QA Engineer' : role.role}</strong>
                  <span>{time}</span>
                </span>
                {role.end === 'Present' && <em>Current</em>}
              </button>

              <article
                className="career-inspector"
                id={detailId}
                hidden={!isSelected}
                tabIndex={isSelected ? 0 : -1}
                aria-label={`${role.role} details`}
                aria-live={isSelected ? 'polite' : 'off'}
              >
                  <div className="career-inspector-meta">
                    <span className="career-inspector-company">{role.company}</span>
                    <span className="career-inspector-location">{role.location}</span>
                    <span className="career-inspector-date">{time}</span>
                  </div>
                  <h2>{role.role}</h2>
                  <p>{role.summary}</p>

                  {role.outcomes.length > 0 && (
                    <dl className="career-outcomes" aria-label="Verified outcomes">
                      {role.outcomes.map((outcome, outcomeIndex) => (
                        <div key={`${outcomeIndex}-${outcome.value}-${outcome.label}`}>
                          <dt>{outcome.value}</dt>
                          <dd>{outcome.label}<span>Verified evidence</span></dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  <ul className="career-responsibilities">
                    {role.responsibilities.map((responsibility, responsibilityIndex) => (
                      <li key={`${responsibilityIndex}-${responsibility}`}>{responsibility}</li>
                    ))}
                  </ul>

                  <ul className="career-skills" aria-label="Skills and tools">
                    {role.skills.map((skill, skillIndex) => <li key={`${skillIndex}-${skill}`}>{skill}</li>)}
                  </ul>
              </article>
            </li>
          );
        })}
      </ol>
      <p className="career-roadmap-hint">Hover, focus, or tap a milestone to inspect its evidence.</p>
    </div>
  );
}
