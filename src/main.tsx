import React from "react";
import ReactDOM from "react-dom/client";
import "katex/dist/katex.min.css";
import App from "./App";
import { initLibrary } from "./core/io/library";

// The library (a tablet's Documents folder, see core/io/library.ts) has to be found before anything reads the paths that were
// stored for this launch - so the app is only shown after that.
void initLibrary()
  .catch((error) => console.error("The library is not available:", error))
  .finally(() => {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
