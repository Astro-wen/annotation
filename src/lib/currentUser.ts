import { create } from "zustand";

const STORAGE_KEY = "bytehi-current-user-v2";

// Phase 1 接入 Kani，只保留两类功能角色（PRD 2.1）：
//  - editor（标注编辑，默认角色）：查看内部全量 Case；Batch Assign / Assign QA /
//    Set Sampling；作为 A/B 标注和拉齐；Sampling 冻结前改派 A/B、改自己的当前答案；
//    对未进 Waiting for QC 的 Case 用 Batch Edit；作为被指派且通过防自审的 C 做 QC；
//    QC 前 Mark/Restore Invalid；导出并查看团队与个人 Accuracy。受防自审约束。
//  - admin（标注管理员，全权限）：可 Override 防自审、任务归属、C 指派、阶段锁等，
//    可任意阶段接管 / 改派 / 提交 / 拉齐 / QC / 修改当前生效结果。
// A / B / C 是 case 级任务身份，不是权限角色。Phase 1 内部用户可见全量数据。
export type UserRole = "editor" | "admin";

export interface UserOption {
  email: string;
  label: string;
  shortName: string;
  role: UserRole;
}

export const USER_OPTIONS: UserOption[] = [
  {
    email: "editor.aaron@bytedance.com",
    label: "Aaron（标注编辑）",
    shortName: "Aaron",
    role: "editor",
  },
  {
    email: "editor.usagi@bytedance.com",
    label: "乌萨奇（标注编辑）",
    shortName: "Usagi",
    role: "editor",
  },
  {
    email: "editor.hachi@bytedance.com",
    label: "小八（标注编辑）",
    shortName: "Hachi",
    role: "editor",
  },
  {
    email: "editor.chiikawa@bytedance.com",
    label: "吉伊（标注编辑）",
    shortName: "Chiikawa",
    role: "editor",
  },
  {
    email: "admin.lead@bytedance.com",
    label: "QA 组长（标注管理员）",
    shortName: "Admin",
    role: "admin",
  },
];

/** 该账号的角色。找不到时按标注编辑处理（Phase 1 内部默认角色）。 */
export function roleOf(email: string | null | undefined): UserRole {
  if (!email) return "editor";
  return USER_OPTIONS.find((u) => u.email === email)?.role ?? "editor";
}

/** 标注管理员：全权限，可 Override 防自审 / 阶段锁 / 任务归属。 */
export function isAdmin(email: string | null | undefined): boolean {
  return roleOf(email) === "admin";
}

/** 标注编辑：默认作业角色，受防自审与阶段锁约束。 */
export function isEditor(email: string | null | undefined): boolean {
  return roleOf(email) === "editor";
}

function loadCurrentEmail(): string {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved && USER_OPTIONS.some((user) => user.email === saved)) {
      return saved;
    }
  } catch {
    // ignore storage read errors
  }
  return USER_OPTIONS[0].email;
}

interface CurrentUserStore {
  currentEmail: string;
  setCurrentEmail: (email: string) => void;
}

export const useCurrentUserStore = create<CurrentUserStore>((set) => ({
  currentEmail: loadCurrentEmail(),
  setCurrentEmail: (email) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, email);
    } catch {
      // ignore storage write errors
    }
    set({ currentEmail: email });
  },
}));

export function getUserOption(email: string): UserOption {
  return USER_OPTIONS.find((user) => user.email === email) ?? USER_OPTIONS[0];
}

export function shortNameOf(email: string | null | undefined): string {
  if (!email) return "—";
  return USER_OPTIONS.find((u) => u.email === email)?.shortName ?? email;
}
