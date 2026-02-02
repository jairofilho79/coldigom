import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import './i18n/config'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Retry apenas em caso de erro de rede (não para 4xx, 5xx)
      retry: (failureCount, error: any) => {
        // Não retry para erros 4xx (client errors) ou 5xx (server errors)
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          return false;
        }
        // Retry apenas para erros de rede (sem response) ou 5xx
        // Máximo de 1 retry para não bloquear muito tempo offline
        return failureCount < 1;
      },
      staleTime: 5 * 60 * 1000, // 5 minutos - dados são considerados frescos por 5 minutos
      gcTime: 10 * 60 * 1000, // 10 minutos - tempo que dados não utilizados ficam em cache (antes era cacheTime)
      // Mantém dados stale disponíveis mesmo quando há erro de rede
      // Isso permite que o app funcione offline com dados em cache
      networkMode: 'online', // Por padrão, só faz requisições quando online
    },
    mutations: {
      // Para mutações, também retry apenas em caso de erro de rede
      retry: (failureCount, error: any) => {
        // Não retry para erros 4xx (client errors)
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          return false;
        }
        // Retry apenas para erros de rede (sem response) ou 5xx
        return failureCount < 1;
      },
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)
