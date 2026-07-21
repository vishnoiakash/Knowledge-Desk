import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Divider, IconButton, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import SendIcon          from "@mui/icons-material/Send";
import ThumbUpAltOutlinedIcon  from "@mui/icons-material/ThumbUpAltOutlined";
import ThumbDownAltOutlinedIcon from "@mui/icons-material/ThumbDownAltOutlined";
import ThumbUpIcon       from "@mui/icons-material/ThumbUp";
import ThumbDownIcon     from "@mui/icons-material/ThumbDown";
import ContentCopyIcon   from "@mui/icons-material/ContentCopy";
import CheckIcon         from "@mui/icons-material/Check";
import ReactMarkdown     from "react-markdown";
import remarkGfm         from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight }      from "react-syntax-highlighter/dist/esm/styles/prism";
import { useMutation }   from "@tanstack/react-query";
import { assistantApi, chatHistoryApi, knowledgeApi, type AskResult, type ChatTurn } from "../services/api";
import "../answer.css";

interface Message {
  role: "user" | "assistant";
  content: string;
  result?: AskResult;
  feedback?: boolean | null;
}

export default function AssistantPage() {
  const location        = useLocation();
  const listRef         = useRef<HTMLDivElement>(null);

  const [messages,  setMessages]  = useState<Message[]>([]);
  const [question,  setQuestion]  = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [copied,    setCopied]    = useState<number | null>(null);
  const [loading,   setLoading]   = useState(false);

  // Read the sessionId from location.state every time navigation state changes.
  // This fires both on first mount AND when the user clicks a different history item
  // in the sidebar (which calls navigate("/assistant", { state: { sessionId } })).
  useEffect(() => {
    const incoming = (location.state as { sessionId?: string } | null)?.sessionId;
    if (!incoming) return;
    if (incoming === sessionId) return; // already showing this session

    setLoading(true);
    setMessages([]);
    setSessionId(incoming);

    chatHistoryApi.getDetail(incoming)
      .then(data => {
        setMessages(data.turns.map(t => ({
          role: t.role as "user" | "assistant",
          content: t.content,
        })));
      })
      .catch(() => {/* session may have been pruned — start fresh */})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const ask = useMutation({
    mutationFn: (v: { question: string; history: ChatTurn[] }) =>
      assistantApi.ask(v.question, v.history, undefined, undefined, sessionId),
    onSuccess: (r) => {
      setSessionId(r.sessionId);
      setMessages(x => [...x, { role: "assistant", content: r.answer, result: r, feedback: null }]);
    },
  });

  function submit() {
    const value = question.trim();
    if (!value || ask.isPending) return;
    const history = messages.slice(-8).map(({ role, content }) => ({ role, content }));
    setMessages(x => [...x, { role: "user", content: value }]);
    setQuestion("");
    ask.mutate({ question: value, history });
  }

  function sendFeedback(msgIdx: number, helpful: boolean) {
    const msg = messages[msgIdx];
    if (!msg.result?.sources[0]?.knowledgeEntryId) return;
    const entryId = msg.result.sources[0].knowledgeEntryId;
    knowledgeApi.feedback(entryId, helpful).catch(() => {});
    setMessages(x => x.map((m, i) => i === msgIdx ? { ...m, feedback: helpful } : m));
  }

  function copyText(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 960, mx: "auto" }}>
      <Box sx={{ textAlign: "center", mb: 3 }}>
        <Box sx={{ width: 46, height: 46, borderRadius: 2.5, bgcolor: "#345f54", color: "#ffc0a9",
                   display: "grid", placeItems: "center", mx: "auto", mb: 1.5, fontSize: 22 }}>🤖</Box>
        <Typography variant="h4" fontFamily="Georgia" fontWeight={600}>Ask your team's knowledge</Typography>
        <Typography variant="body2" color="text.secondary">
          Every answer shows the exact indexed chunks used as sources.
        </Typography>
      </Box>

      {/* Chat window */}
      <Card variant="outlined" sx={{ borderRadius: 3, display: "flex", flexDirection: "column", minHeight: 560, overflow: "hidden" }}>
        {/* Message list */}
        <Box ref={listRef} sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          {messages.length === 0 && !loading && (
            <Box sx={{ textAlign: "center", my: "auto", color: "text.secondary" }}>
              <Typography variant="body2">Ask anything about your team's indexed knowledge.</Typography>
            </Box>
          )}

          {loading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>
          )}
          {messages.map((m, i) => m.role === "user" ? (
            <Box key={i} sx={{ alignSelf: "flex-end", maxWidth: "75%", minWidth: 0, bgcolor: "#345f54", color: "#fff",
              borderRadius: "14px 14px 4px 14px", px: 2, py: 1.25, lineHeight: 1.5, wordBreak: "break-word" }}>
              {m.content}
            </Box>
          ) : (
            <Box key={i} sx={{ bgcolor: "#fafbf9", border: "1px solid", borderColor: "divider",
              borderRadius: 2.5, p: 2.5, minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
              {/* Grounded badge */}
              <Chip
                label={m.result?.grounded ? "Grounded" : "Insufficient evidence"}
                size="small"
                color={m.result?.grounded ? "success" : "warning"}
                sx={{ mb: 1.5, fontWeight: 700, fontSize: 10 }}
              />

              {/* Answer body */}
              <Box sx={{ "& > *:first-of-type": { mt: 0 }, "& > *:last-of-type": { mb: 0 } }}>
                <AnswerBody text={m.content} />
              </Box>

              {/* Suggested follow-ups */}
              {m.result?.suggestedFollowUps && m.result.suggestedFollowUps.length > 0 && (
                <Box sx={{ mt: 1.5, maxWidth: "100%" }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>Follow-up suggestions</Typography>
                  <Box sx={{ mt: 0.5, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                    {m.result.suggestedFollowUps.map((s, si) => (
                      <Chip key={si} label={s} size="small" variant="outlined" clickable
                        onClick={() => { setQuestion(s); }}
                        sx={{ fontSize: 11, cursor: "pointer", maxWidth: "100%",
                          "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }} />
                    ))}
                  </Box>
                </Box>
              )}

              {/* Sources */}
              {m.result && m.result.sources.length > 0 && (
                <AnswerSources sources={m.result.sources} />
              )}

              {/* Feedback row */}
              <Divider sx={{ my: 1.5 }} />
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Typography variant="caption" color="text.secondary">Was this helpful?</Typography>
                <Tooltip title="Yes">
                  <IconButton size="small" onClick={() => sendFeedback(i, true)}
                    color={m.feedback === true ? "success" : "default"}>
                    {m.feedback === true ? <ThumbUpIcon fontSize="small" /> : <ThumbUpAltOutlinedIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <Tooltip title="No">
                  <IconButton size="small" onClick={() => sendFeedback(i, false)}
                    color={m.feedback === false ? "error" : "default"}>
                    {m.feedback === false ? <ThumbDownIcon fontSize="small" /> : <ThumbDownAltOutlinedIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <Box sx={{ ml: "auto" }}>
                  <Tooltip title={copied === i ? "Copied!" : "Copy answer"}>
                    <IconButton size="small" onClick={() => copyText(m.content, i)}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Stack>
            </Box>
          ))}

          {ask.isPending && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary" }}>
              <CircularProgress size={16} />
              <Typography variant="body2">Searching indexed knowledge…</Typography>
            </Box>
          )}
        </Box>

        {ask.error && (
          <Box sx={{ px: 3, pb: 1 }}>
            <Alert severity="error" onClose={() => ask.reset()}>{ask.error.message}</Alert>
          </Box>
        )}

        {/* Composer */}
        <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider",
          display: "grid", gridTemplateColumns: "1fr auto", gap: 1 }}>
          <TextField
            multiline maxRows={4} size="small" placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
            value={question} onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            sx={{ "& fieldset": { borderRadius: 2 } }}
          />
          <IconButton onClick={submit} disabled={!question.trim() || ask.isPending}
            sx={{ bgcolor: "#345f54", color: "#fff", borderRadius: 2, "&:hover": { bgcolor: "#2b4f46" },
              "&:disabled": { bgcolor: "#ccc" }, alignSelf: "flex-end" }}>
            <SendIcon fontSize="small" />
          </IconButton>
        </Box>
      </Card>
    </Box>
  );
}

// ── Answer renderer (react-markdown + syntax highlighting) ───────────────────

/**
 * Pre-process the answer text before passing to react-markdown.
 * Detects bare JSON-looking lines/blocks that the AI forgot to fence and
 * wraps them in ```json code fences automatically.
 *
 * Patterns handled:
 *   1. Single-line inline JSON objects/arrays:  { "key": "val" }  or  [ 1, 2 ]
 *   2. Multi-line JSON blocks that start with { or [ and end with } or ]
 *      but are NOT already inside a fenced code block.
 */
function preprocessMarkdown(text: string): string {
  // Split into lines for processing
  const lines = text.split("\n");
  const result: string[] = [];
  let inFence = false;
  let jsonBuffer: string[] = [];
  let i = 0;

  function flushJsonBuffer() {
    if (jsonBuffer.length === 0) return;
    const joined = jsonBuffer.join("\n").trim();
    // Try to format as pretty JSON
    try {
      const parsed = JSON.parse(joined);
      result.push("```json");
      result.push(JSON.stringify(parsed, null, 2));
      result.push("```");
    } catch {
      // Not valid JSON — just wrap as-is
      result.push("```json");
      result.push(joined);
      result.push("```");
    }
    jsonBuffer = [];
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track existing fences — don't touch content inside them
    if (trimmed.startsWith("```")) {
      flushJsonBuffer();
      inFence = !inFence;
      result.push(line);
      i++;
      continue;
    }

    if (inFence) {
      result.push(line);
      i++;
      continue;
    }

    // Detect start of a bare JSON block or single-line JSON
    const looksLikeJson =
      (trimmed.startsWith("{") || trimmed.startsWith("[")) &&
      trimmed.length > 2;

    if (looksLikeJson) {
      // Check if it closes on the same line (single-line JSON)
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        // Single-line — wrap immediately
        jsonBuffer.push(trimmed);
        flushJsonBuffer();
        i++;
        continue;
      }

      // Multi-line — accumulate until the matching close
      let depth = 0;
      const startChar = trimmed[0];
      const endChar   = startChar === "{" ? "}" : "]";

      while (i < lines.length) {
        const l = lines[i].trim();
        for (const ch of l) {
          if (ch === startChar) depth++;
          if (ch === endChar)   depth--;
        }
        jsonBuffer.push(lines[i]);
        i++;
        if (depth <= 0) break;
      }
      flushJsonBuffer();
      continue;
    }

    result.push(line);
    i++;
  }

  flushJsonBuffer();
  return result.join("\n");
}

/** Per-code-block copy button — appears on hover */
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Box sx={{ position: "relative", my: 1.5, borderRadius: 2, overflow: "hidden",
      border: "1px solid #e0e8e4", "&:hover .copy-btn": { opacity: 1 } }}>
      {/* Language label + copy button bar */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        bgcolor: "#f0f4f2", px: 1.5, py: 0.5, borderBottom: "1px solid #e0e8e4" }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#5a7a6a", fontFamily: "monospace" }}>
          {language || "code"}
        </Typography>
        <IconButton
          className="copy-btn"
          size="small"
          onClick={copy}
          sx={{ opacity: 0, transition: "opacity .15s", p: 0.5 }}
        >
          {copied
            ? <CheckIcon sx={{ fontSize: 14, color: "#1e4d42" }} />
            : <ContentCopyIcon sx={{ fontSize: 14 }} />}
        </IconButton>
      </Box>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneLight}
        customStyle={{ margin: 0, borderRadius: 0, fontSize: 13, background: "#fafcfa" }}
        showLineNumbers={code.split("\n").length > 4}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </Box>
  );
}

function AnswerBody({ text }: { text: string }) {
  const processed = preprocessMarkdown(text);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // ── Code blocks ───────────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        code({ node, className, children, ...props }: any) {
          const isBlock = !props.inline;
          const lang    = (className ?? "").replace("language-", "");
          const code    = String(children).replace(/\n$/, "");
          if (isBlock) return <CodeBlock language={lang} code={code} />;
          // Inline code
          return (
            <code style={{
              background: "#edf2ef", borderRadius: 4, padding: "2px 5px",
              color: "#1e4d42", fontSize: "0.88em", fontFamily: "monospace",
            }}>
              {children}
            </code>
          );
        },

        // ── Links — open in new tab, styled ───────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        a({ href, children }: any) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#1e4d42", fontWeight: 600, textDecoration: "underline",
                textDecorationColor: "#a8c5be", textUnderlineOffset: 2 }}
            >
              {children}
            </a>
          );
        },

        // ── Headings ──────────────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        h1: ({ children }: any) => (
          <Typography variant="h5" fontFamily="Georgia" fontWeight={600} sx={{ mt: 2.5, mb: 1, color: "#161f1d" }}>
            {children}
          </Typography>
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        h2: ({ children }: any) => (
          <Typography variant="h6" fontFamily="Georgia" fontWeight={600} sx={{ mt: 2, mb: 0.75, color: "#161f1d" }}>
            {children}
          </Typography>
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        h3: ({ children }: any) => (
          <Typography sx={{ fontSize: 15, fontWeight: 700, mt: 1.75, mb: 0.5, color: "#1e4d42" }}>
            {children}
          </Typography>
        ),

        // ── Paragraphs ────────────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        p: ({ children }: any) => (
          <Typography variant="body2" sx={{ my: 0.75, lineHeight: 1.7, color: "#2d3f3a" }}>
            {children}
          </Typography>
        ),

        // ── Lists ─────────────────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ul: ({ children }: any) => (
          <Box component="ul" sx={{ pl: 2.5, my: 0.75, "& li": { mb: 0.4, color: "#2d3f3a" } }}>
            {children}
          </Box>
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ol: ({ children }: any) => (
          <Box component="ol" sx={{ pl: 2.5, my: 0.75, "& li": { mb: 0.4, color: "#2d3f3a" } }}>
            {children}
          </Box>
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        li: ({ children }: any) => (
          <Typography component="li" variant="body2" sx={{ lineHeight: 1.65 }}>
            {children}
          </Typography>
        ),

        // ── Blockquote ────────────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        blockquote: ({ children }: any) => (
          <Box sx={{ borderLeft: "3px solid #a8c5be", pl: 1.5, ml: 0, my: 1,
            bgcolor: "#f5f8f6", borderRadius: "0 6px 6px 0", py: 0.5 }}>
            {children}
          </Box>
        ),

        // ── Tables (via remark-gfm) ────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        table: ({ children }: any) => (
          <Box sx={{ overflowX: "auto", my: 1.5 }}>
            <Box component="table"
              sx={{ borderCollapse: "collapse", width: "100%", fontSize: 13,
                "& th,& td": { border: "1px solid #e0e8e4", px: 1.5, py: 0.75, textAlign: "left" },
                "& th": { bgcolor: "#eef3f0", fontWeight: 700, color: "#1e4d42" },
                "& tr:nth-of-type(even)": { bgcolor: "#f9fbf9" },
              }}>
              {children}
            </Box>
          </Box>
        ),

        // ── Horizontal rule ───────────────────────────────────────────────
        hr: () => <Divider sx={{ my: 1.5 }} />,

        // ── Strong / em ───────────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        strong: ({ children }: any) => <strong style={{ color: "#161f1d" }}>{children}</strong>,
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}

function AnswerSources({ sources }: { sources: AskResult["sources"] }) {
  const groups = Object.values(
    sources.reduce<Record<string, AskResult["sources"]>>((all, s) => {
      (all[s.knowledgeEntryId] ??= []).push(s);
      return all;
    }, {})
  );
  return (
    <Box className="answer-sources" sx={{ mt: 2 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={700}>Sources</Typography>
      {groups.map(group => {
        const sorted = [...group].sort((a, b) => b.similarity - a.similarity);
        const best   = sorted[0];
        return (
          <Card key={best.knowledgeEntryId} variant="outlined"
            sx={{ mt: 1, borderRadius: 2, p: 1.5, bgcolor: "#f9fbfa" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary">
                  {best.chunkType} · {Math.round(best.similarity * 100)}% match
                </Typography>
                <Typography variant="subtitle2" fontWeight={600} sx={{ wordBreak: "break-word" }}>{best.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, wordBreak: "break-word" }}>{best.snippet}</Typography>
              </Box>
            </Stack>
            {sorted.length > 1 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 12, cursor: "pointer", color: "#345f54", fontWeight: 700 }}>
                  {sorted.length - 1} more chunk{sorted.length > 2 ? "s" : ""}
                </summary>
                {sorted.slice(1).map(s => (
                  <Box key={s.chunkId} sx={{ mt: 1, pt: 1, borderTop: "1px solid #e3e8e5" }}>
                    <Typography variant="caption" color="text.secondary">{s.chunkType} · {Math.round(s.similarity * 100)}%</Typography>
                    <Typography variant="body2" color="text.secondary">{s.snippet}</Typography>
                  </Box>
                ))}
              </details>
            )}
          </Card>
        );
      })}
    </Box>
  );
}
