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
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

const oidcRequestTimeout = 10 * time.Second

type netIPResolver interface {
	LookupNetIP(ctx context.Context, network, host string) ([]netip.Addr, error)
}

type contextDialer interface {
	DialContext(ctx context.Context, network, address string) (net.Conn, error)
}

// ValidateIssuerURL rejects syntactically unsafe issuer URLs before discovery.
// DNS addresses are also checked at dial time to prevent a hostname resolving to
// private infrastructure after validation.
func ValidateIssuerURL(raw string, allowHTTP bool) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u == nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, fmt.Errorf("OIDC issuer URL is invalid")
	}
	if u.Scheme != "https" && !(allowHTTP && u.Scheme == "http") {
		return nil, fmt.Errorf("OIDC issuer URL must use HTTPS")
	}
	if ip, err := netip.ParseAddr(u.Hostname()); err == nil && forbiddenOIDCAddress(ip) {
		return nil, fmt.Errorf("OIDC issuer URL cannot target a private address")
	}
	return u, nil
}

// NewRestrictedHTTPClient supplies OIDC discovery/JWKS/token exchange with a
// bounded transport that rejects private resolved addresses and unsafe redirects.
func NewRestrictedHTTPClient(allowHTTP bool) *http.Client {
	return newRestrictedHTTPClient(allowHTTP, net.DefaultResolver, &net.Dialer{Timeout: oidcRequestTimeout})
}

func newRestrictedHTTPClient(allowHTTP bool, resolver netIPResolver, dialer contextDialer) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		addresses, err := resolver.LookupNetIP(ctx, "ip", host)
		if err != nil {
			return nil, err
		}
		for _, address := range addresses {
			if forbiddenOIDCAddress(address) {
				return nil, fmt.Errorf("OIDC endpoint resolves to a private address")
			}
		}
		if len(addresses) == 0 {
			return nil, fmt.Errorf("OIDC endpoint did not resolve to an IP address")
		}
		return dialer.DialContext(ctx, network, net.JoinHostPort(addresses[0].String(), port))
	}
	return &http.Client{
		Timeout:   oidcRequestTimeout,
		Transport: transport,
		CheckRedirect: func(request *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return fmt.Errorf("OIDC endpoint redirected too many times")
			}
			_, err := ValidateIssuerURL(request.URL.String(), allowHTTP)
			return err
		},
	}
}

func forbiddenOIDCAddress(address netip.Addr) bool {
	return !address.IsValid() || address.IsLoopback() || address.IsLinkLocalUnicast() || address.IsLinkLocalMulticast() ||
		address.IsPrivate() || address.IsMulticast() || address.IsUnspecified()
}
