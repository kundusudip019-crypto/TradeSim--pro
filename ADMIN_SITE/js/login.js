import {
  auth
} from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";


/* =========================
   ADMIN CONFIG
========================= */

const ADMIN_EMAIL = "kundusudip019@gmail.com";


/* =========================
   ELEMENTS
========================= */

const form =
  document.getElementById("adminLoginForm");

const emailInput =
  document.getElementById("email");

const passwordInput =
  document.getElementById("password");

const loginBtn =
  document.getElementById("loginBtn");

const message =
  document.getElementById("loginMsg");


/* =========================
   MESSAGE
========================= */

function showMessage(text) {

  if (message) {
    message.textContent = text;
  }

}


/* =========================
   FIREBASE ERROR
========================= */

function firebaseError(error) {

  switch (error.code) {

    case "auth/invalid-credential":
      return "Invalid admin email or password.";

    case "auth/user-not-found":
      return "This admin account does not exist in Firebase Authentication.";

    case "auth/wrong-password":
      return "Incorrect admin password.";

    case "auth/invalid-email":
      return "Please enter a valid admin email.";

    case "auth/too-many-requests":
      return "Too many login attempts. Please try again later.";

    case "auth/network-request-failed":
      return "Network error. Check your internet connection.";

    case "auth/user-disabled":
      return "This admin account has been disabled.";

    default:
      return error.message || "Admin login failed.";
  }

}


/* =========================
   CHECK EXISTING LOGIN
========================= */

onAuthStateChanged(
  auth,
  (user) => {

    if (!user) {
      return;
    }


    const loggedEmail =
      (user.email || "").toLowerCase();


    const adminEmail =
      ADMIN_EMAIL.toLowerCase();


    if (loggedEmail === adminEmail) {

      /*
       * IMPORTANT:
       * Admin dashboard is index.html
       * NOT dashboard.html
       */

      location.replace("index.html");

    }

  }
);


/* =========================
   ADMIN LOGIN
========================= */

form?.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();


    const email =
      emailInput.value
        .trim()
        .toLowerCase();


    const password =
      passwordInput.value;


    /* =========================
       EMAIL CHECK
    ========================= */

    if (
      email !==
      ADMIN_EMAIL.toLowerCase()
    ) {

      showMessage(
        "Only the configured admin account can access this page."
      );

      return;
    }


    /* =========================
       PASSWORD CHECK
    ========================= */

    if (!password) {

      showMessage(
        "Please enter your password."
      );

      return;
    }


    /* =========================
       BUTTON LOADING
    ========================= */

    if (loginBtn) {

      loginBtn.disabled = true;

      loginBtn.textContent =
        "Signing in...";

    }


    showMessage("");


    /* =========================
       FIREBASE LOGIN
    ========================= */

    try {

      const credential =
        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );


      /* =========================
         VERIFY ADMIN ACCOUNT
      ========================= */

      const loggedEmail =
        (
          credential.user.email || ""
        ).toLowerCase();


      if (
        loggedEmail !==
        ADMIN_EMAIL.toLowerCase()
      ) {

        showMessage(
          "This account is not authorized as admin."
        );


        if (loginBtn) {

          loginBtn.disabled = false;

          loginBtn.textContent =
            "Sign in to Admin";

        }

        return;
      }


      /* =========================
         SUCCESS
      ========================= */

      showMessage(
        "Login successful. Opening admin panel..."
      );


      /*
       * IMPORTANT:
       * Go directly to ADMIN_SITE/index.html
       */

      setTimeout(() => {

        location.replace("index.html");

      }, 300);


    } catch (error) {

      console.error(
        "Admin login error:",
        error
      );


      showMessage(
        firebaseError(error)
      );


      if (loginBtn) {

        loginBtn.disabled = false;

        loginBtn.textContent =
          "Sign in to Admin";

      }

    }

  }
);