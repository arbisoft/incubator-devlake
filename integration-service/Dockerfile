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

# Builds the Integration Service from source into one image: the client API and the admin portal are the same process.
#   docker build -t integration-service .
# docker-compose.yml builds and runs it next to MySQL and RabbitMQ.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore first, from the project files only, so a code change does not download the packages again.
# .editorconfig carries the analyzer rules the build enforces, so it must be here too.
COPY global.json Directory.Build.props Directory.Packages.props .editorconfig ./
COPY Arbisoft.DevLake.IntegrationService.API/Arbisoft.DevLake.IntegrationService.API.csproj Arbisoft.DevLake.IntegrationService.API/
COPY Arbisoft.DevLake.IntegrationService.Business/Arbisoft.DevLake.IntegrationService.Business.csproj Arbisoft.DevLake.IntegrationService.Business/
COPY Arbisoft.DevLake.IntegrationService.DataAccess/Arbisoft.DevLake.IntegrationService.DataAccess.csproj Arbisoft.DevLake.IntegrationService.DataAccess/
RUN dotnet restore Arbisoft.DevLake.IntegrationService.API/Arbisoft.DevLake.IntegrationService.API.csproj

COPY Arbisoft.DevLake.IntegrationService.API/ Arbisoft.DevLake.IntegrationService.API/
COPY Arbisoft.DevLake.IntegrationService.Business/ Arbisoft.DevLake.IntegrationService.Business/
COPY Arbisoft.DevLake.IntegrationService.DataAccess/ Arbisoft.DevLake.IntegrationService.DataAccess/
RUN dotnet publish Arbisoft.DevLake.IntegrationService.API/Arbisoft.DevLake.IntegrationService.API.csproj -c Release --no-restore -o /out

# The runtime image runs as the non-root "app" user and listens on 8080.
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_NOLOGO=1
EXPOSE 8080
USER $APP_UID

COPY --from=build /out .
ENTRYPOINT ["dotnet", "Arbisoft.DevLake.IntegrationService.API.dll"]
