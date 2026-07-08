import type { SessionRow, ReviewFlow } from "@/mock/types";
import { isVendor } from "@/lib/currentUser";

/**
 * 供应商权限隔离 —— 可见性判定（硬隔离）。
 *
 * 判断某个账号是否「有份」看到某条 case：只要它出现在这条 case 的任一槽位
 * （A / B / C，或历史 qaOwner）就算有份。
 */
export function isAssignedTo(
  email: string,
  session: SessionRow,
  flow: ReviewFlow | undefined,
): boolean {
  if (session.qaOwner === email) return true;
  if (!flow) return false;
  return (
    flow.aAssignee === email ||
    flow.aAnnotator === email ||
    flow.bAssignee === email ||
    flow.bAnnotator === email ||
    flow.cReviewer === email
  );
}

/**
 * 一条 case 是否对当前账号可见：
 *  - 管理员 / QA：可见全部。
 *  - 供应商标注员：只能看到分配给自己的 case（硬隔离，在数据源头过滤）。
 */
export function caseVisibleTo(
  email: string,
  session: SessionRow,
  flow: ReviewFlow | undefined,
): boolean {
  if (!isVendor(email)) return true;
  return isAssignedTo(email, session, flow);
}
