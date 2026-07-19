using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

public sealed class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger,IHostEnvironment environment):IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context,Exception exception,CancellationToken cancellationToken)
    {
        logger.LogError(exception,"Unhandled API error for {Method} {Path}",context.Request.Method,context.Request.Path);
        context.Response.StatusCode=StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new ProblemDetails{Status=500,Title="Knowledge Desk could not complete the request.",Detail=environment.IsDevelopment()?exception.Message:"An unexpected error occurred."},cancellationToken);
        return true;
    }
}
