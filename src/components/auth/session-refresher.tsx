"use client";

import { useEffect } from "react";

// Eigen login: Server Components kunnen geen cookies zetten, dus een sessie die
// alleen gelezen wordt, zou nooit verlengd worden. Bij het laden van de app
// (en daarna elk uur) vraagt deze component de sessie op; de server verlengt
// hem dan als dat nodig is en stuurt een nieuwe cookie mee.

const ELK_UUR_MS = 60 * 60 * 1000;

export function SessionRefresher() {
  useEffect(() => {
    const verleng = () => {
      fetch("/api/auth/get-session", { cache: "no-store", credentials: "same-origin" }).catch(() => {});
    };
    verleng();
    const timer = setInterval(verleng, ELK_UUR_MS);
    return () => clearInterval(timer);
  }, []);
  return null;
}
