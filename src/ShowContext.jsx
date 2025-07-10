import React, { createContext, useContext, useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useUser } from "./App";

// Create the ShowContext
export const ShowContext = createContext();

// Custom hook for easier usage in components
export function useShow() {
  return useContext(ShowContext);
}

// ShowProvider wraps your app and provides the showActive state
export function ShowProvider({ children }) {
  const user = useUser();
  const [showActive, setShowActive] = useState(null);

  useEffect(() => {
    async function fetchActiveShow() {
      if (!user?.uid) {
        setShowActive(null);
        return;
      }
      const showsQ = query(
        collection(db, "users", user.uid, "shows"),
        where("endTime", "==", null)
      );
      const showsSnap = await getDocs(showsQ);
      if (!showsSnap.empty) {
        setShowActive({ ...showsSnap.docs[0].data(), id: showsSnap.docs[0].id });
      } else {
        setShowActive(null);
      }
    }
    fetchActiveShow();
  }, [user]);

  return (
    <ShowContext.Provider value={{ showActive, setShowActive }}>
      {children}
    </ShowContext.Provider>
  );
}
