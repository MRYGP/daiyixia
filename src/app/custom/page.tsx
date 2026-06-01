"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { ChangeEvent, useState } from "react";

type UploadKind = "user-selfie" | "merchant-wig";

type UploadResponse = {
  success: boolean;
  imagePath?: string;
  error?: string;
};

type TryOnResponse = {
  success: boolean;
  resultImageUrl?: string;
  latencyMs?: number;
  error?: string;
};

export default function CustomTryOnPage() {
  const [userImagePath, setUserImagePath] = useState("");
  const [userPreview, setUserPreview] = useState("");
  const [wigImagePath, setWigImagePath] = useState("");
  const [wigPreview, setWigPreview] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [uploadingKind, setUploadingKind] = useState<UploadKind | "">("");
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleUpload(kind: UploadKind, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadingKind(kind);
    setError("");
    setResultUrl("");
    setStatusText(kind === "user-selfie" ? "正在处理用户照片..." : "正在处理假发照片...");

    try {
      const jpegBlob = await prepareJpeg(file, 1024);
      const previewUrl = URL.createObjectURL(jpegBlob);
      const formData = new FormData();
      formData.append("file", jpegBlob, kind === "user-selfie" ? "selfie.jpg" : "wig.jpg");
      formData.append("uploadKind", kind);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as UploadResponse;

      if (!response.ok || !data.success || !data.imagePath) {
        URL.revokeObjectURL(previewUrl);
        throw new Error(data.error || "照片上传失败");
      }

      if (kind === "user-selfie") {
        if (userPreview) {
          URL.revokeObjectURL(userPreview);
        }
        setUserPreview(previewUrl);
        setUserImagePath(data.imagePath);
      } else {
        if (wigPreview) {
          URL.revokeObjectURL(wigPreview);
        }
        setWigPreview(previewUrl);
        setWigImagePath(data.imagePath);
      }

      setStatusText(kind === "user-selfie" ? "用户照片已上传。" : "假发照片已上传。");
    } catch (uploadError) {
      setStatusText("");
      setError(uploadError instanceof Error ? uploadError.message : "照片上传失败");
    } finally {
      setUploadingKind("");
      event.target.value = "";
    }
  }

  async function startTryOn() {
    if (!userImagePath || !wigImagePath) {
      setError("请先上传用户照片和商户假发照片。");
      return;
    }

    setIsGenerating(true);
    setError("");
    setResultUrl("");
    setStatusText("正在生成试戴图，通常需要 15-40 秒...");

    try {
      const response = await fetch("/api/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userImagePath,
          wigImagePath,
        }),
      });
      const data = (await response.json()) as TryOnResponse;

      if (!response.ok || !data.success || !data.resultImageUrl) {
        throw new Error(data.error || "试戴图生成失败");
      }

      setResultUrl(data.resultImageUrl);
      setStatusText(data.latencyMs ? `试戴图已生成，耗时 ${Math.round(data.latencyMs / 1000)} 秒。` : "试戴图已生成。");
    } catch (generationError) {
      setStatusText("");
      setError(generationError instanceof Error ? generationError.message : "试戴图生成失败");
    } finally {
      setIsGenerating(false);
    }
  }

  const isBusy = Boolean(uploadingKind) || isGenerating;

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.kicker}>戴一下 · 商户自助试戴</div>
          <h1 style={styles.title}>上传用户照片和假发照片</h1>
          <p style={styles.subtitle}>商户准备假发商品图，用户上传正面照，即可生成专属试戴效果。</p>
        </div>
        <Link href="/" style={styles.backLink}>返回样本测试</Link>
      </header>

      <section style={styles.workflow}>
        <UploadPanel
          step="1"
          title="用户上传正面照"
          description="支持手机自拍或从相册选择。请使用单人正脸、脸部清晰、肩膀可见的照片。"
          previewUrl={userPreview}
          emptyText="用户照片将在这里显示"
          buttonText={userPreview ? "重新上传用户照片" : "上传或拍摄用户照片"}
          isUploading={uploadingKind === "user-selfie"}
          disabled={isBusy}
          capture="user"
          onChange={(event) => handleUpload("user-selfie", event)}
        />

        <UploadPanel
          step="2"
          title="商户上传假发照片"
          description="支持拍摄或从相册选择。建议使用正面、清晰、完整展示发型轮廓的假发图。"
          previewUrl={wigPreview}
          emptyText="假发照片将在这里显示"
          buttonText={wigPreview ? "重新上传假发照片" : "上传或拍摄假发照片"}
          isUploading={uploadingKind === "merchant-wig"}
          disabled={isBusy}
          capture="environment"
          onChange={(event) => handleUpload("merchant-wig", event)}
        />
      </section>

      <section style={styles.generateBar}>
        <div>
          <strong>生成试戴效果</strong>
          <p style={styles.smallText}>{userImagePath && wigImagePath ? "两张照片已准备完成。" : "请先完成用户照片和假发照片上传。"}</p>
        </div>
        <button type="button" onClick={startTryOn} disabled={!userImagePath || !wigImagePath || isBusy} style={styles.primaryButton}>
          {isGenerating ? "生成中..." : "开始试戴"}
        </button>
      </section>

      {statusText ? <p style={styles.status}>{statusText}</p> : null}
      {error ? <pre style={styles.error}>错误：{error}</pre> : null}

      <section style={styles.resultPanel}>
        <div style={styles.stepHeader}>
          <span style={styles.stepNo}>3</span>
          <div>
            <h2 style={styles.stepTitle}>查看试戴结果</h2>
            <p style={styles.smallText}>结果生成后可直接用于商户和用户确认。</p>
          </div>
        </div>
        {resultUrl ? <img src={resultUrl} alt="戴一下试戴结果" style={styles.resultImage} /> : <div style={styles.resultEmpty}>试戴结果将在这里显示</div>}
      </section>
    </main>
  );
}

function UploadPanel(props: {
  step: string;
  title: string;
  description: string;
  previewUrl: string;
  emptyText: string;
  buttonText: string;
  isUploading: boolean;
  disabled: boolean;
  capture: "user" | "environment";
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <section style={styles.uploadPanel}>
      <div style={styles.stepHeader}>
        <span style={styles.stepNo}>{props.step}</span>
        <div>
          <h2 style={styles.stepTitle}>{props.title}</h2>
          <p style={styles.smallText}>{props.description}</p>
        </div>
      </div>
      {props.previewUrl ? <img src={props.previewUrl} alt={props.title} style={styles.previewImage} /> : <div style={styles.uploadEmpty}>{props.emptyText}</div>}
      <label style={{ ...styles.uploadButton, ...(props.disabled ? styles.disabledButton : {}) }}>
        {props.isUploading ? "上传中..." : props.buttonText}
        <input type="file" accept="image/*" capture={props.capture} onChange={props.onChange} style={styles.hiddenInput} disabled={props.disabled} />
      </label>
    </section>
  );
}

async function prepareJpeg(file: File, maxSide: number) {
  const image = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("当前浏览器无法处理照片。");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("照片压缩失败。"));
        }
      },
      "image/jpeg",
      0.9,
    );
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取照片。"));
    };
    image.src = url;
  });
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "24px clamp(16px, 4vw, 56px) 48px",
    background: "#f3fbf8",
    color: "#10201f",
    fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
  },
  header: {
    maxWidth: 1180,
    margin: "0 auto 20px",
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
  },
  kicker: {
    color: "#0f8f7a",
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.18,
    letterSpacing: 0,
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#60706e",
    lineHeight: 1.5,
  },
  backLink: {
    flexShrink: 0,
    padding: "10px 14px",
    border: "1px solid #dce7e4",
    borderRadius: 8,
    background: "#ffffff",
    color: "#10201f",
    textDecoration: "none",
    fontSize: 14,
  },
  workflow: {
    maxWidth: 1180,
    margin: "0 auto 16px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
  },
  uploadPanel: {
    padding: 16,
    border: "1px solid #dce7e4",
    borderRadius: 8,
    background: "#ffffff",
  },
  stepHeader: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    marginBottom: 14,
  },
  stepNo: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: 26,
    height: 26,
    borderRadius: 999,
    background: "#10201f",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 700,
  },
  stepTitle: {
    margin: 0,
    fontSize: 18,
    letterSpacing: 0,
  },
  smallText: {
    margin: "5px 0 0",
    color: "#60706e",
    fontSize: 13,
    lineHeight: 1.5,
  },
  uploadEmpty: {
    minHeight: 300,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 8,
    background: "#edf4f2",
    color: "#60706e",
    textAlign: "center",
  },
  previewImage: {
    display: "block",
    width: "100%",
    height: 300,
    objectFit: "contain",
    borderRadius: 8,
    background: "#edf4f2",
  },
  uploadButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    marginTop: 12,
    padding: "0 14px",
    borderRadius: 8,
    background: "#10201f",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
  },
  disabledButton: {
    cursor: "not-allowed",
    opacity: 0.58,
  },
  hiddenInput: {
    display: "none",
  },
  generateBar: {
    maxWidth: 1180,
    margin: "0 auto 16px",
    padding: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    border: "1px solid #dce7e4",
    borderRadius: 8,
    background: "#ffffff",
  },
  primaryButton: {
    flexShrink: 0,
    minHeight: 44,
    padding: "0 18px",
    border: "1px solid #00a88f",
    borderRadius: 8,
    background: "#00a88f",
    color: "#ffffff",
    fontSize: 15,
    fontWeight: 700,
  },
  status: {
    maxWidth: 1156,
    margin: "0 auto 16px",
    padding: 12,
    borderRadius: 8,
    background: "#e7f8f3",
    color: "#096b5e",
    lineHeight: 1.5,
  },
  error: {
    maxWidth: 1156,
    margin: "0 auto 16px",
    padding: 12,
    borderRadius: 8,
    background: "#fff1f2",
    color: "#be123c",
    whiteSpace: "pre-wrap",
    overflowX: "auto",
    fontSize: 13,
  },
  resultPanel: {
    maxWidth: 1148,
    margin: "0 auto",
    padding: 16,
    border: "1px solid #dce7e4",
    borderRadius: 8,
    background: "#ffffff",
  },
  resultEmpty: {
    minHeight: 280,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    background: "#edf4f2",
    color: "#60706e",
  },
  resultImage: {
    display: "block",
    maxWidth: "100%",
    maxHeight: 720,
    margin: "0 auto",
    borderRadius: 8,
    background: "#edf4f2",
  },
};
