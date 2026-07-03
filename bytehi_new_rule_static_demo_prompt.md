# ByteHi Manual Annotation Tool - New Rule 静态 Demo 说明

> 这份文档用于配合 PRD，给 Claude 生成静态 demo 使用。目标不是实现真实后端，而是把页面结构、核心交互、视觉风格和 mock 数据讲清楚，让 demo 能准确表达产品意图。

## 1. Demo 目标

请生成一个 **ByteHi Manual Annotation Tool - New Rule** 的静态前端 demo。这个 demo 用于展示人工标注工具如何从旧规则适配到新规则，包括 New Rule 首页、导入 Sample、Settings、任务详情、标注页、复核流程和 CSV 导出。

Demo 只需要静态交互和 mock data，不需要真实 API、不需要真实登录、不需要真实 CSV 上传解析，也不需要真实保存到后端。重点是让产品、设计、研发可以一眼看懂：这个平台有哪些页面、每个页面做什么、用户如何从一个页面跳到另一个页面，以及 SQS / UES 新规则在页面上如何呈现。

## 2. 页面范围

当前版本按 **6 个核心页面 + 4 个流程视图 / 弹窗** 来理解。下载 CSV 是动作，不算独立页面。

### 2.1 6 个核心页面

1. **新规则首页 / Case Set Home**：展示 New Rule task 列表、汇总指标和主要入口。
2. **导入 Sample**：支持从 ByteHi 导入或上传 CSV，并展示解析结果预览。
3. **New Rule Settings**：只维护标注辅助配置，例如 Reason Templates、RCA Labels、配置版本和生效时间。
4. **任务详情页 / Detail Session List**：展示某个 task 下的 session / case 明细列表。
5. **标注页 / Annotation Page**：左侧是 evidence / conversation，右侧是 SQS / UES scoring panel。
6. **复核入口 / Audit Review Entry**：展示 QC / review 相关流程入口和状态。

### 2.2 4 个流程视图 / 弹窗

1. **Assign / Reassign 弹窗**：分配或重新分配 annotator / QA owner。
2. **Double-blind Annotation 视图**：A/B 双盲标注的 first-round annotation 视图。
3. **Result Compare / AB Common Sense 视图**：A/B 双方提交后展示差异，并提交 AB Common Sense。
4. **Sampling / C Review 视图**：支持抽样和 C review，最终形成 final result。

## 3. 总体视觉风格

整体风格参考企业级 SaaS / 内部工具后台，不要做成营销网站。信息密度可以偏高，但层级必须清楚。

### 3.1 布局风格

整体采用浅灰背景 + 白色卡片。页面顶部保留清晰 header，左侧可使用窄侧边导航或 tab，主体区域以表格、卡片、抽屉和右侧评分面板为主。

标注页采用 **左 evidence、右评分** 的布局。左侧约 60% 宽度，用于展示 conversation / ticket thread。右侧约 40% 宽度，用于展示 Session Information、SQS、UES、Human Result、Submit。

复核页可以采用三栏结构：左侧 Original Session / Evidence，中间 Annotator Result / Compare，右侧 Review Mode / Final Review Result。

### 3.2 颜色建议

请使用克制、干净的后台工具色彩。推荐色值如下：

| 用途 | 颜色 | 说明 |
|---|---:|---|
| Primary / New Rule 主色 | `#2563EB` | 蓝色，用于主按钮、当前 tab、New Rule badge |
| Hover / Light Blue | `#EFF6FF` | 蓝色浅背景，用于选中态、提示卡片 |
| Success / Pass | `#16A34A` | 绿色，用于 SQS Pass、提交成功 |
| Success Light | `#ECFDF3` | 绿色浅背景 |
| Warning / Review Needed | `#F59E0B` | 橙色，用于 pending review、not ready |
| Warning Light | `#FFFBEB` | 橙色浅背景 |
| Fail / Gatekeeper / Auto-zero | `#DC2626` | 红色，用于 fail、gatekeeper hit、auto-zero warning |
| Fail Light | `#FEF2F2` | 红色浅背景 |
| Disabled / Not Ready | `#9CA3AF` | 灰色，用于 disabled field、SOP not ready |
| Page Background | `#F7F8FA` | 页面背景 |
| Card Background | `#FFFFFF` | 卡片背景 |
| Primary Text | `#111827` | 主文字 |
| Secondary Text | `#6B7280` | 辅助文字 |
| Border | `#E5E7EB` | 分割线、卡片边框 |

### 3.3 组件风格

状态类信息尽量使用 badge / tag / banner，而不是大段文字。比如 New Rule 使用蓝色 badge，SQS Pass 使用绿色 badge，No Pass 使用红色 badge，SOP not ready 使用灰色或黄色 tag，Gatekeeper hit 使用红色 warning banner。

Conversation evidence 不要直接渲染大段黑白 HTML。请做成更易读的聊天气泡或 message thread。User 和 Assistant 使用不同浅色背景，并保留 message id，例如 `#1 User`、`#2 Assistant`。如果 evidence 中有关键匹配结果，可以用浅黄色 highlight。

## 4. 页面与交互要求

### 4.1 新规则首页 / Case Set Home

首页展示 New Rule 工作区。顶部可以有 Old Rule / New Rule 切换，但 demo 默认选中 New Rule。Old Rule 不需要展开，只要表现出新旧规则隔离即可。

首页需要展示四个核心指标卡片：SQS Avg、UES Avg、SQS Pass Rate、QC Accuracy。这里的指标来自 `annotation_summary.csv` 对应的汇总层数据，而不是从明细表临时拼出来的模糊结果。

首页下方展示 task / case set 列表。每行至少包含 Task Name、Sample Name、Total Cases、Annotated Cases、Progress、SQS Avg、UES Avg、QC Status、Actions。Actions 包括 Detail、Assign、Audit、Download CSV。

首页主要入口包括：Import Sample、Upload CSV、Settings、Detail、Assign、Audit、Download CSV。

### 4.2 导入 Sample

导入入口命名为 **Import Sample / 导入 Sample**，不要写成 Import Session List，避免和 Session List 产品功能混淆。

导入方式有两个入口：Import from ByteHi 和 Upload CSV。Demo 中只需要做静态 tab 或按钮，不需要真实上传。

导入后展示解析预览表。字段包括 session id、session link、language、region、service subtype、knowledge source、problem type、annotator、status。系统字段只用于核验，如果字段异常，展示 feedback / data issue 提示，不要让 annotator 在标注页直接改写系统识别字段。

如果识别为 SOP，但缺少稳定 input / flow evidence，展示 `input missing / not ready`，但不要阻塞 Skill / FAQ case 标注。

### 4.3 New Rule Settings

Settings 只服务 New Rule，不展示 Old Rule 配置，也不兼容 Old Rule 配置。

Settings 只维护标注辅助内容，不控制评分公式。不要在 Settings 里做 SQS / UES 权重、分数档位、SQS gating、UES Gatekeeper 的配置。

Settings 包含三个部分：Reason Templates、RCA Labels、Config Version / Effective Time。

Reason Templates 按 SQS / UES 维度维护默认 reason 文案。Bot Result 和 Human Result 共用同一套模板。

RCA Labels 是可选问题标签，用于后续归因分析，不参与 SQS / UES 分数计算。示例包括 wrong Skill / FAQ、wrong branch / action、FAQ answer incomplete、wrong language、high friction、expectation not met、insufficient evidence。

Config Version / Effective Time 用来表达配置版本和生效时间。示例：`v2026.06.23`，`Effective from 2026-06-23 10:00`。历史 annotation result 展示其当时使用的配置版本，不被后续修改静默覆盖。

### 4.4 任务详情页 / Detail Session List

Detail 是某个 task 下的 individual session list。New Rule task 进入 Detail 后，只展示 New Rule 字段，不混用 Old Rule 的 P/Q/I、GE Rate 字段。

表格列建议包括：Session ID、Task ID、Service Subtype、Knowledge Source、Language、Region、QA Owner、Annotator、Understanding Accuracy、Execution Correctness、Solution Adoption、SQS Total、SQS Pass、Responsiveness、Service Efficiency、Expectation Achievement、Language Quality、UES Total、RCA Label、Status、Latest Activity Log、Actions。

筛选项建议包括：Service Subtype、Knowledge Source、SQS Pass / No Pass、UES Dimension、Score、RCA Label、Annotator、QA Owner、Review Status。

点击 Session ID 或 Edit Annotation 进入标注页。Assign QA 打开 Assign / Reassign 弹窗。Activity Log 可以作为辅助视图或抽屉，不算核心页面。

### 4.5 Assign / Reassign 弹窗

弹窗标题使用 `Assign Annotators`。如果 case 当前没有 owner，动作是 Distribute；如果 case 已有 owner，动作是 Reassign。

本期优先展示平均分配能力。用户可以输入 QA name / email 和数量，也可以点击 Average Distribution 将剩余 case 平均分给多个 QA。

Assign / Reassign 只改变 owner / annotator，不改变 SQS / UES 分数，也不自动生成 annotation result。

Activity Log 记录 operator email、操作时间、操作类型和变更字段。注意 operator email 表示“谁执行了这次操作”，不是“谁被分配为 annotator”。

### 4.6 标注页 / Annotation Page

标注页是核心页面。左侧展示 evidence / conversation，右侧展示 scoring panel。

右侧 scoring panel 从上到下展示：Score Preview、Session Information、Bot Result、Human Result、二次确认、Submit。

Score Preview 展示 SQS Total、UES Total、Pass / Fail。Session Information 可折叠，展示 Case、Session Link、Session ID、Task ID、Service Form、Channel、Entrance、Service Type、Service Subtype、Language、Region、Knowledge Source、Problem Type、Signal Priority。

Bot Result 包含 SQS 和 UES。Human Result 只有系统识别到 Bot to Human IM 或 Bot to Human Ticket 时自动展示。纯 Bot case 不展示 Human Result。Human Result 的表单结构与 Bot Result 一致，并复用同一套 Reason Templates、RCA Labels、校验逻辑。

### 4.7 SQS 标注区块

Understanding Accuracy 展示 first meaningful user query、actual matched knowledge source、negative understanding signals。分数按钮直接展示 3 / 2 / 1 / 0，不要用多层 dropdown。Annotator 选择分数并填写 reasoning。

Understanding Accuracy 的含义：3 = 无负向理解信号，2 = 1 个负向理解信号，1 = 2 个负向理解信号，0 = 3 个及以上负向理解信号，或始终没有正确理解用户问题。

SQS Gating 保留：如果 Understanding Accuracy = 0，Execution Correctness 和 Solution Adoption 自动置 0，下游字段置灰，并展示 auto-zero reason。如果 Understanding Accuracy 改回非 0，下游字段恢复可编辑。

Execution Correctness 根据 Knowledge Source 切换。Skill case 展示 expected vs actual evidence，并判断 route / stage、branch / scenario、action / reply。FAQ case 只判断回答是否正确完整，分数为 3 / 1 / 0，不提供 2。SOP case 若 evidence 不完整，展示 input missing / not ready，MVP 不要求完整 SOP 标注。

Solution Adoption 展示 Problem Type、Signal Priority、Score、Reasoning。分数为 3 / 1 / 0，不提供 2。

### 4.8 UES 标注区块

UES 顶部先判断 Gatekeeper。Gatekeeper 选项包括 wrong language、offensive attitude、severe formatting、dead loop、other severe experience defect。

如果命中任一 Gatekeeper，UES Total = 0，四个 UES 子维度置灰 / 跳过，并要求填写 Gatekeeper reason 与 RCA Label。

如果没有命中 Gatekeeper，展示四个 UES 维度：Responsiveness、Service Efficiency、Expectation Achievement / Expected Resolution、Language Quality。

Responsiveness 可以根据 service type timestamp 自动预填，但人工可复核。Service Efficiency 依据负向效率信号评分，例如 repeated rejected solution、repeated information request、invalid follow-up、redundant confirmation。Expectation Achievement 判断用户预期是否达成。Language Quality 覆盖 empathy、language、tone、clarity、formatting。

### 4.9 复核入口 / Audit Review

Audit / Review 是 QC / review 的产品入口。它不等于 double-blind 本身。Double-blind 是 first-round annotation 方法，Sampling / C Review 才是后续 QC 环节。

复核入口需要有类似 Meego / Jira 的流程状态视图。用户应该能看懂 case 当前处于 Single QC、Double-blind Annotation、Result Compare、AB Common Sense、Sampling / C Review，还是 Final Result Ready，并知道下一步动作。

Single QC 流程是 C 直接复核已提交的 annotation records。Double-blind 流程是 A/B 对同一 case 独立标注，双方都提交前互相不可见。双方提交后才能进入 Result Compare / Mismatch view。

### 4.10 Result Compare / AB Common Sense

Result Compare 展示 A Result 和 B Result 的差异。建议用三栏结构：左侧 Original Session / Evidence，中间 A Result vs B Result diff，右侧 AB Common Sense form。

差异需要按维度展示，例如 Understanding Accuracy、Execution Correctness、Solution Adoption、UES dimensions、Reasoning、RCA Label。A/B 讨论后提交 AB Common Sense。AB Common Sense 不覆盖 A Result 或 B Result，三份记录都要保留，便于追溯。

### 4.11 Sampling / C Review

Sampling 的对象取决于任务流程。如果使用 double-blind，则抽样对象是完成 AB Common Sense 的 records。如果使用单人标注 + C 抽检，则抽样对象是已提交的 annotation records。

Sampling scope 包括 All Completed Records、By Annotator、By Service Subtype、By Knowledge Source、By SQS Fail、By UES Dimension、By RCA Label。Sampling method 支持 Percentage 和 Absolute number。

C Review 页面也可以使用三栏结构：左侧 Original Session / Evidence，中间 Annotator Result 或 AB Common Sense，右侧 C Decision / Final Review Result。

Final Result 取决于实际流程：单人标注 + C review 使用 C review 后结果；double-blind 未抽检时可使用 AB Common Sense；double-blind 且进入 C review 时使用 C review 后最终结果。

### 4.12 CSV Export

CSV Export 不需要单独页面，只作为首页或详情页操作。请展示两个下载按钮：`annotation_summary.csv` 和 `annotation_data.csv`。

`annotation_summary.csv` 是汇总层文件，用来看整体指标，例如 Annotated Cases、Total Cases、SQS Avg、UES Avg、SQS Pass Rate、QC Accuracy。

`annotation_data.csv` 是明细层文件，一行对应一个 session / case，用来看每条标注结果和原因。New Rule data 文件应保留基础字段，例如 session id、language、region、conversation / evidence。旧版 P/I/RQ/IE 结果字段需要替换为 SQS / UES 结果字段。

## 5. Mock Data

### 5.1 Summary Mock

```json
{
  "annotatedCases": 128,
  "totalCases": 1000,
  "sqsAvg": "2.43 / 3",
  "uesAvg": "2.10 / 3",
  "sqsPassRate": "78.5%",
  "qcAccuracy": "92.0%",
  "gatekeeperHitRate": "6.0%",
  "avgReviewTime": "3m 24s"
}
```

### 5.2 Case Set Mock

```json
[
  {
    "taskName": "New Framework Optimization 0610-0614",
    "sampleName": "Control Group Sample",
    "totalCases": 1000,
    "annotatedCases": 128,
    "progress": "12.8%",
    "sqsAvg": "2.43 / 3",
    "uesAvg": "2.10 / 3",
    "qcStatus": "Review Pending",
    "ruleVersion": "v2026.06.23"
  },
  {
    "taskName": "FAQ Quality Regression Check",
    "sampleName": "FAQ R1 Sample",
    "totalCases": 300,
    "annotatedCases": 240,
    "progress": "80.0%",
    "sqsAvg": "2.18 / 3",
    "uesAvg": "1.96 / 3",
    "qcStatus": "Final Result Ready",
    "ruleVersion": "v2026.06.23"
  }
]
```

### 5.3 Session Row Mock

```json
[
  {
    "sessionId": "7649359668829100562",
    "taskId": "TASK-20260623-001",
    "language": "en",
    "regionCode": "UG",
    "serviceSubtype": "Chatbot",
    "knowledgeSource": "Skill",
    "problemType": "R2 Personalized Info",
    "signalPriority": "P1 Content Evaluation",
    "qaOwner": "Zoe",
    "annotator": "Annotator A",
    "understandingAccuracy": 2,
    "executionCorrectness": 3,
    "solutionAdoption": 1,
    "sqsTotal": 2.0,
    "sqsPass": true,
    "responsiveness": 3,
    "serviceEfficiency": 2,
    "expectationAchievement": 1,
    "languageQuality": 3,
    "uesTotal": 2.25,
    "rcaLabel": "high friction",
    "status": "Annotation Submitted",
    "latestActivityLog": "Zoe edited Language Quality at 2026-06-23 19:42"
  },
  {
    "sessionId": "7649237927054170625",
    "taskId": "TASK-20260623-002",
    "language": "en",
    "regionCode": "PH",
    "serviceSubtype": "Ticketbot",
    "knowledgeSource": "FAQ",
    "problemType": "R1 Information",
    "signalPriority": "P1 Content Evaluation",
    "qaOwner": "Aaron",
    "annotator": "Annotator B",
    "understandingAccuracy": 1,
    "executionCorrectness": 1,
    "solutionAdoption": 0,
    "sqsTotal": 0.67,
    "sqsPass": false,
    "responsiveness": 2,
    "serviceEfficiency": 1,
    "expectationAchievement": 1,
    "languageQuality": 2,
    "uesTotal": 1.5,
    "rcaLabel": "FAQ answer incomplete",
    "status": "Review Pending",
    "latestActivityLog": "Aaron reassigned QA owner at 2026-06-23 20:18"
  },
  {
    "sessionId": "7650714612966529552",
    "taskId": "TASK-20260623-003",
    "language": "ar",
    "regionCode": "SA",
    "serviceSubtype": "Chatbot",
    "knowledgeSource": "Skill",
    "problemType": "R3 Operation",
    "signalPriority": "P0 Objective System Signal",
    "qaOwner": "Zoe",
    "annotator": "Annotator C",
    "understandingAccuracy": 3,
    "executionCorrectness": 2,
    "solutionAdoption": 3,
    "sqsTotal": 2.67,
    "sqsPass": true,
    "uesGatekeeperHit": true,
    "uesGatekeeperReason": "wrong language",
    "uesTotal": 0,
    "rcaLabel": "wrong language",
    "status": "Gatekeeper Hit",
    "latestActivityLog": "Annotator C submitted Gatekeeper reason at 2026-06-23 21:02"
  },
  {
    "sessionId": "7650548113656060423",
    "taskId": "TASK-20260623-004",
    "language": "ar",
    "regionCode": "SA",
    "serviceSubtype": "Ticketbot",
    "knowledgeSource": "SOP",
    "problemType": "R3 Operation",
    "sopStatus": "input missing / not ready",
    "status": "Pending Evidence",
    "latestActivityLog": "System marked SOP evidence not ready at 2026-06-23 21:30"
  }
]
```

### 5.4 Conversation Evidence Mock

```json
{
  "sessionId": "7649359668829100562",
  "messages": [
    {
      "id": 1,
      "role": "User",
      "type": "manual_input",
      "text": "I am receiving my verification code"
    },
    {
      "id": 2,
      "role": "Assistant",
      "type": "llm_gen",
      "matchedFaq": "I am not receiving my phone or email verification code",
      "text": "I understand you're having trouble receiving your verification code. Please double-check that the phone number or email is correct, and check spam or junk folders."
    },
    {
      "id": 3,
      "role": "System",
      "type": "evidence",
      "text": "Matched Skill: Account Verification Assistant, version v3.2.1"
    }
  ]
}
```

### 5.5 Review Flow Mock

```json
{
  "sessionId": "7649359668829100562",
  "annotationMode": "Double Blind",
  "currentState": "Result Compare",
  "aAnnotator": "Annotator A",
  "bAnnotator": "Annotator B",
  "aResultStatus": "Submitted",
  "bResultStatus": "Submitted",
  "mismatchStatus": "Mismatch Found",
  "abCommonSenseStatus": "Pending",
  "cReviewer": "Reviewer C",
  "finalResultStatus": "Not Ready"
}
```

## 6. 静态交互建议

Demo 可以用 mock state 做几个关键交互，不需要真实业务逻辑。

建议支持这些静态交互：点击 Home 的 Detail 进入任务详情；点击 Session ID 进入标注页；在标注页点击 Understanding Accuracy = 0 时展示 SQS auto-zero；点击 UES Gatekeeper 时展示 UES auto-zero；切换 hasHumanTransfer 时展示 / 隐藏 Human Result；点击 Audit 进入复核入口；在 review flow 中切换 Single QC / Double-blind / Result Compare / C Review 状态；点击 Download CSV 展示两个 mock 下载按钮。

## 7. 不要做的内容

不要接真实 ByteHi API，不要做真实 CSV 上传解析，不要做真实权限系统，不要做真实保存 / 提交 / 下载，不要实现复杂后端数据模型。

不要混用 Old Rule。New Rule 页面不展示 GE Rate 作为主指标，不展示旧版 P/Q/I 结果列，不使用 Intent Reason、Quality Reason、Interaction Reason 作为 New Rule filter。

不要在 Settings 做分数权重配置、gating 开关、Gatekeeper 开关、多套 Bot / Human 独立配置或复杂字段显隐配置。

不要集成真实 Skill 小工具，不要做实时 SOP flow 判断，不要让 annotator 在标注页直接改写系统识别字段。

不要把 double-blind 写成 QC / Audit 的一种模式。Double-blind 是 first-round annotation 方法；Sampling / C Review 才是后续 QC 环节。

不要做复杂动画、移动端优先适配或过度装饰。Demo 的重点是信息架构、状态表达和交互理解。
