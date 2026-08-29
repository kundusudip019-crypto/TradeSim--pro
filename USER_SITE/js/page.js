/* =========================================================
   TradeSim Pro - User Wallet
   Firebase + Dynamic UPI QR + Payment Server

   REAL WALLET SYSTEM
   - No demo balance
   - No demo wallet
   - Top-up via payment request
   - Withdrawal via withdrawal request
   - Balance is read from users/{uid}.balance
   - Balance is NOT changed directly from client
========================================================= */


import {
  auth,
  db
} from "./firebase.js";


import {
  onAuthStateChanged,
  signOut
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


/*
 * LOCAL:
 * http://localhost:10000
 *
 * LIVE:
 * এখানে তোমার deployed payment server URL বসাবে।
 *
 * Example:
 * https://tradesim-payment-server.onrender.com
 */

const PAYMENT_SERVER_URL =
  "http://localhost:10000";


/*
 * Payment UPI ID
 */

const PAYMENT_UPI_ID =
  "9992693790@fam";


/*
 * Payment display name
 */

const PAYMENT_NAME =
  "TradeSim Pro";


/*
 * Wallet rules
 */

const MIN_WITHDRAWAL =
  50;


/*
 * Minimum balance that must remain
 * after withdrawal.
 */

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

  return (
    "₹" +
    amount.toFixed(2)
  );

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
    typeof value.toMillis ===
    "function"
  ) {

    return value.toMillis();

  }


  if (
    value instanceof Date
  ) {

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
   UPI PAYMENT
========================================================= */


let currentPaymentAmount = 0;

let currentPaymentReference = "";



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
   GENERATE DYNAMIC QR
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


  const amount =
    Number(input?.value);



  /* -------------------------------------------------------
     VALIDATE AMOUNT
  ------------------------------------------------------- */


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    showMessage(
      $("topupMsg"),
      "Enter a valid positive amount.",
      false
    );

    return;

  }



  /* -------------------------------------------------------
     PAYMENT PRECISION
  ------------------------------------------------------- */


  const cleanAmount =
    Number(
      amount.toFixed(2)
    );



  /* -------------------------------------------------------
     CREATE PAYMENT REFERENCE
  ------------------------------------------------------- */


  currentPaymentAmount =
    cleanAmount;


  currentPaymentReference =
    createPaymentReference();



  /* -------------------------------------------------------
     CREATE UPI URL
  ------------------------------------------------------- */


  const upiUrl =
    createUpiUrl(
      cleanAmount,
      currentPaymentReference
    );



  /* -------------------------------------------------------
     SHOW PAYMENT AREA
  ------------------------------------------------------- */


  if (paymentBox) {

    paymentBox.style.display =
      "block";

  }


  if (qrWrap) {

    qrWrap.classList.add(
      "show"
    );

  }


  if (paymentFields) {

    paymentFields.classList.add(
      "show"
    );

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



  /* -------------------------------------------------------
     OPEN UPI APP
  ------------------------------------------------------- */


  if (payButton) {

    payButton.href =
      upiUrl;

  }



  /* -------------------------------------------------------
     GENERATE QR
  ------------------------------------------------------- */


  if (qrImage) {

    qrImage.src =
      "";

    qrImage.alt =
      "Generating payment QR...";

  }


  const qrContainer =
    document.createElement(
      "div"
    );


  qrContainer.style.display =
    "none";


  document.body.appendChild(
    qrContainer
  );


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
          "UPI payment QR";

      }


      qrContainer.remove();

    }, 100);


  } catch (error) {

    console.error(
      "QR generation error:",
      error
    );


    qrContainer.remove();


    showMessage(
      $("topupMsg"),
      "Could not generate payment QR.",
      false
    );

  }



  /* -------------------------------------------------------
     CLEAR MESSAGE
  ------------------------------------------------------- */


  if ($("topupMsg")) {

    $("topupMsg").textContent =
      "";

  }

}



/* =========================================================
   TOP-UP PAYMENT REQUEST
========================================================= */


async function submitPaymentRequest(
  event
) {

  event.preventDefault();


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


  const button =
    $("submitPayment");


  const output =
    $("topupMsg");



  /* -------------------------------------------------------
     VALIDATE PAYMENT
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


  if (!screenshot) {

    showMessage(
      output,
      "Payment screenshot is required.",
      false
    );

    return;

  }



  /* -------------------------------------------------------
     FILE VALIDATION
  ------------------------------------------------------- */


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



  /* -------------------------------------------------------
     AUTH CHECK
  ------------------------------------------------------- */


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
       FORM DATA
    ----------------------------------------------------- */


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



    /* -----------------------------------------------------
       SEND TOP-UP REQUEST TO SERVER
    ----------------------------------------------------- */


    const response =
      await fetch(
        PAYMENT_SERVER_URL +
        "/api/payment/add-balance",
        {
          method:
            "POST",

          body:
            formData
        }
      );



    let result = null;


    try {

      result =
        await response.json();

    } catch {

      result = null;

    }



    if (
      !response.ok ||
      !result?.ok
    ) {

      throw new Error(
        result?.message ||
        "Top-up request failed."
      );

    }



    /* -----------------------------------------------------
       SUCCESS
    ----------------------------------------------------- */


    showMessage(
      output,
      "Top-up request submitted successfully. Please wait for admin verification.",
      true
    );



    if ($("utr")) {

      $("utr").value =
        "";

    }


    if ($("paymentScreenshot")) {

      $("paymentScreenshot").value =
        "";

    }


    if ($("paymentReference")) {

      $("paymentReference").textContent =
        "Request ID: " +
        (
          result.requestId ||
          reference
        );

    }



    /*
     * IMPORTANT:
     *
     * Client does NOT add balance.
     *
     * Balance is added only after
     * server-side admin approval.
     */

  } catch (error) {

    console.error(
      "Top-up submission error:",
      error
    );


    showMessage(
      output,
      error.message ||
      "Could not submit top-up request.",
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
   WITHDRAWAL REQUEST
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
     AMOUNT VALIDATION
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
     UPI VALIDATION
  ------------------------------------------------------- */


  if (
    !upiId ||
    upiId.length < 3 ||
    upiId.length > 100
  ) {

    showMessage(
      output,
      "Please enter a valid UPI ID.",
      false
    );

    return;

  }



  /* -------------------------------------------------------
     AUTH CHECK
  ------------------------------------------------------- */


  if (!me?.uid) {

    showMessage(
      output,
      "Please login again.",
      false
    );

    return;

  }



  try {

    /* -----------------------------------------------------
       GET CURRENT ACCOUNT BALANCE
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
       CHECK AVAILABLE BALANCE
    ----------------------------------------------------- */


    if (
      balance < amount
    ) {

      throw new Error(
        "Insufficient wallet balance."
      );

    }



    /* -----------------------------------------------------
       KEEP MINIMUM BALANCE
    ----------------------------------------------------- */


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
        maximum <
        MIN_WITHDRAWAL
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
       SUBMIT BUTTON
    ----------------------------------------------------- */


    const button =
      $("withdrawForm")
        ?.querySelector(
          "button[type='submit']"
        );


    if (button) {

      button.disabled =
        true;

      button.textContent =
        "Submitting...";

    }



    /* -----------------------------------------------------
       SEND WITHDRAWAL REQUEST
    ----------------------------------------------------- */


    const response =
      await fetch(
        PAYMENT_SERVER_URL +
        "/api/payment/withdraw",
        {

          method:
            "POST",

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



    let result = null;


    try {

      result =
        await response.json();

    } catch {

      result = null;

    }



    if (
      !response.ok ||
      !result?.ok
    ) {

      throw new Error(
        result?.message ||
        "Withdrawal request failed."
      );

    }



    /* -----------------------------------------------------
       SUCCESS
    ----------------------------------------------------- */


    showMessage(
      output,
      "Withdrawal request submitted successfully. Admin will review it.",
      true
    );


    if (amountInput) {

      amountInput.value =
        "";

    }


    if (upiInput) {

      upiInput.value =
        "";

    }


    if (noteInput) {

      noteInput.value =
        "";

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

    const button =
      $("withdrawForm")
        ?.querySelector(
          "button[type='submit']"
        );


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
     TOP-UP REQUESTS
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
            item => ({

              id:
                item.id,

              ...item.data()

            })
          );


        renderWalletRequests();

      },

      error => {

        console.error(
          "Top-up listener error:",
          error
        );

      }
    );



  /* -------------------------------------------------------
     WITHDRAWAL REQUESTS
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
            item => ({

              id:
                item.id,

              ...item.data()

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
     TOP-UP REQUESTS
  ------------------------------------------------------- */


  topupRequests.forEach(
    request => {

      items.push({

        date:
          getDateMs(
            request.createdAt
          ),

        type:
          "Top-up",

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
            : "Top-up request"

      });

    }
  );



  /* -------------------------------------------------------
     WITHDRAWAL REQUESTS
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
     NEWEST FIRST
  ------------------------------------------------------- */


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
   MESSAGE
========================================================= */


function showMessage(
  element,
  text,
  success
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
   REALTIME ACCOUNT BALANCE
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



        /* -------------------------------------------------
           TOP BALANCE
        ------------------------------------------------- */


        if ($("topBalance")) {

          $("topBalance")
            .textContent =
            balanceText;

        }



        /* -------------------------------------------------
           WALLET BALANCE
        ------------------------------------------------- */


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
   AUTH
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
         GET USER PROFILE
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
        userData.active ===
        false
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
         START REALTIME BALANCE
      --------------------------------------------------- */


      startUserBalanceListener();



      /* ---------------------------------------------------
         START REQUEST LISTENERS
      --------------------------------------------------- */


      startWalletListeners();


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
   TOP-UP AMOUNT CHANGE
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