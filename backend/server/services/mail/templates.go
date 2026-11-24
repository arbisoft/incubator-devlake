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
	"bytes"
	"embed"
	goerrors "errors"
	htmltemplate "html/template"
	"io/fs"
	"sort"
	"strings"
	texttemplate "text/template"

	"github.com/apache/incubator-devlake/core/errors"
)

// Template names. Only these can be rendered, so a name never becomes a file path from input.
const (
	TemplateAlert  = "alert"
	TemplateReport = "report"
)

const (
	layoutFile      = "layout.html"
	layoutName      = "layout"
	subjectName     = "subject"
	maxSubjectRunes = 255 // _devlake_email_history.subject is varchar(255)
)

// templateNames is every template LoadRenderer parses. Never written after init.
var templateNames = []string{TemplateAlert, TemplateReport}

//go:embed templates/*.html templates/*.txt
var builtinFS embed.FS

// Detail is one label and value line in an email.
type Detail struct {
	Label string
	Value string
}

// AlertData fills the alert template. Its content is a placeholder until the GitHub/Jira stats are decided.
type AlertData struct {
	Title       string
	Summary     string
	ProjectName string
	Details     []Detail
	Link        string // optional; html/template blocks unsafe schemes such as javascript:
}

// ReportSection is one titled table in a report.
type ReportSection struct {
	Heading string
	Rows    []Detail
}

// ReportData fills the report template. Its content is a placeholder until the GitHub/Jira stats are decided.
type ReportData struct {
	Title       string
	Period      string
	ProjectName string
	Sections    []ReportSection
}

// Rendered is a rendered email.
type Rendered struct {
	Subject string
	HTML    string
	Text    string
}

type parsedTemplate struct {
	html *htmltemplate.Template
	text *texttemplate.Template
}

// Renderer renders the alert and report templates. It is safe for concurrent use.
type Renderer struct {
	templates map[string]parsedTemplate
}

// BuiltinTemplates returns the templates compiled into the binary.
func BuiltinTemplates() fs.FS {
	sub, err := fs.Sub(builtinFS, "templates")
	if err != nil {
		panic(err) // the embed pattern above guarantees the directory exists
	}
	return sub
}

// OverlayTemplates returns a file system that reads each file from override when it has it, and
// from base otherwise. Files in MAIL_TEMPLATE_DIR replace the built-in ones by name.
func OverlayTemplates(override, base fs.FS) fs.FS {
	return overlayFS{override: override, base: base}
}

type overlayFS struct{ override, base fs.FS }

func (o overlayFS) Open(name string) (fs.File, error) {
	f, err := o.override.Open(name)
	if err == nil {
		return f, nil
	}
	if !goerrors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	return o.base.Open(name)
}

// LoadRenderer reads and parses every template from fsys: layout.html plus <name>.html and
// <name>.txt for each template. The .txt file must define "subject". Any missing or broken file
// is an error, so a bad MAIL_TEMPLATE_DIR fails at startup rather than on the first send.
func LoadRenderer(fsys fs.FS) (*Renderer, errors.Error) {
	if fsys == nil {
		return nil, errors.Default.New("load mail templates: nil file system")
	}
	layout, err := fs.ReadFile(fsys, layoutFile)
	if err != nil {
		return nil, errors.Default.Wrap(err, "read mail template "+layoutFile)
	}
	r := &Renderer{templates: make(map[string]parsedTemplate, len(templateNames))}
	for _, name := range templateNames {
		parsed, parseErr := parseTemplate(fsys, name, string(layout))
		if parseErr != nil {
			return nil, parseErr
		}
		r.templates[name] = parsed
	}
	return r, nil
}

func parseTemplate(fsys fs.FS, name, layout string) (parsedTemplate, errors.Error) {
	htmlSrc, err := fs.ReadFile(fsys, name+".html")
	if err != nil {
		return parsedTemplate{}, errors.Default.Wrap(err, "read mail template "+name+".html")
	}
	textSrc, err := fs.ReadFile(fsys, name+".txt")
	if err != nil {
		return parsedTemplate{}, errors.Default.Wrap(err, "read mail template "+name+".txt")
	}
	html, err := htmltemplate.New(name + ".html").Option("missingkey=error").Parse(layout)
	if err == nil {
		html, err = html.Parse(string(htmlSrc))
	}
	if err != nil {
		return parsedTemplate{}, errors.Default.Wrap(err, "parse mail template "+name+".html")
	}
	text, err := texttemplate.New(name + ".txt").Option("missingkey=error").Parse(string(textSrc))
	if err != nil {
		return parsedTemplate{}, errors.Default.Wrap(err, "parse mail template "+name+".txt")
	}
	if text.Lookup(subjectName) == nil {
		return parsedTemplate{}, errors.Default.New("mail template " + name + `.txt must define "subject"`)
	}
	return parsedTemplate{html: html, text: text}, nil
}

// Names returns the template names this renderer knows, sorted.
func (r *Renderer) Names() []string {
	names := make([]string, 0, len(r.templates))
	for name := range r.templates {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// Render fills template name with data. It returns a BadInput error for an unknown name or an empty
// subject, and a plain error when data doesn't fit the template.
func (r *Renderer) Render(name string, data interface{}) (*Rendered, errors.Error) {
	t, ok := r.templates[name]
	if !ok {
		return nil, errors.BadInput.New("unknown mail template " + name)
	}
	var subject, text, html bytes.Buffer
	if err := t.text.ExecuteTemplate(&subject, subjectName, data); err != nil {
		return nil, errors.Default.Wrap(err, "render subject of mail template "+name)
	}
	if err := t.text.Execute(&text, data); err != nil {
		return nil, errors.Default.Wrap(err, "render text of mail template "+name)
	}
	if err := t.html.ExecuteTemplate(&html, layoutName, data); err != nil {
		return nil, errors.Default.Wrap(err, "render html of mail template "+name)
	}
	cleanSubject := sanitizeSubject(subject.String())
	if cleanSubject == "" {
		return nil, errors.BadInput.New("mail template " + name + " rendered an empty subject")
	}
	return &Rendered{Subject: cleanSubject, HTML: html.String(), Text: strings.TrimSpace(text.String()) + "\n"}, nil
}

// sanitizeSubject folds all whitespace, including CR and LF, into single spaces so a value can't
// inject a header, and cuts the subject to the column size.
func sanitizeSubject(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	if runes := []rune(s); len(runes) > maxSubjectRunes {
		s = string(runes[:maxSubjectRunes])
	}
	return s
}
