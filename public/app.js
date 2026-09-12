"use strict";

const { PDFDocument } = PDFLib;

// ---- 要素 ----
const $ = (id) => document.getElementById(id);

const dropzone = $("dropzone");
const fileInput = $("fileInput");
const filenameEl = $("filename");
const pickFolderBtn = $("pickFolderBtn");
const folderInput = $("folderInput");

const statusEl = $("status");
const editArea = $("editArea");
const folderArea = $("folderArea");
const singleActionsSection = $("singleActionsSection");
const folderActionsSection = $("folderActionsSection");

const fTitle = $("fTitle");
const fAuthor = $("fAuthor");
const fCreator = $("fCreator");
const fProducer = $("fProducer");
const iCreationDate = $("iCreationDate");
const iModDate = $("iModDate");
const clearAllBtn = $("clearAllBtn");
const saveBtn = $("saveBtn");
const saveStatus = $("saveStatus");

const folderTableBody = $("folderTableBody");
const folderClearAllBtn = $("folderClearAllBtn");
const folderSaveAllBtn = $("folderSaveAllBtn");
const folderSaveAllStatus = $("folderSaveAllStatus");

// ---- 状態 ----
let pdfDoc = null;      // 単一ファイル編集中の pdf-lib ドキュメント
let baseName = "pdf";   // 出力ファイル名のもとになる元ファイル名（拡張子なし）
let folderRows = [];    // フォルダ一覧の各行 { file, doc, error, rowEl, titleInput, authorInput, saveBtn, statusEl }

function setMode(mode) {
  editArea.hidden = mode !== "single";
  folderArea.hidden = mode !== "folder";
  singleActionsSection.hidden = mode !== "single";
  folderActionsSection.hidden = mode !== "folder";
}

function setStatus(text, isError) {
  statusEl.textContent = text || "";
  statusEl.classList.toggle("is-error", !!isError);
}

function setSaveStatus(text, isError) {
  saveStatus.textContent = text || "";
  saveStatus.classList.toggle("is-error-text", !!isError);
}

function formatDate(d) {
  if (!d) return "—";
  try {
    return d.toLocaleString("ja-JP");
  } catch {
    return "—";
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── モバイル幅では「このツールについて」「免責事項」を本文の下へ移動（pdf-redactorと同じ手法） ──
const secondaryInfo = $("secondary-info");
const sidebarEl = document.querySelector(".sidebar");
const mainEl = document.querySelector("main.main");
const mobileQuery = window.matchMedia("(max-width: 768px)");
const placeSecondaryInfo = () => (mobileQuery.matches ? mainEl : sidebarEl).appendChild(secondaryInfo);
placeSecondaryInfo();
mobileQuery.addEventListener("change", placeSecondaryInfo);

// ---- 単一ファイルの読み込み → 編集フォームへ表示 ----
async function loadFile(file) {
  setMode("empty");
  setStatus("読み込み中…");
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // updateMetadata:false が必須。既定(true)だと読み込んだ瞬間にpdf-libが
    // Producer・更新日を勝手に上書きしてしまい、元の値をフォームに表示できなくなる。
    pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    pdfDoc = null;
    const msg = String(e && e.message || e);
    setStatus(
      /encrypt/i.test(msg)
        ? "パスワード保護されたPDFには対応していません。"
        : "PDFを読み込めませんでした。ファイルが壊れているか、対応していない形式の可能性があります。",
      true
    );
    return;
  }

  baseName = file.name.replace(/\.pdf$/i, "") || "pdf";
  filenameEl.hidden = false;
  filenameEl.textContent = file.name;

  fTitle.value = pdfDoc.getTitle() || "";
  fAuthor.value = pdfDoc.getAuthor() || "";
  fCreator.value = pdfDoc.getCreator() || "";
  fProducer.value = pdfDoc.getProducer() || "";
  iCreationDate.textContent = formatDate(pdfDoc.getCreationDate());
  iModDate.textContent = formatDate(pdfDoc.getModificationDate());

  setSaveStatus("");
  setStatus(`「${file.name}」を編集しています。`);
  setMode("single");
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

// ---- すべて空にする（単一ファイル） ----
clearAllBtn.addEventListener("click", () => {
  fTitle.value = "";
  fAuthor.value = "";
  fCreator.value = "";
  fProducer.value = "";
});

// ---- 保存（単一ファイル） ----
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
    triggerDownload(blob, `${baseName}_meta.pdf`);
    setSaveStatus("保存しました（ダウンロードを開始しました）");
  } catch (e) {
    setSaveStatus("保存に失敗しました: " + (e && e.message || e), true);
  } finally {
    saveBtn.disabled = false;
  }
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
    setMode("empty");
    setStatus("選んだフォルダの直下にPDFが見つかりませんでした（サブフォルダの中は対象外です）。", true);
    return;
  }

  renderFolderTable(files);
  setMode("folder");
  folderSaveAllStatus.textContent = "";
  setStatus(`${files.length}件のPDFが見つかりました。読み込み中…`);

  for (let i = 0; i < files.length; i++) {
    await loadRowMeta(files[i], i);
    const loaded = i + 1;
    setStatus(
      loaded < files.length
        ? `${files.length}件のPDFが見つかりました。読み込み中…（${loaded}/${files.length}）`
        : `${files.length}件のPDFが見つかりました。タイトル・作成者を直接書き換えて「保存」で1件ずつ、または左の「まとめて保存してダウンロード」で一括保存できます。`
    );
  }
});

function renderFolderTable(files) {
  folderTableBody.innerHTML = "";
  folderRows = files.map((file) => ({ file, doc: null, error: null }));

  files.forEach((file, i) => {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.className = "col-name";
    const nameDiv = document.createElement("div");
    nameDiv.className = "row-name";
    nameDiv.textContent = file.name;
    tdName.appendChild(nameDiv);

    const tdTitle = document.createElement("td");
    tdTitle.className = "col-field";
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "text-input";
    titleInput.placeholder = "読み込み中…";
    titleInput.disabled = true;
    tdTitle.appendChild(titleInput);

    const tdAuthor = document.createElement("td");
    tdAuthor.className = "col-field";
    const authorInput = document.createElement("input");
    authorInput.type = "text";
    authorInput.className = "text-input";
    authorInput.placeholder = "読み込み中…";
    authorInput.disabled = true;
    tdAuthor.appendChild(authorInput);

    const tdAction = document.createElement("td");
    tdAction.className = "col-action";
    const saveRowBtn = document.createElement("button");
    saveRowBtn.type = "button";
    saveRowBtn.className = "row-save-btn";
    saveRowBtn.textContent = "保存";
    saveRowBtn.disabled = true;
    const rowStatus = document.createElement("span");
    rowStatus.className = "row-status";
    tdAction.append(saveRowBtn, rowStatus);

    tr.append(tdName, tdTitle, tdAuthor, tdAction);
    folderTableBody.appendChild(tr);

    const row = folderRows[i];
    row.rowEl = tr;
    row.titleInput = titleInput;
    row.authorInput = authorInput;
    row.saveBtn = saveRowBtn;
    row.statusEl = rowStatus;
    saveRowBtn.addEventListener("click", () => saveRow(row));
  });
}

async function loadRowMeta(file, i) {
  const row = folderRows[i];
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    row.doc = doc;
    row.titleInput.value = doc.getTitle() || "";
    row.authorInput.value = doc.getAuthor() || "";
    row.titleInput.placeholder = "（未設定）";
    row.authorInput.placeholder = "（未設定）";
    row.titleInput.disabled = false;
    row.authorInput.disabled = false;
    row.saveBtn.disabled = false;
  } catch (e) {
    row.error = e;
    row.rowEl.classList.add("is-error");
    const msg = /encrypt/i.test(String(e && e.message || e)) ? "パスワード保護されています" : "読み込めませんでした";
    const errEl = document.createElement("span");
    errEl.className = "row-error-text";
    errEl.textContent = msg;
    row.titleInput.replaceWith(errEl);
    row.authorInput.remove();
    row.saveBtn.remove();
  }
}

async function saveRow(row) {
  if (!row.doc) return;
  row.saveBtn.disabled = true;
  row.statusEl.textContent = "保存中…";
  row.statusEl.classList.remove("is-error-text");
  try {
    row.doc.setTitle(row.titleInput.value.trim());
    row.doc.setAuthor(row.authorInput.value.trim());
    row.doc.setModificationDate(new Date());
    const bytes = await row.doc.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const base = row.file.name.replace(/\.pdf$/i, "") || "pdf";
    triggerDownload(blob, `${base}_meta.pdf`);
    row.statusEl.textContent = "保存しました";
  } catch (e) {
    row.statusEl.textContent = "保存に失敗しました";
    row.statusEl.classList.add("is-error-text");
  } finally {
    row.saveBtn.disabled = false;
  }
}

folderClearAllBtn.addEventListener("click", () => {
  for (const row of folderRows) {
    if (!row.doc) continue;
    row.titleInput.value = "";
    row.authorInput.value = "";
  }
});

folderSaveAllBtn.addEventListener("click", async () => {
  const targets = folderRows.filter((r) => r.doc);
  if (targets.length === 0) return;
  folderSaveAllBtn.disabled = true;
  for (let i = 0; i < targets.length; i++) {
    folderSaveAllStatus.textContent = `まとめて保存中…（${i + 1}/${targets.length}）`;
    await saveRow(targets[i]);
  }
  folderSaveAllStatus.textContent = `${targets.length}件を保存しました`;
  folderSaveAllBtn.disabled = false;
});
