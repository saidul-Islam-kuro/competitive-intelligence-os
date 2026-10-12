import { createApp } from "../src/app";

// Express apps are valid (req, res) request handlers, so Vercel's Node.js
// runtime can invoke this directly — no adapter needed. vercel.json rewrites
// every /api/* request to this function.
export default createApp();
