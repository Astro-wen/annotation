# Audit Portal 方案（C 抽检 / 双盲 审核门户）

> 目标：为 C（审核员 / QC）提供一个统一的 **Audit Portal**，覆盖两个相互独立的阶段——**双盲（Back-to-Back，A+B → C）** 和 **抽检（Sampling，A → C）**；A/B 提交后锁定、C 可 overwrite（覆盖即为准）、全程写入 Activity Log。

已按你的三个决策落地：
- **范围**：完整双阶段（双盲 diff 高亮 + 抽检 sampling，且 C 可按 review 模式筛选）。
- **锁定**：A/B **提交即锁定**，之后只有 C 能改。
- **最终分**：**C overwrite 即为准**；A/B 结果保留为历史快照可回看。

---

## 1. 背景与概念对齐（先统一语言）

| 概念 | 含义 | 平台现状 |
| --- | --- | --- |
| **Task** | 一个评估任务，可被一个 team 的多个 annotator claim | 已有 `Task` / `CaseSet` |
| **Session** | Task 下的一条会话（评分单元），当前每个 task 真实 20–40 条 | 已有 `SessionRow` |
| **A / B** | 标注员。双盲时同一 session 由 A、B 各盲标一次 | 已有 `aResult` / `bResult` |
| **C** | 审核员 / QC。做抽检、看 diff、overwrite | 已有 `cResult` / CReview 页 |
| **双盲 (Back-to-Back)** | A+B 各独立盲标 → C 审核，路径 **A+B → C**。新规则准确率爬坡期用，牺牲产出量换准确率（≈100% 抽检） | 已有 `backToBackEnabled` |
| **抽检 (Sampling)** | A 标 → C 按比例/数量抽样审核，路径 **A → C**。准确率稳定后用，提升产出量 | 已有 `startSampling` |

**关键认知（你补充的）**：双盲 与 抽检 是**两个相互独立的阶段**，由 Task 层的模式决定，不是同一 session 同时经历两者。Audit Portal 需要同时容纳这两种流入的 session，并让 C 能区分处理。

---

## 2. 平台现有基础（复用，不重造）

现有 `ReviewFlow`（`src/mock/types.ts`）已具备：

- `annotationMode: "Single Annotation" | "Back-to-Back"`、`backToBackEnabled`
- `aResult / bResult / cResult` + 各自 `aResultStatus / bResultStatus / cResultStatus`
- `currentState`（含 `Ready for C Sampling` / `In C QC` / `Final Result Ready`）
- `sampledForQC` / `sampleBatchLabel`、`cReviewer`
- store 里已有 `startSampling(taskId, config, operator)`、`getReviewFlow`、`submitAnnotation(..., role)`

**结论**：数据模型 80% 已就位，Audit Portal 主要是**补齐 C 侧的入口/筛选/diff/overwrite/锁定 + Activity Log**，而不是新建一套流程。

---

## 3. Audit Portal 交互设计

新增 **Audit Portal** 页面（或将现有 CReview 升级为 Portal 首页），面向 C：

### 3.1 顶部：抽样入口（Sampling）
- 「Start Sampling」按钮 → 弹窗（复用现有 `startSampling` 逻辑）：
  - 抽样方式：按百分比 / 按数量。
  - 抽样范围：全部 / 按某个 annotator（by_qa）。
- 抽样后被选中的 session 进入 `In C QC`，未选中回落 `Ready for C Sampling`。

### 3.2 列表：按 review 模式筛选
C 能在列表里区分并筛选：

| 列 | 说明 |
| --- | --- |
| **Review Mode** | `Double-blind (A+B)` / `Single (A only)` —— 由 `backToBackEnabled` 推导 |
| **Reviewed By** | 显示实际提交人（A / A+B），C 可据此筛选「让 A/B 都 review 了」还是「只被一个人 review」|
| **Diff** | 双盲时若 A/B 有分歧 → 显示 `Has Diff` 高亮标记；一致 → `Aligned` |
| **C Status** | `Pending` / `In C QC` / `Overwritten` / `Final Result Ready` |

筛选器：`Review Mode`（All / Double-blind / Single）、`Diff`（All / Has Diff / Aligned）、`C Status`。

### 3.3 详情：Diff 高亮 + Overwrite
点开一条 session → C 审核视图：

- **双盲 session**：并排展示 **A 结果 / B 结果**，逐维度对比：
  - A、B 在某维度分数或 reason 不同 → 该行**高亮**（黄/红），并标 `Δ`。
  - **本版本 A/B 不需要达成一致**，C 只需看到 diff 高亮即可。
- **抽检 session**：展示 A 结果（无 B，不做 diff）。
- **C Overwrite 区**：C 可逐维度覆盖分数 / reason，或整体 accept A（或 A/B 之一）。
  - 提交后 `cResult` 写入，`currentState = Final Result Ready`。
  - **C 覆盖即为准**：session 最终分取 `cResult`；`aResult/bResult` 保留为历史快照（Activity Log 可回看，不物理删除）。

### 3.4 锁定规则（提交即锁定）
- A 提交 `aResult` 后：A **不可再编辑**自己的标注（按钮置灰 + 只读）。
- B 提交 `bResult` 后同理。
- 只有 **C** 能通过 Overwrite 修改最终结果。
- 判定依据：`aResultStatus === "Submitted"` → 锁 A；`bResultStatus === "Submitted"` → 锁 B。当前用户身份（`currentEmail`）等于 `aAnnotator/bAnnotator` 且已 Submitted 时，Annotation 页进入只读。

### 3.5 Activity Log
每个关键动作写入 `logs`（已有机制，带 version snapshot）：
- `A Submit` / `B Submit`（已存在）
- `Start Sampling`（记录方式/范围/命中数）
- `C Overwrite`（记录：哪些维度被改、A/B→C 前后值、操作人 = C、时间）
- Overwrite 时把「覆盖前的 A/B 结果」作为 snapshot 存进 log version，保证可回看。

---

## 4. 数据模型改动（最小增量）

大部分复用现有字段，仅需补充：

```ts
// ReviewFlow 追加/明确
interface ReviewFlow {
  // ...existing...
  cReviewer?: string;          // 已有：记录 C 是谁
  overwrittenDims?: string[];  // 新增：C 覆盖了哪些维度（用于高亮/审计）
}
```

diff 计算不落库，运行时按 `aResult` vs `bResult` 逐维度比对即可。

---

## 5. Store 层改动

在 `src/store/sessionStore.ts`：

1. **锁定判断**（新增 selector / 纯函数）：`canEditOwn(sessionId, email, role)` —— Submitted 后返回 false。
2. **C Overwrite**（新增 action）：
   ```ts
   overwriteByC(sessionId, cResult, operator) => {
     // 写 cResult + cResultStatus="Submitted" + currentState="Final Result Ready"
     // 记录 overwrittenDims
     // 写 Activity Log（含覆盖前 A/B snapshot）
   }
   ```
3. **diff 工具**（新增纯函数）：`computeDiff(aResult, bResult) => { dimKey: {a, b, differ} }`。
4. 复用现有 `startSampling`（可能补一个「按 review 模式」的筛选参数）。

---

## 6. 页面/组件改动清单

| 文件 | 改动 |
| --- | --- |
| `src/pages/CReview.tsx`（或新建 `AuditPortal.tsx`） | 升级为 Audit Portal：抽样入口 + 列表（Review Mode / Diff / C Status 筛选）+ 详情 diff 高亮 + Overwrite |
| `src/pages/Annotation.tsx` | A/B 提交后进入**只读锁定**（按当前身份 + Submitted 状态判断） |
| `src/store/sessionStore.ts` | 新增 `overwriteByC`、`canEditOwn`、`computeDiff`；Activity Log 记录 |
| `src/mock/types.ts` | `ReviewFlow` 增 `overwrittenDims?` |
| 路由 | 增 Audit Portal 入口（若独立页） |

---

## 7. 分阶段实施建议

1. **P1｜锁定**：A/B 提交后只读（改动小、风险低，先落地审计合规）。
2. **P2｜C Overwrite + Activity Log**：C 能覆盖并留痕（覆盖即为准）。
3. **P3｜Diff 高亮**：双盲 A/B 逐维度 diff 高亮展示。
4. **P4｜Portal 列表筛选**：Review Mode / Diff / C Status 筛选 + 抽样入口整合。

---

## 8. 已确认结论 / 已知假设

- **已确认**：A / B / C 均为**动态角色**，任何人都可担任；C 由当前操作者担任（记 `cReviewer`）。
- **已确认**：Audit Portal 直接**升级现有 CReview 页**，不新建独立页。
- **假设**：一个 session 在一个阶段内只走「双盲」或「抽检」其一，由 Task 模式决定（符合你「两个独立阶段」的描述）。
- **假设**：本版本 A/B 不强制达成一致，C 只看 diff；后续若需「A/B 必须先 reconcile」再单独排期。
- **防呆假设（待你点头）**：因为角色是动态的，建议加基础约束——**同一个人不同时担任同一 session 的 A 和 B**；抽检时**尽量不把 session 分给它自己标过的人当 C**（避免自审）。若你希望完全不加限制，我就按「纯动态、不校验」实现。
