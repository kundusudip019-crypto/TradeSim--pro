import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({
  origin: true,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

/* =====================================================
   FIREBASE ADMIN
===================================================== */

let db = null;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    db = admin.firestore();

    console.log("Firebase Admin connected.");
  } else {
    console.log("Firebase service account not configured yet.");
  }
} catch (error) {
  console.error("Firebase initialization error:", error.message);
}


/* =====================================================
   MULTER
   Screenshot temporarily stored in memory.
   No Firebase Storage required.
===================================================== */

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 8 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(
        new Error("Only JPG, PNG or WEBP screenshots are allowed.")
      );
    }

    cb(null, true);
  }
});


/* =====================================================
   TELEGRAM
===================================================== */

async function telegramMessage(text) {

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("Telegram credentials not configured.");
    return;
  }

  const url =
    `https://api.telegram.org/bot${token}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML"
    })
  });

  if (!response.ok) {
    throw new Error(
      `Telegram error: ${response.status}`
    );
  }
}


async function telegramPhoto(file, caption) {

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("Telegram credentials not configured.");
    return;
  }

  const form = new FormData();

  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");

  const blob = new Blob(
    [file.buffer],
    { type: file.mimetype }
  );

  form.append(
    "photo",
    blob,
    file.originalname || "payment-screenshot.jpg"
  );

  const url =
    `https://api.telegram.org/bot${token}/sendPhoto`;

  const response = await fetch(url, {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    throw new Error(
      `Telegram photo error: ${response.status}`
    );
  }
}


/* =====================================================
   HEALTH CHECK
===================================================== */

app.get("/", (req, res) => {

  res.json({
    ok: true,
    service: "TradeSim Pro Payment Server",
    status: "running"
  });

});


/* =====================================================
   ADD BALANCE REQUEST
===================================================== */

app.post(
  "/api/payment/add-balance",
  upload.single("screenshot"),
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          ok: false,
          message: "Firebase backend is not configured."
        });
      }

      const {
        userId,
        userName,
        userEmail,
        amount,
        utr
      } = req.body;


      const numericAmount = Number(amount);


      if (!userId) {
        return res.status(400).json({
          ok: false,
          message: "User ID is required."
        });
      }


      if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
      ) {
        return res.status(400).json({
          ok: false,
          message: "Invalid payment amount."
        });
      }


      if (!utr || String(utr).trim().length < 4) {
        return res.status(400).json({
          ok: false,
          message: "UTR / transaction ID is required."
        });
      }


      if (!req.file) {
        return res.status(400).json({
          ok: false,
          message: "Payment screenshot is required."
        });
      }


      /* ---------------------------------------------
         Save request in Firestore
      --------------------------------------------- */

      const requestRef =
        db.collection("topupRequests").doc();


      await requestRef.set({

        userId,

        userName:
          String(userName || "").slice(0, 100),

        userEmail:
          String(userEmail || "").slice(0, 150),

        amount:
          Number(numericAmount.toFixed(2)),

        utr:
          String(utr).trim().slice(0, 100),

        status:
          "PENDING",

        screenshotSentToTelegram:
          true,

        createdAt:
          admin.firestore.FieldValue.serverTimestamp()

      });


      /* ---------------------------------------------
         Telegram notification
      --------------------------------------------- */

      const caption = `
<b>💰 NEW ADD BALANCE REQUEST</b>

👤 <b>User:</b> ${escapeHtml(userName || "Unknown")}
📧 <b>Email:</b> ${escapeHtml(userEmail || "Unknown")}
💵 <b>Amount:</b> ₹${numericAmount.toFixed(2)}
🔢 <b>UTR:</b> ${escapeHtml(utr)}

🆔 <b>Request ID:</b>
<code>${requestRef.id}</code>

⏳ <b>Status:</b> PENDING

Please verify the payment before approving.
`;


      await telegramPhoto(
        req.file,
        caption
      );


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


/* =====================================================
   WITHDRAWAL REQUEST
===================================================== */

app.post(
  "/api/payment/withdraw",
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          ok: false,
          message: "Firebase backend is not configured."
        });
      }


      const {
        userId,
        userName,
        userEmail,
        amount,
        upiId
      } = req.body;


      const numericAmount =
        Number(amount);


      const cleanUpi =
        String(upiId || "").trim();


      if (!userId) {
        return res.status(400).json({
          ok: false,
          message: "User ID is required."
        });
      }


      if (
        !Number.isFinite(numericAmount) ||
        numericAmount < 50
      ) {
        return res.status(400).json({
          ok: false,
          message: "Minimum withdrawal is ₹50."
        });
      }


      if (
        cleanUpi.length < 3 ||
        cleanUpi.length > 100
      ) {
        return res.status(400).json({
          ok: false,
          message: "Please enter a valid UPI ID."
        });
      }


      /* ---------------------------------------------
         Check user wallet
      --------------------------------------------- */

      const userRef =
        db.collection("users").doc(userId);

      const userSnap =
        await userRef.get();


      if (!userSnap.exists) {
        return res.status(404).json({
          ok: false,
          message: "User account not found."
        });
      }


      const userData =
        userSnap.data();


      const balance =
        Number(userData.balance || 0);


      if (balance < numericAmount) {
        return res.status(400).json({
          ok: false,
          message: "Insufficient virtual balance."
        });
      }


      if (balance - numericAmount < 100) {
        return res.status(400).json({
          ok: false,
          message:
            "You must keep at least ₹100 in your wallet."
        });
      }


      /* ---------------------------------------------
         Create withdrawal request
      --------------------------------------------- */

      const requestRef =
        db.collection("withdrawalRequests").doc();


      await requestRef.set({

        userId,

        userName:
          String(userName || userData.name || "")
            .slice(0, 100),

        userEmail:
          String(
            userEmail ||
            userData.email ||
            ""
          ).slice(0, 150),

        amount:
          Number(numericAmount.toFixed(2)),

        upiId:
          cleanUpi,

        status:
          "PENDING",

        createdAt:
          admin.firestore.FieldValue.serverTimestamp()

      });


      /* ---------------------------------------------
         Telegram notification
      --------------------------------------------- */

      const text = `
<b>🏦 NEW WITHDRAWAL REQUEST</b>

👤 <b>User:</b> ${escapeHtml(userName || userData.name || "Unknown")}
📧 <b>Email:</b> ${escapeHtml(userEmail || userData.email || "Unknown")}
💵 <b>Amount:</b> ₹${numericAmount.toFixed(2)}
💳 <b>UPI ID:</b> <code>${escapeHtml(cleanUpi)}</code>

🆔 <b>Request ID:</b>
<code>${requestRef.id}</code>

⏳ <b>Status:</b> PENDING

Admin should manually verify/pay the withdrawal before marking it successful.
`;


      await telegramMessage(text);


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


/* =====================================================
   ADMIN REQUEST STATUS
   Approve / Reject will be protected later.
===================================================== */

app.post(
  "/api/admin/request-status",
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          ok: false,
          message: "Firebase backend is not configured."
        });
      }


      const {
        requestId,
        type,
        status
      } = req.body;


      if (!requestId) {
        return res.status(400).json({
          ok: false,
          message: "Request ID is required."
        });
      }


      if (
        !["APPROVED", "REJECTED"].includes(status)
      ) {
        return res.status(400).json({
          ok: false,
          message: "Invalid status."
        });
      }


      const collectionName =
        type === "withdrawal"
          ? "withdrawalRequests"
          : "topupRequests";


      const requestRef =
        db.collection(collectionName).doc(requestId);


      const snap =
        await requestRef.get();


      if (!snap.exists) {
        return res.status(404).json({
          ok: false,
          message: "Request not found."
        });
      }


      const request =
        snap.data();


      if (request.status !== "PENDING") {
        return res.status(400).json({
          ok: false,
          message:
            "This request has already been processed."
        });
      }


      /*
       * IMPORTANT:
       * Actual wallet mutation will be added
       * after admin authentication is connected.
       */

      await requestRef.update({

        status,

        reviewedAt:
          admin.firestore.FieldValue.serverTimestamp()

      });


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


      return res.status(500).json({

        ok: false,

        message:
          error.message ||
          "Could not update request."

      });

    }

  }
);


/* =====================================================
   HTML ESCAPE
===================================================== */

function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =====================================================
   ERROR HANDLER
===================================================== */

app.use(
  (error, req, res, next) => {

    console.error(error);

    res.status(400).json({

      ok: false,

      message:
        error.message ||
        "Request failed."

    });

  }
);


/* =====================================================
   START SERVER
===================================================== */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `TradeSim payment server running on port ${PORT}`
    );

  }
);