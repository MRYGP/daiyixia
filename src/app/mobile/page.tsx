"use client";

import type { CSSProperties } from "react";
import { ChangeEvent, useMemo, useState } from "react";
import { WIGS, type WigGroup } from "@/data/wigs";

type UploadResponse = {
  success: boolean;
  imagePath?: string;
  error?: string;
};

type TryOnResponse = {
  success: boolean;
  resultImageUrl?: string;
  taskId?: string;
  latencyMs?: number;
  error?: string;
};

type PhotoQuality = {
  status: "unchecked" | "good" | "warning" | "bad";
  messages: string[];
};

type DetectedFace = {
  boundingBox: DOMRectReadOnly;
};

type FaceDetectorLike = {
  detect: (image: CanvasImageSource) => Promise<DetectedFace[]>;
};

type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorLike;

const groupLabels: Record<WigGroup, string> = {
  male: "男式",
  female: "女士",
};

const initialPhotoQuality: PhotoQuality = {
  status: "unchecked",
  messages: ["请上传单人正脸照片，头顶、完整脸部和肩膀都要在画面内。"],
};

export default function MobileTryOnPage() {
  const [activeGroup, setActiveGroup] = useState<WigGroup>("male");
  const [selectedWigPath, setSelectedWigPath] = useState(WIGS[0]?.imagePath ?? "");
  const [uploadedImagePath, setUploadedImagePath] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [photoQuality, setPhotoQuality] = useState<PhotoQuality>(initialPhotoQuality);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const visibleWigs = useMemo(() => WIGS.filter((wig) => wig.group === activeGroup), [activeGroup]);
  const selectedWig = useMemo(() => WIGS.find((wig) => wig.imagePath === selectedWigPath) ?? WIGS[0], [selectedWigPath]);

  function chooseGroup(group: WigGroup) {
    setActiveGroup(group);
    const firstWig = WIGS.find((wig) => wig.group === group);
    if (firstWig) {
      setSelectedWigPath(firstWig.imagePath);
    }
    setResultUrl("");
    setError("");
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploading(true);
    setError("");
    setResultUrl("");
    setPhotoQuality(initialPhotoQuality);
    setStatusText("正在处理照片...");

    try {
      const preparedPhoto = await prepareYouCamJpeg(file, 1024);
      const jpegBlob = preparedPhoto.blob;
      const localPreviewUrl = URL.createObjectURL(jpegBlob);
      const formData = new FormData();
      formData.append("file", jpegBlob, "selfie.jpg");

      setStatusText("正在上传照片...");
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as UploadResponse;

      if (!response.ok || !data.success || !data.imagePath) {
        throw new Error(data.error || "上传失败");
      }

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(localPreviewUrl);
      setUploadedImagePath(data.imagePath);
      setPhotoQuality(preparedPhoto.quality);
      setStatusText(preparedPhoto.quality.status === "good" ? "照片质量较好，可以开始试戴。" : "照片已上传，请先确认提示后再生成。");
    } catch (err) {
      setStatusText("");
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function startTryOn() {
    if (!uploadedImagePath) {
      setError("请先上传一张正面照片。");
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
          userImagePath: uploadedImagePath,
          wigImagePath: selectedWigPath,
        }),
      });
      const data = (await response.json()) as TryOnResponse;

      if (!response.ok || !data.success || !data.resultImageUrl) {
        throw new Error(data.error || "生成失败");
      }

      setResultUrl(data.resultImageUrl);
      setStatusText(data.latencyMs ? `已生成，耗时 ${Math.round(data.latencyMs / 1000)} 秒。` : "已生成。");
    } catch (err) {
      setStatusText("");
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div style={styles.kicker}>戴一下 · AI 发型试戴</div>
        <h1 style={styles.title}>上传照片试发型</h1>
        <p style={styles.subtitle}>正脸、单人、肩膀可见，效果更稳定。</p>
      </header>

      <section style={styles.stepPanel}>
        <div style={styles.stepHeader}>
          <span style={styles.stepNo}>1</span>
          <h2 style={styles.stepTitle}>上传自拍</h2>
        </div>
        <div style={styles.guideBox}>
          <strong>正面照要求</strong>
          <span>单人正脸看镜头，完整脸部和肩膀可见，光线均匀，不戴帽子，不遮挡脸，不用多人合照。</span>
        </div>
        <label style={styles.uploadButton}>
          {isUploading ? "上传中..." : previewUrl ? "重新上传照片" : "选择照片"}
          <input type="file" accept="image/*" capture="user" onChange={handleUpload} style={styles.hiddenInput} disabled={isUploading || isGenerating} />
        </label>
        {previewUrl ? <img src={previewUrl} alt="已上传照片" style={styles.previewImage} /> : <div style={styles.emptyBox}>照片会显示在这里</div>}
        <QualityNotice quality={photoQuality} />
      </section>

      <section style={styles.stepPanel}>
        <div style={styles.stepHeader}>
          <span style={styles.stepNo}>2</span>
          <h2 style={styles.stepTitle}>选择发型</h2>
        </div>
        <div style={styles.tabs}>
          {(["male", "female"] as WigGroup[]).map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => chooseGroup(group)}
              style={{ ...styles.tab, ...(activeGroup === group ? styles.activeTab : {}) }}
            >
              {groupLabels[group]}
            </button>
          ))}
        </div>
        <div style={styles.wigGrid}>
          {visibleWigs.map((wig) => (
            <button
              key={wig.id}
              type="button"
              onClick={() => {
                setSelectedWigPath(wig.imagePath);
                setResultUrl("");
                setError("");
              }}
              style={{
                ...styles.wigCard,
                ...(selectedWigPath === wig.imagePath ? styles.selectedWigCard : {}),
              }}
            >
              <img src={wig.imagePath} alt={wig.name} style={styles.wigImage} />
              <span>{wig.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section style={styles.actionPanel}>
        <div>
          <strong>{selectedWig.name}</strong>
          <p style={styles.smallText}>{selectedWig.color} / {selectedWig.bangType}</p>
        </div>
        <button type="button" onClick={startTryOn} disabled={!uploadedImagePath || isUploading || isGenerating} style={styles.primaryButton}>
          {isGenerating ? "生成中..." : "生成试戴图"}
        </button>
      </section>

      {statusText ? <p style={styles.status}>{statusText}</p> : null}
      {error ? <pre style={styles.error}>错误：{error}</pre> : null}

      <section style={styles.stepPanel}>
        <div style={styles.stepHeader}>
          <span style={styles.stepNo}>3</span>
          <h2 style={styles.stepTitle}>查看结果</h2>
        </div>
        {resultUrl ? <img src={resultUrl} alt="试戴结果" style={styles.resultImage} /> : <div style={styles.emptyBox}>生成结果会显示在这里</div>}
      </section>
    </main>
  );
}

function QualityNotice(props: { quality: PhotoQuality }) {
  const style =
    props.quality.status === "good"
      ? styles.qualityGood
      : props.quality.status === "bad"
        ? styles.qualityBad
        : styles.qualityWarning;

  return (
    <div style={{ ...styles.qualityBox, ...style }}>
      {props.quality.messages.map((message) => (
        <span key={message}>{message}</span>
      ))}
    </div>
  );
}

async function prepareYouCamJpeg(file: File, maxSide: number) {
  const image = await loadImage(file);
  const quality = await analyzePhotoQuality(image, maxSide);
  const blob = await resizeImageToJpeg(image, maxSide);

  if (quality.status === "bad") {
    throw new Error(quality.messages.join("\n"));
  }

  return { blob, quality };
}

async function resizeImageToJpeg(image: HTMLImageElement, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("当前浏览器无法处理照片。");
  }

  context.drawImage(image, 0, 0, width, height);

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

async function analyzePhotoQuality(image: HTMLImageElement, maxSide: number): Promise<PhotoQuality> {
  const messages: string[] = [];
  let status: PhotoQuality["status"] = "good";
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);

  if (longSide < 600 || shortSide < 360) {
    status = "warning";
    messages.push("照片分辨率偏低，建议使用更清晰的正面照片。");
  }

  if (width > height * 1.35) {
    status = "warning";
    messages.push("照片偏横向，建议使用竖版半身正面照，肩膀要完整可见。");
  }

  const FaceDetectorCtor = (window as Window & { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
  if (!FaceDetectorCtor) {
    if (status === "good") {
      status = "warning";
    }
    messages.push("当前浏览器不支持本地人脸预检，已完成尺寸优化；请人工确认是单人正脸。");
    return { status, messages };
  }

  try {
    const detector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 3 });
    const faces = await detector.detect(image);

    if (faces.length === 0) {
      return {
        status: "bad",
        messages: ["没有检测到清晰正脸。请重新拍摄：单人正脸看镜头，完整脸部和肩膀都要入镜。"],
      };
    }

    if (faces.length > 1) {
      return {
        status: "bad",
        messages: ["检测到多张人脸。请上传单人照片，不要使用合照或背景里有人脸的照片。"],
      };
    }

    const face = faces[0].boundingBox;
    const resizedFaceWidth = face.width * Math.min(1, maxSide / longSide);
    const faceHeightRatio = face.height / height;
    const faceCenterX = face.x + face.width / 2;
    const centerOffset = Math.abs(faceCenterX - width / 2) / width;

    if (resizedFaceWidth < 140) {
      return {
        status: "bad",
        messages: ["脸部在画面中太小，可能识别失败。请靠近一些拍摄，脸和肩膀都要清晰。"],
      };
    }

    if (faceHeightRatio > 0.58) {
      status = "warning";
      messages.push("脸部占比偏大，肩膀可能不完整。建议拍到肩膀，避免只拍大头照。");
    }

    if (centerOffset > 0.18) {
      status = "warning";
      messages.push("人脸不够居中，建议重新拍摄时把脸放在画面中间。");
    }

    if (messages.length === 0) {
      messages.push("检测到单人正脸，照片适合开始试戴。");
    }
  } catch {
    if (status === "good") {
      status = "warning";
    }
    messages.push("本地人脸预检不可用，已完成尺寸优化；请人工确认是单人正脸。");
  }

  return { status, messages };
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
    padding: 16,
    background: "#f3fbf8",
    color: "#10201f",
    fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
  },
  header: {
    padding: "10px 2px 16px",
  },
  kicker: {
    color: "#0f8f7a",
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.15,
    letterSpacing: 0,
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#60706e",
    lineHeight: 1.5,
  },
  stepPanel: {
    marginBottom: 14,
    padding: 14,
    background: "#ffffff",
    border: "1px solid #dce7e4",
    borderRadius: 8,
  },
  stepHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  stepNo: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
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
  guideBox: {
    display: "grid",
    gap: 6,
    marginBottom: 12,
    padding: 10,
    borderRadius: 8,
    background: "#f5faf8",
    color: "#536462",
    fontSize: 13,
    lineHeight: 1.5,
  },
  uploadButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    borderRadius: 8,
    background: "#00a88f",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },
  hiddenInput: {
    display: "none",
  },
  previewImage: {
    display: "block",
    width: "100%",
    maxHeight: 520,
    marginTop: 12,
    objectFit: "contain",
    borderRadius: 8,
    background: "#edf4f2",
  },
  resultImage: {
    display: "block",
    width: "100%",
    borderRadius: 8,
    background: "#edf4f2",
  },
  emptyBox: {
    minHeight: 220,
    marginTop: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    background: "#edf4f2",
    color: "#60706e",
  },
  qualityBox: {
    display: "grid",
    gap: 5,
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 1.45,
  },
  qualityGood: {
    background: "#e7f8f3",
    color: "#096b5e",
  },
  qualityWarning: {
    background: "#fff7ed",
    color: "#9a3412",
  },
  qualityBad: {
    background: "#fff1f2",
    color: "#be123c",
  },
  tabs: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    minHeight: 40,
    border: "1px solid #dce7e4",
    borderRadius: 8,
    background: "#ffffff",
    color: "#536462",
    fontSize: 14,
  },
  activeTab: {
    background: "#10201f",
    color: "#ffffff",
  },
  wigGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  wigCard: {
    display: "grid",
    gap: 6,
    padding: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#dce7e4",
    borderRadius: 8,
    background: "#ffffff",
    color: "#10201f",
    textAlign: "left",
    fontSize: 13,
  },
  selectedWigCard: {
    borderColor: "#00a88f",
    boxShadow: "0 0 0 2px rgba(0, 168, 143, 0.16)",
  },
  wigImage: {
    width: "100%",
    aspectRatio: "1 / 1.08",
    objectFit: "cover",
    borderRadius: 6,
    background: "#edf4f2",
  },
  actionPanel: {
    position: "sticky",
    bottom: 0,
    zIndex: 3,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 12,
    alignItems: "center",
    margin: "0 -16px 14px",
    padding: 14,
    background: "rgba(255, 255, 255, 0.96)",
    borderTop: "1px solid #dce7e4",
    boxShadow: "0 -8px 24px rgba(20, 73, 66, 0.08)",
  },
  smallText: {
    margin: "4px 0 0",
    color: "#60706e",
    fontSize: 13,
  },
  primaryButton: {
    minHeight: 44,
    padding: "0 16px",
    borderRadius: 8,
    border: "1px solid #00a88f",
    background: "#00a88f",
    color: "#ffffff",
    fontSize: 15,
    fontWeight: 700,
  },
  status: {
    margin: "0 0 14px",
    padding: 10,
    borderRadius: 8,
    background: "#e7f8f3",
    color: "#096b5e",
    lineHeight: 1.5,
  },
  error: {
    margin: "0 0 14px",
    padding: 12,
    borderRadius: 8,
    background: "#fff1f2",
    color: "#be123c",
    whiteSpace: "pre-wrap",
    overflowX: "auto",
    fontSize: 13,
  },
};
