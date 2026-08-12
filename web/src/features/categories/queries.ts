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
    // Braces, not a returned promise — see the frontend conventions in
    // CLAUDE.md. Returning the invalidate makes mutate's callbacks wait on a
    // refetch that may 404 on the row just deleted, and then never run.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoryKeys.all })
    },
  })
}

/**
 * Create-on-type. The endpoint is idempotent: a label whose slug already
 * exists comes back as that category rather than a 409, so the picker never
 * has to put a conflict dialog in front of capture (hard rule 7).
 *
 * It sends a label and no colour on purpose. The server picks the neutral
 * default, and an existing category keeps whatever colour it already had —
 * typing a familiar label mid-note must not repaint something chosen in
 * Pengaturan.
 */
export function useCreateCategory() {
  return useCategoryMutation((label: string) =>
    api.post<Category>('/categories', { label }),
  )
}

export interface CategoryInput {
  label: string
  color: string
}

/**
 * Rename, recolour, or both.
 *
 * A PATCH, so a caller sends only what changed. That matters for colour: the
 * settings row can send `{ color }` alone without having to echo a label back
 * that it might have read one render stale.
 */
export function useUpdateCategory() {
  return useCategoryMutation((v: { id: string } & Partial<CategoryInput>) => {
    const { id, ...body } = v
    return api.patch<Category>(`/categories/${id}`, body)
  })
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
