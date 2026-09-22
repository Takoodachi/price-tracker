import type { Favorite, ProductDetail, ProductSummary, SearchResponse, User } from '@pricetracker/shared';
import { MutationCache, QueryCache, QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';

const ME = ['me'] as const;

/** Any 401 means the session expired: drop the user so pages redirect to login. */
function onAuthError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(ME, { user: null });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

/** While the server says results are still coming in, ask again with a gentle backoff (max ~1 min). */
function pollWhilePending(data: { pending: boolean } | undefined, updates: number): number | false {
  if (!data?.pending || updates > 30) return false;
  return Math.min(1500 + updates * 250, 4000);
}

// --- Auth ---

export function useMe() {
  return useQuery({
    queryKey: ME,
    queryFn: () => api<{ user: User | null }>('/auth/me'),
    staleTime: 5 * 60_000,
    select: (data) => data.user,
  });
}

export function useAuthMutation(mode: 'login' | 'register') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api<{ user: User }>(`/auth/${mode}`, { method: 'POST', body: input }),
    onSuccess: ({ user }) => {
      client.setQueryData(ME, { user });
      // Favorite flags on cached results belong to the previous (anonymous) session.
      void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      client.setQueryData(ME, { user: null });
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
  });
}

// --- Search & products ---

export function useSearch(q: string) {
  return useQuery({
    queryKey: ['search', q],
    queryFn: ({ signal }) => api<SearchResponse>(`/search?q=${encodeURIComponent(q)}`, { signal }),
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60_000,
    refetchInterval: (query) => pollWhilePending(query.state.data, query.state.dataUpdateCount),
  });
}

export function useProduct(id: number) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: ({ signal }) => api<ProductDetail>(`/products/${id}`, { signal }),
    enabled: Number.isFinite(id) && id > 0,
    refetchInterval: (query) => pollWhilePending(query.state.data, query.state.dataUpdateCount),
  });
}

// --- Favorites ---

export function useFavorites(enabled: boolean) {
  return useQuery({
    queryKey: ['favorites'],
    queryFn: () => api<{ favorites: Favorite[] }>('/favorites'),
    enabled,
    select: (data) => data.favorites,
  });
}

/** Flips the heart everywhere the product is cached, before the server answers. */
function setFavoriteFlag(client: QueryClient, productId: number, isFavorite: boolean) {
  const patch = (p: ProductSummary) => (p.id === productId ? { ...p, isFavorite } : p);
  client.setQueriesData<SearchResponse>({ queryKey: ['search'] }, (data) =>
    data ? { ...data, products: data.products.map(patch) } : data,
  );
  client.setQueryData<ProductDetail>(['product', productId], (data) => (data ? { ...data, isFavorite } : data));
}

export function useToggleFavorite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, favorite }: { productId: number; favorite: boolean }) =>
      favorite
        ? api('/favorites', { method: 'POST', body: { productId } })
        : api(`/favorites/${productId}`, { method: 'DELETE' }),
    onMutate: ({ productId, favorite }) => setFavoriteFlag(client, productId, favorite),
    onError: (_err, { productId, favorite }) => setFavoriteFlag(client, productId, !favorite),
    onSettled: () => client.invalidateQueries({ queryKey: ['favorites'] }),
  });
}

export function useUpdateTarget() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, targetPriceCents }: { productId: number; targetPriceCents: number | null }) =>
      api(`/favorites/${productId}`, { method: 'PATCH', body: { targetPriceCents } }),
    onSuccess: (_data, { productId }) => {
      void client.invalidateQueries({ queryKey: ['favorites'] });
      void client.invalidateQueries({ queryKey: ['product', productId] });
    },
  });
}
