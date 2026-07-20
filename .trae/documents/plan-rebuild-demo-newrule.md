# 重构计划：ByteHi Manual Annotation Tool（New Rule）前端 Demo 对齐最新 PRD

> 唯一事实来源：PRD《[PRD] WIP - ByteHi Manual Annotation Tool - New Rule》
> wiki `A2RYw6og2iBrmXkWLrQcSWvFnmg` / docx `WAzhdFDw1od7obxgI23u3mCZsRb`（revision 10082）。
> 落地方式（已与用户确认）：**原地重写**，保留现有 Vite + React18 + TypeScript + Zustand + Tailwind + React Router 脚手架及 GitHub Pages 部署链路；**一切以 PRD 正文为准**，仓库里旧截图 / 旧交接文档与 PRD 冲突处，一律服从 PRD。

---

## 1. Summary（这次要做什么）

当前托管 demo（git 已提交的 `src/`）停留在**旧模型**，与最新 PRD 存在结构性差异。本次在保留工程脚手架的前提下，**重写数据模型（types + mock）、状态机（sessionStore）、评分/导出/权限工具库，以及 5 个页面 + 相关弹窗**，使 demo 完全落到 PRD 的 Phase 1 口径：

- 评分模型：**SQS（6 维）+ UEF（独立用户视角维度）→ UXS（用户满意分/北极星）**；加权 **SQS 65%（每维 65%÷6）+ UEF 35%**。术语统一为 **UEF**（不再出现 UES）。
- 结果模型：一条 Case 由导入识别出 **8 种 Type**，生成 **`expected_results`**，最终归为 **Chatbot / Ticketbot / Human 三类结果**；界面只用 **AI 评分卷 + Human 评分卷** 两种模板；每项结果保存 `result_type`、`service_subtypes`、`entry_mode(DIRECT/TRANSFERRED)`。
- 角色：**标注编辑 / 标注管理员** 两档功能角色（接入 Kani 的概念），A/B/C 为 case 级任务身份；系统性防自审 + 管理员 Override。**Phase 1 不做供应商 / 语种行级隔离**（内部可见全量）。
- 流程：Batch Assign 按 **Type + 数量**分配、首次锁定 **Normal / Back-to-Back**；Back-to-Back 盲检不一致 → **待拉齐（Diff）→ 拉齐** → 进池；Set Sampling 累加抽样、Percentage/Absolute、Scope All/By-QA；QC 在 Detail 的 **C 行**完成；Activity Log 全量可追溯 + 版本快照；CSV summary/data 两层 + latest/history。
- Phase 1 **仅盲检，不含明检**（明检 / Check Mode、Discard、Search by Case、Appeal 属 Phase 2，不实现）。
- PII：列表 / 标注 / QC / 导出**不呈现明文**，只呈现类型化占位符（`[EMAIL]`/`[PHONE]`/`[ADDRESS]` 等）——demo 层用 mock 数据直接产出占位符即可。

---

## 2. Current State Analysis（现状与冲突）

### 2.1 现有工程（保留）
- 栈：`react@18` `react-router-dom@7` `zustand@5` `tailwindcss@3` `vite@6`，路径别名 `@/`（`vite-tsconfig-paths`）。见 [package.json](file:///Users/bytedance/Documents/trae_projects/draft/package.json)、[vite.config.ts](file:///Users/bytedance/Documents/trae_projects/draft/vite.config.ts)。
- 路由：[App.tsx](file:///Users/bytedance/Documents/trae_projects/draft/src/App.tsx) — `/home` `/import` `/settings` `/task/:taskId` `/annotate/:sessionId`，`basename` 取 `BASE_URL`。部署：GitHub Pages（`BASE_PATH`），`.github/workflows/deploy.yml`，`postbuild` 复制 `404.html`。**这些全部保留。**
- 现有页面/组件/store/lib/mock 结构清晰，可作为重写骨架。

### 2.2 现有代码与 PRD 的结构性差异（需重写）
| 领域 | 现状（committed src/） | PRD 最新口径 |
|---|---|---|
| 评分维度 | SQS(6) + **UES(1 维 Service Outcome Expectation)**；`ActorScore.uesTotal/uesPass` | SQS(6) + **UEF**（用户预期达成，独立维度）；术语一律 UEF |
| 北极星加权 | SQS 等权均值，与 UES 按可编辑 `0.5/0.5` 混合（[scoring.ts](file:///Users/bytedance/Documents/trae_projects/draft/src/lib/scoring.ts)） | **UXS**；QC Accuracy = Σ(每 SQS 维一致率×65%÷6)+UEF 一致率×35% |
| 结果模型 | `SessionRow.bot?` + 可选 `human?`（[types.ts](file:///Users/bytedance/Documents/trae_projects/draft/src/mock/types.ts)） | Type1–8 → `expected_results`；三类 `result_type`(Chatbot/Ticketbot/Human)；`service_subtypes`/`entry_mode` |
| 分配 | 只有 QA Name+Quantity + Back-to-Back 勾选（[AssignModal.tsx](file:///Users/bytedance/Documents/trae_projects/draft/src/components/AssignModal.tsx)） | 按 **Type 勾选 + 剩余量 + 数量**分配；首次锁 Normal/B2B；B2B 用 A｜B｜数量成对 |
| 角色 | **admin / vendor**（[currentUser.ts](file:///Users/bytedance/Documents/trae_projects/draft/src/lib/currentUser.ts)）+ 供应商硬隔离 | **标注编辑 / 标注管理员**；Phase 1 无行级隔离 |
| Detail 列 | 有 Transfer/Assign/Status，但 SQS/UES 展开、无三类结果分组 | Subtype 多标签、Source、SQS/UEF 展开、UXS、Transfer(只读)、Status 图览、多结果分组 |
| Execution Correctness | 固定 3/2/1/0（不随 Source） | **随 Knowledge Source**：Skill=3/2/1/0，FAQ/SOP=3/1/0（无 2 档） |
| Solution Adoption | 固定 3/1/0，problemType 仅提示 | 由标注员识别 R1/R2/R3 后按对应档打分（选项不随之变 → 见 §5 决策） |
| Gating / Gatekeeper | UA=0 归零下游；UES gatekeeper | **已删除**：新标准无一票否决 |
| Settings | SQS/UES 权重、reason、加维、版本 | North Star Weights(SQS/UEF)、Reason Templates、只增不减维度、Config Version 历史 |
| CSV | summary + data（SQS/UES 列，无 result_type 等） | summary 用 `result_type` 分三类；data 每结果一行，带 `case_status/final_source/entry_mode/service_subtypes/covered_source_ids`；latest/history 两模式；字段一律 UEF |
| PII | 无 | 列表/标注/QC/导出均占位符化 |
| 状态 | 无 Invalid | 需要 Invalid（整行置灰、退出统计）+ 待拉齐（Diff） |

### 2.3 仓库内“旧材料”与 PRD 的冲突（按用户裁决：以 PRD 为准，忽略旧材料）
- [逻辑审查_矛盾与修复清单.md](file:///Users/bytedance/Documents/trae_projects/draft/逻辑审查_矛盾与修复清单.md)、[PRD更新对照_待你手动填入.md](file:///Users/bytedance/Documents/trae_projects/draft/PRD更新对照_待你手动填入.md)、[CODEX_HANDOFF.md](file:///Users/bytedance/Documents/trae_projects/draft/CODEX_HANDOFF.md)、`.trae/documents/prd.md` 均含**过时口径**：
  - “只分 A，B 由二次 Review 触发”“明检 open-review”“Phase 1 不接 Kani/自建角色表”“UES”“UA=0 gating / UES gatekeeper”。
  - **这些与最新 PRD 冲突，全部不采纳。** 最新 PRD：分配即定 Normal/B2B、**Phase 1 仅盲检**、接入 Kani 两档角色、术语 UEF、无 gating/gatekeeper。
- PRD 内嵌截图本身来自旧 demo（显示 UES、Batch Edit Reasons、无 Type 列）。PRD 已用 **“截图阅读说明”callout** 明确：UES=旧命名→UEF；Batch Edit Reasons=旧名→Batch Edit；Human Result 已纳入；Settings/Clear All Data 为 Demo-only。**以文字口径为准，截图仅作视觉参考。**

---

## 3. Proposed Changes（分模块，含 what / why / how）

> 组织顺序：先重建数据与状态底座（3.1–3.4），再重建页面（3.5–3.9），最后导出/PII/角色/清理（3.10–3.13）。每步产出可编译、可点通。

### 3.1 数据模型：`src/mock/types.ts`（重写）
**What**：用 PRD 词汇重定义类型。
**Why**：所有页面依赖统一模型，避免旧 bot/human/UES 名词继续扩散。
**How**（关键类型）：
- `ResultType = "Chatbot" | "Ticketbot" | "Human"`
- `ServiceSubtype = "CHATBOT" | "TICKETBOT" | "HUMAN_IM" | "HUMAN_TICKET"`
- `EntryMode = "DIRECT" | "TRANSFERRED"`
- `KnowledgeSource = "Skill" | "FAQ" | "SOP"`
- `ProblemType = "R1" | "R2" | "R3"`
- `FormTemplate = "AI" | "Human"`（评分卷模板：Chatbot/Ticketbot→AI，Human→Human）
- `CaseType = 1..8`
- `DimensionScore = { scores: Record<string,number>; reasons?: Record<string,number|string> }`
- `ResultScore = { sqsDims: Record<string,number>; uef: number; sqsAvg: number; uefTotal: number; uxs: number }`（**uxs = 北极星；不再有 uesTotal/uesPass/sqsPass**）
- `ExpectedResult = { resultId; resultType: ResultType; serviceSubtypes: ServiceSubtype[]; entryMode: EntryMode; formTemplate: FormTemplate; coveredSourceIds: string[] }`
- `CaseRow`（取代 SessionRow）：`{ caseId; sessionId; taskId; caseType: CaseType; knowledgeSource; annotationCategory; category; mergeId; sourceRecordIds: string[]; language; regionCode; transferToHuman: boolean; expectedResults: ExpectedResult[]; ruleVersion: number; invalid?: boolean; prevStatusBeforeInvalid?: string }`
- `CaseSet`：`{ taskId; taskName; sampleName; source: "Import"|"ByteHi"; taskMode?: "Normal"|"Back-to-Back"; ruleVersion: string; ... }`（去掉旧 `taskType: Chatbot|Ticket` 单值；去掉静态聚合字段，Home 全走实时派生）
- `ActivityEntry`：加 `role?`、`resultType?`、`caseId`、`snapshot?`（快照按 result 记录）。
- 保留 `ConversationMessage`，新增 `masked?: boolean` 语义（正文已是占位符）。
**注意**：**不保留** `sqsPass/uesPass/uesTotal/userSatisfaction`；PASS 概念在 PRD 已无“Pass Rate”北极星语义（Home 用 SQS Avg / UEF Avg / UXS，不再有 SQS Pass Rate）。

### 3.2 评分标准配置：`src/mock/settings.ts` + `src/store/rubricStore.ts`（重写）
**What**：SQS 6 维 + **UEF** 1 维；North Star 权重 `{ sqsWeight:0.65, uefWeight:0.35 }`。
**Why**：术语与加权对齐 PRD；Detail/Annotation 的维度名来自 rubric 配置，且**新 rubric 不作用于旧 case set**（每个 case set 记录自己用的版本）。
**How**：
- `defaultRubric`：SQS 维度 `understanding_accuracy / execution_correctness / solution_adoption / responsiveness / service_efficiency / language_quality`；UEF 维度 `user_expectation_fulfillment`（group 由 `"UES"` 改 `"UEF"`）。
- `execution_correctness` 的 options 由 **Knowledge Source 决定**（不写死在 rubric，见 3.7）。`responsiveness` 保留 `auto:true`（系统识别，只读给值）。
- rubricStore：`RubricWeights = { sqsWeight; uefWeight }`；`bump()` 版本 +1、记 history 快照、持久化 key 升级为 `bytehi-rubric-state-v4`（避免读到旧 v3 的 UES 结构）。
- **版本隔离**：`activeRubricForVersion(v)` — Detail/Annotation 按 case set 的 `ruleVersion` 取当时维度集合，而不是永远取最新。

### 3.3 评分计算：`src/lib/scoring.ts`（重写）
**What**：实现 PRD 的 UXS 与 QC Accuracy 公式。
**How**：
- `computeResultScore(result, weights)`：`sqsAvg = mean(6 SQS 维)`；`uefTotal = uef 维值`；`uxs = sqsAvg*0.65 + uefTotal*0.35`（按权重归一）。
- `qcAccuracy(results[])`（对某一 result_type 的已完成 QC、非 Invalid 结果集）：
  `Σ(每个 SQS 维一致率 × 65% ÷ 6) + UEF 一致率 × 35%`；一致=该维评分值相等（reason/展示字段差异不计）；无有效样本返回 `"—"`（不显示 0%）。
- 一致率分母 = 该类已完成 QC 的有效结果数。
- 个人 Accuracy 复用同函数，比较对象换为“该人第一次正式提交 vs 当前生效结果”。

### 3.4 状态机：`src/store/sessionStore.ts`（重写）
**What**：以 Case + expected_results 为中心的状态机，覆盖分配 / 提交 / 拉齐 / 抽样 / QC / Invalid / Batch Edit / Activity Log。
**Why**：现有 store 基于 bot/human 单结果、且残留“只分 A / 明检”死代码，需按 PRD 重建单一事实来源。
**How**（核心 action，均写 Activity Log）：
- `distributeCases(taskId, config)`：`config` 支持 **按 Type 过滤 + Normal(QA+数量) 或 B2B(A|B|数量)**；首次分配锁 `taskMode` 并二次确认；只从所选 Type 中“未分配且非 Invalid”取数；A≠B（标注编辑）/管理员可 Override。
- `assignSingleCase(caseId, slot:"A"|"B", email)`：Detail 单条改派；保留原提交/实际提交人；防自审校验。
- `submitAnnotation(caseId, role, perResultScores, problemTypesPerResult)`：**一次提交该 Case 全部 expected_results**；Normal→A 提交生成 Finalized Baseline；B2B→A、B 均提交后逐维比较，一致→Baseline，不一致→`待拉齐(Diff)`；C 提交→当前生效结果。
- `reconcileDiff(caseId, agreedPerResult)`：写回 A、B 统一基线，进池，记 reconciledBy。
- `startSampling(taskId, config)`：**累加**抽样；`scope: all_qas|by_qa`；`method: percentage|absolute`；目标数=有效数×% 向上取整；本次新增=max(0, 目标-已抽)，受所选 C 可承接量限制；等概率随机；防自审排除（管理员可 Override）；前置=所选 Scope 内非 Invalid 全部已定稿。
- `submitQC(caseId, cReviewer, perResultScores)` / `reassignC` / `adminOverrideResult`。
- `markInvalid(caseId)` / `restoreInvalid(caseId)`：Invalid 退出分配/统计分母；恢复回标记前状态；QC Completed 后仅管理员可操作。
- `batchEdit(caseIds, patch)`：标注编辑仅改未进 Waiting for QC 的 Case；管理员任意阶段；保留旧版本/影响范围。
- 派生 selector：`taskStats(taskId)`（Home 各列实时值）、`caseStatus(caseRow, flow)`（统一状态）、`slotStatus(flow, slot)`。
- **状态集合**（PRD 口径）：Case 级 `Invalid / 待拉齐(Diff) / Waiting for QC / QC Completed`；slot 级 `Unassigned / Assigned / Submitted (No QC)`。

### 3.5 首页 `src/pages/Home.tsx`（重写）
**What**：New/Old Rule 开关（默认 New，左；Old 右且仅隔离占位）；表格列与 Actions 按 PRD。
**How**：
- 列：**评分模式**（未分配/Normal/Back-to-Back）、**Cases**（有效数，Invalid 单列）、**Assigned**、**Annotation Finish Rate**、**Back-to-Back Complete Rate**（仅 B2B）、**QC Complete**、**SQS Avg / UEF Avg / User Experience Score**（按 Chatbot/Ticketbot/Human 三类分别展示，无数据显示 —）、**QC Accuracy**（三类分别，公式见 3.3）、**Actions**。
- Actions：Detail / Batch Assign / Sampling / Export to ByteHi / Download。
- 顶部展示**当前生效标准版本号**（Config vX）。
- Demo-only：Settings、Clear All Data 按钮保留但标注 Demo-only（见 §4 决策）。

### 3.6 Batch Assign 弹窗 `src/components/AssignModal.tsx`（重写）
**What**：Type-based 分配 + Normal/B2B 锁定 + QA 搜索 + 边界校验。
**How**：
- 顶部 Normal / Back-to-Back 二选一（首次），二次确认锁定；已分配后锁定不可切。
- 列出**当前 case set 实际存在的 Type**（无则不展示），每行显示 Annotation Category、将生成的结果组合、有效总数、Remaining unassigned；剩余 0 禁用；可勾选一个或多个 Type（不选=All）。
- Normal：QA Name（搜索联想）+ Quantity 多行，按顺序切分。
- B2B：A｜B｜Quantity 成对；A≠B（管理员 Override）。
- 实时更新所选 Type 的 Remaining 与整表 Total remaining；超量/缺项/无可分配→禁用确认并明确报错。

### 3.7 标注页 `src/pages/Annotation.tsx` + `ScorePanel/ScoreButtons`（重写）
**What**：左 60% evidence（对话）/ 右 40% 评分区；按 `expected_results` 渲染**一或两张评分卡**（AI 卷 / Human 卷）；顶部 SQS/UEF/UXS 总览。
**How**：
- 右侧根据 `expectedResults` 生成卡片：Chatbot/Ticketbot→AI 卷，Human→Human 卷；Type 2 展示两张 AI 卷（分别绑定 Chatbot、Ticketbot 结果）。一次提交完成全部卡片。
- **Execution Correctness 选项随 Knowledge Source**：Skill=[3,2,1,0]；FAQ/SOP=[3,1,0]（隐藏 2 档），选分带出对应 reason。
- **Solution Adoption**：标注员先选 R1/R2/R3（不预填），再打分。（选项档位见 §5 决策 D3）
- **Responsiveness**：系统识别自动给值，只读。
- 角色：A/B 盲检不预填对方；C 空白表单 + 右侧只读展示冻结 Finalized Baseline（不展示 A/B 原始分歧）。防自审命中显示拦截页；管理员可 Override。View / 冻结态只读。
- **删除**：UA=0 gating、UES gatekeeper、明检 open-review 逻辑。

### 3.8 详情页 `src/pages/TaskDetail.tsx`（重写）
**What**：Case 列表（每 Case 一行）+ SQS/UEF 展开 + B2B 行展开(A/B) + C 行 + 拉齐 + 筛选 + Batch Edit + Activity Log。
**How**：
- 列：Session ID、Service Subtype（多标签）、Source、SQS(可展开)、UEF(可展开)、User Experience Score、Transfer to human?(只读)、Assign QA、Status、Actions。多结果（AI 转人工）在单元格内按 AI/Human 分组。
- SQS/UEF 表头点击展开逐维（维度名来自该 case set `ruleVersion` 的 rubric）。
- Filter：Service Subtype / Knowledge Source / Problem Type(R1/R2/R3) / **流程状态**(All/Unassigned/Assigned/Submitted(No QC)/待拉齐(Diff)/Waiting for QC/QC Completed/Invalid) / annotator。Invalid 整行置灰。
- 顶部工具栏：Batch Edit（编辑与管理员均可，权限按阶段）、Expand all/Collapse all、按 annotator 的三类 Accuracy 汇总。
- B2B 展开 B 行（深色 + “B·姓名 盲检”）；待拉齐显示红色“拉齐 Diff”按钮 → ReconcileModal（逐维 A/B/其他）。
- C 行：Do QC / View QC，按指派 + 防自审。
- Actions/Status 严格按 PRD（A/B：Annotate/View 或拉齐；C：Do QC/View QC/“你已标过当前 session!”）。
- Activity Log 抽屉：时间/operator/角色/动作/version；version→快照；Export CSV。多结果记录标 `result_type`。

### 3.9 抽样弹窗 `src/components/SamplingModal.tsx`（重写）
**What**：按 PRD 的 Set Sampling。
**How**：顶部 `Available to sample: X of Y`；Scope All QAs/By QA；Method Percentage(1–100)/Absolute；展示 Target/Already sampled/This time、Invalid 数、防自审排除数；指派 C（管理员可 Override 防自审）；前置未满足时禁用并分别显示未提交/待拉齐数量。

### 3.10 Settings 页 `src/pages/Settings.tsx`（重写，Demo-only 标注）
**What**：North Star Weights(SQS/UEF)、Reason Templates、只增不减维度 + 启停、Config Version/Effective Time + 版本历史、Apply→发布新版本二次确认。
**How**：术语 UEF；解锁→编辑；Apply→`rubricStore.bump()`；页面顶部标注“New Rule Settings（Demo-only，不属于 Phase 1 承诺范围）”。

### 3.11 导入页 `src/pages/ImportSample.tsx` + `ImportByteHiModal/NewAnnotationTaskModal`（重写）
**What**：两入口（Import from ByteHi / Upload CSV）+ CSV 模板 + 解析预览 + 服务结果识别（Type1–8）+ Skill/SOP/FAQ 识别 + 错误清单/去重。
**How**：模板与预览列改为新字段（含 annotation_category/category/merge_id/service_type 等）；预览展示识别出的 Type 与将生成的结果清单；重复/缺字段/清单不完整→错误清单（demo 用 mock 展示，不做真实上传）。

### 3.12 权限与 PII：`src/lib/access.ts` + `src/lib/currentUser.ts` + `src/lib/pii.ts`（重写/新增）
**What**：角色改为**标注编辑 / 标注管理员**；防自审 + 管理员 Override；PII 占位符。
**How**：
- `currentUser.ts`：`UserRole = "editor" | "admin"`（标注编辑/标注管理员）；账号列表提供若干 editor + admin；顶部账号切换器用于演示两档权限与防自审。**移除 vendor 硬隔离**（Phase 1 全量可见）。
- `access.ts`：`canBatchAssign / canDoQC / canMarkInvalid / canBatchEdit / passesAntiSelfReview / isAdmin`。
- `pii.ts`：mock 数据即为占位符（`[EMAIL]`/`[PHONE]`/`[CARD]`/`[ID]`/`[ADDRESS]`）；提供 `assertNoPII()` 供导出前兜底。

### 3.13 CSV 导出：`src/components/DownloadCsvMenu.tsx` + `src/lib/csv.ts`（重写）
**What**：`annotation_summary.csv` + `annotation_data.csv`（latest/history）。
**How**：
- summary：按 `result_type` 三类，字段 `total_samples/invalid_count/annotated_count/annotated_rate/sqs_avg/uef_avg/uxs_avg/6 维一致率/uef_accuracy/qc_accuracy/config_version`。
- data：每 Case 每结果一行，`type_number/annotation_category/category/merge_id/result_id/result_type/service_subtypes/entry_mode/covered_source_ids/case_status/final_source/评分字段/负责人`；多值用 `|`。history 模式增 `round/role/is_final/annotator/round_submitted_at/config_version`。
- **字段一律 UEF**，不输出 `ues*`，不输出单条 session qc_accuracy。导出前 `assertNoPII()`。

### 3.14 Layout / 导航 `src/components/Layout.tsx`（小改）
- 顶部保留 New Rule badge、Config 版本、账号切换（editor/admin）。侧栏沿用。

---

## 4. Assumptions & Decisions（明确假设，避免执行期再决策）

- **A1 单一事实来源=PRD 正文**；仓库旧材料（逻辑审查/PRD更新对照/CODEX_HANDOFF/.trae/prd.md）与截图**仅作历史参考**，冲突处不采纳。
- **A2 Phase 1 只做 Phase 1**：不实现明检/Check Mode、Discard、Search by Case、Appeal、供应商/语种/地区隔离、按人导出文件（均 Phase 2）。
- **A3 角色**：标注编辑 / 标注管理员两档；A/B/C 为 case 级任务身份；无 vendor 硬隔离。
- **A4 Demo-only 项保留**：Settings、Clear All Data、顶部账号切换器保留（PRD “截图阅读说明”将 Settings/Clear All Data 明确为 Demo-only；账号切换器是演示两档权限与防自审所必需）。页面上明确标 Demo-only。
- **A5 数据持久化**：localStorage/sessionStorage key 升版本号（rubric→v4、session/user 相应升级），避免读到旧结构脏数据；提供 Clear All Data 重置。
- **A6 术语**：全项目统一 **UEF / UXS(User Experience Score)**，不出现 UES；入口名 **Batch Edit**（非 Batch Edit Reasons）。
- **D3（Solution Adoption 与 R1/R2/R3）**：PRD 要求“标注员先判断 R1/R2/R3 再按对应档打分”，但**未明确三种 problem type 各自的分档差异**。为“对系统影响最小、不臆造规则”，Demo 做法：Solution Adoption 统一档位（沿用 rubric 的 `[3,1,0]`），R1/R2/R3 作为**必选前置项 + 影响该维 reason 文案**（与现有 hint 行为一致），不编造未在 PRD 出现的分档表。若后续 PRD 补充分档，再按配置扩展。
- **D4（PII）**：Demo 不实现真实识别算法（PRD 明确“具体识别算法留待技术详评”），mock 数据直接以占位符呈现，满足“不呈现明文”的产品验收口径。
- **D5（Old Rule）**：Old Rule 仅保留隔离占位面板（与 PRD“完全隔离、本 demo 聚焦 New Rule”一致），不实现旧 P/Q/I。

---

## 5. 我从系统视角发现的“较严重问题”与最优处理（对系统影响小、不新增功能）

> 用户要求：以我的视角审视 PRD/demo 是否还有严重问题；有则先按对系统最优的方式解决。以下为**PRD 内部**及**PRD↔demo**层面的实质性问题与处理建议（均已并入上面的计划，不新增功能）。

1. **P0 术语/模型漂移（UES vs UEF、bot/human vs 三类结果）**：demo 与 PRD 正文冲突。→ 已在 3.1–3.3、3.13 统一为 UEF/UXS + 三类结果模型；持久化 key 升版本防脏数据（A5）。

2. **P0 分配模型冲突（只分 A/明检 vs Normal|B2B 锁定/仅盲检）**：旧 store 有“只分 A、B 由二次 review 触发、明检 open”死代码，与最新 PRD 直接矛盾。→ 3.4/3.6 按“分配即锁模式、Phase 1 仅盲检”重写，**删除明检与只分 A 死分支**（对系统最优：移除相互冲突路径而非叠加开关）。

3. **P1 QC Accuracy 公式**：demo 用“全对/等权平均”，PRD 用“逐维一致率×65%÷6 + UEF×35%”。→ 3.3 统一实现；无样本显示 `—` 而非 0%。

4. **P1 Execution Correctness 未随 Knowledge Source**：demo 固定四档。→ 3.7 按 Skill=4 档 / FAQ·SOP=3 档实现（PRD 明确规则）。

5. **P1 缺 Invalid 状态**：demo 无 Invalid，导致“退出统计分母/整行置灰/恢复”无法体现。→ 3.4/3.8 补齐 Invalid 生命周期（PRD 已定义完整口径，非新增功能）。

6. **P2 PRD 内嵌截图滞后于文字**（截图仍是旧 UES/无 Type 列）：这是 PRD 侧的图文不同步风险，但 PRD 已用“截图阅读说明”callout 兜底。→ Demo **以文字为准**渲染；不改 PRD（超出本次前端范围）。此项仅记录，不处理 PRD。

7. **P2 PRD 未给出 R1/R2/R3 各自分档**（Solution Adoption）：属 PRD 细节缺口。→ 按 D3 用统一档位 + 前置识别处理，不臆造分档；作为“待 PRD 补充项”记录。

8. **P2 Responsiveness 自动值来源**：PRD 说系统自动识别，demo 无后端。→ 用 mock 直接给只读值（与 PRD“直接提供分值”一致），不做规则引擎。

> 除以上，PRD 主链路（导入→分配→标注→拉齐→抽样→QC→Accuracy→导出）逻辑自洽，未发现阻断性 blocker。上述 P0/P1 均通过“重写对齐 + 删除冲突死代码”解决，不新增 PRD 之外功能。

---

## 6. Verification（如何验证）

- **构建/类型**：`npm run check`（`tsc -b --noEmit`）零错误；`npm run build` 成功（含 `postbuild` 404 复制）。
- **Lint**：`npm run lint` 通过。
- **本地点通主链路**（`npm run dev`）：
  1. Home：New/Old 切换；三类 SQS/UEF/UXS 与 QC Accuracy 列、无数据显示 —；Config 版本号可见。
  2. Batch Assign：按 Type 勾选 + 数量分配；首次锁 Normal/B2B；Remaining 实时更新；A=B/超量报错；管理员可 Override。
  3. Detail：SQS/UEF 展开逐维；B2B 展开 B 行；待拉齐→拉齐→进池；Filter（含 Invalid 置灰）；按 annotator 三类 Accuracy；Batch Edit 权限分层；Activity Log 抽屉 + 版本快照。
  4. Annotation：Type2 两张 AI 卷；EC 随 Knowledge Source 变档；SA 需先选 R1/R2/R3；Responsiveness 只读；C 空白表单 + 只读 Baseline；防自审拦截；无 UA gating。
  5. Sampling：Available X of Y、Percentage/Absolute、累加抽样、前置未满足禁用、指派 C 防自审。
  6. Export：summary 三类字段、data latest/history、字段全 UEF、无 PII 明文。
- **PII**：全站（列表/标注/QC/导出）搜索无邮箱/手机号明文，仅占位符。
- **角色**：切换标注编辑/标注管理员，权限门（Batch Assign 后锁模式、只读态、Override）表现符合 PRD。
- **部署链路不变**：`BASE_PATH`、`404.html`、路由 basename 保持可用（GitHub Pages 子路径）。

---

## 7. 执行顺序（建议 todo 拆分）
1. 3.1 types → 3.2 settings/rubricStore → 3.3 scoring →（底座可编译）
2. 3.4 sessionStore + selectors →（状态机可用）
3. 3.12 权限/PII → 3.14 Layout →（骨架可跑）
4. 3.5 Home → 3.6 AssignModal → 3.8 TaskDetail → 3.9 SamplingModal → 3.7 Annotation → 3.10 Settings → 3.11 Import → 3.13 CSV
5. 3.x mock 种子数据（caseSets/sessions/conversation）对齐新模型
6. `check`/`lint`/`build` + 本地点通 §6 全流程
