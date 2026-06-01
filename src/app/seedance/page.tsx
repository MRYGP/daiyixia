"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { SEEDANCE_ASSETS } from "@/data/seedance-assets";
import { SEEDANCE_WIGS } from "@/data/seedance-wigs";

type SeedanceResponse = {
  success: boolean;
  videoUrl?: string;
  lastFrameUrl?: string;
  taskId?: string;
  taskStatus?: string;
  latencyMs?: number;
  referenceImageUrl?: string;
  error?: string;
};

const DEFAULT_PROMPT =
  "A realistic short vertical hairstyle showcase video. A virtual model presents this hairstyle in clean studio lighting, natural hair movement, stable face identity, no exaggerated motion, commercial hair try-on style.";

export default function SeedanceVideoPage() {
  const hasConfiguredAssets = SEEDANCE_ASSETS.length > 0;
  const [selectedWigPath, setSelectedWigPath] = useState(SEEDANCE_WIGS[0]?.imagePath ?? "");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [assetId, setAssetId] = useState(SEEDANCE_ASSETS[0]?.assetId ?? "");
  const [useAssetReference, setUseAssetReference] = useState(hasConfiguredAssets);
  const [useReferenceImage, setUseReferenceImage] = useState(false);
  const [referenceImageConfirmed, setReferenceImageConfirmed] = useState(true);
  const [duration, setDuration] = useState(4);
  const [ratio, setRatio] = useState("9:16");
  const [resolution, setResolution] = useState("720p");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<SeedanceResponse | null>(null);
  const [error, setError] = useState("");

  const visibleWigs = SEEDANCE_WIGS;
  const selectedWig = useMemo(
    () => SEEDANCE_WIGS.find((wig) => wig.imagePath === selectedWigPath) ?? SEEDANCE_WIGS[0],
    [selectedWigPath],
  );
  const canGenerate = (!useAssetReference || Boolean(assetId)) && (!useReferenceImage || referenceImageConfirmed);

  async function startVideoTest() {
    setIsGenerating(true);
    setResult(null);
    setError("");

    try {
      const response = await fetch("/api/seedance-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          assetId,
          useAssetReference,
          wigImagePath: selectedWigPath,
          useUserReference: false,
          useReferenceImage,
          referenceImageConfirmed,
          duration,
          ratio,
          resolution,
        }),
      });
      const data = (await response.json()) as SeedanceResponse;

      if (!response.ok || !data.success || !data.videoUrl) {
        throw new Error(data.error || "Seedance 视频生成失败");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seedance 视频生成失败");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.kicker}>Seedance 2.0 Video Test</div>
          <h1 style={styles.title}>发型视频生成测试</h1>
          <p style={styles.subtitle}>用于验证 Seedance 2.0 是否适合把发型或试戴结果做成短视频展示。</p>
        </div>
        <Link href="/" style={styles.backLink}>
          返回戴一下试戴
        </Link>
      </header>

      <section style={styles.notice}>
        <strong>测试边界</strong>
        <span>
          Seedance 2.0 文档说明对含真人脸素材有限制。默认建议先用纯文本生成虚拟发型视频；如启用参考图，请确认素材已授权并符合平台要求。
        </span>
      </section>

      <section style={styles.layout}>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.sectionTitle}>视频参数</h2>
            <button type="button" onClick={startVideoTest} disabled={isGenerating || !canGenerate} style={styles.primaryButton}>
              {isGenerating ? "生成中..." : "生成测试视频"}
            </button>
          </div>

          <label style={styles.fieldWide}>
            提示词
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={6} style={styles.textarea} />
          </label>

          <div style={styles.formGrid}>
            <label style={styles.field}>
              时长
              <select value={duration} onChange={(event) => setDuration(Number(event.target.value))} style={styles.input}>
                <option value={4}>4 秒</option>
                <option value={5}>5 秒</option>
                <option value={8}>8 秒</option>
                <option value={12}>12 秒</option>
              </select>
            </label>
            <label style={styles.field}>
              比例
              <select value={ratio} onChange={(event) => setRatio(event.target.value)} style={styles.input}>
                <option value="9:16">9:16 竖屏</option>
                <option value="1:1">1:1 方图</option>
                <option value="16:9">16:9 横屏</option>
                <option value="adaptive">自适应</option>
              </select>
            </label>
            <label style={styles.field}>
              分辨率
              <select value={resolution} onChange={(event) => setResolution(event.target.value)} style={styles.input}>
                <option value="720p">720p</option>
                <option value="480p">480p</option>
                <option value="1080p">1080p</option>
              </select>
            </label>
          </div>

          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={useAssetReference}
              disabled={!hasConfiguredAssets}
              onChange={(event) => {
                setUseAssetReference(event.target.checked);
                if (event.target.checked) {
                  setUseReferenceImage(true);
                }
              }}
            />
            使用已入库真人 Asset
          </label>

          {useAssetReference ? (
            <label style={styles.fieldWide}>
              真人素材
              <select
                value={assetId}
                onChange={(event) => setAssetId(event.target.value)}
                style={styles.input}
              >
                {SEEDANCE_ASSETS.map((asset) => (
                  <option key={asset.id} value={asset.assetId}>
                    {asset.name} - {asset.assetId}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={useReferenceImage}
              onChange={(event) => {
                setUseReferenceImage(event.target.checked);
                if (!event.target.checked) {
                  setReferenceImageConfirmed(false);
                  setUseAssetReference(false);
                }
              }}
            />
            使用当前无真人假发图作为发型参考
          </label>

          {useReferenceImage ? (
            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={referenceImageConfirmed}
                onChange={(event) => setReferenceImageConfirmed(event.target.checked)}
              />
              我确认该参考图素材已授权，并符合 Seedance 对真人素材的输入要求
            </label>
          ) : null}

          {useReferenceImage && !referenceImageConfirmed ? <p style={styles.warning}>启用真人 Asset 或假发参考图后，必须先确认授权后才能提交。</p> : null}
          {error ? <pre style={styles.error}>错误：{error}</pre> : null}
        </div>

        <aside style={styles.panel}>
          <h2 style={styles.sectionTitle}>无真人假发图</h2>
          <p style={styles.muted}>这里不再使用真人模特发型照，只使用假发商品图、模特头图或裁剪图。</p>

          <div style={styles.selectedWig}>
            <img src={selectedWig.imagePath} alt={selectedWig.name} style={styles.selectedWigImage} />
            <div>
              <strong>{selectedWig.name}</strong>
              <p style={styles.muted}>
                {selectedWig.color} / {selectedWig.bangType}
              </p>
            </div>
          </div>

          <div style={styles.styleGrid}>
            {visibleWigs.map((wig) => (
              <button
                key={wig.id}
                type="button"
                onClick={() => {
                  setSelectedWigPath(wig.imagePath);
                  setResult(null);
                  setError("");
                }}
                style={{
                  ...styles.styleCard,
                  ...(selectedWigPath === wig.imagePath ? styles.selectedStyleCard : {}),
                }}
              >
                <img src={wig.imagePath} alt={wig.name} style={styles.styleImage} />
                <span>{wig.name}</span>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section style={styles.resultPanel}>
        <h2 style={styles.sectionTitle}>视频结果</h2>
        {result?.videoUrl ? (
          <div style={styles.videoGrid}>
            <video src={result.videoUrl} controls playsInline style={styles.video} />
            <div style={styles.meta}>
              <p>task_id：{result.taskId}</p>
              <p>状态：{result.taskStatus}</p>
              {result.latencyMs ? <p>耗时：{Math.round(result.latencyMs / 1000)} 秒</p> : null}
              {result.referenceImageUrl ? <p>已使用参考图</p> : <p>纯文本生成</p>}
              {result.lastFrameUrl ? (
                <a href={result.lastFrameUrl} target="_blank" rel="noreferrer" style={styles.link}>
                  查看尾帧
                </a>
              ) : null}
              <a href={result.videoUrl} target="_blank" rel="noreferrer" style={styles.link}>
                打开视频地址
              </a>
            </div>
          </div>
        ) : (
          <div style={styles.emptyResult}>{isGenerating ? "正在等待 Seedance 返回视频..." : "生成后视频会显示在这里"}</div>
        )}
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: 24,
    fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
    color: "#10201f",
    background: "#f3fbf8",
  },
  header: {
    maxWidth: 1280,
    margin: "0 auto 18px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 16,
  },
  kicker: {
    color: "#0f8f7a",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.15,
    letterSpacing: 0,
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#536462",
    lineHeight: 1.6,
  },
  backLink: {
    minHeight: 38,
    display: "inline-flex",
    alignItems: "center",
    padding: "0 14px",
    borderRadius: 6,
    border: "1px solid #cddbd7",
    background: "#ffffff",
    color: "#10201f",
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  notice: {
    maxWidth: 1280,
    margin: "0 auto 18px",
    padding: 14,
    display: "grid",
    gap: 6,
    border: "1px solid #f2d18b",
    borderRadius: 8,
    background: "#fff7ed",
    color: "#8a4b00",
    lineHeight: 1.5,
  },
  layout: {
    maxWidth: 1280,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 18,
    alignItems: "start",
  },
  panel: {
    background: "#ffffff",
    border: "1px solid #dce7e4",
    borderRadius: 8,
    padding: 18,
    boxShadow: "0 16px 44px rgba(20, 73, 66, 0.08)",
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    lineHeight: 1.25,
    letterSpacing: 0,
  },
  primaryButton: {
    minHeight: 42,
    padding: "0 18px",
    borderRadius: 6,
    border: "1px solid #00a88f",
    background: "#00a88f",
    color: "#ffffff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  fieldWide: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    color: "#536462",
    fontSize: 14,
  },
  textarea: {
    border: "1px solid #cddbd7",
    borderRadius: 6,
    padding: 10,
    resize: "vertical",
    fontFamily: "inherit",
    lineHeight: 1.5,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
    marginTop: 14,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 14,
    color: "#536462",
  },
  input: {
    minHeight: 38,
    border: "1px solid #cddbd7",
    borderRadius: 6,
    padding: "6px 8px",
    fontFamily: "inherit",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    color: "#10201f",
    lineHeight: 1.5,
  },
  userReference: {
    display: "grid",
    gridTemplateColumns: "72px minmax(0, 1fr)",
    gap: 10,
    alignItems: "center",
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    background: "#f5faf8",
    color: "#536462",
    fontSize: 14,
    lineHeight: 1.5,
  },
  userReferenceImage: {
    width: 72,
    height: 86,
    objectFit: "cover",
    borderRadius: 6,
    background: "#edf4f2",
  },
  warning: {
    margin: "12px 0 0",
    padding: 10,
    borderRadius: 6,
    background: "#fff7ed",
    color: "#9a3412",
    fontSize: 14,
  },
  error: {
    margin: "12px 0 0",
    padding: 12,
    borderRadius: 6,
    background: "#fff1f2",
    color: "#be123c",
    whiteSpace: "pre-wrap",
    overflowX: "auto",
    fontSize: 13,
  },
  tabs: {
    display: "inline-flex",
    padding: 4,
    margin: "14px 0",
    border: "1px solid #dce7e4",
    borderRadius: 8,
    background: "#f5faf8",
  },
  tab: {
    minHeight: 34,
    padding: "0 14px",
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: "#536462",
    cursor: "pointer",
    fontSize: 14,
  },
  activeTab: {
    background: "#10201f",
    color: "#ffffff",
  },
  selectedWig: {
    display: "grid",
    gridTemplateColumns: "96px minmax(0, 1fr)",
    gap: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  selectedWigImage: {
    width: 96,
    height: 112,
    objectFit: "cover",
    borderRadius: 8,
    background: "#edf4f2",
  },
  muted: {
    margin: "6px 0 0",
    color: "#60706e",
    fontSize: 14,
    lineHeight: 1.5,
  },
  styleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))",
    gap: 10,
  },
  styleCard: {
    display: "grid",
    gap: 7,
    padding: 7,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#dce7e4",
    borderRadius: 8,
    background: "#ffffff",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 13,
    color: "#10201f",
  },
  selectedStyleCard: {
    borderColor: "#00a88f",
    boxShadow: "0 0 0 2px rgba(0, 168, 143, 0.16)",
  },
  styleImage: {
    width: "100%",
    aspectRatio: "1 / 1.08",
    objectFit: "cover",
    borderRadius: 6,
    background: "#edf4f2",
  },
  resultPanel: {
    maxWidth: 1280,
    margin: "18px auto 0",
    background: "#ffffff",
    border: "1px solid #dce7e4",
    borderRadius: 8,
    padding: 18,
  },
  videoGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 420px) minmax(0, 1fr)",
    gap: 16,
    alignItems: "start",
    marginTop: 14,
  },
  video: {
    width: "100%",
    aspectRatio: "9 / 16",
    borderRadius: 8,
    background: "#10201f",
  },
  meta: {
    color: "#536462",
    lineHeight: 1.7,
    wordBreak: "break-word",
  },
  link: {
    display: "block",
    marginTop: 8,
    color: "#0f8f7a",
  },
  emptyResult: {
    minHeight: 220,
    marginTop: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    background: "#edf4f2",
    color: "#60706e",
  },
};
