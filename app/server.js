
const express = require("express");
const mysql = require("mysql2/promise");
const path = require("path");
const createSessionMiddleware = require("./config/session");

const app = express();

// Chi tin cay reverse proxy khi da cau hinh dung
if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

app.use(express.json({ limit: "100kb" }));

// Quan ly Session bang MySQL
app.use(createSessionMiddleware());

// Phuc vu giao dien website
app.use(express.static(path.join(__dirname, "public")));

// =====================================
// KET NOI MYSQL
// =====================================

const pool = mysql.createPool({
  host: process.env.DB_HOST || "mysql",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// =====================================
// API DANG KY TAI KHOAN
// =====================================

const createAuthRouter = require("./routes/auth");

app.use("/api/auth", createAuthRouter(pool));

// =====================================
// HAM XU LY LOI CHUNG
// =====================================

const safe = fn => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({
      error: "Lỗi xử lý dữ liệu."
    });
  }
};

// =====================================
// KIEM TRA KET NOI MYSQL
// =====================================

app.get("/health", safe(async (req, res) => {
  await pool.query("SELECT 1");
  res.json({
    status: "ok",
    database: "connected"
  });
}));

// =====================================
// QUAN LY NHA CUNG CAP
// =====================================

app.get("/api/suppliers", safe(async (req, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM suppliers ORDER BY id DESC"
  );
  res.json(rows);
}));

app.post("/api/suppliers", safe(async (req, res) => {
  const { name, phone, email, address } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({
      error: "Thiếu tên nhà cung cấp"
    });
  }

  await pool.execute(
    `INSERT INTO suppliers
     (name, phone, email, address)
     VALUES (?, ?, ?, ?)`,
    [
      name,
      phone || null,
      email || null,
      address || null
    ]
  );

  res.json({
    message: "Đã thêm nhà cung cấp"
  });
}));

app.put("/api/suppliers/:id", safe(async (req, res) => {
  const { name, phone, email, address } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({
      error: "Thiếu tên nhà cung cấp"
    });
  }

  const [result] = await pool.execute(
    `UPDATE suppliers
     SET name=?, phone=?, email=?, address=?
     WHERE id=?`,
    [
      name,
      phone || null,
      email || null,
      address || null,
      req.params.id
    ]
  );

  if (!result.affectedRows) {
    return res.status(404).json({
      error: "Không tìm thấy nhà cung cấp"
    });
  }

  res.json({
    message: "Đã cập nhật nhà cung cấp"
  });
}));

app.delete("/api/suppliers/:id", safe(async (req, res) => {
  const [linked] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM products
     WHERE supplier_id=?`,
    [req.params.id]
  );

  if (linked[0].total > 0) {
    return res.status(409).json({
      error: "Nhà cung cấp đang có sản phẩm, không thể xóa"
    });
  }

  const [result] = await pool.execute(
    "DELETE FROM suppliers WHERE id=?",
    [req.params.id]
  );

  if (!result.affectedRows) {
    return res.status(404).json({
      error: "Không tìm thấy nhà cung cấp"
    });
  }

  res.json({
    message: "Đã xóa nhà cung cấp"
  });
}));

// =====================================
// QUAN LY SAN PHAM
// =====================================

app.get("/api/products", safe(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT p.*, s.name AS supplier_name
    FROM products p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    ORDER BY p.id DESC
  `);

  res.json(rows);
}));

function validPrice(value) {
  return (
    value !== "" &&
    value !== null &&
    value !== undefined &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0
  );
}

app.post("/api/products", safe(async (req, res) => {
  const { name, sku, price, supplier_id } = req.body;

  if (
    !name ||
    !String(name).trim() ||
    !sku ||
    !String(sku).trim() ||
    !validPrice(price)
  ) {
    return res.status(400).json({
      error: "Thông tin sản phẩm không hợp lệ"
    });
  }

  try {
    await pool.execute(
      `INSERT INTO products
       (name, sku, price, supplier_id)
       VALUES (?, ?, ?, ?)`,
      [name, sku, price, supplier_id || null]
    );

    res.json({
      message: "Đã thêm sản phẩm"
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "Mã SKU đã tồn tại"
      });
    }

    throw err;
  }
}));

app.put("/api/products/:id", safe(async (req, res) => {
  const { name, sku, price, supplier_id } = req.body;

  if (
    !name ||
    !String(name).trim() ||
    !sku ||
    !String(sku).trim() ||
    !validPrice(price)
  ) {
    return res.status(400).json({
      error: "Thông tin sản phẩm không hợp lệ"
    });
  }

  try {
    const [result] = await pool.execute(
      `UPDATE products
       SET name=?, sku=?, price=?, supplier_id=?
       WHERE id=?`,
      [
        name,
        sku,
        price,
        supplier_id || null,
        req.params.id
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        error: "Không tìm thấy sản phẩm"
      });
    }

    res.json({
      message: "Đã cập nhật sản phẩm"
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "Mã SKU đã tồn tại"
      });
    }

    throw err;
  }
}));

app.delete("/api/products/:id", safe(async (req, res) => {
  const [used] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM stock_transaction_details
     WHERE product_id=?`,
    [req.params.id]
  );

  if (used[0].total > 0) {
    return res.status(409).json({
      error: "Sản phẩm đã có giao dịch, không thể xóa"
    });
  }

  const [result] = await pool.execute(
    "DELETE FROM products WHERE id=?",
    [req.params.id]
  );

  if (!result.affectedRows) {
    return res.status(404).json({
      error: "Không tìm thấy sản phẩm"
    });
  }

  res.json({
    message: "Đã xóa sản phẩm"
  });
}));

// =====================================
// NHAP KHO / XUAT KHO
// =====================================

app.post("/api/transactions", safe(async (req, res) => {
  const { type, product_id, quantity, note } = req.body;

  const qty = Number(quantity);
  const productId = Number(product_id);

  if (
    !["IMPORT", "EXPORT"].includes(type) ||
    !Number.isSafeInteger(qty) ||
    qty <= 0 ||
    !Number.isSafeInteger(productId) ||
    productId <= 0
  ) {
    return res.status(400).json({
      error: "Dữ liệu giao dịch không hợp lệ"
    });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      `SELECT quantity
       FROM products
       WHERE id=?
       FOR UPDATE`,
      [productId]
    );

    if (!rows.length) {
      await conn.rollback();

      return res.status(404).json({
        error: "Không tìm thấy sản phẩm"
      });
    }

    if (
      type === "EXPORT" &&
      rows[0].quantity < qty
    ) {
      await conn.rollback();

      return res.status(400).json({
        error: "Số lượng tồn không đủ"
      });
    }

    if (
      type === "IMPORT" &&
      rows[0].quantity + qty > 2147483647
    ) {
      await conn.rollback();

      return res.status(400).json({
        error: "Số lượng vượt giới hạn"
      });
    }

    const [result] = await conn.execute(
      `INSERT INTO stock_transactions
       (type, note)
       VALUES (?, ?)`,
      [type, note || null]
    );

    await conn.execute(
      `INSERT INTO stock_transaction_details
       (transaction_id, product_id, quantity)
       VALUES (?, ?, ?)`,
      [
        result.insertId,
        productId,
        qty
      ]
    );

    await conn.execute(
      `UPDATE products
       SET quantity = quantity + ?
       WHERE id=?`,
      [
        type === "IMPORT" ? qty : -qty,
        productId
      ]
    );

    await conn.commit();

    res.json({
      message: "Giao dịch thành công",
      id: result.insertId
    });

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

// =====================================
// LICH SU NHAP / XUAT
// =====================================

app.get("/api/transactions", safe(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT
      t.id,
      t.type,
      t.note,
      t.created_at,
      p.name AS product_name,
      d.quantity
    FROM stock_transactions t
    JOIN stock_transaction_details d
      ON d.transaction_id = t.id
    JOIN products p
      ON p.id = d.product_id
    ORDER BY t.id DESC
    LIMIT 100
  `);

  res.json(rows);
}));

// =====================================
// DASHBOARD TONG QUAN
// =====================================

app.get("/api/dashboard", safe(async (req, res) => {
  const [[products]] = await pool.query(
    `SELECT
      COUNT(*) AS total,
      COALESCE(SUM(quantity), 0) AS stock
     FROM products`
  );

  const [[suppliers]] = await pool.query(
    "SELECT COUNT(*) AS total FROM suppliers"
  );

  const [[low]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM products
     WHERE quantity < 10`
  );

  res.json({
    products: products.total,
    stock: products.stock,
    suppliers: suppliers.total,
    low_stock: low.total
  });
}));

// =====================================
// KHOI DONG SERVER
// =====================================

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Inventory app running on port ${PORT}`);
});
