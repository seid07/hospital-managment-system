import { useContext } from "react";
import { ToastContext } from "./toast-context";

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    return {
      success: (msg) => console.log("[TOAST SUCCESS]:", msg),
      error: (msg) => console.error("[TOAST ERROR]:", msg),
      info: (msg) => console.log("[TOAST INFO]:", msg),
      warning: (msg) => console.warn("[TOAST WARNING]:", msg),
    };
  }

  return context;
}

export default useToast;
