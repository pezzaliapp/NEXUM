import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { App } from "./App";
import { Boundary } from "./components/Boundary";
import { installUpdater } from "./lib/update";

createRoot(document.getElementById("root")!).render(<StrictMode><Boundary name="app" whole><App /></Boundary></StrictMode>);
installUpdater();
