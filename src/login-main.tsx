import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LoginWindow } from "@/components/LoginWindow";
import { installAuthBroadcast } from "@/lib/authBroadcast";

installAuthBroadcast();
import "./styles/globals.css";
import "./styles/gate.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LoginWindow />
  </StrictMode>,
);
