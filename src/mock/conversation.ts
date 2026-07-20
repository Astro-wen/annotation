import type { ConversationMessage } from "./types";
import { cases } from "./sessions";

// Evidence conversations, keyed by caseId. All user PII is already masked to
// typed placeholders ([EMAIL] / [PHONE] / [ADDRESS] ...) — the annotation / QC /
// export layers never see plaintext user privacy (PRD PII acceptance).
const SAMPLE_A: ConversationMessage[] = [
  { id: 1, role: "User", type: "manual_input", masked: true, text: "I am not receiving my verification code at [PHONE]" },
  {
    id: 2,
    role: "Assistant",
    type: "llm_gen",
    matchedFaq: "I am not receiving my phone or email verification code",
    text: "I understand you're having trouble receiving your verification code. Please double-check that the phone number or email is correct, and check spam or junk folders.",
  },
  { id: 3, role: "User", type: "manual_input", masked: true, text: "I checked, still nothing. Can you resend it to [PHONE]?" },
  {
    id: 4,
    role: "Assistant",
    type: "llm_gen",
    text: "I can help update your contact number. For security I will first verify your account ownership. Could you confirm the email associated with this account?",
  },
  { id: 5, role: "System", type: "evidence", text: "Matched Skill: Account Verification Assistant, version v3.2.1" },
];

const SAMPLE_B: ConversationMessage[] = [
  { id: 1, role: "User", type: "manual_input", text: "What are the withdrawal limits for my region?" },
  {
    id: 2,
    role: "Assistant",
    type: "llm_gen",
    matchedFaq: "Withdrawal limits and processing time",
    text: "Withdrawal limits depend on your account level. Standard accounts can withdraw up to the daily cap shown in your wallet.",
  },
  { id: 3, role: "System", type: "evidence", text: "Matched FAQ: Withdrawal limits (answer incomplete — region-specific cap not provided)" },
];

const SAMPLE_C: ConversationMessage[] = [
  { id: 1, role: "User", type: "manual_input", masked: true, text: "Please ship my order to [ADDRESS]. My email is [EMAIL]." },
  { id: 2, role: "Assistant", type: "llm_gen", text: "You can update your shipping address from Settings > Addresses. Would you like me to open a ticket to expedite this order?" },
  { id: 3, role: "System", type: "evidence", text: "Transferred to Human Ticket queue (order fulfillment)." },
];

const SAMPLES = [SAMPLE_A, SAMPLE_B, SAMPLE_C];

// Assign a deterministic sample conversation to every case by index.
export const conversations: Record<string, ConversationMessage[]> = Object.fromEntries(
  cases.map((c, i) => [c.caseId, SAMPLES[i % SAMPLES.length]]),
);

export function getConversation(caseId: string): ConversationMessage[] {
  return conversations[caseId] ?? SAMPLE_A;
}
