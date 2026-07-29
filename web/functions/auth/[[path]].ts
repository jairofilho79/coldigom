import { proxyToApi } from '../_proxy';

export const onRequest = async (context: { request: Request }) => proxyToApi(context.request);
