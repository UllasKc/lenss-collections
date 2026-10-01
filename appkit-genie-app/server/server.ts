import { createApp, genie, server, lakebase } from '@databricks/appkit';
import { buildChatRouter } from './routes/chat.js';
import { buildDashboardRouter } from './routes/dashboard.js';
import { buildEvalsRouter } from './routes/evals.js';

createApp({
  plugins: [
    genie(),
    lakebase(),
    server({ staticPath: 'public' }),
  ],
  onPluginsReady(appkit) {
    appkit.server.extend((app) => {
      app.use(buildChatRouter(appkit));
      app.use(buildDashboardRouter(appkit.lakebase));
      app.use(buildEvalsRouter(appkit));
    });
  },
}).catch(console.error);
