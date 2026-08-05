package api

import "net/http"

// Domains are global reference data seeded by the first migration, not
// per-user rows. There is no create or edit endpoint: domain management is a
// v0.2 concern, and the MVP only needs to label the picker on the focus timer
// so a captured note arrives pre-tagged (D-011).

type domainResponse struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Color       string `json:"color"`
	WeeklyQuota int32  `json:"weeklyQuota"`
}

func (s *Server) handleListDomains(w http.ResponseWriter, r *http.Request) {
	domains, err := s.store.Q().ListDomains(r.Context())
	if err != nil {
		writeInternal(w, err)
		return
	}

	out := make([]domainResponse, 0, len(domains))
	for _, d := range domains {
		out = append(out, domainResponse{
			ID:          d.ID,
			Label:       d.Label,
			Color:       d.Color,
			WeeklyQuota: d.WeeklyQuota,
		})
	}

	writeJSON(w, http.StatusOK, out)
}
