/* =========================================================
   TradeSim Pro — Dashboard + Trades
   VIRTUAL / DEMO TRADING ONLY
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
  doc,
  getDoc,
  collection,
  query,
  where,
  limit,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


/* =========================================================
   CONFIG
========================================================= */

const CONFIG = window.TRADE_CONFIG || {

  sessionDurationMs:
    5 * 60 * 1000,

  sessionMinutes:
    5,

  minAmount:
    100,

  maxAmount:
    500,

  minWinRate:
    22,

  maxWinRate:
    90

};


/* =========================================================
   TRADE SERVER
========================================================= */

const TRADE_SERVER_URL =
  "https://tradesim-pro.onrender.com";


/* =========================================================
   GLOBAL TIMER
========================================================= */

let tradeTimerInterval =
  null;


/* =========================================================
   HELPERS
========================================================= */

const $ =
  id =>
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


function formatDate(value) {

  if (!value) {

    return "Processing...";

  }


  let ms = 0;


  if (
    typeof value?.toMillis ===
    "function"
  ) {

    ms =
      value.toMillis();

  } else {

    ms =
      new Date(value)
        .getTime();

  }


  if (!ms) {

    return "Processing...";

  }


  return new Date(ms)
    .toLocaleString();

}


function getTimestampMs(value) {

  if (!value) {

    return NaN;

  }


  if (
    typeof value.toMillis ===
    "function"
  ) {

    return value.toMillis();

  }


  if (
    typeof value ===
    "number"
  ) {

    return value;

  }


  const parsed =
    new Date(value)
      .getTime();


  return parsed;

}


function showMessage(
  text,
  success = false
) {

  const el =
    $("tradeMsg");


  if (!el) {

    return;

  }


  el.textContent =
    text;


  el.style.color =
    success
      ? "#67dca5"
      : "#ff7d86";

}


/* =========================================================
   CURRENT USER
========================================================= */

let currentUser =
  null;

let currentUserData =
  null;

let unsubscribeUser =
  null;

let unsubscribeTrades =
  null;


/* =========================================================
   AUTH TOKEN
========================================================= */

async function getAuthToken() {

  if (!currentUser) {

    throw new Error(
      "Please login again."
    );

  }


  return await getIdToken(
    currentUser,
    true
  );

}


/* =========================================================
   TRADE SERVER REQUEST
========================================================= */

async function tradeServerRequest(
  endpoint,
  body = {}
) {

  const token =
    await getAuthToken();


  const response =
    await fetch(

      TRADE_SERVER_URL +
      endpoint,

      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "application/json",

          "Authorization":
            "Bearer " +
            token

        },

        body:
          JSON.stringify(body)

      }

    );


  let data =
    null;


  try {

    data =
      await response.json();

  } catch {

    data =
      null;

  }


  if (!response.ok) {

    console.error(

      "Trade server response:",

      response.status,

      data

    );


    throw new Error(

      data?.message ||

      `Trade server returned HTTP ${response.status}`

    );

  }


  return data;

}


/* =========================================================
   LOAD USER
========================================================= */

async function loadUser(user) {

  const userRef =
    doc(
      db,
      "users",
      user.uid
    );


  const snap =
    await getDoc(
      userRef
    );


  if (!snap.exists()) {

    throw new Error(
      "User account not found."
    );

  }


  const data =
    snap.data();


  if (
    data.active === false
  ) {

    throw new Error(
      "Your account is disabled."
    );

  }


  currentUser =
    user;


  currentUserData =
    data;


  updateUserUI();


  startUserListener();


  startTradeListener();

}


/* =========================================================
   USER UI
========================================================= */

function updateUserUI() {

  if (!currentUserData) {

    return;

  }


  const balance =
    Number(
      currentUserData.balance ||
      0
    );


  if ($("topBalance")) {

    $("topBalance").textContent =
      money(balance);

  }


  if ($("balance")) {

    $("balance").textContent =
      money(balance);

  }


  if ($("walletBalance")) {

    $("walletBalance").textContent =
      money(balance);

  }


  if ($("userName")) {

    $("userName").textContent =

      currentUserData.name ||

      currentUserData.displayName ||

      currentUser?.displayName ||

      "Trader";

  }

}


/* =========================================================
   USER REALTIME LISTENER
========================================================= */

function startUserListener() {

  if (!currentUser?.uid) {

    return;

  }


  if (unsubscribeUser) {

    unsubscribeUser();

    unsubscribeUser =
      null;

  }


  const userRef =
    doc(
      db,
      "users",
      currentUser.uid
    );


  unsubscribeUser =
    onSnapshot(

      userRef,

      snapshot => {

        if (
          !snapshot.exists()
        ) {

          return;

        }


        currentUserData =
          snapshot.data();


        updateUserUI();

      },

      error => {

        console.error(

          "User listener error:",

          error

        );

      }

    );

}


/* =========================================================
   TRADE LISTENER
========================================================= */

function startTradeListener() {

  if (!currentUser?.uid) {

    return;

  }


  if (unsubscribeTrades) {

    unsubscribeTrades();

    unsubscribeTrades =
      null;

  }


  const tradesQuery =
    query(

      collection(
        db,
        "trades"
      ),

      where(
        "userId",
        "==",
        currentUser.uid
      ),

      limit(100)

    );


  unsubscribeTrades =
    onSnapshot(

      tradesQuery,

      snapshot => {

        const trades =
          snapshot.docs.map(
            d => ({

              id:
                d.id,

              ...d.data()

            })
          );


        trades.sort(
          (a, b) => {

            const aTime =
              a.createdAt?.toMillis?.() ||
              getTimestampMs(
                a.createdAt
              ) ||
              0;


            const bTime =
              b.createdAt?.toMillis?.() ||
              getTimestampMs(
                b.createdAt
              ) ||
              0;


            return (
              bTime -
              aTime
            );

          }
        );


        renderDashboardTrades(
          trades
        );


        renderTradesPage(
          trades
        );


        updateStats(
          trades
        );

      },

      error => {

        console.error(

          "Trade listener error:",

          error

        );

      }

    );

}


/* =========================================================
   STATS
========================================================= */

function updateStats(
  trades
) {

  const openTrades =
    trades.filter(
      trade =>
        trade.status ===
        "OPEN"
    );


  if ($("openCount")) {

    $("openCount").textContent =
      openTrades.length;

  }


  let totalPnl =
    0;


  trades.forEach(
    trade => {

      if (
        trade.status ===
        "SETTLED"
      ) {

        totalPnl +=
          Number(
            trade.profit ||
            0
          );

      }

    }
  );


  if ($("pnl")) {

    $("pnl").textContent =
      money(totalPnl);

  }

}


/* =========================================================
   FORMAT COUNTDOWN
========================================================= */

function formatCountdown(
  milliseconds
) {

  const totalSeconds =
    Math.max(
      0,
      Math.ceil(
        milliseconds / 1000
      )
    );


  const minutes =
    Math.floor(
      totalSeconds / 60
    );


  const seconds =
    totalSeconds % 60;


  return (

    String(minutes)
      .padStart(2, "0")

    +

    ":" +

    String(seconds)
      .padStart(2, "0")

  );

}


/* =========================================================
   START TRADE COUNTDOWN
========================================================= */

function startTradeCountdown() {

  if (tradeTimerInterval) {

    clearInterval(
      tradeTimerInterval
    );

    tradeTimerInterval =
      null;

  }


  function updateTimers() {

    const timerElements =
      document.querySelectorAll(
        ".trade-countdown"
      );


    if (
      !timerElements.length
    ) {

      return;

    }


    const now =
      Date.now();


    timerElements.forEach(
      timer => {

        const settleAt =
          Number(
            timer.dataset.settleAt
          );


        if (
          !Number.isFinite(
            settleAt
          )
        ) {

          timer.textContent =
            "05:00";

          return;

        }


        const remaining =
          settleAt -
          now;


        if (
          remaining <= 0
        ) {

          timer.textContent =
            "Settling...";

          timer.classList.add(
            "settling"
          );

          return;

        }


        timer.classList.remove(
          "settling"
        );


        timer.textContent =
          formatCountdown(
            remaining
          );

      }
    );

  }


  updateTimers();


  tradeTimerInterval =
    setInterval(
      updateTimers,
      1000
    );

}


/* =========================================================
   DASHBOARD OPEN TRADES
========================================================= */

function renderDashboardTrades(
  trades
) {

  const box =
    $("openTrades");


  if (!box) {

    return;

  }


  const openTrades =
    trades
      .filter(
        trade =>
          trade.status ===
          "OPEN"
      )
      .slice(0, 5);


  if (
    !openTrades.length
  ) {

    box.innerHTML =
      '<div class="empty">No open trades.</div>';


    if (
      tradeTimerInterval
    ) {

      clearInterval(
        tradeTimerInterval
      );

      tradeTimerInterval =
        null;

    }


    return;

  }


  box.innerHTML =
    openTrades
      .map(
        trade => {

          const side =
            String(
              trade.side ||
              ""
            )
            .toUpperCase();


          const settleAt =
            getTimestampMs(
              trade.settleAt
            );


          return `

            <div
              class="request-row"
              data-trade-id="${escapeHtml(
                trade.id
              )}"
            >

              <div
                class="request-main"
              >

                <div
                  class="request-title"
                >

                  ${escapeHtml(
                    side
                  )}

                  •

                  ${escapeHtml(
                    money(
                      trade.amount
                    )
                  )}

                </div>


                <div
                  class="request-meta"
                >

                  ${escapeHtml(
                    formatDate(
                      trade.createdAt
                    )
                  )}

                </div>

              </div>


              <div
                class="request-amount"
                style="
                  text-align:right;
                  min-width:90px;
                "
              >

                <div
                  class="trade-countdown"
                  data-settle-at="${settleAt}"
                  style="
                    font-size:18px;
                    font-weight:800;
                    line-height:1.2;
                  "
                >
                  ${formatCountdown(
                    Math.max(
                      0,
                      settleAt -
                      Date.now()
                    )
                  )}
                </div>


                <div
                  style="
                    font-size:11px;
                    opacity:.75;
                    margin-top:3px;
                  "
                >
                  OPEN
                </div>

              </div>

            </div>

          `;

        }
      )
      .join("");


  startTradeCountdown();

}


/* =========================================================
   TRADES PAGE
========================================================= */

function renderTradesPage(
  trades
) {

  const box =
    $("tradesList");


  if (!box) {

    return;

  }


  if (
    !trades.length
  ) {

    box.innerHTML =
      '<div class="empty">No trades yet.</div>';

    return;

  }


  box.innerHTML =
    trades
      .map(
        trade => {

          const side =
            String(
              trade.side ||
              ""
            )
            .toUpperCase();


          const status =
            String(
              trade.status ||
              "OPEN"
            )
            .toUpperCase();


          const profit =
            Number(
              trade.profit ||
              0
            );


          let resultText =
            "OPEN";


          if (
            status ===
            "SETTLED"
          ) {

            resultText =
              profit >= 0

                ? "+" +
                  money(profit)

                : "-" +
                  money(
                    Math.abs(
                      profit
                    )
                  );

          }


          return `

            <div
              class="request-row"
            >

              <div
                class="request-main"
              >

                <div
                  class="request-title"
                >

                  ${escapeHtml(
                    side
                  )}

                  •

                  ${escapeHtml(
                    money(
                      trade.amount
                    )
                  )}

                </div>


                <div
                  class="request-meta"
                >

                  ${escapeHtml(
                    status
                  )}

                  <br>

                  ${escapeHtml(
                    formatDate(
                      trade.createdAt
                    )
                  )}

                </div>

              </div>


              <div
                class="request-amount"
              >

                ${escapeHtml(
                  resultText
                )}

              </div>

            </div>

          `;

        }
      )
      .join("");

}


/* =========================================================
   OPEN DEMO TRADE
========================================================= */

async function openTrade(
  side
) {

  if (!currentUser?.uid) {

    showMessage(
      "Please login again."
    );

    return;

  }


  const amountInput =
    $("amount");


  const amount =
    Number(
      amountInput?.value
    );


  const minAmount =
    Number(
      CONFIG.minAmount
    );


  const maxAmount =
    Number(
      CONFIG.maxAmount
    );


  /*
   * Minimum:
   * ₹100
   *
   * Maximum:
   * ₹500
   */

  if (

    !Number.isFinite(
      amount
    )

    ||

    amount <
      minAmount

    ||

    amount >
      maxAmount

  ) {

    showMessage(

      `Trade amount must be between ${money(minAmount)} and ${money(maxAmount)}.`

    );

    return;

  }


  const cleanAmount =
    Number(
      amount.toFixed(2)
    );


  const buyButton =
    $("buy");


  const sellButton =
    $("sell");


  try {

    if (buyButton) {

      buyButton.disabled =
        true;

    }


    if (sellButton) {

      sellButton.disabled =
        true;

    }


    showMessage(

      "Opening demo trade...",

      true

    );


    const result =
      await tradeServerRequest(

        "/api/trade/open",

        {

          side:
            String(side)
              .toUpperCase(),

          amount:
            cleanAmount

        }

      );


    if (
      !result?.ok
    ) {

      throw new Error(

        result?.message ||

        "Could not open trade."

      );

    }


    showMessage(

      `${String(side).toUpperCase()} trade opened. ${money(cleanAmount)} deducted from balance.`,

      true

    );


    setTimeout(
      () => {

        const msg =
          $("tradeMsg");


        if (msg) {

          msg.textContent =
            "";

        }

      },
      4000
    );


  } catch (error) {

    console.error(

      "Open trade error:",

      error

    );


    showMessage(

      error.message ||

      "Could not open trade."

    );


  } finally {

    if (buyButton) {

      buyButton.disabled =
        false;

    }


    if (sellButton) {

      sellButton.disabled =
        false;

    }

  }

}


/* =========================================================
   BUY BUTTON
========================================================= */

$("buy")?.addEventListener(

  "click",

  () => {

    openTrade(
      "BUY"
    );

  }

);


/* =========================================================
   SELL BUTTON
========================================================= */

$("sell")?.addEventListener(

  "click",

  () => {

    openTrade(
      "SELL"
    );

  }

);


/* =========================================================
   LOGOUT
========================================================= */

$("logout")?.addEventListener(

  "click",

  async () => {

    try {

      await signOut(
        auth
      );


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
   AUTH
========================================================= */

onAuthStateChanged(

  auth,

  async user => {

    if (!user) {

      location.href =
        "login.html";

      return;

    }


    try {

      await loadUser(
        user
      );


    } catch (error) {

      console.error(

        "Page initialization error:",

        error

      );


      try {

        await signOut(
          auth
        );

      } catch {}


      location.href =
        "login.html";

    }

  }

);


/* =========================================================
   CLEANUP
========================================================= */

window.addEventListener(

  "beforeunload",

  () => {

    if (
      unsubscribeUser
    ) {

      unsubscribeUser();

    }


    if (
      unsubscribeTrades
    ) {

      unsubscribeTrades();

    }


    if (
      tradeTimerInterval
    ) {

      clearInterval(
        tradeTimerInterval
      );

    }

  }

);