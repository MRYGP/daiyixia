# AI 假发试戴技术路线深度研究报告

> 版本：v1.0 · 2026-05-26 研究范围：仅限假发 AI 试戴技术路线，不含商业模式与市场分析

------

## 0. 执行摘要（结论先行）

**技术可行性判断：中等强度（中）**

核心结论：假发 AI 试戴在 2026 年已有可用路线，但"商品保真（特定 SKU）× 人脸保持 × 发际线自然"三合一仍是行业级难题，没有任何现成 API 能开箱即解。

**推荐路线（7天优先级）：**

1. **首选：FLUX Kontext Multi + fal.ai/GPT-Image-1 inpainting 组合**（多图参考，调用简单，7天内可出正面样张）
2. **备选：Perfect Corp YouCam AI Hairstyle API**（有专门 wig try-on 端点，接入最快，但 SKU 保真受限于预置风格库，不支持上传任意商品图）
3. **不推荐：3D/AR 路线**（假发柔性发丝短期3D建模不现实）、**纯通用 VTON 路线**（服装 VTON 逻辑不直接迁移到头发）

**小王 Demo 效果差的最可能根因：** 路线选择本身是瓶颈——大概率在用通用 image-to-image 或简单 prompt 编辑，缺少"发区 mask + 人脸 ID 锁定 + 商品参考图注入"三件套，导致结果要么变脸、要么假发特征跑偏。

**7天内不应做侧面**，先把正面单款打穿。

------

## 1. 当前问题复盘——把"效果差"拆开

小王 Demo 典型问题，技术根因映射：

| 现象                | 技术根因                                                     | 修复难度         |
| ------------------- | ------------------------------------------------------------ | ---------------- |
| 发际线不自然/像贴纸 | 缺少 hair segmentation + alpha matting                       | 中（有工具可插） |
| 像贴纸（无立体感）  | 缺光照融合 + 无发丝细节                                      | 中               |
| 变脸                | 没有 identity preservation（FaceID/PuLID 等）                | 高（需加模块）   |
| 商品图特征跑偏      | 生成模型没有 reference image conditioning，靠 prompt 描述假发特征 | 高（是核心瓶颈） |
| 侧脸穿帮            | 模型未针对多视角训练，pose 下头发几何不对                    | 高（7天内绕开）  |
| 光照融合差          | 没有 relighting / color matching 后处理                      | 中               |
| 正侧面不一致        | 不同 prompt 生成，无多视角约束                               | 高（7天内绕开）  |

**核心判断：** 问题不只是 prompt，是整体路线缺少必要的模块组合。改 prompt 能优化 20%，换路线能提升 80%。

------

## 2. 技术路线全景图

### 路线1：通用图像编辑大模型路线

**代表工具：FLUX.1 Kontext / GPT-Image-1 / GPT-Image-1.5**

**FLUX.1 Kontext（Black Forest Labs，2025年6月发布）**

- 支持最多 4 张参考图同时输入，支持 local/global 编辑
- KontextBench 覆盖 5 类任务：local editing、global editing、character reference、style reference、text editing
- 明确支持："Use reference 1 for face identity and reference 2 for hairstyle"
- 在 ComfyUI 中有成熟工作流，发型修改："Change to long braided hair with decorative ribbons"
- 通过 fal.ai / Replicate API 均可调用
- 关键局限：对"特定 SKU 假发商品图"的细节保真，需要配合 inpainting mask 使用；单靠 reference image 不够精确

**GPT-Image-1 / GPT-Image-1.5（OpenAI，2025年4月/2026年3月）**

- GPT-Image-1.5 已支持多图参考、inpainting with mask、multi-turn 编辑
- 1.5 版：高输入保真度，在 GIE-Bench 1000任务基准中功能正确性最高
- 支持 mask-based inpainting（指定头发区域修改，保留脸和背景）
- 单次约 $0.17/图（GPT Image 1），成本中等
- 关键局限：2025年4月版仅支持单图输入，1.5版已改善；fine-tuning 不支持

**通义万相 / 可灵 / 即梦**

- 即梦（字节）2025年9月已全面开放 API，含文生图3.0/3.1、图生图3.0
- 通义万相（阿里）：开源 200亿参数模型，图像编辑能力良好，API流畅
- 主要问题：国内模型的 hair 区域 reference image conditioning 能力，截至本报告未找到专项 wig try-on API 证据
- 可作为后处理补充工具，不建议作为主路线

**适用判断：** FLUX Kontext Multi + inpainting mask 是当前性价比最高的7天路线。

------

### 路线2：专门发型迁移 / hair transfer 模型

**代表：Stable-Hair、HairFastGAN、HairFIT**

> ⚠️ 注意：截至本报告，"Stable-Hair v2" 专项项目在公开 arXiv / GitHub 上未找到独立存在的确认证据。以下为已确认存在的项目。

**HairFastGAN（GAN-based，2024年）**

- 专门做 hair transfer，reference hairstyle → 目标人物
- 支持多视角一致性研究
- 主要问题：GAN 产物，质量上限低于 diffusion；无法精确保留假发 SKU 纹理细节

**InsV2V / 发型迁移类 diffusion 方法（2024-2025）**

- arXiv 上有数篇发型迁移论文，但绝大多数： a. 只做"风格迁移"，不做"特定商品保真" b. 无可运行的商业 API c. 部署需要 24GB+ VRAM

**关键问题：假发 SKU 试戴 ≠ 换发型。** 学术模型做的是"把这种发型迁移过去"，不是"让这顶具体假发戴上去后看起来像真的"。两者在商品保真要求上有本质差异。

**适用判断：** 学术路线短期不适合产品化，可关注但不作为7天主战场。

------

### 路线3：VTON 服装试穿技术迁移路线

**代表：FASHN v1.5（fal.ai 上可直接调用）、IDM-VTON、CatVTON**

**FASHN v1.5（在 fal.ai 上已上线）**

- 专门 VTON API：model_image + garment_image → 试穿图
- 15秒内出图，576×864 分辨率
- 商品保真能力强（对服装），支持 flat-lay 和 on-model 商品图
- **关键问题：** FASHN 的训练数据是服装，不是发丝。头发的柔性、透光、发际线等特性与服装完全不同，迁移效果未经验证

**服装 VTON 的可借鉴方法论（不是直接迁移）：**

- warping + refinement 两阶段思路（先形变对齐，再细节融合）
- mask-aware loss（只惩罚头发区域的误差）
- 这些**设计思路**值得参考，但需要针对发丝特性重新实现

**适用判断：** 直接 call FASHN API 用于假发——效果大概率差（未验证，标为 C 级证据）。借鉴其工程思路有价值。

------

### 路线4：商业 API / SDK 路线

#### A. Perfect Corp（YouCam）

**核心发现：有专门的 AI Hairstyle VTO API 和 Virtual Wig Try-On API**

- API 端点：`task/hair-style`，流程：上传图 → 获取 File ID → 指定 style ID → 轮询结果
- 有 MCP 接入支持（YouCam API 可在 Claude Desktop / Cursor 中直接调用）
- 提供 Virtual Wig Try-On + Hair Extensions + Bangs + Volume Generator 等细分 API
- **关键局限：style ID 来自 Perfect Corp 预置风格库，无法上传任意假发商品图作为 reference**。这意味着 SKU 保真度完全受 Perfect Corp 风格库约束，无法让用户试戴"这顶具体的假发"
- 计费：credits 制，具体单价需查官方控制台

**适用判断：** 如果卖家只需要"用户试戴主流发型风格"，直接接 YouCam API 是最快路线（2周集成）。如果需要"试戴店铺内某一顶具体假发"，YouCam 无法满足。

#### B. Banuba TINT

**核心发现：被 2026年第三方评测评为"Best-in-class"虚拟假发试戴 SDK**

- 9年 R&D，专注发丝 AR/AI，覆盖：wigs、hair extensions、hair color
- 支持自定义品牌假发：添加特定发型到库、定制结账流程、调整 UI
- 支持 marketplace / multi-seller 平台
- **关键局限：** 自定义 wig 是通过提交定制需求（而非上传商品图 → 自动生成），并非即插即用的 reference image API
- 企业授权，价格未公开（需商务）

**适用判断：** 如果方向是做"假发平台级 SDK 嵌入"，Banuba TINT 是最成熟的企业方案。Demo 阶段成本高，不适合 7 天快速验证。

#### C. fal.ai 上的 hair-change API

- 端点：`fal-ai/image-editing/hair-change`
- 输入：image_url + desired hair style（文字描述）
- **关键局限：** 仍是文字描述驱动，不支持上传参考商品图
- 优点：便宜、快、无需自建基础设施

**适用判断：** 可用于 Day1-2 快速横评，判断基线效果。

#### D. 国内方案（即梦 / 通义 / 美图 / 火山）

- 即梦 API 已全面开放（2025年9月），但无专项假发 VTO 端点
- 美图秀秀有图像编辑 API，有发型换色，无确认的 wig SKU 试戴
- **结论：** 国内大模型图像编辑能力可作为通用编辑底座，缺专项 wig try-on 能力

------

### 路线5：3D / AR 路线

**结论：7天内不现实，中期谨慎，长期有机会**

- 眼镜、首饰、鞋类 AR 试戴成熟，原因：刚性物体，3D 建模精度高
- 假发是**柔性发丝**：重力形变、风动、透光、与头皮融合——3D 建模极其复杂
- 从一张平铺商品图重建假发的精确 3D 模型，目前无成熟开源方案
- fal.ai 上有 Pixal3D（图转3D），但用于发丝效果未知（标 X 级证据）
- **7天可行性：0分**

------

### 路线6：混合 / 半人工路线

**定义：** AI 出初稿 → PS/ComfyUI 局部人工修边 → 输出"黄金样张"

**适用场景：** 在技术稳定之前，用于市场验证 Demo——向卖家展示效果，获取付费意愿反馈。

**优点：**

- 可以控制输出质量到"业内人士可判断"
- 成本可控（1-2小时/张）
- 不需要等技术路线完全打通

**风险：**

- 样张质量高于实际系统能力，容易产生预期落差
- 必须在 Demo 展示时明确告知"当前是辅助生成"，否则误导卖家判断

**7天可行性：** 用作 Demo 验证完全可行，必须配合真实意图说明

------

## 3. 最新技术与代表项目清单

| 项目/工具                   | 类型         | 最近更新  | 可试用             | 支持 reference image | 适合假发 SKU               | 主要优点                    | 主要风险                         | 来源                                           |
| --------------------------- | ------------ | --------- | ------------------ | -------------------- | -------------------------- | --------------------------- | -------------------------------- | ---------------------------------------------- |
| FLUX.1 Kontext Multi        | 开源/API     | 2025年6月 | ✅ fal.ai/Replicate | ✅ 最多4图            | 部分（需 mask）            | 多图参考，字符一致性强      | SKU 保真需 inpainting 配合       | arxiv.org/abs/2506.15742                       |
| GPT-Image-1.5               | 商业 API     | 2026年3月 | ✅ OpenAI API       | ✅ 多图               | 部分（需 mask）            | 指令跟随强，inpainting 精准 | 无 fine-tuning，$0.17/图         | imagine.art/blogs/gpt-image-1-5-features       |
| GPT-Image-2                 | 商业 API     | 2026年4月 | ✅ OpenAI API       | 待确认               | 待测                       | 最新版本                    | 刚发布数据稀缺                   | Wikipedia GPT Image                            |
| fal.ai hair-change          | API          | 2025      | ✅                  | ❌（文字描述）        | 弱                         | 接入极简                    | 无商品图保真                     | fal.ai/models/fal-ai/image-editing/hair-change |
| Perfect Corp YouCam VTO API | 商业 SDK/API | 持续更新  | ✅（需 API key）    | ❌（预置风格库）      | 弱（SKU 受限）             | 最快接入，发际线处理成熟    | 无法指定任意商品图               | app-cdn-01.perfectcorp.com/console             |
| Banuba TINT Wig Try-On      | 企业 SDK     | 持续更新  | 需商务             | 部分（定制需提交）   | 中（需定制合作）           | 最成熟 wig SDK，9年 R&D     | 企业授权成本高                   | banuba.com/wig-virtual-try-on                  |
| PuLID / InstantID           | 开源模型     | 2024      | ✅（ComfyUI）       | ✅（人脸）            | 弱（人脸保持，发型控制差） | 人脸保真最好                | 发型更改能力弱，PuLID 会克隆发型 | arxiv.org/abs/2404.16022                       |
| FASHN v1.5 on fal           | API          | 2024年底  | ✅                  | ✅（服装）            | ❌（服装专用）              | 服装试穿精准                | 未针对发丝训练                   | fashn.ai/blog                                  |
| Kivisense WebAR             | SaaS         | 持续更新  | ✅（试用）          | ✅ SKU 参数化         | 中（AR overlay）           | SKU 参数化好，支持中文      | AR 非 AI 生成，视觉偏"贴图"      | tryon.kivisense.com                            |
| HairFastGAN                 | 开源         | 2024      | ✅（需 GPU）        | ✅（发型参考）        | 弱                         | 学术 SOTA                   | GAN 质量上限低，SKU 保真差       | GitHub                                         |

------

## 4. 假发试戴的核心技术难点逐项分析

### 4.1 发际线融合（最难点之一）

**问题本质：** 假发与头皮接触的边缘，是真实发丝与皮肤的渐变混合，不是一条线。AI 生成普遍把这里处理成硬边。

**可用技术组合：**

1. **Hair segmentation**：SAM2（Meta）或 BiSeNet 可在 <100ms 内把头发区域分割出来，精度高
2. **Alpha matting**：在分割边缘做羽化混合（PyMatting / MODNet），避免硬边
3. **Inpainting**：只在 mask 区域重新生成，FLUX Kontext 的 local edit 在此表现好
4. **发际线专项：** 目前没有独立的"假发发际线融合"专项模型，需要靠上述组合

**难度评估：** 可以做到 70-80 分，但做到 95 分（业内人士完全看不出）需要多轮迭代。

### 4.2 原头发去除（大坑）

**问题本质：** 用户自己的头发必须先被"抹去"，头皮需要被重建，再放上假发。这是两步操作，都有损耗。

**可用路线：**

- 直接用 inpainting 抹掉原发并重建皮肤（效果取决于原发样式）
- 长发遮挡肩膀：极难处理，7天内应禁止长发用户输入（先排除该场景）
- **推荐做法（V1）：** 要求用户上传短发/盘发/发丝不外露的照片，降低难度

**难度评估：** 短发 → 中等难度。长发 → 7天内暂不做。

### 4.3 商品图保真（最关键差异化难点）

**问题本质：** 这是"假发 SKU 试戴"区别于"换发型"的核心——用户要看到的是**这顶具体假发**戴上去的效果，不是"一顶类似款式的假发"。

**当前技术边界：**

- IP-Adapter / FLUX Kontext multi-image：能保留发色、大轮廓，但细节纹理（特定卷曲方式、发丝光泽）保真度 60-70%
- LoRA fine-tuning：对单款假发做 LoRA 训练，保真度可提升到 85%+，但每款 LoRA 需要训练成本
- **商品图质量是输入瓶颈：** 平铺图 > 假头模图 > 模特佩戴图 → 后两种更接近实际佩戴状态，但平铺图细节最清晰

**难度评估：** 这是全链路最难的部分。7天 Demo 阶段，接受"大致像这款"，不追求"100%这款"。

### 4.4 人脸身份保持

**技术方案梯队：**

1. **PuLID**（最高人脸保真度，但会克隆原发型，发型更改能力弱）
2. **InstantID**（平衡人脸保真与 prompt 跟随，发型更改比 PuLID 好）
3. **FLUX Kontext**（不专门做人脸保持，但字符一致性好）
4. **GPT-Image-1.5 inpainting**（只修改 mask 区域，脸不动，最稳定的方案）

**推荐：** 用 GPT-Image-1.5 的 inpainting 方式（只改头发区域 mask，脸保持不变）是最简单可靠的保脸路线，不需要 InstantID/PuLID 的额外部署。

### 4.5 正侧面一致性

**7天内的正确决策：不做侧面。**

理由：

- Multi-view diffusion 需要专门训练，无开箱可用工具
- 正面单角度已经难度够高
- 卖家 Demo 验证不需要侧面

**时间节点：** 侧面推到 1个月后，在正面稳定后再加。

### 4.6 光照与色彩融合

**问题：** 假发商品图通常是棚拍打光，用户照片是自然光/室内光，两者融合容易出现色温和阴影不匹配。

**可用工具：**

- OpenCV 的 color matching（简单，快）
- 生成模型的 relighting（复杂，效果好，但耗时）
- **V1 推荐：** 做基础 color matching 后处理，不上 relighting。效果差时用"限制输入光照条件"绕开。

### 4.7 稳定性与速度

**商业化最低标准：**

- 5次生成至少4次可用（80% 良率）
- 30秒内返回

**当前各路线预估：**

- FLUX Kontext via fal.ai：~15-30秒，良率待测
- GPT-Image-1.5 inpainting：~20-40秒，良率中等
- YouCam API：~5-15秒（专业优化），良率最高

------

## 5. 路线评分表（5分制）

| 路线                      | 正面自然度 | 发际线 | 商品保真 | 人脸保持 | 侧面能力 | 稳定性 | API接入 | 成本 | 隐私 | 7天可行性 | 综合结论                      |
| ------------------------- | ---------- | ------ | -------- | -------- | -------- | ------ | ------- | ---- | ---- | --------- | ----------------------------- |
| FLUX Kontext Multi + mask | 4          | 3      | 3        | 3        | 2        | 3      | 4       | 4    | 3    | 4         | **首选短期路线**              |
| GPT-Image-1.5 inpainting  | 4          | 4      | 3        | 5        | 2        | 4      | 4       | 3    | 3    | 4         | **首选短期（人脸保持最好）**  |
| Perfect Corp YouCam API   | 3          | 5      | 1        | 4        | 3        | 5      | 5       | 3    | 4    | 5         | 适合"风格试戴"，不适合SKU保真 |
| Banuba TINT SDK           | 4          | 5      | 3        | 4        | 3        | 5      | 3       | 1    | 4    | 2         | 企业级，短期成本过高          |
| fal.ai hair-change API    | 2          | 2      | 1        | 2        | 1        | 4      | 5       | 5    | 3    | 3         | 仅适合横评基线                |
| HairFastGAN（开源）       | 3          | 2      | 2        | 3        | 2        | 2      | 2       | 5    | 5    | 2         | 学术参考，不建议产品化        |
| VTON 路线（FASHN）        | 2          | 1      | 4        | 3        | 2        | 4      | 5       | 3    | 3    | 2         | 服装专用，迁移假发待验证      |
| 3D/AR 路线                | 3          | 4      | 5        | 5        | 5        | 3      | 2       | 1    | 5    | 1         | 长期方向，7天不可行           |
| 半人工路线                | 4          | 4      | 4        | 5        | 4        | 5      | 5       | 4    | 5    | 5         | 市场验证 Demo 首选            |
| Kivisense WebAR           | 3          | 4      | 4        | 4        | 3        | 4      | 3       | 3    | 4    | 3         | AR overlay 非生成，视觉偏贴图 |

------

## 6. 推荐技术路线

### 短期（7天）：双轨并行

**主轨（验证技术可行性）：**

```
用户照片` → `SAM2/BiSeNet 头发分割` → `生成 inpainting mask` → `FLUX Kontext Multi`（输入：用户照 + 假发商品图 × 1-2张 + 文字描述）→ `color matching 后处理` → `输出
```

或：

```
用户照片` → `头发区域 mask` → `GPT-Image-1.5 inpainting`（mask 只覆盖头发区域 + reference image 描述）→ `输出
```

**副轨（验证市场需求）：**

```
选 3-5 款主力假发` → `用 AI初稿 + PS 修边` → `输出黄金样张` → `发给 5-10 个真实卖家看` → `收集付费意愿反馈
```

两轨同时跑，技术轨验证工程可行性，市场轨验证商业可行性，不互相等待。

### 中期（1个月）：

- 确定主技术栈后，对 Top 3 假发款做单 SKU LoRA 训练，提升商品保真度
- 加入正面发际线专项优化（SAM2 + alpha matting + 迭代 inpainting）
- 开始做正面的稳定性测试（目标：80% 良率，20秒内出图）

### 长期（3个月）：

- 积累足够 SKU 数据后，探索统一模型（不依赖每款 LoRA）
- 评估是否接入 Banuba TINT 做企业级 SDK 包装
- 侧面效果探索（multi-view diffusion 追踪）

------

## 7. 7天技术救火计划

### Day 1：素材标准化 + 失败图分型

**任务：**

- 收集 20-30 张失败生成图，按问题分型：① 变脸 ② 发际线硬边 ③ 商品跑偏 ④ 光照差 ⑤ 其他
- 整理 5 款主力假发商品图（每款备：正面平铺图 + 假头模图）
- 整理 5 张用户照片（要求：正面、光线均匀、发型收拢）
- 输出：分型表 + 标准素材包

**成功标准：** 失败类型清单 + 可用素材包准备好

### Day 2：商业 API 横评

**测同一组素材（1个用户 × 3款假发）通过以下 API：**

1. `fal.ai/image-editing/hair-change`（文字描述基线）
2. `FLUX Kontext Multi` via fal.ai（多图参考）
3. `GPT-Image-1.5 inpainting` with mask（mask + reference）
4. `Perfect Corp YouCam API`（预置风格，仅测发际线效果）
5. 如时间允许：`Kivisense`（AR overlay 对比）

**每个 API 跑 3张，记录：生成时间、人脸保持、商品相似度、发际线评分（1-5）** **输出：横评评分表**

### Day 3：确定主栈 + 备选栈

**基于 Day 2 数据，确定：**

- 主栈：评分最高的 1 个路线
- 备栈：第二名，备用
- 明确"7天内不做侧面"的 scope
- 确定输入限制：用户照要求（正面、短发/盘发、均匀光线）
- **输出：《技术选型决策文档》（1页）**

### Day 4-5：做正面单款黄金样张

**选 2-3 款主力假发，用主栈跑，目标：**

- 每款假发：生成 10 张，选最好 2 张
- 做基础 color matching 后处理
- 如效果仍差：加入 PS 人工修边（不限时）

**成功标准：** 每款有 2 张"业内人士看到不会立刻说不行"的样张

### Day 6：3-5人盲评

**找 3-5 个真实假发卖家（不是小王团队），展示样张，问：**

1. 这个效果，如果嵌进你的商品页面，你觉得有价值吗？
2. 有多少顾客会用？
3. 你愿意为这个工具付费吗？大概多少？
4. 最让你不满意的是哪一点？

**不说这是 AI+PS，只说"AI 生成，展示 Demo 效果"**

**输出：5 份访谈记录 + 付费意愿信号**

### Day 7：判断下一步

**基于 Day 6 反馈 + Day 2-5 技术跑通情况，选一条路：**

| 结果                              | 判断               | 动作                                |
| --------------------------------- | ------------------ | ----------------------------------- |
| 技术良率>70% + 卖家有明确付费意愿 | 继续深化           | 小王继续优化主栈，安排 MVP 功能开发 |
| 技术良率<50% + 卖家态度积极       | 技术换路线或外包   | 找 ComfyUI 工程师，明确技术 spec    |
| 技术良率>70% + 卖家无付费意愿     | 市场假设需要调整   | 停止当前 scope，重新访谈找真实需求  |
| 技术差 + 卖家无兴趣               | 暂停，重新定义问题 | 做 5 个卖家深度访谈，再看           |

------

## 8. 给小王的下一步任务清单

**Day 1 任务（具体可执行）：**

- [ ] 登录 fal.ai，注册账号，充值 $20 用于横评
- [ ] 整理 5 张用户照（正面，发型收拢，均匀光线）
- [ ] 整理 3 款假发的商品图（每款：正面平铺图 × 1，假头模佩戴图 × 1）
- [ ] 把之前所有失败生成图按问题类型归类（表格），每类至少 5 张
- [ ] 在 fal.ai 上跑：`fal-ai/image-editing/hair-change` 模型，用文字描述跑 3 组对比

**Day 2 任务：**

- [ ] 在 fal.ai 上跑：`FLUX Kontext Multi`，输入 = 用户照 + 假发商品图，参考 prompt 模板："Use reference 1 for face identity and reference 2 for the wig style. Keep the face, skin, and background unchanged. Replace only the hair area with the wig from reference 2, with natural hairline blending."
- [ ] 申请 GPT-Image-1.5 API key（OpenAI，需 Organization Verification），先在 playground 试
- [ ] 申请 Perfect Corp 试用账号（yce.makeupar.com）
- [ ] 制作横评打分表，填入每组结果

**Day 3 任务：**

- [ ] 根据横评结果，与杨确认主栈选择
- [ ] 明确输入规范文档（用户照要求、商品图要求）

------

## 9. 是否需要外包 / 补人

**7天内：不需要外包**。小王可以完成 Day 1-3 的横评工作。

**需要外包的判断标准：**

- 横评结果显示：最佳路线需要 ComfyUI 自定义工作流（涉及 SAM2 + inpainting + FLUX Kontext 的 pipeline 串联）
- 小王 ComfyUI 能力不足以在 1周内搭完这个 pipeline

**如果需要找外包，任务描述应该是：**

> "搭建一个 ComfyUI workflow： 输入：用户照片 × 1 + 假发商品图 × 1-2 步骤：① BiSeNet/SAM2 头发分割 → ② 生成 inpainting mask → ③ FLUX Kontext Multi 输入（用户照 + 商品图 + mask + prompt）→ ④ OpenCV color matching 后处理 输出：256-512分辨率效果图 成功标准：正面单款，发际线不硬、人脸不变、商品大致保真，稳定良率 70%+"

**外包人员类型：** ComfyUI 有实际发型/试妆工作流搭建经验的图像生成工程师（非泛AI开发）。

------

## 10. 证据账本

| 事实                                                         | 来源                       | 链接                                                       | 证据等级           | 用途                  |
| ------------------------------------------------------------ | -------------------------- | ---------------------------------------------------------- | ------------------ | --------------------- |
| FLUX Kontext 支持最多4图参考，明确支持 face + hairstyle 分别引用 | WaveSpeedAI 文档           | wavespeed.ai/models/wavespeed-ai/flux-kontext-dev/multi    | A（官方文档）      | 路线1核心依据         |
| FLUX Kontext 论文，KontextBench 5类任务覆盖                  | arXiv 2506.15742           | arxiv.org/abs/2506.15742                                   | A（论文）          | 路线1技术背景         |
| FLUX Kontext 发型修改测试，"Right image has slight skin tone diff，but no different from multiple iterations" | Medium（Chris Green）      | medium.com/diffusion-doodles/flux-1-kontext-dev-multimodal | B（实测）          | 路线1效果参考         |
| GPT-Image-1.5 多图参考、inpainting with mask、high input fidelity 特性 | imagine.art 文档           | imagine.art/blogs/gpt-image-1-5-features                   | B（第三方文档）    | 路线1备选依据         |
| GPT-Image-1（2025年4月）仅支持单图，不支持 fine-grained editing | img.ly 博客                | img.ly/blog/openai-gpt-image-1-api                         | B（媒体）          | 区分 1.0 vs 1.5 版本  |
| Perfect Corp 有专门 wig try-on API，style ID 来自预置库      | Perfect Corp 官方 API 文档 | app-cdn-01.perfectcorp.com/console/common/doc/ai-api       | A（官方）          | 路线4 YouCam 限制说明 |
| Banuba TINT 被评为 2026 best-in-class wig SDK                | Banuba 博客（第三方比较）  | banuba.com/blog/best-virtual-wig-try-on-sdks               | B（第三方评测）    | 路线4 Banuba 定位     |
| Banuba 支持自定义品牌假发，但需定制合作（非自助上传）        | Banuba 官网                | banuba.com/wig-virtual-try-on                              | A（官方）          | 路线4 Banuba 局限     |
| fal.ai hair-change API：文字描述驱动，无商品图参考           | fal.ai 文档                | fal.ai/models/fal-ai/image-editing/hair-change/api         | A（官方 API 文档） | 路线4 基线横评依据    |
| FASHN v1.5 on fal.ai：服装 VTON，15秒，576×864               | fashn.ai 博客              | fashn.ai/blog/fashn-x-fal                                  | B（官方博客）      | 路线3 VTON 定位       |
| PuLID vs InstantID：PuLID 克隆原发型，InstantID 发型更改更灵活 | MyAIForce 实测             | myaiforce.com/hyperlora-vs-instantid-vs-pulid-vs-ace-plus  | B（实测对比）      | 人脸保持技术选型      |
| 即梦 AI API 2025年9月全面开放（文生图3.0/3.1、图生图3.0）    | 腾讯新闻                   | news.qq.com/rain/a/20250902A04VYB00                        | B（媒体）          | 国内平台API状态       |
| Kivisense 支持 SKU 参数化，支持中文                          | Kivisense 文档             | tryon-docs.kivisense.com                                   | A（官方文档）      | 路线4 Kivisense 定位  |
| YouCam API 已支持 MCP 接入（Cursor / Claude Desktop）        | YouCam API 文档            | yce.perfectcorp.com/document                               | A（官方）          | 集成便利性参考        |

------

*报告结束。如需针对具体子路线做更深一层的技术验证（如 ComfyUI workflow 具体节点设计、GPT-Image-1.5 inpainting 的 mask 生成方案），可单独展开。*