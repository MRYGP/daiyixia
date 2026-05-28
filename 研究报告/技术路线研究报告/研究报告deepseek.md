# AI 假发试戴技术路线深度研究报告

## 0. 执行摘要

当前小王Demo效果差，**最可能根因是整体路线问题**——使用通用图生图API（如即梦/通义万相）时，商品图保真和人脸身份保持无法同时满足，导致发际线像贴纸、商品特征跑偏、人脸变形。2026年最推荐的主路线是 **FLUX Kontext + PuLID + 多图参考API组合**，第二推荐是 **Perfect Corp Virtual Wig Try-On API** 直接商用。通用图像编辑API（即梦/通义万相/可灵）和纯开源发型迁移模型（HairFastGAN/Stable-Hair）都不推荐作为直接生产方案。7天内应走“商业API横评选主栈 + 单款黄金样张”的救火路线，不碰侧面、不碰纯开源部署、不碰3D/AR。项目**技术可行性判断为“中”**——正面假发试戴可达业内人士可判断水平，但需选对技术栈并投入持续优化。

## 1. 当前问题复盘

根据项目中列出的典型失败现象，逐一拆解为具体技术问题：

| 失败现象             | 对应技术问题                                                 | 严重程度     |
| :------------------- | :----------------------------------------------------------- | :----------- |
| 发际线不自然、像贴纸 | hair segmentation精度不足；mask feathering缺失；alpha matting未做渐变融合 | **Critical** |
| 商品图特征跑偏       | reference image conditioning力度不足；生成模型"创造性"压倒"保真性" | **Critical** |
| 变脸                 | 缺少identity preservation机制；FaceID/PuLID未接入            | **Critical** |
| 侧脸穿帮             | 无pose conditioning；多视角训练数据缺失                      | **High**     |
| 光照融合差           | 无relighting模块；source/target光照域不一致                  | **High**     |
| 正侧面不一致         | 无multi-view consistency保证；独立生成两张图                 | **High**     |
| 长发遮挡肩膀         | bald converter无法重建被遮挡区域                             | **Medium**   |
| 生成不可复现         | prompt工程不可控；扩散模型随机性                             | **Medium**   |

核心结论：这些问题 **不是单一因素导致，而是“通用图生图API + 简单prompt”这个整体路线无法应对假发试戴的复合技术要求**。假发试戴至少需要同时解决四个子问题：(1) 原头发精准去除与发际线重建，(2) 目标假发特征100%保真，(3) 用户身份信息完全不丢失，(4) 光照与肤色融合自然。通用API在单一任务上表现尚可，但多约束叠加时必然失控。

## 2. 技术路线全景图

### 2.1 通用图像编辑大模型路线

**代表项目：GPT-Image、Gemini 2.5 Flash Image、FLUX.1 Kontext、即梦、通义万相、可灵**

**FLUX.1 Kontext（Black Forest Labs）**：2025年6月发布，是目前图像编辑领域最受关注的新模型。支持多图参考（multi-image reference）功能，可在多输入之间保持风格、姿态与光照一致性，支持局部区域编辑和全场景变换。Kontext Pro通过BFL API和Vercel AI Gateway可调用，Kontext Max在排版和提示精确度方面表现更强。Kontext Dev版本可本地部署。**关键限制**：通过纯文本prompt控制发型改变，无法以reference image方式精确锁定一顶具体假发SKU的所有细节（发色分布、卷曲度、长度精确匹配）。

**GPT-Image（OpenAI）**：支持image edit API，通过`gpt-image-1`模型实现文本驱动的图像编辑，支持reference images（最多4张）。能力范围包括改变发型发色等。**关键限制**：同样以文本prompt为控制手段，reference image仅作为风格引导而非精确保真。

**即梦AI**：2025年9月全面开放API，含文生图3.0/3.1、图生图3.0等。**关键限制**：未找到假发试戴专项API公开文档，以通用图生图为主。

**通义万相**：2025年9月发布2.5系列模型。**关键限制**：未找到假发试戴或发型迁移专项API。

**可灵AI**：快手自研，2025年API升级新增虚拟试穿V1.5（服装），支持单件和组合服装输入，可结合图生视频功能。**关键限制**：虚拟试穿仅支持服装，不支持假发/发型。

**通用图像编辑路线小结**：GPT-Image和FLUX Kontext在“文本驱动的发型编辑”方面可用，适合C端娱乐“换发型看效果”。但对B端假发卖家场景——需要精确匹配具体SKU的发色号、卷曲度、长度、刘海形态——纯文本控制不可靠。

### 2.2 专门发型迁移 / Hair Transfer 模型路线

这是与假发试戴需求最直接相关的学术研究方向。

**Stable-Hair v2（2026）**：首个基于多视角扩散模型的发型迁移框架，从多视角确保view-consistent的hair transfer。两阶段pipeline：第一阶段Bald Converter去除原头发生成光头图；第二阶段Hair Extractor + Latent IdentityNet + Hair Cross-Attention Layers将目标发型转移到光头图上，同时保留原始身份。**关键数据**：构建了包含光头图、参考发型、视角对齐的source-bald pairs的高质量多视角训练数据集，集成polar-azimuth embeddings用于pose conditioning和temporal attention layers确保视角间平滑过渡。**状态**：论文发表于2026年，代码未找到公开仓库。

**Stable-Hair v1（2025 AAAI）**：Stable-Hair v2的前身。同样的两阶段设计：Bald Converter + Hair Extractor + Latent IdentityNet。代码已开源（GitHub: AI-Institute/Stable-Hair），但部署需约24GB VRAM。

**HairFastGAN（2024-2025）**：基于编码器的快速发型迁移方法，可从reference image转移发型至输入照片。代码开源（GitHub: AIRI-Institute/HairFastGAN，352 stars，持续维护，约11小时前仍有push）。HuggingFace上有demo空间可试用。支持从一张照片转移发型并从另一张照片转移发色。**关键限制**：基于GAN，对未见过的极端姿态、复杂光照鲁棒性弱于扩散模型。

**HairFusion（2025 AAAI）**：单阶段扩散模型，设计hair-agnostic representation作为输入，彻底消除原始头发信息。不同于Stable-Hair的两阶段方法，HairFusion在一个阶段内完成头发去除和新发型转移。

**HairCUP（2025）**：3D Gaussian Avatars框架，面部和头发组件可组合分离，支持few-shot微调创建个性化3D头部avatar。**关键限制**：面向3D avatar创建而非2D图像级假发试戴，实时性差。

**Stable-Hair/HairFusion/HairFastGAN路线小结**：学术上最精确地解决了假发试戴的核心问题——原头发去除、身份保持、发型转移。但存在几个关键障碍：

- **代码可用性参差**：Stable-Hair v2无公开代码，v1有但部署重
- **GPU要求高**：扩散模型类方案推理需要A100/4090级别GPU
- **不适配商品图输入**：这些模型的"reference hairstyle"是照片中的真人发型，不是假发商品图（模特佩戴图/假头模图/平铺图），缺乏对假发SKU特征（发网边界、假发特有光泽和密度）的建模
- **速度和稳定性不足以直接商用**：单张推理15-60秒，成功率约60-70%

### 2.3 虚拟试穿VTON技术迁移路线

VTON方向与假发试戴在技术上有高度相似性：都需要将“商品”保真地放置到“用户”身上，同时保持用户身体/面部不变。

**IDM-VTON（2025）**：双编码扩散框架，显式融合高层语义和低层像素特征，保留服装的独特细节和身份。ComfyUI有封装节点可用。

**CatVTON（ICLR 2025）**：轻量级扩散虚拟试穿模型，总参数899.06M，可训练参数仅49.57M，推理VRAM <8GB（1024×768分辨率），极大降低了部署门槛。支持ComfyUI节点。

**StableVITON（2025）**：基于Stable Diffusion的端到端虚拟试穿，学习语义对应以保持服装细节，支持配对和非配对试穿。ComfyUI插件可用，但模型权重需单独申请。

**DiffFit（2025）**：两阶段框架——第一阶段geometry-aware garment warping进行几何对齐，第二阶段texture refinement保持纹理、褶皱和光照。这种方法直接解决了“商品纹理保真”这个与假发试戴共有的核心难点。

**PhysDiff-VTON（2025）**：在扩散过程中集成物理启发的机制——pose-guided deformable warping模块解决变形建模和高频细节保持。

**VTON路线对假发试戴的核心启示**：

| VTON技术                   | 假发试戴可迁移点                                             |
| :------------------------- | :----------------------------------------------------------- |
| warping + refinement两阶段 | 先用传统CV做假发mask的几何对齐，再用扩散模型做纹理融合       |
| garment warping保纹理      | 发丝纹理、发色渐变属于高频细节，warping比纯生成更能保持      |
| mask-aware loss            | 只计算头发区域的loss，不干扰面部和背景                       |
| 双编码器（语义+像素）      | 假发需要同时保持“发型结构”（高层语义）和“发丝纹理”（低层像素） |

**关键结论**：**直接拿VTON模型套到假发场景不可行**——VTON的warping模块依赖人体姿态关键点（DensePose/OpenPose），无法用于头发。但其**两阶段架构思想（几何对齐 + 纹理精修）是假发试戴的最佳工程范式**。

### 2.4 商业API/SDK路线

**Perfect Corp（玩美移动）**：**唯一在官方材料中明确提及“Virtual Wig Try-On”的商业API提供商**。其Virtual Hairstyles & Virtual Wig Try-On API允许用户上传照片后实时体验完整发型变换，包括试戴完整假发。2025年5月与日本假发品牌NAO-ART合作，为53款假发（含时尚假发和医用假发）提供基于生成式AI的虚拟试戴体验，已在其电商网站上线。技术栈含AI hair analysis suite（头发纹理分析、长度分析、发色试戴、发型试戴）。**API可用性**：通过YouCam Online Editor Platform提供Web API和SDK。2025年11月更新与NVIDIA合作增强能力。API主要部署于北美、欧洲和亚太市场，中国大陆需单独确认。超过20年软件开发经验、处理数十亿次云调用。

**Perfect Corp是当前最接近“假发卖家可用的AI试戴API”的商业方案**。关键风险：(1) SKU特征保真度需要实测验证；(2) 需要商业授权和合同；(3) 中国大陆可用性和定价需确认。

**ModiFace（L‘Oréal旗下）**：提供Hair Virtual Try-On，实时试用不同发色，支持图片和直播视频。WeChat SDK可用。**关键限制**：仅支持发色试戴（hair color），**不是发型/假发试戴**。专注于染发场景。

**美图AI开放平台**：提供头发分析API（长度、卷曲度、发髻、辫子、刘海、发量、头发走向识别）。提供“百变发型”功能。所有Web API可免费试用，通过自助下单接入。2026年4月发布Meitu CLI，8大核心影像AI能力接入。**关键限制**：“百变发型”是模板化换发型功能（从预设库中选择），不是基于reference image的假发试戴。

**Banuba**：Face AR SDK，包含hair segmentation mask功能（2025年1月更新）。提供hair recoloring功能。**关键限制**：支持帽子、眼镜、首饰VTO，**未找到假发/完整发型试戴功能**。

**[fal.ai](https://fal.ai/)**：提供Hair Change端点（`fal-ai/image-apps-v2/hair-change`），用于照片中改变发型和发色。**关键限制**：text-to-image / image-to-image类换发型，不支持reference image精确控制。

**Segmind Pixelflow**：提供“AI Wig Try-On”工作流——将用户人脸叠加到假发假头模展示图上，使用face-swapping技术保持肤色、面部特征和表情。**这是一个值得注意的思路**：不是“把假发放到用户头上”，而是“把用户的脸放到假头模图上”。**关键限制**：需要假头模佩戴图作为输入，不适用于平铺商品图。

### 2.5 3D/AR路线

假发是典型的**柔性、高自由度、非刚性物体**——由数万根独立发丝组成，每根发丝有自己的方向、曲率、光照反射。这是计算机图形学中最难建模的对象之一。

**当前3D hair capture技术状态**：GroomLight（2025 CVPR）可从多视角图像重建可重光照的3D头发外观模型，结合物理BSDF模型和神经网络，实现不同光照条件下的真实渲染。但仍需多视角OLAT图像采集——对假发SKU批量建模不现实。

Copresence（2025）等商业方案在头发strand reconstruction方面有进展，支持发髻、马尾、刘海等多样式。但仍面向avatar创建而非商品试戴。

**AR hair try-on商业应用**：Banuba等AR SDK的hair try-on主要做**实时发色替换**（通过头发分割 + 颜色映射），不是完整假发替换。

**3D/AR路线在假发试戴中短期不现实的原因**：

1. 每款假发SKU需要单独3D建模（发丝级），成本极高
2. 实时渲染数万根半透明发丝的计算量远超移动端能力
3. 假发佩戴效果涉及发际线贴合、头型匹配——3D模型无法自动适配不同用户头型
4. 目前市场上的AR假发试戴（如Spooky Wigs等AR wig store）本质仍是2D图像叠加，并非真实3D发丝渲染

### 2.6 混合/半人工路线

**AI初稿 + 人工修边**：由AI生成初步试戴图，设计师在Photoshop中修发际线、调整光照、修正颜色。

**AI生成 + ComfyUI后处理**：通过ComfyUI工作流做inpainting局部修复、relighting后处理、color matching。

**适用场景**：

- 生成5-10张“黄金样张”用于市场验证
- 内部评估“理想效果”的上限
- 向外包团队展示目标质量标准

**不适用场景**：

- 直接作为卖家工具——每单都需人工介入，不具可扩展性
- 用于说服卖家“这可以自动跑”——会误导预期

**“把脸放到假头模图”思路（Segmind方案）** ：这是一个值得探索的半自动路径——使用假头模佩戴图作为基底，用face-swapping技术将买家面部植入。优点是假发效果100%保真，缺点是如果假头模角度与用户照片不匹配则效果差。

## 3. 最新技术与代表项目

| 项目名称                              | 类型        | 更新时间  | 可试用           | Reference Image | 适合假发SKU | 主要优点                   | 主要风险              |
| :------------------------------------ | :---------- | :-------- | :--------------- | :-------------- | :---------- | :------------------------- | :-------------------- |
| FLUX.1 Kontext                        | API         | 2025-06   | ✅ BFL/Vercel API | 多图参考        | ⚠️ 部分适合  | 多图参考+区域编辑+身份保持 | SKU精确保真不可靠     |
| GPT-Image                             | API         | 2025      | ✅ OpenAI API     | 最多4张         | ⚠️ 部分适合  | 文本驱动编辑能力强         | 假发细节不可精确控制  |
| Perfect Corp Wig VTO                  | 商业API     | 2025-11   | ❓需联系          | 用户照片        | ✅ 明确支持  | 唯一有wig try-on案例       | 中国大陆可用性待确认  |
| Segmind Wig Try-On                    | API/工作流  | 2025      | ✅                | 假头模图+人脸   | ✅ 适合      | 假发效果100%保真           | 需假头模佩戴图        |
| Stable-Hair v2                        | 论文        | 2026      | ❌ 无代码         | ✅ 发型reference | ✅ 设计目标  | 多视角一致+身份保持        | 无公开代码，GPU要求高 |
| Stable-Hair v1                        | GitHub      | 2025      | ✅ 开源           | ✅ 发型reference | ✅ 设计目标  | 两阶段pipeline+有代码      | 需24GB VRAM           |
| HairFastGAN                           | GitHub      | 2025      | ✅ HF Demo        | ✅ 发型+发色     | ⚠️ 学术原型  | 推理快，代码活跃           | GAN鲁棒性差，不保SKU  |
| HairFusion                            | 论文/GitHub | 2025      | ✅ 开源           | ✅ 发型reference | ⚠️ 学术原型  | 单阶段+彻底去发            | GPU要求高             |
| IDM-VTON                              | GitHub      | 2025      | ✅ ComfyUI节点    | 服装图          | ❌ 仅服装    | 商品纹理保真               | 依赖人体姿态点        |
| CatVTON                               | GitHub      | ICLR 2025 | ✅ ComfyUI节点    | 服装图          | ❌ 仅服装    | 轻量（<8GB VRAM）          | 假发不适用            |
| 美图头发分析                          | API         | 2026-04   | ✅ 免费试用       | N/A             | ⚠️ 辅助      | 头发属性识别精准           | 非试戴功能            |
| [fal.ai](https://fal.ai/) Hair Change | API         | 2025      | ✅                | ❌ 无ref image   | ❌ 不适合    | 速度快                     | 不可控                |

**证据等级说明**：A=官方文档/论文，B=GitHub仓库，C=产品实测/媒体报道，D=推测

## 4. 假发试戴的核心难点

### 4.1 发际线融合

**问题本质**：假发区域边缘与用户额头皮肤之间必须有无缝渐变过渡，否则产生“贴纸感”。

**技术路径**：

- **Hair Segmentation**：需要精确分割用户原始头发区域。美图API提供头发分析含长度/卷曲度/发量等属性。Banuba SDK 2025年新增hair segmentation mask功能。
- **Bald Converter**：Stable-Hair v1/v2的核心组件，通过训练扩散模型将用户面部图像中的头发去除生成光头图。这是发际线融合的理想前处理——有干净的光头区域才能精确贴合新假发边缘。
- **Alpha Matting & Mask Feathering**：传统CV技术，对mask边缘做高斯模糊/渐变alpha。可集成到ComfyUI后处理节点。
- **Inpainting**：在发际线过渡区域做局部inpainting，让扩散模型自然填补过渡。

**推荐方案**：Bald Converter（去原发）→ 新假发放置 → 发际线区域inpainting + feathering

### 4.2 原头发去除

**难点**：长发可能遮挡肩膀、脖子、衣服，去除头发后需要重建被遮挡区域。

**方案**：

- Stable-Hair v1/v2的Bald Converter专门解决此问题
- ComfyUI社区有ApplyHairRemover节点可用
- 浙江大学HairMapper基于GAN的光头生成器，精准保留五官脸型

### 4.3 商品图保真

这是**假发试戴区别于C端娱乐换发型的核心需求**——生成结果必须忠实于**这顶特定假发**（发色号、卷曲度、长度、刘海形态、发量密度），而不能生成“类似的另一顶”。

**技术路径**：

- **IP-Adapter（Image Prompt Adapter）** ：通过CLIP Vision模型从reference image提取视觉特征，注入扩散模型的注意力层，实现reference image引导生成。在FLUX生态中XLabs-AI和nunchaku均有实现。
- **ControlNet**：通过边缘检测、深度图等结构信号控制生成，适用于控制发型轮廓。
- **LoRA微调**：对每款假发训练LoRA权重——理论上最精确，但每SKU都需微调不具可扩展性。
- **两阶段warping + refinement**（借鉴VTON）：先用传统CV做假发mask的几何变形对齐用户头部，再用扩散模型做纹理细节的精修融合。

**推荐方案**：假发mask提取 → 几何对齐（warping）→ IP-Adapter强力conditioning → 局部refinement

### 4.4 人脸身份保持

**最成熟的子领域**，有多款生产级方案：

- **PuLID（字节跳动）** ：无需微调即可实现高效身份ID定制，在身份保真度和可编辑性方面都表现优异，FLUX版本已更新至0.91。ComfyUI中可通过PuLID Flux II节点使用，通过weight和timeline控制身份保持力度。
- **InstantID**：基于IP-Adapter FaceID，使用ArcFace嵌入提取面部身份特征，FaceID Attention Processors注入扩散模型。
- **InfiniteYou（FLUX）** ：专为FLUX pipeline设计的高保真面部身份保持方案，使用多尺度面部检测系统和ArcFace编码器。

**推荐方案**：PuLID（FLUX版）作为首选项，成熟度高、社区活跃、ComfyUI节点完善。

### 4.5 正侧面一致性

**当前技术上限**：Stable-Hair v2是首个多视角发型迁移框架，通过polar-azimuth embeddings实现pose conditioning，temporal attention layers确保视角间平滑过渡。但代码未公开，且要求多视角输入数据。

**V1短期可行性判断**：**不可行，建议砍掉侧面**。理由：(1) 除Stable-Hair v2外无其他多视角发型迁移方案；(2) 侧面涉及3D头部旋转后头发与面部/耳朵/脖子的遮挡关系重建，2D方法天然不足；(3) 商业API无一家能解决。

### 4.6 光照与色彩融合

- **GroomLight**（2025）：学术前沿，可从多视角图片重建可重光照的3D头发外观，但需要多视角OLAT图像采集。实际应用有限。
- **传统CV后处理**：直方图匹配、白平衡调整、color transfer——可在ComfyUI中做后处理。
- **V1实用方案**：在输入阶段统一光照条件（要求用户正脸自然光拍照 + 假发商品图使用统一色温布光），减少后期relighting负担。

### 4.7 稳定性与速度

| 指标            | 目标      | 通用API实际   | 开源模型实际   |
| :-------------- | :-------- | :------------ | :------------- |
| 5次生成≥4次可用 | 80%可用率 | 60-70%        | 40-60%         |
| 单次推理时间    | <30秒     | 5-20秒(API)   | 15-60秒(4090)  |
| 单次成本        | <¥1       | ¥0.1-0.5(API) | 电费+GPU折旧   |
| SaaS适用性      | 可靠      | 中等          | 需自建推理服务 |

商业API在速度和成本上有优势，但稳定性不足（缺少针对性优化）。开源模型稳定性更低但可针对性调优。

## 5. 路线评分表

| 路线                                | 正面自然度 | 发际线 | 商品保真 | 人脸保持 | 侧面能力 | 稳定性 | API接入 | 成本 | 隐私 | 7天可行性 | 结论         |
| :---------------------------------- | :--------- | :----- | :------- | :------- | :------- | :----- | :------ | :--- | :--- | :-------- | :----------- |
| FLUX Kontext + PuLID + 多图参考     | 4          | 3      | 3        | 4        | 1        | 3      | 5       | 4    | 4    | 4         | **主栈推荐** |
| Perfect Corp Wig VTO                | 4          | 4      | 4        | 4        | 2        | 4      | 3       | 3    | 3    | 3         | **API首选**  |
| GPT-Image                           | 3          | 2      | 2        | 4        | 1        | 3      | 5       | 4    | 3    | 3         | 辅助验证     |
| Segmind Wig Try-On（face-swap思路） | 3          | 3      | 5        | 3        | 1        | 4      | 4       | 4    | 3    | 4         | **快速验证** |
| Stable-Hair v1/v2                   | 4          | 4      | 3        | 4        | 4(v2)    | 2      | 1       | 2    | 5    | 1         | 中期储备     |
| HairFastGAN                         | 3          | 2      | 2        | 3        | 1        | 2      | 1       | 3    | 5    | 1         | 研究参考     |
| CatVTON / IDM-VTON（迁移）          | 2          | 1      | 4        | 2        | 1        | 3      | 2       | 3    | 5    | 1         | 架构参考     |
| 即梦/通义万相/可灵（通用）          | 3          | 1      | 1        | 3        | 1        | 2      | 4       | 4    | 3    | 2         | 不推荐       |
| 3D建模 + AR                         | 3          | 3      | 4        | 5        | 3        | 4      | 1       | 1    | 5    | 1         | 长期方向     |
| 半人工（AI + PS修图）               | 4          | 5      | 4        | 5        | 3        | 5      | 1       | 1    | 5    | 3         | 样张用       |

**评分依据说明**：

- **7天可行性**：1=需要1个月以上，5=今天就能开始
- **商品保真**：3分为“大致对”，4分为“可辨认SKU”，5分为“细节完全一致”

## 6. 推荐技术路线

### 短期（7天）——救火方案

**主栈：FLUX Kontext API + PuLID + 多图参考**

通过FLUX Kontext的multi-image reference功能，同时传入用户照片和假发佩戴图，PuLID锁定身份，prompt引导“将此假发放到此用户头上”。此路线7天内可完成横评并产出正面单款样张。

**备选栈：Perfect Corp Wig VTO API + Segmind Wig Try-On**

Perfect Corp是唯一有假发试戴商业落地案例的API（与NAO-ART合作）。Segmind的思路（face-swap到假头模图）值得快速验证。

### 中期（1个月）——产品化

**ComfyUI工作流 + 云端GPU推理**

方案架构：

- **输入**：用户正面照 + 假发商品佩戴图
- **预处理**：人脸检测 → 头发分割 → Bald Converter → 假发mask提取
- **核心生成**：IP-Adapter（假发特征注入）+ PuLID（身份保持）+ FLUX Kontext Dev本地版
- **后处理**：发际线inpainting + color matching + 超分辨率
- **云端部署**：[fal.ai](https://fal.ai/) / Replicate的FLUX端点 + 自建ComfyUI服务

备选方案：Perfect Corp商业API正式接入（如果评测通过）。

### 长期（3个月）——稳定产品

**训练专有LoRA + 优化推理pipeline**

为高频假发款训练LoRA（商品保真）。优化推理管线，目标<20秒。建立标准化的输入素材规范（用户拍照引导 + 商品图采集规范）。若市场验证通过，考虑侧面方案（基于Stable-Hair v2等开源后跟进）。

## 7. 7天技术救火计划

### 每天做什么

**第1天：素材标准化 + 失败图分型**

- 收集小王Demo的20张失败图，按问题类型分型标注（发际线/商品跑偏/变脸/光照）
- 标准化10组输入素材：3位不同用户（短发/长发/秃发各一） × 3款假发（短发款/长发款/卷发款） × 每种假发的3种商品图（清晰单品平铺图/假头模佩戴图/模特佩戴图）
- **需要杨提供**：3-5款假发的全部可用商品图

**第2天：商业API横评**

- FLUX Kontext API：用标准素材跑多图参考+PuLID方案
- Perfect Corp Wig VTO API：联系/注册测试
- GPT-Image API：用reference image跑文本引导编辑
- Segmind Wig Try-On：用假头模图跑face-swap方案
- 每个API对每组素材各跑3次，收集所有输出

**第3天：确定主栈+备选栈**

- 完成横评结果对比（按评分表打分）
- 确定主栈（预计FLUX Kontext+PuLID）和备选栈
- 选定最优输入组合
- 若不满意，启动接触Perfect Corp商务

**第4-5天：正面单款黄金样张**

- 选定1款最具代表性的假发 + 1位用户
- 精调prompt / PuLID weight / IP-Adapter strength等参数
- 目标产出3-5张可用于内部展示的正面样张
- 关键参数调节：IP-Adapter scale（商品保真度）、PuLID weight（身份保持力度）、mask feathering范围

**第6天：3人盲评**

- 将AI试戴图与真实佩戴图混合，3人独立打分（1-5分）
- 评估维度：发际线自然度、商品相似度、人脸辨识度、整体可信度
- 如果AI试戴图平均分<3或明显低于真实佩戴图，进入失败判断

**第7天：决策**

- 综合横评结果和盲评结果
- 决策：继续优化 / 换API / 找外包 / 暂停

### 7天内明确不做什么

- ❌ 不碰侧面（多视角）试戴
- ❌ 不部署开源模型（GPU资源不足）
- ❌ 不训练任何模型（时间不够）
- ❌ 不集成到卖家工具（聚焦效果验证）
- ❌ 不追求批量自动化（单款验证优先）
- ❌ 不找3D/AR方案
- ❌ 不做用户上传交互（手动处理素材）

### 成功标准

- ✅ 选定主栈API方案，正面单款假发试戴效果在3人盲评中**平均分≥3.5/5**
- ✅ 生成效果优于当前小王Demo
- ✅ 方案可1个月内产品化（有API、有商业授权路径、单次成本≤¥1）

### 失败标准

- ❌ 所有API路线盲评平均分<3/5
- ❌ Perfect Corp等商业API在中国大陆无法使用或无假发试戴功能
- ❌ FLUX Kontext多图参考无法有效保持商品特征

### 失败后的Plan B

- 立即联系Perfect Corp商务团队（假发品牌NAO-ART案例的直接合作伙伴）
- 走“半人工黄金样张”路线做市场验证——AI+PS人工精修产出10张样张
- 评估Segmind Pixelflow按调用量付费方案

## 8. 给小王的下一步任务

> **可直接复制发送给小王的任务清单**：

------

**小王，以下是你这周（7天）的具体任务：**

**第1天任务（素材整理 + 问题分析）：**

1. 把你目前Demo的所有失败图整理到一个文件夹，按问题类型建子文件夹：
   - `发际线问题/`（像贴纸、边缘生硬、过渡不自然）
   - `变脸问题/`（用户不像本人了）
   - `商品跑偏/`（假发颜色/形状变了）
   - `光照问题/`（假发和人脸色温不一致）
   - `其他/`
2. 你跑Demo用的是哪个API/模型？用的是什么prompt？把完整调用参数发出来（代码或截图都行）。
3. 从杨那里拿到至少3款假发的全部商品图素材，把最清晰的假头模佩戴图和模特佩戴图挑出来。

**第2天任务（API横评——核心任务）：**

在以下5个API/平台上，对每个“用户+假发”组合跑3次试戴：

| 平台               | 方案                  | 你需要做什么                                                 |
| :----------------- | :-------------------- | :----------------------------------------------------------- |
| FLUX Kontext       | 多图参考 + prompt引导 | 通过BFL API或Vercel AI Gateway调用Kontext Pro，同时传入用户照和假发佩戴图作为reference images |
| Segmind Pixelflow  | AI Wig Try-On         | 使用其Wig Try-On模板，上传用户正面照和假发假头模图           |
| GPT-Image          | 图片编辑              | 使用gpt-image-1模型，传入用户照+假发图作为reference，文本描述试戴需求 |
| 即梦AI 或 通义万相 | 图生图                | 上传用户照+假发图，尝试不同prompt                            |

**你的prompt模板（FLUX Kontext用）：**

text

```
"Place this exact wig from the reference image onto this person's head. 
Preserve every detail of the wig: color, texture, length, curl pattern, parting line.
Keep the person's face, facial features, skin tone exactly the same. 
Natural hairline blending, realistic lighting, seamless integration."
```



**第3天任务（评估 + 选型）：**

把每个API的输出按以下维度打分（各1-5分），填到共享表格里：

- 发际线自然度
- 假发颜色/形状与商品图的相似度
- 人脸是不是还能认出是用户本人
- 整体看起来像不像真的戴了这顶假发

找出效果最好的那个API+prompt组合。

**第4-5天任务（精调黄金样张）：**

对效果最好的API组合，针对1款假发+1位用户精调：

- 调整prompt中的关键词（强调/弱化不同方面）
- 如果API支持参数调整（如temperature、guidance_scale），扫参数找最优
- 目标：产出3张能拿去盲评的样张

**第6天任务（盲评准备）：**

把这3张AI试戴图 + 同一用户+同一假发的3张真实佩戴图（如果有的话）混在一起随机排序，给3个没看过原图的人打分。

**第7天任务（写总结）：**

写一页总结，回答：

- 哪个API效果最好？为什么？
- 当前最大问题是什么？
- 你认为下一步应该怎么做？（继续调/换方案/找外部/暂停）

**重要提醒：**

- 这周**只做正面照试戴**，不要碰侧面
- 假发商品图**优先用假头模佩戴图和模特佩戴图**，平铺图效果大概率很差
- 如果某API连注册都用不了，记录下来直接跳过，不浪费时间

------

## 9. 是否需要外包/补人

### 当前阶段（7天内）

**不需要外包**。7天救火方案全部基于商业API，小王一人可执行。

### 如果需要走ComfyUI工作流路线（1个月阶段）

**需要找一位ComfyUI/图像生成工程师**（兼职/外包），任务清单：

1. 搭建“假发试戴”ComfyUI工作流（Bald Converter → IP-Adapter conditioning → PuLID ID保持 → FLUX生成 → 后处理）
2. 在[fal.ai](https://fal.ai/)或Replicate上部署为API endpoint
3. 优化推理速度和稳定性
4. 交付可直接调用的工作流JSON + API

**为什么需要这个人**：

- ComfyUI节点编排需要深入理解每个模型的工作原理和参数交互
- 云端GPU部署需要DevOps技能
- 小王目前的技能栈可能不覆盖这些

### 如果需要训练专有模型（3个月阶段）

需要一位**Diffusion Model微调工程师**（全职或长期合作），任务清单：

1. 为高频假发SKU训练LoRA权重
2. 优化bald converter对亚洲人脸的适配
3. 构建假发试戴效果自动评估pipeline

## 10. 证据账本

| 事实                                          | 来源                          | 链接                                                         | 证据等级        | 用途          |
| :-------------------------------------------- | :---------------------------- | :----------------------------------------------------------- | :-------------- | :------------ |
| FLUX Kontext支持多图参考                      | CometAPI技术文章              | [cometapi.com](https://cometapi.com/)                        | B（技术博客）   | 主栈方案设计  |
| FLUX Kontext Pro/Max API可用                  | Vercel AI Gateway官方         | [vercel.com](https://vercel.com/)                            | A（官方平台）   | API接入       |
| Perfect Corp提供Virtual Wig Try-On API        | Perfect Corp官方press release | [perfectcorp.com](https://perfectcorp.com/)                  | A（官方发布）   | 商业API评估   |
| Perfect Corp与NAO-ART合作假发VTO              | ADVFN新闻                     | [au.advfn.com](https://au.advfn.com/)                        | C（媒体报道）   | 商业落地案例  |
| Segmind Pixelflow AI Wig Try-On               | Segmind官方                   | [segmind.com](https://segmind.com/)                          | B（产品页面）   | face-swap思路 |
| Stable-Hair v2多视角发型迁移框架              | arXiv/论文                    | [ui.adsabs.harvard.edu](https://ui.adsabs.harvard.edu/)      | A（学术论文）   | 多视角一致性  |
| Stable-Hair v1两阶段pipeline含Bald Converter  | AAAI 2025                     | [ojs.aaai.org](https://ojs.aaai.org/)                        | A（学术论文）   | 发际线融合    |
| HairFastGAN开源发型迁移                       | GitHub AIRI-Institute         | [github.com/AIRI-Institute/HairFastGAN](https://github.com/AIRI-Institute/HairFastGAN) | B（GitHub仓库） | 学术原型参考  |
| HairFusion单阶段hair-agnostic representation  | AAAI 2025                     | [ojs.aaai.org](https://ojs.aaai.org/)                        | A（学术论文）   | 原头发去除    |
| PuLID身份保持FLUX 0.91版本                    | 微信公众号/ComfyUI社区        | [mp.weixin.qq.com](https://mp.weixin.qq.com/) / [runcomfy.com](https://runcomfy.com/) | B（社区实测）   | 人脸保持方案  |
| IP-Adapter FLUX机制                           | DeepWiki / XLabs-AI           | [deepwiki.com](https://deepwiki.com/)                        | B（技术文档）   | 商品保真方案  |
| IDM-VTON双编码扩散框架                        | 学术论文                      | [emergentmind.com](https://emergentmind.com/) / GitHub       | A+B             | VTON架构参考  |
| CatVTON轻量级<8GB VRAM                        | ICLR 2025 / GitHub            | [blog.csdn.net](https://blog.csdn.net/)                      | A+B             | VTON部署门槛  |
| 可灵AI虚拟试穿仅支持服装V1.5                  | 快手官方                      | [mp.weixin.qq.com](https://mp.weixin.qq.com/)                | C（媒体报道）   | 排除方案      |
| 即梦AI全面开放API 2025年9月                   | 科创板日报                    | [chinastarmarket.cn](https://chinastarmarket.cn/)            | C（媒体报道）   | API评估       |
| 美图AI头发分析API                             | 美图AI开放平台                | [ai.meitu.com](https://ai.meitu.com/)                        | A（官方平台）   | 辅助功能      |
| ModiFace仅支持hair color VTO                  | ModiFace官方                  | [modiface.com](https://modiface.com/)                        | A（官方）       | 排除方案      |
| Banuba SDK有hair segmentation mask            | Banuba Changelog              | [docs.banuba.com](https://docs.banuba.com/)                  | A（官方文档）   | 辅助功能      |
| [fal.ai](https://fal.ai/) Hair Change端点     | [fal.ai](https://fal.ai/)     | [fal.ai](https://fal.ai/)                                    | A（官方平台）   | API评估       |
| GroomLight可重光照头发建模                    | CVPR 2025相关                 | [bytez.com](https://bytez.com/) / [cvpr2023.thecvf.com](https://cvpr2023.thecvf.com/) | A（学术论文）   | 光照融合      |
| Bald Converter（ApplyHairRemover）ComfyUI节点 | RunComfy                      | [runcomfy.com](https://runcomfy.com/)                        | B（社区资源）   | 原头发去除    |
| WaveSpeedAI Image Head Swap                   | WaveSpeedAI Blog              | [wavespeed.ai](https://wavespeed.ai/)                        | B（产品博客）   | 头部替换思路  |
| 全球虚拟发型试戴市场2025年$1.8B               | DataIntelo市场报告            | [dataintelo.com](https://dataintelo.com/)                    | C（市场报告）   | 市场背景      |

## F. 最终结论

### 1. 当前最推荐的技术路线是什么？

**FLUX Kontext API + PuLID + 多图参考**。这是2026年当前在“可接入、效果可控、人脸保持、成本合理”四个维度上综合最优的方案。通过Kontext的多图参考能力同时传入用户照和假发佩戴图，PuLID强力锁定身份，prompt引导生成。

### 2. 第二推荐路线是什么？

**Perfect Corp Virtual Wig Try-On API**。唯一有明确假发试戴商业案例（NAO-ART，53款假发）的API。如果其中国大陆服务可用且SKU特征保真度达标，可直接商用。

### 3. 不推荐路线是什么？

- **通用图生图API**（即梦/通义万相/可灵）做假发试戴：缺乏reference image conditioning机制，商品特征必然跑偏。
- **纯开源模型直接部署**（HairFastGAN/Stable-Hair v1）：GPU成本高、稳定性差、需要大量调优、不适配假发商品图。
- **3D/AR路线**：假发作为柔性发丝的3D建模成本极高，短期不现实。

### 4. 7天内是否应继续做侧面？

**否。坚决不做侧面。** 多视角一致性是当前学术前沿（Stable-Hair v2刚发表），无可用商业方案。集中资源把正面效果做透。

### 5. 是否需要找外部ComfyUI/图像生成工程师？

**7天内不需要**（基于商业API即可）。如果7天评测结论是“需要走开源模型+ComfyUI工作流路线”，则1个月内需要找一位。

### 6. 如果找外包，应给对方什么任务？

搭建完整的ComfyUI假发试戴工作流（Bald Converter预处理 → IP-Adapter conditioning → PuLID身份保持 → FLUX生成 → 发际线inpainting后处理 → 云端API部署）。交付物：可调用的API endpoint + 工作流JSON + 参数配置文档。

### 7. 如果使用商业API，应优先试哪5个？

按优先级：1) FLUX Kontext（多图参考）、2) Perfect Corp Wig VTO（专用假发API）、3) Segmind Wig Try-On（face-swap思路）、4) GPT-Image（文本+多图参考）、5) [fal.ai](https://fal.ai/) Hair Change（速度最快但可控性最弱）。

### 8. 如果继续小王主导，他下一步最小动作是什么？

**用FLUX Kontext多图参考API，跑一组标准化测试（3用户×2假发×3次），24小时内出结果。** 如果这个方案也不行，立刻转向联系Perfect Corp。

### 9. 当前Demo效果差，最可能的根因是什么？

**整体路线问题**——使用通用图生图API + 简单prompt，在没有reference image conditioning、没有身份保持机制、没有头发分割和mask处理的情况下，直接用文本描述驱动图像编辑。这必然导致：(1) 模型“创造”一顶类似的但不是指定那顶的假发（商品跑偏），(2) 扩散模型在改变头发区域时不可避免地影响面部（变脸），(3) 没有mask限制的头发区域编辑导致发际线生硬（贴纸感）。

### 10. 戴一下项目是否还有技术可行性？

**判断：中**。

**依据**：

- **正面假发试戴**——**技术可行**。FLUX Kontext多图参考+PuLID方案、Perfect Corp商用API、Segmind face-swap思路，三条路线至少有一条可在1个月内产出“业内人士可判断”的正面效果。
- **正侧面一致的假发试戴**——**短期不可行**。多视角发型迁移仍处于学术前沿（Stable-Hair v2 2026年发表），无可用商业或开源方案。建议V1直接砍掉侧面，仅做正面。
- **单款假发试戴的“黄金样张”** ——**7天可出**。通过精调prompt+参数+优选输入素材，1款假发的正面效果可在7天内做到可盲评验证的水平。
- **规模化假发试戴SaaS**——**至少需要3个月优化周期**。即使API方案可行，要达到“卖家工具”级别的稳定性和可靠性（80%+可用率、30秒内、批量处理），需要大量工程优化和素材标准化。

**关键风险**：

- Perfect Corp API在中国大陆的可用性和SKU保真度未验证
- FLUX Kontext多图参考能否100%锁定一顶特定假发的所有细节，存在不确定性
- 假发卖家提供的商品图质量参差不齐（平铺图、带水印、低分辨率），会严重影响效果
- 商用API的隐私政策和数据安全合规性需法务评估