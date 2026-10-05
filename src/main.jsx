import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Admin from "./Admin.jsx";
import KDS from "./KDS.jsx";
import Activate from "./Activate.jsx";
import { getDevice, surfaceAllowed } from "./device.js";

// Route by pathname: /admin -> menu admin; /kds -> kitchen display; else -> customer menu.
const path = window.location.pathname.replace(/\/+$/, "");
const isAdmin = path === "/admin";
const isKDS = path === "/kds";
const isPOS = path === "/pos";
const isActivate = path === "/activate";
// A licensed device may only open the surface its licence allows.
const dev = getDevice();
const wrongSurface = dev && ((isKDS && !surfaceAllowed(dev.kind, "kds")) || (isPOS && !surfaceAllowed(dev.kind, "pos")));

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isAdmin ? <Admin /> : isActivate ? <Activate /> : wrongSurface ? <Activate reason="wrong_surface" /> : isKDS ? <KDS surface="kds" /> : isPOS ? <KDS surface="pos" /> : <App />}
  </React.StrictMode>
);
