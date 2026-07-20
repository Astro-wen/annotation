// PII masking (Phase 1 acceptance: 列表 / 标注 / QC / 导出均不呈现明文，
// 只呈现类型化占位符)。Demo 层不实现真实识别算法（PRD 明确留待技术详评），
// mock 数据已是占位符；这里提供占位符常量与导出前的兜底断言。

export const PII_PLACEHOLDERS = ["[EMAIL]", "[PHONE]", "[CARD]", "[ID]", "[ADDRESS]"] as const;

// Lightweight fallback patterns to catch obvious raw PII before export.
const RAW_PII_PATTERNS: { type: string; re: RegExp }[] = [
  { type: "[EMAIL]", re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi },
  { type: "[PHONE]", re: /(?:\+?\d[\d\s-]{7,}\d)/g },
];

/** Mask raw PII in an arbitrary display string as a safety net. */
export function maskPII(text: string): string {
  let out = text;
  for (const { type, re } of RAW_PII_PATTERNS) out = out.replace(re, type);
  return out;
}

/**
 * Export-time guard: mask any raw PII that slipped through so CSV never
 * carries plaintext user privacy.
 */
export function assertNoPII(value: string): string {
  return maskPII(value);
}
