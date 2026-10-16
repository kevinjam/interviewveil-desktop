import ChatApp from "@/ChatApp";
import IslandApp from "@/IslandApp";
import { resolveWebviewLabel } from "@/lib/webviewLabel";

export default function App() {
  const label = resolveWebviewLabel();
  if (label === "island") return <IslandApp />;
  return <ChatApp />;
}
