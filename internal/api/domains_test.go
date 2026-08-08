package api_test

import (
	"net/http"
	"testing"
)

type fullDomainBody struct {
	ID          string  `json:"id"`
	Slug        string  `json:"slug"`
	Label       string  `json:"label"`
	Color       string  `json:"color"`
	WeeklyQuota int32   `json:"weeklyQuota"`
	SortOrder   int32   `json:"sortOrder"`
	ArchivedAt  *string `json:"archivedAt"`
}

func (c *testClient) listDomains(path string) []fullDomainBody {
	c.t.Helper()
	var out []fullDomainBody
	c.expect(c.do(http.MethodGet, path, nil), http.StatusOK, &out)
	return out
}

// Every account gets the starter set at creation, in one transaction with the
// user row (D-046). An account with no domains would open onto an empty picker
// with nothing to repair it.
func TestNewAccountGetsSeededDomains(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	domains := c.listDomains("/domains")
	if len(domains) != 5 {
		t.Fatalf("got %d seeded domains, want 5", len(domains))
	}

	wantSlugs := []string{"general", "math", "psychology", "music", "coding"}
	for i, want := range wantSlugs {
		if domains[i].Slug != want {
			t.Errorf("domain %d slug = %q, want %q", i, domains[i].Slug, want)
		}
	}

	// Coding is a valid tag outside the weekly rota (D-034).
	if q := domains[4].WeeklyQuota; q != 0 {
		t.Errorf("coding weeklyQuota = %d, want 0", q)
	}
}

// Two accounts must not see or share each other's domains. This is the whole
// reason domains stopped being global reference data (D-046).
func TestDomainsAreIsolatedPerUser(t *testing.T) {
	app := newApp(t)
	a := app.newClient(t)
	b := app.newClient(t)

	if a.domainID("math") == b.domainID("math") {
		t.Fatal("two accounts share a domain row")
	}

	// Another user's domain is not found, never forbidden — a 403 would
	// confirm the row exists (D-039).
	res := a.do(http.MethodPatch, "/domains/"+b.domainID("math"), map[string]any{
		"label": "Dibajak",
	})
	if res.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", res.StatusCode)
	}
}

func TestCreateAndRenameDomain(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	var created fullDomainBody
	c.expect(c.do(http.MethodPost, "/domains", map[string]any{
		"label": "Sejarah Dunia", "color": "#AA3344", "weeklyQuota": 2,
	}), http.StatusCreated, &created)

	if created.Slug != "sejarah-dunia" {
		t.Errorf("slug = %q, want sejarah-dunia", created.Slug)
	}

	var renamed fullDomainBody
	c.expect(c.do(http.MethodPatch, "/domains/"+created.ID, map[string]any{
		"label": "Sejarah",
	}), http.StatusOK, &renamed)

	if renamed.Label != "Sejarah" {
		t.Errorf("label = %q, want Sejarah", renamed.Label)
	}
	// The slug is the stable identity and survives a rename, so nothing that
	// referenced it breaks.
	if renamed.Slug != "sejarah-dunia" {
		t.Errorf("slug = %q, want it unchanged by a rename", renamed.Slug)
	}
	// PATCH is partial: an omitted field keeps its stored value.
	if renamed.Color != "#AA3344" || renamed.WeeklyQuota != 2 {
		t.Errorf("color/quota = %q/%d, want #AA3344/2 — PATCH overwrote omitted fields",
			renamed.Color, renamed.WeeklyQuota)
	}
}

func TestDomainValidation(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	tests := []struct {
		name string
		body map[string]any
		want int
	}{
		{"no label", map[string]any{"color": "#AABBCC"}, http.StatusBadRequest},
		{"blank label", map[string]any{"label": "   ", "color": "#AABBCC"}, http.StatusBadRequest},
		{"no color", map[string]any{"label": "Fisika"}, http.StatusBadRequest},
		{"a colour name is not a hex colour", map[string]any{"label": "Fisika", "color": "merah"}, http.StatusBadRequest},
		{"short hex", map[string]any{"label": "Fisika", "color": "#ABC"}, http.StatusBadRequest},
		{"negative quota", map[string]any{"label": "Fisika", "color": "#AABBCC", "weeklyQuota": -1}, http.StatusBadRequest},
		{"an implausible quota", map[string]any{"label": "Fisika", "color": "#AABBCC", "weeklyQuota": 500}, http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := c.do(http.MethodPost, "/domains", tt.body)
			if res.StatusCode != tt.want {
				t.Fatalf("status = %d, want %d", res.StatusCode, tt.want)
			}
		})
	}

	t.Run("a duplicate name is a 409, not a 500", func(t *testing.T) {
		body := map[string]any{"label": "Kimia", "color": "#123456"}
		c.expect(c.do(http.MethodPost, "/domains", body), http.StatusCreated, nil)

		res := c.do(http.MethodPost, "/domains", body)
		if res.StatusCode != http.StatusConflict {
			t.Fatalf("status = %d, want 409", res.StatusCode)
		}
	})
}

// Archiving retires a domain without touching the notes and sessions tagged
// with it (D-051). It leaves the picker but still has to render its label,
// which is what includeArchived is for.
func TestArchiveDomainKeepsItReadable(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	id := c.domainID("music")
	c.expect(c.do(http.MethodPost, "/domains/"+id+"/archive", nil), http.StatusOK, nil)

	if found := containsDomain(c.listDomains("/domains"), id); found {
		t.Error("an archived domain is still in the default list")
	}
	if found := containsDomain(c.listDomains("/domains?includeArchived=true"), id); !found {
		t.Error("an archived domain vanished from includeArchived — history cannot render its label")
	}

	// A tagged note cannot be created against it any more...
	res := c.do(http.MethodPost, "/notes", map[string]any{
		"title": "n", "contentMd": "isi", "domainId": id,
	})
	if res.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 for an archived domain", res.StatusCode)
	}

	// ...and unarchiving puts it back.
	c.expect(c.do(http.MethodPost, "/domains/"+id+"/unarchive", nil), http.StatusOK, nil)
	if found := containsDomain(c.listDomains("/domains"), id); !found {
		t.Error("unarchive did not restore the domain")
	}
}

// Deletion is only for a domain created by mistake. One with notes attached
// raises foreign_key_violation, which must surface as a 409 pointing at
// archiving — never a 500 (D-051).
func TestDeleteDomainOnlyWhenUnreferenced(t *testing.T) {
	app := newApp(t)
	c := app.newClient(t)

	var spare fullDomainBody
	c.expect(c.do(http.MethodPost, "/domains", map[string]any{
		"label": "Salah Ketik", "color": "#999999",
	}), http.StatusCreated, &spare)

	res := c.do(http.MethodDelete, "/domains/"+spare.ID, nil)
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want 204 for an unreferenced domain", res.StatusCode)
	}

	used := c.domainID("math")
	c.createNote(map[string]any{"title": "n", "contentMd": "isi", "domainId": used})

	res = c.do(http.MethodDelete, "/domains/"+used, nil)
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d, want 409 for a domain with notes", res.StatusCode)
	}

	// And the note kept its domain.
	if found := containsDomain(c.listDomains("/domains"), used); !found {
		t.Error("the domain was removed despite the 409")
	}
}

func containsDomain(domains []fullDomainBody, id string) bool {
	for _, d := range domains {
		if d.ID == id {
			return true
		}
	}
	return false
}
