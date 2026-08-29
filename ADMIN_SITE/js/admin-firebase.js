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


/* =========================================================
   CONFIG
========================================================= */

const ADMIN_EMAIL =
  "kundusudip019@gmail.com";

/*
 * Render deployment will be done at the end.
 *
 * Keep localhost for now.
 */
const PAYMENT_SERVER_URL =
  "http://localhost:10000";


const MIN_WITHDRAWAL = 50;
const MIN_REMAINING_BALANCE = 100;

const $ =
  id => document.getElementById(id);


/* =========================================================
   DEFAULT TRADING SETTINGS
========================================================= */

const DEFAULTS = {

  min: 100,

  max: 500,

  tradeHours: 200,

  userProfitMin: 10,

  userProfitMax: 50,

  platformProfitMin: 5,

  platformProfitMax: 10

};


/* =========================================================
   AUTH
========================================================= */

onAuthStateChanged(
  auth,
  user => {

    if (
      !user ||
      user.email !== ADMIN_EMAIL
    ) {

      location.href =
        "login.html";

      return;
    }


    loadUsers();

    loadTrades();

    loadSettings();

    loadRequests();

  }
);


/* =========================================================
   SETTINGS
========================================================= */

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
    ]
    .forEach(
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


/* =========================================================
   SAVE SETTINGS
========================================================= */

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


/* =========================================================
   OFFERS
========================================================= */

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

          active: true

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


/* =========================================================
   USERS
========================================================= */

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

            id: d.id,

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

                    ${
                      Number(
                        user.referralCount || 0
                      )
                    }

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
        .querySelectorAll(
          ".toggle"
        )
        .forEach(
          button => {

            button.onclick =
              () =>
                toggleUser(
                  button.dataset.uid,

                  button.dataset.active ===
                    "true"
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


/* =========================================================
   TOGGLE USER
========================================================= */

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


/* =========================================================
   TRADES
========================================================= */

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


/* =========================================================
   LOAD TOP-UP + WITHDRAWAL REQUESTS
========================================================= */

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


/* =========================================================
   RENDER REQUESTS
========================================================= */

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

        id: item.id,

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
            request.userId || "-";


          const createdAt =
            formatDate(
              request.createdAt
            );


          const pending =
            status ===
            "PENDING";


          return `

            <tr>

              <td>

                ${escapeHtml(
                  String(
                    userId
                  ).slice(0, 8)
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
            approveRequest(
              button
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
            rejectRequest(
              button
            );

      }
    );

}


/* =========================================================
   APPROVE REQUEST
   SERVER-SIDE ONLY
========================================================= */

async function approveRequest(
  button
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

              status:
                "APPROVED"

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
        "Approval failed."
      );

    }


    showMessage(
      output,
      "Request approved successfully.",
      true
    );


  } catch (error) {

    console.error(
      "Approve request error:",
      error
    );


    showMessage(
      output,
      error.message ||
        "Approval failed.",
      false
    );


  } finally {

    button.disabled =
      false;

    button.textContent =
      "Approve";

  }

}


/* =========================================================
   REJECT REQUEST
   SERVER-SIDE ONLY
========================================================= */

async function rejectRequest(
  button
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

              status:
                "REJECTED"

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
        "Rejection failed."
      );

    }


    showMessage(
      output,
      "Request rejected successfully.",
      true
    );


  } catch (error) {

    console.error(
      "Reject request error:",
      error
    );


    showMessage(
      output,
      error.message ||
        "Reject failed.",
      false
    );


  } finally {

    button.disabled =
      false;

    button.textContent =
      "Reject";

  }

}


/* =========================================================
   LOGOUT
========================================================= */

$("adminLogout")?.addEventListener(
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
   HELPERS
========================================================= */

async function parseJson(
  response
) {

  try {

    return await response.json();

  } catch {

    return null;

  }

}


function formatDate(
  value
) {

  if (!value) {

    return "-";

  }


  try {

    if (
      typeof value.toDate ===
      "function"
    ) {

      return value
        .toDate()
        .toLocaleString();

    }


    if (
      typeof value.toMillis ===
      "function"
    ) {

      return new Date(
        value.toMillis()
      ).toLocaleString();

    }


    const date =
      new Date(
        value
      );


    if (
      Number.isNaN(
        date.getTime()
      )
    ) {

      return "-";

    }


    return date.toLocaleString();

  } catch {

    return "-";

  }

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