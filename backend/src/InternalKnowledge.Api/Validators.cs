using FluentValidation;
using InternalKnowledge.Application;
using InternalKnowledge.Domain;

// ── Existing validators ───────────────────────────────────────────────────────

public sealed class AnalyzeRequestValidator : AbstractValidator<AnalyzeKnowledgeRequest>
{
    public AnalyzeRequestValidator()
    {
        RuleFor(x => x.RawInput).NotEmpty().Length(20, 20_000);
        RuleFor(x => x.Project).MaximumLength(120);
        RuleFor(x => x.Module).MaximumLength(120);
    }
}

public sealed class KnowledgeEntryValidator : AbstractValidator<KnowledgeEntry>
{
    public KnowledgeEntryValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Summary).NotEmpty().MaximumLength(2000);
        RuleFor(x => x.OriginalInput).NotEmpty().MaximumLength(20_000);
        RuleFor(x => x.ConfidenceScore).InclusiveBetween(0, 1);
        RuleForEach(x => x.Tags).NotEmpty().MaximumLength(80);
        RuleForEach(x => x.Technologies).NotEmpty().MaximumLength(80);
        RuleFor(x => x.Tags).Must(x => x.Count <= 30).WithMessage("Maximum 30 tags.");
        RuleFor(x => x.Technologies).Must(x => x.Count <= 30).WithMessage("Maximum 30 technologies.");
    }
}

public sealed class AskRequestValidator : AbstractValidator<AskRequest>
{
    public AskRequestValidator()
    {
        RuleFor(x => x.Question).NotEmpty().Length(3, 4000);
        RuleFor(x => x.History).Must(x => x is null || x.Count <= 10)
            .WithMessage("History is capped at 10 turns.");
        RuleForEach(x => x.History).ChildRules(turn =>
        {
            turn.RuleFor(x => x.Role).Must(x => x is "user" or "assistant")
                .WithMessage("Role must be 'user' or 'assistant'.");
            turn.RuleFor(x => x.Content).NotEmpty().MaximumLength(4000);
        });
    }
}

public sealed class SemanticSearchValidator : AbstractValidator<SemanticSearchRequest>
{
    public SemanticSearchValidator()
    {
        RuleFor(x => x.Query).NotEmpty().MaximumLength(4000);
        RuleFor(x => x.Limit).InclusiveBetween(1, 20);
    }
}

// ── New validators ────────────────────────────────────────────────────────────

public sealed class RaiseQuestionValidator : AbstractValidator<RaiseQuestionRequest>
{
    public RaiseQuestionValidator()
    {
        RuleFor(x => x.Text).NotEmpty().MaximumLength(2000);
        RuleFor(x => x.Project).MaximumLength(120);
        RuleFor(x => x.TargetUsernames)
            .Must(x => x is null || x.Count > 0)
            .When(x => x.Audience == QuestionAudience.Specific)
            .WithMessage("Specific audience requires at least one target username.");
        RuleForEach(x => x.TargetUsernames).NotEmpty().MaximumLength(120);
    }
}

public sealed class QuestionAnswerValidator : AbstractValidator<QuestionAnswerRequest>
{
    public QuestionAnswerValidator()
    {
        RuleFor(x => x.Answer).NotEmpty().MaximumLength(10_000);
    }
}

public sealed class CaptureEvaluateValidator : AbstractValidator<CaptureEvaluateRequest>
{
    public CaptureEvaluateValidator()
    {
        RuleFor(x => x.CurrentInput).NotEmpty().Length(10, 20_000);
        RuleFor(x => x.Project).MaximumLength(120);
        RuleFor(x => x.Module).MaximumLength(120);
    }
}
