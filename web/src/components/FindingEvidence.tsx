import type { ValidationFinding } from '../types';

export function FindingEvidence({ finding }: { finding: ValidationFinding }) {
  return <pre className="vf-evidence-raw">{JSON.stringify(finding.evidence, null, 2)}</pre>;
}
