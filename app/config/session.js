
const session = require("express-session");
const MySQLStoreFactory = require("express-mysql-session");

function createSessionMiddleware() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET phải có ít nhất 32 ký tự"
    );
  }

  const MySQLStore = MySQLStoreFactory(session);

  const store = new MySQLStore({
    host: process.env.DB_HOST || "mysql",
    port: 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    createDatabaseTable: true,
    schema: {
      tableName: "user_sessions"
    },

    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 20 * 60 * 1000
  });

  return session({
    name: "inventory.sid",
    secret: secret,
    store: store,

    resave: false,
    saveUninitialized: false,
    rolling: true,

    cookie: {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      maxAge: 20 * 60 * 1000,
      path: "/"
    }
  });
}

module.exports = createSessionMiddleware;
