import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PermissionsWindow } from "@/components/PermissionsWindow";
import { installAuthBroadcast } from "@/lib/authBroadcast";

installAuthBroadcast();
import "./styles/globals.css";
import "./styles/gate.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PermissionsWindow />
  </StrictMode>,
);
