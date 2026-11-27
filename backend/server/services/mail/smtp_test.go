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
	"bufio"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"math/big"
	"net"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	fakeUser     = "devlake-alerts@arbisoft.com"
	fakePassword = "app-password-secret"
)

// fakeSMTP is a minimal SMTP server for driver tests: EHLO, STARTTLS, AUTH PLAIN, MAIL, RCPT, DATA, QUIT.
type fakeSMTP struct {
	t         *testing.T
	ln        net.Listener
	tlsConfig *tls.Config       // nil: STARTTLS is not offered
	rcptReply string            // reply to RCPT TO; empty means "250 OK"
	rejects   map[string]string // reply to RCPT TO for single addresses, checked after rcptReply
	quitReply string            // reply to QUIT; empty means "221 bye"
	rsetReply string            // reply to RSET; empty means "250 OK"
	wg        sync.WaitGroup

	mu       sync.Mutex // guards the fields below
	authUser string
	authPass string
	usedTLS  bool
	rcpts    []string
	data     string
	datas    []string // every message body, in order
}

func startFakeSMTP(t *testing.T, tlsConfig *tls.Config, rcptReply string) *fakeSMTP {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	s := &fakeSMTP{t: t, ln: ln, tlsConfig: tlsConfig, rcptReply: rcptReply}
	s.wg.Add(1)
	go s.serve()
	t.Cleanup(func() {
		_ = ln.Close() // stops serve; the error is irrelevant in cleanup
		s.wg.Wait()
	})
	return s
}

func (s *fakeSMTP) port() int { return s.ln.Addr().(*net.TCPAddr).Port }

func (s *fakeSMTP) serve() {
	defer s.wg.Done()
	for {
		conn, err := s.ln.Accept()
		if err != nil {
			return
		}
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			defer conn.Close()
			s.session(conn)
		}()
	}
}

func (s *fakeSMTP) session(conn net.Conn) {
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second)) // bounds a stuck test
	r, w := bufio.NewReader(conn), bufio.NewWriter(conn)
	reply := func(lines ...string) {
		for _, l := range lines {
			_, _ = w.WriteString(l + "\r\n")
		}
		_ = w.Flush()
	}
	reply("220 fake ESMTP")
	secure := false
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return
		}
		cmd := strings.TrimRight(line, "\r\n")
		verb := strings.ToUpper(strings.SplitN(cmd, " ", 2)[0])
		switch verb {
		case "EHLO", "HELO":
			lines := []string{"250-fake"}
			if s.tlsConfig != nil && !secure {
				lines = append(lines, "250-STARTTLS")
			}
			reply(append(lines, "250-AUTH PLAIN LOGIN", "250 8BITMIME")...)
		case "STARTTLS":
			reply("220 ready")
			tlsConn := tls.Server(conn, s.tlsConfig)
			if err := tlsConn.Handshake(); err != nil {
				return
			}
			conn, secure = tlsConn, true
			r, w = bufio.NewReader(conn), bufio.NewWriter(conn)
			s.mu.Lock()
			s.usedTLS = true
			s.mu.Unlock()
		case "AUTH":
			parts := strings.Fields(cmd)
			raw, _ := base64.StdEncoding.DecodeString(parts[len(parts)-1])
			fields := strings.Split(string(raw), "\x00")
			if len(fields) != 3 || fields[1] != fakeUser || fields[2] != fakePassword {
				reply("535 5.7.8 Username and Password not accepted")
				continue
			}
			s.mu.Lock()
			s.authUser, s.authPass = fields[1], fields[2]
			s.mu.Unlock()
			reply("235 2.7.0 Accepted")
		case "RSET":
			if s.rsetReply != "" {
				reply(s.rsetReply)
				continue
			}
			reply("250 OK")
		case "MAIL", "NOOP":
			reply("250 OK")
		case "RCPT":
			if s.rcptReply != "" {
				reply(s.rcptReply)
				continue
			}
			if r, ok := s.rejects[strings.Trim(strings.TrimPrefix(strings.SplitN(cmd, " ", 2)[1], "TO:"), "<>")]; ok {
				reply(r)
				continue
			}
			s.mu.Lock()
			s.rcpts = append(s.rcpts, cmd)
			s.mu.Unlock()
			reply("250 OK")
		case "DATA":
			reply("354 go ahead")
			var b strings.Builder
			for {
				l, err := r.ReadString('\n')
				if err != nil {
					return
				}
				if l == ".\r\n" {
					break
				}
				b.WriteString(l)
			}
			s.mu.Lock()
			s.data = b.String()
			s.datas = append(s.datas, s.data)
			s.mu.Unlock()
			reply("250 OK queued")
		case "QUIT":
			if s.quitReply != "" {
				reply(s.quitReply)
				return
			}
			reply("221 bye")
			return
		default:
			reply("502 unknown")
		}
	}
}

// selfSignedTLS returns a server config and a client config that trusts it, for 127.0.0.1.
func selfSignedTLS(t *testing.T) (server, client *tls.Config) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "127.0.0.1"},
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1")},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	cert, err := x509.ParseCertificate(der)
	require.NoError(t, err)
	pool := x509.NewCertPool()
	pool.AddCert(cert)
	server = &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: key}}, MinVersion: tls.VersionTLS12}
	client = &tls.Config{RootCAs: pool, ServerName: "127.0.0.1", MinVersion: tls.VersionTLS12}
	return server, client
}

func testMessage() *Message {
	return &Message{
		FromAddress: fakeUser, FromName: "DevLake", ReplyTo: "team@arbisoft.com",
		To: []string{"ali@arbisoft.com"}, Subject: "[DevLake alert] Test",
		HTMLBody: "<p>html body</p>", TextBody: "text body",
	}
}

func TestSMTPMailerSendsOverSTARTTLSWithPlainAuth(t *testing.T) {
	serverTLS, clientTLS := selfSignedTLS(t)
	srv := startFakeSMTP(t, serverTLS, "")
	m, err := NewSMTPMailer(SMTPConfig{
		Host: "127.0.0.1", Port: srv.port(), Username: fakeUser, Password: fakePassword,
		Security: SecurityStartTLS, Auth: AuthPlain, Timeout: 5 * time.Second,
	}, WithTLSConfig(clientTLS))
	require.Nil(t, err)

	id, sendErr := m.Send(context.Background(), testMessage())

	require.Nil(t, sendErr)
	assert.NotEmpty(t, id)
	srv.mu.Lock()
	defer srv.mu.Unlock()
	assert.True(t, srv.usedTLS, "the session must upgrade with STARTTLS before AUTH")
	assert.Equal(t, fakeUser, srv.authUser)
	assert.Equal(t, []string{"RCPT TO:<ali@arbisoft.com>"}, srv.rcpts)
	assert.Contains(t, srv.data, "Subject: [DevLake alert] Test")
	assert.Contains(t, srv.data, "Reply-To: <team@arbisoft.com>")
	assert.Contains(t, srv.data, "multipart/alternative")
	assert.Contains(t, srv.data, "text body")
	assert.Contains(t, srv.data, "<p>html body</p>")
	assert.Contains(t, srv.data, "Message-ID: "+id)
}

func TestSMTPMailerWithoutTLSOrAuth(t *testing.T) {
	srv := startFakeSMTP(t, nil, "")
	m, err := NewSMTPMailer(SMTPConfig{Host: "127.0.0.1", Port: srv.port(), Security: SecurityNone, Auth: AuthNone, Timeout: 5 * time.Second})
	require.Nil(t, err)

	_, sendErr := m.Send(context.Background(), testMessage())

	require.Nil(t, sendErr)
	srv.mu.Lock()
	defer srv.mu.Unlock()
	assert.False(t, srv.usedTLS)
	assert.Empty(t, srv.authUser)
	assert.Contains(t, srv.data, "text body")
}

func TestSMTPMailerAFailedQuitAfterDeliveryIsASuccess(t *testing.T) {
	for _, quit := range []string{"554 5.0.0 closing with an error", "421 4.4.2 timeout"} {
		t.Run(quit, func(t *testing.T) {
			srv := startFakeSMTP(t, nil, "")
			srv.quitReply = quit
			m, err := NewSMTPMailer(SMTPConfig{Host: "127.0.0.1", Port: srv.port(), Security: SecurityNone, Auth: AuthNone, Timeout: 5 * time.Second})
			require.Nil(t, err)
			msg := testMessage()
			msg.To = []string{"a@arbisoft.com", "b@arbisoft.com"}

			messageID, sendErr := m.Send(context.Background(), msg)

			require.Nil(t, sendErr, "every copy was accepted, so a failed QUIT must not fail or retry the send")
			assert.NotEmpty(t, messageID)
			srv.mu.Lock()
			defer srv.mu.Unlock()
			assert.Len(t, srv.datas, 2)
		})
	}
}

func TestSMTPMailerAFailedResetAfterDeliveryIsASuccess(t *testing.T) {
	for _, rset := range []string{"554 5.0.0 reset failed", "421 4.4.2 timeout"} {
		t.Run(rset, func(t *testing.T) {
			srv := startFakeSMTP(t, nil, "")
			srv.rsetReply = rset
			m, err := NewSMTPMailer(SMTPConfig{Host: "127.0.0.1", Port: srv.port(), Security: SecurityNone, Auth: AuthNone, Timeout: 5 * time.Second})
			require.Nil(t, err)
			msg := testMessage()
			msg.To = []string{"a@arbisoft.com", "b@arbisoft.com"}

			messageID, sendErr := m.Send(context.Background(), msg)

			require.Nil(t, sendErr, "the server accepted every copy, so a failed RSET after each must not fail or retry the send")
			assert.NotEmpty(t, messageID)
			srv.mu.Lock()
			defer srv.mu.Unlock()
			assert.Len(t, srv.datas, 2)
		})
	}
}

func TestSMTPMailerClassifiesFailures(t *testing.T) {
	serverTLS, clientTLS := selfSignedTLS(t)
	cases := []struct {
		name      string
		password  Secret
		rcptReply string
		permanent bool
	}{
		{"wrong password is permanent", "wrong", "", true},
		{"mailbox full (4xx) is temporary", fakePassword, "452 4.2.2 Mailbox full", false},
		{"unknown user (5xx) is permanent", fakePassword, "550 5.1.1 No such user", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := startFakeSMTP(t, serverTLS, tc.rcptReply)
			m, err := NewSMTPMailer(SMTPConfig{
				Host: "127.0.0.1", Port: srv.port(), Username: fakeUser, Password: tc.password,
				Security: SecurityStartTLS, Auth: AuthPlain, Timeout: 5 * time.Second,
			}, WithTLSConfig(clientTLS))
			require.Nil(t, err)

			_, sendErr := m.Send(context.Background(), testMessage())

			require.NotNil(t, sendErr)
			assert.Equal(t, tc.permanent, IsPermanent(sendErr), sendErr.Error())
			assert.NotContains(t, sendErr.Error(), fakePassword)
		})
	}
}

func TestSMTPMailerSendsEachRecipientTheirOwnCopy(t *testing.T) {
	srv := startFakeSMTP(t, nil, "")
	m, err := NewSMTPMailer(SMTPConfig{Host: "127.0.0.1", Port: srv.port(), Security: SecurityNone, Auth: AuthNone, Timeout: 5 * time.Second})
	require.Nil(t, err)
	msg := testMessage()
	msg.To = []string{"ali@arbisoft.com", "sara@arbisoft.com"}

	id, sendErr := m.Send(context.Background(), msg)

	require.Nil(t, sendErr)
	srv.mu.Lock()
	defer srv.mu.Unlock()
	assert.Equal(t, []string{"RCPT TO:<ali@arbisoft.com>", "RCPT TO:<sara@arbisoft.com>"}, srv.rcpts)
	require.Len(t, srv.datas, 2)
	assert.Contains(t, srv.datas[0], "To: <ali@arbisoft.com>")
	assert.NotContains(t, srv.datas[0], "sara@arbisoft.com", "a copy names only its own recipient")
	assert.Contains(t, srv.datas[1], "To: <sara@arbisoft.com>")
	for _, d := range srv.datas {
		assert.Contains(t, d, "Message-ID: "+id, "every copy shares the Message-ID")
	}
}

func TestSMTPMailerRejectedRecipientDoesNotBlockTheOthers(t *testing.T) {
	cases := []struct {
		name      string
		rejects   map[string]string
		partial   bool
		permanent bool
	}{
		{"one rejected: the rest are delivered", map[string]string{"gone@arbisoft.com": "550 5.1.1 No such user"}, true, false},
		{"all rejected with 5xx: permanent", map[string]string{
			"gone@arbisoft.com": "550 5.1.1 No such user", "ali@arbisoft.com": "550 5.1.1 No such user"}, false, true},
		{"all rejected, one with 4xx: temporary", map[string]string{
			"gone@arbisoft.com": "550 5.1.1 No such user", "ali@arbisoft.com": "452 4.2.2 Mailbox full"}, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := startFakeSMTP(t, nil, "")
			srv.rejects = tc.rejects
			m, err := NewSMTPMailer(SMTPConfig{Host: "127.0.0.1", Port: srv.port(), Security: SecurityNone, Auth: AuthNone, Timeout: 5 * time.Second})
			require.Nil(t, err)
			msg := testMessage()
			msg.To = []string{"gone@arbisoft.com", "ali@arbisoft.com"}

			id, sendErr := m.Send(context.Background(), msg)

			require.NotNil(t, sendErr)
			assert.Equal(t, tc.partial, IsPartial(sendErr), sendErr.Error())
			assert.Equal(t, tc.permanent, IsPermanent(sendErr), sendErr.Error())
			assert.Contains(t, sendErr.Error(), "gone@arbisoft.com")
			if tc.partial {
				assert.NotEmpty(t, id)
				assert.Contains(t, sendErr.Error(), "not delivered to 1 of 2 recipients")
				srv.mu.Lock()
				assert.Equal(t, []string{"RCPT TO:<ali@arbisoft.com>"}, srv.rcpts)
				assert.Len(t, srv.datas, 1)
				srv.mu.Unlock()
			} else {
				assert.Empty(t, id)
			}
		})
	}
}

func TestSMTPMailerConnectionRefusedIsTemporary(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	port := ln.Addr().(*net.TCPAddr).Port
	require.NoError(t, ln.Close())
	m, mErr := NewSMTPMailer(SMTPConfig{Host: "127.0.0.1", Port: port, Security: SecurityNone, Auth: AuthNone, Timeout: time.Second})
	require.Nil(t, mErr)

	_, sendErr := m.Send(context.Background(), testMessage())

	require.NotNil(t, sendErr)
	assert.False(t, IsPermanent(sendErr))
	assert.Contains(t, sendErr.Error(), "send through 127.0.0.1")
}

func TestSMTPMailerRejectsABadMessageAsPermanent(t *testing.T) {
	m, err := NewSMTPMailer(SMTPConfig{Host: "127.0.0.1", Port: 25, Security: SecurityNone, Auth: AuthNone, Timeout: time.Second})
	require.Nil(t, err)
	msg := testMessage()
	msg.To = []string{"not an address"}

	_, sendErr := m.Send(context.Background(), msg)

	require.NotNil(t, sendErr)
	assert.True(t, IsPermanent(sendErr))
}

func TestNewSMTPMailerValidates(t *testing.T) {
	cases := []struct {
		name string
		cfg  SMTPConfig
	}{
		{"no host", SMTPConfig{Port: 587, Auth: AuthNone}},
		{"unknown auth", SMTPConfig{Host: "h", Port: 587, Auth: "kerberos"}},
		{"bad port", SMTPConfig{Host: "h", Port: 0, Auth: AuthNone}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := NewSMTPMailer(tc.cfg)
			assert.NotNil(t, err)
		})
	}
	_, err := NewSMTPMailer(SMTPConfig{Host: "h", Port: 465, Security: SecurityTLS, Auth: AuthLogin, Username: "u", Password: "p", Timeout: time.Second})
	assert.Nil(t, err, "implicit TLS with LOGIN auth is valid")
}
