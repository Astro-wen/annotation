# Demo 截图清单（New Rule · Phase 1）

> 用途：把所有「可以直接截图给别人看」的 PRD 场景集中列出，含页面路径、操作/筛选参数、预期看到什么。
> 前置：在**首页**点 **Load Demo Sample**，会注入两个已跑完流程的样本 task：
> - `TASK-DEMO-001 · Demo Sample 单人评`
> - `TASK-DEMO-002 · Demo Sample 双人评`
>
> 顶部「Account」可切换账号来演示两档权限与防自审：
> - 标注员：`标注员A / 标注员B / 标注员C`
> - 标注只读：`标注只读`（仅查看，不能写）
>
> 本地运行：`npm run dev`（GitHub Pages 线上同一套）。所有会话正文 PII 已脱敏为占位符（`[EMAIL]/[PHONE]/[ADDRESS]`）。

---

## A. 首页 Home（`/home`）

| # | 场景 | 操作 / 位置 | 预期截图内容 |
|---|---|---|---|
| A1 | New/Old Rule 隔离 | 顶部开关，默认 New（左） | New Rule 表格；切 Old Rule 显示隔离占位面板 |
| A2 | 当前生效标准版本 | 标题下方 + 顶栏 | `Config v{n}` |
| A3 | 评分模式列 | Demo-001=Normal、Demo-002=Back-to-Back、其余=未分配 | 三种「评分模式」badge |
| A4 | Cases / Invalid | Demo-001 的 Cases 列 | 有效数 + `(Invalid 1)` 角标（case 12） |
| A5 | Annotation Finish Rate | Demo-001 行 | `已完成A/有效 (xx%)` |
| A6 | Back-to-Back Complete Rate | Demo-002 行 | B 完成率；Normal 行显示 `—` |
| A7 | QC Complete | Demo-001 / Demo-002 行 | `定案数 / 抽样数` |
| A8 | 三类 SQS/UEF/UXS + QC Acc | 合并小表列（Chatbot/Ticketbot/Human） | 每类一行数值；无数据显示 `—` |
| A9 | 三类 QC Accuracy 分别展示 | 同上「QC Acc」列 | Demo-001 有 Chatbot 数值、其它类 `—` |
| A10 | Actions 行内五按钮 | 行内 | Detail / Assign / Sampling / Export / Download |
| A11 | Demo-only 说明 | 过滤栏右侧 + 顶部按钮 | 「Settings 与 Clear All Data 为 Demo-only」；Load Demo Sample / Clear All Data 按钮 |
| A12 | Download CSV 菜单 | 行内 Download | summary / data(仅最新 vs 含历史) 两项 + 切换 |

---

## B. 批量分配 Batch Assign（首页 Actions → Assign）

| # | 场景 | 操作 | 预期截图内容 |
|---|---|---|---|
| B1 | Type-based 分配 | 对**未分配**的内置 task（如 Skill Routing Audit）点 Batch Assign | 列出实际存在的 Type 1..8、Annotation Category、结果组合、total / remaining、勾选框 |
| B2 | Normal / Back-to-Back 二选一 + 锁定 | 首次分配选模式 → 二次确认弹窗 | 「确认锁定标注模式？」对话框 |
| B3 | QA 名搜索 | QA Name 输入框 | 输入联想出账号下拉 |
| B4 | Normal 数量分配 | QA Name + Quantity 多行 + Add more；Remaining 实时更新 | 剩余量随数量变化 |
| B5 | Back-to-Back 成对 | 选 Back-to-Back → A｜B｜Quantity | 成对表 |
| B6 | 边界校验 | 数量超过 remaining / A=B（标注编辑） | 明确红色报错 |
| B7 | 模式已锁定 | 对 Demo-001（已 Normal）点 Assign | 顶部「已锁定：Normal」，模式按钮禁用 |

---

## C. 详情页 Detail / Session List（首页 → Detail，`/task/TASK-DEMO-001` 或 `-002`）

| # | 场景 | 操作 / 筛选 | 预期截图内容 |
|---|---|---|---|
| C1 | Case 列表整体 | 打开 Demo-001 | Session ID、Subtype 多标签、Source、SQS/UEF、UXS、Transfer(只读)、Assign QA、Status、Actions |
| C2 | SQS / UEF 表头展开逐维 | 点表头 SQS / UEF 的箭头 | 展开出 6 个 SQS 维度列 / UEF 列，含数字或 `Skip` |
| C3 | 多结果分组（Type 2） | Demo-001 case 007 | 同一行按 Chatbot / Ticketbot 分组展示分数 |
| C4 | 状态齐全 | 观察各行 Status | Unassigned / Assigned / Submitted (No QC) / Waiting for QC / QC Completed / 待拉齐（Diff）/ Invalid |
| C5 | Invalid 整行置灰 | Demo-001 case 012 | 灰色行 + Restore 图标 |
| C6 | 待拉齐（Diff） | Demo-002 case 010，展开 B 行 | A/B 行红色「拉齐 Diff」按钮 |
| C7 | 快速拉齐弹窗 | C6 点「拉齐 Diff」 | 逐维 A/B 分歧，可选数字或 Skip，「确认拉齐并进入 QC 池」 |
| C8 | Back-to-Back 展开 B 行 | Demo-002 任意行点小三角 | 深色「B · 姓名 盲检」行 |
| C9 | C 行（QC） | Demo-002 case 009/011 展开 | 「C · QC · 姓名」行，Do QC / View QC |
| C10 | Expand all / Collapse all | 顶部工具栏 | 一次展开/收起全部 B、C 行 |
| C11 | Filter：Service Subtype | 顶部下拉 | 按 CHATBOT/TICKETBOT/HUMAN_IM/HUMAN_TICKET 过滤 |
| C12 | Filter：Knowledge Source | 顶部下拉 | Skill/FAQ/SOP |
| C13 | Filter：Problem Type | 顶部下拉 | R1/R2/R3 |
| C14 | Filter：流程状态 | 顶部下拉 | All/Unassigned/Assigned/Submitted(No QC)/待拉齐/Waiting for QC/QC Completed/Invalid |
| C15 | **按 annotator 筛选 → 个人准确率** | 顶部 Annotator 选 `标注员A`（Demo-001）| 顶部出现「标注员A 个人准确率：Chatbot/Ticketbot/Human」三类数值 + 连带说明 |
| C16 | 个人准确率（双人评，谁评算谁） | Demo-002 Annotator 选 `标注员C` 或 `标注员B` | 各自个人准确率（case 011 首评与定案差一维 → 非满分） |
| C17 | Assign QA 单条改派 | 某行 Assign A / Assign B | 单条指派弹窗 + 防自审提示 |
| C18 | Batch Edit | 勾选若干行 → Batch Edit | 按维度选 reason；权限说明（编辑仅未进 QC 的） |
| C19 | Mark / Restore Invalid | 行 Actions 的 Ban / Restore | 标注编辑在 QC Completed 前可操作；标注只读不可 |
| C20 | Activity Log 抽屉 | 行 Actions 的文件图标（选 QC 完成的 case 011） | 时间/operator/角色/动作/version；含 A→B→拉齐→C 全链 |
| C21 | 版本快照 | Activity Log 里点 `V{n}` | 逐维分数 + Skip + SQS/UEF/UXS |
| C22 | 导出 Activity Log CSV | 抽屉右上 Export CSV | 下载单条 case 日志 |

---

## D. 标注页 Annotation（Detail 点 Session ID / Annotate / Do QC）

| # | 场景 | 操作 | 预期截图内容 |
|---|---|---|---|
| D1 | 左 60% evidence / 右 40% 评分 | 打开任意 case | 左对话气泡（PII 占位符）、右评分区 |
| D2 | 按 expected_results 出评分卡 | Demo-001 case 007（Type2） | 两张 AI 评分卷（Chatbot / Ticketbot） |
| D3 | 顶部总分预览 | 卡片头 | SQS / UEF / UXS 实时预览 |
| D4 | Execution Correctness 随 Knowledge Source | 打开 Skill vs FAQ/SOP 的 case | Skill=3/2/1/0；FAQ·SOP=3/1/0（无 2 档） |
| D5 | Solution Adoption 先选 R1/R2/R3 | 该维上方 | 必须先选 problem type 才能打分 |
| D6 | Responsiveness 系统自动只读 | 该维 | 直接给值、只读说明 |
| D7 | **维度级 Skip** | 任一维点 Skip | 该维置灰 + 必选 Skip Reason 下拉；可切回数字 |
| D8 | 提交校验 | 底部提交按钮 | 每维需「数字或 Skip(+Reason)」才可提交 |
| D9 | 复核视角 | Demo-002 case 009 走「复核」（切到被指派的复核人=标注员C 账号） | 评分表空白 + 右侧只读「冻结的定稿基线」，不展示原始分歧 |
| D10 | 防自审拦截 | 用曾作为 A 的账号去复核 | 「你已标过当前 session！」拦截页（任何人都不能绕过） |
| D11 | 只读 View | QC 完成后点 View / View QC | Read-only 标记、不可提交 |

---

## E. 抽样 Set Sampling（首页 Actions → Sampling）

| # | 场景 | 操作 | 预期截图内容 |
|---|---|---|---|
| E1 | Available X of Y | 对 Demo-001 点 Sampling | 顶部「Available to sample: X of Y」+ Invalid/防自审排除数 |
| E2 | Scope All QAs / By QA | 切换 Scope | By QA 出 QA 下拉 |
| E3 | Method Percentage / Absolute | 切换 Method | %(1–100) 或 绝对数量输入 |
| E4 | Target / Already sampled / This time | 预览区 | 三个数值随输入变化（累加抽样） |
| E5 | 指派复核人 + 防自审 | C 下拉 | 防自审强制生效：复核人不能是该 case 的 A/B（无人可绕过） |
| E6 | 分配即可抽样（并行） | 打开 Sampling | 提示「分配完成即可抽样，A/B 标注与复核并行」；未分配的 case 计入「未分配（不可抽样）」不进池 |

---

## F. Settings（首页 → Settings，`/settings`，Demo-only）

| # | 场景 | 位置 | 预期截图内容 |
|---|---|---|---|
| F1 | North Star Weights | 权重区 | SQS/UEF 滑块 + 归一化公式 UXS = w·SQS + w·UEF |
| F2 | Reason Templates + 只增不减维度 | SQS/UEF 分区 | 维度启停、reason 编辑、Built-in 不可删 |
| F3 | **Skip Reasons 管理** | Skip Reasons 区 | 可增删/编辑 Skip Reason，随版本记录 |
| F4 | 加新维度 | Add Dimension | 新增自定义维度弹窗 |
| F5 | Config Version / 版本历史 | 版本区 | 当前版本 + 生效时间 + 版本历史列表 |
| F6 | 发布新版本二次确认 | Apply Changes | 「Publish a new rubric version v{n+1}」确认框 |

---

## G. 导入 Import（首页 → Upload CSV / Import from ByteHi，或 `/import`）

| # | 场景 | 操作 | 预期截图内容 |
|---|---|---|---|
| G1 | 两个导入入口 | Import Sample 页 | Import from ByteHi / Upload CSV |
| G2 | CSV 模板下载 | Download CSV template | 新字段模板 |
| G3 | 解析预览 + 服务结果识别 | 预览表 | Case Type、Annotation Category、Expected Results（结果类型 badge）、Transfer to human |
| G4 | 错误清单 | 上传含重复/缺字段的 CSV | 错误清单（clean 时显示 No import errors） |

---

## H. 导出 CSV（首页/详情页 Download）

| # | 场景 | 操作 | 预期截图内容（用文本编辑器/表格打开） |
|---|---|---|---|
| H1 | annotation_summary.csv | Download → summary | 按 result_type 三类；含 `sqs_avg/uef_avg/uxs_avg`、六维一致率、`uef_accuracy`、`qc_accuracy`、各维 `*_skip_count`、`config_version` |
| H2 | annotation_data.csv（仅最新） | Download → 仅最新结果 | 每 Case×结果一行，含 `result_type/service_subtypes/entry_mode/case_status/final_source`、每维 `<dim>/<dim>_is_skip/<dim>_skip_reason`、`uxs` |
| H3 | annotation_data.csv（含历史） | 切「包含历史结果」 | 增 `round/role/is_final/round_submitted_at/config_version`，每轮一行 |
| H4 | 字段统一 UEF | 任一导出 | 无 `ues*`；无单条 session qc_accuracy；无 PII 明文 |

---

## 速查：Demo-001（单人评）各 case 场景

> 映射：标注员A=`editor.a`，标注员B=`editor.b`，标注员C=`editor.c`，标注只读=`viewer`。

| Case | 场景 | 关键人物（标注 / 复核） |
|---|---|---|
| C001 | 复核完成，准确率 100% | 标注=标注员A，复核=标注员B |
| C002 | 复核完成，复核改一维（准确率<100%）| 标注=标注员B，复核=标注员C |
| C003 | 待复核（已抽样）| 标注=标注员A，复核=标注员B |
| C004 | 已提交（未抽样）| 标注=标注员B |
| C005 | 已分配（未评）| 标注=标注员C |
| C006 | 未分配 | — |
| C007 | Type2 多结果 · 复核完成（含 Skip 一致）| 标注=标注员A，复核=标注员B |
| C008 | Ticket 转人工 · 待复核（Human Ticket）| 标注=标注员B，复核=标注员A |
| C012 | Invalid | 原标注=标注员A |

## 速查：Demo-002（双人评）各 case 场景

| Case | 场景 | 关键人物（标注1 / 标注2 / 复核） |
|---|---|---|
| C009 | 两人一致 → 待复核 | 标注员A / 标注员B / 复核=标注员C |
| C010 | 待拉齐（Diff）| 标注员A / 标注员B |
| C011 | 拉齐 → 复核完成，个人准确率可算 | 标注员C(首评差一维) / 标注员B / 复核=标注员A |
