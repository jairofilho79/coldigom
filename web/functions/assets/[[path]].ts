import { proxyToApi } from '../_proxy';

type PagesContext = {
  request: Request;
  next: () => Promise<Response>;
};

/** Only proxy R2 praise assets; Vite build also lives under /assets/*.js|css. */
export const onRequest = async (context: PagesContext) => {
  const path = new URL(context.request.url).pathname;
  if (path.startsWith('/assets/praises/')) {
    return proxyToApi(context.request);
  }
  return context.next();
};
