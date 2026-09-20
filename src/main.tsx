import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Initialize native app features (back button, splash, status bar, network)
import("./lib/native-app").then(m => m.initNativeApp()).catch(() => {});

// Initialize push notifications lazily (auto-detects native vs web)
setTimeout(() => {
  import("./lib/push-notifications").then(m => m.initPushNotifications()).catch(() => {});
}, 3000);
