// Cloudflare Pages entry point. Pages runs this file for every /api/* request.
// All the logic lives in src/worker.js so Workers and Pages share one copy.
import worker from "../../src/worker.js";

export const onRequest = (context) => worker.fetch(context.request, context.env);
