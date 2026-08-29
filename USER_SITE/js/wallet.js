/* =========================================================
   TradeSim Pro - User Wallet
   Firebase + Dynamic UPI QR + Live Payment Server
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

const $ = (id) =>
  document.getElementById(id);


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
    new URLSearchParams({

      pa:
        PAYMENT_UPI_ID,

      pn:
        PAYMENT_NAME,

      am:
        Number(amount)
          .toFixed(2),

      cu:
        "INR",

      tn:
        reference

    });

  return (
    "upi://pay?" +
    params.toString()
  );

}


/* =========================================================
   GENERATE PAYMENT QR
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


  currentPaymentAmount =
    cleanAmount;

  currentPaymentReference =
    createPaymentReference();


  const upiUrl =
    createUpiUrl(
      cleanAmount,
      currentPaymentReference
    );


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

  if (qrAmount) {
    qrAmount.textContent =
      money(cleanAmount);
  }

  if (referenceBox) {

    referenceBox.textContent =
      "Payment reference: " +
      currentPaymentReference;

  }

  if (payButton) {

    payButton.href =
      upiUrl;

  }


  if (qrImage) {

    qrImage.src = "";

    qrImage.alt =
      "Generating payment QR...";

  }


  /*
   * Check QR library
   */

  if (
    typeof QRCode === "undefined"
  ) {

    showMessage(
      output,
      "QR library failed to load. Please refresh the page.",
      false
    );

    return;
  }


  /*
   * Temporary QR container
   */

  const qrContainer =
    document.createElement("div");

  qrContainer.style.position =
    "fixed";

  qrContainer.style.left =
    "-99999px";

  qrContainer.style.top =
    "0";

  document.body.appendChild(
    qrContainer
  );


  try {

    new QRCode(
      qrContainer,
      {
        text: upiUrl,
        width: 230,
        height: 230,
        correctLevel:
          QRCode.CorrectLevel.M
      }
    );


    setTimeout(() => {

      const generatedImage =
        qrContainer.querySelector(
          "img"
        );


      if (
        generatedImage &&
        qrImage
      ) {

        qrImage.src =
          generatedImage.src;

        qrImage.alt =
          "Dynamic UPI payment QR";

      }


      qrContainer.remove();

    }, 300);


  } catch (error) {

    console.error(
      "QR generation error:",
      error
    );

    qrContainer.remove();

    showMessage(
      output,
      "Could not generate payment QR.",
      false
    );

    return;
  }


  if (output) {
    output.textContent = "";
  }

}


/* =========================================================
   GET FIREBASE ID TOKEN
========================================================= */

async function getAuthToken() {

  const user =
    auth.currentUser;

  if (!user) {
    throw new Error(
      "Please login again."
    );
  }


  /*
   * Firebase automatically refreshes
   * the token when required.
   */

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
   SERVER REQUEST HELPER
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
   TEST SERVER CONNECTION
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
      "Payment server:",
      result
    );


  } catch (error) {

    console.error(
      "Payment server connection error:",
      error
    );

  }

}


/* =========================================================
   SUBMIT PAYMENT REQUEST
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


  /*
   * Validate generated payment
   */

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


  /*
   * UTR
   */

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


  /*
   * Screenshot
   */

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


  try {

    if (button) {

      button.disabled =
        true;

      button.textContent =
        "Submitting...";

    }


    const formData =
      new FormData();


    /*
     * IMPORTANT:
     * userId is included only for compatibility.
     * Server ignores it and uses verified token UID.
     */

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
     * Reset payment state.
     *
     * Do NOT reset reference displayed above.
     */

    currentPaymentAmount = 0;
    currentPaymentReference = "";


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


  /*
   * Amount
   */

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


  /*
   * UPI
   */

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


    /*
     * Read latest wallet balance
     */

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


    /*
     * Send withdrawal request.
     *
     * Authorization token is automatically
     * added by serverRequest().
     */

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
   START WALLET LISTENERS
========================================================= */

function startWalletListeners() {

  if (!me?.uid) {
    return;
  }


  /*
   * Remove old listeners
   */

  if (unsubscribeTopups) {
    unsubscribeTopups();
    unsubscribeTopups = null;
  }


  if (unsubscribeWithdrawals) {
    unsubscribeWithdrawals();
    unsubscribeWithdrawals = null;
  }


  /*
   * TOPUP REQUESTS
   */

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


  /*
   * WITHDRAWAL REQUESTS
   */

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


  /*
   * TOPUPS
   */

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


  /*
   * WITHDRAWALS
   */

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


  /*
   * Newest first
   */

  items.sort(
    (a, b) =>
      b.date -
      a.date
  );


  if (!items.length) {

    box.innerHTML =
      '<div class="empty">No wallet requests yet.</div>';

    return;
  }


  box.innerHTML =
    items
      .map(
        item => {

          const status =
            String(
              item.status
            ).toLowerCase();


          const amountText =
            item.type ===
            "Withdrawal"

              ? "-" +
                money(item.amount)

              : "+" +
                money(item.amount);


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

                <span class="status ${escapeHtml(status)}">

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
    unsubscribeUser = null;
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

    /*
     * Not logged in
     */

    if (!user) {

      location.href =
        "login.html";

      return;

    }


    try {

      /*
       * Get Firestore profile
       */

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


      /*
       * Disabled account
       */

      if (
        userData.active === false
      ) {

        await signOut(auth);

        location.href =
          "login.html";

        return;

      }


      /*
       * Current user
       */

      me = {

        uid:
          user.uid,

        email:
          user.email ||
          userData.email ||
          "",

        ...userData

      };


      /*
       * Start realtime balance
       */

      startUserBalanceListener();


      /*
       * Start request listeners
       */

      startWalletListeners();


      /*
       * Test live backend
       */

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

      const value =
        Number(
          $("topupAmount")
            ?.value
        );


      /*
       * If amount becomes invalid,
       * hide old QR.
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