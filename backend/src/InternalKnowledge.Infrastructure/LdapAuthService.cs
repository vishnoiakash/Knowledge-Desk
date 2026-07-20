using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace InternalKnowledge.Infrastructure;

/// <summary>
/// Calls the corporate LDAP REST proxy (same endpoint used by Health IMS) to
/// verify credentials.  Returns true only when the proxy responds with
/// {"authenticated":true}.
/// </summary>
public sealed class LdapAuthService(
    IHttpClientFactory httpFactory,
    IConfiguration configuration,
    ILogger<LdapAuthService> logger)
{
    private readonly string _ldapUrl =
        configuration["Ldap:Url"] ?? "https://ldapapi.policybazaar.com/api/auth";

    /// <returns>true when LDAP authentication succeeds.</returns>
    public async Task<bool> AuthenticateAsync(string username, string password, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            return false;

        var client = httpFactory.CreateClient("ldap");
        try
        {
            using var response = await client.PostAsJsonAsync(
                _ldapUrl,
                new { username, password },
                ct);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("LDAP proxy returned {Status} for user {User}.",
                    (int)response.StatusCode, username);
                return false;
            }

            var body = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(body);
            return doc.RootElement.TryGetProperty("authenticated", out var v) && v.GetBoolean();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "LDAP request failed for user {User}.", username);
            return false;
        }
    }
}
