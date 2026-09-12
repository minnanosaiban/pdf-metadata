"use strict";

const { PDFDocument } = PDFLib;

// ---- 要素 ----
const $ = (id) => document.getElementById(id);

const dropzone = $("dropzone");
const fileInput = $("fileInput");
const dropHint = $("dropHint");
const filenameEl = $("filename");
const pickFolderBtn = $("pickFolderBtn");
const folderInput = $("folderInput");

const uploadCard = $("uploadCard");
const folderListCard = $("folderListCard");
const editCard = $("editCard");
const resultCard = $("resultCard");
const errorCard = $("errorCard");
const errorText = $("errorText");
const backToListLink = $("backToListLink");

const folderListSummary = $("folderListSummary");
const folderList = $("folderList");
const folderBackBtn = $("folderBackBtn");

const fTitle = $("fTitle");
const fAuthor = $("fAuthor");
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
let pdfDoc = null;            // 読み込み中の pdf-lib ドキュメント
let baseName = "pdf";         // 出力ファイル名のもとになる元ファイル名（拡張子なし）
let outputUrl = null;         // ダウンロード用の Object URL（作り直すたびに古いものを破棄）
let cameFromFolder = false;   // 一覧から「編集」で入ったか（戻る導線の出し分けに使う）
let currentFolderFiles = [];  // フォルダ一覧に表示中の File[]

function showCard(card) {
  for (const c of [uploadCard, folderListCard, editCard, resultCard, errorCard]) c.hidden = (c !== card);
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function resetSingleFileUI() {
  fileInput.value = "";
  dropHint.hidden = false;
  filenameEl.hidden = true;
}

// ---- 単一ファイルの読み込み → 編集フォームへ表示 ----
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
  fCreator.value = pdfDoc.getCreator() || "";
  fProducer.value = pdfDoc.getProducer() || "";
  iCreationDate.textContent = formatDate(pdfDoc.getCreationDate());
  iModDate.textContent = formatDate(pdfDoc.getModificationDate());

  backToListLink.hidden = !cameFromFolder;
  showCard(editCard);
}

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) { cameFromFolder = false; loadFile(fileInput.files[0]); }
});

dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) { cameFromFolder = false; loadFile(file); }
});

// ---- フォルダ選択 → 一覧表示 ----
pickFolderBtn.addEventListener("click", () => folderInput.click());

folderInput.addEventListener("change", async () => {
  const files = Array.from(folderInput.files)
    .filter((f) => /\.pdf$/i.test(f.name))
    // フォルダ直下のみ対象（サブフォルダは対象外。scan-ocrのフォルダ一括と同じ方針）
    .filter((f) => (f.webkitRelativePath || f.name).split("/").length === 2)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  folderInput.value = ""; // 同じフォルダを選び直しても change が発火するように

  if (files.length === 0) {
    showError("選んだフォルダの直下にPDFが見つかりませんでした（サブフォルダの中は対象外です）。");
    return;
  }

  currentFolderFiles = files;
  renderFolderList(files);
  showCard(folderListCard);

  let loaded = 0;
  for (let i = 0; i < files.length; i++) {
    await loadRowMeta(files[i], i);
    loaded++;
    folderListSummary.textContent = loaded < files.length
      ? `${files.length}件のPDFが見つかりました。読み込み中…（${loaded}/${files.length}）`
      : `${files.length}件のPDFが見つかりました。`;
  }
});

function rowId(i) { return `frow-${i}`; }

function renderFolderList(files) {
  folderListSummary.textContent = `${files.length}件のPDFが見つかりました。読み込み中…`;
  folderList.innerHTML = "";
  files.forEach((file, i) => {
    const row = document.createElement("div");
    row.className = "folder-row-item";
    row.id = rowId(i);
    row.innerHTML = `
      <div class="folder-row-main">
        <div class="folder-row-name">${escapeHtml(file.name)}</div>
        <div class="folder-row-meta">読み込み中…</div>
      </div>
    `;
    folderList.appendChild(row);
  });
}

async function loadRowMeta(file, i) {
  const row = $(rowId(i));
  const metaEl = row.querySelector(".folder-row-meta");
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const title = doc.getTitle() || "（未設定）";
    const author = doc.getAuthor() || "（未設定）";
    metaEl.textContent = `タイトル: ${title} / 作成者: ${author}`;

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-outline";
    editBtn.textContent = "編集";
    editBtn.addEventListener("click", () => { cameFromFolder = true; loadFile(file); });
    row.appendChild(editBtn);
  } catch (e) {
    row.classList.add("is-error");
    const msg = String(e && e.message || e);
    metaEl.textContent = /encrypt/i.test(msg) ? "パスワード保護されています" : "読み込めませんでした";
  }
}

folderBackBtn.addEventListener("click", () => {
  currentFolderFiles = [];
  cameFromFolder = false;
  folderList.innerHTML = "";
  folderListSummary.textContent = "";
  resetSingleFileUI();
  showCard(uploadCard);
});

backToListLink.addEventListener("click", () => showCard(folderListCard));

// ---- すべて空にする ----
clearAllBtn.addEventListener("click", () => {
  fTitle.value = "";
  fAuthor.value = "";
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
    resetBtn.textContent = cameFromFolder ? "一覧に戻る" : "別のファイルを編集する";
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
  setSaveStatus("");
  if (outputUrl) { URL.revokeObjectURL(outputUrl); outputUrl = null; }
  if (cameFromFolder) {
    showCard(folderListCard);
  } else {
    resetSingleFileUI();
    showCard(uploadCard);
  }
});
