// ====== 定数・ユーティリティ ======
const UNIT_MAP = { "個": 1, "箱": 12, "甲": 48 };
const DB_NAME = "inventcount";
const STORE = "items";
const MASTER_STORE = "master";
let db;
let editTargetId = null;
let sessionCount = 0;

// ====== IndexedDBラッパー ======
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
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

// 商品マスタ
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

// ====== DOM取得 ======
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
const janInput = document.getElementById("jan");
const qtyInput = document.getElementById("qty");
const unitInput = document.getElementById("unit");
const unitBtns = document.querySelectorAll(".unit-btn");
const addBtn = document.getElementById("add-btn");
const scanBtn = document.getElementById("scan-btn");
const msgSpan = document.getElementById("register-msg");
const listBody = document.getElementById("list-body");
const sessionInfo = document.getElementById("session-info");
const readerDiv = document.getElementById("reader");
const toast = document.getElementById("toast");
const audioOK = document.getElementById("audio-ok");
const audioNG = document.getElementById("audio-ng");
const audioPinpon = document.getElementById("audio-pinpon");

// 修正
const editBody = document.getElementById("edit-body");
const editFormArea = document.getElementById("edit-form-area");
const editQty = document.getElementById("edit-qty");
const editUnit = document.getElementById("edit-unit");
const editSaveBtn = document.getElementById("edit-save-btn");
const editCancelBtn = document.getElementById("edit-cancel-btn");

// 出力
const exportBtn = document.getElementById("export-btn");
const exportType = document.getElementById("export-type");
const exportAfter = document.getElementById("export-after");
const exportMsg = document.getElementById("export-msg");

// 削除
const deleteType = document.getElementById("delete-type");
const deleteSelectArea = document.getElementById("delete-select-area");
const deleteTable = document.getElementById("delete-table");
const deleteBody = document.getElementById("delete-body");
const deleteBtn = document.getElementById("delete-btn");
const deleteMsg = document.getElementById("delete-msg");

// マスタ
const masterFile = document.getElementById("master-file");
const masterImportBtn = document.getElementById("master-import-btn");
const masterCancelBtn = document.getElementById("master-cancel-btn");
const masterResult = document.getElementById("master-result");

// ====== 音声・トースト ======
function playOK() { audioOK.currentTime = 0; audioOK.play(); }
function playNG() { audioNG.currentTime = 0; audioNG.play(); }
function playPinpon() { audioPinpon.currentTime = 0; audioPinpon.play(); }
function showToast(msg, ok=true) {
  toast.textContent = msg;
  toast.style.background = ok ? "#333" : "#c00";
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 1500);
}

// ====== ナビゲーション ======
Object.keys(navs).forEach(key => {
  navs[key].onclick = () => {
    Object.values(navs).forEach(btn => btn.classList.remove("active"));
    Object.values(sections).forEach(sec => sec.classList.remove("active"));
    navs[key].classList.add("active");
    sections[key].classList.add("active");
    if (key === "register") refreshList();
    if (key === "edit") refreshEdit();
    if (key === "delete") refreshDelete();
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

// ====== 登録 ======
function resetForm() {
  janInput.value = "";
  qtyInput.value = 1;
  unitInput.value = "個";
  unitBtns.forEach(btn => btn.classList.remove("active"));
  unitBtns[0].classList.add("active");
  janInput.focus();
}
function renderList(items) {
  listBody.innerHTML = "";
  items.forEach((item, idx) => {
    const date = new Date(item.date).toLocaleString();
    listBody.innerHTML += `<tr>
      <td>${idx+1}</td>
      <td>${item.jan}</td>
      <td>${item.qty}</td>
      <td>${item.unit}</td>
      <td>${date}</td>
      <td class="actions"><button data-id="${item.id}" class="del-btn">削除</button></td>
    </tr>`;
  });
}
async function refreshList() {
  const items = await getAllItems();
  renderList(items);
  sessionInfo.textContent = `連続登録モード中：${sessionCount}件登録済み`;
}
addBtn.onclick = async () => {
  const jan = janInput.value.trim();
  const qty = parseInt(qtyInput.value);
  const unit = unitInput.value;
  if (!/^\d{8,13}$/.test(jan)) {
    playNG(); showToast("JANコード不正", false); return;
  }
  if (!qty || qty < 1) {
    playNG(); showToast("数量不正", false); return;
  }
  // 商品マスタ照合
  const master = await getMaster(jan);
  if (master) {
    playPinpon();
    showToast(`商品名：${master.name}`, true);
  } else {
    playOK();
  }
  await addItem({ jan, qty, unit, date: new Date().toISOString() });
  sessionCount++;
  showToast("登録しました");
  resetForm();
  refreshList();
};
listBody.onclick = async e => {
  if (e.target.classList.contains("del-btn")) {
    if (confirm("削除しますか？")) {
      await deleteItem(Number(e.target.dataset.id));
      refreshList();
    }
  }
};

// ====== カメラ読み取り ======
let scanning = false, qr;
scanBtn.onclick = async () => {
  if (scanning) return;
  readerDiv.classList.remove("hidden");
  scanning = true;
  qr = new Html5Qrcode("reader");
  await qr.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 200 },
    async (decodedText) => {
      if (/^\d{8,13}$/.test(decodedText)) {
        janInput.value = decodedText;
        // マスタ照合
        const master = await getMaster(decodedText);
        if (master) {
          playPinpon();
          showToast(`商品名：${master.name}`, true);
        } else {
          playOK();
        }
        qr.stop().then(() => {
          readerDiv.innerHTML = "";
          scanning = false;
        });
      }
    },
    () => {}
  );
};
janInput.onfocus = () => { if (scanning) { qr.stop(); readerDiv.innerHTML = ""; scanning = false; } };

// ====== 修正 ======
function renderEdit(items) {
  editBody.innerHTML = "";
  items.forEach((item, idx) => {
    const date = new Date(item.date).toLocaleString();
    editBody.innerHTML += `<tr>
      <td>${idx+1}</td>
      <td>${item.jan}</td>
      <td>${item.qty}</td>
      <td>${item.unit}</td>
      <td>${date}</td>
      <td><button class="edit-btn" data-id="${item.id}">編集</button></td>
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
    }
  }
};
editSaveBtn.onclick = async () => {
  if (!editTargetId) return;
  const qty = parseInt(editQty.value);
  const unit = editUnit.value;
  if (!qty || qty < 1) { showToast("数量不正", false); return; }
  await updateItem(editTargetId, { qty, unit });
  showToast("修正しました");
  refreshEdit();
  editFormArea.classList.add("hidden");
};
editCancelBtn.onclick = () => {
  editFormArea.classList.add("hidden");
};

// ====== 出力 ======
exportBtn.onclick = async () => {
  const items = await getAllItems();
  if (!items.length) { showToast("データなし", false); return; }
  // マスタ情報も付与
  let csv = ["JAN,商品名,数量,単位,実数量,登録日時"];
  for (const i of items) {
    const master = await getMaster(i.jan);
    const name = master ? master.name : "";
    const actual = i.qty * UNIT_MAP[i.unit];
    csv.push([i.jan, name, i.qty, i.unit, actual, i.date].join(","));
  }
  const blob = new Blob([csv.join("\r\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "inventory_" + new Date().toISOString().replace(/[-:T]/g,"").slice(0,12) + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("CSV出力しました");
  // 出力後のデータ処理
  if (exportAfter.value === "delete") {
    await clearItems();
    refreshList();
    refreshEdit();
    refreshDelete();
  }
};

// ====== 削除 ======
deleteType.onchange = () => {
  if (deleteType.value === "select") {
    deleteSelectArea.style.display = "";
    refreshDelete();
  } else {
    deleteSelectArea.style.display = "none";
  }
};
function renderDelete(items) {
  deleteBody.innerHTML = "";
  items.forEach((item, idx) => {
    const date = new Date(item.date).toLocaleString();
    deleteBody.innerHTML += `<tr>
      <td><input type="checkbox" class="del-check" data-id="${item.id}"></td>
      <td>${idx+1}</td>
      <td>${item.jan}</td>
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
  if (deleteType.value === "all") {
    if (confirm("全件削除します。よろしいですか？")) {
      await clearItems();
      showToast("全削除しました");
      refreshList(); refreshEdit(); refreshDelete();
    }
  } else {
    // 選択削除
    const checks = document.querySelectorAll(".del-check:checked");
    if (!checks.length) { showToast("選択なし", false); return; }
    if (confirm("選択したデータを削除しますか？")) {
      const ids = Array.from(checks).map(c => Number(c.dataset.id));
      await deleteItems(ids);
      showToast("削除しました");
      refreshList(); refreshEdit(); refreshDelete();
    }
  }
};

// ====== マスタ取込 ======
masterImportBtn.onclick = async () => {
  const file = masterFile.files[0];
  if (!file) { showToast("ファイル未選択", false); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    const lines = e.target.result.split(/\r?\n/).filter(l => l.trim());
    // ヘッダー行判定
    let start = 0;
    if (/jan|商品名|単価|カテゴリ|備考/i.test(lines[0])) start = 1;
    const list = [];
    for (let i = start; i < lines.length; i++) {
      const [jan, name, price, cat, note] = lines[i].split(",");
      if (jan) list.push({ jan, name, price, cat, note });
    }
    const count = await importMaster(list);
    masterResult.innerHTML = `<span class="success">${count}件のマスタを取込完了</span>`;
    showToast("マスタ取込完了");
  };
  reader.readAsText(file, "utf-8");
};
masterCancelBtn.onclick = () => {
  masterFile.value = "";
  masterResult.innerHTML = "";
};

// ====== 初期化 ======
window.onload = async () => {
  await openDB();
  refreshList();
  // PWA: ServiceWorker登録
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }
};
