import type { KeyId } from "../key";
import type { CompiledModel } from "../model";
import type { ValueDelta } from "../overlay/diff-results";
import type { OverlayEvaluationResult } from "../overlay/evaluate-overlay";

export type ExplainedDependency = {
  readonly key: KeyId;
  readonly label?: string;
  readonly kind?: string;
  readonly changed: boolean;
};

export type ExplainedDelta = {
  readonly delta: ValueDelta;
  readonly label?: string;
  readonly kind?: string;
  readonly reason?: {
    readonly ruleLabel?: string;
    readonly dependencies: readonly ExplainedDependency[];
  };
};

export function explainDiffs(
  model: CompiledModel,
  result: OverlayEvaluationResult,
  deltas: readonly ValueDelta[],
): readonly ExplainedDelta[] {
  const changedKeys = new Set(deltas.map((d) => d.key));
  const traceByTarget = new Map(result.trace.map((step) => [step.target, step]));

  const resolveLabel = (key: KeyId): string | undefined => {
    const step = traceByTarget.get(key);
    if (step) {
      return step.ruleMeta?.label ?? step.keyMeta?.label;
    }
    return model?.keyMeta.get(key)?.label;
  };

  const resolveKind = (key: KeyId): string => {
    const step = traceByTarget.get(key);
    return step ? step.ruleKind : "input";
  };

  return deltas.map((delta) => {
    const step = traceByTarget.get(delta.key);
    const deltaLabel = resolveLabel(delta.key);
    const deltaKind = resolveKind(delta.key);

    if (!step) {
      return {
        delta,
        label: deltaLabel,
        kind: deltaKind,
      };
    }

    const dependencies: ExplainedDependency[] = step.deps.map((depKey) => ({
      key: depKey,
      label: resolveLabel(depKey),
      kind: resolveKind(depKey),
      changed: changedKeys.has(depKey),
    }));

    return {
      delta,
      label: deltaLabel,
      kind: deltaKind,
      reason: {
        ruleLabel: step.ruleMeta?.label,
        dependencies,
      },
    };
  });
}

export type DiffTreeOptions = {
  readonly showLabels?: boolean;
  readonly showKind?: boolean;
  readonly showDeps?: boolean;
};

const defaultDiffTreeOptions: Required<DiffTreeOptions> = {
  showLabels: true,
  showKind: true,
  showDeps: true,
};

function formatDeltaLabel(explained: ExplainedDelta, opts: Required<DiffTreeOptions>): string {
  const { delta, reason } = explained;
  let label = delta.key as string;

  if (opts.showLabels && explained.label && explained.label !== delta.key) {
    label += ` -> ${explained.label}`;
  }

  if (opts.showKind && explained.kind) {
    label += ` [${explained.kind}]`;
  }

  switch (delta.kind) {
    case "changed":
      label += `: ${delta.before} \u2192 ${delta.after}`;
      break;
    case "added":
      label += `: ${delta.after} [added]`;
      break;
    case "removed":
      label += `: ${delta.before} [removed]`;
      break;
  }

  if (opts.showLabels && reason?.ruleLabel && reason.ruleLabel !== explained.label) {
    label += ` (${reason.ruleLabel})`;
  }

  return label;
}

function formatDepLabel(dep: ExplainedDependency, opts: Required<DiffTreeOptions>): string {
  let label = dep.key as string;

  if (opts.showLabels && dep.label && dep.label !== dep.key) {
    label += ` -> ${dep.label}`;
  }

  if (opts.showKind && dep.kind) {
    label += ` [${dep.kind}]`;
  }

  label += dep.changed ? " (changed)" : " (unchanged)";

  return label;
}

export function diffToAsciiTree(
  deltas: readonly ExplainedDelta[],
  options?: DiffTreeOptions,
): string {
  if (deltas.length === 0) {
    return "";
  }

  const opts = { ...defaultDiffTreeOptions, ...options };
  const lines: string[] = [];

  for (let i = 0; i < deltas.length; i++) {
    const explained = deltas[i];
    const isLast = i === deltas.length - 1;
    const connector = isLast ? "└── " : "├── ";
    lines.push(`${connector}${formatDeltaLabel(explained, opts)}`);

    const deps = explained.reason?.dependencies ?? [];
    if (opts.showDeps && deps.length > 0) {
      const childPrefix = isLast ? "    " : "│   ";
      for (let j = 0; j < deps.length; j++) {
        const dep = deps[j];
        const isLastDep = j === deps.length - 1;
        const childConnector = isLastDep ? "└── " : "├── ";
        lines.push(`${childPrefix}${childConnector}${formatDepLabel(dep, opts)}`);
      }
    }
  }

  return lines.join("\n");
}

const sanitizeMermaidId = (value: string): string => value.replace(/[^a-zA-Z0-9_]/g, "_");

const escapeMermaidLabel = (value: string): string => value.replace(/"/g, '\\"');

function formatDeltaMermaidLabel(explained: ExplainedDelta): string {
  const { delta, reason } = explained;
  let label = explained.label ?? (delta.key as string);

  switch (delta.kind) {
    case "changed":
      label += `<br/>${String(delta.before)} \u2192 ${String(delta.after)}`;
      break;
    case "added":
      label += `<br/>+ ${String(delta.after)}`;
      break;
    case "removed":
      label += `<br/>- ${String(delta.before)}`;
      break;
  }

  if (explained.kind) {
    label += `<br/>[${explained.kind}]`;
  }

  if (reason?.ruleLabel && reason.ruleLabel !== explained.label) {
    label += `<br/>${reason.ruleLabel}`;
  }

  return escapeMermaidLabel(label);
}

export function diffToMermaid(deltas: readonly ExplainedDelta[]): string {
  if (deltas.length === 0) {
    return "graph TD";
  }

  const lines: string[] = ["graph TD"];
  const definedNodes = new Set<string>();

  for (const explained of deltas) {
    const nodeId = sanitizeMermaidId(explained.delta.key);
    definedNodes.add(explained.delta.key);
    lines.push(`    ${nodeId}["${formatDeltaMermaidLabel(explained)}"]`);
  }

  for (const explained of deltas) {
    const { delta, reason } = explained;
    if (!reason?.dependencies) continue;

    const targetId = sanitizeMermaidId(delta.key);
    for (const dep of reason.dependencies) {
      const depId = sanitizeMermaidId(dep.key);
      if (!definedNodes.has(dep.key)) {
        const depLabel = dep.label ?? (dep.key as string);
        const depMermaidLabel = dep.kind ? `${depLabel}<br/>[${dep.kind}]` : depLabel;
        lines.push(`    ${depId}["${escapeMermaidLabel(depMermaidLabel)}"]`);
        definedNodes.add(dep.key);
      }
      const style = dep.changed ? "changed" : "unchanged";
      lines.push(`    ${depId} -->|${style}| ${targetId}`);
    }
  }

  return lines.join("\n");
}
