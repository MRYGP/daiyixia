# AI 假发试戴技术路线深度研究报告

> 基于截至 **2026-05-26** 可查公开资料判断。没有把厂商 Demo 当作真实产品实测；凡是没有公开证据证明“可上传任意假发 SKU 并高度保真”的地方，我都按 **未找到公开证据 / 需实测** 处理。

## 0. 执行摘要

**结论：戴一下还有技术可行性，但不是“靠 prompt 调好”的问题。**
7 天内最现实路线是：**严格限制输入素材 + 正面单图 + 通用图像编辑 API 横评 + mask/inpainting + 人工/ComfyUI 修边，先做业内人士可判断的黄金样张**。
短期不要做侧脸、不要做实时视频、不要做 3D 自研、不要训练大模型。当前 Demo 效果差，最可能是 **路线、素材、mask 与商品参考图不匹配**，prompt 只是次要问题。

------

## 1. 当前问题复盘

小王 Demo 的问题，可以拆成 7 个技术失败点：

| 现象           | 技术含义                      | 最可能原因                                                | 是否靠 prompt 能解决                     |
| -------------- | ----------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| 发际线不自然   | hairline blending 失败        | 没有精细 hair mask、alpha matting、额头重建、边缘 feather | 不能，只能缓解                           |
| 像贴纸         | 几何贴合与光照融合失败        | 商品图只是叠上去，缺少 warping / relighting / shadow      | 不能                                     |
| 变脸           | identity preservation 失败    | 全图生成、脸部没有冻结、模型重绘了面部                    | 不能靠一句“不改脸”稳定解决               |
| 商品图特征跑偏 | SKU fidelity 失败             | 参考图控制弱，模型生成了“相似发型”而不是“这顶假发”        | prompt 不够，需要 reference conditioning |
| 侧脸穿帮       | pose / multi-view 失败        | 侧面缺少训练、缺少三维头部与发体一致性                    | 7 天内不应硬做                           |
| 光照融合差     | color / illumination mismatch | 没有色彩匹配、阴影、颗粒度统一                            | 需要后处理                               |
| 正侧面不一致   | independent generation 失败   | 每张图独立生成，没有 multi-view consistency               | 短期砍掉                                 |

核心判断：**当前失败不是单纯 prompt 问题，而是“把假发试戴误当成普通换发型生成”导致的路线问题。** 假发试戴要求同时满足：人脸不变、原头发处理、发际线自然、商品特征保真、光照统一。通用图像模型可以快速出图，但公开资料显示，即使支持多图参考和局部编辑，也不等于能稳定保真任意假发 SKU。OpenAI 图像编辑 API 支持用一张或多张图片作参考、支持 mask 局部编辑，但官方也说明 mask 形状并不保证被精确遵循。([OpenAI Developers](https://developers.openai.com/api/docs/guides/image-generation))

------

## 2. 技术路线全景图

### 2.1 通用图像编辑大模型路线

代表：**GPT Image / Gemini Nano Banana / FLUX Kontext / Photoshop Generative Fill / 即梦 / 通义万相 / 可灵**

这条路线是 **7 天内最值得救火的路线**。原因是它们已经具备多图参考、image-to-image、局部编辑、mask/inpainting 或参考图编辑能力。OpenAI Image API 已有生成与编辑接口，并支持多图参考和 mask；Gemini 原生图像生成支持文本、图片或二者混合输入，并可进行连续编辑；FLUX Kontext 定位就是结合文字和图片进行上下文图像编辑，强调角色/视觉一致性；Photoshop Generative Fill 在 2026 年文档中已支持 Adobe Firefly 与 Gemini、FLUX 等伙伴模型。([OpenAI Developers](https://developers.openai.com/api/docs/guides/image-generation))

但这条路线的硬伤是：**它更擅长“生成合理图像”，不天然保证“这顶具体假发 SKU 完全不变”。** 国内通义万相 2.1 图像编辑支持局部重绘、图像修复、指令编辑，公开价格为 `0.14 元/张`；即梦/火山的图像能力公开资料显示支持多图输入、图像编辑和 inpainting；可灵图像 API 也提供参考图生成、多图输入等能力。它们都适合做 7 天横评，但不能直接假设能稳定做 SKU 级保真。([阿里云帮助中心](https://help.aliyun.com/zh/model-studio/wanx-image-edit))

**短期结论：适合 Demo，但必须加三层约束：正面照、清晰佩戴假发参考图、mask 局部编辑。不能继续全图 prompt 生成。**

------

### 2.2 专门发型迁移 / Hair Transfer 模型路线

代表：**Stable-Hair、Stable-Hair v2、HairFastGAN、HairFusion、HairFIT**

这类模型最接近“技术上正确”的方向。Stable-Hair 官方仓库说明其两阶段框架包括 **Bald Converter 去除原头发、Hair Extractor 编码参考发型、Latent IdentityNet 保持身份与背景、Latent ControlNet 减少颜色偏差**，这正好对应假发试戴的关键问题。([GitHub](https://github.com/Xiaojiu-z/Stable-Hair))

Stable-Hair v2 进一步走向多视角一致：论文摘要称其使用多视角扩散框架做 view-consistent hair transfer，并包含 Bald Converter、多视角扩散、极角/方位角嵌入和 temporal attention；GitHub 仓库显示项目已开放代码和预训练模型，论文被 TVCG 2026 接收。([arXiv](https://arxiv.org/abs/2507.07591?utm_source=chatgpt.com))

HairFastGAN 是 NeurIPS 2024 官方项目，目标是把参考图发型迁移到输入人脸，并强调在 Nvidia V100 上接近实时、最复杂场景低于 1 秒；但它仍是“发型迁移”，不是“假发 SKU 商品图保真”。([GitHub](https://github.com/AIRI-Institute/HairFastGAN))

HairFusion 提供官方推理代码，但需要 DensePose、agnostic image、多个 checkpoint，且许可证为 CC BY-NC-SA 4.0，商业使用要谨慎。([GitHub](https://github.com/cychungg/HairFusion))

**中期结论：值得小规模试验，但不适合 7 天救火主栈。它们解决发型迁移，不保证商品 SKU 保真。**

------

### 2.3 VTON 虚拟试穿技术迁移路线

代表：**IDM-VTON、CatVTON、StableVITON、MagicTryOn、TryOnDiffusion**

服装 VTON 不能直接拿来试假发，但它给了戴一下最重要的方法论：
**商品图保真 = 商品图编码 + 人体/部位 mask + 几何对齐 + 局部生成 + refinement。**

IDM-VTON 官方仓库显示其输入包含 person image、DensePose、agnostic mask、cloth image 等结构；CatVTON 走轻量化路线，官方资料称 1024×768 推理可低于 8GB VRAM；MagicTryOn 公开资料强调 mask-aware loss 用于提升服装保真。([GitHub](https://github.com/yisol/IDM-VTON))

迁移到假发时，对应关系是：

| 服装 VTON     | 假发试戴迁移                           |
| ------------- | -------------------------------------- |
| garment image | 假发商品图 / 假头模佩戴图              |
| human parsing | 人脸、头发、耳朵、脖子、肩膀分割       |
| agnostic mask | 去掉原头发后的头部区域                 |
| warping       | 假发轮廓、头顶高度、刘海、两侧鬓角对齐 |
| refinement    | 发际线、阴影、颜色、边缘融合           |

**中期结论：VTON 不是现成方案，但它是 1–3 个月自研正确方向。**

------

### 2.4 商业 API / SDK 路线

代表：**Banuba、Perfect Corp / YouCam、Kivisense、ModiFace、fal.ai、Replicate、国内图像 API**

这里要非常严格区分：
**“有 hairstyle / hair color try-on” ≠ “支持上传任意假发 SKU 并保真试戴”。**

Banuba 是目前公开资料里最直接命中“wig try-on”的商业 SDK。其官方页面明确写到 Virtual Wig Try-On，支持照片式试戴、eCommerce 集成、面部检测匹配、Web/mobile/desktop，并称神经网络跟踪面部特征和头部位置后应用 AR wig；其隐私页称 Face AR SDK 可完全在设备端运行，Banuba 不需要访问用户视频/图片来运行算法。([Banuba](https://www.banuba.com/wig-virtual-try-on))

Perfect Corp / YouCam 在 2026 年公开资料中有 AI Hairstyle Try On API、Hair Color API 和 YouCam API 套件；但我没有找到公开证据证明它能让商家上传任意假发 SKU 图片并保持这顶 SKU 的具体纹理、发量、刘海、卷度和蕾丝发际线。此处结论为：**有 hairstyle / hair color 公开证据；任意 wig SKU 保真，未找到公开证据。**([YouCam Online Editor](https://yce.perfectcorp.com/ai-api/products/ai-hairstyle-api?utm_source=chatgpt.com))

fal.ai 与 Replicate 更像模型运行平台。fal 上可直接调 FLUX Kontext、CatVTON 等模型，价格公开，例如 FLUX Kontext Pro 约 `0.04 美元/次`，Nano Banana 约 `0.0398 美元/次`，Qwen Image Edit 约 `0.02 美元/MP`；但这不是专门 wig SKU API。([Fal.ai](https://fal.ai/models/fal-ai/flux-pro/kontext))

**短期结论：商业 API 优先横评通用图像编辑；商业 SDK 同时联系 Banuba 做 wig PoC。**

------

### 2.5 3D / AR 路线

假发和眼镜、首饰不同。眼镜是刚体，假发是柔性发丝集合，涉及发际线、发丝透明边缘、头顶体积、肩颈遮挡、风格纹理、光照方向。2024–2026 年仍有大量 3D 头发重建研究，例如 Gaussian Haircut、基于 3D Gaussian Splatting 的头发重建、Digital Salon 等，说明头发 3D 建模仍是专门研究问题，而不是小团队 7 天能工程化的普通素材处理。([GitHub](https://github.com/eth-ait/GaussianHaircut?utm_source=chatgpt.com))

**短期结论：不建议自研 3D/AR。只有在 Banuba 这类 SDK 已能把 SKU 做成可试戴资产时，才把 3D/AR 当商业接入路线。**

------

### 2.6 混合 / 半人工路线

这是 7 天最现实的救火路线：

1. AI 生成初稿；
2. 人工或 ComfyUI 修发际线、边缘、阴影；
3. Photoshop 做色彩匹配和局部修复；
4. 明确标注为 **“AI 辅助效果样张 / 市场验证 Demo”**，不要承诺全自动。

Photoshop Generative Fill 本身就是适合这种半人工工作流的工具：官方文档说明其可选区域后生成或替换内容，且 2026 年支持多种生成模型作为选择。([Adobe Help Center](https://helpx.adobe.com/photoshop/desktop/create-open-import-images/create-images/edit-images-with-generative-fill.html))

**短期结论：这是 7 天内唯一既能出图、又能避免误判技术路线的方案。**

------

## 3. 最新技术与代表项目

| 名称                            | 类型                    | 最近公开状态                      | 可试用         | 支持 reference image      | 是否适合假发 SKU   | 主要优点                              | 主要风险                             | 来源                                                         |
| ------------------------------- | ----------------------- | --------------------------------- | -------------- | ------------------------- | ------------------ | ------------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| GPT Image / Image API           | 官方 API                | 2026 文档与价格页可查             | 是             | 是，多图参考 + mask 编辑  | 中，需要实测       | API 成熟，局部编辑快                  | mask 不保证精确，SKU 保真未知        | ([OpenAI Developers](https://developers.openai.com/api/docs/guides/image-generation)) |
| Gemini Nano Banana              | 官方模型/API            | 2026 图像生成文档可查             | 是             | 是，文本+图片，多图混合   | 中，需要实测       | 多图融合、角色一致性强                | 隐私与商用需看付费条款；SKU 保真未知 | ([Google AI for Developers](https://ai.google.dev/gemini-api/docs/image-generation)) |
| FLUX.1 Kontext Pro              | 模型/API                | fal / BFL 平台可调                | 是             | 是，图像上下文编辑        | 中                 | 编辑能力强，单次约 $0.04              | 仍可能生成相似而非同款               | ([Black Forest Labs](https://bfl.ai/models/flux-kontext))    |
| Photoshop Generative Fill       | 商业工具                | Adobe 文档 2026-04-28 更新        | 是             | 局部选择 + 多模型         | 高，适合人工修图   | 最适合黄金样张修边                    | 不适合直接 SaaS 自动化               | ([Adobe Help Center](https://helpx.adobe.com/photoshop/desktop/create-open-import-images/create-images/edit-images-with-generative-fill.html)) |
| 通义万相 2.1 图像编辑           | 国内 API                | 2026 文档可查                     | 是             | 局部重绘 / 指令编辑       | 中，需要实测       | 国内接入方便，0.14 元/张              | 并非专门假发                         | ([阿里云帮助中心](https://help.aliyun.com/zh/model-studio/wanx-image-edit)) |
| 即梦 / Seedream / 火山图像      | 国内 API                | 2026 公开资料显示多图与编辑能力   | 是             | 多图输入、inpainting      | 中，需要实测       | 国内模型能力强，适合横评              | SKU 保真、隐私、价格需实测           | ([火山引擎](https://www.volcengine.com/docs/85621/1820192?utm_source=chatgpt.com)) |
| 可灵图像 API                    | 国内 API                | 2026 公开资料显示参考图与多图输入 | 是             | 是                        | 中，需要实测       | 视频/图像生态强                       | 并非专门 wig try-on                  | ([阿里云帮助中心](https://help.aliyun.com/zh/model-studio/kling-image-generation-api-reference?utm_source=chatgpt.com)) |
| Stable-Hair                     | 论文 + GitHub           | AAAI 2025 官方仓库                | 可跑，但需部署 | 是                        | 中低，不保证 SKU   | Bald Converter + IdentityNet 正中难点 | 工程复杂，不是商品试戴模型           | ([GitHub](https://github.com/Xiaojiu-z/Stable-Hair))         |
| Stable-Hair v2                  | 论文 + GitHub           | TVCG 2026 / 代码开放              | 可跑，但偏研究 | 是，多视角                | 中，长期研究       | 多视角一致性最相关                    | 7 天不可作为主栈                     | ([arXiv](https://arxiv.org/abs/2507.07591?utm_source=chatgpt.com)) |
| HairFastGAN                     | 论文 + GitHub / HF Demo | NeurIPS 2024                      | 是             | 是                        | 低到中             | 快，V100 接近实时                     | GAN 风格、裁剪与 SKU 保真风险        | ([GitHub](https://github.com/AIRI-Institute/HairFastGAN))    |
| HairFusion                      | 论文 + GitHub           | AAAI 2025 推理代码                | 可跑           | 是                        | 中低               | 针对发型迁移                          | 依赖重、非商业许可风险               | ([GitHub](https://github.com/cychungg/HairFusion))           |
| IDM-VTON / CatVTON / MagicTryOn | VTON 论文/GitHub        | 2024–2025 活跃                    | 是             | 商品图输入                | 不能直接用         | 商品保真方法值得借鉴                  | 是服装，不是假发                     | ([GitHub](https://github.com/yisol/IDM-VTON))                |
| Banuba Virtual Wig Try-On       | 商业 SDK                | 官方 wig try-on 页面可查          | 需联系/试用    | 商品/ wig 资产方式需确认  | 高，最接近         | 明确是 wig try-on，支持电商集成       | 任意 SKU 上传保真需厂商实测确认      | ([Banuba](https://www.banuba.com/wig-virtual-try-on))        |
| Perfect Corp / YouCam           | 商业 API                | 2026 Hair API 公开                | 需申请/试用    | hairstyle/hair color 明确 | SKU 未找到公开证据 | 美妆/发型生态成熟                     | 可能只是预设发型/染发                | ([YouCam Online Editor](https://yce.perfectcorp.com/ai-api/products/ai-hairstyle-api?utm_source=chatgpt.com)) |

------

## 4. 假发试戴的核心难点

### 4.1 发际线融合

发际线不是普通边缘。它有半透明碎发、额头皮肤、发根阴影、刘海遮挡。正确路线是：

```text
人像检测 → 原头发粗分割 → 头发/脸/额头精细 mask → alpha matting → 发际线 feather → 局部 inpainting → 假发边缘融合
```

可用组件包括 SAM 2 做提示式分割、MODNet 做人像 matting、BiRefNet 做高分辨率分割/抠图。SAM 2 官方定位为图像与视频的 promptable segmentation，MODNet 是实时 trimap-free portrait matting，BiRefNet 是高分辨率 dichotomous segmentation。([Meta AI](https://ai.meta.com/research/sam2/?utm_source=chatgpt.com))

**判断：发际线失败不是 prompt 问题，是 mask 与 matting 问题。**

------

### 4.2 原头发去除

如果用户是短发、贴头发、秃发，处理较容易；如果是长发披肩、刘海遮脸、卷发外扩，就必须先“去头发 + 重建额头/太阳穴/肩膀背景”。

Stable-Hair 专门设计了 Bald Converter 来把输入人脸转成无头发基底，这是专门发型迁移模型比通用图像模型更合理的地方。([GitHub](https://github.com/Xiaojiu-z/Stable-Hair))

**V1 输入策略：要求用户头发扎起、露额头、正面、光线均匀。长发披肩应提示重拍。**

------

### 4.3 商品图保真

这是戴一下和普通换发型 App 的最大区别。用户不是要“一个类似发型”，而是要“这顶假发”。

短期保真策略：

1. **不要用平铺图做主参考**；
2. 主参考应优先用 **假头模佩戴图 / 真人模特佩戴图**；
3. 平铺图只能作为颜色、纹理、发长辅助；
4. prompt 中要锁定可观察特征：刘海、分缝、长度、卷度、蓬松度、颜色、发尾形状、两侧鬓角、蕾丝发际线；
5. 每次生成后用人工评分判断“是否变成另一顶”。

IP-Adapter、InstantID、PuLID 等方法能提高图像参考或身份保持，但它们解决的是“图像条件控制/身份保持”，不是天然 SKU 保真。IP-Adapter 官方说明它是给扩散模型增加图像 prompt 能力的轻量适配器；InstantID / PuLID 更偏人脸身份一致性。([GitHub](https://github.com/tencent-ailab/IP-Adapter?utm_source=chatgpt.com))

**判断：商品图保真是当前 Demo 最可能跑偏的核心根因之一。**

------

### 4.4 人脸身份保持

如果模型重绘全图，脸一定容易变。正确做法是：

- 脸部区域不进生成 mask；
- 只编辑头发区域；
- 用原图脸部 crop 做 identity check；
- 必要时使用 InstantID / PuLID / FaceID 类组件；
- 输出前做人脸相似度或人工“是否像本人”评分。

OpenAI 编辑接口支持 mask 局部编辑，但官方说明 mask 应用于第一张图，且 mask 形状不一定被精确遵循；所以不能只靠 API，需要小王自己保存 mask、输出图、脸部变化评分。([OpenAI Developers](https://developers.openai.com/api/docs/guides/image-generation))

------

### 4.5 正侧面一致性

正侧面一致性属于多视角问题。Stable-Hair v2 明确把 multi-view diffusion 用于 view-consistent hair transfer，这说明该问题已有研究路线；但它也意味着这不是普通 API 调参能稳定解决的问题。([arXiv](https://arxiv.org/abs/2507.07591?utm_source=chatgpt.com))

**V1 结论：7 天内砍掉侧面。只做正面单图。**

------

### 4.6 光照与色彩融合

假发“像贴纸”的重要原因是缺少：

- 发丝边缘透明度；
- 额头/太阳穴阴影；
- 头顶高光方向；
- 商品图与用户照片白平衡统一；
- 图像颗粒度统一；
- 发尾与肩膀遮挡关系。

这部分不应该全部交给生成模型。短期应加入传统 CV 后处理：色温匹配、亮度/对比度匹配、局部阴影、边缘羽化、噪声匹配。

------

### 4.7 稳定性、速度、成本、隐私

7 天 Demo 的稳定性标准应是：**同一组输入生成 5 次，至少 4 次可用。**
商业图像 API 的速度和接入明显优于开源模型部署；fal 上部分图像编辑模型按次计费，FLUX Kontext Pro 公开价格约 `0.04 美元/次`，国内通义万相图像编辑公开价格为 `0.14 元/张`。([Fal.ai](https://fal.ai/pricing))

隐私方面要区分服务。OpenAI API 文档说明 API 输入/输出可能被保留最多 30 天，符合条件的端点可申请 Zero Data Retention；Google Gemini API 条款显示免费服务可能会被人工审核处理，且提醒不要提交敏感、机密或个人信息；Banuba Face AR SDK 官方隐私页称可完全在设备端运行，Banuba 不需要访问用户图像/视频来运行算法。([OpenAI](https://openai.com/enterprise-privacy/?utm_source=chatgpt.com))

------

## 5. 路线评分表

> 评分是本报告基于公开资料和工程可行性的判断，不是厂商官方评分。5 分最好。

| 路线                                                | 正面自然度 | 发际线 | 商品保真 | 人脸保持 | 侧面能力 | 稳定性 | API 接入 | 成本 | 隐私 | 7天可行性 | 结论                           |
| --------------------------------------------------- | ---------- | ------ | -------- | -------- | -------- | ------ | -------- | ---- | ---- | --------- | ------------------------------ |
| 通用图像编辑 API：GPT / Gemini / FLUX / 即梦 / 通义 | 3.5        | 2.5    | 2.5      | 3        | 1.5      | 3      | 5        | 4    | 3    | 5         | **短期主栈，但要 mask + 横评** |
| Photoshop / ComfyUI 半人工                          | 4          | 3.5    | 3.5      | 4        | 1.5      | 4      | 2        | 2.5  | 3    | 5         | **7 天黄金样张最现实**         |
| Banuba Wig SDK                                      | 3.5        | 3.5    | 3        | 4        | 2.5      | 4      | 3        | 3    | 4    | 3.5       | **商业 PoC 值得联系**          |
| Stable-Hair / HairFastGAN / HairFusion              | 3.5        | 3.5    | 2        | 3.5      | 2        | 2.5    | 1        | 3    | 3    | 2         | **中期技术验证，不做救火主栈** |
| Stable-Hair v2 多视角                               | 4          | 4      | 2.5      | 4        | 4        | 2      | 1        | 2    | 3    | 1         | **长期研究，不做 7 天任务**    |
| VTON 迁移定制                                       | 4          | 3.5    | 4.5      | 4        | 2        | 3      | 1        | 2    | 3    | 1         | **1–3 个月自研方向**           |
| 3D / AR 自研                                        | 3          | 2.5    | 4        | 4        | 3        | 3      | 1        | 1    | 4    | 1         | **不推荐短期做**               |
| Prompt-only 全图生成                                | 2          | 1.5    | 1.5      | 1.5      | 1        | 2      | 5        | 4    | 3    | 3         | **停止继续投入**               |

------

## 6. 推荐技术路线

### 短期 7 天：通用图像编辑 API + 半人工修边

```text
标准素材
→ 自动/手工 mask
→ 局部 inpainting / reference edit
→ 3-5 个 API 横评
→ 生成 5 张候选
→ 人工评分
→ Photoshop / ComfyUI 修发际线
→ 黄金样张
```

主目标不是立刻做 SaaS，而是回答：
**在严格输入条件下，戴一下能不能做出业内人士认可的“这顶假发戴在这个人头上”的效果？**

------

### 中期 1 个月：正面单图产品化工作流

做：

- 输入素材质检；
- 正面单图；
- 用户头发重拍提示；
- 假头模图 / 模特佩戴图优先；
- 自动 mask；
- API 主栈 + 备栈；
- 输出 3 张候选；
- 人工/算法评分；
- 商家端保存 SKU 参考素材。

不做：

- 任意角度；
- 实时视频；
- 平铺图直接试戴；
- 侧脸一致；
- 完全无人审图。

------

### 长期 3 个月：假发版 VTON / Hair Transfer 定制

长期路线是把 VTON 的商品保真框架迁移到假发：

```text
用户头部图
+ 去头发 agnostic head
+ 假发佩戴参考图
+ 头部/发区 mask
+ 发型/颜色/纹理编码
+ 局部生成与 refinement
```

可以基于 Stable-Hair / Stable-Hair v2 / IP-Adapter / ControlNet / LoRA 做实验，但前提是有足够 SKU 素材和评估集。公开项目已有 hair transfer 与 multi-view 方向，但没有证据表明它们开箱即用解决“任意假发 SKU 试戴”。([GitHub](https://github.com/Xiaojiu-z/Stable-Hair))

------

## 7. 7 天技术救火计划

### 第 1 天：素材标准化 + 失败图分型

**做什么：**

- 选 1 个 SKU，不超过 3 个用户；
- 用户照只用正面；
- 用户头发尽量扎起、露额头、无遮挡；
- 假发参考图优先用假头模佩戴图 / 真人模特佩戴图；
- 把现有失败图按 7 类归档：发际线、变脸、SKU 跑偏、贴纸感、光照、遮挡、侧脸。

**不做什么：**

- 不做侧脸；
- 不做视频；
- 不做平铺图直接试戴；
- 不继续随机 prompt。

**杨需要提供：**

- 3 张用户正面照；
- 1–3 款假发，每款至少 1 张假头模或真人正面佩戴图；
- 每款假发的关键特征描述：颜色、刘海、长度、卷度、分缝、发尾、是否蕾丝发际线；
- 失败案例原图与生成图。

------

### 第 2 天：3–5 个商业 API / 图像模型横评

优先试 5 个：

1. **GPT Image / OpenAI Image Edit**
2. **Gemini Nano Banana**
3. **FLUX.1 Kontext Pro / fal**
4. **即梦 / Seedream 图像编辑**
5. **通义万相 2.1 图像编辑**

同时联系 **Banuba Virtual Wig Try-On SDK** 做商务/技术 PoC，但不要等它作为 7 天救火主线。Banuba 是公开资料中最明确写到 wig try-on 的商业 SDK。([Banuba](https://www.banuba.com/wig-virtual-try-on))

每个模型固定同一组输入：

```text
用户正面照 × 假头模佩戴图 × 发区 mask × 同一份特征锁定 prompt
```

每个模型生成 5 次，记录：

- 成功张数；
- 平均耗时；
- 单次成本；
- 是否变脸；
- 是否像原 SKU；
- 发际线是否可接受；
- 是否需要人工修。

------

### 第 3 天：确定主栈 + 备选栈

决策标准：

| 指标     | Go 标准                                  |
| -------- | ---------------------------------------- |
| 人脸保持 | 5 张里至少 4 张不像换脸                  |
| SKU 保真 | 3 人盲评平均 ≥ 4/5                       |
| 发际线   | 3 人盲评平均 ≥ 3.5/5                     |
| 自然度   | 3 人盲评平均 ≥ 4/5                       |
| 稳定性   | 5 次生成至少 4 次可用                    |
| 速度     | 自动生成部分尽量 ≤ 30 秒；人工修图另算   |
| 成本     | 单张自动生成成本可接受，黄金样张可高一些 |

如果没有任何模型达到标准，直接转 **半人工 Demo**，不要再调 prompt。

------

### 第 4–5 天：正面单款黄金样张

目标：只做一个漂亮样张包。

交付：

- 原用户图；
- 假发商品参考图；
- AI 原始输出；
- 人工修边后输出；
- 失败候选图；
- 参数、prompt、mask、耗时、成本记录；
- “自动生成”和“人工辅助”的边界说明。

**注意：黄金样张不是欺骗卖家，而是验证“在合理素材和半人工流程下，目标视觉是否成立”。**

------

### 第 6 天：3 人盲评

至少 3 类人：

1. 一个业内假发卖家或懂货的人；
2. 一个普通潜在用户；
3. 一个视觉/修图敏感的人。

评分维度：

| 维度              | 问题                 |
| ----------------- | -------------------- |
| 像本人吗          | 脸有没有变           |
| 像这顶吗          | 是不是同一顶假发     |
| 发际线假吗        | 是否一眼穿帮         |
| 想继续看吗        | 是否有助于购买判断   |
| 能不能上商家 Demo | 卖家是否愿意给客户看 |

------

### 第 7 天：继续 / 外包 / 换 API / 暂停

决策：

| 结果                       | 动作                                          |
| -------------------------- | --------------------------------------------- |
| 自动图 5 张 ≥ 4 张可用     | 小王继续产品化正面单图                        |
| 自动图一般，但人工修后很强 | 找 ComfyUI/修图外包做半人工 Demo              |
| 商业 SDK 效果明显好        | 转 Banuba/同类 SDK PoC                        |
| 所有路线都 SKU 跑偏严重    | 暂停“具体 SKU 试戴”，改成“风格预览”或重新定义 |
| 侧脸明显穿帮               | 继续砍掉侧脸                                  |

------

## 8. 给小王的下一步任务

直接发给小王：

```text
小王，接下来不要继续随机调 prompt，也不要做侧脸。

你的任务是做一次 7 天技术救火横评，只验证“正面用户照 × 一顶具体假发参考图 → 正面试戴图”。

第 1 步：准备素材
- 选 1 个假发 SKU。
- 用户照只用正面、清晰、露额头、无遮挡。
- 假发参考图优先用假头模/真人佩戴图，不用平铺图做主参考。
- 把原图、参考图、mask、输出图都按编号保存。

第 2 步：做 mask
- 脸部不要进生成区域。
- 只编辑原头发、头顶、发际线、两侧鬓角区域。
- 保留每一版 mask 文件，后面要复盘。

第 3 步：横评 5 个模型
优先测试：
1. GPT Image / OpenAI Image Edit
2. Gemini Nano Banana
3. FLUX.1 Kontext Pro / fal
4. 即梦 / Seedream 图像编辑
5. 通义万相 2.1 图像编辑

第 4 步：每个模型固定生成 5 张
记录：
- prompt
- reference image
- mask
- 模型参数
- 耗时
- 成本
- 是否变脸
- 是否像原 SKU
- 发际线是否自然
- 是否需要人工修

第 5 步：不要只给最好的一张
每个模型都要保留 5 张原始输出，方便判断稳定性。

成功标准：
同一输入生成 5 次，至少 4 次可用；3 人盲评自然度、像本人、像这顶假发三个维度平均 ≥ 4/5。

失败标准：
变脸、变成另一顶假发、发际线一眼穿帮，任一项连续出现，就不要继续调 prompt，改路线。
```

------

## 9. 是否需要外包 / 补人

**需要，但不是找“训练大模型的人”。**

最适合找的人是：

1. **ComfyUI / 图像生成工程师**
   能做 inpainting、IP-Adapter、ControlNet、mask、segmentation、workflow 固化。
2. **商业修图师 / 电商视觉师**
   专门修发际线、边缘、色彩、阴影，让黄金样张能给业内人士看。
3. **不建议现在找的人**
   - 3D 建模团队；
   - 视频换头团队；
   - 大模型训练团队；
   - AR 眼镜/美妆平台外包；
   - 只会写 prompt 的人。

给外包的任务应非常窄：

```text
请你做一个可复现的“正面假发 AI 试戴”工作流：
输入：1 张用户正面照 + 1 张假头模/真人佩戴假发图。
输出：5 张候选试戴图 + 1 张人工修边黄金图。
要求：脸不能变，假发要尽量保持原 SKU 的刘海、长度、颜色、卷度、发尾和发际线特征。
交付：ComfyUI workflow / PSD 分层文件 / mask 文件 / prompt / 参数 / 失败样例。
不要求：侧脸、视频、实时、3D、自训练模型。
```

------

## 10. 证据账本

| 事实                                                         | 来源                                                         | 证据等级 | 用途                              |
| ------------------------------------------------------------ | ------------------------------------------------------------ | -------- | --------------------------------- |
| OpenAI Image API 支持生成、编辑，编辑可使用一张或多张图片作参考并支持 mask | OpenAI 官方文档 ([OpenAI Developers](https://developers.openai.com/api/docs/guides/image-generation)) | A        | 判断通用图像编辑 API 可做短期横评 |
| OpenAI 文档说明 mask 形状不一定被精确遵循                    | OpenAI 官方文档 ([OpenAI Developers](https://developers.openai.com/api/docs/guides/image-generation)) | A        | 解释为什么不能只靠 API mask       |
| Gemini 原生图像生成支持文本、图片或二者混合输入，Nano Banana 公开强调多图融合与一致性 | Google / Gemini 官方与公开资料 ([Google AI for Developers](https://ai.google.dev/gemini-api/docs/image-generation)) | A/B      | 判断 Gemini 可做横评              |
| FLUX Kontext 定位为图像上下文编辑，fal 上 FLUX Kontext Pro 可调用 | Black Forest Labs / fal ([Black Forest Labs](https://bfl.ai/models/flux-kontext)) | A/B      | 判断 FLUX 可做短期 API            |
| Photoshop Generative Fill 2026 文档支持选择区域生成，并可用 Firefly、Gemini、FLUX 等模型 | Adobe 官方文档 ([Adobe Help Center](https://helpx.adobe.com/photoshop/desktop/create-open-import-images/create-images/edit-images-with-generative-fill.html)) | A        | 判断半人工黄金样张路线            |
| 通义万相 2.1 图像编辑支持局部重绘、图像修复、指令编辑，价格 0.14 元/张 | 阿里云官方文档 ([阿里云帮助中心](https://help.aliyun.com/zh/model-studio/wanx-image-edit)) | A        | 国内 API 横评候选                 |
| 即梦/火山公开资料显示支持多图输入、图像编辑和 inpainting     | 火山/即梦公开资料 ([火山引擎](https://www.volcengine.com/docs/85621/1820192?utm_source=chatgpt.com)) | B        | 国内 API 横评候选                 |
| 可灵图像 API 支持参考图和多图输入能力                        | 可灵公开资料 ([阿里云帮助中心](https://help.aliyun.com/zh/model-studio/kling-image-generation-api-reference?utm_source=chatgpt.com)) | B        | 国内 API 横评候选                 |
| Stable-Hair 包含 Bald Converter、Hair Extractor、IdentityNet、ControlNet 等模块 | Stable-Hair 官方 GitHub ([GitHub](https://github.com/Xiaojiu-z/Stable-Hair)) | A        | 判断专门 hair transfer 技术价值   |
| Stable-Hair v2 是多视角 hair transfer 研究，并公开代码/模型  | arXiv / GitHub ([arXiv](https://arxiv.org/abs/2507.07591?utm_source=chatgpt.com)) | A        | 判断侧面一致性属于中长期研究      |
| HairFastGAN 是 NeurIPS 2024 项目，目标是参考发型迁移并接近实时 | HairFastGAN 官方 GitHub ([GitHub](https://github.com/AIRI-Institute/HairFastGAN)) | A        | 判断可做开源快速试验              |
| HairFusion 提供推理代码，但依赖 DensePose、agnostic image、大 checkpoint，且许可证非商业 | HairFusion 官方 GitHub ([GitHub](https://github.com/cychungg/HairFusion)) | A        | 判断部署与商用风险                |
| IDM-VTON、CatVTON、MagicTryOn 展示了商品图保真、mask、DensePose、轻量推理等 VTON 方法 | 官方 GitHub / 论文页 ([GitHub](https://github.com/yisol/IDM-VTON)) | A        | 迁移 VTON 方法论                  |
| Banuba 官方有 Virtual Wig Try-On SDK，支持照片式试戴和电商集成 | Banuba 官方页面 ([Banuba](https://www.banuba.com/wig-virtual-try-on)) | B        | 商业 SDK PoC                      |
| Banuba Face AR SDK 可在设备端运行，厂商称不需要访问用户图片/视频 | Banuba 隐私页 ([Banuba](https://www.banuba.com/faq/banuba-sdk-gdpr-ccpa)) | B        | 隐私判断                          |
| Perfect Corp / YouCam 有 hairstyle / hair color API 公开资料 | Perfect Corp / YouCam 公开资料 ([YouCam Online Editor](https://yce.perfectcorp.com/ai-api/products/ai-hairstyle-api?utm_source=chatgpt.com)) | B        | 商业 API 候选                     |
| 未找到 Perfect Corp / YouCam 支持任意假发 SKU 上传并保真的公开证据 | 本次检索结论                                                 | X        | 防止误判为 wig SKU API            |
| SAM 2、MODNet、BiRefNet 可用于分割 / matting / 抠图相关环节  | 官方/论文/GitHub ([Meta AI](https://ai.meta.com/research/sam2/?utm_source=chatgpt.com)) | A        | 发际线与 mask 工作流              |
| IP-Adapter、InstantID、PuLID 是参考图控制 / 身份保持相关技术 | 官方 GitHub / 论文页 ([GitHub](https://github.com/tencent-ailab/IP-Adapter?utm_source=chatgpt.com)) | A        | 人脸保持与参考控制                |
| 3D 头发重建仍是活跃研究方向，如 Gaussian Haircut、3DGS hair、Digital Salon | 论文 / GitHub / 项目页 ([GitHub](https://github.com/eth-ait/GaussianHaircut?utm_source=chatgpt.com)) | A        | 判断 3D 自研短期不现实            |
| fal 部分图像编辑模型有公开按次价格                           | fal 价格页 ([Fal.ai](https://fal.ai/pricing))                | B        | 成本估算                          |
| OpenAI / Google / Banuba 的数据处理方式存在差异              | 官方政策 / 文档 ([OpenAI](https://openai.com/enterprise-privacy/?utm_source=chatgpt.com)) | A/B      | 隐私策略判断                      |

------

## 最终明确结论

1. **当前最推荐技术路线**：
   **通用图像编辑 API 横评 + 精准 mask/inpainting + 假头模/模特佩戴图参考 + 半人工修边。** 这是 7 天内唯一能快速判断“效果是否能打动业内人士”的路线。
2. **第二推荐路线**：
   **商业 Wig SDK PoC，优先 Banuba。** 它是公开资料里最明确写到 wig try-on 的 SDK，但必须实测能否接入商家的具体 SKU。([Banuba](https://www.banuba.com/wig-virtual-try-on))
3. **不推荐路线**：
   - prompt-only 全图生成；
   - 7 天内做侧脸；
   - 7 天内做实时视频；
   - 自研 3D/AR；
   - 现在训练大模型；
   - 只拿平铺商品图做主参考。
4. **7 天内是否应继续做侧面？**
   **不应继续。** 侧面一致性是 multi-view 问题，Stable-Hair v2 这类研究才专门处理，短期应砍掉。([arXiv](https://arxiv.org/abs/2507.07591?utm_source=chatgpt.com))
5. **是否需要找外部 ComfyUI / 图像生成工程师？**
   **需要，但只做窄任务。** 目标是固化正面单图 workflow，不是让外包探索所有路线。
6. **外包任务是什么？**
   做一个可复现的正面假发试戴工作流：mask、inpainting、reference conditioning、脸部冻结、5 张候选、1 张黄金修图、PSD/ComfyUI workflow/参数交付。
7. **商业 API 优先试哪 5 个？**
   - GPT Image / OpenAI Image Edit
   - Gemini Nano Banana
   - FLUX.1 Kontext Pro / fal
   - 即梦 / Seedream 图像编辑
   - 通义万相 2.1 图像编辑
     另行联系 Banuba 做 SDK PoC，不与 7 天 API 横评混在一起。
8. **如果继续小王主导，他下一步最小动作是什么？**
   **拿 1 张用户正面照 + 1 张假头模佩戴假发图 + 1 个发区 mask，对 3 个模型各生成 5 张，做评分表。** 不做侧脸，不改商业逻辑，不扩模型范围。
9. **当前 Demo 效果差，最可能根因是什么？**
   **整体路线 + 输入素材 + mask 控制问题。** 不是单纯 prompt。模型现在大概率在做“生成一个戴类似发型的人”，而不是“保留这个人脸，把这顶具体假发自然戴上去”。
10. **戴一下项目是否还有技术可行性？**
    **中-强。**
    前提是限定为：**正面、清晰输入、假头模/模特佩戴图、半人工或严格工作流、先给卖家看效果样张。**
    如果目标变成：任意用户照、任意平铺商品图、正侧面一致、30 秒全自动、SKU 完全保真、可直接规模化 SaaS——那当前可行性是 **弱**。