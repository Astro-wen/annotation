import { isViewer } from "@/lib/currentUser";

/**
 * Phase 1 权限门（PRD 2.1 / Detail Actions / QC）。
 * 只有「标注编辑」和「标注只读」两类角色；不设管理员，任何人都不能绕过防自审。
 * Phase 1 内部用户可见全量数据，无供应商 / 语种行级隔离。
 */

/** 归一化 email/name 做身份比较（忽略大小写与首尾空格）。 */
export function normId(v?: string | null): string {
  return (v ?? "").trim().toLowerCase();
}

export function samePerson(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && normId(a) === normId(b);
}

/** Batch Assign / Set Sampling / Assign QA：标注编辑可，标注只读不可。 */
export function canAssign(email: string): boolean {
  return !isViewer(email);
}

/**
 * 防自审（所有人强制遵守，不能绕过）：
 *  - Back-to-Back：A ≠ B。
 *  - Normal QC：C ≠ A。
 *  - Back-to-Back QC：C ≠ A / B。
 */
export function passesAntiSelfReview(
  _email: string,
  candidate: string,
  conflictPeople: (string | undefined)[],
): boolean {
  return !conflictPeople.some((p) => samePerson(candidate, p));
}

/**
 * Mark / Restore Invalid：标注编辑在 QC Completed 前可操作；标注只读不可。
 */
export function canToggleInvalid(email: string, caseStatus: string): boolean {
  if (isViewer(email)) return false;
  return caseStatus !== "QC Completed";
}
