import {
  auth,
  db
} from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


/* =========================================================
   CONFIG
========================================================= */

const ADMIN =
  "kundusudip019@gmail.com";


const $ =
  id => document.getElementById(id);



/* =========================================================
   LOGIN
========================================================= */

$("loginForm")?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    try {

      const email =
        $("email")
          .value
          .trim()
          .toLowerCase();

      const password =
        $("password")
          .value;

      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      location.href =
        "dashboard.html";

    } catch (error) {

      console.error(
        "Login error:",
        error
      );

      if ($("msg")) {

        $("msg").textContent =
          error.message;

      }

    }

  }
);



/* =========================================================
   REGISTER
========================================================= */

$("registerForm")?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    try {

      const name =
        $("name")
          .value
          .trim();


      const email =
        $("email")
          .value
          .trim()
          .toLowerCase();


      const password =
        $("password")
          .value;


      /*
       * Admin email is reserved.
       */

      if (
        email === ADMIN
      ) {

        throw new Error(
          "Admin email is reserved."
        );

      }


      /*
       * Create Firebase Auth account.
       */

      const credential =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );


      const user =
        credential.user;


      /*
       * Generate referral code.
       */

      const referralCode =
        email
          .split("@")[0]
          .slice(0, 5)
          .toUpperCase() +
        Math.random()
          .toString(36)
          .slice(2, 6)
          .toUpperCase();


      /*
       * Optional referral.
       */

      const referralInput =
        $("referral");


      const referredBy =
        new URLSearchParams(
          location.search
        ).get("ref") ||
        referralInput?.value
          ?.trim() ||
        "";


      /*
       * Create user profile.
       *
       * IMPORTANT:
       * No demo balance.
       * No virtual balance.
       * New account starts at ₹0.
       *
       * Balance must only be changed
       * through the server-side wallet
       * approval/transaction flow.
       */

      await setDoc(
        doc(
          db,
          "users",
          user.uid
        ),
        {

          uid:
            user.uid,

          name:
            name,

          email:
            email,

          balance:
            0,

          active:
            true,

          referralCode:
            referralCode,

          referredBy:
            referredBy,

          referralCount:
            0,

          createdAt:
            serverTimestamp()

        }
      );


      /*
       * Registration successful.
       */

      location.href =
        "dashboard.html";


    } catch (error) {

      console.error(
        "Registration error:",
        error
      );


      if ($("msg")) {

        $("msg").textContent =
          error.message;

      }

    }

  }
);