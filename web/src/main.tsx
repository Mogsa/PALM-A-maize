import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { TagsProvider } from "./state/TagsProvider";

createRoot(document.getElementById("root")!).render(<StrictMode><TagsProvider><App /></TagsProvider></StrictMode>);
