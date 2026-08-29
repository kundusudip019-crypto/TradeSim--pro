// ============================================================
// TradeSim Pro - Secure Payment / Admin API Server
// ============================================================

import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 10000);

const ADMIN_EMAIL =
  String(process.env.ADMIN_EMAIL || "kundusudip019@gmail.com")
    .trim()
    .toLowerCase();


// ============================================================
// FIREBASE ADMIN
// ============================================================

let db = null;

try {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is not configured."
    );
  }

  const serviceAccount =
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  admin.initializeApp({
    credential:
      admin.credential.cert(serviceAccount)
  });

  db = admin.firestore();

  console.log("Firebase Admin connected.");

} catch (error) {

  console.error(
    "Firebase initialization error:",
    error.message
  );

}


// ============================================================
// CORS
// ============================================================

const allowedOrigins = String(
  process.env.ALLOWED_ORIGINS || ""
)
  .split(",")
  .map(x => x.trim())
  .filter(Boolean);


app.use(
  cors({
    origin(origin, callback) {

      // Allow requests without browser Origin header
      // such as health checks / server-to-server.
      if (!origin) {
        return callback(null, true);
      }

      if (
        allowedOrigins.length === 0 ||
        allowedOrigins.includes(origin)
      ) {
        return callback(null, true);
      }

      return callback(
        new Error("Origin not allowed.")
      );

    },

    methods: ["GET", "POST"],

    allowedHeaders: [
      "Content-Type",
      "Authorization"
    ],

    credentials: false
  })
);


// ============================================================
// BODY PARSER
// ============================================================

app.use(
  express.json({
    limit: "200kb"
  })
);


// ============================================================
// MULTER
// ============================================================

const upload = multer({

  storage:
    multer.memoryStorage(),

  limits: {
    fileSize:
      8 * 1024 * 1024
  },

  fileFilter:
    (req, file, cb) => {

      const allowed = [
        "image/jpeg",
        "image/png",
        "image/webp"
      ];

      if (
        !allowed.includes(
          file.mimetype
        )
      ) {

        return cb(
          new Error(
            "Only JPG, PNG or WEBP screenshots are allowed."
          )
        );

      }

      cb(null, true);

    }

});


// ============================================================
// HELPERS
// ============================================================

function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function cleanString(
  value,
  maxLength = 200
) {

  return String(value ?? "")
    .trim()
    .slice(0, maxLength);

}


function money(value) {

  return Number(value || 0)
    .toFixed(2);

}


function isValidAmount(
  amount,
  minimum = 0,
  maximum = 100000000
) {

  const n =
    Number(amount);

  return (
    Number.isFinite(n) &&
    n >= minimum &&
    n <= maximum
  );

}


// ============================================================
// AUTHENTICATION
//
// Client must send:
//
// Authorization: Bearer FIREBASE_ID_TOKEN
//
// The server verifies the token using Firebase Admin SDK.
// ============================================================

async function verifyFirebaseToken(
  req,
  res,
  next
) {

  try {

    const header =
      req.headers.authorization || "";

    if (
      !header.startsWith("Bearer ")
    ) {

      return res.status(401).json({
        ok: false,
        message:
          "Authentication required."
      });

    }

    const idToken =
      header.slice(7).trim();

    if (!idToken) {

      return res.status(401).json({
        ok: false,
        message:
          "Invalid authentication token."
      });

    }

    const decoded =
      await admin
        .auth()
        .verifyIdToken(idToken);

    req.user =
      decoded;

    next();

  } catch (error) {

    console.error(
      "Authentication error:",
      error.message
    );

    return res.status(401).json({
      ok: false,
      message:
        "Authentication failed."
    });

  }

}


// ============================================================
// ADMIN AUTHORIZATION
// ============================================================

async function requireAdmin(
  req,
  res,
  next
) {

  try {

    if (!req.user) {

      return res.status(401).json({
        ok: false,
        message:
          "Authentication required."
      });

    }

    const email =
      String(
        req.user.email || ""
      )
        .trim()
        .toLowerCase();


    if (
      email !== ADMIN_EMAIL
    ) {

      return res.status(403).json({
        ok: false,
        message:
          "Admin access denied."
      });

    }

    /*
     * Extra check:
     * Verify the admin user document too.
     */

    if (db) {

      const adminUserRef =
        db.collection("users")
          .doc(req.user.uid);

      const adminUserSnap =
        await adminUserRef.get();

      if (
        adminUserSnap.exists
      ) {

        const data =
          adminUserSnap.data();

        /*
         * If account explicitly has
         * active=false, deny access.
         */

        if (
          data.active === false
        ) {

          return res.status(403).json({
            ok: false,
            message:
              "Admin account is disabled."
          });

        }

      }

    }

    next();

  } catch (error) {

    console.error(
      "Admin authorization error:",
      error.message
    );

    return res.status(403).json({
      ok: false,
      message:
        "Admin authorization failed."
    });

  }

}


// ============================================================
// TELEGRAM
// ============================================================

async function telegramMessage(
  text
) {

  const token =
    process.env.TELEGRAM_BOT_TOKEN;

  const chatId =
    process.env.TELEGRAM_CHAT_ID;


  if (
    !token ||
    !chatId
  ) {

    console.log(
      "Telegram credentials not configured."
    );

    return;

  }


  const url =
    `https://api.telegram.org/bot${token}/sendMessage`;


  const response =
    await fetch(
      url,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            chat_id:
              chatId,

            text,

            parse_mode:
              "HTML"
          })
      }
    );


  if (!response.ok) {

    const body =
      await response.text();

    throw new Error(
      `Telegram error: ${response.status} ${body}`
    );

  }

}


async function telegramPhoto(
  file,
  caption
) {

  const token =
    process.env.TELEGRAM_BOT_TOKEN;

  const chatId =
    process.env.TELEGRAM_CHAT_ID;


  if (
    !token ||
    !chatId
  ) {

    console.log(
      "Telegram credentials not configured."
    );

    return;

  }


  const form =
    new FormData();


  form.append(
    "chat_id",
    chatId
  );

  form.append(
    "caption",
    caption
  );

  form.append(
    "parse_mode",
    "HTML"
  );


  const blob =
    new Blob(
      [file.buffer],
      {
        type:
          file.mimetype
      }
    );


  form.append(
    "photo",
    blob,
    file.originalname ||
      "payment-screenshot.jpg"
  );


  const url =
    `https://api.telegram.org/bot${token}/sendPhoto`;


  const response =
    await fetch(
      url,
      {
        method: "POST",
        body: form
      }
    );


  if (!response.ok) {

    const body =
      await response.text();

    throw new Error(
      `Telegram photo error: ${response.status} ${body}`
    );

  }

}


// ============================================================
// HEALTH CHECK
// ============================================================

app.get(
  "/",
  (req, res) => {

    res.json({
      ok: true,
      service:
        "TradeSim Pro Payment Server",
      status:
        "running"
    });

  }
);


// ============================================================
// ADD BALANCE REQUEST
// ============================================================

app.post(
  "/api/payment/add-balance",

  verifyFirebaseToken,

  upload.single("screenshot"),

  async (req, res) => {

    try {

      if (!db) {

        return res.status(500).json({
          ok: false,
          message:
            "Firebase backend is not configured."
        });

      }


      /*
       * IMPORTANT:
       *
       * Do NOT trust userId from req.body.
       *
       * UID comes from verified Firebase token.
       */

      const userId =
        req.user.uid;


      const userName =
        cleanString(
          req.body.userName,
          100
        );

      const userEmail =
        cleanString(
          req.body.userEmail,
          150
        );


      const numericAmount =
        Number(
          req.body.amount
        );


      const utr =
        cleanString(
          req.body.utr,
          100
        );


      // ----------------------------
      // Validate amount
      // ----------------------------

      if (
        !isValidAmount(
          numericAmount,
          1,
          1000000
        )
      ) {

        return res.status(400).json({
          ok: false,
          message:
            "Invalid payment amount."
        });

      }


      // ----------------------------
      // Validate UTR
      // ----------------------------

      if (
        utr.length < 4
      ) {

        return res.status(400).json({
          ok: false,
          message:
            "UTR / transaction ID is required."
        });

      }


      // ----------------------------
      // Screenshot
      // ----------------------------

      if (!req.file) {

        return res.status(400).json({
          ok: false,
          message:
            "Payment screenshot is required."
        });

      }


      // ----------------------------
      // Verify user exists
      // ----------------------------

      const userRef =
        db.collection("users")
          .doc(userId);

      const userSnap =
        await userRef.get();


      if (!userSnap.exists) {

        return res.status(404).json({
          ok: false,
          message:
            "User account not found."
        });

      }


      const userData =
        userSnap.data();


      if (
        userData.active === false
      ) {

        return res.status(403).json({
          ok: false,
          message:
            "User account is disabled."
        });

      }


      // ----------------------------
      // Create request
      // ----------------------------

      const requestRef =
        db.collection(
          "topupRequests"
        ).doc();


      await requestRef.set({

        userId,

        userName:
          userName ||
          cleanString(
            userData.name,
            100
          ),

        userEmail:
          userEmail ||
          cleanString(
            userData.email ||
            req.user.email ||
            "",
            150
          ),

        amount:
          Number(
            numericAmount.toFixed(2)
          ),

        utr,

        status:
          "PENDING",

        screenshotSentToTelegram:
          false,

        createdAt:
          admin.firestore
            .FieldValue
            .serverTimestamp()

      });


      // ----------------------------
      // Telegram
      // ----------------------------

      const telegramCaption = `

<b>💰 NEW ADD BALANCE REQUEST</b>

👤 <b>User:</b> ${escapeHtml(
        userName ||
        userData.name ||
        "Unknown"
      )}

📧 <b>Email:</b> ${escapeHtml(
        userEmail ||
        userData.email ||
        req.user.email ||
        "Unknown"
      )}

💵 <b>Amount:</b> ₹${money(
        numericAmount
      )}

🔢 <b>UTR:</b> ${escapeHtml(
        utr
      )}

🆔 <b>Request ID:</b>
<code>${requestRef.id}</code>

⏳ <b>Status:</b> PENDING

Please verify the payment before approving.
`;


      try {

        await telegramPhoto(
          req.file,
          telegramCaption
        );


        await requestRef.update({
          screenshotSentToTelegram:
            true
        });

      } catch (telegramError) {

        console.error(
          "Telegram error:",
          telegramError.message
        );

        /*
         * Request remains in Firestore.
         * Admin can still see it.
         */

      }


      return res.json({

        ok: true,

        message:
          "Payment request submitted successfully.",

        requestId:
          requestRef.id

      });


    } catch (error) {

      console.error(
        "Add balance error:",
        error
      );

      return res.status(500).json({

        ok: false,

        message:
          error.message ||
          "Could not submit payment request."

      });

    }

  }
);


// ============================================================
// WITHDRAWAL REQUEST
// ============================================================

app.post(
  "/api/payment/withdraw",

  verifyFirebaseToken,

  async (req, res) => {

    try {

      if (!db) {

        return res.status(500).json({
          ok: false,
          message:
            "Firebase backend is not configured."
        });

      }


      /*
       * UID comes from verified token.
       */

      const userId =
        req.user.uid;


      const userName =
        cleanString(
          req.body.userName,
          100
        );


      const userEmail =
        cleanString(
          req.body.userEmail,
          150
        );


      const numericAmount =
        Number(
          req.body.amount
        );


      const cleanUpi =
        cleanString(
          req.body.upiId,
          100
        );


      // ----------------------------
      // Amount validation
      // ----------------------------

      if (
        !isValidAmount(
          numericAmount,
          50,
          1000000
        )
      ) {

        return res.status(400).json({
          ok: false,
          message:
            "Minimum withdrawal is ₹50."
        });

      }


      // ----------------------------
      // UPI validation
      // ----------------------------

      /*
       * Basic UPI format validation.
       * This is NOT proof that the UPI exists.
       */

      const upiRegex =
        /^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/;


      if (
        !upiRegex.test(
          cleanUpi
        )
      ) {

        return res.status(400).json({
          ok: false,
          message:
            "Please enter a valid UPI ID."
        });

      }


      // ----------------------------
      // User
      // ----------------------------

      const userRef =
        db.collection("users")
          .doc(userId);


      const userSnap =
        await userRef.get();


      if (!userSnap.exists) {

        return res.status(404).json({
          ok: false,
          message:
            "User account not found."
        });

      }


      const userData =
        userSnap.data();


      if (
        userData.active === false
      ) {

        return res.status(403).json({
          ok: false,
          message:
            "User account is disabled."
        });

      }


      const balance =
        Number(
          userData.balance || 0
        );


      // ----------------------------
      // Balance validation
      // ----------------------------

      if (
        balance < numericAmount
      ) {

        return res.status(400).json({
          ok: false,
          message:
            "Insufficient virtual balance."
        });

      }


      if (
        balance -
          numericAmount <
        100
      ) {

        return res.status(400).json({
          ok: false,
          message:
            "You must keep at least ₹100 in your wallet."
        });

      }


      // ----------------------------
      // Create request
      // ----------------------------

      const requestRef =
        db.collection(
          "withdrawalRequests"
        ).doc();


      await requestRef.set({

        userId,

        userName:
          userName ||
          cleanString(
            userData.name,
            100
          ),

        userEmail:
          userEmail ||
          cleanString(
            userData.email ||
            req.user.email ||
            "",
            150
          ),

        amount:
          Number(
            numericAmount.toFixed(2)
          ),

        upiId:
          cleanUpi,

        status:
          "PENDING",

        createdAt:
          admin.firestore
            .FieldValue
            .serverTimestamp()

      });


      // ----------------------------
      // Telegram
      // ----------------------------

      const telegramText = `

<b>🏦 NEW WITHDRAWAL REQUEST</b>

👤 <b>User:</b> ${escapeHtml(
        userName ||
        userData.name ||
        "Unknown"
      )}

📧 <b>Email:</b> ${escapeHtml(
        userEmail ||
        userData.email ||
        req.user.email ||
        "Unknown"
      )}

💵 <b>Amount:</b> ₹${money(
        numericAmount
      )}

💳 <b>UPI ID:</b>
<code>${escapeHtml(
        cleanUpi
      )}</code>

🆔 <b>Request ID:</b>
<code>${requestRef.id}</code>

⏳ <b>Status:</b> PENDING

Admin should manually verify/pay the withdrawal before marking it successful.
`;


      try {

        await telegramMessage(
          telegramText
        );

      } catch (telegramError) {

        console.error(
          "Telegram error:",
          telegramError.message
        );

      }


      return res.json({

        ok: true,

        message:
          "Withdrawal request submitted successfully.",

        requestId:
          requestRef.id

      });


    } catch (error) {

      console.error(
        "Withdrawal error:",
        error
      );

      return res.status(500).json({

        ok: false,

        message:
          error.message ||
          "Could not submit withdrawal request."

      });

    }

  }
);


// ============================================================
// ADMIN REQUEST STATUS
//
// Secure server-side approve/reject.
//
// Client must send:
//
// Authorization: Bearer FIREBASE_ID_TOKEN
//
// Body:
//
// {
//   requestId,
//   type,
//   status
// }
// ============================================================

app.post(
  "/api/admin/request-status",

  verifyFirebaseToken,

  requireAdmin,

  async (req, res) => {

    try {

      if (!db) {

        return res.status(500).json({
          ok: false,
          message:
            "Firebase backend is not configured."
        });

      }


      const requestId =
        cleanString(
          req.body.requestId,
          150
        );


      const type =
        cleanString(
          req.body.type,
          30
        ).toLowerCase();


      const status =
        cleanString(
          req.body.status,
          20
        ).toUpperCase();


      if (!requestId) {

        return res.status(400).json({
          ok: false,
          message:
            "Request ID is required."
        });

      }


      if (
        ![
          "withdrawal",
          "topup",
          "add-balance",
          "topupRequests",
          "withdrawalRequests"
        ].includes(type)
      ) {

        return res.status(400).json({
          ok: false,
          message:
            "Invalid request type."
        });

      }


      if (
        ![
          "APPROVED",
          "REJECTED"
        ].includes(status)
      ) {

        return res.status(400).json({
          ok: false,
          message:
            "Invalid status."
        });

      }


      const collectionName =
        type === "withdrawal" ||
        type === "withdrawalRequests"
          ? "withdrawalRequests"
          : "topupRequests";


      const requestRef =
        db.collection(
          collectionName
        ).doc(requestId);


      // ======================================================
      // APPROVE / REJECT
      // ======================================================

      await db.runTransaction(
        async transaction => {

          const requestSnap =
            await transaction.get(
              requestRef
            );


          if (
            !requestSnap.exists
          ) {

            throw new Error(
              "Request not found."
            );

          }


          const request =
            requestSnap.data();


          // ------------------------------
          // Prevent double processing
          // ------------------------------

          if (
            request.status !==
            "PENDING"
          ) {

            throw new Error(
              "This request has already been processed."
            );

          }


          const uid =
            cleanString(
              request.userId,
              150
            );


          if (!uid) {

            throw new Error(
              "Request does not contain a valid user ID."
            );

          }


          const amount =
            Number(
              request.amount
            );


          if (
            !isValidAmount(
              amount,
              0.01,
              1000000
            )
          ) {

            throw new Error(
              "Invalid request amount."
            );

          }


          const userRef =
            db.collection(
              "users"
            ).doc(uid);


          const userSnap =
            await transaction.get(
              userRef
            );


          if (
            !userSnap.exists
          ) {

            throw new Error(
              "User not found."
            );

          }


          const userData =
            userSnap.data();


          const currentBalance =
            Number(
              userData.balance || 0
            );


          // ==================================================
          // REJECT
          // ==================================================

          if (
            status === "REJECTED"
          ) {

            transaction.update(
              requestRef,
              {
                status:
                  "REJECTED",

                processedAt:
                  admin.firestore
                    .FieldValue
                    .serverTimestamp(),

                processedBy:
                  req.user.uid,

                processedByEmail:
                  req.user.email ||
                  null
              }
            );

            return;

          }


          // ==================================================
          // APPROVE TOPUP
          // ==================================================

          if (
            collectionName ===
            "topupRequests"
          ) {

            const newBalance =
              currentBalance +
              amount;


            transaction.update(
              userRef,
              {
                balance:
                  newBalance
              }
            );


            transaction.update(
              requestRef,
              {
                status:
                  "APPROVED",

                processedAt:
                  admin.firestore
                    .FieldValue
                    .serverTimestamp(),

                processedBy:
                  req.user.uid,

                processedByEmail:
                  req.user.email ||
                  null
              }
            );


            const walletRef =
              db.collection(
                "walletTransactions"
              ).doc();


            transaction.set(
              walletRef,
              {

                userId:
                  uid,

                type:
                  "DEMO_TOPUP",

                amount:
                  amount,

                balanceBefore:
                  currentBalance,

                balanceAfter:
                  newBalance,

                createdAt:
                  admin.firestore
                    .FieldValue
                    .serverTimestamp(),

                note:
                  "Admin approved demo wallet request",

                adminUid:
                  req.user.uid

              }
            );


            return;

          }


          // ==================================================
          // APPROVE WITHDRAWAL
          // ==================================================

          if (
            collectionName ===
            "withdrawalRequests"
          ) {

            if (
              amount < 50
            ) {

              throw new Error(
                "Withdrawal must be at least ₹50."
              );

            }


            if (
              currentBalance -
                amount <
              100
            ) {

              throw new Error(
                "Withdrawal cannot reduce wallet below ₹100."
              );

            }


            const newBalance =
              currentBalance -
              amount;


            transaction.update(
              userRef,
              {
                balance:
                  newBalance
              }
            );


            transaction.update(
              requestRef,
              {
                status:
                  "APPROVED",

                processedAt:
                  admin.firestore
                    .FieldValue
                    .serverTimestamp(),

                processedBy:
                  req.user.uid,

                processedByEmail:
                  req.user.email ||
                  null
              }
            );


            const walletRef =
              db.collection(
                "walletTransactions"
              ).doc();


            transaction.set(
              walletRef,
              {

                userId:
                  uid,

                type:
                  "WITHDRAWAL",

                amount:
                  amount,

                balanceBefore:
                  currentBalance,

                balanceAfter:
                  newBalance,

                createdAt:
                  admin.firestore
                    .FieldValue
                    .serverTimestamp(),

                note:
                  "Admin approved withdrawal request",

                adminUid:
                  req.user.uid

              }
            );

          }

        }
      );


      // ======================================================
      // TELEGRAM ADMIN ACTION
      // ======================================================

      try {

        await telegramMessage(`

<b>✅ ADMIN REQUEST UPDATE</b>

<b>Type:</b> ${escapeHtml(
          collectionName
        )}

<b>Request ID:</b>
<code>${escapeHtml(
          requestId
        )}</code>

<b>Status:</b> ${escapeHtml(
          status
        )}

<b>Admin:</b> ${escapeHtml(
          req.user.email ||
          req.user.uid
        )}

`);

      } catch (telegramError) {

        console.error(
          "Telegram admin notification error:",
          telegramError.message
        );

      }


      return res.json({

        ok: true,

        message:
          `Request ${status.toLowerCase()}.`

      });


    } catch (error) {

      console.error(
        "Admin status error:",
        error
      );

      return res.status(400).json({

        ok: false,

        message:
          error.message ||
          "Could not update request."

      });

    }

  }
);

// ============================================================
// TRADE SYSTEM
// SERVER-SIDE BALANCE UPDATE
// ============================================================

const TRADE_MIN_AMOUNT = 100;
const TRADE_MAX_AMOUNT = 500;
const TRADE_SESSION_MS = 5 * 60 * 1000;


/* ============================================================
   RANDOM WIN RATE
   Minimum 22%
   Maximum 90%
============================================================ */

function getRandomWinRate() {

  return (
    Math.random() *
      (90 - 22) +
    22
  );

}


/* ============================================================
   TRADE RESULT
============================================================ */

function calculateTradeResult(amount) {

  const winRate =
    getRandomWinRate();

  const won =
    Math.random() * 100 <
    winRate;


  /*
   * WIN:
   * +45% profit
   *
   * LOSS:
   * -55% loss
   */

  const profit =
    won
      ? amount * 0.45
      : -(amount * 0.55);


  return {

    result:
      won
        ? "WIN"
        : "LOSS",

    profit:
      Number(
        profit.toFixed(2)
      ),

    winRate:
      Number(
        winRate.toFixed(2)
      )

  };

}


/* ============================================================
   OPEN TRADE
============================================================ */

app.post(
  "/api/trade/open",

  verifyFirebaseToken,

  async (req, res) => {

    try {

      if (!db) {

        return res.status(500).json({

          ok: false,

          message:
            "Firebase backend is not configured."

        });

      }


      const userId =
        req.user.uid;


      const side =
        String(
          req.body.side || ""
        )
        .trim()
        .toUpperCase();


      const amount =
        Number(
          req.body.amount
        );


      // --------------------------------------------------------
      // SIDE
      // --------------------------------------------------------

      if (
        side !== "BUY" &&
        side !== "SELL"
      ) {

        return res.status(400).json({

          ok: false,

          message:
            "Invalid trade side."

        });

      }


      // --------------------------------------------------------
      // AMOUNT
      // Minimum ₹100
      // Maximum ₹500
      // --------------------------------------------------------

      if (
        !isValidAmount(
          amount,
          TRADE_MIN_AMOUNT,
          TRADE_MAX_AMOUNT
        )
      ) {

        return res.status(400).json({

          ok: false,

          message:
            `Trade amount must be between ₹${TRADE_MIN_AMOUNT} and ₹${TRADE_MAX_AMOUNT}.`

        });

      }


      const cleanAmount =
        Number(
          amount.toFixed(2)
        );


      const userRef =
        db.collection(
          "users"
        )
        .doc(userId);


      const tradeRef =
        db.collection(
          "trades"
        )
        .doc();


      /*
       * Result is generated on the server.
       * Client cannot decide WIN/LOSS.
       */

      const result =
        calculateTradeResult(
          cleanAmount
        );


      await db.runTransaction(
        async transaction => {

          const userSnap =
            await transaction.get(
              userRef
            );


          if (
            !userSnap.exists
          ) {

            throw new Error(
              "User account not found."
            );

          }


          const userData =
            userSnap.data();


          if (
            userData.active === false
          ) {

            throw new Error(
              "Your account is disabled."
            );

          }


          const balance =
            Number(
              userData.balance || 0
            );


          // ----------------------------------------------------
          // BALANCE CHECK
          // ----------------------------------------------------

          if (
            balance < cleanAmount
          ) {

            throw new Error(
              "Insufficient demo balance."
            );

          }


          // ----------------------------------------------------
          // DEDUCT TRADE AMOUNT
          // ----------------------------------------------------

          const newBalance =
            Number(
              (
                balance -
                cleanAmount
              ).toFixed(2)
            );


          transaction.update(

            userRef,

            {

              balance:
                newBalance,

              updatedAt:
                admin.firestore
                  .FieldValue
                  .serverTimestamp()

            }

          );


          // ----------------------------------------------------
          // CREATE TRADE
          // ----------------------------------------------------

          transaction.set(

            tradeRef,

            {

              userId:
                userId,

              userName:
                cleanString(
                  userData.name ||
                  userData.displayName ||
                  "Trader",
                  100
                ),

              userEmail:
                cleanString(
                  userData.email ||
                  req.user.email ||
                  "",
                  150
                ),

              side:
                side,

              amount:
                cleanAmount,

              status:
                "OPEN",

              result:
                result.result,

              profit:
                result.profit,

              winRate:
                result.winRate,

              sessionMinutes:
                5,

              createdAt:
                admin.firestore
                  .FieldValue
                  .serverTimestamp(),

              settleAt:
                admin.firestore
                  .Timestamp
                  .fromMillis(
                    Date.now() +
                    TRADE_SESSION_MS
                  ),

              balanceBefore:
                balance,

              balanceAfterOpen:
                newBalance,

              settledAt:
                null

            }

          );


          // ----------------------------------------------------
          // WALLET TRANSACTION
          // ----------------------------------------------------

          const walletRef =
            db.collection(
              "walletTransactions"
            )
            .doc();


          transaction.set(

            walletRef,

            {

              userId:
                userId,

              tradeId:
                tradeRef.id,

              type:
                "TRADE_OPEN",

              amount:
                -cleanAmount,

              balanceBefore:
                balance,

              balanceAfter:
                newBalance,

              createdAt:
                admin.firestore
                  .FieldValue
                  .serverTimestamp(),

              note:
                `${side} trade opened`

            }

          );

        }

      );


      return res.json({

        ok:
          true,

        message:
          "Trade opened successfully.",

        tradeId:
          tradeRef.id,

        side:
          side,

        amount:
          cleanAmount,

        deducted:
          cleanAmount,

        sessionMinutes:
          5

      });


    } catch (error) {

      console.error(
        "Open trade error:",
        error
      );


      return res.status(400).json({

        ok:
          false,

        message:
          error.message ||
          "Could not open trade."

      });

    }

  }

);


/* ============================================================
   SETTLE TRADE
============================================================ */

async function settleTrade(
  tradeId
) {

  const tradeRef =
    db.collection(
      "trades"
    )
    .doc(tradeId);


  await db.runTransaction(
    async transaction => {

      const tradeSnap =
        await transaction.get(
          tradeRef
        );


      if (
        !tradeSnap.exists
      ) {

        return;

      }


      const trade =
        tradeSnap.data();


      // --------------------------------------------------------
      // ALREADY SETTLED
      // --------------------------------------------------------

      if (
        trade.status !== "OPEN"
      ) {

        return;

      }


      // --------------------------------------------------------
      // WAIT UNTIL 5 MINUTES
      // --------------------------------------------------------

      if (
        trade.settleAt &&
        trade.settleAt.toMillis() >
        Date.now()
      ) {

        return;

      }


      const userRef =
        db.collection(
          "users"
        )
        .doc(
          trade.userId
        );


      const userSnap =
        await transaction.get(
          userRef
        );


      if (
        !userSnap.exists
      ) {

        throw new Error(
          "User not found."
        );

      }


      const userData =
        userSnap.data();


      const currentBalance =
        Number(
          userData.balance || 0
        );


      const amount =
        Number(
          trade.amount || 0
        );


      const profit =
        Number(
          trade.profit || 0
        );


      /*
       * Trade amount was already deducted
       * when the trade opened.
       *
       * Settlement:
       *
       * current balance
       * + original stake
       * + profit/loss
       */

      const newBalance =
        Number(

          (
            currentBalance +
            amount +
            profit
          ).toFixed(2)

        );


      // --------------------------------------------------------
      // UPDATE USER BALANCE
      // --------------------------------------------------------

      transaction.update(

        userRef,

        {

          balance:
            newBalance,

          updatedAt:
            admin.firestore
              .FieldValue
              .serverTimestamp()

        }

      );


      // --------------------------------------------------------
      // SETTLE TRADE
      // --------------------------------------------------------

      transaction.update(

        tradeRef,

        {

          status:
            "SETTLED",

          settledAt:
            admin.firestore
              .FieldValue
              .serverTimestamp(),

          balanceBeforeSettlement:
            currentBalance,

          balanceAfterSettlement:
            newBalance

        }

      );


      // --------------------------------------------------------
      // WALLET HISTORY
      // --------------------------------------------------------

      const walletRef =
        db.collection(
          "walletTransactions"
        )
        .doc();


      transaction.set(

        walletRef,

        {

          userId:
            trade.userId,

          tradeId:
            tradeId,

          type:
            "TRADE_SETTLEMENT",

          result:
            trade.result,

          amount:
            Number(
              (
                amount +
                profit
              ).toFixed(2)
            ),

          stakeReturned:
            amount,

          profit:
            profit,

          balanceBefore:
            currentBalance,

          balanceAfter:
            newBalance,

          createdAt:
            admin.firestore
              .FieldValue
              .serverTimestamp(),

          note:
            trade.result === "WIN"
              ? "Winning trade settled"
              : "Losing trade settled"

        }

      );

    }

  );

}


/* ============================================================
   AUTOMATIC SETTLEMENT WORKER
============================================================ */

async function settleExpiredTrades() {

  try {

    if (!db) {

      console.error(
        "Settlement skipped: Firebase is not configured."
      );

      return;

    }


    const now =
      admin.firestore
        .Timestamp
        .now();


    const snapshot =
      await db
        .collection(
          "trades"
        )
        .where(
          "status",
          "==",
          "OPEN"
        )
        .where(
          "settleAt",
          "<=",
          now
        )
        .limit(50)
        .get();


    if (
      snapshot.empty
    ) {

      return;

    }


    for (
      const tradeDoc
      of snapshot.docs
    ) {

      try {

        await settleTrade(
          tradeDoc.id
        );


        console.log(
          "Trade settled:",
          tradeDoc.id
        );


      } catch (error) {

        console.error(

          "Settlement failed:",

          tradeDoc.id,

          error.message

        );

      }

    }


  } catch (error) {

    console.error(
      "Settlement worker error:",
      error
    );

  }

}


/* ============================================================
   CHECK EVERY 10 SECONDS
============================================================ */

setInterval(
  settleExpiredTrades,
  10000
);


/*
 * Also run once when server starts.
 */

setTimeout(
  settleExpiredTrades,
  3000
);


// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use(
  (error, req, res, next) => {

    console.error(
      "Server error:",
      error
    );


    const message =
      error?.message ||
      "Request failed.";


    res.status(400).json({

      ok: false,

      message

    });

  }
);


// ============================================================
// START SERVER
// ============================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `TradeSim payment server running on port ${PORT}`
    );

    console.log(
      `Admin email: ${ADMIN_EMAIL}`
    );

  }
);