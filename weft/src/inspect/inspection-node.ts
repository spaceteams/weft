import type { TraceStep } from "../evaluate/trace-step";
import type { KeyId } from "../key";
import type { KeyMeta } from "../key-meta";
import type { Change } from "../overlay/explain-diff";
import type { RuleMeta } from "../rule/rule-meta";

export type InspectionNode = {
  key: KeyId;
  kind: string;
  label: string;

  meta?: {
    key?: KeyMeta;
    rule?: RuleMeta;
  };

  structure?: {
    ruleSpec?: Record<string, unknown>;
  };

  execution?: {
    value?: unknown;
    trace?: TraceStep;
  };

  change?: Change;

  children: InspectionNode[];
};
