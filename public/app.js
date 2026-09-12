"use strict";

const { PDFDocument } = PDFLib;

// ---- 要素 ----
const $ = (id) => document.getElementById(id);

const dropzone = $("dropzone");
const fileInput = $("fileInput");
const dropHint = $("dropHint");
const filenameEl = $("filename");

const uploadCard = $("uploadCard");
const editCard = $("editCard");
const resultCard = $("resultCard");
const errorCard = $("errorCard");
const errorText = $("errorText");

const fTitle = $("fTitle");
const fAuthor = $("fAuthor");
const fSubject = $("fSubject");
const fKeywords = $("fKeywords");
const fCreator = $("fCreator");
const fProducer = $("fProducer");
const iCreationDate = $("iCreationDate");
const iModDate = $("iModDate");

const clearAllBtn = $("clearAllBtn");
const saveBtn = $("saveBtn");
const saveStatus = $("saveStatus");
const downloadLink = $("downloadLink");
const resetBtn = $("resetBtn");

// ---- 状態 ----
let pdfDoc = null;      // 読み込み中の pdf-lib ドキュメント
let baseName = "pdf";   // 出力ファイル名のもとになる元ファイル名（拡張子なし）
let outputUrl = null;   // ダウンロード用の Object URL（作り直すたびに古いものを破棄）

function showCard(card) {
  for (const c of [uploadCard, editCard, resultCard, errorCard]) c.hidden = (c !== card);
}

function showError(message) {
  errorText.textContent = message;
  showCard(errorCard);
}

function setSaveStatus(message) {
  saveStatus.hidden = !message;
  saveStatus.textContent = message || "";
}

function formatDate(d) {
  if (!d) return "—";
  try {
    return d.toLocaleString("ja-JP");
  } catch {
    return "—";
  }
}

// ---- ファイル読み込み ----
async function loadFile(file) {
  setSaveStatus("");
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // updateMetadata:false が必須。既定(true)だと読み込んだ瞬間にpdf-libが
    // Producer・更新日を勝手に上書きしてしまい、元の値をフォームに表示できなくなる。
    pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    pdfDoc = null;
    const msg = String(e && e.message || e);
    if (/encrypt/i.test(msg)) {
      showError("パスワード保護されたPDFには対応していません。");
    } else {
      showError("PDFを読み込めませんでした。ファイルが壊れているか、対応していない形式の可能性があります。");
    }
    return;
  }

  baseName = file.name.replace(/\.pdf$/i, "") || "pdf";
  filenameEl.hidden = false;
  filenameEl.textContent = file.name;
  dropHint.hidden = true;

  fTitle.value = pdfDoc.getTitle() || "";
  fAuthor.value = pdfDoc.getAuthor() || "";
  fSubject.value = pdfDoc.getSubject() || "";
  fKeywords.value = pdfDoc.getKeywords() || "";
  fCreator.value = pdfDoc.getCreator() || "";
  fProducer.value = pdfDoc.getProducer() || "";
  iCreationDate.textContent = formatDate(pdfDoc.getCreationDate());
  iModDate.textContent = formatDate(pdfDoc.getModificationDate());

  showCard(editCard);
}

fileInput.addEventListener("change", () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });

dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});

// ---- すべて空にする ----
clearAllBtn.addEventListener("click", () => {
  fTitle.value = "";
  fAuthor.value = "";
  fSubject.value = "";
  fKeywords.value = "";
  fCreator.value = "";
  fProducer.value = "";
});

// ---- 保存 ----
saveBtn.addEventListener("click", async () => {
  if (!pdfDoc) return;
  saveBtn.disabled = true;
  setSaveStatus("保存中…");
  try {
    pdfDoc.setTitle(fTitle.value.trim());
    pdfDoc.setAuthor(fAuthor.value.trim());
    pdfDoc.setSubject(fSubject.value.trim());
    const keywords = fKeywords.value.split(",").map((s) => s.trim()).filter(Boolean);
    pdfDoc.setKeywords(keywords);
    pdfDoc.setCreator(fCreator.value.trim());
    pdfDoc.setProducer(fProducer.value.trim());
    pdfDoc.setModificationDate(new Date()); // 表示文言どおり、更新日は保存時刻にする

    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = URL.createObjectURL(blob);
    downloadLink.href = outputUrl;
    downloadLink.download = `${baseName}_meta.pdf`;

    setSaveStatus("");
    showCard(resultCard);
  } catch (e) {
    showError("保存に失敗しました: " + (e && e.message || e));
  } finally {
    saveBtn.disabled = false;
  }
});

// ---- リセット ----
resetBtn.addEventListener("click", () => {
  pdfDoc = null;
  fileInput.value = "";
  dropHint.hidden = false;
  filenameEl.hidden = true;
  setSaveStatus("");
  if (outputUrl) { URL.revokeObjectURL(outputUrl); outputUrl = null; }
  showCard(uploadCard);
});
