// ============================================================
// TradeSim Pro - Admin Page
// Firebase Admin Dashboard + Payment Approval
// ============================================================

import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


// ============================================================
// CONFIG
// ============================================================

const ADMIN_EMAIL =
  "kundusudip019@gmail.com";

const PAYMENT_SERVER_URL =
  "https://tradesim-pro.onrender.com";

const MIN_WITHDRAWAL = 50;
const MIN_REMAINING_BALANCE = 100;

const $ = id =>
  document.getElementById(id);


// ============================================================
// DEFAULT SETTINGS
// ============================================================

const DEFAULTS = {

  min: 100,
  max: 500,

  tradeHours: 200,

  userProfitMin: 10,
  userProfitMax: 50,

  platformProfitMin: 5,
  platformProfitMax: 10

};


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


function getDateMs(value) {

  if (!value) {
    return 0;
  }

  if (
    typeof value.toMillis === "function"
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


async function parseJson(response) {

  try {

    return await response.json();

  } catch {

    return null;

  }

}


// ============================================================
// AUTH
// ============================================================

onAuthStateChanged(
  auth,
  async user => {

    if (!user) {

      location.href =
        "login.html";

      return;

    }


    const email =
      String(
        user.email || ""
      )
        .trim()
        .toLowerCase();


    if (
      email !==
      ADMIN_EMAIL.toLowerCase()
    ) {

      await signOut(auth);

      location.href =
        "login.html";

      return;

    }


    try {

      const userSnap =
        await getDoc(
          doc(
            db,
            "users",
            user.uid
          )
        );


      if (
        userSnap.exists() &&
        userSnap.data().active === false
      ) {

        await signOut(auth);

        location.href =
          "login.html";

        return;

      }


      loadUsers();

      loadTrades();

      loadSettings();

      loadRequests();

      testPaymentServer();

    } catch (error) {

      console.error(
        "Admin initialization error:",
        error
      );

    }

  }
);


// ============================================================
// PAYMENT SERVER TEST
// ============================================================

async function testPaymentServer() {

  try {

    const response =
      await fetch(
        PAYMENT_SERVER_URL + "/",
        {
          method: "GET",
          cache: "no-store"
        }
      );


    const result =
      await parseJson(
        response
      );


    if (
      response.ok &&
      result?.ok
    ) {

      console.log(
        "✅ Payment server connected:",
        result
      );

    } else {

      console.warn(
        "⚠️ Payment server returned:",
        result
      );

    }

  } catch (error) {

    console.error(
      "❌ Payment server connection error:",
      error
    );

  }

}


// ============================================================
// SETTINGS
// ============================================================

async function loadSettings() {

  try {

    const snap =
      await getDoc(
        doc(
          db,
          "settings",
          "trading"
        )
      );


    const data =
      snap.exists()
        ? snap.data()
        : {};


    [
      "min",
      "max",
      "tradeHours",
      "userProfitMin",
      "userProfitMax",
      "platformProfitMin",
      "platformProfitMax"
    ].forEach(
      key => {

        if ($(key)) {

          $(key).value =
            data[key] ??
            DEFAULTS[key];

        }

      }
    );


  } catch (error) {

    console.error(
      "Settings load error:",
      error
    );

  }

}


// ============================================================
// SAVE SETTINGS
// ============================================================

$("saveSettings")?.addEventListener(
  "click",
  async () => {

    try {

      const min =
        Number(
          $("min")?.value
        );

      const max =
        Number(
          $("max")?.value
        );


      if (
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        min < 100 ||
        max > 500 ||
        min > max
      ) {

        throw new Error(
          "Trading amount must be between ₹100 and ₹500."
        );

      }


      const data = {

        min,

        max,

        tradeHours:
          Number(
            $("tradeHours")?.value || 0
          ),

        userProfitMin:
          Number(
            $("userProfitMin")?.value || 0
          ),

        userProfitMax:
          Number(
            $("userProfitMax")?.value || 0
          ),

        platformProfitMin:
          Number(
            $("platformProfitMin")?.value || 0
          ),

        platformProfitMax:
          Number(
            $("platformProfitMax")?.value || 0
          ),

        updatedAt:
          serverTimestamp()

      };


      await setDoc(
        doc(
          db,
          "settings",
          "trading"
        ),
        data,
        {
          merge: true
        }
      );


      showMessage(
        $("settingsMsg"),
        "Trading settings saved.",
        true
      );


    } catch (error) {

      showMessage(
        $("settingsMsg"),
        error.message ||
        "Could not save settings.",
        false
      );

    }

  }
);


// ============================================================
// OFFERS
// ============================================================

$("addOffer")?.addEventListener(
  "click",
  async () => {

    try {

      const title =
        $("offerTitle")
          ?.value
          ?.trim();


      const description =
        $("offerDescription")
          ?.value
          ?.trim();


      if (!title) {

        throw new Error(
          "Enter an offer title."
        );

      }


      await addDoc(
        collection(
          db,
          "offers"
        ),
        {

          title,

          description,

          createdAt:
            serverTimestamp(),

          active:
            true

        }
      );


      if ($("offerTitle")) {

        $("offerTitle").value =
          "";

      }


      if ($("offerDescription")) {

        $("offerDescription").value =
          "";

      }


      showMessage(
        $("offerMsg"),
        "Offer created successfully.",
        true
      );


    } catch (error) {

      showMessage(
        $("offerMsg"),
        error.message ||
        "Could not create offer.",
        false
      );

    }

  }
);


// ============================================================
// USERS
// ============================================================

function loadUsers() {

  onSnapshot(

    query(
      collection(
        db,
        "users"
      ),
      orderBy(
        "createdAt",
        "desc"
      )
    ),

    snapshot => {

      const users =
        snapshot.docs.map(
          d => ({

            id:
              d.id,

            ...d.data()

          })
        );


      if ($("usersCount")) {

        $("usersCount").textContent =
          users.length;

      }


      if ($("usersSummary")) {

        $("usersSummary").textContent =
          users.length;

      }


      const active =
        users.filter(
          user =>
            user.active !== false
        ).length;


      if ($("activeUsers")) {

        $("activeUsers").textContent =
          active;

      }


      if ($("activeSummary")) {

        $("activeSummary").textContent =
          active;

      }


      const table =
        $("usersTable");


      if (!table) {
        return;
      }


      table.innerHTML =
        users
          .map(
            user => {

              const uid =
                user.uid ||
                user.id;


              const balance =
                Number(
                  user.balance || 0
                );


              return `

                <tr>

                  <td>

                    ${escapeHtml(
                      user.name || "-"
                    )}

                    <br>

                    <small>

                      ${escapeHtml(
                        String(uid)
                          .slice(0, 8)
                      )}

                    </small>

                  </td>


                  <td>

                    ${escapeHtml(
                      user.email || "-"
                    )}

                  </td>


                  <td>

                    <b>
                      ₹${balance.toFixed(2)}
                    </b>

                  </td>


                  <td>

                    <span>
                      Wallet controlled by
                      approved payment requests.
                    </span>

                  </td>


                  <td>

                    ${
                      user.active === false
                        ? "🔴 Inactive"
                        : "🟢 Active"
                    }

                  </td>


                  <td>

                    ${escapeHtml(
                      user.referralCode || "-"
                    )}

                    (
                    ${Number(
                      user.referralCount || 0
                    )}
                    )

                  </td>


                  <td>

                    <button

                      class="tiny toggle"

                      data-uid="${escapeHtml(
                        uid
                      )}"

                      data-active="${
                        user.active !== false
                      }"

                    >

                      ${
                        user.active === false
                          ? "Activate"
                          : "Deactivate"
                      }

                    </button>

                  </td>

                </tr>

              `;

            }
          )
          .join("");


      if (!users.length) {

        table.innerHTML = `

          <tr>

            <td colspan="7">
              No users found.
            </td>

          </tr>

        `;

      }


      document
        .querySelectorAll(".toggle")
        .forEach(
          button => {

            button.onclick =
              () =>
                toggleUser(
                  button.dataset.uid,
                  button.dataset.active === "true"
                );

          }
        );

    },

    error => {

      console.error(
        "Users listener error:",
        error
      );

    }

  );

}


// ============================================================
// TOGGLE USER
// ============================================================

async function toggleUser(
  uid,
  currentlyActive
) {

  try {

    await updateDoc(
      doc(
        db,
        "users",
        uid
      ),
      {
        active:
          !currentlyActive
      }
    );


  } catch (error) {

    console.error(
      "User status update error:",
      error
    );

  }

}


// ============================================================
// TRADES
// ============================================================

function loadTrades() {

  onSnapshot(

    query(
      collection(
        db,
        "trades"
      ),
      orderBy(
        "createdAt",
        "desc"
      )
    ),

    snapshot => {

      const trades =
        snapshot.docs.map(
          d => d.data()
        );


      if ($("tradesCount")) {

        $("tradesCount").textContent =
          trades.length;

      }


      const volume =
        trades.reduce(
          (total, trade) =>
            total +
            Number(
              trade.amount || 0
            ),
          0
        );


      const platformProfit =
        trades.reduce(
          (total, trade) =>
            total +
            Number(
              trade.platformProfit || 0
            ),
          0
        );


      if ($("volume")) {

        $("volume").textContent =
          "₹" +
          volume.toFixed(2);

      }


      if ($("platformProfit")) {

        $("platformProfit").textContent =
          "₹" +
          platformProfit.toFixed(2);

      }


      const table =
        $("tradesTable");


      if (!table) {
        return;
      }


      table.innerHTML =
        trades
          .map(
            trade => `

              <tr>

                <td>

                  ${escapeHtml(
                    String(
                      trade.userId || "-"
                    ).slice(0, 8)
                  )}

                </td>


                <td>

                  ${escapeHtml(
                    trade.side || "-"
                  )}

                </td>


                <td>

                  ₹${Number(
                    trade.amount || 0
                  ).toFixed(2)}

                </td>


                <td>

                  ₹${Number(
                    trade.price || 0
                  ).toFixed(2)}

                </td>


                <td>

                  ₹${Number(
                    trade.pnl || 0
                  ).toFixed(2)}

                </td>


                <td>

                  ₹${Number(
                    trade.platformProfit || 0
                  ).toFixed(2)}

                </td>


                <td>

                  ${escapeHtml(
                    trade.status || "-"
                  )}

                </td>

              </tr>

            `
          )
          .join("");


      if (!trades.length) {

        table.innerHTML = `

          <tr>

            <td colspan="7">
              No trades found.
            </td>

          </tr>

        `;

      }

    },

    error => {

      console.error(
        "Trades listener error:",
        error
      );

    }

  );

}


// ============================================================
// LOAD PAYMENT REQUESTS
// ============================================================

function loadRequests() {

  const topupQuery =
    query(
      collection(
        db,
        "topupRequests"
      ),
      orderBy(
        "createdAt",
        "desc"
      )
    );


  const withdrawalQuery =
    query(
      collection(
        db,
        "withdrawalRequests"
      ),
      orderBy(
        "createdAt",
        "desc"
      )
    );


  onSnapshot(
    topupQuery,

    snapshot => {

      renderRequests(
        "topup",
        snapshot
      );

    },

    error => {

      console.error(
        "Top-up request listener error:",
        error
      );

    }
  );


  onSnapshot(
    withdrawalQuery,

    snapshot => {

      renderRequests(
        "withdrawal",
        snapshot
      );

    },

    error => {

      console.error(
        "Withdrawal request listener error:",
        error
      );

    }
  );

}


// ============================================================
// RENDER REQUESTS
// ============================================================

function renderRequests(
  type,
  snapshot
) {

  const collectionName =
    type === "withdrawal"
      ? "withdrawalRequests"
      : "topupRequests";


  const table =
    type === "withdrawal"
      ? $("withdrawalTable")
      : $("topupTable");


  if (!table) {
    return;
  }


  const requests =
    snapshot.docs.map(
      item => ({

        id:
          item.id,

        ...item.data()

      })
    );


  table.innerHTML =
    requests
      .map(
        request => {

          const status =
            String(
              request.status ||
              "PENDING"
            ).toUpperCase();


          const amount =
            Number(
              request.amount || 0
            );


          const userId =
            request.userId ||
            "-";


          const createdAt =
            formatDate(
              request.createdAt
            );


          const pending =
            status === "PENDING";


          return `

            <tr>

              <td>

                ${escapeHtml(
                  String(userId)
                    .slice(0, 8)
                )}

              </td>


              <td>

                ₹${amount.toFixed(2)}

              </td>


              <td>

                ${escapeHtml(
                  request.utr ||
                  request.upiId ||
                  "-"
                )}

              </td>


              <td>

                ${escapeHtml(
                  createdAt
                )}

              </td>


              <td>

                ${escapeHtml(
                  status
                )}

              </td>


              <td>

                ${
                  pending

                    ? `

                      <button

                        class="tiny approve-request"

                        data-c="${escapeHtml(
                          collectionName
                        )}"

                        data-id="${escapeHtml(
                          request.id
                        )}"

                      >
                        Approve
                      </button>


                      <button

                        class="tiny reject-request"

                        data-c="${escapeHtml(
                          collectionName
                        )}"

                        data-id="${escapeHtml(
                          request.id
                        )}"

                      >
                        Reject
                      </button>

                    `

                    : "Processed"
                }

              </td>

            </tr>

          `;

        }
      )
      .join("");


  if (!requests.length) {

    table.innerHTML = `

      <tr>

        <td colspan="6">
          No requests found.
        </td>

      </tr>

    `;

  }


  table
    .querySelectorAll(
      ".approve-request"
    )
    .forEach(
      button => {

        button.onclick =
          () =>
            processRequest(
              button,
              "APPROVED"
            );

      }
    );


  table
    .querySelectorAll(
      ".reject-request"
    )
    .forEach(
      button => {

        button.onclick =
          () =>
            processRequest(
              button,
              "REJECTED"
            );

      }
    );

}


// ============================================================
// APPROVE / REJECT REQUEST
// SERVER SIDE
// ============================================================

async function processRequest(
  button,
  status
) {

  const collectionName =
    button.dataset.c;

  const requestId =
    button.dataset.id;


  const output =
    $("requestMsg");


  if (
    !requestId ||
    !collectionName
  ) {

    showMessage(
      output,
      "Invalid request.",
      false
    );

    return;

  }


  try {

    button.disabled =
      true;

    button.textContent =
      "Processing...";


    const user =
      auth.currentUser;


    if (!user) {

      throw new Error(
        "Admin authentication required."
      );

    }


    const email =
      String(
        user.email || ""
      )
        .trim()
        .toLowerCase();


    if (
      email !==
      ADMIN_EMAIL.toLowerCase()
    ) {

      throw new Error(
        "Admin access denied."
      );

    }


    /*
     * Get a fresh Firebase ID token.
     */

    const idToken =
      await user.getIdToken(
        true
      );


    const type =
      collectionName ===
      "withdrawalRequests"

        ? "withdrawal"

        : "topup";


    const response =
      await fetch(

        PAYMENT_SERVER_URL +
        "/api/admin/request-status",

        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json",

            "Authorization":
              "Bearer " +
              idToken

          },

          body:
            JSON.stringify({

              requestId,

              type,

              status

            })

        }

      );


    const result =
      await parseJson(
        response
      );


    if (
      !response.ok ||
      !result?.ok
    ) {

      throw new Error(
        result?.message ||
        `Request failed (${response.status}).`
      );

    }


    showMessage(
      output,

      status === "APPROVED"
        ? "Request approved successfully."
        : "Request rejected successfully.",

      true
    );


    console.log(
      "Admin request update:",
      result
    );


  } catch (error) {

    console.error(
      "Request processing error:",
      error
    );


    showMessage(
      output,

      error.message ||
      "Could not process request.",

      false
    );


  } finally {

    button.disabled =
      false;

    button.textContent =
      status === "APPROVED"
        ? "Approve"
        : "Reject";

  }

}


// ============================================================
// LOGOUT
// ============================================================

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