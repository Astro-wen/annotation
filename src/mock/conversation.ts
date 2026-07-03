import type { ConversationMessage } from "./types";

export const conversations: Record<string, ConversationMessage[]> = {
  "7649359668829100562": [
    {
      id: 1,
      role: "User",
      type: "manual_input",
      text: "I am not receiving my verification code",
    },
    {
      id: 2,
      role: "Assistant",
      type: "llm_gen",
      matchedFaq: "I am not receiving my phone or email verification code",
      text: "I understand you're having trouble receiving your verification code. Please double-check that the phone number or email is correct, and check spam or junk folders.",
    },
    {
      id: 3,
      role: "User",
      type: "manual_input",
      text: "I checked, still nothing. Can you resend it to my new number?",
    },
    {
      id: 4,
      role: "Assistant",
      type: "llm_gen",
      text: "I can help update your contact number. For security I will first verify your account ownership. Could you confirm the email associated with this account?",
    },
    {
      id: 5,
      role: "System",
      type: "evidence",
      text: "Matched Skill: Account Verification Assistant, version v3.2.1",
    },
  ],
  "7649237927054170625": [
    {
      id: 1,
      role: "User",
      type: "manual_input",
      text: "What are the withdrawal limits for my region?",
    },
    {
      id: 2,
      role: "Assistant",
      type: "llm_gen",
      matchedFaq: "Withdrawal limits and processing time",
      text: "Withdrawal limits depend on your account level. Standard accounts can withdraw up to the daily cap shown in your wallet.",
    },
    {
      id: 3,
      role: "System",
      type: "evidence",
      text: "Matched FAQ: Withdrawal limits (answer incomplete — region-specific cap not provided)",
    },
  ],
  "7650714612966529552": [
    {
      id: 1,
      role: "User",
      type: "manual_input",
      text: "كيف أقوم بتغيير كلمة المرور؟",
    },
    {
      id: 2,
      role: "Assistant",
      type: "llm_gen",
      text: "You can change your password from Settings > Security. (Replied in English to an Arabic query.)",
    },
    {
      id: 3,
      role: "System",
      type: "evidence",
      text: "Negative signal: language quality — replied in English to an Arabic query (language mismatch as a negative signal, not a veto).",
    },
  ],
};

export function getConversation(sessionId: string): ConversationMessage[] {
  return conversations[sessionId] ?? conversations["7649359668829100562"];
}
