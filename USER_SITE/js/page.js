import {
  auth,
  db
} from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
  doc,
  getDoc,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


/* =========================================================
   GLOBAL
========================================================= */

const $ = (id) => document.getElementById(id);

const ADMIN = "kundusudip019@gmail.com";

let me = null;
let rows = [];
let unsubscribeUser = null;
let unsubscribeTrades = null;

const SESSION =
  window.TRADE_CONFIG?.sessionDurationMs ??
  (5 * 60 * 1000);


/* =========================================================
   HELPERS
========================================================= */

const money = (n) => {
  const value = Number(n || 0);

  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};


const escapeHtml = (value) => {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char])
  );
};


const getDateMs = (timestamp) => {
  if (!timestamp) return 0;

  if (typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }

  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().getTime();
  }

  return 0;
};


/* =========================================================
   NAVIGATION
========================================================= */

function nav() {

  const currentPage =
    location.pathname
      .split("/")
      .pop()
      .toLowerCase();

  document
    .querySelectorAll("aside a")
    .forEach((link) => {

      const href =
        link
          .getAttribute("href")
          ?.split("/")
          .pop()
          .toLowerCase();

      if (href === currentPage) {
        link.classList.add("active");
      }
    });


  const logout = $("logout");

  if (logout) {

    logout.addEventListener("click", async () => {

      try {

        if (unsubscribeUser) {
          unsubscribeUser();
        }

        if (unsubscribeTrades) {
          unsubscribeTrades();
        }

        await signOut(auth);

        location.href = "login.html";

      } catch (error) {

        console.error("Logout error:", error);

      }

    });

  }

}


/* =========================================================
   CLOSE EXPIRED DEMO TRADE
========================================================= */

async function closeDue(trade) {

  if (!trade) return;

  if (trade.status !== "OPEN") {
    return;
  }

  const createdMs =
    getDateMs(trade.createdAt);

  if (!createdMs) {
    return;
  }

  if (
    Date.now() - createdMs <
    SESSION
  ) {
    return;
  }


  const currentUser =
    auth.currentUser;

  if (!currentUser) {
    return;
  }


  const userRef =
    doc(
      db,
      "users",
      currentUser.uid
    );

  const tradeRef =
    doc(
      db,
      "trades",
      trade.id
    );

  const marketRef =
    doc(
      db,
      "marketState",
      "demo"
    );


  try {

    await runTransaction(
      db,
      async (tx) => {

        const userSnap =
          await tx.get(userRef);

        const tradeSnap =
          await tx.get(tradeRef);

        const marketSnap =
          await tx.get(marketRef);


        if (
          !userSnap.exists() ||
          !tradeSnap.exists()
        ) {
          return;
        }


        const tradeData =
          tradeSnap.data();


        /*
         * Another browser/tab may already
         * have closed this trade.
         */
        if (tradeData.status !== "OPEN") {
          return;
        }


        /* ==============================================
           SHARED MARKET STATE
        ============================================== */

        const market =
          marketSnap.exists()
            ? marketSnap.data()
            : {
                grossProfit: 0,
                grossLoss: 0,
                netResult: 0,
                tradeCount: 0,
                profitCount: 0,
                lossCount: 0
              };


        let grossProfit =
          Number(
            market.grossProfit || 0
          );

        let grossLoss =
          Number(
            market.grossLoss || 0
          );


        const tradeCount =
          Number(
            market.tradeCount || 0
          );

        const profitCount =
          Number(
            market.profitCount || 0
          );

        const lossCount =
          Number(
            market.lossCount || 0
          );


        /* ==============================================
           RANDOM SHARED POOL RATE

           IMPORTANT:
           This is NOT saved to the user.

           It belongs to the shared demo market
           distribution for this completed trade.
        ============================================== */

        const config =
          window.TRADE_CONFIG || {};


        const minRate = Math.max(
          22,
          Number(
            config.minWinRate ?? 22
          )
        );

        const maxRate = Math.min(
          90,
          Number(
            config.maxWinRate ?? 90
          )
        );


        const poolWinRate =
          Math.floor(
            minRate +
            Math.random() *
            (maxRate - minRate + 1)
          );


        /* ==============================================
           RANDOM P/L AMOUNT

           Demo amount range:
           ₹10 – ₹50 by default
        ============================================== */

        const minAmount = Math.max(
          1,
          Number(
            config.minAmount ?? 10
          )
        );

        const maxAmount = Math.max(
          minAmount,
          Number(
            config.maxAmount ?? 50
          )
        );


        const pnlAmount =
          Math.floor(
            minAmount +
            Math.random() *
            (maxAmount - minAmount + 1)
          );


        /* ==============================================
           SHARED DEMO OUTCOME
        ============================================== */

        const wantsProfit =
          Math.random() <
          poolWinRate / 100;


        /*
         * Keep aggregate demo result from
         * becoming positive.

         * This is a virtual/demo simulation only.
         */

        const availableLoss =
          Math.max(
            0,
            grossLoss - grossProfit
          );


        let pnl;


        if (
          wantsProfit &&
          availableLoss > 0
        ) {

          pnl =
            Math.min(
              pnlAmount,
              availableLoss
            );

        } else {

          pnl =
            -pnlAmount;

        }


        /* ==============================================
           RETURN ORIGINAL TRADE STAKE + P/L
        ============================================== */

        const userData =
          userSnap.data();

        const currentBalance =
          Number(
            userData.balance || 0
          );


        const tradeStake =
          Number(
            tradeData.amount || 0
          );


        const newBalance =
          currentBalance +
          tradeStake +
          pnl;


        /* ==============================================
           UPDATE USER
        ============================================== */

        tx.update(
          userRef,
          {
            balance:
              Number(
                newBalance.toFixed(2)
              )
          }
        );


        /* ==============================================
           UPDATE TRADE
        ============================================== */

        tx.update(
          tradeRef,
          {
            status: "CLOSED",

            pnl:
              Number(
                pnl.toFixed(2)
              ),

            platformProfit:
              Number(
                (
                  5 +
                  Math.random() * 5
                ).toFixed(2)
              ),

            /*
             * This is informational for
             * the demo trade only.
             */
            poolWinRate,

            result:
              pnl > 0
                ? "PROFIT"
                : "LOSS",

            closedAt:
              serverTimestamp()
          }
        );


        /* ==============================================
           UPDATE SHARED MARKET STATE
        ============================================== */

        if (pnl > 0) {

          grossProfit += pnl;

        } else {

          grossLoss +=
            Math.abs(pnl);

        }


        tx.set(
          marketRef,
          {
            grossProfit:
              Number(
                grossProfit.toFixed(2)
              ),

            grossLoss:
              Number(
                grossLoss.toFixed(2)
              ),

            netResult:
              Number(
                (
                  grossProfit -
                  grossLoss
                ).toFixed(2)
              ),

            tradeCount:
              tradeCount + 1,

            profitCount:
              profitCount +
              (pnl > 0 ? 1 : 0),

            lossCount:
              lossCount +
              (pnl < 0 ? 1 : 0),

            lastPoolWinRate:
              poolWinRate,

            updatedAt:
              serverTimestamp()
          },
          {
            merge: true
          }
        );

      }
    );

  } catch (error) {

    console.error(
      "closeDue error:",
      error
    );

  }

}


/* =========================================================
   OPEN DEMO TRADE
========================================================= */

async function trade(side) {

  const input =
    $("amount");

  const message =
    $("tradeMsg");


  const amount =
    Number(
      input?.value
    );


  if (
    !Number.isFinite(amount) ||
    amount < 100 ||
    amount > 500
  ) {

    if (message) {

      message.textContent =
        "Amount must be between virtual ₹100 and ₹500.";

      message.className =
        "msg";

    }

    return;
  }


  if (!me) {

    if (message) {
      message.textContent =
        "Please wait for your account to load.";
    }

    return;
  }


  const userRef =
    doc(
      db,
      "users",
      me.uid
    );


  try {

    await runTransaction(
      db,
      async (tx) => {

        const userSnap =
          await tx.get(userRef);


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


        if (balance < amount) {
          throw new Error(
            "Insufficient virtual balance."
          );
        }


        const tradeRef =
          doc(
            collection(
              db,
              "trades"
            )
          );


        /*
         * Reserve the virtual trade amount.
         */
        tx.update(
          userRef,
          {
            balance:
              Number(
                (balance - amount)
                  .toFixed(2)
              )
          }
        );


        /*
         * Demo market price.
         */
        const price =
          68420.35 +
          (
            Math.random() - 0.5
          ) * 250;


        tx.set(
          tradeRef,
          {
            userId:
              me.uid,

            side:
              side,

            amount:
              Number(
                amount.toFixed(2)
              ),

            price:
              Number(
                price.toFixed(2)
              ),

            status:
              "OPEN",

            pnl:
              0,

            platformProfit:
              0,

            createdAt:
              serverTimestamp(),

            sessionMinutes:
              5
          }
        );

      }
    );


    if (message) {

      message.textContent =
        `${side} opened. Result will appear after 5 minutes.`;

      message.className =
        "msg ok";

    }

  } catch (error) {

    console.error(
      "Trade error:",
      error
    );


    if (message) {

      message.textContent =
        error.message ||
        "Trade failed.";

      message.className =
        "msg";

    }

  }

}


/* =========================================================
   RENDER TRADES
========================================================= */

function render() {

  const openTrades =
    rows.filter(
      (trade) =>
        trade.status === "OPEN"
    );


  const closedTrades =
    rows.filter(
      (trade) =>
        trade.status === "CLOSED"
    );


  /* Open count */

  if ($("openCount")) {

    $("openCount").textContent =
      openTrades.length;

  }


  /* Total P/L */

  const totalPnl =
    closedTrades.reduce(
      (total, trade) =>
        total +
        Number(
          trade.pnl || 0
        ),
      0
    );


  if ($("pnl")) {

    $("pnl").textContent =
      money(totalPnl);

  }


  /* ==============================================
     OPEN TRADES HTML
  ============================================== */

  const openHtml =
    openTrades
      .map((trade) => {

        const created =
          getDateMs(
            trade.createdAt
          );


        const elapsed =
          Date.now() -
          created;


        const remaining =
          Math.max(
            0,
            SESSION - elapsed
          );


        const seconds =
          Math.ceil(
            remaining / 1000
          );


        return `
          <div class="row">

            <span>
              <b>
                ${escapeHtml(
                  trade.side
                )}
              </b>

              • ${money(
                trade.amount
              )}

              <br>

              <small class="muted">
                ${money(
                  trade.price
                )}
                •
                ${seconds}s remaining
              </small>
            </span>

            <span class="green">
              OPEN
            </span>

          </div>
        `;

      })
      .join("");


  const emptyOpen =
    '<div class="empty">No open trades.</div>';


  if ($("openTrades")) {

    $("openTrades").innerHTML =
      openHtml ||
      emptyOpen;

  }


  if ($("tradesList")) {

    $("tradesList").innerHTML =
      openHtml ||
      emptyOpen;

  }


  /* ==============================================
     HISTORY
  ============================================== */

  const historyHtml =
    closedTrades
      .map((trade) => {

        const pnl =
          Number(
            trade.pnl || 0
          );


        const positive =
          pnl >= 0;


        const cls =
          positive
            ? "green"
            : "red";


        const sign =
          positive
            ? "+"
            : "";


        const date =
          trade.closedAt
            ?.toDate
            ?.()
            ?.toLocaleString
            ?.() ||
          "Completed";


        return `
          <div class="row">

            <span>

              <b>
                ${escapeHtml(
                  trade.side
                )}
              </b>

              • ${money(
                trade.amount
              )}

              <br>

              <small class="muted">
                ${escapeHtml(
                  date
                )}
                •
                ${
                  positive
                    ? "PROFIT"
                    : "LOSS"
                }
              </small>

            </span>

            <span class="${cls}">
              ${sign}${money(pnl)}
            </span>

          </div>
        `;

      })
      .join("");


  if ($("historyList")) {

    $("historyList").innerHTML =
      historyHtml ||
      '<div class="empty">No completed trades yet.</div>';

  }

}


/* =========================================================
   OFFERS
========================================================= */

async function offers() {

  const box =
    $("offersList");

  if (!box) {
    return;
  }


  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "offers"
        )
      );


    box.innerHTML =
      snapshot.docs
        .map((item) => {

          const data =
            item.data();


          return `
            <div class="row">

              <b>
                🎁
                ${escapeHtml(
                  data.title ||
                  "Offer"
                )}
              </b>

              <span>
                ${escapeHtml(
                  data.description ||
                  "Virtual offer"
                )}
              </span>

            </div>
          `;

        })
        .join("") ||
      '<div class="empty">No offers available.</div>';

  } catch (error) {

    console.error(
      "Offers error:",
      error
    );

    box.innerHTML =
      '<div class="empty">Could not load offers.</div>';

  }

}


/* =========================================================
   WALLET ACTIVITY
========================================================= */

async function wallet() {

  const box =
    $("walletList");

  if (!box || !me) {
    return;
  }


  try {

    const walletQuery =
      query(
        collection(
          db,
          "walletTransactions"
        ),
        where(
          "userId",
          "==",
          me.uid
        )
      );


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


    const [
      walletSnapshot,
      topupSnapshot,
      withdrawalSnapshot
    ] = await Promise.all([
      getDocs(walletQuery),
      getDocs(topupQuery),
      getDocs(withdrawalQuery)
    ]);


    const items = [];


    /* Wallet transactions */

    walletSnapshot.docs
      .forEach((docSnap) => {

        const data =
          docSnap.data();


        items.push({
          date:
            getDateMs(
              data.createdAt
            ),

          html: `
            <div class="row">

              <span>
                ${escapeHtml(
                  data.type ||
                  "Wallet"
                )}
              </span>

              <span class="green">
                +${money(
                  data.amount
                )}
              </span>

            </div>
          `
        });

      });


    /* Add balance requests */

    topupSnapshot.docs
      .forEach((docSnap) => {

        const data =
          docSnap.data();


        items.push({
          date:
            getDateMs(
              data.createdAt
            ),

          html: `
            <div class="row">

              <span>
                Add balance request
                •
                ${escapeHtml(
                  data.status ||
                  "PENDING"
                )}
              </span>

              <span>
                ${money(
                  data.amount
                )}
              </span>

            </div>
          `
        });

      });


    /* Withdrawal requests */

    withdrawalSnapshot.docs
      .forEach((docSnap) => {

        const data =
          docSnap.data();


        items.push({
          date:
            getDateMs(
              data.createdAt
            ),

          html: `
            <div class="row">

              <span>
                ${escapeHtml(
                  data.type ||
                  "Wallet"
                )}
              </span>

              <span class="green">
                +${money(
                  data.amount
                )}
              </span>

            </div>
          `
        });

      });


    /* Add balance requests */

    topupSnapshot.docs
      .forEach((docSnap) => {

        const data =
          docSnap.data();


        items.push({
          date:
            getDateMs(
              data.createdAt
            ),

          html: `
            <div class="row">

              <span>
                Add balance request
                •
                ${escapeHtml(
                  data.status ||
                  "PENDING"
                )}
              </span>

              <span>
                ${money(
                  data.amount
                )}
              </span>

            </div>
          `
        });

      });


    /* Withdrawal requests */

    withdrawalSnapshot.docs
      .forEach((docSnap) => {

        const data =
          docSnap.data();


        items.push({
          date:
            getDateMs(
              data.createdAt
            ),

          html: `
            <div class="row">

              <span>
                Withdrawal request
                •
                ${escapeHtml(
                  data.status ||
                  "PENDING"
                )}
              </span>

              <span class="red">
                -${money(
                  data.amount
                )}
              </span>

            </div>
          `
        });

      });


    /* Newest first */

    items.sort(
      (a, b) =>
        b.date - a.date
    );


    box.innerHTML =
      items
        .map(
          (item) =>
            item.html
        )
        .join("") ||
      '<div class="empty">No wallet activity yet.</div>';


  } catch (error) {

    console.error(
      "Wallet error:",
      error
    );


    box.innerHTML =
      '<div class="empty">No wallet activity yet.</div>';

  }

}


/* =========================================================
   ADD DEMO BALANCE REQUEST
========================================================= */

async function requestTopup() {

  const input =
    $("topupAmount");

  const output =
    $("topupMsg");


  const amount =
    Number(
      input?.value
    );


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    if (output) {

      output.textContent =
        "Enter a positive demo amount.";

      output.className =
        "msg";

    }

    return;
  }


  try {

    await addDoc(
      collection(
        db,
        "topupRequests"
      ),
      {
        userId:
          me.uid,

        amount:
          Number(
            amount.toFixed(2)
          ),

        status:
          "PENDING",

        createdAt:
          serverTimestamp()
      }
    );


    if (input) {
      input.value = "";
    }


    if (output) {

      output.textContent =
        "Add-balance request submitted for admin review.";

      output.className =
        "msg ok";

    }


    await wallet();


  } catch (error) {

    console.error(
      "Topup error:",
      error
    );


    if (output) {

      output.textContent =
        error.message ||
        "Request failed.";

      output.className =
        "msg";

    }

  }

}


/* =========================================================
   WITHDRAWAL REQUEST
========================================================= */

async function requestWithdrawal() {

  const input =
    $("withdrawAmount");

  const noteInput =
    $("withdrawNote");

  const output =
    $("withdrawMsg");


  const amount =
    Number(
      input?.value
    );


  /*
   * Minimum withdrawal = ₹50
   */

  if (
    !Number.isFinite(amount) ||
    amount < 50
  ) {

    if (output) {

      output.textContent =
        "Minimum withdrawal is ₹50.";

      output.className =
        "msg";

    }

    return;
  }


  /*
   * Current Firebase balance
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

    if (output) {

      output.textContent =
        "User account not found.";

    }

    return;
  }


  const balance =
    Number(
      userSnap.data().balance || 0
    );


  /*
   * At least ₹100 must remain.
   *
   * Example:
   * ₹150 balance -> max ₹50 withdrawal
   * ₹200 balance -> max ₹100 withdrawal
   */

  const maximumWithdrawal =
    Math.max(
      0,
      balance - 100
    );


  if (
    amount >
    maximumWithdrawal
  ) {

    if (output) {

      if (balance <= 100) {

        output.textContent =
          "Your wallet balance must be above ₹100 to withdraw.";

      } else {

        output.textContent =
          `Maximum withdrawal from your current balance is ${money(maximumWithdrawal)}. At least ₹100 must remain in your wallet.`;

      }

      output.className =
        "msg";

    }

    return;
  }


  try {

    await addDoc(
      collection(
        db,
        "withdrawalRequests"
      ),
      {
        userId:
          me.uid,

        amount:
          Number(
            amount.toFixed(2)
          ),

        note:
          noteInput?.value?.trim() ||
          "",

        status:
          "PENDING",

        createdAt:
          serverTimestamp()
      }
    );


    if (input) {
      input.value = "";
    }


    if (noteInput) {
      noteInput.value = "";
    }


    if (output) {

      output.textContent =
        "Withdrawal request submitted for admin review.";

      output.className =
        "msg ok";

    }


    await wallet();


  } catch (error) {

    console.error(
      "Withdrawal error:",
      error
    );


    if (output) {

      output.textContent =
        error.message ||
        "Withdrawal request failed.";

      output.className =
        "msg";

    }

  }

}


/* =========================================================
   AUTH + FIREBASE
========================================================= */

onAuthStateChanged(
  auth,
  async (user) => {

    nav();


    /*
     * Not logged in
     */

    if (!user) {

      location.href =
        "login.html";

      return;
    }


    /*
     * Admin should use the
     * separate Admin site.
     */

    if (
      user.email?.toLowerCase() ===
      ADMIN.toLowerCase()
    ) {

      location.href =
        "../ADMIN_SITE/login.html";

      return;
    }


    try {

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
       * Disabled users cannot use
       * the demo platform.
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
       * Current user object
       */

      me = {
        uid:
          user.uid,

        ...userData
      };


      /* ==============================================
         USER NAME
      ============================================== */

      if ($("userName")) {

        $("userName").textContent =
          me.name ||
          "Trader";

      }


      if ($("settingName")) {

        $("settingName").value =
          me.name ||
          "";

      }


      if ($("settingEmail")) {

        $("settingEmail").value =
          me.email ||
          user.email ||
          "";

      }


      /* ==============================================
         REALTIME USER BALANCE
      ============================================== */

      unsubscribeUser =
        onSnapshot(
          userRef,
          (snapshot) => {

            if (!snapshot.exists()) {
              return;
            }


            const data =
              snapshot.data();


            /*
             * IMPORTANT:
             * Keep me.balance updated.
             */

            me = {
              ...me,
              ...data
            };


            const balanceText =
              money(
                data.balance || 0
              );


            if ($("topBalance")) {

              $("topBalance")
                .textContent =
                balanceText;

            }


            if ($("balance")) {

              $("balance")
                .textContent =
                balanceText;

            }


            if ($("walletBalance")) {

              $("walletBalance")
                .textContent =
                balanceText;

            }

          },
          (error) => {

            console.error(
              "User snapshot error:",
              error
            );

          }
        );


      /* ==============================================
         TRADES

         We intentionally do NOT use orderBy()
         here, so a Firebase composite index
         is not required.
      ============================================== */

      const tradesQuery =
        query(
          collection(
            db,
            "trades"
          ),
          where(
            "userId",
            "==",
            user.uid
          )
        );


      unsubscribeTrades =
        onSnapshot(
          tradesQuery,
          (snapshot) => {

            rows =
              snapshot.docs
                .map(
                  (docSnap) => ({
                    id:
                      docSnap.id,

                    ...docSnap.data()
                  })
                )
                .sort(
                  (a, b) =>
                    getDateMs(
                      b.createdAt
                    ) -
                    getDateMs(
                      a.createdAt
                    )
                );


            /*
             * Check expired trades.
             */

            rows
              .filter(
                (trade) =>
                  trade.status ===
                  "OPEN"
              )
              .forEach(
                closeDue
              );


            render();

          },
          (error) => {

            console.error(
              "Trades snapshot error:",
              error
            );

          }
        );


      /* ==============================================
         BUTTONS
      ============================================== */

      $("buy")?.addEventListener(
        "click",
        () => trade("BUY")
      );


      $("sell")?.addEventListener(
        "click",
        () => trade("SELL")
      );


      $("refreshOffers")
        ?.addEventListener(
          "click",
          offers
        );


      $("topupForm")
        ?.addEventListener(
          "submit",
          (event) => {

            event.preventDefault();

            requestTopup();

          }
        );


      $("withdrawForm")
        ?.addEventListener(
          "submit",
          (event) => {

            event.preventDefault();

            requestWithdrawal();

          }
        );


      /* ==============================================
         REFERRAL
      ============================================== */

      if ($("refLink")) {

        const referralCode =
          me.referralCode ||
          "";


        const referralUrl =
          location.origin +
          location.pathname
            .replace(
              /[^/]+$/,
              "register.html"
            ) +
          "?ref=" +
          encodeURIComponent(
            referralCode
          );


        $("refLink").value =
          referralUrl;


        if ($("refStats")) {

          $("refStats").textContent =
            `Code: ${referralCode || "-"} • Referrals: ${Number(me.referralCount || 0)}`;

        }


        $("copyRef")
          ?.addEventListener(
            "click",
            async () => {

              try {

                await navigator.clipboard.writeText(
                  referralUrl
                );


                const oldText =
                  $("copyRef")
                    .textContent;


                $("copyRef")
                  .textContent =
                  "Copied!";


                setTimeout(
                  () => {

                    if ($("copyRef")) {

                      $("copyRef")
                        .textContent =
                        oldText ||
                        "Copy";

                    }

                  },
                  1500
                );

              } catch (error) {

                console.error(
                  "Copy error:",
                  error
                );

              }

            }
          );

      }


      /* ==============================================
         INITIAL LOAD
      ============================================== */

      await offers();

      await wallet();


      /* ==============================================
         OPEN TRADE COUNTDOWN
      ============================================== */

      setInterval(
        () => {

          rows
            .filter(
              (trade) =>
                trade.status ===
                "OPEN"
            )
            .forEach(
              closeDue
            );


          render();

        },
        1000
      );


      /* ==============================================
         MARKET PRICE

         This is a demo display price.
         The chart.js handles the animated chart.
      ============================================== */

      setInterval(
        () => {

          const price =
            68420.35 +
            (
              Math.random() - 0.5
            ) * 250;


          if ($("marketPrice")) {

            $("marketPrice")
              .textContent =
              money(price);

          }

        },
        1000
      );


    } catch (error) {

      console.error(
        "Dashboard initialization error:",
        error
      );

      await signOut(auth);

      location.href =
        "login.html";

    }

  }
);