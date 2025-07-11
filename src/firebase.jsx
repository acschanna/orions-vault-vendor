import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "orions-vault-vendor.firebaseapp.com",
  projectId: "orions-vault-vendor",
  storageBucket: "orions-vault-vendor.appspot.com",
  messagingSenderId: "1088968637473",
  appId: "1:1088968637473:web:234ac887f6694e759eb760",
  measurementId: "G-LENX4WHC5W"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);