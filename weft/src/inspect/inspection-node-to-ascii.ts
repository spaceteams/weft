import type { DecisionTableTraceDetail } from "../rule/decision";
import type { InspectionNode } from "./inspection-node";

type RenderOptions = {
  showMeta: boolean;
  showChange: boolean;
};

const formatLabel = (node: InspectionNode, { showMeta, showChange }: RenderOptions): string => {
  let label = node.meta?.rule?.label ?? node.label;

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

  // trace details
  const detail = node.execution?.trace?.detail;
  if (detail) {
    switch (detail.op) {
      case "decision": {
        const tableDetail = detail as DecisionTableTraceDetail;
        label += tableDetail.usedDefault
          ? " :: default"
          : ` :: ${tableDetail.matchedRowLabel ?? tableDetail.matchedRowId}`;
      }
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
