import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBw7S333mn19yst3wscfIGf6JKyVMbPhe4",
  authDomain: "tradesim-1.firebaseapp.com",
  projectId: "tradesim-1",
  storageBucket: "tradesim-1.firebasestorage.app",
  messagingSenderId: "410783648274",
  appId: "1:410783648274:web:7b34d5589a94e216bd26cb",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;