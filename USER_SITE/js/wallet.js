/* =========================================================
   TradeSim Pro - User Wallet
   Firebase + Dynamic UPI QR + Payment Server
========================================================= */

import {
  auth,
  db
} from "./firebase.js";

import {
  onAuthStateChanged,
  signOut,
  getIdToken
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


/* =========================================================
   CONFIG
========================================================= */

const PAYMENT_SERVER_URL =
  "https://tradesim-pro.onrender.com";

const PAYMENT_UPI_ID =
  "9992693790@fam";

const PAYMENT_NAME =
  "TradeSim Pro";

const MIN_WITHDRAWAL =
  50;

const MIN_REMAINING_BALANCE =
  100;


/* =========================================================
   HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}


function money(value) {

  const amount =
    Number(value || 0);

  return "₹" + amount.toFixed(2);

}


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function getDateMs(value) {

  if (!value) {
    return 0;
  }

  if (
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (
    typeof value === "object" &&
    typeof value.seconds === "number"
  ) {

    return (
      value.seconds * 1000 +
      Math.floor(
        (value.nanoseconds || 0) / 1000000
      )
    );

  }

  const parsed =
    new Date(value).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : 0;

}


function formatDate(value) {

  const ms =
    getDateMs(value);

  if (!ms) {
    return "Processing...";
  }

  return new Date(ms)
    .toLocaleString();

}


function showMessage(
  element,
  text,
  success = false
) {

  if (!element) {
    return;
  }

  element.textContent =
    text;

  element.className =
    success
      ? "msg ok"
      : "msg";

}


/* =========================================================
   CURRENT USER
========================================================= */

let me = null;

let unsubscribeUser = null;
let unsubscribeTopups = null;
let unsubscribeWithdrawals = null;

let topupRequests = [];
let withdrawalRequests = [];


/* =========================================================
   PAYMENT STATE
========================================================= */

let currentPaymentAmount = 0;
let currentPaymentReference = "";


/* =========================================================
   PAYMENT REFERENCE
========================================================= */

function createPaymentReference() {

  const random =
    Math.random()
      .toString(36)
      .slice(2, 9)
      .toUpperCase();

  const time =
    Date.now()
      .toString(36)
      .toUpperCase();

  return (
    "TS-" +
    time +
    "-" +
    random
  );

}


/* =========================================================
   CREATE UPI URL
========================================================= */

function createUpiUrl(
  amount,
  reference
) {

  const params =
    new URLSearchParams();

  params.set(
    "pa",
    PAYMENT_UPI_ID
  );

  params.set(
    "pn",
    PAYMENT_NAME
  );

  params.set(
    "am",
    Number(amount).toFixed(2)
  );

  params.set(
    "cu",
    "INR"
  );

  params.set(
    "tn",
    reference
  );

  return (
    "upi://pay?" +
    params.toString()
  );

}


/* =========================================================
   GENERATE QR
========================================================= */

function generatePaymentQr() {

  const input =
    $("topupAmount");

  const paymentBox =
    $("paymentBox");

  const qrWrap =
    $("qrWrap");

  const qrImage =
    $("upiQr");

  const qrLoading =
    $("qrLoading");

  const qrAmount =
    $("qrAmount");

  const payButton =
    $("payWithUpi");

  const paymentFields =
    $("paymentSubmitForm");

  const referenceBox =
    $("paymentReference");

  const output =
    $("topupMsg");


  /* -------------------------------------------------------
     VALIDATE AMOUNT
  ------------------------------------------------------- */

  const amount =
    Number(input?.value);


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    showMessage(
      output,
      "Enter a valid positive amount.",
      false
    );

    return;
  }


  const cleanAmount =
    Number(
      amount.toFixed(2)
    );


  /* -------------------------------------------------------
     CREATE PAYMENT STATE
  ------------------------------------------------------- */

  currentPaymentAmount =
    cleanAmount;

  currentPaymentReference =
    createPaymentReference();


  const upiUrl =
    createUpiUrl(
      cleanAmount,
      currentPaymentReference
    );


  console.log(
    "UPI URL:",
    upiUrl
  );


  /* -------------------------------------------------------
     SHOW PAYMENT BOX
  ------------------------------------------------------- */

  if (paymentBox) {
    paymentBox.style.display =
      "block";
  }

  if (qrWrap) {
    qrWrap.classList.add("show");
  }

  if (paymentFields) {
    paymentFields.classList.add("show");
  }


  /* -------------------------------------------------------
     AMOUNT
  ------------------------------------------------------- */

  if (qrAmount) {

    qrAmount.textContent =
      money(cleanAmount);

  }


  /* -------------------------------------------------------
     REFERENCE
  ------------------------------------------------------- */

  if (referenceBox) {

    referenceBox.textContent =
      "Payment reference: " +
      currentPaymentReference;

  }


  /* -------------------------------------------------------
     UPI APP BUTTON
  ------------------------------------------------------- */

  if (payButton) {

    payButton.href =
      upiUrl;

    payButton.onclick =
      function () {

        console.log(
          "Opening UPI:",
          upiUrl
        );

      };

  }


  /* -------------------------------------------------------
     RESET OLD QR
  ------------------------------------------------------- */

  if (qrImage) {

    qrImage.removeAttribute(
      "src"
    );

    qrImage.style.display =
      "none";

  }


  if (qrLoading) {

    qrLoading.style.display =
      "block";

    qrLoading.textContent =
      "Generating QR...";

  }


  /* -------------------------------------------------------
     CHECK QR LIBRARY
  ------------------------------------------------------- */

  if (
    typeof QRCode === "undefined"
  ) {

    console.error(
      "QRCode library is not loaded."
    );

    if (qrLoading) {

      qrLoading.textContent =
        "QR library failed to load.";

    }

    showMessage(
      output,
      "QR library failed to load. Check your internet connection and refresh.",
      false
    );

    return;
  }


  /* -------------------------------------------------------
     TEMP QR CONTAINER
  ------------------------------------------------------- */

  const qrContainer =
    document.createElement("div");

  qrContainer.style.position =
    "fixed";

  qrContainer.style.left =
    "-100000px";

  qrContainer.style.top =
    "0";

  qrContainer.style.width =
    "230px";

  qrContainer.style.height =
    "230px";

  qrContainer.style.background =
    "#ffffff";

  document.body.appendChild(
    qrContainer
  );


  /* -------------------------------------------------------
     GENERATE QR
  ------------------------------------------------------- */

  try {

    new QRCode(
      qrContainer,
      {
        text:
          upiUrl,

        width:
          230,

        height:
          230,

        colorDark:
          "#000000",

        colorLight:
          "#ffffff",

        correctLevel:
          QRCode.CorrectLevel.M
      }
    );


  } catch (error) {

    console.error(
      "QR generation error:",
      error
    );

    qrContainer.remove();

    if (qrLoading) {

      qrLoading.textContent =
        "QR generation failed.";

    }

    showMessage(
      output,
      "Could not generate payment QR.",
      false
    );

    return;

  }


  /* -------------------------------------------------------
     WAIT FOR QR DOM
  ------------------------------------------------------- */

  setTimeout(
    () => {

      try {

        let qrSource = "";


        /*
         * qrcodejs normally creates
         * both canvas and image.
         *
         * Canvas is more reliable.
         */

        const canvas =
          qrContainer.querySelector(
            "canvas"
          );


        if (canvas) {

          try {

            qrSource =
              canvas.toDataURL(
                "image/png"
              );

          } catch (error) {

            console.warn(
              "Canvas conversion failed:",
              error
            );

          }

        }


        /*
         * Fallback to generated IMG.
         */

        if (!qrSource) {

          const generatedImage =
            qrContainer.querySelector(
              "img"
            );

          if (
            generatedImage?.src
          ) {

            qrSource =
              generatedImage.src;

          }

        }


        /* -------------------------------------------------
           PUT QR INTO REAL IMAGE
        ------------------------------------------------- */

        if (
          qrSource &&
          qrImage
        ) {

          qrImage.onload =
            function () {

              qrImage.style.display =
                "block";

              if (qrLoading) {

                qrLoading.style.display =
                  "none";

              }

            };


          qrImage.onerror =
            function () {

              console.error(
                "QR image failed to display."
              );

              qrImage.style.display =
                "none";

              if (qrLoading) {

                qrLoading.style.display =
                  "block";

                qrLoading.textContent =
                  "QR image could not be displayed.";

              }

            };


          qrImage.src =
            qrSource;

        } else {

          console.error(
            "No QR image/canvas found."
          );

          if (qrLoading) {

            qrLoading.textContent =
              "QR could not be generated.";

          }

        }


      } catch (error) {

        console.error(
          "QR processing error:",
          error
        );

        if (qrLoading) {

          qrLoading.textContent =
            "QR generation failed.";

        }

      } finally {

        qrContainer.remove();

      }

    },

    500
  );


  if (output) {

    output.textContent = "";

  }

}


/* =========================================================
   AUTH TOKEN
========================================================= */

async function getAuthToken() {

  const user =
    auth.currentUser;


  if (!user) {

    throw new Error(
      "Please login again."
    );

  }


  const token =
    await getIdToken(
      user,
      true
    );


  if (!token) {

    throw new Error(
      "Could not authenticate your account."
    );

  }


  return token;

}


/* =========================================================
   SERVER REQUEST
========================================================= */

async function serverRequest(
  endpoint,
  options = {}
) {

  const token =
    await getAuthToken();


  const headers =
    new Headers(
      options.headers || {}
    );


  headers.set(
    "Authorization",
    "Bearer " + token
  );


  const response =
    await fetch(
      PAYMENT_SERVER_URL +
      endpoint,
      {
        ...options,
        headers
      }
    );


  let result = null;


  try {

    result =
      await response.json();

  } catch {

    result = null;

  }


  if (!response.ok) {

    throw new Error(
      result?.message ||
      `Server error (${response.status}).`
    );

  }


  if (
    result &&
    result.ok === false
  ) {

    throw new Error(
      result.message ||
      "Request failed."
    );

  }


  return result;

}


/* =========================================================
   TEST PAYMENT SERVER
========================================================= */

async function testPaymentServer() {

  try {

    const response =
      await fetch(
        PAYMENT_SERVER_URL + "/",
        {
          method: "GET"
        }
      );


    if (!response.ok) {

      throw new Error(
        "Payment server returned an error."
      );

    }


    const result =
      await response.json();


    console.log(
      "Payment server connected:",
      result
    );


  } catch (error) {

    console.warn(
      "Payment server connection:",
      error.message
    );

  }

}


/* =========================================================
   SUBMIT TOP-UP
========================================================= */

async function submitPaymentRequest(
  event
) {

  event.preventDefault();


  const output =
    $("topupMsg");

  const button =
    $("submitPayment");


  const amount =
    currentPaymentAmount;

  const reference =
    currentPaymentReference;


  const utr =
    $("utr")
      ?.value
      ?.trim();


  const screenshot =
    $("paymentScreenshot")
      ?.files
      ?.[0];


  /* -------------------------------------------------------
     PAYMENT GENERATED?
  ------------------------------------------------------- */

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    showMessage(
      output,
      "Please generate the payment QR first.",
      false
    );

    return;
  }


  if (!reference) {

    showMessage(
      output,
      "Payment reference is missing. Generate the QR again.",
      false
    );

    return;
  }


  /* -------------------------------------------------------
     UTR
  ------------------------------------------------------- */

  if (
    !utr ||
    utr.length < 4
  ) {

    showMessage(
      output,
      "Enter a valid UTR / transaction ID.",
      false
    );

    return;
  }


  /* -------------------------------------------------------
     SCREENSHOT
  ------------------------------------------------------- */

  if (!screenshot) {

    showMessage(
      output,
      "Payment screenshot is required.",
      false
    );

    return;
  }


  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];


  if (
    !allowedTypes.includes(
      screenshot.type
    )
  ) {

    showMessage(
      output,
      "Only JPG, PNG or WEBP screenshots are allowed.",
      false
    );

    return;
  }


  if (
    screenshot.size >
    8 * 1024 * 1024
  ) {

    showMessage(
      output,
      "Screenshot must be smaller than 8 MB.",
      false
    );

    return;
  }


  if (!me?.uid) {

    showMessage(
      output,
      "Please login again.",
      false
    );

    return;
  }


  /* -------------------------------------------------------
     SUBMIT
  ------------------------------------------------------- */

  try {

    if (button) {

      button.disabled =
        true;

      button.textContent =
        "Submitting...";

    }


    const formData =
      new FormData();


    formData.append(
      "userId",
      me.uid
    );


    formData.append(
      "userName",
      me.name ||
      "Trader"
    );


    formData.append(
      "userEmail",
      me.email ||
      auth.currentUser?.email ||
      ""
    );


    formData.append(
      "amount",
      amount.toFixed(2)
    );


    formData.append(
      "utr",
      utr
    );


    formData.append(
      "paymentReference",
      reference
    );


    formData.append(
      "screenshot",
      screenshot,
      screenshot.name
    );


    const result =
      await serverRequest(
        "/api/payment/add-balance",
        {
          method: "POST",
          body: formData
        }
      );


    showMessage(
      output,
      result?.message ||
      "Payment request submitted successfully. Please wait for admin verification.",
      true
    );


    /* -----------------------------------------------------
       CLEAR FORM
    ----------------------------------------------------- */

    if ($("utr")) {
      $("utr").value = "";
    }

    if ($("paymentScreenshot")) {
      $("paymentScreenshot").value = "";
    }


    if ($("paymentReference")) {

      $("paymentReference").textContent =
        "Request ID: " +
        (
          result?.requestId ||
          reference
        );

    }


    /*
     * Prevent duplicate submission
     */

    currentPaymentAmount =
      0;

    currentPaymentReference =
      "";


  } catch (error) {

    console.error(
      "Payment submission error:",
      error
    );


    showMessage(
      output,
      error.message ||
      "Could not submit payment request.",
      false
    );


  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Submit Payment Request";

    }

  }

}


/* =========================================================
   SUBMIT WITHDRAWAL
========================================================= */

async function submitWithdrawal(
  event
) {

  event.preventDefault();


  const amountInput =
    $("withdrawAmount");

  const upiInput =
    $("withdrawUpi");

  const noteInput =
    $("withdrawNote");

  const output =
    $("withdrawMsg");

  const form =
    $("withdrawForm");


  const button =
    form?.querySelector(
      "button[type='submit']"
    );


  const amount =
    Number(
      amountInput?.value
    );


  const upiId =
    upiInput
      ?.value
      ?.trim();


  const note =
    noteInput
      ?.value
      ?.trim() ||
    "";


  /* -------------------------------------------------------
     AMOUNT
  ------------------------------------------------------- */

  if (
    !Number.isFinite(amount) ||
    amount < MIN_WITHDRAWAL
  ) {

    showMessage(
      output,
      "Minimum withdrawal is ₹50.",
      false
    );

    return;
  }


  /* -------------------------------------------------------
     UPI
  ------------------------------------------------------- */

  const upiRegex =
    /^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/;


  if (
    !upiRegex.test(upiId)
  ) {

    showMessage(
      output,
      "Please enter a valid UPI ID.",
      false
    );

    return;
  }


  if (!me?.uid) {

    showMessage(
      output,
      "Please login again.",
      false
    );

    return;
  }


  try {

    if (button) {

      button.disabled =
        true;

      button.textContent =
        "Submitting...";

    }


    /* -----------------------------------------------------
       GET LATEST USER BALANCE
    ----------------------------------------------------- */

    const userSnap =
      await getDoc(
        doc(
          db,
          "users",
          me.uid
        )
      );


    if (!userSnap.exists()) {

      throw new Error(
        "User account not found."
      );

    }


    const userData =
      userSnap.data();


    const balance =
      Number(
        userData.balance || 0
      );


    /* -----------------------------------------------------
       BALANCE CHECK
    ----------------------------------------------------- */

    if (
      balance < amount
    ) {

      throw new Error(
        "Insufficient virtual balance."
      );

    }


    if (
      balance - amount <
      MIN_REMAINING_BALANCE
    ) {

      const maximum =
        Math.max(
          0,
          balance -
          MIN_REMAINING_BALANCE
        );


      if (
        maximum < MIN_WITHDRAWAL
      ) {

        throw new Error(
          "Your wallet balance must be above ₹100 to withdraw."
        );

      }


      throw new Error(
        "Maximum withdrawal is " +
        money(maximum) +
        ". At least ₹100 must remain."
      );

    }


    /* -----------------------------------------------------
       SEND REQUEST
    ----------------------------------------------------- */

    const result =
      await serverRequest(
        "/api/payment/withdraw",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({

              userId:
                me.uid,

              userName:
                me.name ||
                userData.name ||
                "Trader",

              userEmail:
                me.email ||
                userData.email ||
                auth.currentUser?.email ||
                "",

              amount:
                Number(
                  amount.toFixed(2)
                ),

              upiId:
                upiId,

              note:
                note

            })

        }
      );


    showMessage(
      output,
      result?.message ||
      "Withdrawal request submitted successfully. Admin will review it.",
      true
    );


    /* -----------------------------------------------------
       CLEAR FORM
    ----------------------------------------------------- */

    if (amountInput) {
      amountInput.value = "";
    }

    if (upiInput) {
      upiInput.value = "";
    }

    if (noteInput) {
      noteInput.value = "";
    }


  } catch (error) {

    console.error(
      "Withdrawal error:",
      error
    );


    showMessage(
      output,
      error.message ||
      "Withdrawal request failed.",
      false
    );


  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Request Withdrawal";

    }

  }

}


/* =========================================================
   WALLET REQUEST LISTENERS
========================================================= */

function startWalletListeners() {

  if (!me?.uid) {
    return;
  }


  /* -------------------------------------------------------
     CLEAN OLD LISTENERS
  ------------------------------------------------------- */

  if (unsubscribeTopups) {

    unsubscribeTopups();

    unsubscribeTopups =
      null;

  }


  if (unsubscribeWithdrawals) {

    unsubscribeWithdrawals();

    unsubscribeWithdrawals =
      null;

  }


  /* -------------------------------------------------------
     TOPUPS
  ------------------------------------------------------- */

  const topupQuery =
    query(
      collection(
        db,
        "topupRequests"
      ),

      where(
        "userId",
        "==",
        me.uid
      )
    );


  unsubscribeTopups =
    onSnapshot(
      topupQuery,

      snapshot => {

        topupRequests =
          snapshot.docs.map(
            document => ({

              id:
                document.id,

              ...document.data()

            })
          );


        renderWalletRequests();

      },

      error => {

        console.error(
          "Topup listener error:",
          error
        );

      }
    );


  /* -------------------------------------------------------
     WITHDRAWALS
  ------------------------------------------------------- */

  const withdrawalQuery =
    query(
      collection(
        db,
        "withdrawalRequests"
      ),

      where(
        "userId",
        "==",
        me.uid
      )
    );


  unsubscribeWithdrawals =
    onSnapshot(
      withdrawalQuery,

      snapshot => {

        withdrawalRequests =
          snapshot.docs.map(
            document => ({

              id:
                document.id,

              ...document.data()

            })
          );


        renderWalletRequests();

      },

      error => {

        console.error(
          "Withdrawal listener error:",
          error
        );

      }
    );

}


/* =========================================================
   RENDER WALLET REQUESTS
========================================================= */

function renderWalletRequests() {

  const box =
    $("walletList");


  if (!box) {
    return;
  }


  const items = [];


  /* -------------------------------------------------------
     TOPUPS
  ------------------------------------------------------- */

  topupRequests.forEach(
    request => {

      items.push({

        date:
          getDateMs(
            request.createdAt
          ),

        type:
          "Add Balance",

        amount:
          Number(
            request.amount || 0
          ),

        status:
          request.status ||
          "PENDING",

        id:
          request.id,

        meta:
          request.utr
            ? "UTR: " +
              request.utr
            : "Payment request"

      });

    }
  );


  /* -------------------------------------------------------
     WITHDRAWALS
  ------------------------------------------------------- */

  withdrawalRequests.forEach(
    request => {

      items.push({

        date:
          getDateMs(
            request.createdAt
          ),

        type:
          "Withdrawal",

        amount:
          Number(
            request.amount || 0
          ),

        status:
          request.status ||
          "PENDING",

        id:
          request.id,

        meta:
          request.upiId
            ? "UPI: " +
              request.upiId
            : "Withdrawal request"

      });

    }
  );


  /* -------------------------------------------------------
     SORT
  ------------------------------------------------------- */

  items.sort(
    (a, b) =>
      b.date -
      a.date
  );


  /* -------------------------------------------------------
     EMPTY
  ------------------------------------------------------- */

  if (!items.length) {

    box.innerHTML =
      '<div class="empty">No wallet requests yet.</div>';

    return;
  }


  /* -------------------------------------------------------
     HTML
  ------------------------------------------------------- */

  box.innerHTML =
    items
      .map(
        item => {

          const status =
            String(
              item.status
            )
              .toLowerCase()
              .replaceAll(
                " ",
                "-"
              );


          const amountText =
            item.type ===
            "Withdrawal"

              ? "-" +
                money(
                  item.amount
                )

              : "+" +
                money(
                  item.amount
                );


          return `

            <div class="request-row">

              <div class="request-main">

                <div class="request-title">

                  ${escapeHtml(
                    item.type
                  )}

                </div>


                <div class="request-meta">

                  ${escapeHtml(
                    item.meta
                  )}

                  <br>

                  ${escapeHtml(
                    formatDate(
                      item.date
                    )
                  )}

                </div>


                <span
                  class="status ${escapeHtml(status)}"
                >

                  ${escapeHtml(
                    item.status
                  )}

                </span>

              </div>


              <div class="request-amount">

                ${escapeHtml(
                  amountText
                )}

              </div>

            </div>

          `;

        }
      )
      .join("");

}


/* =========================================================
   REALTIME USER BALANCE
========================================================= */

function startUserBalanceListener() {

  if (!me?.uid) {
    return;
  }


  const userRef =
    doc(
      db,
      "users",
      me.uid
    );


  if (unsubscribeUser) {

    unsubscribeUser();

    unsubscribeUser =
      null;

  }


  unsubscribeUser =
    onSnapshot(

      userRef,

      snapshot => {

        if (!snapshot.exists()) {
          return;
        }


        const data =
          snapshot.data();


        me = {
          ...me,
          ...data
        };


        const balance =
          Number(
            data.balance || 0
          );


        const balanceText =
          money(balance);


        if ($("topBalance")) {

          $("topBalance")
            .textContent =
            balanceText;

        }


        if ($("walletBalance")) {

          $("walletBalance")
            .textContent =
            balanceText;

        }

      },

      error => {

        console.error(
          "User balance listener error:",
          error
        );

      }

    );

}


/* =========================================================
   AUTH STATE
========================================================= */

onAuthStateChanged(
  auth,
  async user => {

    /* -----------------------------------------------------
       NOT LOGGED IN
    ----------------------------------------------------- */

    if (!user) {

      location.href =
        "login.html";

      return;

    }


    try {

      /* ---------------------------------------------------
         FIRESTORE PROFILE
      --------------------------------------------------- */

      const userRef =
        doc(
          db,
          "users",
          user.uid
        );


      const userSnap =
        await getDoc(
          userRef
        );


      if (!userSnap.exists()) {

        await signOut(auth);

        location.href =
          "login.html";

        return;

      }


      const userData =
        userSnap.data();


      /* ---------------------------------------------------
         DISABLED ACCOUNT
      --------------------------------------------------- */

      if (
        userData.active === false
      ) {

        await signOut(auth);

        location.href =
          "login.html";

        return;

      }


      /* ---------------------------------------------------
         CURRENT USER
      --------------------------------------------------- */

      me = {

        uid:
          user.uid,

        email:
          user.email ||
          userData.email ||
          "",

        ...userData

      };


      /* ---------------------------------------------------
         START LISTENERS
      --------------------------------------------------- */

      startUserBalanceListener();

      startWalletListeners();


      /* ---------------------------------------------------
         TEST PAYMENT SERVER
      --------------------------------------------------- */

      testPaymentServer();


    } catch (error) {

      console.error(
        "Wallet initialization error:",
        error
      );


      await signOut(auth);

      location.href =
        "login.html";

    }

  }
);


/* =========================================================
   BUTTON EVENTS
========================================================= */

$("generateQr")
  ?.addEventListener(
    "click",
    generatePaymentQr
  );


$("paymentSubmitForm")
  ?.addEventListener(
    "submit",
    submitPaymentRequest
  );


$("withdrawForm")
  ?.addEventListener(
    "submit",
    submitWithdrawal
  );


/* =========================================================
   LOGOUT
========================================================= */

$("logout")
  ?.addEventListener(
    "click",
    async () => {

      try {

        await signOut(auth);

        location.href =
          "login.html";

      } catch (error) {

        console.error(
          "Logout error:",
          error
        );

      }

    }
  );


/* =========================================================
   AMOUNT INPUT
========================================================= */

$("topupAmount")
  ?.addEventListener(
    "input",
    () => {

      const input =
        $("topupAmount");

      const value =
        Number(
          input?.value
        );


      /*
       * If amount changes after QR
       * was generated, old payment
       * state is invalid.
       */

      if (
        currentPaymentAmount > 0 &&
        value !== currentPaymentAmount
      ) {

        currentPaymentAmount =
          0;

        currentPaymentReference =
          "";


        const paymentBox =
          $("paymentBox");


        if (paymentBox) {

          paymentBox.style.display =
            "none";

        }

      }


      /*
       * Invalid amount
       */

      if (
        !Number.isFinite(value) ||
        value <= 0
      ) {

        const paymentBox =
          $("paymentBox");


        if (paymentBox) {

          paymentBox.style.display =
            "none";

        }


        currentPaymentAmount =
          0;

        currentPaymentReference =
          "";

      }

    }
  );


/* =========================================================
   CLEANUP
========================================================= */

window.addEventListener(
  "beforeunload",
  () => {

    if (unsubscribeUser) {
      unsubscribeUser();
    }

    if (unsubscribeTopups) {
      unsubscribeTopups();
    }

    if (unsubscribeWithdrawals) {
      unsubscribeWithdrawals();
    }

  }
);