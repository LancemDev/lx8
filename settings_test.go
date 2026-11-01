package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSettingsDefaults(t *testing.T) {
	isolateSettings(t)
	m := readMergedSettingsMap()
	if m["editor.fontSize"] != 13.5 {
		t.Errorf("expected editor.fontSize 13.5, got %v", m["editor.fontSize"])
	}
	if m["workbench.colorTheme"] != "catppuccin-mocha" {
		t.Errorf("expected workbench.colorTheme catppuccin-mocha, got %v", m["workbench.colorTheme"])
	}
	if m["editor.wordWrap"] != "on" {
		t.Errorf("expected editor.wordWrap on, got %v", m["editor.wordWrap"])
	}
	if m["editor.cursorStyle"] != "line" {
		t.Errorf("expected editor.cursorStyle line, got %v", m["editor.cursorStyle"])
	}
	if m["explorer.compactFolders"] != true {
		t.Errorf("expected explorer.compactFolders true, got %v", m["explorer.compactFolders"])
	}
	if m["explorer.autoReveal"] != true {
		t.Errorf("expected explorer.autoReveal true, got %v", m["explorer.autoReveal"])
	}
	if m["explorer.autoRelveal"] != true {
		t.Errorf("expected explorer.autoRelveal true, got %v", m["explorer.autoRelveal"])
	}
	if m["search.smartCase"] != true {
		t.Errorf("expected search.smartCase true, got %v", m["search.smartCase"])
	}
	if m["lsp.enabled"] != true {
		t.Errorf("expected lsp.enabled true, got %v", m["lsp.enabled"])
	}
	if m["server.basePath"] != "/" {
		t.Errorf("expected server.basePath /, got %v", m["server.basePath"])
	}
}

func TestSettingsAutoReveal(t *testing.T) {
	isolateSettings(t)

	// Defaults to true
	m := readMergedSettingsMap()
	if m["explorer.autoReveal"] != true {
		t.Fatalf("expected default explorer.autoReveal true, got %v", m["explorer.autoReveal"])
	}
	if m["explorer.autoRelveal"] != true {
		t.Fatalf("expected default explorer.autoRelveal true, got %v", m["explorer.autoRelveal"])
	}

	// Update via explorer.autoReveal = false
	err := updateSettingsMap(map[string]any{
		"explorer.autoReveal": false,
	})
	if err != nil {
		t.Fatalf("updateSettingsMap failed: %v", err)
	}

	s := readSettings()
	if s.ExplorerAutoReveal == nil || *s.ExplorerAutoReveal != false {
		t.Fatalf("expected ExplorerAutoReveal false, got %v", s.ExplorerAutoReveal)
	}

	m = readMergedSettingsMap()
	if m["explorer.autoReveal"] != false {
		t.Errorf("expected explorer.autoReveal false, got %v", m["explorer.autoReveal"])
	}
	if m["explorer.autoRelveal"] != false {
		t.Errorf("expected explorer.autoRelveal false, got %v", m["explorer.autoRelveal"])
	}

	// Update via explorer.autoRelveal = true
	err = updateSettingsMap(map[string]any{
		"explorer.autoRelveal": true,
	})
	if err != nil {
		t.Fatalf("updateSettingsMap failed: %v", err)
	}

	s = readSettings()
	if s.ExplorerAutoReveal == nil || *s.ExplorerAutoReveal != true {
		t.Fatalf("expected ExplorerAutoReveal true, got %v", s.ExplorerAutoReveal)
	}

	m = readMergedSettingsMap()
	if m["explorer.autoReveal"] != true {
		t.Errorf("expected explorer.autoReveal true, got %v", m["explorer.autoReveal"])
	}
	if m["explorer.autoRelveal"] != true {
		t.Errorf("expected explorer.autoRelveal true, got %v", m["explorer.autoRelveal"])
	}
}

func isolateSettings(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	return dir
}

// TestSettingsLegacyKeysIgnored: a settings file written by an older lx8 that
// still carries removed keys loads without error, and those keys don't affect
// anything else.
func TestSettingsLegacyKeysIgnored(t *testing.T) {
	cfg := isolateSettings(t)
	legacy := `{
  "agent": "claude",
  "agent.harness": "claude",
  "agent.timeoutSeconds": 300,
  "agent.models": {"claude": "sonnet"},
  "models": {"claude": "sonnet"},
  "git.commitMessageInstruction": "Follow Conventional Commits",
  "editor.fontSize": 16
}`
	if err := os.MkdirAll(filepath.Join(cfg, "lx8"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cfg, "lx8", "settings.json"), []byte(legacy), 0o644); err != nil {
		t.Fatal(err)
	}
	s := readSettings()
	if s.EditorFontSize == nil || *s.EditorFontSize != 16 {
		t.Fatalf("editor.fontSize = %v, want 16", s.EditorFontSize)
	}
	m := readMergedSettingsMap()
	if m["editor.fontSize"] != 16.0 {
		t.Errorf("merged editor.fontSize = %v, want 16", m["editor.fontSize"])
	}
	if err := updateSettingsMap(map[string]any{"editor.tabSize": 2.0}); err != nil {
		t.Fatalf("updateSettingsMap with legacy keys present: %v", err)
	}
	for _, it := range settingsSchema {
		if strings.HasPrefix(it.Key, "agent.") || it.Key == "git.commitMessageInstruction" {
			t.Errorf("schema still lists removed key %q", it.Key)
		}
	}
}

func TestSettingsAPIEndpoints(t *testing.T) {
	isolateSettings(t)
	root := t.TempDir()
	ix := NewIndex(root)
	ix.Build()
	srv := NewServer(ix, nil)
	t.Cleanup(func() {
		if srv.gitWatcher != nil {
			srv.gitWatcher.Stop()
		}
	})

	// 1. GET /api/settings
	req := httptest.NewRequest(http.MethodGet, "/api/settings", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/settings failed: code %d, body: %s", rec.Code, rec.Body.String())
	}
	var getResp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &getResp); err != nil {
		t.Fatalf("invalid GET json response: %v", err)
	}
	if _, ok := getResp["schema"]; !ok {
		t.Errorf("missing schema in GET /api/settings response")
	}

	// 2. POST /api/settings with key/value updates
	payload := map[string]any{
		"editor.tabSize":              2,
		"diffEditor.renderSideBySide": false,
	}
	b, _ := json.Marshal(payload)
	postReq := httptest.NewRequest(http.MethodPost, "/api/settings", bytes.NewReader(b))
	postReq.Host = "127.0.0.1:7777"
	postReq.Header.Set("Origin", "http://127.0.0.1:7777")
	postReq.Header.Set("Content-Type", "application/json")
	postRec := httptest.NewRecorder()
	srv.ServeHTTP(postRec, postReq)
	if postRec.Code != http.StatusOK {
		t.Fatalf("POST /api/settings failed: code %d, body: %s", postRec.Code, postRec.Body.String())
	}

	// 3. Verify changes persisted
	m := readMergedSettingsMap()
	if m["editor.tabSize"] != float64(2) && m["editor.tabSize"] != 2 {
		t.Errorf("expected editor.tabSize 2, got %v", m["editor.tabSize"])
	}
	if m["diffEditor.renderSideBySide"] != false {
		t.Errorf("expected diffEditor.renderSideBySide false, got %v", m["diffEditor.renderSideBySide"])
	}

	// 4. POST /api/settings with raw JSON
	rawPayload := map[string]any{
		"raw": "{\n  \"editor.fontSize\": 15,\n  \"workbench.colorTheme\": \"nord\"\n}\n",
	}
	rb, _ := json.Marshal(rawPayload)
	rawReq := httptest.NewRequest(http.MethodPost, "/api/settings", bytes.NewReader(rb))
	rawReq.Host = "127.0.0.1:7777"
	rawReq.Header.Set("Origin", "http://127.0.0.1:7777")
	rawReq.Header.Set("Content-Type", "application/json")
	rawRec := httptest.NewRecorder()
	srv.ServeHTTP(rawRec, rawReq)
	if rawRec.Code != http.StatusOK {
		t.Fatalf("POST /api/settings raw failed: code %d, body: %s", rawRec.Code, rawRec.Body.String())
	}

	m2 := readMergedSettingsMap()
	if m2["editor.fontSize"] != float64(15) && m2["editor.fontSize"] != 15 {
		t.Errorf("expected editor.fontSize 15 from raw, got %v", m2["editor.fontSize"])
	}
	if m2["workbench.colorTheme"] != "nord" {
		t.Errorf("expected workbench.colorTheme nord from raw, got %v", m2["workbench.colorTheme"])
	}
}

func TestSettingsBasePath(t *testing.T) {
	isolateSettings(t)

	// Defaults to nil in readSettings()
	s := readSettings()
	if s.ServerBasePath != nil {
		t.Errorf("expected default ServerBasePath to be nil, got %v", *s.ServerBasePath)
	}

	// Update via settings map
	err := updateSettingsMap(map[string]any{
		"server.basePath": "/rev-123/",
	})
	if err != nil {
		t.Fatalf("updateSettingsMap failed: %v", err)
	}

	s = readSettings()
	if s.ServerBasePath == nil || *s.ServerBasePath != "/rev-123/" {
		t.Errorf("expected ServerBasePath /rev-123/, got %v", s.ServerBasePath)
	}

	m := readMergedSettingsMap()
	if m["server.basePath"] != "/rev-123/" {
		t.Errorf("expected merged server.basePath /rev-123/, got %v", m["server.basePath"])
	}

	// Fallback when keyed as basePath
	err = updateSettingsMap(map[string]any{
		"basePath": "/rev-456/",
	})
	if err != nil {
		t.Fatalf("updateSettingsMap failed: %v", err)
	}

	s = readSettings()
	if s.ServerBasePath == nil || *s.ServerBasePath != "/rev-456/" {
		t.Errorf("expected ServerBasePath /rev-456/ from fallback, got %v", s.ServerBasePath)
	}
}
