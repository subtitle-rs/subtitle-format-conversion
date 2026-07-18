import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

function App() {
  return <div style={{ padding: 24 }}>脚手架就绪</div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
