import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ChatApp from "./ChatApp";
import { installAuthBroadcast } from "@/lib/authBroadcast";

installAuthBroadcast();
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ChatApp />
  </StrictMode>,
);
