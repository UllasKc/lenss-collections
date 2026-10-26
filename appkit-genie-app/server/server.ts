import { createApp, genie, server, lakebase } from '@databricks/appkit';
import { buildChatRouter } from './routes/chat.js';
import { buildDashboardRouter } from './routes/dashboard.js';
import { buildExplorerRouter } from './routes/explorer.js';
import { buildEvalsRouter } from './routes/evals.js';
import { buildCostRouter } from './routes/cost.js';
import { startIdleStop, trackUse } from './lib/idleStop.js';
import { catchAsync, errorHandler } from './lib/asyncRoutes.js';

// A failed request must never take the app down (Express 4 doesn't catch rejected async handlers).
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.stack || reason.message : reason);
});

createApp({
  plugins: [
    genie(),
    lakebase(),
    server({ staticPath: 'public' }),
  ],
  onPluginsReady(appkit) {
    startIdleStop();
    appkit.server.extend((app) => {
      app.use(trackUse);   // first, so every request from a signed-in caller counts as use
      app.use(catchAsync(buildChatRouter(appkit)));
      app.use(catchAsync(buildDashboardRouter(appkit.lakebase)));
      app.use(catchAsync(buildExplorerRouter(appkit.lakebase)));
      app.use(catchAsync(buildEvalsRouter(appkit)));
      app.use(catchAsync(buildCostRouter()));
      app.use(errorHandler);   // last: failed requests get a JSON error, the server keeps running
    });
  },
}).catch(console.error);
