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

package oidchelper

import (
	"context"
	"net"
	"net/http"
	"net/netip"
	"testing"
)

type testResolver struct {
	addresses []netip.Addr
	err       error
}

func (r testResolver) LookupNetIP(_ context.Context, _, _ string) ([]netip.Addr, error) {
	return r.addresses, r.err
}

type recordingDialer struct {
	address string
}

func (d *recordingDialer) DialContext(_ context.Context, _, address string) (net.Conn, error) {
	d.address = address
	return nil, nil
}

func TestValidateIssuerURL(t *testing.T) {
	for _, testCase := range []struct {
		raw   string
		valid bool
	}{
		{"https://accounts.example.com", true}, {"http://accounts.example.com", false},
		{"https://127.0.0.1", false}, {"https://169.254.169.254", false},
		{"https://accounts.example.com?redirect=x", false}, {"https://user@accounts.example.com", false},
	} {
		_, err := ValidateIssuerURL(testCase.raw, false)
		if (err == nil) != testCase.valid {
			t.Errorf("ValidateIssuerURL(%q) error = %v", testCase.raw, err)
		}
	}
}

func TestValidateRedirectURL(t *testing.T) {
	for _, testCase := range []struct {
		name  string
		raw   string
		valid bool
	}{
		{name: "allows query and fragment", raw: "https://accounts.example.com/callback?tenant=customer#done", valid: true},
		{name: "rejects credentials", raw: "https://user@accounts.example.com/callback", valid: false},
		{name: "rejects private target", raw: "https://10.0.0.1/callback", valid: false},
		{name: "rejects unsafe scheme", raw: "ftp://accounts.example.com/callback", valid: false},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := ValidateRedirectURL(testCase.raw, false)
			if (err == nil) != testCase.valid {
				t.Fatalf("ValidateRedirectURL(%q) error = %v, want valid=%t", testCase.raw, err, testCase.valid)
			}
		})
	}
}

func TestAllowsLocalOIDCURL(t *testing.T) {
	if !AllowsLocalOIDCURL("http://localhost:4000") {
		t.Fatal("expected localhost deployment to allow local OIDC HTTP")
	}
	if AllowsLocalOIDCURL("https://devlake.example.com") {
		t.Fatal("expected HTTPS deployment not to allow local OIDC HTTP")
	}
}

func TestForbiddenOIDCAddress(t *testing.T) {
	for _, testCase := range []struct {
		address   string
		forbidden bool
	}{
		{address: "8.8.8.8", forbidden: false},
		{address: "0.1.2.3", forbidden: true},
		{address: "100.64.0.1", forbidden: true},
		{address: "198.18.0.1", forbidden: true},
		{address: "240.0.0.1", forbidden: true},
		{address: "::ffff:127.0.0.1", forbidden: true},
	} {
		t.Run(testCase.address, func(t *testing.T) {
			if actual := forbiddenOIDCAddress(netip.MustParseAddr(testCase.address)); actual != testCase.forbidden {
				t.Fatalf("forbiddenOIDCAddress(%q) = %t, want %t", testCase.address, actual, testCase.forbidden)
			}
		})
	}
}

func TestRestrictedTransportDialsValidatedAddress(t *testing.T) {
	dialer := &recordingDialer{}
	client := restrictedHTTPClientWithDependencies(false, testResolver{
		addresses: []netip.Addr{netip.MustParseAddr("198.51.100.10")},
	}, dialer)

	_, err := client.Transport.(*http.Transport).DialContext(context.Background(), "tcp", "issuer.example:443")
	if err != nil {
		t.Fatal(err)
	}
	if dialer.address != "198.51.100.10:443" {
		t.Fatalf("dialed address = %q, want validated IP", dialer.address)
	}
}

func TestRestrictedTransportRejectsPrivateResolvedAddress(t *testing.T) {
	dialer := &recordingDialer{}
	client := restrictedHTTPClientWithDependencies(false, testResolver{
		addresses: []netip.Addr{netip.MustParseAddr("127.0.0.1")},
	}, dialer)

	_, err := client.Transport.(*http.Transport).DialContext(context.Background(), "tcp", "issuer.example:443")
	if err == nil {
		t.Fatal("expected private resolved address to be rejected")
	}
	if dialer.address != "" {
		t.Fatalf("dialer was called with %q", dialer.address)
	}
}

func TestRestrictedTransportRejectsEmptyResolution(t *testing.T) {
	dialer := &recordingDialer{}
	client := restrictedHTTPClientWithDependencies(false, testResolver{}, dialer)

	_, err := client.Transport.(*http.Transport).DialContext(context.Background(), "tcp", "issuer.example:443")
	if err == nil {
		t.Fatal("expected empty DNS resolution to be rejected")
	}
	if dialer.address != "" {
		t.Fatalf("dialer was called with %q", dialer.address)
	}
}
