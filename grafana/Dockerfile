# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
#Apache DevLake is an effort undergoing incubation at The Apache Software
#Foundation (ASF), sponsored by the Apache Incubator PMC.
#
#Incubation is required of all newly accepted projects until a further review
#indicates that the infrastructure, communications, and decision making process
#have stabilized in a manner consistent with other successful ASF projects.
#
#While incubation status is not necessarily a reflection of the completeness or stability of the code,
#it does indicate that the project has yet to be fully endorsed by the ASF.

FROM grafana/grafana:13.2.2
COPY ./provisioning/dashboards /etc/grafana/provisioning/dashboards
COPY ./provisioning/datasources /etc/grafana/provisioning/datasources
COPY ./dashboards /etc/grafana/dashboards
COPY ./img/grafana_icon.svg /usr/share/grafana/public/img/grafana_icon.svg
COPY ./img /usr/share/grafana/public/img/lake
ENV GF_USERS_ALLOW_SIGN_UP=false
ENV GF_SERVER_SERVE_FROM_SUB_PATH=true
ENV GF_DASHBOARDS_JSON_ENABLED=true
ENV GF_LIVE_ALLOWED_ORIGINS='*'
# Serve the provisioned dashboard JSON at Grafana's root route. This avoids a
# redirect to a /d/<uid>/<slug> route that Grafana then labels as "Home".
ENV GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH="/etc/grafana/dashboards/AI Impact/AI Throughput Overview.json"
# Grafana interpolates $PROMETHEUS_URL in provisioning/datasources/prometheus.yml.
# Default matches the previous hardcoded URL so local compose and prod (which
# do not set this var) keep today's behavior. Staging overrides to the Compose
# service name (http://prometheus:9090). An unset var would provision an empty
# URL and wipe the datasource on boot.
ENV PROMETHEUS_URL=http://host.docker.internal:9090
# Keep bundled plugin versions instead of re-downloading them on every start.
ENV GF_PLUGINS_PREINSTALL_AUTO_UPDATE=false
# At least 12 characters with upper, lower, digit and symbol for every local password.
ENV GF_AUTH_BASIC_PASSWORD_POLICY=true
# Grafana's default CSP plus frame-ancestors; Grafana's own bundle still evaluates strings, so 'unsafe-eval' stays.
ENV GF_SECURITY_CONTENT_SECURITY_POLICY=true
ENV GF_SECURITY_CONTENT_SECURITY_POLICY_TEMPLATE="script-src 'self' 'unsafe-eval' 'unsafe-inline' 'strict-dynamic' \$NONCE;object-src 'none';font-src 'self';style-src 'self' 'unsafe-inline' blob:;img-src * data:;base-uri 'self';connect-src 'self' grafana.com *.cartocdn.com ws://\$ROOT_PATH wss://\$ROOT_PATH;manifest-src 'self';media-src 'none';form-action 'self' \$FORM_ACTION_ADDITIONAL_HOSTS;frame-ancestors 'none';"
USER root
RUN chgrp -R 0 /etc/grafana /usr/share/grafana /var/lib/grafana && \
    chmod -R g=u /etc/grafana /usr/share/grafana /var/lib/grafana
USER 101
