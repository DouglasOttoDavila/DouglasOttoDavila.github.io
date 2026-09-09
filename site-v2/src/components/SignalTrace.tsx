import { motion, MotionConfig, useReducedMotion } from 'motion/react';
import { useState } from 'react';

const stages = [
  {
    id: 'requirement',
    index: '1',
    label: 'Requirement',
    tone: 'blue',
    title: 'Password reset',
    body: 'A registered user can request a secure reset link that expires after 15 minutes.',
    foot: 'REQ-1047'
  },
  {
    id: 'risk',
    index: '2',
    label: 'Risk',
    tone: 'amber',
    title: 'What could fail?',
    body: 'Account enumeration, token reuse, weak expiry behavior, and ambiguous identity rules.',
    foot: 'Review intent'
  },
  {
    id: 'test',
    index: '3',
    label: 'Test',
    tone: 'blue',
    title: 'Risk-aware coverage',
    body: 'Positive, negative, security, expiry, single-use, and end-to-end scenarios.',
    foot: '6 test groups'
  },
  {
    id: 'evidence',
    index: '4',
    label: 'Verified evidence',
    tone: 'teal',
    title: 'Decision-ready',
    body: 'Scope clarified, tests traceable, execution captured, and remaining risk visible.',
    foot: 'Evidence linked'
  }
] as const;

export default function SignalTrace() {
  const [active, setActive] = useState(0);
  const reduceMotion = useReducedMotion();

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
      <div className="signal-system" aria-label="A requirement moving through quality analysis into verified evidence">
        <div className="signal-stages" role="group" aria-label="Quality workflow stages">
          {stages.map((stage, index) => (
            <motion.button
              key={stage.id}
              className={`signal-stage tone-${stage.tone} ${active === index ? 'is-active' : ''}`}
              type="button"
              aria-label={`${stage.index}. ${stage.label}: ${stage.title}`}
              aria-pressed={active === index}
              onClick={() => setActive(index)}
              onFocus={() => setActive(index)}
              initial={reduceMotion ? false : { opacity: 0.8, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : index * 0.08 }}
            >
              <span className="signal-stage-label"><b>{stage.index}.</b> {stage.label}</span>
              <span className="signal-stage-copy">
                <strong>{stage.title}</strong>
                <span>{stage.body}</span>
              </span>
              <span className="signal-stage-foot">{stage.foot}</span>
            </motion.button>
          ))}
        </div>
        <div className="signal-rail" aria-hidden="true">
          <motion.span
            className="signal-progress"
            animate={{ scaleX: (active + 1) / stages.length }}
            style={{ transformOrigin: 'left' }}
          />
          {stages.map((stage, index) => (
            <span
              key={stage.id}
              className={`signal-node ${index <= active ? 'is-reached' : ''}`}
              style={{ left: `${(index / (stages.length - 1)) * 100}%` }}
            />
          ))}
        </div>
        <p className="signal-caption" aria-live="polite">
          <span>{stages[active].label}</span>
          Quality advances when each decision leaves evidence for the next one.
        </p>
      </div>
    </MotionConfig>
  );
}
