import { isAdmin } from "@/lib/currentUser";

/**
 * Phase 1 权限门（PRD 2.1 / Detail Actions / QC）。
 * 标注编辑受防自审与阶段锁约束；标注管理员全权限，可 Override。
 * Phase 1 内部用户可见全量数据，无供应商 / 语种行级隔离。
 */

/** 归一化 email/name 做身份比较（忽略大小写与首尾空格）。 */
export function normId(v?: string | null): string {
  return (v ?? "").trim().toLowerCase();
}

export function samePerson(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && normId(a) === normId(b);
}

/** Batch Assign / Set Sampling / Assign QA：标注编辑与管理员均可。 */
export function canAssign(): boolean {
  return true;
}

/**
 * 防自审（标注编辑必须遵守；管理员可 Override）：
 *  - Back-to-Back：A ≠ B。
 *  - Normal QC：C ≠ A。
 *  - Back-to-Back QC：C ≠ A / B。
 */
export function passesAntiSelfReview(
  email: string,
  candidate: string,
  conflictPeople: (string | undefined)[],
): boolean {
  if (isAdmin(email)) return true; // 管理员绕过
  return !conflictPeople.some((p) => samePerson(candidate, p));
}

/**
 * 该账号能否对处于给定 Case 流程状态的结果做 QC 前的编辑 / 改派 / Batch Edit。
 * 标注编辑仅能改未进 Waiting for QC 的 Case；管理员任意阶段。
 */
export function canEditBeforeQC(
  email: string,
  caseStatus: string,
): boolean {
  if (isAdmin(email)) return true;
  return caseStatus !== "Waiting for QC" && caseStatus !== "QC Completed";
}

/**
 * Mark / Restore Invalid：QC Completed 前编辑与管理员均可；
 * QC Completed 后仅管理员可操作。
 */
export function canToggleInvalid(email: string, caseStatus: string): boolean {
  if (isAdmin(email)) return true;
  return caseStatus !== "QC Completed";
}
