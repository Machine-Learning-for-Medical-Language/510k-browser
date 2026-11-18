import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/800.css";
import "./styles.css";
import { render } from "preact";
import { App } from "./App";

const root = document.getElementById("app");
if (root) render(<App />, root);
