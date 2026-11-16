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

using Arbisoft.DevLake.IntegrationService.Business.Services.Audit;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.Business.Audit;

public class AuditFieldsTests
{
    private sealed record Sample(string Name, string? Description, bool IsActive, int Lifetime, string Secret, IReadOnlyList<string> Scopes, string NotListed);

    private static readonly AuditFields<Sample> Fields = new AuditFields<Sample>()
        .Add("Name", s => s.Name)
        .Add("Description", s => s.Description)
        .Add("Active", s => s.IsActive)
        .Add("Lifetime", s => s.Lifetime)
        .AddHidden("Secret", s => s.Secret)
        .Add("Scopes", s => s.Scopes);

    private static readonly Sample Original = new("Sophia", null, true, 3600, "s3cret", ["stats:read"], "a");

    [Fact]
    public void Created_ListsEveryListedFieldWithAValue_AndHidesTheSecret()
    {
        var changes = Fields.Created(Original);

        Assert.Equal(
            [
                new AuditChange("Name", null, "Sophia"),
                new AuditChange("Active", null, "Yes"),
                new AuditChange("Lifetime", null, "3600"),
                new AuditChange("Secret", null, null, Hidden: true),
                new AuditChange("Scopes", null, "stats:read")
            ],
            changes);
    }

    [Fact]
    public void Changed_ListsOnlyTheFieldsThatDiffer_WithOldAndNewValues()
    {
        var edited = Original with { Name = "Sophia AI", IsActive = false, Description = "Callbacks", NotListed = "b" };

        var changes = Fields.Changed(Original, edited);

        Assert.Equal(
            [new AuditChange("Name", "Sophia", "Sophia AI"), new AuditChange("Description", null, "Callbacks"), new AuditChange("Active", "Yes", "No")],
            changes);
    }

    [Fact]
    public void Changed_ASecret_RecordsThatItChanged_WithoutEitherValue()
    {
        var changes = Fields.Changed(Original, Original with { Secret = "n3w" });

        var change = Assert.Single(changes);
        Assert.Equal(new AuditChange("Secret", null, null, Hidden: true), change);
    }

    [Fact]
    public void Changed_NothingDifferent_GivesNoChanges_EvenWhenAListIsReorderedOrTextGoesFromEmptyToNull()
    {
        var before = Original with { Scopes = ["b", "a"], Description = string.Empty };
        var after = Original with { Scopes = ["a", "b"], Description = null };

        Assert.Empty(Fields.Changed(before, after));
    }

    [Fact]
    public void Read_WritesTimesInUtc_AndNumbersWithoutCultureFormatting()
    {
        var time = new DateTimeOffset(2026, 11, 16, 15, 30, 0, TimeSpan.FromHours(5));

        Assert.Equal("2026-11-16 10:30:00 UTC", AuditValue.Read(time));
        Assert.Equal("1234567.5", AuditValue.Read(1234567.5m));
        Assert.Null(AuditValue.Read(Array.Empty<string>()));
    }
}
