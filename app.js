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

window.onload = async function() {
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

  // 商品マスタ（JAN→商品名）
  let productMaster = {};

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

  // カメラ読み取り（ライト機能なし簡易版）
  scanBtn.onclick = () => {
    showToast("カメラ機能はこのバージョンでは省略しています", "error");
  };

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

  // 編集
  let editingId = null;
  window.editItem = async function (id) {
    const items = await getAllItems();
    const item = items.find(i => i.id === id);
    if (!item) return;
    editingId = id;
    editQty.value = item.qty;
    editUnit.value = item.unit;
    editFormArea.classList.remove("hidden");
  };

  editSaveBtn.onclick = async () => {
    if (editingId === null) return;
    const qty = parseInt(editQty.value);
    const unit = editUnit.value;
    if (isNaN(qty) || qty < 1) {
      showToast("数量を正しく入力", "error");
      return;
    }
    await updateItem(editingId, {
      qty,
      unit,
      actualQty: qty // 換算なし
    });
    showToast("修正しました", "success");
    editingId = null;
    editFormArea.classList.add("hidden");
    refreshEdit();
    refreshList();
  };

  editCancelBtn.onclick = () => {
    editingId = null;
    editFormArea.classList.add("hidden");
  };

  async function refreshEdit() {
    const items = await getAllItems();
    editBody.innerHTML = "";
    items.forEach((item, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${item.jan}</td>
        <td>${item.productName || ""}</td>
        <td>${item.qty}</td>
        <td>${item.unit}</td>
        <td>${formatDate(item.date)}</td>
        <td class="actions"><button onclick="editItem(${item.id})">✏️</button></td>
      `;
      editBody.appendChild(tr);
    });
    editFormArea.classList.add("hidden");
  }

  async function refreshExport() {
    // 出力画面の更新処理
  }

  // 削除
  window.deleteItemAction = async function (id) {
    if (!confirm("削除しますか？")) return;
    await deleteItem(id);
    showToast("削除しました", "success");
    refreshList();
    refreshEdit();
    refreshDelete();
  };

  deleteBtn.onclick = async () => {
    if (deleteType.value === "all") {
      if (!confirm("全件削除しますか？")) return;
      await clearAllItems();
      showToast("全件削除しました", "success");
      refreshList();
      refreshEdit();
      refreshDelete();
    } else {
      // 選択削除
      const checks = deleteBody.querySelectorAll("input[type=checkbox]:checked");
      const ids = Array.from(checks).map(chk => parseInt(chk.value));
      for (const id of ids) {
        await deleteItem(id);
      }
      showToast("選択削除しました", "success");
      refreshList();
      refreshEdit();
      refreshDelete();
    }
  };

  deleteType.onchange = () => {
    if (deleteType.value === "select") {
      deleteSelectArea.classList.remove("hidden");
      refreshDelete();
    } else {
      deleteSelectArea.classList.add("hidden");
    }
  };

  async function refreshDelete() {
    const items = await getAllItems();
    deleteBody.innerHTML = "";
    items.forEach((item, idx) => {
      const tr = document.createElement("tr");
      if (deleteType.value === "select") {
        tr.innerHTML = `
          <td><input type="checkbox" value="${item.id}"></td>
          <td>${idx + 1}</td>
          <td>${item.jan}</td>
          <td>${item.productName || ""}</td>
          <td>${item.qty}</td>
          <td>${item.unit}</td>
          <td>${formatDate(item.date)}</td>
        `;
      }
      deleteBody.appendChild(tr);
    });
  }

  // データ出力
  exportBtn.onclick = async () => {
    const items = await getAllItems();
    if (items.length === 0) {
      showToast("データがありません", "error");
      return;
    }
    if (exportType.value === "csv") {
      let csv = "No,JAN,商品名,数量,単位,日時\n";
      items.forEach((item, idx) => {
        csv += [
          idx + 1,
          item.jan,
          `"${item.productName || ""}"`,
          item.qty,
          item.unit,
          formatDate(item.date)
        ].join(",") + "\n";
      });
      downloadCSV(csv, "inventcount.csv");
      showToast("CSV出力しました", "success");
    }
    if (exportAfter.value === "delete") {
      await clearAllItems();
      refreshList();
      refreshEdit();
      refreshDelete();
    }
  };

  function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 商品マスタ取込
  masterImportBtn.onclick = () => {
    const file = masterFile.files[0];
    if (!file) {
      showToast("CSVファイルを選択してください", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      const lines = e.target.result.split(/\r?\n/);
      let count = 0;
      lines.forEach(line => {
        const [jan, name] = line.split(",");
        if (jan && name) {
          productMaster[jan.trim()] = name.trim();
          count++;
        }
      });
      masterResult.textContent = `${count}件の商品マスタを取込`;
      showToast("商品マスタ取込完了", "success");
    };
    reader.readAsText(file, "utf-8");
  };

  masterCancelBtn.onclick = () => {
    masterFile.value = "";
    masterResult.textContent = "";
  };

  // 日時整形
  function formatDate(dt) {
    if (!dt) return "";
    const d = new Date(dt);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  // トースト表示
  function showToast(msg, type = "success") {
    toastDiv.textContent = msg;
    toastDiv.className = "toast " + type;
    toastDiv.style.display = "block";
    setTimeout(() => {
      toastDiv.style.display = "none";
    }, 2000);
  }

  // バージョン表示
  versionInfo.onclick = () => {
    alert(`InventCount v${APP_VERSION}`);
  };

  // 初期化
  await openDB();
  refreshList();
  versionInfo.textContent = `InventCount v${APP_VERSION}`;
};
