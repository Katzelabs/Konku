import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { Category } from '../../api/types'

export const categoryKeys = {
  all: ['categories'] as const,
  live: () => [...categoryKeys.all, 'live'] as const,
  withArchived: () => [...categoryKeys.all, 'withArchived'] as const,
}

/** The categories a picker should offer: this user's, minus the archived. */
export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.live(),
    queryFn: () => api.get<Category[]>('/categories'),
  })
}

/**
 * Archived included. A note or card labelled with an archived category still
 * has to render its chip, so the display path needs the full set even though
 * the pickers do not (D-051).
 */
export function useAllCategories() {
  return useQuery({
    queryKey: categoryKeys.withArchived(),
    queryFn: () => api.get<Category[]>('/categories?includeArchived=true'),
  })
}

function useCategoryMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: categoryKeys.all }),
  })
}

/**
 * Create-on-type. The endpoint is idempotent: a label whose slug already
 * exists comes back as that category rather than a 409, so the picker never
 * has to put a conflict dialog in front of capture (hard rule 7).
 */
export function useCreateCategory() {
  return useCategoryMutation((label: string) =>
    api.post<Category>('/categories', { label }),
  )
}

export function useRenameCategory() {
  return useCategoryMutation((v: { id: string; label: string }) =>
    api.patch<Category>(`/categories/${v.id}`, { label: v.label }),
  )
}

export function useArchiveCategory() {
  return useCategoryMutation((v: { id: string; archived: boolean }) =>
    api.post<Category>(
      `/categories/${v.id}/${v.archived ? 'archive' : 'unarchive'}`,
    ),
  )
}

/**
 * Deleting only works for a category nothing references. One still in use
 * comes back 409 pointing at archiving instead (D-051) — the caller shows
 * `error.message` as-is, since it is already user-facing Indonesian.
 */
export function useDeleteCategory() {
  return useCategoryMutation((id: string) => api.del<void>(`/categories/${id}`))
}
