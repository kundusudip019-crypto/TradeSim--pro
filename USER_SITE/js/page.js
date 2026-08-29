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
   GLOBALS
========================================================= */

let tradeTimerInterval =
  null;

let currentUser =
  null;

let currentUserData =
  null;

let unsubscribeUser =
  null;

let unsubscribeTrades =
  null;

let unsubscribeOffers =
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
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

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

  } else if (
    typeof value === "number"
  ) {

    ms =
      value;

  } else {

    ms =
      new Date(value).getTime();

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
    typeof value === "number"
  ) {

    return value;

  }

  return new Date(value).getTime();

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

  currentUser =
    user;


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


  currentUserData =
    data;


  updateUserUI();


  startUserListener();

  startTradeListener();

  startOffersListener();

  loadReferralData();

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


  const name =
    currentUserData.name ||

    currentUserData.displayName ||

    currentUser?.displayName ||

    "Trader";


  if ($("userName")) {

    $("userName").textContent =
      name;

  }


  /* Referral fields */

  const referralCode =

    currentUserData.referralCode ||

    currentUserData.refCode ||

    currentUserData.referral_code ||

    currentUserData.code ||

    "";


  const referralCount =

    Number(

      currentUserData.referralCount ||

      currentUserData.referrals ||

      currentUserData.referralUsers ||

      0

    );


  const referralEarnings =

    Number(

      currentUserData.referralEarnings ||

      currentUserData.referralIncome ||

      currentUserData.referralProfit ||

      0

    );


  setTextIfExists(
    "referralCode",
    referralCode || "N/A"
  );


  setTextIfExists(
    "refCode",
    referralCode || "N/A"
  );


  setTextIfExists(
    "referralCount",
    String(referralCount)
  );


  setTextIfExists(
    "referrals",
    String(referralCount)
  );


  setTextIfExists(
    "referralEarnings",
    money(referralEarnings)
  );


  setTextIfExists(
    "referralIncome",
    money(referralEarnings)
  );

}


function setTextIfExists(
  id,
  value
) {

  const element =
    $(id);

  if (element) {

    element.textContent =
      value;

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

        loadReferralData();

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
              getTimestampMs(
                a.createdAt
              ) || 0;


            const bTime =
              getTimestampMs(
                b.createdAt
              ) || 0;


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


        renderTradeHistory(
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


        showCollectionError(
          "trades",
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
        String(
          trade.status || ""
        ).toUpperCase() ===
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
        String(
          trade.status || ""
        ).toUpperCase() ===
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
   COUNTDOWN
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


function startTradeCountdown() {

  if (tradeTimerInterval) {

    clearInterval(
      tradeTimerInterval
    );

  }


  function updateTimers() {

    const elements =
      document.querySelectorAll(
        ".trade-countdown"
      );


    if (!elements.length) {

      return;

    }


    const now =
      Date.now();


    elements.forEach(
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

          return;

        }


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
          String(
            trade.status || ""
          ).toUpperCase() ===
          "OPEN"
      )
      .slice(0, 5);


  if (!openTrades.length) {

    box.innerHTML =
      '<div class="empty">No open trades.</div>';


    if (tradeTimerInterval) {

      clearInterval(
        tradeTimerInterval
      );

      tradeTimerInterval =
        null;

    }


    return;

  }


  box.innerHTML =
    openTrades.map(
      trade => {

        const side =
          String(
            trade.side ||
            ""
          ).toUpperCase();


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
                "
              >
                OPEN
              </div>

            </div>

          </div>

        `;

      }
    ).join("");


  startTradeCountdown();

}


/* =========================================================
   TRADE PAGE
========================================================= */

function renderTradesPage(
  trades
) {

  const box =
    $("tradesList");


  if (!box) {

    return;

  }


  if (!trades.length) {

    box.innerHTML =
      '<div class="empty">No trades yet.</div>';

    return;

  }


  box.innerHTML =
    trades.map(
      trade => {

        const side =
          String(
            trade.side ||
            ""
          ).toUpperCase();


        const status =
          String(
            trade.status ||
            "OPEN"
          ).toUpperCase();


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

          <div class="request-row">

            <div class="request-main">

              <div class="request-title">

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


              <div class="request-meta">

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


            <div class="request-amount">

              ${escapeHtml(
                resultText
              )}

            </div>

          </div>

        `;

      }
    ).join("");

}


/* =========================================================
   COMPLETE TRADE HISTORY
========================================================= */

function renderTradeHistory(
  trades
) {

  const possibleIds = [

    "tradeHistory",

    "history",

    "historyList",

    "tradeHistoryList",

    "tradingHistory"

  ];


  let box =
    null;


  for (
    const id of possibleIds
  ) {

    if ($(id)) {

      box =
        $(id);

      break;

    }

  }


  if (!box) {

    return;

  }


  if (!trades.length) {

    box.innerHTML =
      '<div class="empty">No trade history yet.</div>';

    return;

  }


  const settledTrades =
    trades.filter(
      trade =>

        String(
          trade.status ||
          ""
        ).toUpperCase() ===
        "SETTLED"

    );


  if (!settledTrades.length) {

    box.innerHTML =
      '<div class="empty">No completed trades yet.</div>';

    return;

  }


  box.innerHTML =
    settledTrades.map(
      trade => {

        const profit =
          Number(
            trade.profit ||
            0
          );


        const isWin =
          profit >= 0;


        const result =
          isWin
            ? "WIN"
            : "LOSS";


        const resultAmount =
          isWin

            ? "+" +
              money(profit)

            : "-" +
              money(
                Math.abs(
                  profit
                )
              );


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
                  String(
                    trade.side ||
                    ""
                  ).toUpperCase()
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
                  result
                )}

                <br>

                ${escapeHtml(
                  formatDate(
                    trade.settledAt ||
                    trade.createdAt
                  )
                )}

              </div>

            </div>


            <div
              class="request-amount"
              style="
                font-weight:800;
              "
            >

              ${escapeHtml(
                resultAmount
              )}

            </div>

          </div>

        `;

      }
    ).join("");

}


/* =========================================================
   OFFERS LISTENER
========================================================= */

function startOffersListener() {

  if (unsubscribeOffers) {

    unsubscribeOffers();

    unsubscribeOffers =
      null;

  }


  const offersBox =
    findFirstElement([

      "offers",

      "offersList",

      "offerList",

      "activeOffers",

      "activeOffersList"

    ]);


  /*
   * If the current HTML does not have an
   * offers container, still listen to Firestore.
   */

  const offersQuery =
    query(

      collection(
        db,
        "offers"
      ),

      limit(100)

    );


  unsubscribeOffers =
    onSnapshot(

      offersQuery,

      snapshot => {

        const offers =
          snapshot.docs.map(
            d => ({

              id:
                d.id,

              ...d.data()

            })
          );


        renderOffers(
          offers
        );

      },

      error => {

        console.error(
          "Offers listener error:",
          error
        );


        if (offersBox) {

          offersBox.innerHTML =
            '<div class="empty">Offers could not be loaded.</div>';

        }

      }

    );

}


/* =========================================================
   RENDER OFFERS
========================================================= */

function renderOffers(
  offers
) {

  const box =
    findFirstElement([

      "offers",

      "offersList",

      "offerList",

      "activeOffers",

      "activeOffersList"

    ]);


  if (!box) {

    return;

  }


  const now =
    Date.now();


  const activeOffers =
    offers.filter(
      offer => {

        if (
          offer.active === false
        ) {

          return false;

        }


        if (
          offer.enabled === false
        ) {

          return false;

        }


        const expiresAt =
          getTimestampMs(
            offer.expiresAt ||
            offer.endAt ||
            offer.validUntil
          );


        if (
          Number.isFinite(
            expiresAt
          )
          &&
          expiresAt <
            now
        ) {

          return false;

        }


        return true;

      }
    );


  if (!activeOffers.length) {

    box.innerHTML =
      '<div class="empty">No active offers available.</div>';

    return;

  }


  box.innerHTML =
    activeOffers.map(
      offer => {

        const title =
          offer.title ||
          offer.name ||
          "Special Offer";


        const description =
          offer.description ||
          offer.details ||
          "";


        const discount =
          offer.discount ||
          offer.discountPercent ||
          "";


        return `

          <div
            class="offer-card"
            style="
              padding:14px;
              margin-bottom:10px;
            "
          >

            <div
              style="
                font-size:16px;
                font-weight:800;
              "
            >

              ${escapeHtml(
                title
              )}

            </div>


            ${
              description

                ? `

                  <div
                    style="
                      margin-top:6px;
                      opacity:.8;
                    "
                  >

                    ${escapeHtml(
                      description
                    )}

                  </div>

                `

                : ""

            }


            ${
              discount

                ? `

                  <div
                    style="
                      margin-top:8px;
                      font-weight:800;
                    "
                  >

                    ${escapeHtml(
                      String(
                        discount
                      )
                    )}

                    ${
                      Number(
                        discount
                      )
                        ? "% OFF"
                        : ""
                    }

                  </div>

                `

                : ""

            }

          </div>

        `;

      }
    ).join("");

}


/* =========================================================
   REFERRAL
========================================================= */

async function loadReferralData() {

  if (!currentUser?.uid) {

    return;

  }


  try {

    const userRef =
      doc(
        db,
        "users",
        currentUser.uid
      );


    const userSnap =
      await getDoc(
        userRef
      );


    if (!userSnap.exists()) {

      return;

    }


    const user =
      userSnap.data();


    const referralCode =

      user.referralCode ||

      user.refCode ||

      user.referral_code ||

      user.code ||

      "";


    const referralCount =

      Number(

        user.referralCount ||

        user.referrals ||

        user.referralUsers ||

        0

      );


    const referralEarnings =

      Number(

        user.referralEarnings ||

        user.referralIncome ||

        user.referralProfit ||

        0

      );


    setTextIfExists(
      "referralCode",
      referralCode || "N/A"
    );


    setTextIfExists(
      "refCode",
      referralCode || "N/A"
    );


    setTextIfExists(
      "referralCount",
      String(referralCount)
    );


    setTextIfExists(
      "referrals",
      String(referralCount)
    );


    setTextIfExists(
      "referralEarnings",
      money(referralEarnings)
    );


    setTextIfExists(
      "referralIncome",
      money(referralEarnings)
    );


    /*
     * Optional referral link.
     */

    const referralLink =
      location.origin +
      location.pathname +
      "?ref=" +
      encodeURIComponent(
        referralCode
      );


    const linkElements =
      document.querySelectorAll(
        "[data-referral-link]"
      );


    linkElements.forEach(
      element => {

        if (
          "value" in element
        ) {

          element.value =
            referralLink;

        } else {

          element.textContent =
            referralLink;

        }

      }
    );


  } catch (error) {

    console.error(
      "Referral loading error:",
      error
    );

  }

}


/* =========================================================
   COPY REFERRAL CODE
========================================================= */

async function copyReferralCode() {

  const codeElement =
    findFirstElement([

      "referralCode",

      "refCode"

    ]);


  const code =
    codeElement?.textContent ||
    currentUserData?.referralCode ||
    currentUserData?.refCode ||
    "";


  if (!code || code === "N/A") {

    return;

  }


  try {

    await navigator.clipboard.writeText(
      code.trim()
    );


    showMessage(
      "Referral code copied.",
      true
    );


  } catch {

    showMessage(
      "Could not copy referral code."
    );

  }

}


$("copyReferral")?.addEventListener(
  "click",
  copyReferralCode
);


$("copyReferralCode")?.addEventListener(
  "click",
  copyReferralCode
);


/* =========================================================
   FIND ELEMENT
========================================================= */

function findFirstElement(
  ids
) {

  for (
    const id of ids
  ) {

    const element =
      $(id);

    if (element) {

      return element;

    }

  }


  return null;

}


/* =========================================================
   COLLECTION ERROR
========================================================= */

function showCollectionError(
  collectionName,
  error
) {

  console.error(
    `${collectionName} loading failed:`,
    error
  );

}


/* =========================================================
   OPEN TRADE
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
            String(
              side
            ).toUpperCase(),

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
   BUY
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
   SELL
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
      unsubscribeOffers
    ) {

      unsubscribeOffers();

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