
// ------------------------------------------------------------
// - Win/loss is NOT fixed per user.
// - The global settled-trade history is used.
// - The system continuously balances the overall result
//   toward 45% WIN / 55% LOSS.
// - Admin margin is virtual simulator accounting only.
// ============================================================


import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();


// ============================================================
// APP
// ============================================================

const app = express();

const PORT = Number(
  process.env.PORT || 10000
);


// ============================================================
// ADMIN
// ============================================================

const ADMIN_EMAIL = String(
  process.env.ADMIN_EMAIL ||
  "kundusudip019@gmail.com"
)
  .trim()
  .toLowerCase();


// ============================================================
// TRADE CONFIG
// ============================================================

const MIN_TRADE_AMOUNT = 100;
const MAX_TRADE_AMOUNT = 500;

const TRADE_SESSION_MINUTES = 5;

const TRADE_SESSION_MS =
  TRADE_SESSION_MINUTES *
  60 *
  1000;


// Result amount shown 

const MIN_PROFIT_RESULT = 10;
const MAX_PROFIT_RESULT = 40;

const MIN_LOSS_RESULT = 10;
const MAX_LOSS_RESULT = 50;


// ============================================================
// GLOBAL OUTCOME TARGET
// ============================================================

// IMPORTANT:
//
// These percentages are GLOBAL.
//
// They are NOT assigned to individual users.
//
// Example:
//
// User A -> LOSS
// User B -> LOSS
// User C -> WIN
// User D -> LOSS
// User E -> WIN
//
// The system checks the TOTAL settled trades.
//
// Target:
//
// WIN  = 45%
// LOSS = 55%


const GLOBAL_WIN_TARGET = 0.45;
const GLOBAL_LOSS_TARGET = 0.55;


// ============================================================
// ADMIN SIMULATED MARGIN
// ============================================================
//
// This is demo accounting only.
//
// It is NOT real money.
//
// Every settled trade receives a random
// virtual admin margin between ₹5 and ₹12.
//
// ============================================================

const ADMIN_MARGIN_MIN = 5;
const ADMIN_MARGIN_MAX = 12;


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
      value =>
        value.trim()
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
        allowedOrigins.includes(
          origin
        )
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
// BODY
// ============================================================

app.use(
  express.json({
    limit: "200kb"
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

    fileFilter(
      req,
      file,
      cb
    ) {

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


function money(value) {

  return Number(
    value || 0
  ).toFixed(2);

}


function roundMoney(value) {

  return Number(
    Number(
      value || 0
    ).toFixed(2)
  );

}


function randomInt(
  min,
  max
) {

  return (
    Math.floor(
      Math.random() *
      (
        max -
        min +
        1
      )
    ) +
    min
  );

}


function randomProfitAmount() {

  return randomInt(
    MIN_PROFIT_RESULT,
    MAX_PROFIT_RESULT
  );

}


function randomLossAmount() {

  return randomInt(
    MIN_LOSS_RESULT,
    MAX_LOSS_RESULT
  );

}


function randomAdminMargin() {

  return randomInt(
    ADMIN_MARGIN_MIN,
    ADMIN_MARGIN_MAX
  );

}


function isValidAmount(
  amount,
  minimum = 0,
  maximum = 100000000
) {

  const number =
    Number(amount);

  return (
    Number.isFinite(
      number
    ) &&
    number >= minimum &&
    number <= maximum
  );

}


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


function serverTimestamp() {

  return admin.firestore
    .FieldValue
    .serverTimestamp();

}


// ============================================================
// GLOBAL OUTCOME ENGINE
// ============================================================
//
// This is the important part.
//
// It does NOT create:
//
// User A = 45%
// User B = 45%
// User C = 30%
//
// Instead:
//
// ALL users + ALL settled trades
// are considered together.
//
// ============================================================

async function generateGlobalTradeOutcome() {

  if (!db) {

    throw new Error(
      "Firebase backend is not configured."
    );

  }


  const statsRef =
    db.collection(
      "simulatorStats"
    )
      .doc("global");


  const statsSnap =
    await statsRef.get();


  let totalTrades = 0;
  let totalWins = 0;
  let totalLosses = 0;


  if (
    statsSnap.exists
  ) {

    const data =
      statsSnap.data();

    totalTrades =
      Number(
        data.settledTrades ||
        0
      );

    totalWins =
      Number(
        data.totalWins ||
        0
      );

    totalLosses =
      Number(
        data.totalLosses ||
        0
      );

  }


  // ----------------------------------------------------------
  // First trade
  // ----------------------------------------------------------

  if (
    totalTrades <= 0
  ) {

    return {
      result:
        Math.random() <
        GLOBAL_WIN_TARGET
          ? "WIN"
          : "LOSS",

      profit:
        0,

      previousTotal:
        0,

      previousWins:
        0,

      previousLosses:
        0
    };

  }


  const currentWinRate =
    totalWins /
    totalTrades;


  const currentLossRate =
    totalLosses /
    totalTrades;


  // ----------------------------------------------------------
  // Calculate expected wins after next trade.
  // ----------------------------------------------------------

  const expectedWins =
    (
      totalTrades + 1
    ) *
    GLOBAL_WIN_TARGET;


  const expectedLosses =
    (
      totalTrades + 1
    ) *
    GLOBAL_LOSS_TARGET;


  const winDifference =
    expectedWins -
    totalWins;


  const lossDifference =
    expectedLosses -
    totalLosses;


  // ----------------------------------------------------------
  // If current WIN percentage is below target,
  // WIN becomes more likely.
  //
  // If current LOSS percentage is below target,
  // LOSS becomes more likely.
  // ----------------------------------------------------------

  let winProbability =
    GLOBAL_WIN_TARGET;


  if (
    currentWinRate <
    GLOBAL_WIN_TARGET
  ) {

    const deficit =
      GLOBAL_WIN_TARGET -
      currentWinRate;

    winProbability =
      Math.min(
        0.90,
        GLOBAL_WIN_TARGET +
        deficit
      );

  }


  if (
    currentWinRate >
    GLOBAL_WIN_TARGET
  ) {

    const excess =
      currentWinRate -
      GLOBAL_WIN_TARGET;

    winProbability =
      Math.max(
        0.10,
        GLOBAL_WIN_TARGET -
        excess
      );

  }


  // ----------------------------------------------------------
  // Strong balancing for small sample sizes.
  //
  // Example:
  //
  // 1 trade WIN
  // 2nd trade is more likely LOSS.
  //
  // This prevents one side from becoming permanently
  // dominant.
  // ----------------------------------------------------------

  if (
    winDifference < 0
  ) {

    winProbability =
      Math.max(
        winProbability,
        Math.min(
          0.90,
          GLOBAL_WIN_TARGET +
          Math.abs(
            winDifference
          ) /
          (
            totalTrades + 1
          )
        )
      );

  }


  if (
    lossDifference < 0
  ) {

    winProbability =
      Math.min(
        winProbability,
        Math.max(
          0.10,
          GLOBAL_WIN_TARGET -
          Math.abs(
            lossDifference
          ) /
          (
            totalTrades + 1
          )
        )
      );

  }


  // ----------------------------------------------------------
  // Random final decision.
  // ----------------------------------------------------------

  const isWin =
    Math.random() <
    winProbability;


  return {

    result:
      isWin
        ? "WIN"
        : "LOSS",

   profit:
  isWin
    ? randomProfitAmount()
    : -randomLossAmount(),

    previousTotal:
      totalTrades,

    previousWins:
      totalWins,

    previousLosses:
      totalLosses
  };

}


// ============================================================
// AUTH
// ============================================================

async function verifyFirebaseToken(
  req,
  res,
  next
) {

  try {

    if (
      !admin.apps.length
    ) {

      return res.status(500)
        .json({

          ok: false,

          message:
            "Firebase Admin is not configured."

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

      return res.status(401)
        .json({

          ok: false,

          message:
            "Authentication required."

        });

    }


    const token =
      header
        .slice(7)
        .trim();


    if (!token) {

      return res.status(401)
        .json({

          ok: false,

          message:
            "Invalid authentication token."

        });

    }


    req.user =
      await admin.auth()
        .verifyIdToken(
          token
        );


    next();

  } catch (error) {

    console.error(
      "Authentication error:",
      error.message
    );

    return res.status(401)
      .json({

        ok: false,

        message:
          "Authentication failed."

      });

  }

}


// ============================================================
// ADMIN AUTH
// ============================================================

async function requireAdmin(
  req,
  res,
  next
) {

  try {

    const email =
      String(
        req.user?.email ||
        ""
      )
        .trim()
        .toLowerCase();


    if (
      email !==
      ADMIN_EMAIL
    ) {

      return res.status(403)
        .json({

          ok: false,

          message:
            "Admin access denied."

        });

    }


    if (db) {

      const ref =
        db.collection(
          "users"
        )
          .doc(
            req.user.uid
          );


      const snap =
        await ref.get();


      if (
        snap.exists
      ) {

        const data =
          snap.data();


        if (
          data.active ===
          false
        ) {

          return res.status(403)
            .json({

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

    return res.status(403)
      .json({

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
    process.env
      .TELEGRAM_BOT_TOKEN;


  const chatId =
    process.env
      .TELEGRAM_CHAT_ID;


  if (
    !token ||
    !chatId
  ) {

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


  if (
    !response.ok
  ) {

    throw new Error(
      `Telegram error: ${response.status}`
    );

  }

}


async function telegramPhoto(
  file,
  caption
) {

  const token =
    process.env
      .TELEGRAM_BOT_TOKEN;


  const chatId =
    process.env
      .TELEGRAM_CHAT_ID;


  if (
    !token ||
    !chatId
  ) {

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
      "payment.jpg"
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


  if (
    !response.ok
  ) {

    throw new Error(
      `Telegram photo error: ${response.status}`
    );

  }

}


// ============================================================
// HEALTH
// ============================================================

app.get(
  "/",
  (req, res) => {

    res.json({

      ok: true,

      service:
        "TradeSim Pro API",

      status:
        "running",

      mode:
        "DEMO / VIRTUAL TRADING ONLY",

      tradeAmount:
        "₹100 - ₹500",

      session:
        "5 minutes",

      resultRange:
        "₹10 - ₹50",

      globalWinTarget:
        "45%",

      globalLossTarget:
        "55%",

      adminMargin:
        "₹5 - ₹12"

    });

  }
);


// ============================================================
// TRADE CONFIG
// ============================================================

app.get(
  "/api/trade/config",
  (req, res) => {

    res.json({

      ok: true,

      minAmount:
        MIN_TRADE_AMOUNT,

      maxAmount:
        MAX_TRADE_AMOUNT,

      sessionMinutes:
        TRADE_SESSION_MINUTES,

    resultMin:
  MIN_LOSS_RESULT,

resultMax:
  MAX_LOSS_RESULT,

      globalWinTarget:
        45,

      globalLossTarget:
        55,

      adminMarginMin:
        ADMIN_MARGIN_MIN,

      adminMarginMax:
        ADMIN_MARGIN_MAX

    });

  }
);


// ============================================================
// PAYMENT — ADD DEMO BALANCE
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

        return res.status(500)
          .json({

            ok: false,

            message:
              "Firebase backend is not configured."

          });

      }


      const userId =
        req.user.uid;


      const amount =
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
          amount,
          1,
          1000000
        )
      ) {

        return res.status(400)
          .json({

            ok: false,

            message:
              "Invalid payment amount."

          });

      }


      if (
        utr.length < 4
      ) {

        return res.status(400)
          .json({

            ok: false,

            message:
              "UTR / transaction ID is required."

          });

      }


      if (
        !req.file
      ) {

        return res.status(400)
          .json({

            ok: false,

            message:
              "Payment screenshot is required."

          });

      }


      const userRef =
        db.collection(
          "users"
        )
          .doc(
            userId
          );


      const userSnap =
        await userRef.get();


      if (
        !userSnap.exists
      ) {

        return res.status(404)
          .json({

            ok: false,

            message:
              "User account not found."

          });

      }


      const userData =
        userSnap.data();


      if (
        userData.active ===
        false
      ) {

        return res.status(403)
          .json({

            ok: false,

            message:
              "User account is disabled."

          });

      }


      const requestRef =
        db.collection(
          "topupRequests"
        )
          .doc();


      await requestRef.set({

        userId,

        userName:
          cleanString(
            req.body.userName ||
            userData.name ||
            "Trader",
            100
          ),

        userEmail:
          cleanString(
            req.body.userEmail ||
            userData.email ||
            req.user.email ||
            "",
            150
          ),

        amount:
          roundMoney(
            amount
          ),

        utr,

        status:
          "PENDING",

        screenshotSentToTelegram:
          false,

        createdAt:
          serverTimestamp()

      });


      try {

        await telegramPhoto(
          req.file,

          `
<b>💰 NEW DEMO BALANCE REQUEST</b>

👤 <b>User:</b> ${escapeHtml(
            req.body.userName ||
            userData.name ||
            "Trader"
          )}

📧 <b>Email:</b> ${escapeHtml(
            req.body.userEmail ||
            userData.email ||
            req.user.email ||
            ""
          )}

💵 <b>Amount:</b> ₹${money(
            amount
          )}

🔢 <b>UTR:</b> ${escapeHtml(
            utr
          )}

🆔 <b>Request:</b>
<code>${requestRef.id}</code>

⏳ <b>Status:</b> PENDING
`
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
          "Demo balance request submitted successfully.",

        requestId:
          requestRef.id

      });


    } catch (error) {

      console.error(
        "Add balance error:",
        error
      );


      return res.status(500)
        .json({

          ok: false,

          message:
            error.message ||
            "Could not submit request."

        });

    }

  }
);


// ============================================================
// WITHDRAWAL
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

        return res.status(500)
          .json({

            ok: false,

            message:
              "Firebase backend is not configured."

          });

      }


      const userId =
        req.user.uid;


      const amount =
        Number(
          req.body.amount
        );


      const upiId =
        cleanString(
          req.body.upiId,
          100
        );


      const MIN_WITHDRAWAL =
        200;


      if (
        !isValidAmount(
          amount,
          MIN_WITHDRAWAL,
          1000000
        )
      ) {

        return res.status(400)
          .json({

            ok: false,

            message:
              `Minimum withdrawal is ₹${MIN_WITHDRAWAL}.`

          });

      }


      const upiRegex =
        /^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/;


      if (
        !upiRegex.test(
          upiId
        )
      ) {

        return res.status(400)
          .json({

            ok: false,

            message:
              "Please enter a valid UPI ID."

          });

      }


      const userRef =
        db.collection(
          "users"
        )
          .doc(
            userId
          );


      const userSnap =
        await userRef.get();


      if (
        !userSnap.exists
      ) {

        return res.status(404)
          .json({

            ok: false,

            message:
              "User account not found."

          });

      }


      const userData =
        userSnap.data();


      if (
        userData.active ===
        false
      ) {

        return res.status(403)
          .json({

            ok: false,

            message:
              "User account is disabled."

          });

      }


      const balance =
        Number(
          userData.balance ||
          0
        );


      if (
        balance < amount
      ) {

        return res.status(400)
          .json({

            ok: false,

            message:
              "Insufficient virtual balance."

          });

      }


      if (
        balance -
        amount <
        100
      ) {

        return res.status(400)
          .json({

            ok: false,

            message:
              "You must keep at least ₹100 in your demo wallet."

          });

      }


      const requestRef =
        db.collection(
          "withdrawalRequests"
        )
          .doc();


      await requestRef.set({

        userId,

        userName:
          cleanString(
            userData.name ||
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

        amount:
          roundMoney(
            amount
          ),

        upiId,

        status:
          "PENDING",

        createdAt:
          serverTimestamp()

      });


      try {

        await telegramMessage(
          `
<b>🏦 NEW DEMO WITHDRAWAL</b>

👤 <b>User:</b> ${escapeHtml(
            userData.name ||
            "Trader"
          )}

📧 <b>Email:</b> ${escapeHtml(
            userData.email ||
            req.user.email ||
            ""
          )}

💵 <b>Amount:</b> ₹${money(
            amount
          )}

💳 <b>UPI:</b>
<code>${escapeHtml(
            upiId
          )}</code>

🆔 <b>Request:</b>
<code>${requestRef.id}</code>

⏳ <b>Status:</b> PENDING
`
        );

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
          "Demo withdrawal request submitted successfully.",

        requestId:
          requestRef.id

      });


    } catch (error) {

      console.error(
        "Withdrawal error:",
        error
      );


      return res.status(500)
        .json({

          ok: false,

          message:
            error.message ||
            "Could not submit withdrawal."

        });

    }

  }
);


// ============================================================
// ADMIN — PAYMENT REQUEST STATUS
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

        return res.status(500)
          .json({

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
          50
        )
          .toLowerCase();


      const status =
        cleanString(
          req.body.status,
          20
        )
          .toUpperCase();


      if (!requestId) {

        return res.status(400)
          .json({

            ok: false,

            message:
              "Request ID is required."

          });

      }


      if (
        ![
          "APPROVED",
          "REJECTED"
        ].includes(
          status
        )
      ) {

        return res.status(400)
          .json({

            ok: false,

            message:
              "Invalid status."

          });

      }


      const collectionName =
        type ===
          "withdrawal" ||
        type ===
          "withdrawalrequests"

          ? "withdrawalRequests"

          : "topupRequests";


      const requestRef =
        db.collection(
          collectionName
        )
          .doc(
            requestId
          );


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


          const userId =
            cleanString(
              request.userId,
              150
            );


          const amount =
            Number(
              request.amount
            );


          const userRef =
            db.collection(
              "users"
            )
              .doc(
                userId
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


          const currentBalance =
            roundMoney(
              userSnap
                .data()
                .balance ||
              0
            );


          // --------------------------------------------------
          // REJECT
          // --------------------------------------------------

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
                  serverTimestamp(),

                processedBy:
                  req.user.uid

              }
            );


            return;

          }


          // --------------------------------------------------
          // TOPUP
          // --------------------------------------------------

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
                  serverTimestamp(),

                processedBy:
                  req.user.uid

              }
            );


            const walletRef =
              db.collection(
                "walletTransactions"
              )
                .doc();


            transaction.set(
              walletRef,
              {

                userId,

                type:
                  "DEMO_TOPUP",

                amount,

                balanceBefore:
                  currentBalance,

                balanceAfter:
                  newBalance,

                createdAt:
                  serverTimestamp(),

                note:
                  "Admin approved demo balance"

              }
            );


            return;

          }


          // --------------------------------------------------
          // WITHDRAWAL
          // --------------------------------------------------

          if (
            collectionName ===
            "withdrawalRequests"
          ) {

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
                  serverTimestamp(),

                processedBy:
                  req.user.uid

              }
            );


            const walletRef =
              db.collection(
                "walletTransactions"
              )
                .doc();


            transaction.set(
              walletRef,
              {

                userId,

                type:
                  "WITHDRAWAL",

                amount,

                balanceBefore:
                  currentBalance,

                balanceAfter:
                  newBalance,

                createdAt:
                  serverTimestamp(),

                note:
                  "Admin approved demo withdrawal"

              }
            );

          }

        }
      );


      return res.json({

        ok: true,

        message:
          `Request ${status.toLowerCase()}.`

      });


    } catch (error) {

      console.error(
        "Admin request error:",
        error
      );


      return res.status(400)
        .json({

          ok: false,

          message:
            error.message ||
            "Could not update request."

        });

    }

  }
);


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

        return res.status(500)
          .json({

            ok: false,

            message:
              "Firebase backend is not configured."

          });

      }


      const userId =
        req.user.uid;


      const side =
        String(
          req.body.side ||
          ""
        )
          .trim()
          .toUpperCase();


      const amount =
        Number(
          req.body.amount
        );


      // ------------------------------------------------------
      // Validate side
      // ------------------------------------------------------

      if (
        side !== "BUY" &&
        side !== "SELL"
      ) {

        return res.status(400)
          .json({

            ok: false,

            message:
              "Invalid trade side."

          });

      }


      // ------------------------------------------------------
      // Validate amount
      // ------------------------------------------------------

      if (
        !isValidAmount(
          amount,
          MIN_TRADE_AMOUNT,
          MAX_TRADE_AMOUNT
        )
      ) {

        return res.status(400)
          .json({

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
        db.collection(
          "users"
        )
          .doc(
            userId
          );


      const tradeRef =
        db.collection(
          "trades"
        )
          .doc();


      // ------------------------------------------------------
      // GLOBAL OUTCOME
      // ------------------------------------------------------
      //
      // Result is decided on server.
      //
      // It is NOT based on:
      //
      // userId
      // email
      // previous personal win rate
      // frontend
      //
      // It uses GLOBAL simulator history.
      // ------------------------------------------------------

      const outcome =
        await generateGlobalTradeOutcome();


      const cleanProfit =
        roundMoney(
          outcome.profit
        );


      const adminMargin =
        randomAdminMargin();


      const settleAt =
        admin.firestore.Timestamp
          .fromMillis(
            Date.now() +
            TRADE_SESSION_MS
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
            userData.active ===
            false
          ) {

            throw new Error(
              "Your account is disabled."
            );

          }


          const balance =
            roundMoney(
              userData.balance ||
              0
            );


          if (
            balance <
            cleanAmount
          ) {

            throw new Error(
              "Insufficient demo balance."
            );

          }


          const newBalance =
            roundMoney(
              balance -
              cleanAmount
            );


          // --------------------------------------------------
          // Deduct stake
          // --------------------------------------------------

          transaction.update(
            userRef,
            {

              balance:
                newBalance

            }
          );


          // --------------------------------------------------
          // CREATE TRADE
          // --------------------------------------------------

          transaction.set(
            tradeRef,
            {

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

              side,

              amount:
                cleanAmount,

              status:
                "OPEN",

              result:
                outcome.result,

              profit:
                cleanProfit,

              adminMargin,

              globalWinTarget:
                45,

              globalLossTarget:
                55,

              previousGlobalTrades:
                outcome.previousTotal,

              previousGlobalWins:
                outcome.previousWins,

              previousGlobalLosses:
                outcome.previousLosses,

              sessionMinutes:
                TRADE_SESSION_MINUTES,

              createdAt:
                serverTimestamp(),

              settleAt,

              balanceBefore:
                balance,

              balanceAfterOpen:
                newBalance,

              settledAt:
                null

            }
          );


          // --------------------------------------------------
          // WALLET HISTORY
          // --------------------------------------------------

          const walletRef =
            db.collection(
              "walletTransactions"
            )
              .doc();


          transaction.set(
            walletRef,
            {

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
                serverTimestamp(),

              note:
                "Demo trade stake deducted"

            }
          );


          // --------------------------------------------------
          // GLOBAL STATS
          //
          // IMPORTANT:
          //
          // We count this as an OPEN trade here.
          // Win/loss totals are updated only at settlement.
          // --------------------------------------------------

          const statsRef =
            db.collection(
              "simulatorStats"
            )
              .doc(
                "global"
              );


          const increment =
            admin.firestore
              .FieldValue
              .increment;


          transaction.set(
            statsRef,
            {

              totalTrades:
                increment(1),

              openTrades:
                increment(1),

              totalAdminMargin:
                increment(
                  adminMargin
                ),

              updatedAt:
                serverTimestamp(),

              createdAt:
                serverTimestamp()

            },
            {
              merge:
                true
            }
          );

        }
      );


      return res.json({

        ok: true,

        message:
          "Demo trade opened successfully.",

        tradeId:
          tradeRef.id,

        deducted:
          cleanAmount,

        settleAt:
          settleAt.toMillis(),

        sessionMinutes:
          TRADE_SESSION_MINUTES

      });


    } catch (error) {

      console.error(
        "Open trade error:",
        error
      );


      return res.status(400)
        .json({

          ok: false,

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
    return false;
  }


  const tradeRef =
    db.collection(
      "trades"
    )
      .doc(
        tradeId
      );


  let settled =
    false;


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


      // Already settled
      if (
        trade.status !==
        "OPEN"
      ) {

        return;

      }


      // ------------------------------------------------------
      // Server-side time check
      // ------------------------------------------------------

      const settleTime =
        trade.settleAt
          ?.toMillis?.();


      if (
        !settleTime ||
        settleTime >
        Date.now()
      ) {

        return;

      }


      const userId =
        cleanString(
          trade.userId,
          150
        );


      const amount =
        roundMoney(
          trade.amount
        );


      const profit =
        roundMoney(
          trade.profit
        );


      const adminMargin =
        roundMoney(
          trade.adminMargin
        );


      const userRef =
        db.collection(
          "users"
        )
          .doc(
            userId
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


      const currentBalance =
        roundMoney(
          userSnap
            .data()
            .balance ||
          0
        );


      // ------------------------------------------------------
      // SETTLEMENT
      //
      // Stake was already deducted.
      //
      // WIN:
      // balance + stake + profit
      //
      // LOSS:
      // balance + stake - loss
      //
      // Because profit is negative for LOSS,
      // the same formula works.
      // ------------------------------------------------------

      const finalBalance =
        roundMoney(
          currentBalance +
          amount +
          profit
        );


      // ------------------------------------------------------
      // UPDATE USER
      // ------------------------------------------------------

      transaction.update(
        userRef,
        {

          balance:
            finalBalance

        }
      );


      // ------------------------------------------------------
      // CLOSE TRADE
      // ------------------------------------------------------

      transaction.update(
        tradeRef,
        {

          status:
            "SETTLED",

          settledAt:
            serverTimestamp(),

          balanceBeforeSettlement:
            currentBalance,

          balanceAfterSettlement:
            finalBalance

        }
      );


      // ------------------------------------------------------
      // WALLET HISTORY
      // ------------------------------------------------------

      const walletRef =
        db.collection(
          "walletTransactions"
        )
          .doc();


      transaction.set(
        walletRef,
        {

          userId,

          tradeId,

          type:
            "TRADE_SETTLEMENT",

          result:
            trade.result,

          stake:
            amount,

          profit,

          adminMargin,

          balanceBefore:
            currentBalance,

          balanceAfter:
            finalBalance,

          amount:
            roundMoney(
              amount +
              profit
            ),

          createdAt:
            serverTimestamp(),

          note:
            trade.result ===
            "WIN"

              ? "Demo trade profit settlement"

              : "Demo trade loss settlement"

        }
      );


      // ------------------------------------------------------
      // GLOBAL STATS
      // ------------------------------------------------------

      const statsRef =
        db.collection(
          "simulatorStats"
        )
          .doc(
            "global"
          );


      const increment =
        admin.firestore
          .FieldValue
          .increment;


      const updateData = {

        openTrades:
          increment(-1),

        settledTrades:
          increment(1),

        updatedAt:
          serverTimestamp()

      };


      if (
        trade.result ===
        "WIN"
      ) {

        updateData.totalWins =
          increment(1);


        updateData.totalWinAmount =
          increment(
            Math.abs(
              profit
            )
          );

      } else {

        updateData.totalLosses =
          increment(1);


        updateData.totalLossAmount =
          increment(
            Math.abs(
              profit
            )
          );

      }


      transaction.set(
        statsRef,
        updateData,
        {
          merge:
            true
        }
      );


      settled =
        true;

    }
  );


  return settled;

}


// ============================================================
// SETTLE EXPIRED TRADES
// ============================================================

async function settleExpiredTrades() {

  if (!db) {
    return;
  }


  try {

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

      const trade =
        tradeDoc.data();


      const settleTime =
        trade.settleAt
          ?.toMillis?.();


      if (!settleTime) {
        continue;
      }


      if (
        settleTime >
        now
      ) {

        continue;

      }


      try {

        const settled =
          await settleTrade(
            tradeDoc.id
          );


        if (
          settled
        ) {

          console.log(
            "Trade settled:",
            tradeDoc.id
          );

        }

      } catch (
        error
      ) {

        console.error(
          "Settlement failed:",
          tradeDoc.id,
          error.message
        );

      }

    }

  } catch (
    error
  ) {

    console.error(
      "Settlement worker error:",
      error.message
    );

  }

}


// ============================================================
// SETTLEMENT WORKER
// ============================================================
//
// Every 10 seconds checks expired trades.
// ============================================================

setInterval(
  () => {

    settleExpiredTrades()
      .catch(
        error => {

          console.error(
            "Worker error:",
            error.message
          );

        }
      );

  },
  10 * 1000
);


// ============================================================
// MANUAL USER SETTLEMENT
// ============================================================
//
// Useful when Render/server sleeps.
// Frontend can call this endpoint after 5 minutes.
// ============================================================

app.post(
  "/api/trade/settle-due",

  verifyFirebaseToken,

  async (
    req,
    res
  ) => {

    try {

      if (!db) {

        return res.status(500)
          .json({

            ok: false,

            message:
              "Firebase backend is not configured."

          });

      }


      const snapshot =
        await db
          .collection(
            "trades"
          )
          .where(
            "userId",
            "==",
            req.user.uid
          )
          .limit(100)
          .get();


      let settledCount =
        0;


      const now =
        Date.now();


      for (
        const tradeDoc
        of snapshot.docs
      ) {

        const trade =
          tradeDoc.data();


        if (
          trade.status !==
          "OPEN"
        ) {

          continue;

        }


        const settleTime =
          trade.settleAt
            ?.toMillis?.();


        if (
          !settleTime ||
          settleTime >
          now
        ) {

          continue;

        }


        const settled =
          await settleTrade(
            tradeDoc.id
          );


        if (
          settled
        ) {

          settledCount++;

        }

      }


      return res.json({

        ok: true,

        settled:
          settledCount

      });


    } catch (
      error
    ) {

      console.error(
        "Manual settlement error:",
        error
      );


      return res.status(500)
        .json({

          ok: false,

          message:
            error.message ||
            "Settlement failed."

        });

    }

  }
);


// ============================================================
// ADMIN — GLOBAL TRADE STATS
// ============================================================

app.get(
  "/api/admin/trade-stats",

  verifyFirebaseToken,

  requireAdmin,

  async (
    req,
    res
  ) => {

    try {

      if (!db) {

        return res.status(500)
          .json({

            ok: false,

            message:
              "Firebase backend is not configured."

          });

      }


      // Settle expired trades first.
      await settleExpiredTrades();


      const snapshot =
        await db
          .collection(
            "trades"
          )
          .limit(1000)
          .get();


      let total =
        0;

      let settled =
        0;

      let open =
        0;

      let wins =
        0;

      let losses =
        0;

      let totalProfit =
        0;

      let totalLoss =
        0;

      let totalAdminMargin =
        0;


      for (
        const tradeDoc
        of snapshot.docs
      ) {

        const trade =
          tradeDoc.data();


        total++;


        if (
          trade.status ===
          "OPEN"
        ) {

          open++;

        }


        if (
          trade.status ===
          "SETTLED"
        ) {

          settled++;

        }


        const profit =
          Number(
            trade.profit ||
            0
          );


        if (
          profit > 0
        ) {

          wins++;

          totalProfit +=
            profit;

        }


        if (
          profit < 0
        ) {

          losses++;

          totalLoss +=
            Math.abs(
              profit
            );

        }


        totalAdminMargin +=
          Number(
            trade.adminMargin ||
            0
          );

      }


      const winRate =
        settled > 0

          ? roundMoney(
              (
                wins /
                settled
              ) *
              100
            )

          : 0;


      const lossRate =
        settled > 0

          ? roundMoney(
              (
                losses /
                settled
              ) *
              100
            )

          : 0;


      return res.json({

        ok: true,

        totalTrades:
          total,

        openTrades:
          open,

        settledTrades:
          settled,

        wins,

        losses,

        winRate,

        lossRate,

        targetWinRate:
          45,

        targetLossRate:
          55,

        virtualProfit:
          roundMoney(
            totalProfit
          ),

        virtualLoss:
          roundMoney(
            totalLoss
          ),

        simulatedAdminMargin:
          roundMoney(
            totalAdminMargin
          ),

        adminMarginMin:
          ADMIN_MARGIN_MIN,

        adminMarginMax:
          ADMIN_MARGIN_MAX

      });


    } catch (
      error
    ) {

      console.error(
        "Admin stats error:",
        error
      );


      return res.status(500)
        .json({

          ok: false,

          message:
            error.message ||
            "Could not load stats."

        });

    }

  }
);


// ============================================================
// ADMIN — GLOBAL SIMULATOR STATS
// ============================================================

app.get(
  "/api/admin/simulator-stats",

  verifyFirebaseToken,

  requireAdmin,

  async (
    req,
    res
  ) => {

    try {

      if (!db) {

        return res.status(500)
          .json({

            ok: false,

            message:
              "Firebase backend is not configured."

          });

      }


      const ref =
        db.collection(
          "simulatorStats"
        )
          .doc(
            "global"
          );


      const snap =
        await ref.get();


      if (
        !snap.exists
      ) {

        return res.json({

          ok: true,

          totalTrades:
            0,

          openTrades:
            0,

          settledTrades:
            0,

          totalWins:
            0,

          totalLosses:
            0,

          totalWinAmount:
            0,

          totalLossAmount:
            0,

          totalAdminMargin:
            0,

          targetWinRate:
            45,

          targetLossRate:
            55

        });

      }


      const data =
        snap.data();


      const settledTrades =
        Number(
          data.settledTrades ||
          0
        );


      const totalWins =
        Number(
          data.totalWins ||
          0
        );


      const totalLosses =
        Number(
          data.totalLosses ||
          0
        );


      const actualWinRate =
        settledTrades > 0

          ? roundMoney(
              (
                totalWins /
                settledTrades
              ) *
              100
            )

          : 0;


      const actualLossRate =
        settledTrades > 0

          ? roundMoney(
              (
                totalLosses /
                settledTrades
              ) *
              100
            )

          : 0;


      return res.json({

        ok: true,

        ...data,

        actualWinRate,

        actualLossRate,

        targetWinRate:
          45,

        targetLossRate:
          55

      });


    } catch (
      error
    ) {

      console.error(
        "Simulator stats error:",
        error
      );


      return res.status(500)
        .json({

          ok: false,

          message:
            error.message ||
            "Could not load simulator stats."

        });

    }

  }
);


// ============================================================
// ADMIN — GLOBAL OUTCOME PREVIEW
// ============================================================
//
// This endpoint lets admin see the current global
// distribution before opening another trade.
// ============================================================

app.get(
  "/api/admin/outcome-status",

  verifyFirebaseToken,

  requireAdmin,

  async (
    req,
    res
  ) => {

    try {

      if (!db) {

        return res.status(500)
          .json({

            ok: false,

            message:
              "Firebase backend is not configured."

          });

      }


      const ref =
        db.collection(
          "simulatorStats"
        )
          .doc(
            "global"
          );


      const snap =
        await ref.get();


      let total =
        0;

      let wins =
        0;

      let losses =
        0;


      if (
        snap.exists
      ) {

        const data =
          snap.data();


        total =
          Number(
            data.settledTrades ||
            0
          );


        wins =
          Number(
            data.totalWins ||
            0
          );


        losses =
          Number(
            data.totalLosses ||
            0
          );

      }


      const winRate =
        total > 0

          ? roundMoney(
              (
                wins /
                total
              ) *
              100
            )

          : 0;


      const lossRate =
        total > 0

          ? roundMoney(
              (
                losses /
                total
              ) *
              100
            )

          : 0;


      return res.json({

        ok: true,

        totalSettledTrades:
          total,

        wins,

        losses,

        currentWinRate:
          winRate,

        currentLossRate:
          lossRate,

        targetWinRate:
          45,

        targetLossRate:
          55

      });


    } catch (
      error
    ) {

      console.error(
        "Outcome status error:",
        error
      );


      return res.status(500)
        .json({

          ok: false,

          message:
            "Could not load outcome status."

        });

    }

  }
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


    return res.status(400)
      .json({

        ok: false,

        message:
          error?.message ||
          "Request failed."

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
  `Result range: ₹${MIN_LOSS_RESULT} - ₹${MAX_LOSS_RESULT}`
);

    console.log(
      `Global target: 45% WIN / 55% LOSS`
    );

    console.log(
      `Admin simulated margin: ₹${ADMIN_MARGIN_MIN} - ₹${ADMIN_MARGIN_MAX}`
    );

    console.log(
      "Mode: DEMO / VIRTUAL TRADING ONLY"
    );

  }
);