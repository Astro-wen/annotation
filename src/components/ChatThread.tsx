import { Bot, User, Info } from "lucide-react";
import type { ConversationMessage } from "@/mock/types";
import { cn } from "@/lib/utils";

export default function ChatThread({
  messages,
}: {
  messages: ConversationMessage[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((m) => {
        if (m.role === "System") {
          return (
            <div
              key={m.id}
              className="mx-auto flex max-w-[90%] items-center gap-2 rounded-md border border-line bg-page px-3 py-2 text-xs text-subtle"
            >
              <Info className="h-3.5 w-3.5 shrink-0 text-brand" />
              <span>
                <span className="font-mono text-[11px] text-muted">
                  #{m.id} System ·{" "}
                </span>
                {m.text}
              </span>
            </div>
          );
        }
        const isUser = m.role === "User";
        return (
          <div
            key={m.id}
            className={cn("flex gap-2", isUser ? "flex-row" : "flex-row")}
          >
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                isUser ? "bg-gray-200 text-subtle" : "bg-brand-light text-brand",
              )}
            >
              {isUser ? (
                <User className="h-4 w-4" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted">
                  #{m.id} {m.role}
                </span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-subtle">
                  {m.type}
                </span>
              </div>
              <div
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm leading-relaxed",
                  isUser
                    ? "border-line bg-gray-50 text-ink"
                    : "border-brand/15 bg-brand-light/60 text-ink",
                )}
              >
                {m.matchedFaq && (
                  <div className="mb-1.5 rounded bg-warning-light px-2 py-1 text-xs text-[#92400E]">
                    Matched FAQ: <span className="font-medium">{m.matchedFaq}</span>
                  </div>
                )}
                {m.text}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
