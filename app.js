// ====== 定数・設定 ======
const APP_VERSION = '1.0.0';
const BUILD_DATE = '2025-05-26';
const UNIT_MAP = { "個": 1, "箱": 12, "甲": 48 };
const DB_NAME = "inventcount";
const STORE = "items";
const MASTER_STORE = "master";

// ====== グローバル変数 ======
let db;
let editTargetId = null;
let sessionCount = 0;
let scanning = false;
let qr = null;
let scanTimeout = null;
let startTime = Date.now();

// ====== IndexedDBラッパー ======
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("jan", "jan", { unique: false });
        store.createIndex("date", "date", { unique: false });
      }
      if (!db.objectStoreNames.contains(MASTER_STORE)) {
        db.createObjectStore(MASTER_STORE, { keyPath: "jan" });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(); };
    req.onerror = e => reject(e);
  });
}

function addItem(item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(item).onsuccess = resolve;
    tx.onerror = reject;
  });
}

function getAllItems() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

function updateItem(id, data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.get(id).onsuccess = e => {
      const item = e.target.result;
      if (item) {
        Object.assign(item, data);
        store.put(item).onsuccess = resolve;
      } else {
        reject("not found");
      }
    };
    tx.onerror = reject;
  });
}

function deleteItem(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id).onsuccess = resolve;
    tx.onerror = reject;
  });
}

function clearItems() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear().onsuccess = resolve;
    tx.onerror = reject;
  });
}

function deleteItems(ids) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    ids.forEach(id => tx.objectStore(STORE).delete(id));
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

// 商品マスタ関連
function importMaster(list) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MASTER_STORE, "readwrite");
    const store = tx.objectStore(MASTER_STORE);
    let count = 0;
    list.forEach(row => {
      if (row.jan) {
        store.put(row);
        count++;
      }
    });
    tx.oncomplete = () => resolve(count);
    tx.onerror = reject;
  });
}

function getMaster(jan) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MASTER_STORE, "readonly");
    const req = tx.objectStore(MASTER_STORE).get(jan);
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

// ====== DOM要素取得 ======
const navs = {
  register: document.getElementById("nav-register"),
  edit: document.getElementById("nav-edit"),
  export: document.getElementById("nav-export"),
  delete: document.getElementById("nav-delete"),
  master: document.getElementById("nav-master"),
};

const sections = {
  register: document.getElementById("section-register"),
  edit: document.getElementById("section-edit"),
  export: document.getElementById("section-export"),
  delete: document.getElementById("section-delete"),
  master: document.getElementById("section-master"),
};

// 登録画面
const janInput = document.getElementById("jan");
const qtyInput = document.getElementById("qty");
const unitInput = document.getElementById("unit");
const unitBtns = document.querySelectorAll(".unit-btn");
const addBtn = document.getElementById("add-btn");
const scanBtn = document.getElementById("scan-btn");
const cancelScanBtn = document.getElementById("cancel-scan-btn");
const listBody = document.getElementById("list-body");
const sessionInfo = document.getElementById("session-info");
const progressFill = document.getElementById("progress-fill");
const readerDiv = document.getElementById("reader");
const productNameDiv = document.getElementById("product-name");

// 共通
const toast = document.getElementById("toast");
const versionInfo = document.getElementById("version-info");

// 音声
const audioOK = document.getElementById("audio-ok");
const audioNG = document.getElementById("audio-ng");
const audioPinpon = document.getElementById("audio-pinpon");

// 修正画面
const editBody = document.getElementById("edit-body");
const editFormArea = document.getElementById("edit-form-area");
const editQty = document.getElementById("edit-qty");
const editUnit = document.getElementById("edit-unit");
const editSaveBtn = document.getElementById("edit-save-btn");
const editCancelBtn = document.getElementById("edit-cancel-btn");

// 出力画面
const exportBtn = document.getElementById("export-btn");
const exportType = document.getElementById("export-type");
const exportAfter = document.getElementById("export-after");

// 削除画面
const deleteType = document.getElementById("delete-type");
const deleteSelectArea = document.getElementById("delete-select-area");
const deleteBody = document.getElementById("delete-body");
const deleteBtn = document.getElementById("delete-btn");

// マスタ画面
const masterFile = document.getElementById("master-file");
const masterImportBtn = document.getElementById("master-import-btn");
const masterCancelBtn = document.getElementById("master-cancel-btn");
const masterResult = document.getElementById("master-result");

// ====== 音声・フィードバック ======
function playOK() { 
  audioOK.currentTime = 0; 
  audioOK.play().catch(() => {}); 
}

function playNG() { 
  audioNG.currentTime = 0; 
  audioNG.play().catch(() => {}); 
}

function playPinpon() { 
  audioPinpon.currentTime = 0; 
  audioPinpon.play().catch(() => {}); 
}

function showToast(msg, type = 'success', duration = 2000) {
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  toast.style.display = "block";
  setTimeout(() => { 
    toast.style.display = "none"; 
  }, duration);
}

function updateProgress() {
  const percentage = Math.min((sessionCount / 10) * 100, 100); // 10件で100%
  progressFill.style.width = `${percentage}%`;
}

function updateSessionInfo() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const avgTime = sessionCount > 0 ? Math.floor(elapsed / sessionCount) : 0;
  sessionInfo.textContent = `連続登録モード中：${sessionCount}件登録済み (平均${avgTime}秒/件)`;
  updateProgress();
}

// ====== ナビゲーション ======
Object.keys(navs).forEach(key => {
  navs[key].onclick = () => {
    // アクティブ状態切り替え
    Object.values(navs).forEach(btn => btn.classList.remove("active"));
    Object.values(sections).forEach(sec => sec.classList.remove("active"));
    navs[key].classList.add("active");
    sections[key].classList.add("active");
    
    // カメラ停止
    if (scanning) stopCamera();
    
    // 画面別初期化
    switch(key) {
      case "register":
        refreshList();
        break;
      case "edit":
        refreshEdit();
        break;
      case "delete":
        refreshDelete();
        break;
    }
  };
});

// ====== 単位ボタン ======
unitBtns.forEach(btn => {
  btn.onclick = () => {
    unitBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    unitInput.value = btn.dataset.unit;
  };
});

// ====== 商品名表示（JANも常に表示） ======
function showProductName(name, isFound = true, jan = "") {
  if (jan) {
    if (isFound && name) {
      productNameDiv.innerHTML = `JAN: <b>${jan}</b><br>✅ ${name}`;
      productNameDiv.className = "product-name-display show success";
    } else {
      productNameDiv.innerHTML = `JAN: <b>${jan}</b><br>❌ 商品マスタ未登録`;
      productNameDiv.className = "product-name-display show error";
    }
  } else {
    productNameDiv.className = "product-name-display";
    productNameDiv.textContent = "";
  }
}

// ====== 数量入力の改善 ======
qtyInput.addEventListener('focus', () => {
  if (qtyInput.value === "1") {
    qtyInput.value = "";
  }
});

qtyInput.addEventListener('input', () => {
  if (qtyInput.dataset.initial === "true" && qtyInput.value.length === 1) {
    if (qtyInput.value !== "1") {
      qtyInput.value = qtyInput.value.slice(-1);
    }
    qtyInput.dataset.initial = "false";
  }
});

qtyInput.addEventListener('blur', () => {
  if (!qtyInput.value || qtyInput.value === "" || qtyInput.value === "0") {
    qtyInput.value = 1;
    qtyInput.dataset.initial = "true";
  }
});

// ====== JANコード入力時のリアルタイム検索（JANも渡す） ======
let searchTimeout;
janInput.addEventListener('input', async () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    const jan = janInput.value.trim();
    if (/^\d{8,13}$/.test(jan)) {
      const master = await getMaster(jan);
      if (master && master.name) {
        showProductName(master.name, true, jan);
        playPinpon();
      } else {
        showProductName("商品マスタ未登録", false, jan);
      }
    } else {
      showProductName("", false);
    }
  }, 300);
});

// ====== カメラ操作（JANも渡す） ======
function stopCamera() {
  if (qr && scanning) {
    qr.stop().then(() => {
      readerDiv.innerHTML = "";
      readerDiv.classList.add("hidden");
      readerDiv.classList.remove("scanning");
      cancelScanBtn.classList.add("hidden");
      scanning = false;
      scanBtn.disabled = false;
      if (scanTimeout) {
        clearTimeout(scanTimeout);
        scanTimeout = null;
      }
    }).catch(() => {
      // エラーは無視
    });
  }
}

scanBtn.onclick = async () => {
  if (scanning) return;
  
  try {
    readerDiv.classList.remove("hidden");
    readerDiv.classList.add("scanning");
    cancelScanBtn.classList.remove("hidden");
    scanning = true;
    scanBtn.disabled = true;
    
    qr = new Html5Qrcode("reader");
    
    // 30秒タイムアウト
    scanTimeout = setTimeout(() => {
      stopCamera();
      showToast("スキャンタイムアウトしました", "error");
    }, 30000);
    
    await qr.start(
      { facingMode: "environment" },
      { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      },
      async (decodedText) => {
        if (/^\d{8,13}$/.test(decodedText)) {
          janInput.value = decodedText;
          
          // 数量設定
          if (!qtyInput.value || qtyInput.value === "" || qtyInput.value === "0") {
            qtyInput.value = 1;
            qtyInput.dataset.initial = "true";
          }
          
          // 商品マスタ照合（JANも渡す）
          const master = await getMaster(decodedText);
          if (master && master.name) {
            showProductName(master.name, true, decodedText);
            playPinpon();
            showToast(`商品名：${master.name}`, "success");
          } else {
            showProductName("商品マスタ未登録", false, decodedText);
            playOK();
            showToast("JANコード読み取り完了", "success");
          }
          
          // カメラ停止
          stopCamera();
          
          // フォーカスを数量入力に移動
          setTimeout(() => qtyInput.focus(), 100);
        }
      },
      () => {
        // エラーは無視（連続スキャンのため）
      }
    );
  } catch (error) {
    console.error('Camera error:', error);
    showToast("カメラの起動に失敗しました", "error");
    stopCamera();
  }
};

cancelScanBtn.onclick = () => {
  stopCamera();
  showToast("スキャンを停止しました", "success");
};

// ESCキーでカメラ停止
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && scanning) {
    stopCamera();
  }
});

// ====== 登録処理 ======
function resetForm() {
  janInput.value = "";
  qtyInput.value = 1;
  qtyInput.dataset.initial = "true";
  unitInput.value = "個";
  unitBtns.forEach(btn => btn.classList.remove("active"));
  unitBtns[0].classList.add("active");
  showProductName("", false); // 商品名表示もクリア
  janInput.focus();
}

function renderList(items) {
  listBody.innerHTML = "";
  if (items.length === 0) {
    listBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#666;">データがありません</td></tr>';
    return;
  }
  
  items.forEach((item, idx) => {
    const date = new Date(item.date).toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    const productName = item.productName || "未登録";
    const actualQty = item.qty * UNIT_MAP[item.unit];
    
    listBody.innerHTML += `<tr>
      <td>${idx + 1}</td>
      <td>${item.jan}</td>
      <td>${productName}</td>
      <td>${item.qty}</td>
      <td>${item.unit}</td>
      <td>${date}</td>
      <td class="actions">
        <button data-id="${item.id}" class="danger del-btn">削除</button>
      </td>
    </tr>`;
  });
}

async function refreshList() {
  const items = await getAllItems();
  renderList(items);
  updateSessionInfo();
}

addBtn.onclick = async () => {
  const jan = janInput.value.trim();
  let qty = parseInt(qtyInput.value);
  const unit = unitInput.value;
  
  // バリデーション
  if (!/^\d{8,13}$/.test(jan)) {
    playNG(); 
    showToast("JANコードが正しくありません", "error"); 
    janInput.focus();
    return;
  }
  
  if (!qty || qty < 1) {
    qty = 1;
    qtyInput.value = 1;
  }
  
  try {
    // 商品マスタ照合
    const master = await getMaster(jan);
    const productName = master ? master.name : "";
    
    // データ登録
    await addItem({ 
      jan, 
      qty, 
      unit, 
      productName,
      date: new Date().toISOString(),
      actualQty: qty * UNIT_MAP[unit]
    });
    
    sessionCount++;
    playOK();
    showToast("登録しました！", "success");
    
    // アニメーション効果
    addBtn.classList.add("scan-success");
    setTimeout(() => addBtn.classList.remove("scan-success"), 500);
    
    resetForm();
    refreshList();
    
  } catch (error) {
    console.error('Registration error:', error);
    playNG();
    showToast("登録に失敗しました", "error");
  }
};

// 一覧からの削除
listBody.onclick = async e => {
  if (e.target.classList.contains("del-btn")) {
    if (confirm("このデータを削除しますか？")) {
      await deleteItem(Number(e.target.dataset.id));
      showToast("削除しました", "success");
      refreshList();
    }
  }
};

// ====== 修正機能 ======
function renderEdit(items) {
  editBody.innerHTML = "";
  if (items.length === 0) {
    editBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#666;">データがありません</td></tr>';
    return;
  }
  
  items.forEach((item, idx) => {
    const date = new Date(item.date).toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    const productName = item.productName || "未登録";
    
    editBody.innerHTML += `<tr>
      <td>${idx + 1}</td>
      <td>${item.jan}</td>
      <td>${productName}</td>
      <td>${item.qty}</td>
      <td>${item.unit}</td>
      <td>${date}</td>
      <td><button class="success edit-btn" data-id="${item.id}">編集</button></td>
    </tr>`;
  });
}

async function refreshEdit() {
  const items = await getAllItems();
  renderEdit(items);
  editFormArea.classList.add("hidden");
}

editBody.onclick = async e => {
  if (e.target.classList.contains("edit-btn")) {
    editTargetId = Number(e.target.dataset.id);
    const items = await getAllItems();
    const item = items.find(i => i.id === editTargetId);
    if (item) {
      editQty.value = item.qty;
      editUnit.value = item.unit;
      editFormArea.classList.remove("hidden");
      editQty.focus();
    }
  }
};

editSaveBtn.onclick = async () => {
  if (!editTargetId) return;
  
  const qty = parseInt(editQty.value);
  const unit = editUnit.value;
  
  if (!qty || qty < 1) { 
    showToast("数量が正しくありません", "error"); 
    editQty.focus();
    return; 
  }
  
  try {
    await updateItem(editTargetId, { 
      qty, 
      unit,
      actualQty: qty * UNIT_MAP[unit]
    });
    showToast("修正しました", "success");
    refreshEdit();
    refreshList();
    editFormArea.classList.add("hidden");
  } catch (error) {
    console.error('Update error:', error);
    showToast("修正に失敗しました", "error");
  }
};

editCancelBtn.onclick = () => {
  editFormArea.classList.add("hidden");
};

// ====== 出力機能 ======
exportBtn.onclick = async () => {
  try {
    const items = await getAllItems();
    if (!items.length) { 
      showToast("出力するデータがありません", "error"); 
      return; 
    }
    
    exportBtn.classList.add("loading");
    exportBtn.disabled = true;
    
    // CSVヘッダー
    let csv = ["JAN,商品名,数量,単位,実数量,登録日時"];
    
    // データ行
    for (const item of items) {
      let productName = item.productName;
      if (!productName) {
        const master = await getMaster(item.jan);
        productName = master ? master.name : "未登録";
      }
      
      const actualQty = item.qty * UNIT_MAP[item.unit];
      const date = new Date(item.date).toLocaleString('ja-JP');
      csv.push([
        item.jan, 
        `"${productName}"`, // CSV用にクォート
        item.qty, 
        item.unit, 
        actualQty, 
        `"${date}"`
      ].join(","));
    }
    
    // ファイルダウンロード
    const blob = new Blob([csv.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory_${new Date().toISOString().replace(/[-:T]/g,"").slice(0,12)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    
    showToast("CSV出力しました", "success");
    
    // 出力後のデータ処理
    if (exportAfter.value === "delete") {
      if (confirm("出力後にデータを削除しますか？")) {
        await clearItems();
        sessionCount = 0;
        refreshList();
        refreshEdit();
        refreshDelete();
        showToast("データを削除しました", "success");
      }
    }
    
  } catch (error) {
    console.error('Export error:', error);
    showToast("出力に失敗しました", "error");
  } finally {
    exportBtn.classList.remove("loading");
    exportBtn.disabled = false;
  }
};

// ====== 削除機能 ======
deleteType.onchange = () => {
  if (deleteType.value === "select") {
    deleteSelectArea.classList.remove("hidden");
    refreshDelete();
  } else {
    deleteSelectArea.classList.add("hidden");
  }
};

function renderDelete(items) {
  deleteBody.innerHTML = "";
  if (items.length === 0) {
    deleteBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#666;">データがありません</td></tr>';
    return;
  }
  
  items.forEach((item, idx) => {
    const date = new Date(item.date).toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    const productName = item.productName || "未登録";
    
    deleteBody.innerHTML += `<tr>
      <td><input type="checkbox" class="del-check" data-id="${item.id}"></td>
      <td>${idx + 1}</td>
      <td>${item.jan}</td>
      <td>${productName}</td>
      <td>${item.qty}</td>
      <td>${item.unit}</td>
      <td>${date}</td>
    </tr>`;
  });
}

async function refreshDelete() {
  const items = await getAllItems();
  renderDelete(items);
}

deleteBtn.onclick = async () => {
  try {
    if (deleteType.value === "all") {
      if (confirm("全てのデータを削除しますか？この操作は取り消せません。")) {
        await clearItems();
        sessionCount = 0;
        showToast("全データを削除しました", "success");
        refreshList(); 
        refreshEdit(); 
        refreshDelete();
      }
    } else {
      const checks = document.querySelectorAll(".del-check:checked");
      if (!checks.length) { 
        showToast("削除するデータを選択してください", "error"); 
        return; 
      }
      
      if (confirm(`選択した${checks.length}件のデータを削除しますか？`)) {
        const ids = Array.from(checks).map(c => Number(c.dataset.id));
        await deleteItems(ids);
        showToast(`${checks.length}件のデータを削除しました`, "success");
        refreshList(); 
        refreshEdit(); 
        refreshDelete();
      }
    }
  } catch (error) {
    console.error('Delete error:', error);
    showToast("削除に失敗しました", "error");
  }
};

// ====== マスタ取込機能 ======
masterImportBtn.onclick = async () => {
  const file = masterFile.files[0];
  if (!file) { 
    showToast("CSVファイルを選択してください", "error"); 
    return; 
  }
  
  try {
    masterImportBtn.classList.add("loading");
    masterImportBtn.disabled = true;
    
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const lines = e.target.result.split(/\r?\n/).filter(l => l.trim());
        
        // ヘッダー行判定
        let start = 0;
        if (/jan|商品名|単価|カテゴリ|備考/i.test(lines[0])) {
          start = 1;
        }
        
        const list = [];
        let errorCount = 0;
        
        for (let i = start; i < lines.length; i++) {
          const cols = lines[i].split(",");
          if (cols.length >= 2) {
            const [jan, name, price, category, note] = cols.map(col => 
              col.replace(/^"|"$/g, '').trim()
            );
            
            if (jan && /^\d{8,13}$/.test(jan)) {
              list.push({ 
                jan, 
                name: name || "", 
                price: price || "", 
                category: category || "", 
                note: note || "" 
              });
            } else {
              errorCount++;
            }
          }
        }
        
        const count = await importMaster(list);
        masterResult.innerHTML = `
          <div style="color:#28a745;font-weight:bold;">
            ✅ ${count}件のマスタデータを取込完了<br>
            ${errorCount > 0 ? `⚠️ ${errorCount}件のエラーをスキップ` : ''}
          </div>
        `;
        showToast("マスタ取込完了", "success");
        
      } catch (error) {
        console.error('Import error:', error);
        masterResult.innerHTML = `<div style="color:#dc3545;">❌ 取込に失敗しました</div>`;
        showToast("マスタ取込に失敗しました", "error");
      } finally {
        masterImportBtn.classList.remove("loading");
        masterImportBtn.disabled = false;
      }
    };
    
    reader.readAsText(file, "utf-8");
    
  } catch (error) {
    console.error('File read error:', error);
    showToast("ファイルの読み込みに失敗しました", "error");
    masterImportBtn.classList.remove("loading");
    masterImportBtn.disabled = false;
  }
};

masterCancelBtn.onclick = () => {
  masterFile.value = "";
  masterResult.innerHTML = "";
};

// ====== バージョン・システム情報 ======
function showVersionInfo() {
  return `InventCount v${APP_VERSION} (${BUILD_DATE})`;
}

function getSystemInfo() {
  return {
    appVersion: APP_VERSION,
    buildDate: BUILD_DATE,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    onLine: navigator.onLine,
    cookieEnabled: navigator.cookieEnabled,
    serviceWorkerSupported: 'serviceWorker' in navigator,
    indexedDBSupported: 'indexedDB' in window,
    cameraSupported: 'mediaDevices' in navigator
  };
}

function checkForUpdates() {
  if (!('serviceWorker' in navigator)) return;
  
  navigator.serviceWorker.getRegistration()
    .then(registration => {
      if (registration.waiting) {
        showToast("新しいバージョンが利用可能です", "success", 3000);
      } else {
        registration.update().then(registration => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = e => {
              if (e.target.state === 'installed') {
                showToast("アップデートがインストールされました", "success", 3000);
              }
            };
          } else {
            showToast("最新バージョンです", "success");
          }
        });
      }
    });
}

// バージョン情報クリック
versionInfo.onclick = () => {
  checkForUpdates();
};

// バージョン情報長押し（デバッグ）
let pressTimer;
versionInfo.onmousedown = versionInfo.ontouchstart = () => {
  pressTimer = setTimeout(() => {
    const info = getSystemInfo();
    console.table(info);
    alert(JSON.stringify(info, null, 2));
  }, 2000);
};
versionInfo.onmouseup = versionInfo.ontouchend = () => {
  clearTimeout(pressTimer);
};

// ====== 初期化 ======
window.onload = async () => {
  try {
    // データベース初期化
    await openDB();
    
    // 画面初期化
    refreshList();
    
    // バージョン情報表示
    versionInfo.textContent = showVersionInfo();
    
    // PWA: ServiceWorker登録
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js')
        .then(registration => {
          console.log('ServiceWorker registered:', registration);
        })
        .catch(error => {
          console.log('ServiceWorker registration failed:', error);
        });
    }
    
    // オンライン/オフライン状態監視
    window.addEventListener('online', () => {
      showToast("オンラインに復帰しました", "success");
    });
    
    window.addEventListener('offline', () => {
      showToast("オフラインモードです", "error", 3000);
    });
    
    // 初期フォーカス
    janInput.focus();
    
    console.log('InventCount PWA initialized successfully');
    
  } catch (error) {
    console.error('Initialization error:', error);
    showToast("アプリの初期化に失敗しました", "error");
  }
};

// ====== エラーハンドリング ======
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  showToast("予期しないエラーが発生しました", "error");
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  showToast("処理中にエラーが発生しました", "error");
});
