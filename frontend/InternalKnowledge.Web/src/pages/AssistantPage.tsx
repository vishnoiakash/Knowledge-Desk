import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Divider, IconButton, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ThumbUpAltOutlinedIcon from "@mui/icons-material/ThumbUpAltOutlined";
import ThumbDownAltOutlinedIcon from "@mui/icons-material/ThumbDownAltOutlined";
import ThumbUpIcon from "@mui/icons-material/ThumbUp";
import ThumbDownIcon from "@mui/icons-material/ThumbDown";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useMutation, useQuery } from "@tanstack/react-query";
import { assistantApi, chatHistoryApi, knowledgeApi, type AskResult, type ChatTurn } from "../services/api";
import "../answer.css";

interface Message {
  role: "user" | "assistant";
  content: string;
  result?: AskResult;
  feedback?: boolean | null;
}

export default function AssistantPage() {
  const location            = useLocation();
  const incomingSession     = (location.state as { sessionId?: string } | null)?.sessionId;

  const [messages,   setMessages]   = useState<Message[]>([]);
  const [question,   setQuestion]   = useState("");
  const [sessionId,  setSessionId]  = useState<string | undefined>(incomingSession);
  const [copied,     setCopied]     = useState<number | null>(null);
  const listRef                     = useRef<HTMLDivElement>(null);

  // Load existing session from history when navigated with a sessionId
  const sessionQuery = useQuery({
    queryKey: ["chatSession", incomingSession],
    queryFn:  () => chatHistoryApi.getDetail(incomingSession!),
    enabled:  !!incomingSession && messages.length === 0,
  });

  useEffect(() => {
    if (sessionQuery.data) {
      setMessages(sessionQuery.data.turns.map(t => ({
        role: t.role as "user" | "assistant", content: t.content,
      })));
    }
  }, [sessionQuery.data]);

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
      <Card variant="outlined" sx={{ borderRadius: 3, display: "flex", flexDirection: "column", minHeight: 560 }}>
        {/* Message list */}
        <Box ref={listRef} sx={{ flex: 1, overflowY: "auto", p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          {messages.length === 0 && !sessionQuery.isLoading && (
            <Box sx={{ textAlign: "center", my: "auto", color: "text.secondary" }}>
              <Typography variant="body2">Ask anything about your team's indexed knowledge.</Typography>
            </Box>
          )}

          {sessionQuery.isLoading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>
          )}

          {messages.map((m, i) => m.role === "user" ? (
            <Box key={i} sx={{ alignSelf: "flex-end", maxWidth: "75%", bgcolor: "#345f54", color: "#fff",
              borderRadius: "14px 14px 4px 14px", px: 2, py: 1.25, lineHeight: 1.5 }}>
              {m.content}
            </Box>
          ) : (
            <Box key={i} sx={{ bgcolor: "#fafbf9", border: "1px solid", borderColor: "divider",
              borderRadius: 2.5, p: 2.5 }}>
              {/* Grounded badge */}
              <Chip
                label={m.result?.grounded ? "Grounded" : "Insufficient evidence"}
                size="small"
                color={m.result?.grounded ? "success" : "warning"}
                sx={{ mb: 1.5, fontWeight: 700, fontSize: 10 }}
              />

              {/* Answer body */}
              <div className="answer-body">
                <AnswerBody text={m.content} />
              </div>

              {/* Suggested follow-ups */}
              {m.result?.suggestedFollowUps && m.result.suggestedFollowUps.length > 0 && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>Follow-up suggestions</Typography>
                  <Stack direction="row" spacing={1} mt={0.5} flexWrap="wrap" useFlexGap>
                    {m.result.suggestedFollowUps.map((s, si) => (
                      <Chip key={si} label={s} size="small" variant="outlined" clickable
                        onClick={() => { setQuestion(s); }}
                        sx={{ fontSize: 11, cursor: "pointer" }} />
                    ))}
                  </Stack>
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

// ── Answer renderer ───────────────────────────────────────────────────────────

function InlineAnswer({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return <>{parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> :
    p.startsWith("`")  && p.endsWith("`")  ? <code key={i}>{p.slice(1, -1)}</code> : p
  )}</>;
}

function AnswerBody({ text }: { text: string }) {
  const lines = text.replace(/\s+(?=#{1,3}\s)/g, "\n\n").replace(/\s+(?=-\s)/g, "\n").split(/\r?\n/);
  return (
    <div className="answer-body">
      {lines.map((line, i) => {
        const v = line.trim();
        if (!v) return <div className="answer-gap" key={i} />;
        const h = v.match(/^#{1,3}\s+(.+)$/);
        if (h) return <h3 key={i}><InlineAnswer text={h[1]} /></h3>;
        const b = v.match(/^[-*]\s+(.+)$/);
        if (b) return <div className="answer-list-item" key={i}><span>•</span><p><InlineAnswer text={b[1]} /></p></div>;
        const n = v.match(/^(\d+)\.\s+(.+)$/);
        if (n) return <div className="answer-list-item" key={i}><span>{n[1]}.</span><p><InlineAnswer text={n[2]} /></p></div>;
        return <p key={i}><InlineAnswer text={v} /></p>;
      })}
    </div>
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
                <Typography variant="subtitle2" fontWeight={600}>{best.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{best.snippet}</Typography>
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
