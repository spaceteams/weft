import type { TraceStep } from "../evaluate/trace-step";
import type { KeyId } from "../key";
import type { CompiledModel } from "../model";

export type ExplainNode = {
  readonly id: KeyId;
  readonly name?: string;
  readonly kind?: string;
  readonly tags?: readonly string[];
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly deps?: Readonly<Record<KeyId, ExplainNode>>;
};

export function explainTraceTarget(
  model: CompiledModel,
  trace: readonly TraceStep[],
  target: KeyId,
): ExplainNode {
  const stepByTarget = new Map(trace.map((s) => [s.target, s]));

  function build(key: string, parentStep?: TraceStep): ExplainNode {
    const step = stepByTarget.get(key);
    if (!step) {
      const keyMeta = model.keyMeta.get(key);
      return {
        id: key,
        name: keyMeta?.label ?? key,
        kind: "input",
        meta: parentStep
          ? { value: parentStep.inputs[key], ...keyMeta }
          : keyMeta
            ? { ...keyMeta }
            : undefined,
      };
    }

    const deps: Record<string, ExplainNode> = {};
    for (const dep of step.deps) {
      deps[dep] = build(dep, step);
    }

    return {
      id: step.target,
      name: step.ruleMeta?.label ?? step.keyMeta?.label ?? step.target,
      kind: step.ruleKind,
      meta: {
        ruleMeta: step.ruleMeta,
        keyMeta: step.keyMeta,
        output: step.output,
        inputs: step.inputs,
      },
      deps,
    };
  }

  return build(target);
}

export function explainModelTarget(model: CompiledModel, target: string): ExplainNode {
  function build(key: string): ExplainNode {
    const rule = model.ruleByTarget.get(key);
    const keyMeta = model.keyMeta.get(key);

    if (!rule) {
      return {
        id: key,
        name: keyMeta?.label ?? key,
        kind: "input",
        meta: keyMeta ? { ...keyMeta } : undefined,
      };
    }

    const deps: Record<string, ExplainNode> = {};
    for (const dep of model.depsByTarget.get(key) ?? []) {
      deps[dep] = build(dep);
    }

    const ruleMeta = model.ruleMeta.get(key);
    return {
      id: key,
      name: ruleMeta?.label ?? key,
      kind: rule.kind,
      meta: {
        ...(keyMeta ?? {}),
        ...(ruleMeta ?? {}),
      },
      deps,
    };
  }

  return build(target);
}

const formatExplainLabel = (node: ExplainNode, showMeta: boolean, edgeLabel?: string): string => {
  let label = edgeLabel ?? node.name ?? node.id;

  if (edgeLabel && node.name && edgeLabel !== node.name) {
    label += ` -> ${node.name}`;
  }

  if (node.kind) {
    label += ` [${node.kind}]`;
  }

  if (showMeta && node.meta?.["output"] !== undefined) {
    label += ` = ${String(node.meta["output"])}`;
  }

  if (showMeta && node.meta?.["value"] !== undefined) {
    label += ` = ${String(node.meta["value"])}`;
  }

  if (showMeta && node.meta?.["ruleLabel"]) {
    label += ` "${String(node.meta["ruleLabel"])}"`;
  }

  return label;
};

const sanitizeMermaidId = (value: string): string => value.replace(/[^a-zA-Z0-9_]/g, "_");

const escapeMermaidLabel = (value: string): string => value.replace(/"/g, "&quot;");

const formatNodeMermaidLabel = (
  node: ExplainNode,
  showMeta: boolean,
  fallbackName: string,
): string => {
  let label = node.name ?? fallbackName;

  const metaParts: string[] = [];
  if (node.kind) metaParts.push(node.kind);
  if (node.tags?.length) metaParts.push(node.tags.join(", "));

  if (metaParts.length > 0) {
    label += `<br/>[${metaParts.join(" | ")}]`;
  }

  if (showMeta) {
    if (node.meta?.["output"] !== undefined) {
      label += `<br/>= ${String(node.meta["output"])}`;
    }
    if (node.meta?.["value"] !== undefined) {
      label += `<br/>= ${String(node.meta["value"])}`;
    }
  }

  return escapeMermaidLabel(label);
};

const collectNodeMermaidLines = (
  node: ExplainNode,
  nodeId: string,
  showMeta: boolean,
  fallbackName: string,
): string[] => {
  const lines: string[] = [];

  lines.push(`    ${nodeId}["${formatNodeMermaidLabel(node, showMeta, fallbackName)}"]`);

  const deps = Object.entries(node.deps ?? {});
  deps.forEach(([key, dep], index) => {
    const childBase = dep.name ?? key ?? `node_${index}`;
    const childId = sanitizeMermaidId(`${nodeId}__${key}__${childBase}`);

    lines.push(`    ${nodeId} -->|${escapeMermaidLabel(key)}| ${childId}`);
    lines.push(...collectNodeMermaidLines(dep, childId, showMeta, key));
  });

  return lines;
};

export const nodeToMermaid = (node: ExplainNode, showMeta = false): string => {
  const rootName = node.name ?? node.id;
  const rootId = sanitizeMermaidId(rootName);

  return ["graph TD", ...collectNodeMermaidLines(node, rootId, showMeta, rootName)].join("\n");
};

export const nodeToAsciiTree = (
  node: ExplainNode,
  prefix = "",
  isLast = true,
  showMeta = false,
  edgeLabel?: string,
): string => {
  const connector = isLast ? "└── " : "├── ";
  const line = `${prefix}${connector}${formatExplainLabel(node, showMeta, edgeLabel ?? node.id)}`;

  const deps = Object.entries(node.deps ?? {});
  if (deps.length === 0) {
    return line;
  }

  const childPrefix = prefix + (isLast ? "    " : "│   ");

  const children = deps.map(([key, dep], index) =>
    nodeToAsciiTree(dep, childPrefix, index === deps.length - 1, showMeta, key),
  );

  return [line, ...children].join("\n");
};
