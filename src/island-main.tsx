import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import IslandApp from "./IslandApp";
import { installAuthBroadcast } from "@/lib/authBroadcast";

installAuthBroadcast();
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <IslandApp />
  </StrictMode>,
);
