import { create } from "zustand";

const STORAGE_KEY = "bytehi-current-user";

// 供应商权限隔离：账号分角色。
//  - admin：管理员 / QA。能看全部 case、能做分配、能导出全量数据。
//  - vendor：外部供应商标注员。只能看到分配给自己的 case，不能导出全量。
// 角色可以有多个人（多个 admin、多个 vendor）。
export type UserRole = "admin" | "vendor";

export interface UserOption {
  email: string;
  label: string;
  shortName: string;
  role: UserRole;
}

export const USER_OPTIONS: UserOption[] = [
  {
    email: "admin@bytedance.com",
    label: "管理员（我）",
    shortName: "Admin",
    role: "admin",
  },
  {
    email: "qa.lead@bytedance.com",
    label: "QA 组长",
    shortName: "QA Lead",
    role: "admin",
  },
  {
    email: "vendor.a@partner.com",
    label: "供应商标注员 A",
    shortName: "Vendor A",
    role: "vendor",
  },
  {
    email: "vendor.b@partner.com",
    label: "供应商标注员 B",
    shortName: "Vendor B",
    role: "vendor",
  },
  {
    email: "vendor.c@partner.com",
    label: "供应商标注员 C",
    shortName: "Vendor C",
    role: "vendor",
  },
  {
    email: "quanxian@bytedance.com",
    label: "权限账号",
    shortName: "权限账号",
    role: "admin",
  },
];

// 权限账号：可以在 QC 定案（Final Result Ready）之后，仍然修改前面 A / B / C 的结果。
// 普通账号在定案后只能查看，权限账号不受这个锁定限制。
const PRIVILEGED_EMAILS = new Set<string>(["quanxian@bytedance.com"]);

export function isPrivileged(email: string | null | undefined): boolean {
  return !!email && PRIVILEGED_EMAILS.has(email);
}

/** 该账号的角色。找不到时按最严格的 vendor 处理（默认不放行）。 */
export function roleOf(email: string | null | undefined): UserRole {
  if (!email) return "vendor";
  return USER_OPTIONS.find((u) => u.email === email)?.role ?? "vendor";
}

/** 供应商标注员：受硬隔离约束。 */
export function isVendor(email: string | null | undefined): boolean {
  return roleOf(email) === "vendor";
}

/** 管理员 / QA：能看全部、能分配、能导出全量。 */
export function isAdmin(email: string | null | undefined): boolean {
  return roleOf(email) === "admin";
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
