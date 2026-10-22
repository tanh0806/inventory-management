
const express = require("express");
const argon2 = require("argon2");
const crypto = require("crypto");
const { rateLimit } = require("express-rate-limit");

function createAuthRouter(pool) {
  const router = express.Router();

  // Xu ly loi async
  const safe = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

  // Gioi han so lan dang ky
  const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Dang ky qua nhieu lan. Vui long thu lai sau."
    }
  });

  // Gioi han so lan dang nhap
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Dang nhap qua nhieu lan. Vui long thu lai sau."
    }
  });

  // Tao token chong CSRF
  router.get("/csrf", (req, res, next) => {
    if (!req.session) {
      return res.status(500).json({
        error: "Session chua duoc cau hinh."
      });
    }

    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto
        .randomBytes(32)
        .toString("hex");
    }

    req.session.save((err) => {
      if (err) return next(err);

      return res.json({
        csrfToken: req.session.csrfToken
      });
    });
  });

  // Kiem tra CSRF truoc thao tac thay doi du lieu
  function requireCsrf(req, res, next) {
    const expected = req.session?.csrfToken;
    const provided = req.get("x-csrf-token");

    if (
      typeof expected !== "string" ||
      typeof provided !== "string"
    ) {
      return res.status(403).json({
        error: "CSRF token khong hop le."
      });
    }

    const a = Buffer.from(expected);
    const b = Buffer.from(provided);

    if (
      a.length !== b.length ||
      !crypto.timingSafeEqual(a, b)
    ) {
      return res.status(403).json({
        error: "CSRF token khong hop le."
      });
    }

    next();
  }

  // Yeu cau JSON doi voi cac API xac thuc
  function requireJson(req, res, next) {
    if (!req.is("application/json")) {
      return res.status(415).json({
        error: "Yeu cau Content-Type application/json."
      });
    }

    next();
  }

  // =====================================
  // 1. DANG KY TAI KHOAN
  // =====================================

  router.post(
    "/register",
    registerLimiter,
    requireJson,
    requireCsrf,
    safe(async (req, res) => {
      const {
        full_name,
        email,
        password,
        phone
      } = req.body || {};

      if (
        typeof full_name !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string" ||
        (phone != null && typeof phone !== "string")
      ) {
        return res.status(400).json({
          error: "Thong tin dang ky khong hop le."
        });
      }

      const name = full_name.trim();
      const userEmail = email.trim().toLowerCase();
      const userPhone = (phone || "").trim();

      if (
        name.length < 2 ||
        name.length > 150 ||
        userEmail.length > 190 ||
        userPhone.length > 20 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)
      ) {
        return res.status(400).json({
          error: "Ho ten, email hoac so dien thoai khong hop le."
        });
      }

      if (
        password.length < 12 ||
        Buffer.byteLength(password, "utf8") > 1024
      ) {
        return res.status(400).json({
          error: "Mat khau phai co it nhat 12 ky tu."
        });
      }

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id
      });

      try {
        const [result] = await pool.execute(
          `INSERT INTO users
           (full_name, email, password_hash, phone, role)
           VALUES (?, ?, ?, ?, 'STAFF')`,
          [
            name,
            userEmail,
            passwordHash,
            userPhone || null
          ]
        );

        return res.status(201).json({
          message: "Dang ky tai khoan thanh cong.",
          user: {
            id: String(result.insertId),
            full_name: name,
            email: userEmail,
            role: "STAFF"
          }
        });
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
          return res.status(409).json({
            error: "Email da duoc su dung."
          });
        }

        throw error;
      }
    })
  );

  // =====================================
  // 2. DANG NHAP
  // =====================================

  router.post(
    "/login",
    loginLimiter,
    requireJson,
    requireCsrf,
    safe(async (req, res) => {
      const { email, password } = req.body || {};

      if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        email.length > 190 ||
        password.length > 1024
      ) {
        return res.status(400).json({
          error: "Email hoac mat khau khong hop le."
        });
      }

      const userEmail = email.trim().toLowerCase();

      const [rows] = await pool.execute(
        `SELECT id, full_name, email,
                password_hash, role, is_active
         FROM users
         WHERE email = ?
         LIMIT 1`,
        [userEmail]
      );

      const user = rows[0];

      if (!user || !user.is_active) {
        return res.status(401).json({
          error: "Email hoac mat khau khong dung."
        });
      }

      const valid = await argon2.verify(
        user.password_hash,
        password
      );

      if (!valid) {
        return res.status(401).json({
          error: "Email hoac mat khau khong dung."
        });
      }

      // Tao session ID moi khi dang nhap
      await new Promise((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      req.session.userId = user.id;

      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.json({
        message: "Dang nhap thanh cong.",
        user: {
          id: String(user.id),
          full_name: user.full_name,
          email: user.email,
          role: user.role
        }
      });
    })
  );

  // =====================================
  // 3. XEM THONG TIN TAI KHOAN
  // =====================================

  router.get("/me", safe(async (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({
        error: "Ban chua dang nhap."
      });
    }

    const [rows] = await pool.execute(
      `SELECT id, full_name, email,
              phone, role, is_active,
              created_at, updated_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [req.session.userId]
    );

    const user = rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({
        error: "Tai khoan khong con hoat dong."
      });
    }

    return res.json({
      user: {
        id: String(user.id),
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });
  }));

  // =====================================
  // 4. DANG XUAT
  // =====================================

  router.post(
    "/logout",
    requireJson,
    requireCsrf,
    (req, res, next) => {
      req.session.destroy((err) => {
        if (err) return next(err);

        res.clearCookie("inventory.sid", {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.COOKIE_SECURE === "true"
        });

        return res.json({
          message: "Dang xuat thanh cong."
        });
      });
    }
  );

  // Xu ly loi rieng cho router
  router.use((err, req, res, next) => {
    console.error("AUTH_ERROR:", err);

    if (res.headersSent) return next(err);

    return res.status(500).json({
      error: "Loi he thong xac thuc."
    });
  });

  return router;
}

module.exports = createAuthRouter;
