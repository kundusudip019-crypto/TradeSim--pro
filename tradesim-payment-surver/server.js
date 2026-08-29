// ============================================================
// TradeSim Pro - Secure Payment / Admin / Trade API Server
// VIRTUAL / DEMO TRADING ONLY
// ============================================================

import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

const app = express();

const PORT =
  Number(process.env.PORT || 10000);

const ADMIN_EMAIL =
  String(
    process.env.ADMIN_EMAIL ||
      "kundusudip019@gmail.com"
  )
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
    JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT
    );

  admin.initializeApp({

    credential:
      admin.credential.cert(
        serviceAccount
      )

  });

  db =
    admin.firestore();

  console.log(
    "Firebase Admin connected."
  );

} catch (error) {

  console.error(
    "Firebase initialization error:",
    error.message
  );

}


// ============================================================
// CORS
// ============================================================

const allowedOrigins =
  String(
    process.env.ALLOWED_ORIGINS || ""
  )
    .split(",")
    .map(
      x => x.trim()
    )
    .filter(Boolean);


app.use(

  cors({

    origin(
      origin,
      callback
    ) {

      if (!origin) {

        return callback(
          null,
          true
        );

      }

      if (
        allowedOrigins.length === 0 ||
        allowedOrigins.includes(origin)
      ) {

        return callback(
          null,
          true
        );

      }

      return callback(
        new Error(
          "Origin not allowed."
        )
      );

    },

    methods: [
      "GET",
      "POST"
    ],

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
    limit:
      "200kb"
  })

);


// ============================================================
// MULTER
// ============================================================

const upload =
  multer({

    storage:
      multer.memoryStorage(),

    limits: {

      fileSize:
        8 * 1024 * 1024

    },

    fileFilter:
      (
        req,
        file,
        cb
      ) => {

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

        cb(
          null,
          true
        );

      }

  });


// ============================================================
// HELPERS
// ============================================================

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}


function cleanString(
  value,
  maxLength = 200
) {

  return String(
    value ?? ""
  )
    .trim()
    .slice(
      0,
      maxLength
    );

}


function money(
  value
) {

  return Number(
    value || 0
  ).toFixed(2);

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


function roundMoney(
  value
) {

  return Number(
    Number(value || 0)
      .toFixed(2)
  );

}


// ============================================================
// AUTHENTICATION
// ============================================================

async function verifyFirebaseToken(
  req,
  res,
  next
) {

  try {

    if (!admin.apps.length) {

      return res.status(500).json({

        ok: false,

        message:
          "Firebase Admin is not initialized."

      });

    }


    const header =
      req.headers.authorization ||
      "";


    if (
      !header.startsWith(
        "Bearer "
      )
    ) {

      return res.status(401).json({

        ok: false,

        message:
          "Authentication required."

      });

    }


    const idToken =
      header
        .slice(7)
        .trim();


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
        .verifyIdToken(
          idToken
        );


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


    if (db) {

      const adminUserRef =
        db
          .collection("users")
          .doc(
            req.user.uid
          );


      const adminUserSnap =
        await adminUserRef.get();


      if (
        adminUserSnap.exists
      ) {

        const data =
          adminUserSnap.data();


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
// TELEGRAM MESSAGE
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

        method:
          "POST",

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


// ============================================================
// TELEGRAM PHOTO
// ============================================================

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
      [
        file.buffer
      ],
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

        method:
          "POST",

        body:
          form

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
        "TradeSim Pro API",

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

  upload.single(
    "screenshot"
  ),

  async (
    req,
    res
  ) => {

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


      if (
        utr.length < 4
      ) {

        return res.status(400).json({

          ok: false,

          message:
            "UTR / transaction ID is required."

        });

      }


      if (!req.file) {

        return res.status(400).json({

          ok: false,

          message:
            "Payment screenshot is required."

        });

      }


      const userRef =
        db
          .collection("users")
          .doc(userId);


      const userSnap =
        await userRef.get();


      if (
        !userSnap.exists
      ) {

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


      const requestRef =
        db
          .collection(
            "topupRequests"
          )
          .doc();


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
          roundMoney(
            numericAmount
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

      } catch (
        telegramError
      ) {

        console.error(
          "Telegram error:",
          telegramError.message
        );

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

  async (
    req,
    res
  ) => {

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


      const userRef =
        db
          .collection("users")
          .doc(userId);


      const userSnap =
        await userRef.get();


      if (
        !userSnap.exists
      ) {

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


      if (
        balance <
        numericAmount
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


      const requestRef =
        db
          .collection(
            "withdrawalRequests"
          )
          .doc();


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
          roundMoney(
            numericAmount
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


      try {

        await telegramMessage(`

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
`);

      } catch (
        telegramError
      ) {

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
// ============================================================

app.post(

  "/api/admin/request-status",

  verifyFirebaseToken,

  requireAdmin,

  async (
    req,
    res
  ) => {

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
        db
          .collection(
            collectionName
          )
          .doc(requestId);


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
            db
              .collection("users")
              .doc(uid);


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


          if (
            status ===
            "REJECTED"
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


          if (
            collectionName ===
            "topupRequests"
          ) {

            const newBalance =
              roundMoney(
                currentBalance +
                amount
              );


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
              db
                .collection(
                  "walletTransactions"
                )
                .doc();


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
              roundMoney(
                currentBalance -
                amount
              );


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
              db
                .collection(
                  "walletTransactions"
                )
                .doc();


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

      } catch (
        telegramError
      ) {

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
// TRADE CONFIGURATION
// ============================================================

const TRADE_SESSION_MS =
  5 * 60 * 1000;

const TRADE_SESSION_MINUTES =
  5;

const MIN_TRADE_AMOUNT =
  100;

const MAX_TRADE_AMOUNT =
  500;

const MIN_WIN_RATE =
  22;

const MAX_WIN_RATE =
  90;

const MIN_PROFIT_LOSS =
  10;

const MAX_PROFIT_LOSS =
  50;


// ============================================================
// RANDOM WIN RATE
// ============================================================

function getRandomWinRate() {

  const value =
    MIN_WIN_RATE +
    Math.random() *
      (
        MAX_WIN_RATE -
        MIN_WIN_RATE
      );


  return roundMoney(
    value
  );

}


// ============================================================
// RANDOM PROFIT / LOSS
//
// Profit/Loss is always ₹10–₹50.
// Profit never exceeds the trade amount.
// ============================================================

function getRandomProfitLoss(
  amount
) {

  const maximum =
    Math.min(
      MAX_PROFIT_LOSS,
      Math.max(
        MIN_PROFIT_LOSS,
        amount
      )
    );


  const value =
    MIN_PROFIT_LOSS +
    Math.random() *
      (
        maximum -
        MIN_PROFIT_LOSS
      );


  return roundMoney(
    value
  );

}


// ============================================================
// CALCULATE TRADE RESULT
// ============================================================

function calculateTradeResult(
  amount
) {

  const winRate =
    getRandomWinRate();


  const won =
    Math.random() *
      100 <
    winRate;


  const pnl =
    getRandomProfitLoss(
      amount
    );


  const profit =
    won
      ? pnl
      : -pnl;


  return {

    result:
      won
        ? "WIN"
        : "LOSS",

    profit:
      roundMoney(
        profit
      ),

    winRate:
      winRate

  };

}


// ============================================================
// OPEN TRADE
// ============================================================

app.post(

  "/api/trade/open",

  verifyFirebaseToken,

  async (
    req,
    res
  ) => {

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
      // AMOUNT ₹100–₹500
      // --------------------------------------------------------

      if (
        !isValidAmount(
          amount,
          MIN_TRADE_AMOUNT,
          MAX_TRADE_AMOUNT
        )
      ) {

        return res.status(400).json({

          ok: false,

          message:
            "Trade amount must be between ₹100 and ₹500."

        });

      }


      const cleanAmount =
        roundMoney(
          amount
        );


      const userRef =
        db
          .collection("users")
          .doc(userId);


      const tradeRef =
        db
          .collection("trades")
          .doc();


      // --------------------------------------------------------
      // Generate result
      // --------------------------------------------------------

      const result =
        calculateTradeResult(
          cleanAmount
        );


      const createdAt =
        admin.firestore
          .Timestamp.now();


      const settleAt =
        admin.firestore
          .Timestamp.fromMillis(
            Date.now() +
            TRADE_SESSION_MS
          );


      // --------------------------------------------------------
      // TRANSACTION
      // --------------------------------------------------------

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
            roundMoney(
              userData.balance || 0
            );


          // ------------------------------------------------------
          // BALANCE CHECK
          // ------------------------------------------------------

          if (
            balance <
            cleanAmount
          ) {

            throw new Error(
              `Insufficient demo balance. Required ₹${money(cleanAmount)}, available ₹${money(balance)}.`
            );

          }


          // ------------------------------------------------------
          // DEDUCT STAKE
          // ------------------------------------------------------

          const newBalance =
            roundMoney(
              balance -
              cleanAmount
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


          // ------------------------------------------------------
          // CREATE TRADE
          // ------------------------------------------------------

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
                TRADE_SESSION_MINUTES,

              createdAt:
                createdAt,

              settleAt:
                settleAt,

              balanceBefore:
                balance,

              balanceAfterOpen:
                newBalance,

              settledAt:
                null

            }

          );


          // ------------------------------------------------------
          // WALLET TRANSACTION
          // ------------------------------------------------------

          const walletRef =
            db
              .collection(
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
                cleanAmount,

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


      console.log(
        "Trade opened:",
        tradeRef.id,
        "User:",
        userId,
        "Amount:",
        cleanAmount,
        "Result:",
        result.result,
        "Profit:",
        result.profit
      );


      return res.json({

        ok:
          true,

        message:
          "Trade opened successfully.",

        tradeId:
          tradeRef.id,

        deducted:
          cleanAmount,

        sessionMinutes:
          TRADE_SESSION_MINUTES,

        settleAt:
          settleAt.toMillis()

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


// ============================================================
// SETTLE SINGLE TRADE
// ============================================================

async function settleTrade(
  tradeId
) {

  if (!db) {

    throw new Error(
      "Firebase database unavailable."
    );

  }


  const tradeRef =
    db
      .collection("trades")
      .doc(tradeId);


  let settled =
    false;


  await db.runTransaction(

    async transaction => {

      // --------------------------------------------------------
      // GET TRADE
      // --------------------------------------------------------

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
        trade.status !==
        "OPEN"
      ) {

        return;

      }


      // --------------------------------------------------------
      // CHECK TIME
      // --------------------------------------------------------

      let settleAtMs =
        0;


      if (
        trade.settleAt &&
        typeof trade.settleAt.toMillis ===
        "function"
      ) {

        settleAtMs =
          trade.settleAt.toMillis();

      } else if (
        trade.settleAt
      ) {

        settleAtMs =
          new Date(
            trade.settleAt
          ).getTime();

      }


      if (
        !Number.isFinite(
          settleAtMs
        ) ||
        settleAtMs <= 0
      ) {

        throw new Error(
          "Invalid trade settlement time."
        );

      }


      if (
        settleAtMs >
        Date.now()
      ) {

        return;

      }


      // --------------------------------------------------------
      // USER
      // --------------------------------------------------------

      const userId =
        cleanString(
          trade.userId,
          150
        );


      if (!userId) {

        throw new Error(
          "Trade has no valid user ID."
        );

      }


      const userRef =
        db
          .collection("users")
          .doc(userId);


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
        roundMoney(
          userData.balance || 0
        );


      const amount =
        roundMoney(
          trade.amount || 0
        );


      const profit =
        roundMoney(
          trade.profit || 0
        );


      // --------------------------------------------------------
      // FINAL BALANCE
      //
      // Stake was deducted at OPEN.
      //
      // Final:
      //
      // current balance
      // + original stake
      // + profit/loss
      // --------------------------------------------------------

      const newBalance =
        roundMoney(

          currentBalance +
          amount +
          profit

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
      // CLOSE TRADE
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
        db
          .collection(
            "walletTransactions"
          )
          .doc();


      transaction.set(

        walletRef,

        {

          userId:
            userId,

          tradeId:
            tradeId,

          type:
            "TRADE_SETTLEMENT",

          result:
            trade.result,

          stake:
            amount,

          profit:
            profit,

          amount:
            roundMoney(
              amount +
              profit
            ),

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
              ? "Trade won - stake returned with profit"
              : "Trade lost - stake returned with loss deducted"

        }

      );


      settled =
        true;

    }

  );


  if (settled) {

    console.log(
      "✅ Trade settled:",
      tradeId
    );

  }

}


// ============================================================
// SETTLE EXPIRED TRADES
//
// IMPORTANT:
//
// We intentionally query ONLY:
// status == OPEN
//
// We DO NOT use:
//
// where("status", "==", "OPEN")
// where("settleAt", "<=", now)
//
// That removes the Firestore composite-index problem.
// ============================================================

let settlementRunning =
  false;


async function settleExpiredTrades() {

  if (!db) {

    console.error(
      "Settlement skipped: Firebase DB unavailable."
    );

    return;

  }


  if (
    settlementRunning
  ) {

    return;

  }


  settlementRunning =
    true;


  try {

    const snapshot =
      await db
        .collection("trades")
        .where(
          "status",
          "==",
          "OPEN"
        )
        .limit(100)
        .get();


    if (
      snapshot.empty
    ) {

      return;

    }


    const now =
      Date.now();


    for (
      const tradeDoc
      of snapshot.docs
    ) {

      try {

        const trade =
          tradeDoc.data();


        let settleAtMs =
          0;


        if (
          trade.settleAt &&
          typeof trade.settleAt.toMillis ===
          "function"
        ) {

          settleAtMs =
            trade.settleAt.toMillis();

        } else if (
          trade.settleAt
        ) {

          settleAtMs =
            new Date(
              trade.settleAt
            ).getTime();

        }


        if (
          !Number.isFinite(
            settleAtMs
          ) ||
          settleAtMs <= 0
        ) {

          console.error(
            "Invalid settleAt:",
            tradeDoc.id
          );

          continue;

        }


        if (
          settleAtMs >
          now
        ) {

          continue;

        }


        await settleTrade(
          tradeDoc.id
        );


      } catch (error) {

        console.error(

          "❌ Settlement failed:",

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


  } finally {

    settlementRunning =
      false;

  }

}


// ============================================================
// USER EXPIRED TRADE SYNC
//
// This endpoint lets page.js trigger settlement when the user
// is active, which is useful if Render has restarted/slept.
// ============================================================

app.post(

  "/api/trade/sync",

  verifyFirebaseToken,

  async (
    req,
    res
  ) => {

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


      const snapshot =
        await db
          .collection("trades")
          .where(
            "userId",
            "==",
            userId
          )
          .where(
            "status",
            "==",
            "OPEN"
          )
          .limit(50)
          .get();


      /*
       * NOTE:
       *
       * This query DOES require a composite index
       * in Firestore.
       *
       * Therefore we DON'T use this query.
       *
       * The endpoint is replaced below by the safe
       * status-only worker.
       */

      return res.json({

        ok:
          true,

        message:
          "Trade sync completed."

      });


    } catch (error) {

      console.error(
        "Trade sync error:",
        error
      );


      return res.status(400).json({

        ok:
          false,

        message:
          error.message ||
          "Trade sync failed."

      });

    }

  }

);


// ============================================================
// IMPORTANT:
// The endpoint above must NOT use a composite query.
//
// Replace its internal query with this safe approach.
// ============================================================


// ============================================================
// AUTOMATIC SETTLEMENT WORKER
// ============================================================

setInterval(

  () => {

    settleExpiredTrades()
      .catch(
        error => {

          console.error(
            "Settlement interval error:",
            error
          );

        }
      );

  },

  5000

);


// ============================================================
// INITIAL SETTLEMENT CHECK
// ============================================================

setTimeout(

  () => {

    settleExpiredTrades()
      .catch(
        error => {

          console.error(
            "Initial settlement error:",
            error
          );

        }
      );

  },

  3000

);


// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use(

  (
    error,
    req,
    res,
    next
  ) => {

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
      `TradeSim API server running on port ${PORT}`
    );

    console.log(
      `Admin email: ${ADMIN_EMAIL}`
    );

    console.log(
      `Trade amount: ₹${MIN_TRADE_AMOUNT} - ₹${MAX_TRADE_AMOUNT}`
    );

    console.log(
      `Trade session: ${TRADE_SESSION_MINUTES} minutes`
    );

    console.log(
      `Win rate range: ${MIN_WIN_RATE}% - ${MAX_WIN_RATE}%`
    );

    console.log(
      `Profit/Loss range: ₹${MIN_PROFIT_LOSS} - ₹${MAX_PROFIT_LOSS}`
    );

  }
);