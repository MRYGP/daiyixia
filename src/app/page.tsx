"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { USER_SAMPLES, type UserSample } from "@/data/users";
import { WIGS, type WigGroup } from "@/data/wigs";

type TryOnResponse = {
  success: boolean;
  runId?: string;
  resultImageUrl?: string;
  taskId?: string;
  latencyMs?: number;
  error?: string;
};

type ValidationChoice = "yes" | "no" | "unknown";

type ValidationForm = {
  generationStatus: "ai_success" | "ai_failed" | "not_run";
  faceChanged: ValidationChoice;
  hairlineScore: number;
  edgeBlendScore: number;
  stickerLike: ValidationChoice;
  lightingScore: number;
  overallScore: number;
  canContinue: ValidationChoice;
  note: string;
};

const initialValidationForm: ValidationForm = {
  generationStatus: "not_run",
  faceChanged: "unknown",
  hairlineScore: 3,
  edgeBlendScore: 3,
  stickerLike: "unknown",
  lightingScore: 3,
  overallScore: 3,
  canContinue: "unknown",
  note: "",
};

const groupLabels: Record<WigGroup, string> = {
  male: "男式发型",
  female: "女士发型",
};

export default function HomePage() {
  const [selectedUserPath, setSelectedUserPath] = useState(USER_SAMPLES[0]?.imagePath ?? "");
  const [selectedPersonId, setSelectedPersonId] = useState(USER_SAMPLES[0]?.personId ?? "user-1");
  const [mobileUrl, setMobileUrl] = useState("");
  const [activeGroup, setActiveGroup] = useState<WigGroup>("male");
  const [selectedWigPath, setSelectedWigPath] = useState(WIGS[0]?.imagePath ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingValidation, setIsSavingValidation] = useState(false);
  const [result, setResult] = useState<TryOnResponse | null>(null);
  const [error, setError] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [validationForm, setValidationForm] = useState<ValidationForm>(initialValidationForm);

  const selectedUser = useMemo(
    () => USER_SAMPLES.find((user) => user.imagePath === selectedUserPath) ?? USER_SAMPLES[0],
    [selectedUserPath],
  );

  const people = useMemo(
    () =>
      Array.from(new Map(USER_SAMPLES.map((user) => [user.personId, user])).values()).map((user) => ({
        personId: user.personId,
        personName: user.personName,
        coverImagePath: user.imagePath,
        photoCount: USER_SAMPLES.filter((sample) => sample.personId === user.personId).length,
      })),
    [],
  );

  const selectedPersonPhotos = useMemo(
    () => USER_SAMPLES.filter((user) => user.personId === selectedPersonId),
    [selectedPersonId],
  );

  const selectedWig = useMemo(
    () => WIGS.find((wig) => wig.imagePath === selectedWigPath) ?? WIGS[0],
    [selectedWigPath],
  );

  const visibleWigs = useMemo(() => WIGS.filter((wig) => wig.group === activeGroup), [activeGroup]);
  const canGenerate = selectedUser.suitability !== "unsupported" && selectedWig.suitability !== "unsupported";

  useEffect(() => {
    let isMounted = true;
    fetch("/api/mobile-url")
      .then((response) => response.json())
      .then((data: { mobileUrl?: string }) => {
        if (isMounted && data.mobileUrl) {
          setMobileUrl(data.mobileUrl);
        }
      })
      .catch(() => {
        if (isMounted) {
          setMobileUrl(`${window.location.origin}/mobile`);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function chooseGroup(group: WigGroup) {
    setActiveGroup(group);
    const firstWig = WIGS.find((wig) => wig.group === group);
    if (firstWig) {
      setSelectedWigPath(firstWig.imagePath);
    }
  }

  function resetResultState() {
    setResult(null);
    setError("");
    setValidationMessage("");
  }

  function choosePerson(personId: UserSample["personId"]) {
    setSelectedPersonId(personId);
    const firstPhoto = USER_SAMPLES.find((user) => user.personId === personId);
    if (firstPhoto) {
      setSelectedUserPath(firstPhoto.imagePath);
    }
    resetResultState();
  }

  function chooseUser(imagePath: string) {
    const nextUser = USER_SAMPLES.find((user) => user.imagePath === imagePath);
    if (nextUser) {
      setSelectedPersonId(nextUser.personId);
    }
    setSelectedUserPath(imagePath);
    resetResultState();
  }

  function chooseWig(imagePath: string) {
    setSelectedWigPath(imagePath);
    resetResultState();
  }

  async function startAiTryOn() {
    setIsLoading(true);
    setError("");
    setResult(null);
    setValidationMessage("");

    try {
      const response = await fetch("/api/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userImagePath: selectedUserPath,
          wigImagePath: selectedWigPath,
        }),
      });
      const data = (await response.json()) as TryOnResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || "试戴图生成失败");
      }

      setResult(data);
      setValidationForm((current) => ({ ...current, generationStatus: "ai_success" }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "试戴图生成失败";
      setError(message);
      setValidationForm((current) => ({
        ...current,
        generationStatus: "ai_failed",
        overallScore: 1,
        canContinue: "no",
        note: message,
      }));
    } finally {
      setIsLoading(false);
    }
  }

  async function saveValidation() {
    setIsSavingValidation(true);
    setValidationMessage("");

    try {
      const response = await fetch("/api/validation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: result?.runId,
          taskId: result?.taskId,
          userImagePath: selectedUserPath,
          wigImagePath: selectedWigPath,
          ...validationForm,
          generationStatus: validationForm.generationStatus === "ai_failed" ? "failed" : "success",
          errorMessage: error,
        }),
      });
      const data = (await response.json()) as { success: boolean; validationId?: string; error?: string };

      if (!response.ok || !data.success) {
        throw new Error(data.error || "保存失败");
      }

      setValidationMessage(`已保存验收记录：${data.validationId}`);
    } catch (err) {
      setValidationMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setIsSavingValidation(false);
    }
  }

  function updateValidation<K extends keyof ValidationForm>(key: K, value: ValidationForm[K]) {
    setValidationForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.kicker}>戴一下 · AI 发型试戴</div>
          <h1 style={styles.title}>戴一下发型试戴</h1>
          <p style={styles.subtitle}>选择用户照片和发型参考图，生成专属试戴结果。</p>
        </div>
        <div style={styles.headerStats}>
          <span>{people.length} 位用户</span>
          <span>{USER_SAMPLES.length} 张照片</span>
          <span>{WIGS.length} 款发型</span>
          <span>戴一下 AI</span>
          <a href="/custom" style={styles.customLink}>商户自助上传</a>
          <a href="/seedance" style={styles.seedanceLink}>Seedance 视频测试</a>
        </div>
      </header>

      {mobileUrl ? (
        <section style={styles.qrSection}>
          <div>
            <h2 style={styles.qrTitle}>手机扫码体验</h2>
            <p style={styles.muted}>扫码后直接上传照片、选择发型、生成试戴图。</p>
            <a href={mobileUrl} target="_blank" rel="noreferrer" style={styles.mobileLink}>
              {mobileUrl}
            </a>
          </div>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mobileUrl)}`}
            alt="手机体验二维码"
            style={styles.qrImage}
          />
        </section>
      ) : null}

      <section style={styles.stage}>
        <div style={styles.viewer}>
          <div style={styles.viewerHeader}>
            <div>
              <h2 style={styles.sectionTitle}>试戴预览</h2>
              <p style={styles.muted}>左侧为用户原图，右侧显示生成结果。</p>
            </div>
            <button type="button" onClick={startAiTryOn} disabled={isLoading || !canGenerate} style={styles.primaryButton}>
              {isLoading ? "生成中..." : "开始试戴"}
            </button>
          </div>

          <div style={styles.compareGrid}>
            <ImagePanel label="用户照片" src={selectedUser.imagePath} alt={selectedUser.name} />
            <ImagePanel
              label="试戴结果"
              src={result?.resultImageUrl}
              alt="戴一下试戴结果"
              emptyText={isLoading ? "正在生成试戴结果" : "生成后显示结果"}
            />
          </div>

          <div style={styles.resultMeta}>
            <div>
              <strong>{selectedUser.name}</strong>
              <span> · {selectedUser.posture}</span>
            </div>
            <div>
              <strong>{selectedWig.name}</strong>
              <span> · {selectedWig.color} / {selectedWig.bangType}</span>
            </div>
            {result?.latencyMs ? <div>耗时：{Math.round(result.latencyMs / 1000)} 秒</div> : null}
          </div>

          {!canGenerate ? <p style={styles.warning}>当前组合包含暂不支持样本，请切换后再生成。</p> : null}
          {error ? <pre style={styles.error}>错误：{error}</pre> : null}
        </div>

        <aside style={styles.sidePanel}>
          <h2 style={styles.sectionTitle}>选择用户</h2>
          <div style={styles.userList}>
            {people.map((person) => (
              <button
                key={person.personId}
                type="button"
                onClick={() => choosePerson(person.personId)}
                style={{
                  ...styles.userCard,
                  ...(selectedPersonId === person.personId ? styles.selectedCard : {}),
                }}
              >
                <img src={person.coverImagePath} alt={person.personName} style={styles.userThumb} />
                <span style={styles.userText}>
                  <strong>{person.personName}</strong>
                  <small>{person.photoCount} 张照片可选</small>
                </span>
              </button>
            ))}
          </div>

          <div style={styles.photoPicker}>
            <span style={styles.referenceLabel}>选择照片</span>
            <div style={styles.photoGrid}>
              {selectedPersonPhotos.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => chooseUser(user.imagePath)}
                  style={{
                    ...styles.photoButton,
                    ...(selectedUserPath === user.imagePath ? styles.selectedPhotoButton : {}),
                  }}
                  title={user.note}
                >
                  <img src={user.imagePath} alt={user.name} style={styles.photoThumb} />
                  <span>{user.variantName}</span>
                </button>
              ))}
            </div>
            <small style={styles.photoNote}>{selectedUser.note}</small>
          </div>

          <div style={styles.referenceBox}>
            <span style={styles.referenceLabel}>当前参考发型</span>
            <img src={selectedWig.imagePath} alt={selectedWig.name} style={styles.referenceImage} />
            <strong>{selectedWig.name}</strong>
            <small>
              {selectedWig.length === "long" ? "长发" : selectedWig.length === "medium" ? "中长发" : "短发"} ·{" "}
              {selectedWig.note}
            </small>
          </div>
        </aside>
      </section>

      <section style={styles.gallerySection}>
        <div style={styles.galleryHeader}>
          <div>
            <h2 style={styles.sectionTitle}>选择发型</h2>
            <p style={styles.muted}>男式 10 张，女士 10 张，可直接选择发型生成试戴效果。</p>
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
        </div>

        <div style={styles.styleGrid}>
          {visibleWigs.map((wig) => (
            <button
              key={wig.id}
              type="button"
              onClick={() => chooseWig(wig.imagePath)}
              style={{
                ...styles.styleCard,
                ...(selectedWigPath === wig.imagePath ? styles.selectedStyleCard : {}),
              }}
            >
              <img src={wig.imagePath} alt={wig.name} style={styles.styleImage} />
              <span style={styles.styleName}>{wig.name}</span>
            </button>
          ))}
        </div>
      </section>

      <details style={styles.validationPanel}>
        <summary style={styles.validationSummary}>人工验收记录</summary>
        <div style={styles.formGrid}>
          <SelectField
            label="脸有没有变"
            value={validationForm.faceChanged}
            onChange={(value) => updateValidation("faceChanged", value)}
            options={[
              ["unknown", "未判断"],
              ["no", "没有变"],
              ["yes", "变了"],
            ]}
          />
          <ScoreField label="发际线自然度" value={validationForm.hairlineScore} onChange={(value) => updateValidation("hairlineScore", value)} />
          <ScoreField label="边缘融合" value={validationForm.edgeBlendScore} onChange={(value) => updateValidation("edgeBlendScore", value)} />
          <SelectField
            label="是否像贴纸"
            value={validationForm.stickerLike}
            onChange={(value) => updateValidation("stickerLike", value)}
            options={[
              ["unknown", "未判断"],
              ["no", "不像"],
              ["yes", "像"],
            ]}
          />
          <ScoreField label="光照融合" value={validationForm.lightingScore} onChange={(value) => updateValidation("lightingScore", value)} />
          <ScoreField label="综合评分" value={validationForm.overallScore} onChange={(value) => updateValidation("overallScore", value)} />
          <SelectField
            label="是否继续"
            value={validationForm.canContinue}
            onChange={(value) => updateValidation("canContinue", value)}
            options={[
              ["unknown", "未判断"],
              ["yes", "继续"],
              ["no", "停止"],
            ]}
          />
        </div>

        <label style={styles.fieldWide}>
          备注
          <textarea
            value={validationForm.note}
            onChange={(event) => updateValidation("note", event.target.value)}
            rows={4}
            style={styles.textarea}
            placeholder="记录是否变脸、发型是否一致、边缘是否穿帮等。"
          />
        </label>

        <button type="button" onClick={saveValidation} disabled={isSavingValidation} style={styles.secondaryButton}>
          {isSavingValidation ? "正在保存..." : "保存验收记录"}
        </button>
        {validationMessage ? <p style={styles.status}>{validationMessage}</p> : null}
      </details>
    </main>
  );
}

function ImagePanel(props: { label: string; src?: string; alt: string; emptyText?: string }) {
  return (
    <div style={styles.imagePanel}>
      <span style={styles.imageLabel}>{props.label}</span>
      {props.src ? (
        <img src={props.src} alt={props.alt} style={styles.previewImage} />
      ) : (
        <div style={styles.emptyResult}>{props.emptyText}</div>
      )}
    </div>
  );
}

function ScoreField(props: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label style={styles.field}>
      {props.label}
      <input type="number" min="1" max="5" value={props.value} onChange={(event) => props.onChange(Number(event.target.value))} style={styles.input} />
    </label>
  );
}

function SelectField(props: {
  label: string;
  value: ValidationChoice;
  onChange: (value: ValidationChoice) => void;
  options: Array<[ValidationChoice, string]>;
}) {
  return (
    <label style={styles.field}>
      {props.label}
      <select value={props.value} onChange={(event) => props.onChange(event.target.value as ValidationChoice)} style={styles.input}>
        {props.options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: 24,
    fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
    color: "#10201f",
    background: "linear-gradient(180deg, #f3fbf8 0%, #f7faf9 42%, #ffffff 100%)",
  },
  header: {
    maxWidth: 1280,
    margin: "0 auto 22px",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 18,
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
  headerStats: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  seedanceLink: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 30,
    padding: "0 10px",
    borderRadius: 6,
    background: "#10201f",
    color: "#ffffff",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 700,
  },
  customLink: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 30,
    padding: "0 10px",
    border: "1px solid #00a88f",
    borderRadius: 6,
    background: "#ffffff",
    color: "#08786a",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 700,
  },
  qrSection: {
    maxWidth: 1280,
    margin: "0 auto 18px",
    padding: 16,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 16,
    alignItems: "center",
    background: "#ffffff",
    border: "1px solid #dce7e4",
    borderRadius: 8,
    boxShadow: "0 16px 44px rgba(20, 73, 66, 0.08)",
  },
  qrTitle: {
    margin: 0,
    fontSize: 20,
    letterSpacing: 0,
  },
  mobileLink: {
    display: "inline-block",
    marginTop: 8,
    color: "#0f8f7a",
    fontSize: 14,
    wordBreak: "break-all",
  },
  qrImage: {
    width: 132,
    height: 132,
    borderRadius: 6,
    border: "1px solid #dce7e4",
  },
  stage: {
    maxWidth: 1280,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(430px, 1fr))",
    gap: 18,
    alignItems: "stretch",
  },
  viewer: {
    background: "#ffffff",
    border: "1px solid #dce7e4",
    borderRadius: 8,
    padding: 18,
    boxShadow: "0 16px 44px rgba(20, 73, 66, 0.08)",
  },
  viewerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    lineHeight: 1.25,
    letterSpacing: 0,
  },
  muted: {
    margin: "6px 0 0",
    color: "#60706e",
    fontSize: 14,
    lineHeight: 1.5,
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
  secondaryButton: {
    minHeight: 40,
    padding: "0 16px",
    borderRadius: 6,
    border: "1px solid #93a4a1",
    background: "#ffffff",
    color: "#10201f",
    fontSize: 14,
    cursor: "pointer",
  },
  compareGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 14,
  },
  imagePanel: {
    position: "relative",
    height: 560,
    background: "#edf4f2",
    border: "1px solid #d9e6e2",
    borderRadius: 8,
    overflow: "hidden",
  },
  imageLabel: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 1,
    padding: "5px 9px",
    borderRadius: 999,
    background: "rgba(255, 255, 255, 0.88)",
    color: "#10201f",
    fontSize: 13,
    fontWeight: 700,
  },
  previewImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  },
  emptyResult: {
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#667774",
    textAlign: "center",
    padding: 24,
  },
  resultMeta: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 10,
    marginTop: 14,
    color: "#536462",
    fontSize: 14,
  },
  sidePanel: {
    background: "#ffffff",
    border: "1px solid #dce7e4",
    borderRadius: 8,
    padding: 16,
    boxShadow: "0 16px 44px rgba(20, 73, 66, 0.08)",
  },
  userList: {
    display: "grid",
    gap: 10,
    marginTop: 14,
  },
  userCard: {
    display: "grid",
    gridTemplateColumns: "72px minmax(0, 1fr)",
    gap: 10,
    width: "100%",
    padding: 8,
    textAlign: "left",
    background: "#ffffff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#dce7e4",
    borderRadius: 8,
    cursor: "pointer",
  },
  selectedCard: {
    borderColor: "#00a88f",
    boxShadow: "0 0 0 2px rgba(0, 168, 143, 0.16)",
  },
  userThumb: {
    width: 72,
    height: 86,
    objectFit: "cover",
    borderRadius: 6,
    background: "#edf4f2",
  },
  userText: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    color: "#10201f",
    fontSize: 14,
    lineHeight: 1.35,
  },
  photoPicker: {
    marginTop: 16,
    paddingTop: 16,
    borderTop: "1px solid #dce7e4",
    display: "grid",
    gap: 10,
  },
  photoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
    gap: 8,
  },
  photoButton: {
    display: "grid",
    gap: 6,
    padding: 6,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#dce7e4",
    borderRadius: 8,
    background: "#ffffff",
    color: "#10201f",
    cursor: "pointer",
    fontSize: 12,
    textAlign: "center",
  },
  selectedPhotoButton: {
    borderColor: "#00a88f",
    boxShadow: "0 0 0 2px rgba(0, 168, 143, 0.16)",
  },
  photoThumb: {
    width: "100%",
    aspectRatio: "1 / 1",
    objectFit: "cover",
    borderRadius: 6,
    background: "#edf4f2",
  },
  photoNote: {
    color: "#60706e",
    lineHeight: 1.5,
  },
  referenceBox: {
    marginTop: 18,
    paddingTop: 16,
    borderTop: "1px solid #dce7e4",
    display: "grid",
    gap: 9,
    color: "#10201f",
    fontSize: 14,
  },
  referenceLabel: {
    color: "#60706e",
    fontSize: 13,
  },
  referenceImage: {
    width: "100%",
    aspectRatio: "4 / 5",
    objectFit: "cover",
    borderRadius: 8,
    background: "#edf4f2",
  },
  gallerySection: {
    maxWidth: 1280,
    margin: "18px auto 0",
    background: "#ffffff",
    border: "1px solid #dce7e4",
    borderRadius: 8,
    padding: 18,
  },
  galleryHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  tabs: {
    display: "inline-flex",
    padding: 4,
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
  styleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(138px, 1fr))",
    gap: 12,
  },
  styleCard: {
    display: "grid",
    gap: 8,
    padding: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#dce7e4",
    borderRadius: 8,
    background: "#ffffff",
    cursor: "pointer",
    textAlign: "left",
  },
  selectedStyleCard: {
    borderColor: "#00a88f",
    boxShadow: "0 0 0 2px rgba(0, 168, 143, 0.16)",
  },
  styleImage: {
    width: "100%",
    aspectRatio: "1 / 1.12",
    objectFit: "cover",
    borderRadius: 6,
    background: "#edf4f2",
  },
  styleName: {
    minHeight: 36,
    color: "#10201f",
    fontSize: 13,
    lineHeight: 1.35,
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
  validationPanel: {
    maxWidth: 1280,
    margin: "18px auto 0",
    background: "#ffffff",
    border: "1px solid #dce7e4",
    borderRadius: 8,
    padding: 16,
  },
  validationSummary: {
    cursor: "pointer",
    fontWeight: 700,
    color: "#10201f",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginTop: 16,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 14,
    color: "#536462",
  },
  fieldWide: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    margin: "14px 0",
    fontSize: 14,
    color: "#536462",
  },
  input: {
    minHeight: 36,
    border: "1px solid #cddbd7",
    borderRadius: 6,
    padding: "6px 8px",
    fontFamily: "inherit",
  },
  textarea: {
    border: "1px solid #cddbd7",
    borderRadius: 6,
    padding: 10,
    resize: "vertical",
    fontFamily: "inherit",
  },
  status: {
    margin: "10px 0 0",
    color: "#536462",
  },
};
