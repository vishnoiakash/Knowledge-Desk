using System.Text;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace InternalKnowledge.Infrastructure;

/// <summary>
/// Extracts plain text from uploaded documents.
/// Supported: .pdf, .docx, .md, .txt
/// Returns one string per logical "chunk" of the document.
/// Chunks are split on page breaks (PDF), heading styles (DOCX),
/// or double-blank-lines (text/markdown) — capped at MaxChunkChars.
/// The caller decides whether to analyse all chunks as one note or separately.
/// </summary>
public sealed class DocumentTextExtractor
{
    /// <summary>Maximum characters per returned chunk before hard-splitting.</summary>
    private const int MaxChunkChars = 8_000;

    /// <summary>Minimum characters for a chunk to be worth analysing.</summary>
    private const int MinChunkChars = 40;

    public static readonly IReadOnlySet<string> SupportedExtensions =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        { ".pdf", ".docx", ".md", ".txt", ".markdown" };

    /// <summary>
    /// Extracts text chunks from the stream. <paramref name="fileName"/> is
    /// used only to determine the format — the stream is read directly.
    /// </summary>
    public IReadOnlyList<DocumentChunk> Extract(Stream stream, string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext switch
        {
            ".pdf"                  => ExtractPdf(stream),
            ".docx"                 => ExtractDocx(stream),
            ".md" or ".markdown"    => ExtractMarkdown(ReadAll(stream)),
            ".txt"                  => ExtractPlainText(ReadAll(stream)),
            _                       => throw new NotSupportedException(
                $"File type '{ext}' is not supported. Upload a .pdf, .docx, .md, or .txt file.")
        };
    }

    // ── PDF ──────────────────────────────────────────────────────────────────

    private static IReadOnlyList<DocumentChunk> ExtractPdf(Stream stream)
    {
        using var pdf    = PdfDocument.Open(stream);
        var pageTexts    = new List<string>();

        foreach (var page in pdf.GetPages())
        {
            var sb = new StringBuilder();
            foreach (var word in page.GetWords())
            {
                sb.Append(word.Text);
                sb.Append(' ');
            }
            var text = sb.ToString().Trim();
            if (text.Length >= MinChunkChars)
                pageTexts.Add(text);
        }

        // Merge adjacent pages into chunks up to MaxChunkChars
        return MergeIntoChunks(pageTexts, "Page");
    }

    // ── DOCX ─────────────────────────────────────────────────────────────────

    private static IReadOnlyList<DocumentChunk> ExtractDocx(Stream stream)
    {
        using var doc  = WordprocessingDocument.Open(stream, isEditable: false);
        var body       = doc.MainDocumentPart?.Document?.Body;
        if (body is null) return [];

        var sections   = new List<string>();
        var current    = new StringBuilder();

        foreach (var para in body.Elements<Paragraph>())
        {
            var style = para.ParagraphProperties?.ParagraphStyleId?.Val?.Value ?? "";
            var isHeading = style.StartsWith("Heading", StringComparison.OrdinalIgnoreCase)
                         || style.StartsWith("heading", StringComparison.OrdinalIgnoreCase);

            var text = string.Concat(
                para.Elements<Run>()
                    .SelectMany(r => r.Elements<Text>())
                    .Select(t => t.Text));

            if (isHeading && current.Length > MinChunkChars)
            {
                // Start a new section on each heading
                sections.Add(current.ToString().Trim());
                current.Clear();
            }

            if (!string.IsNullOrWhiteSpace(text))
            {
                current.AppendLine(text);
            }
        }

        if (current.Length > MinChunkChars)
            sections.Add(current.ToString().Trim());

        return MergeIntoChunks(sections, "Section");
    }

    // ── Markdown ─────────────────────────────────────────────────────────────

    private static IReadOnlyList<DocumentChunk> ExtractMarkdown(string text)
    {
        // Split on H1/H2/H3 headings (## Heading) — each heading starts a new chunk
        var lines    = text.Split('\n');
        var sections = new List<string>();
        var current  = new StringBuilder();

        foreach (var line in lines)
        {
            if (line.StartsWith("# ") || line.StartsWith("## ") || line.StartsWith("### "))
            {
                if (current.Length > MinChunkChars)
                {
                    sections.Add(current.ToString().Trim());
                    current.Clear();
                }
            }
            current.AppendLine(line);
        }

        if (current.Length > MinChunkChars)
            sections.Add(current.ToString().Trim());

        return sections.Count > 0
            ? MergeIntoChunks(sections, "Section")
            : ExtractPlainText(text);
    }

    // ── Plain text ────────────────────────────────────────────────────────────

    private static IReadOnlyList<DocumentChunk> ExtractPlainText(string text)
    {
        // Split on double blank lines — treat each paragraph block as a potential chunk
        var paragraphs = text
            .Split(["\r\n\r\n", "\n\n"], StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => p.Length >= MinChunkChars)
            .ToList();

        return paragraphs.Count > 0
            ? MergeIntoChunks(paragraphs, "Paragraph")
            : [new DocumentChunk(1, text.Trim(), "Document")];
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Merges adjacent small sections into chunks up to MaxChunkChars,
    /// then hard-splits any chunk that still exceeds the limit.
    /// </summary>
    private static IReadOnlyList<DocumentChunk> MergeIntoChunks(
        IReadOnlyList<string> sections, string labelPrefix)
    {
        var result  = new List<DocumentChunk>();
        var current = new StringBuilder();
        var idx     = 1;

        foreach (var section in sections)
        {
            if (current.Length + section.Length > MaxChunkChars && current.Length > MinChunkChars)
            {
                result.Add(new DocumentChunk(idx++, current.ToString().Trim(), labelPrefix));
                current.Clear();
            }
            current.AppendLine(section);
        }

        if (current.Length > MinChunkChars)
            result.Add(new DocumentChunk(idx, current.ToString().Trim(), labelPrefix));

        // Hard-split any individual chunk that is still too large
        var final = new List<DocumentChunk>();
        var finalIdx = 1;
        foreach (var chunk in result)
        {
            if (chunk.Text.Length <= MaxChunkChars)
            {
                final.Add(chunk with { Index = finalIdx++ });
                continue;
            }
            for (var i = 0; i < chunk.Text.Length; i += MaxChunkChars)
            {
                var part = chunk.Text.Substring(i, Math.Min(MaxChunkChars, chunk.Text.Length - i));
                if (part.Length >= MinChunkChars)
                    final.Add(new DocumentChunk(finalIdx++, part, labelPrefix));
            }
        }

        return final;
    }

    private static string ReadAll(Stream stream)
    {
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: true);
        return reader.ReadToEnd();
    }
}

/// <param name="Index">1-based position within the document.</param>
/// <param name="Text">Extracted plain text for this chunk.</param>
/// <param name="Label">Human-readable label type (Page / Section / Paragraph).</param>
public sealed record DocumentChunk(int Index, string Text, string Label);
