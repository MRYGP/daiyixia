# 戴一下 AI 假发试戴 Demo

“戴一下”是面向假发商户的 AI 试戴 Demo。当前版本验证以下最小闭环：

```text
用户上传正面照
-> 商户上传或拍摄假发商品图
-> 后端提交静态发型迁移任务
-> 返回用户本人试戴效果图
```

## 页面入口

本地启动后访问：

| 页面 | 地址 | 用途 |
| --- | --- | --- |
| 样本测试台 | `http://localhost:3001/` | 内部选择样本、生成结果和人工验收 |
| 手机扫码页 | `http://localhost:3001/mobile` | 用户上传自拍并选择发型 |
| 商户自助页 | `http://localhost:3001/custom` | 用户上传照片，商户上传或拍摄假发图 |
| 视频探索页 | `http://localhost:3001/seedance` | Seedance 2.0 辅助技术验证 |

## 启动方式

复制环境变量模板：

```bash
copy .env.example .env.local
```

填写本地配置后启动：

```bash
docker compose up --build
```

类型检查：

```bash
docker compose run --rm app npm run typecheck
```

## 环境变量

```bash
PUBLIC_BASE_URL=https://你的公网地址
YOUCAM_API_BASE=https://yce-api-01.makeupar.com
YOUCAM_API_KEY=你的静态试戴服务密钥

ARK_API_KEY=你的火山方舟密钥
SEEDANCE_MODEL=doubao-seedance-2-0-260128
NEXT_PUBLIC_SEEDANCE_ASSET_IDS=已授权真人素材Asset ID，多个值用英文逗号分隔
```

`PUBLIC_BASE_URL` 必须可以被外部服务访问。开发环境可使用 Cloudflare Tunnel 或 ngrok。

## 隐私与素材规则

公开仓库不会提交：

- `.env.local` 和真实 API Key。
- 用户自拍和其他真人测试照片。
- 未确认授权的真人发型参考图。
- 生成结果图。
- 本地运行日志。
- 真人素材 Asset ID。

本地测试素材应放在已被 `.gitignore` 排除的目录中：

```text
public/uploads/
public/outputs/
public/samples/users/
public/samples/wigs/youcam-candidates/
public/samples/wigs/female-hairstyles/
```

仓库只保留无真人的裁剪假发示例和代码。真实商户素材需要在本地或私有存储中维护。

## 项目同步资料

轻量跟进资料放在：

```text
小王Demo跟进/
```

其中包括当前状态、图像实验日志、技术能力雷达图和日报。
