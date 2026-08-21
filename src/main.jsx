import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Admin from "./Admin.jsx";
import KDS from "./KDS.jsx";

// Route by pathname: /admin -> menu admin; /kds -> kitchen display; else -> customer menu.
const path = window.location.pathname.replace(/\/+$/, "");
const isAdmin = path === "/admin";
const isKDS = path === "/kds";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isAdmin ? <Admin /> : isKDS ? <KDS /> : <App />}
  </React.StrictMode>
);
