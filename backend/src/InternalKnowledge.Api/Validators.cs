using FluentValidation;
using InternalKnowledge.Application;
using InternalKnowledge.Domain;

public sealed class AnalyzeRequestValidator:AbstractValidator<AnalyzeKnowledgeRequest>{public AnalyzeRequestValidator(){RuleFor(x=>x.RawInput).NotEmpty().Length(20,20000);RuleFor(x=>x.Project).MaximumLength(120);RuleFor(x=>x.Module).MaximumLength(120);}}
public sealed class KnowledgeEntryValidator:AbstractValidator<KnowledgeEntry>{public KnowledgeEntryValidator(){RuleFor(x=>x.Title).NotEmpty().MaximumLength(200);RuleFor(x=>x.Summary).NotEmpty().MaximumLength(2000);RuleFor(x=>x.OriginalInput).NotEmpty().MaximumLength(20000);RuleFor(x=>x.ConfidenceScore).InclusiveBetween(0,1);}}
public sealed class AskRequestValidator:AbstractValidator<AskRequest>{public AskRequestValidator(){RuleFor(x=>x.Question).NotEmpty().Length(3,4000);}}
public sealed class SemanticSearchValidator:AbstractValidator<SemanticSearchRequest>{public SemanticSearchValidator(){RuleFor(x=>x.Query).NotEmpty().MaximumLength(4000);RuleFor(x=>x.Limit).InclusiveBetween(1,20);}}
