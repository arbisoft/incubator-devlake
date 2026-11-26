/*
Licensed to the Apache Software Foundation (ASF) under one or more
contributor license agreements.  See the NOTICE file distributed with
this work for additional information regarding copyright ownership.
The ASF licenses this file to You under the Apache License, Version 2.0
(the "License"); you may not use this file except in compliance with
the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package mail

import (
	"strings"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/apache/incubator-devlake/core/errors"
)

func builtinRenderer(t *testing.T) *Renderer {
	t.Helper()
	r, err := LoadRenderer(BuiltinTemplates())
	require.Nil(t, err)
	return r
}

func TestBuiltinTemplatesRender(t *testing.T) {
	r := builtinRenderer(t)
	assert.Equal(t, []string{TemplateAlert, TemplateProjectInvite, TemplateReport}, r.Names())

	cases := []struct {
		name, template string
		data           interface{}
		subject        string
		htmlHas        []string
		textHas        []string
	}{
		{
			name: "alert", template: TemplateAlert,
			data: AlertData{Title: "OTel connection down", Summary: "No data for 2 hours.", ProjectName: "DevLake",
				Details: []Detail{{Label: "Connection", Value: "claude-otel"}}, Link: "https://devlake.example.com/x"},
			subject: "[DevLake alert] OTel connection down",
			htmlHas: []string{"<!DOCTYPE html>", "OTel connection down", "No data for 2 hours.", "claude-otel", `href="https://devlake.example.com/x"`, "style="},
			textHas: []string{"OTel connection down", "Project: DevLake", "- Connection: claude-otel", "Open in DevLake: https://devlake.example.com/x"},
		},
		{
			name: "report", template: TemplateReport,
			data: ReportData{Title: "Weekly delivery", Period: "2026-11-17 to 2026-11-23", ProjectName: "DevLake",
				Sections: []ReportSection{{Heading: "GitHub", Rows: []Detail{{Label: "PRs merged", Value: "12"}}}}},
			subject: "[DevLake report] Weekly delivery (2026-11-17 to 2026-11-23)",
			htmlHas: []string{"Weekly delivery", "GitHub", "PRs merged", "12"},
			textHas: []string{"Period: 2026-11-17 to 2026-11-23", "GitHub", "- PRs merged: 12"},
		},
		{
			name: "empty report", template: TemplateReport,
			data:    ReportData{Title: "Weekly delivery", Period: "last week"},
			subject: "[DevLake report] Weekly delivery (last week)",
			htmlHas: []string{"No data for this period."},
			textHas: []string{"No data for this period."},
		},
		{
			name: "project invite with a link", template: TemplateProjectInvite,
			data: ProjectInviteData{Title: "Your project is ready", Name: "Ali Khan", ProjectName: "Payments", Score: "33%",
				Link: "https://devlake.example.com/projects/Payments", Checks: []InviteCheck{
					{Label: "Ticketing system", Hint: "Connect Jira"},
					{Label: "Version control", Done: true, Sources: "GitHub"},
				}},
			subject: "Your DevLake project Payments is ready",
			htmlHas: []string{"Hi Ali Khan,", "<strong>Payments</strong>", "Connect Jira", "Connected: GitHub",
				"<strong>33%</strong>", `href="https://devlake.example.com/projects/Payments"`, "Set up your project"},
			textHas: []string{"Hi Ali Khan,", "- [ ] Ticketing system: Connect Jira", "- [x] Version control: connected (GitHub)",
				"Current score: 33%.", "Set up your project: https://devlake.example.com/projects/Payments"},
		},
		{
			name: "project invite without a link", template: TemplateProjectInvite,
			data:    ProjectInviteData{Title: "Your project is ready", Name: "Ali", ProjectName: "Payments", Score: "0%"},
			subject: "Your DevLake project Payments is ready",
			htmlHas: []string{"Open DevLake to set up your project."},
			textHas: []string{"Open DevLake to set up your project."},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out, err := r.Render(tc.template, tc.data)

			require.Nil(t, err)
			assert.Equal(t, tc.subject, out.Subject)
			for _, s := range tc.htmlHas {
				assert.Contains(t, out.HTML, s)
			}
			for _, s := range tc.textHas {
				assert.Contains(t, out.Text, s)
			}
			assert.NotContains(t, out.Text, "<")
		})
	}
}

func TestRenderEscapesHTMLAndBlocksUnsafeLinks(t *testing.T) {
	out, err := builtinRenderer(t).Render(TemplateAlert, AlertData{
		Title: `<script>alert(1)</script>`, Summary: `a & b`, Link: "javascript:alert(1)",
	})

	require.Nil(t, err)
	assert.NotContains(t, out.HTML, "<script>")
	assert.Contains(t, out.HTML, "&lt;script&gt;")
	assert.Contains(t, out.HTML, "a &amp; b")
	assert.NotContains(t, out.HTML, "javascript:")
	assert.Equal(t, "[DevLake alert] <script>alert(1)</script>", out.Subject, "the subject is plain text, not HTML")
}

func TestProjectInviteEscapesValuesAndHasNoButtonWithoutALink(t *testing.T) {
	out, err := builtinRenderer(t).Render(TemplateProjectInvite, ProjectInviteData{
		Title: "Ready", Name: "<b>Ali</b>", ProjectName: "P&<script>", Score: "0%",
		Checks: []InviteCheck{{Label: "AI usage visibility", Hint: "<i>hint</i>"}},
	})

	require.Nil(t, err)
	assert.Contains(t, out.HTML, "&lt;b&gt;Ali&lt;/b&gt;")
	assert.Contains(t, out.HTML, "P&amp;&lt;script&gt;")
	assert.Contains(t, out.HTML, "&lt;i&gt;hint&lt;/i&gt;")
	assert.NotContains(t, out.HTML, "<script>")
	assert.NotContains(t, out.HTML, "Set up your project</a>")
}

func TestRenderFoldsNewlinesInTheSubject(t *testing.T) {
	out, err := builtinRenderer(t).Render(TemplateAlert, AlertData{Title: "Down\r\nBcc: evil@example.com", Summary: "x"})

	require.Nil(t, err)
	assert.Equal(t, "[DevLake alert] Down Bcc: evil@example.com", out.Subject)
	assert.NotContains(t, out.Subject, "\n")
}

func TestRenderCutsLongSubjects(t *testing.T) {
	out, err := builtinRenderer(t).Render(TemplateAlert, AlertData{Title: strings.Repeat("é", 400), Summary: "x"})

	require.Nil(t, err)
	assert.Len(t, []rune(out.Subject), maxSubjectRunes)
}

func TestRenderErrors(t *testing.T) {
	r := builtinRenderer(t)

	_, err := r.Render("../../etc/passwd", AlertData{})
	require.NotNil(t, err)
	assert.Equal(t, errors.BadInput, err.GetType())

	_, err = r.Render(TemplateAlert, ReportData{Title: "wrong data"})
	assert.NotNil(t, err, "data without the template's fields must fail")
}

func TestOverrideFolderReplacesFilesByName(t *testing.T) {
	override := fstest.MapFS{
		"alert.txt":  {Data: []byte(`{{define "subject"}}Custom: {{.Title}}{{end}}Custom body {{.Summary}}`)},
		"alert.html": {Data: []byte(`{{define "content"}}<p class="custom">{{.Summary}}</p>{{end}}`)},
	}
	r, err := LoadRenderer(OverlayTemplates(override, BuiltinTemplates()))
	require.Nil(t, err)

	alert, err := r.Render(TemplateAlert, AlertData{Title: "T", Summary: "S"})
	require.Nil(t, err)
	assert.Equal(t, "Custom: T", alert.Subject)
	assert.Equal(t, "Custom body S\n", alert.Text)
	assert.Contains(t, alert.HTML, `<p class="custom">S</p>`)
	assert.Contains(t, alert.HTML, "This email was sent by DevLake.", "the built-in layout is still used")

	report, err := r.Render(TemplateReport, ReportData{Title: "R", Period: "P"})
	require.Nil(t, err)
	assert.Equal(t, "[DevLake report] R (P)", report.Subject, "files not overridden stay built-in")
}

func TestLoadRendererRejectsBrokenTemplates(t *testing.T) {
	cases := []struct {
		name string
		fs   fstest.MapFS
		want string
	}{
		{"syntax error", fstest.MapFS{"alert.html": {Data: []byte(`{{define "content"}}{{.Title}{{end}}`)}}, "parse mail template alert.html"},
		{"no subject", fstest.MapFS{"report.txt": {Data: []byte(`body only`)}}, `report.txt must define "subject"`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := LoadRenderer(OverlayTemplates(tc.fs, BuiltinTemplates()))
			require.NotNil(t, err)
			assert.Contains(t, err.Error(), tc.want)
		})
	}
}

func TestLoadRendererNeedsEveryFile(t *testing.T) {
	_, err := LoadRenderer(fstest.MapFS{"layout.html": {Data: []byte(`{{define "layout"}}{{end}}`)}})

	require.NotNil(t, err)
	assert.Contains(t, err.Error(), "read mail template alert.html")
}
