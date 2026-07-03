import { create } from "zustand";

const STORAGE_KEY = "bytehi-current-user";

export interface UserOption {
  email: string;
  label: string;
  shortName: string;
}

export const USER_OPTIONS: UserOption[] = [
  {
    email: "aaron.wen@bytedance.com",
    label: "我",
    shortName: "Aaron",
  },
  {
    email: "usagi@bytedance.com",
    label: "乌萨奇",
    shortName: "Usagi",
  },
  {
    email: "hachi@bytedance.com",
    label: "小八",
    shortName: "Hachi",
  },
  {
    email: "chiikawa@bytedance.com",
    label: "吉伊",
    shortName: "Chiikawa",
  },
];

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
