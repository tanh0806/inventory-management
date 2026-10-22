
"use strict";

const $ = (id) => document.getElementById(id);

let suppliers = [];
let products = [];
let history = [];
let currentUser = null;
let csrfToken = "";

// ======================================
// 1. GOI API
// ======================================

async function api(url, method = "GET", body, withCsrf = false) {
  const headers = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (withCsrf) {
    headers["x-csrf-token"] = csrfToken;
  }

  const response = await fetch(url, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data.error || `HTTP ${response.status}`
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

async function refreshCsrf() {
  const result = await api("/api/auth/csrf");

  csrfToken = result.csrfToken;

  if (!csrfToken) {
    throw new Error("Không lấy được CSRF Token.");
  }
}

// ======================================
// 2. THONG BAO
// ======================================

function notify(message, error = false, auth = false) {
  const element = $(auth ? "authMessage" : "message");

  element.textContent = message;
  element.style.color = error ? "#b91c1c" : "#15803d";

  if (!auth) {
    element.classList.toggle("error", error);
  }
}

// ======================================
// 3. DANG NHAP / DANG KY
// ======================================

function setAuthMode(mode) {
  const register = mode === "register";

  $("loginForm").classList.toggle("hidden", register);
  $("registerForm").classList.toggle("hidden", !register);

  $("showLogin").className =
    register ? "secondary" : "primary";

  $("showRegister").className =
    register ? "primary" : "secondary";

  notify("", false, true);
}

function showAuth(message = "") {
  currentUser = null;

  $("appPage").classList.add("hidden");
  $("authPage").classList.remove("hidden");

  setAuthMode("login");

  if (message) {
    notify(message, true, true);
  }
}

function showApp(user) {
  currentUser = user;

  $("authPage").classList.add("hidden");
  $("appPage").classList.remove("hidden");

  $("userName").textContent = user.full_name;
  $("userRole").textContent = user.role;

  $("userAvatar").textContent =
    user.full_name.trim().slice(0, 1).toUpperCase();

  $("profileName").textContent = user.full_name || "—";
  $("profileEmail").textContent = user.email || "—";
  $("profilePhone").textContent = user.phone || "—";
  $("profileRole").textContent = user.role || "—";

  $("profileCreated").textContent = user.created_at
    ? new Date(user.created_at).toLocaleString("vi-VN")
    : "—";

  switchPage("dashboard");
}

// ======================================
// 4. CHUYEN TRANG
// ======================================

const pageNames = {
  dashboard: "Tổng quan kho hàng",
  suppliers: "Quản lý nhà cung cấp",
  products: "Quản lý sản phẩm",
  transactions: "Nhập kho / Xuất kho",
  history: "Lịch sử giao dịch",
  profile: "Hồ sơ cá nhân"
};

function switchPage(name) {
  if (!pageNames[name]) return;

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle(
      "active",
      page.id === `page-${name}`
    );
  });

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === name
    );
  });

  $("pageTitle").textContent = pageNames[name];
  notify("");
}

// ======================================
// 5. CAC HAM TAO BANG
// ======================================

function cell(row, value) {
  const td = document.createElement("td");
  td.textContent = value ?? "";
  row.appendChild(td);
  return td;
}

function option(select, value, label) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  select.appendChild(item);
}

function action(row, entries) {
  const td = document.createElement("td");
  const wrapper = document.createElement("div");

  wrapper.className = "actions";

  for (const entry of entries) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = entry.text;
    button.className = entry.danger ? "danger" : "secondary";
    button.onclick = entry.handler;

    wrapper.appendChild(button);
  }

  td.appendChild(wrapper);
  row.appendChild(td);
}

function emptyRow(target, count, text) {
  const tr = document.createElement("tr");
  const td = cell(tr, text);

  td.colSpan = count;
  target.appendChild(tr);
}

// ======================================
// 6. TAI DU LIEU KHO
// ======================================

async function load() {
  const [dash, s, p, entries] = await Promise.all([
    api("/api/dashboard"),
    api("/api/suppliers"),
    api("/api/products"),
    api("/api/transactions")
  ]);

  suppliers = s;
  products = p;
  history = entries;

  $("totalProducts").textContent = dash.products;
  $("totalStock").textContent = dash.stock;
  $("totalSuppliers").textContent = dash.suppliers;
  $("lowStock").textContent = dash.low_stock;

  [
    "supplierList",
    "productList",
    "transactionList",
    "lowStockList",
    "recentTransactions"
  ].forEach((id) => $(id).replaceChildren());

  $("productSupplier").replaceChildren();
  $("transactionProduct").replaceChildren();

  option($("productSupplier"), "", "Không chọn");
  option($("transactionProduct"), "", "Chọn sản phẩm");

  // Danh sach nha cung cap
  for (const supplier of suppliers) {
    option(
      $("productSupplier"),
      supplier.id,
      supplier.name
    );

    const tr = document.createElement("tr");

    cell(tr, supplier.id);
    cell(tr, supplier.name);
    cell(tr, supplier.phone);
    cell(tr, supplier.email);

    action(tr, [
      {
        text: "Sửa",
        handler: () => editSupplier(supplier)
      },
      {
        text: "Xóa",
        danger: true,
        handler: () => removeSupplier(supplier)
      }
    ]);

    $("supplierList").appendChild(tr);
  }

  if (!suppliers.length) {
    emptyRow(
      $("supplierList"),
      5,
      "Chưa có nhà cung cấp."
    );
  }

  drawStockChart(products);

  // Danh sach san pham
  for (const product of products) {
    option(
      $("transactionProduct"),
      product.id,
      `${product.name} (tồn: ${product.quantity})`
    );

    const tr = document.createElement("tr");

    cell(tr, product.id);
    cell(tr, product.sku);
    cell(tr, product.name);
    cell(
      tr,
      Number(product.price).toLocaleString("vi-VN")
    );

    const stock = cell(tr, product.quantity);

    if (Number(product.quantity) < 10) {
      stock.classList.add("low");
    }

    cell(tr, product.supplier_name);

    action(tr, [
      {
        text: "Sửa",
        handler: () => editProduct(product)
      },
      {
        text: "Xóa",
        danger: true,
        handler: () => removeProduct(product)
      }
    ]);

    $("productList").appendChild(tr);

    if (Number(product.quantity) < 10) {
      const low = document.createElement("tr");

      cell(low, product.sku);
      cell(low, product.name);
      cell(low, product.quantity).classList.add("low");

      $("lowStockList").appendChild(low);
    }
  }

  if (!products.length) {
    emptyRow(
      $("productList"),
      7,
      "Chưa có sản phẩm."
    );
  }

  if (!$("lowStockList").children.length) {
    emptyRow(
      $("lowStockList"),
      3,
      "Không có sản phẩm sắp hết."
    );
  }

  // Lich su nhap xuat
  for (const entry of history) {
    const tr = document.createElement("tr");

    cell(tr, entry.id);
    cell(
      tr,
      entry.type === "IMPORT" ? "Nhập" : "Xuất"
    );
    cell(tr, entry.product_name);
    cell(tr, entry.quantity);
    cell(
      tr,
      new Date(entry.created_at).toLocaleString("vi-VN")
    );
    cell(tr, entry.note);

    $("transactionList").appendChild(tr);
  }

  if (!history.length) {
    emptyRow(
      $("transactionList"),
      6,
      "Chưa có giao dịch."
    );
  }

  // Giao dich gan day tren Dashboard
  for (const entry of history.slice(0, 5)) {
    const tr = document.createElement("tr");

    cell(tr, entry.id);
    cell(
      tr,
      entry.type === "IMPORT" ? "Nhập" : "Xuất"
    );
    cell(tr, entry.product_name);
    cell(tr, entry.quantity);
    cell(
      tr,
      new Date(entry.created_at).toLocaleString("vi-VN")
    );

    $("recentTransactions").appendChild(tr);
  }

  if (!history.length) {
    emptyRow(
      $("recentTransactions"),
      5,
      "Chưa có giao dịch gần đây."
    );
  }
}

// ======================================
// 7. BIEU DO TON KHO
// ======================================

function drawStockChart(items) {
  const chart = $("stockChart");
  chart.replaceChildren();

  const top = [...items]
    .sort(
      (a, b) =>
        Number(b.quantity) - Number(a.quantity)
    )
    .slice(0, 8);

  if (!top.length) {
    chart.textContent = "Chưa có dữ liệu tồn kho.";
    return;
  }

  const max = Math.max(
    1,
    ...top.map((item) => Number(item.quantity))
  );

  for (const item of top) {
    const row = document.createElement("div");
    row.className = "chart-row";

    const name = document.createElement("span");
    name.className = "chart-name";
    name.textContent = item.name;
    name.title = item.name;

    const background = document.createElement("div");
    background.className = "chart-bar";

    const fill = document.createElement("div");
    fill.className = "chart-fill";

    fill.style.width =
      `${Math.max(0, Number(item.quantity)) / max * 100}%`;

    background.appendChild(fill);

    const count = document.createElement("strong");
    count.textContent = item.quantity;

    row.append(name, background, count);
    chart.appendChild(row);
  }
}

// ======================================
// 8. HAM THUC HIEN NGHIEP VU
// ======================================

async function run(task) {
  try {
    await task();
    await load();
  } catch (error) {
    if (error.status === 401) {
      showAuth(
        "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
      );
      return;
    }

    notify(error.message, true);
  }
}

async function requireProfileAndLoad() {
  const result = await api("/api/auth/me");

  showApp(result.user);
  await load();
}

// ======================================
// 9. XU LY MENU
// ======================================

$("showLogin").onclick = () => setAuthMode("login");

$("showRegister").onclick = () => setAuthMode("register");

document.querySelectorAll(".nav-button").forEach((button) => {
  button.onclick = () => switchPage(button.dataset.page);
});

// ======================================
// 10. XU LY DANG NHAP
// ======================================

$("loginForm").onsubmit = async (event) => {
  event.preventDefault();

  const button = $("loginForm").querySelector(
    "button[type=submit]"
  );

  button.disabled = true;

  try {
    await refreshCsrf();

    await api(
      "/api/auth/login",
      "POST",
      {
        email: $("loginEmail").value.trim(),
        password: $("loginPassword").value
      },
      true
    );

    $("loginPassword").value = "";

    // Login tao Session moi, CSRF cu het hieu luc
    csrfToken = "";

    await requireProfileAndLoad();

  } catch (error) {
    notify(error.message, true, true);
  } finally {
    button.disabled = false;
  }
};

// ======================================
// 11. XU LY DANG KY
// ======================================

$("registerForm").onsubmit = async (event) => {
  event.preventDefault();

  const button = $("registerForm").querySelector(
    "button[type=submit]"
  );

  button.disabled = true;

  try {
    await refreshCsrf();

    await api(
      "/api/auth/register",
      "POST",
      {
        full_name: $("registerName").value.trim(),
        email: $("registerEmail").value.trim(),
        phone: $("registerPhone").value.trim(),
        password: $("registerPassword").value
      },
      true
    );

    const email = $("registerEmail").value.trim();

    $("registerForm").reset();

    setAuthMode("login");
    $("loginEmail").value = email;

    notify(
      "Đăng ký thành công. Hãy đăng nhập.",
      false,
      true
    );

  } catch (error) {
    notify(error.message, true, true);
  } finally {
    button.disabled = false;
  }
};

// ======================================
// 12. XU LY DANG XUAT
// ======================================

$("logoutButton").onclick = async () => {
  $("logoutButton").disabled = true;

  try {
    // Phai lay CSRF moi sau khi login
    await refreshCsrf();

    await api(
      "/api/auth/logout",
      "POST",
      {},
      true
    );

    csrfToken = "";
    showAuth();

    notify(
      "Đã đăng xuất thành công.",
      false,
      true
    );

  } catch (error) {
    notify(error.message, true);
  } finally {
    $("logoutButton").disabled = false;
  }
};

// ======================================
// 13. THEM NHA CUNG CAP
// ======================================

$("supplierForm").onsubmit = (event) => {
  event.preventDefault();

  run(async () => {
    await api("/api/suppliers", "POST", {
      name: $("supplierName").value.trim(),
      phone: $("supplierPhone").value.trim(),
      email: $("supplierEmail").value.trim(),
      address: $("supplierAddress").value.trim()
    });

    $("supplierForm").reset();
    notify("Đã thêm nhà cung cấp.");
  });
};

// ======================================
// 14. THEM SAN PHAM
// ======================================

$("productForm").onsubmit = (event) => {
  event.preventDefault();

  run(async () => {
    await api("/api/products", "POST", {
      name: $("productName").value.trim(),
      sku: $("productSku").value.trim(),
      price: $("productPrice").value,
      supplier_id: $("productSupplier").value || null
    });

    $("productForm").reset();
    notify("Đã thêm sản phẩm.");
  });
};

// ======================================
// 15. NHAP / XUAT KHO
// ======================================

$("transactionForm").onsubmit = (event) => {
  event.preventDefault();

  run(async () => {
    await api("/api/transactions", "POST", {
      type: $("transactionType").value,
      product_id: $("transactionProduct").value,
      quantity: Number(
        $("transactionQuantity").value
      ),
      note: $("transactionNote").value.trim()
    });

    $("transactionForm").reset();
    notify("Giao dịch thành công.");
  });
};

// ======================================
// 16. SUA NHA CUNG CAP
// ======================================

function editSupplier(supplier) {
  const name = prompt(
    "Tên nhà cung cấp:",
    supplier.name
  );

  if (name === null) return;

  const phone = prompt(
    "Số điện thoại:",
    supplier.phone || ""
  );

  if (phone === null) return;

  const email = prompt(
    "Email:",
    supplier.email || ""
  );

  if (email === null) return;

  const address = prompt(
    "Địa chỉ:",
    supplier.address || ""
  );

  if (address === null) return;

  run(async () => {
    await api(
      `/api/suppliers/${supplier.id}`,
      "PUT",
      { name, phone, email, address }
    );

    notify("Đã cập nhật nhà cung cấp.");
  });
}

// ======================================
// 17. SUA SAN PHAM
// ======================================

function editProduct(product) {
  const name = prompt(
    "Tên sản phẩm:",
    product.name
  );

  if (name === null) return;

  const sku = prompt(
    "Mã SKU:",
    product.sku
  );

  if (sku === null) return;

  const price = prompt(
    "Đơn giá:",
    product.price
  );

  if (price === null) return;

  run(async () => {
    await api(
      `/api/products/${product.id}`,
      "PUT",
      {
        name,
        sku,
        price,
        supplier_id: product.supplier_id
      }
    );

    notify("Đã cập nhật sản phẩm.");
  });
}

// ======================================
// 18. XOA NHA CUNG CAP
// ======================================

function removeSupplier(supplier) {
  if (!confirm(
    `Xóa nhà cung cấp ${supplier.name}?`
  )) return;

  run(async () => {
    await api(
      `/api/suppliers/${supplier.id}`,
      "DELETE"
    );

    notify("Đã xóa nhà cung cấp.");
  });
}

// ======================================
// 19. XOA SAN PHAM
// ======================================

function removeProduct(product) {
  if (!confirm(
    `Xóa sản phẩm ${product.name}?`
  )) return;

  run(async () => {
    await api(
      `/api/products/${product.id}`,
      "DELETE"
    );

    notify("Đã xóa sản phẩm.");
  });
}

// ======================================
// 20. KHOI TAO UNG DUNG
// ======================================

(async function start() {
  try {
    await requireProfileAndLoad();

  } catch (error) {
    if (error.status === 401) {
      showAuth();
    } else {
      showAuth(
        `Không thể kết nối hệ thống: ${error.message}`
      );
    }
  }
})();
