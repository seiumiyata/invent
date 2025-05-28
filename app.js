/*
  InventCount - 棚卸しPWA
  Author: t.miyata
  https://note.com/nice_camel539
*/

const APP_VERSION = '1.0.0';
const DB_NAME = 'inventcount-db';
const DB_STORE = 'inventory';
const DB_VER = 1;

// 単位換算なし
const UNIT_MAP = { "個": 1, "箱": 1, "甲": 1 };

// IndexedDB操作
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = function (e) {
      db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = function (e) {
      db = e.target.result;
      resolve();
    };
    req.onerror = function () {
      reject('DBオープン失敗');
    };
  });
}

function addItem(item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject('登録失敗');
  });
}

function getAllItems() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject('取得失敗');
  });
}

function updateItem(id, newData) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.get(id).onsuccess = function (e) {
      const data = e.target.result;
      if (data) {
        Object.assign(data, newData);
        store.put(data);
        tx.oncomplete = () => resolve();
      } else {
        reject('データなし');
      }
    };
    tx.onerror = () => reject('更新失敗');
  });
}

function deleteItem(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject('削除失敗');
  });
}

function clearAllItems() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject('全削除失敗');
  });
}

// DOM取得
const navs = {
  register: document.getElementById("nav-register"),
  edit: document.getElementById("nav-edit"),
  export: document.getElementById("nav-export"),
  delete: document.getElementById("nav-delete"),
  master: document.getElementById("nav-master")
};
const sections = {
  register: document.getElementById("section-register"),
  edit: document.getElementById("section-edit"),
  export: document.getElementById("section-export"),
  delete: document.getElementById("section-delete"),
  master: document.getElementById("section-master")
};
const janInput = document.getElementById("jan");
const qtyInput = document.getElementById("qty");
const unitBtns = document.querySelectorAll(".unit-btn");
const unitHidden = document.getElementById("unit");
const addBtn = document.getElementById("add-btn");
const scanBtn = document.getElementById("scan-btn");
const listBody = document.getElementById("list-body");
const productNameDiv = document.getElementById("product-name");
const editBody = document.getElementById("edit-body");
const editFormArea = document.getElementById("edit-form-area");
const editQty = document.getElementById("edit-qty");
const editUnit = document.getElementById("edit-unit");
const editSaveBtn = document.getElementById("edit-save-btn");
const editCancelBtn = document.getElementById("edit-cancel-btn");
const exportBtn = document.getElementById("export-btn");
const exportType = document.getElementById("export-type");
const exportAfter = document.getElementById("export-after");
const deleteBtn = document.getElementById("delete-btn");
const deleteType = document.getElementById("delete-type");
const deleteSelectArea = document.getElementById("delete-select-area");
const deleteBody = document.getElementById("delete-body");
const masterFile = document.getElementById("master-file");
const masterImportBtn = document.getElementById("master-import-btn");
const masterCancelBtn = document.getElementById("master-cancel-btn");
const masterResult = document.getElementById("master-result");
const versionInfo = document.getElementById("version-info");
const toastDiv = document.getElementById("toast");

// カメラモーダル
const cameraModal = document.getElementById("camera-modal");
const readerModal = document.getElementById("reader-modal");
const cancelScanModalBtn = document.getElementById("cancel-scan-modal-btn");
const torchBtn = document.getElementById("torch-btn");

// 商品マスタ（JAN→商品名）
let productMaster = {};

// カメラ関連変数
let html5Qr = null;
let isScanning = false;
let torchEnabled = false;

// ナビ切替
Object.keys(navs).forEach(key => {
  navs[key].onclick = () => {
    Object.keys(sections).forEach(k => sections[k].classList.remove("active"));
    Object.keys(navs).forEach(k => navs[k].classList.remove("active"));
    sections[key].classList.add("active");
    navs[key].classList.add("active");
    if (key === "edit") refreshEdit();
    if (key === "delete") refreshDelete();
    if (key === "export") refreshExport();
    if (key === "register") refreshList();
    if (key === "master") masterResult.textContent = "";
  };
});

// 単位ボタン
unitBtns.forEach(btn => {
  btn.onclick = () => {
    unitBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    unitHidden.value = btn.dataset.unit;
  };
});

// JAN入力時の商品名表示
janInput.oninput = () => {
  const jan = janInput.value.trim();
  if (jan.length >= 6 && productMaster[jan]) {
    productNameDiv.textContent = productMaster[jan];
    productNameDiv.className = "product-name-display show success";
  } else if (jan.length >= 6) {
    productNameDiv.textContent = "商品マスタ未登録";
    productNameDiv.className = "product-name-display show error";
  } else {
    productNameDiv.textContent = "";
    productNameDiv.className = "product-name-display";
  }
};

// 登録
addBtn.onclick = async () => {
  const jan = janInput.value.trim();
  const qty = parseInt(qtyInput.value);
  const unit = unitHidden.value;
  const productName = productMaster[jan] || "";
  if (!jan || isNaN(qty) || qty < 1) {
    showToast("JANコードと数量を正しく入力してください", "error");
    return;
  }
  await addItem({
    jan,
    qty,
    unit,
    productName,
    date: new Date().toISOString(),
    actualQty: qty // 換算なし
  });
  showToast("登録しました", "success");
  janInput.value = "";
  qtyInput.value = "1";
  unitBtns.forEach(b => b.classList.remove("active"));
  unitBtns[0].classList.add("active");
  unitHidden.value = "個";
  productNameDiv.textContent = "";
  productNameDiv.className = "product-name-display";
  refreshList();
};

// トーチサポート確認
function isTorchSupported() {
  if (!html5Qr) return false;
  try {
    const capabilities = html5Qr.getRunningTrackCameraCapabilities();
    return capabilities && capabilities.torchFeature && capabilities.torchFeature().isSupported();
  } catch (e) {
    return false;
  }
}

// トーチ切り替え
async function toggleTorch() {
  if (!html5Qr || !isTorchSupported()) {
    showToast("ライト機能はサポートされていません", "error");
    return;
  }
  try {
    const torch = html5Qr.getRunningTrackCameraCapabilities().torchFeature();
    const newState = !torchEnabled;
    await torch.apply(newState);
    torchEnabled = newState;
    torchBtn.textContent = torchEnabled ? "🔦 ライトOFF" : "💡 ライトON";
    torchBtn.className = torchEnabled ? "torch-btn active" : "torch-btn";
    showToast(torchEnabled ? "ライトをONにしました" : "ライトをOFFにしました", "success");
  } catch (error) {
    showToast("ライトの切り替えに失敗しました", "error");
  }
}

// カメラ読み取り（モーダル＆トーチ対応）
scanBtn.onclick = async () => {
  if (isScanning) return;
  cameraModal.classList.remove("hidden");
  isScanning = true;
  // モーダル内のreader-modalを一度クリア
  readerModal.innerHTML = "";
  // 既存のインスタンスがあれば停止
  if (html5Qr) {
    try { await html5Qr.stop(); html5Qr.clear(); } catch (e) {}
  }
  html5Qr = new Html5Qrcode("reader-modal");
  html5Qr.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    code => {
      janInput.value = code;
      janInput.dispatchEvent(new Event('input'));
      stopCamera();
      showToast("バーコードを読み取りました", "success");
    },
    error => { }
  ).then(() => {
    setTimeout(() => {
      if (isTorchSupported()) {
        torchBtn.style.display = "inline-flex";
        torchBtn.textContent = "💡 ライトON";
        torchBtn.className = "torch-btn";
        torchEnabled = false;
      } else {
        torchBtn.style.display = "none";
      }
    }, 500);
  }).catch(() => {
    showToast("カメラ起動失敗", "error");
    stopCamera();
  });
};
async function stopCamera() {
  isScanning = false;
  torchEnabled = false;
  if (html5Qr) {
    try { await html5Qr.stop(); html5Qr.clear(); } catch (e) {}
    html5Qr = null;
  }
  cameraModal.classList.add("hidden");
  readerModal.innerHTML = "";
  torchBtn.style.display = "none";
}
torchBtn.onclick = toggleTorch;
cancelScanModalBtn.onclick = stopCamera;
cameraModal.onclick = (e) => {
  if (e.target === cameraModal) stopCamera();
};

// ...（以下、データ表示・編集・削除・エクスポート・マスタ取込・トースト等は[1]のまま）

// 一覧表示
async function refreshList() {
  const items = await getAllItems();
  listBody.innerHTML = "";
  items.forEach((item, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${item.jan}</td>
      <td>${item.productName || ""}</td>
      <td>${item.qty}</td>
      <td>${item.unit}</td>
      <td>${formatDate(item.date)}</td>
      <td class="actions"><button onclick="editItem(${item.id})">✏️</button><button onclick="deleteItemAction(${item.id})">🗑️</button></td>
    `;
    listBody.appendChild(tr);
  });
}

// ...（編集・削除・出力・マスタ取込・トースト表示・初期化も[1]の通り）
