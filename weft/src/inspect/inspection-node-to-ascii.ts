import type { InspectionNode } from "./inspection-node";

type RenderOptions = {
  showMeta: boolean;
  showChange: boolean;
};

/**
 * Formats a trace detail annotation based on the node's rule kind.
 * Uses `node.kind` (the rule's `spec.op`) as the discriminant rather than
 * relying on a type-specific `op` field inside the detail object.
 */
const formatDetailAnnotation = (
  kind: string,
  detail: Record<string, unknown>,
): string | undefined => {
  switch (kind) {
    case "match": {
      if (detail.usedDefault) return "default";
      return (detail.matchedRowLabel as string) ?? (detail.matchedRowId as string);
    }
    case "conditional": {
      return detail.condition ? "then" : "otherwise";
    }
    case "clamp": {
      return detail.clamped ? "clamped" : undefined;
    }
    case "round": {
      return `${detail.mode}(${detail.decimals})`;
    }
    case "compare": {
      return `${String(detail.left)} ${detail.compareOp} ${String(detail.right)}`;
    }
    default:
      return undefined;
  }
};

const formatLabel = (node: InspectionNode, { showMeta, showChange }: RenderOptions): string => {
  let label = node.label;

  if (showMeta) {
    label += ` [${node.kind}]`;
  }

  // value and diff
  if (node.change && showChange) {
    const delta = node.change.delta;
    switch (delta.kind) {
      case "added": {
        label += ` = ${String(delta.after)} (addded)`;
        break;
      }
      case "changed": {
        label += ` = ${String(delta.before)} -> ${delta.after} (changed)`;
        break;
      }
      case "removed": {
        label += ` = ${String(delta.before)} (removed)`;
        break;
      }
    }
  } else if (node.execution?.value !== undefined) {
    label += ` = ${String(node.execution?.value)}`;
  }

  // trace detail annotation
  const detail = node.execution?.trace?.detail;
  if (detail) {
    const annotation = formatDetailAnnotation(node.kind, detail);
    if (annotation) {
      label += ` :: ${annotation}`;
    }
  }

  return label;
};

export const inspectionNodeToAscii = (root: InspectionNode, options: RenderOptions): string => {
  const toAscii = (node: InspectionNode, prefix = "", isLast = true): string => {
    const connector = isLast ? "└── " : "├── ";
    const line = `${prefix}${connector}${formatLabel(node, options)}`;

    const lines: string[] = [line];

    const childPrefix = prefix + (isLast ? "    " : "│   ");

    const children = node.children.map((dep, index) =>
      toAscii(dep, childPrefix, index === node.children.length - 1),
    );
    return [...lines, ...children].join("\n");
  };

  return toAscii(root);
};
