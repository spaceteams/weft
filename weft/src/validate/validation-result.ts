import type { KeyId } from "../key";

export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationIssue = {
  readonly key: KeyId;
  readonly message: string;
  readonly severity: ValidationSeverity;
  readonly path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
};

export type ValidationResult = {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly affectedKeys: ReadonlySet<KeyId>;
  readonly errorKeys: ReadonlySet<KeyId>;
  readonly warningKeys: ReadonlySet<KeyId>;
};

export function validResult(): ValidationResult {
  return {
    valid: true,
    issues: [],
    affectedKeys: new Set(),
    errorKeys: new Set(),
    warningKeys: new Set(),
  };
}

export function failedResult(issues: readonly ValidationIssue[]): ValidationResult {
  const errorKeys = new Set<KeyId>();
  const warningKeys = new Set<KeyId>();
  const affectedKeys = new Set<KeyId>();

  for (const issue of issues) {
    affectedKeys.add(issue.key);
    if (issue.severity === "error") {
      errorKeys.add(issue.key);
    } else if (issue.severity === "warning") {
      warningKeys.add(issue.key);
    }
  }

  return {
    valid: errorKeys.size === 0,
    issues,
    affectedKeys,
    errorKeys,
    warningKeys,
  };
}

export function mergeResults(...results: readonly ValidationResult[]): ValidationResult {
  const allIssues: ValidationIssue[] = [];
  for (const result of results) {
    allIssues.push(...result.issues);
  }

  if (allIssues.length === 0) {
    return validResult();
  }

  return failedResult(allIssues);
}
