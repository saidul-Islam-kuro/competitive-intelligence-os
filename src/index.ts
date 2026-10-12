import { loadEnv } from "./config/env";
import { createApp } from "./app";

const env = loadEnv();
const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Competitive Intelligence OS listening on http://localhost:${env.port}`);
});
