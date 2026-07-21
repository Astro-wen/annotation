import { create } from "zustand";

const STORAGE_KEY = "bytehi-current-user-v2";

// Phase 1 接入 Kani，只保留两类功能角色（PRD 2.1）：
//  - editor（标注编辑，默认角色）：查看内部全量 Case；Batch Assign / Assign QA /
//    Set Sampling；作为 A/B 标注和拉齐；作为被指派且通过防自审的 C 做 QC；
//    Batch Edit / Mark/Restore Invalid；导出并查看团队与个人 Accuracy。
//  - viewer（标注只读）：只能查看 Case、结果与 Accuracy，不能做任何写操作。
// 不设管理员；任何人都不能绕过防自审。A / B / C 是 case 级任务身份，不是权限角色。
export type UserRole = "editor" | "viewer";

export interface UserOption {
  email: string;
  label: string;
  shortName: string;
  role: UserRole;
}

export const USER_OPTIONS: UserOption[] = [
  {
    email: "editor.a@bytedance.com",
    label: "标注员A",
    shortName: "标注员A",
    role: "editor",
  },
  {
    email: "editor.b@bytedance.com",
    label: "标注员B",
    shortName: "标注员B",
    role: "editor",
  },
  {
    email: "editor.c@bytedance.com",
    label: "标注员C",
    shortName: "标注员C",
    role: "editor",
  },
  {
    email: "viewer@bytedance.com",
    label: "标注只读",
    shortName: "标注只读",
    role: "viewer",
  },
];

/** 该账号的角色。找不到时按标注编辑处理（Phase 1 内部默认角色）。 */
export function roleOf(email: string | null | undefined): UserRole {
  if (!email) return "editor";
  return USER_OPTIONS.find((u) => u.email === email)?.role ?? "editor";
}

/** 标注只读：仅查看，不能写。 */
export function isViewer(email: string | null | undefined): boolean {
  return roleOf(email) === "viewer";
}

/** 标注编辑：可作业，受防自审与阶段锁约束（不设管理员，无人可 Override）。 */
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
