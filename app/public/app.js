const $ = id => document.getElementById(id);
let suppliers = [];
let products = [];

async function api(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Yêu cầu thất bại");
  return data;
}

function notify(message, error = false) {
  $("message").textContent = message;
  $("message").style.color = error ? "#b91c1c" : "#15803d";
}

function cell(row, value) {
  const td = document.createElement("td");
  td.textContent = value ?? "";
  row.appendChild(td);
}

function option(select, value, label) {
  const op = document.createElement("option");
  op.value = value;
  op.textContent = label;
  select.appendChild(op);
}

function action(row, text, handler, danger = false) {
  const td = document.createElement("td");
  const btn = document.createElement("button");
  btn.textContent = text;
  if (danger) btn.className = "danger";
  btn.onclick = handler;
  td.appendChild(btn);
  row.appendChild(td);
}

async function load() {
  const [dash, s, p, history] = await Promise.all([
    api("/api/dashboard"),
    api("/api/suppliers"),
    api("/api/products"),
    api("/api/transactions")
  ]);

  suppliers = s;
  products = p;
  $("totalProducts").textContent = dash.products;
  $("totalStock").textContent = dash.stock;
  $("totalSuppliers").textContent = dash.suppliers;
  $("lowStock").textContent = dash.low_stock;

  $("supplierList").replaceChildren();
  $("productList").replaceChildren();
  $("transactionList").replaceChildren();

  const ps = $("productSupplier");
  const tp = $("transactionProduct");
  ps.replaceChildren();
  tp.replaceChildren();
  option(ps, "", "Chọn nhà cung cấp");
  option(tp, "", "Chọn sản phẩm");

  for (const s of suppliers) {
    option(ps, s.id, s.name);
    const tr = document.createElement("tr");
    cell(tr, s.id); cell(tr, s.name);
    cell(tr, s.phone); cell(tr, s.email);
    action(tr, "Sửa", () => editSupplier(s));
    action(tr, "Xóa", () => removeSupplier(s), true);
    $("supplierList").appendChild(tr);
  }

  for (const p of products) {
    option(tp, p.id, `${p.name} (tồn: ${p.quantity})`);
    const tr = document.createElement("tr");
    cell(tr, p.id); cell(tr, p.sku); cell(tr, p.name);
    cell(tr, Number(p.price).toLocaleString("vi-VN"));
    const stock = document.createElement("td");
    stock.textContent = p.quantity;
    if (p.quantity < 10) stock.className = "low";
    tr.appendChild(stock);
    cell(tr, p.supplier_name);
    action(tr, "Sửa", () => editProduct(p));
    action(tr, "Xóa", () => removeProduct(p), true);
    $("productList").appendChild(tr);
  }

  for (const h of history) {
    const tr = document.createElement("tr");
    cell(tr, h.id);
    cell(tr, h.type === "IMPORT" ? "Nhập" : "Xuất");
    cell(tr, h.product_name);
    cell(tr, h.quantity);
    cell(tr, new Date(h.created_at).toLocaleString("vi-VN"));
    cell(tr, h.note);
    $("transactionList").appendChild(tr);
  }
}

async function run(fn) {
  try {
    await fn();
    await load();
  } catch (err) {
    notify(err.message, true);
  }
}

$("supplierForm").onsubmit = e => {
  e.preventDefault();
  run(async () => {
    await api("/api/suppliers", "POST", {
      name: $("supplierName").value,
      phone: $("supplierPhone").value,
      email: $("supplierEmail").value,
      address: $("supplierAddress").value
    });
    $("supplierForm").reset();
    notify("Đã thêm nhà cung cấp");
  });
};

$("productForm").onsubmit = e => {
  e.preventDefault();
  run(async () => {
    await api("/api/products", "POST", {
      name: $("productName").value,
      sku: $("productSku").value,
      price: $("productPrice").value,
      supplier_id: $("productSupplier").value || null
    });
    $("productForm").reset();
    notify("Đã thêm sản phẩm");
  });
};

$("transactionForm").onsubmit = e => {
  e.preventDefault();
  run(async () => {
    await api("/api/transactions", "POST", {
      type: $("transactionType").value,
      product_id: $("transactionProduct").value,
      quantity: Number($("transactionQuantity").value),
      note: $("transactionNote").value
    });
    $("transactionForm").reset();
    notify("Giao dịch thành công");
  });
};

function editSupplier(s) {
  const name = prompt("Tên nhà cung cấp:", s.name);
  if (name === null) return;
  const phone = prompt("Số điện thoại:", s.phone || "");
  if (phone === null) return;
  run(async () => {
    await api(`/api/suppliers/${s.id}`, "PUT", {
      name, phone, email: s.email, address: s.address
    });
    notify("Đã cập nhật nhà cung cấp");
  });
}

function editProduct(p) {
  const name = prompt("Tên sản phẩm:", p.name);
  if (name === null) return;
  const price = prompt("Đơn giá:", p.price);
  if (price === null) return;
  run(async () => {
    await api(`/api/products/${p.id}`, "PUT", {
      name, sku: p.sku, price, supplier_id: p.supplier_id
    });
    notify("Đã cập nhật sản phẩm");
  });
}

function removeSupplier(s) {
  if (!confirm(`Xóa nhà cung cấp ${s.name}?`)) return;
  run(async () => {
    await api(`/api/suppliers/${s.id}`, "DELETE");
    notify("Đã xóa nhà cung cấp");
  });
}

function removeProduct(p) {
  if (!confirm(`Xóa sản phẩm ${p.name}?`)) return;
  run(async () => {
    await api(`/api/products/${p.id}`, "DELETE");
    notify("Đã xóa sản phẩm");
  });
}

load().catch(err => notify(err.message, true));
