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

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.ApplicationModels;
using Microsoft.AspNetCore.Mvc.Authorization;

namespace Arbisoft.DevLake.IntegrationService.API.Portal;

/// <summary>
/// Every page needs an editor or administrator unless it says otherwise with its own <c>[Authorize]</c> or <c>[AllowAnonymous]</c>, so a new page
/// is never open by accident. Someone signed in without access only reaches the "ask the administrator" page, changing their password and signing out.
/// </summary>
public sealed class RequireEditorByDefaultConvention : IPageApplicationModelConvention
{
    public void Apply(PageApplicationModel model)
    {
        if (DeclaresAccess(model.PageType) || DeclaresAccess(model.HandlerType))
        {
            return;
        }

        model.Filters.Add(new AuthorizeFilter(PortalAuthentication.EditorPolicy));
    }

    private static bool DeclaresAccess(Type type) =>
        type.GetCustomAttributes(inherit: true).Any(attribute => attribute is IAuthorizeData or IAllowAnonymous);
}
