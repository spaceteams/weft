import type { TraceStep } from "../evaluate/trace-step";
import type { KeyId } from "../key";
import type { KeyMeta } from "../key-meta";
import type { Change } from "../overlay/explain-diff";

export type InspectionNode = {
  key: KeyId;
  kind: string;
  label: string;

  meta?: {
    key?: KeyMeta;
  };

  structure?: {
    ruleSpec?: Record<string, unknown>;
  };

  execution?: {
    value?: unknown;
    trace?: TraceStep;
    /** Per-layer values at this node, keyed by layer name. */
    layers?: Record<string, unknown>;
  };

  change?: Change;

  children: InspectionNode[];
};
