import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Admin from "./Admin.jsx";
import KDS from "./KDS.jsx";
import Activate from "./Activate.jsx";
import Kiosk from "./Kiosk.jsx";
import CustomerDisplay from "./CustomerDisplay.jsx";
import MusicPlayer from "./MusicPlayer.jsx";
import { getDevice, surfaceAllowed } from "./device.js";

// Route by pathname: /admin -> menu admin; /kds -> kitchen display; else -> customer menu.
const path = window.location.pathname.replace(/\/+$/, "");
const isAdmin = path === "/admin";
const isKDS = path === "/kds";
const isPOS = path === "/pos";
const isActivate = path === "/activate";
const isKiosk = path === "/kiosk";
// The customer-facing rear screen of a till (opened by the Customer Display app).
const isDisplay = path === "/display";
// The store's background-music player (Admin → Music).
const isMusic = path === "/music";
// VIEWONLY 2026-10-24 — a menu customers can open on their own phone from a
// shared link or QR (/menu/<link>): browse only, no basket, no ordering, and
// it never claims or locks a tablet link.
const viewToken = path.startsWith("/menu/") ? decodeURIComponent(path.slice(6)) : null;
// A licensed device may only open the surface its licence allows.
const dev = getDevice();
const wrongSurface = dev && ((isKDS && !surfaceAllowed(dev.kind, "kds")) || (isPOS && !surfaceAllowed(dev.kind, "pos")) || (isKiosk && !surfaceAllowed(dev.kind, "kiosk")));

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {viewToken ? <App viewToken={viewToken} /> : isAdmin ? <Admin /> : isDisplay ? <CustomerDisplay /> : isMusic ? <MusicPlayer /> : isActivate ? <Activate /> : wrongSurface ? <Activate reason="wrong_surface" /> : isKiosk ? <Kiosk /> : isKDS ? <KDS surface="kds" /> : isPOS ? <KDS surface="pos" /> : <App />}
  </React.StrictMode>
);
