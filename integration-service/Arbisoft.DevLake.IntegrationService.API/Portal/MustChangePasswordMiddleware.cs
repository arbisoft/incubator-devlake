// Licensed to the Apache Software Foundation (ASF) under one or more
// contributor license agreements.  See the NOTICE file distributed with
// this work for additional information regarding copyright ownership.
// The ASF licenses this file to You under the Apache License, Version 2.0
// (the "License"); you may not use this file except in compliance with
// the License.  You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

namespace Arbisoft.DevLake.IntegrationService.API.Portal;

/// <summary>While a password must be changed (the seeded admin/admin), nothing else in the portal can be used.</summary>
public sealed class MustChangePasswordMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path;
        if (context.User.HasClaim(PortalAuthentication.MustChangePasswordClaim, "true")
            && !path.StartsWithSegments(PortalAuthentication.ChangePasswordPath, StringComparison.OrdinalIgnoreCase)
            && !path.StartsWithSegments("/Account/Logout", StringComparison.OrdinalIgnoreCase)
            && !path.StartsWithSegments("/health", StringComparison.OrdinalIgnoreCase))
        {
            context.Response.Redirect(PortalAuthentication.ChangePasswordPath);
            return;
        }

        await next(context);
    }
}
