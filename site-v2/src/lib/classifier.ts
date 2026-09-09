// Extracted from SPARouter.setupNeuralTestSignalClassifier in js/main.js.
// Illustrative scoring rules, not a trained neural-network inference endpoint.
export type Signals = { retry: boolean; flip: number; duration: number; churn: number; keyword: string };
export const labels = { product_regression: 'Product regression', flaky_test: 'Flaky test', infra_issue: 'Infrastructure issue' };
export function classify(signals: Signals) {
  const retry = signals.retry ? 1 : 0;
  const flip = signals.flip;
  const duration = Math.max(0, Math.min(1, (signals.duration - 0.5) / 3.5));
  const churn = Math.max(0, Math.min(1, signals.churn / 40));
  const keyword = signals.keyword;
  const hidden = {
    pattern: Math.min(1, retry * 0.38 + flip * 0.48 + duration * 0.22),
    regression: Math.min(1, churn * 0.56 + (keyword === 'assertion' ? 0.34 : 0.08) + (1 - retry) * 0.16),
    environment: Math.min(1, duration * 0.44 + (['timeout', 'network', 'dependency'].includes(keyword) ? 0.34 : 0.04) + retry * 0.08)
  };
  const scores = {
    product_regression: hidden.regression * 2.5 + churn * 0.8 + (keyword === 'assertion' ? 0.75 : 0) - retry * 0.45,
    flaky_test: hidden.pattern * 2.25 + retry * 0.75 + flip * 0.5 - churn * 0.22,
    infra_issue: hidden.environment * 2.45 + duration * 0.55 + (['timeout', 'network', 'dependency'].includes(keyword) ? 0.5 : 0)
  };
  const max = Math.max(...Object.values(scores));
  const total = Object.values(scores).reduce((sum, value) => sum + Math.exp(value - max), 0);
  const probabilities = Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, Math.exp(value - max) / total])) as Record<keyof typeof labels, number>;
  const winner = (Object.keys(probabilities) as (keyof typeof labels)[]).sort((a, b) => probabilities[b] - probabilities[a])[0];
  const action = winner === 'product_regression' ? 'Open or link a defect with assertion evidence, changed files, request/response data, and the failing test history.' : winner === 'infra_issue' ? 'Attach runner logs and route to the CI, browser grid, dependency, or test environment owner before product escalation.' : 'Rerun once, inspect instability history, and quarantine the test if the pass/fail pattern repeats.';
  return { hidden, probabilities, winner, action };
}
