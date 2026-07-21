import { useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Collapse, Divider, Stack, Step, StepLabel, Stepper,
  Tab, Tabs, TextField, Typography, alpha,
} from "@mui/material";
import AutoFixHighIcon          from "@mui/icons-material/AutoFixHigh";
import CheckCircleOutlineIcon   from "@mui/icons-material/CheckCircleOutlineOutlined";
import TextFieldsIcon           from "@mui/icons-material/TextFields";
import UploadFileIcon           from "@mui/icons-material/UploadFile";
import MicIcon                  from "@mui/icons-material/Mic";
import ArrowForwardIcon         from "@mui/icons-material/ArrowForward";
import BugReportOutlinedIcon    from "@mui/icons-material/BugReportOutlined";
import MenuBookOutlinedIcon     from "@mui/icons-material/MenuBookOutlined";
import PlaylistAddCheckIcon     from "@mui/icons-material/PlaylistAddCheck";
import AccountTreeOutlinedIcon  from "@mui/icons-material/AccountTreeOutlined";
import WarningAmberIcon         from "@mui/icons-material/WarningAmber";
import UploadFileOutlinedIcon   from "@mui/icons-material/UploadFileOutlined";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  captureApi, knowledgeApi,
  type AnalysisResult, type CaptureSession, type EntryType,
  type FieldAnswer, type KnowledgeEntry,
} from "../services/api";
import ReviewPanel        from "../components/ReviewPanel";
import DocumentUploadZone from "../components/DocumentUploadZone";
import VoiceInputButton   from "../components/VoiceInputButton";
import { useAuth }        from "../contexts/AuthContext";

// ── Intent tile definitions ───────────────────────────────────────────────────

interface IntentTile {
  entryType:   EntryType;
  label:       string;
  description: string;
  icon:        React.ReactNode;
  color:       string;
  bg:          string;
  placeholder: string;
}

const INTENT_TILES: IntentTile[] = [
  {
    entryType:   "Issue",
    label:       "Bug fix / Incident",
    description: "Something broke — you diagnosed and fixed it",
    icon:        <BugReportOutlinedIcon sx={{ fontSize: 22 }} />,
    color:       "#c0392b",
    bg:          "#fff1f0",
    placeholder: "Describe the bug, what caused it, and how you fixed it. The AI will ask for any missing details.",
  },
  {
    entryType:   "Troubleshooting",
    label:       "Troubleshooting guide",
    description: "A repeatable process to diagnose a class of problems",
    icon:        <PlaylistAddCheckIcon sx={{ fontSize: 22 }} />,
    color:       "#a05c1a",
    bg:          "#fff8ec",
    placeholder: "Describe the symptom, steps to diagnose, and how to resolve each variant.",
  },
  {
    entryType:   "HowTo",
    label:       "How-to / Workflow",
    description: "Step-by-step guide for a task your team repeats",
    icon:        <PlaylistAddCheckIcon sx={{ fontSize: 22 }} />,
    color:       "#1a7a46",
    bg:          "#edf7f0",
    placeholder: "Describe the goal and walk through the steps needed to achieve it.",
  },
  {
    entryType:   "Knowledge",
    label:       "API / Reference",
    description: "API documentation, service reference, or technical spec",
    icon:        <MenuBookOutlinedIcon sx={{ fontSize: 22 }} />,
    color:       "#1a4a8a",
    bg:          "#eef5ff",
    placeholder: "Paste or describe the API — endpoints, parameters, auth, examples, known gotchas.",
  },
  {
    entryType:   "Decision",
    label:       "Architecture decision",
    description: "A design or technology choice that should be remembered",
    icon:        <AccountTreeOutlinedIcon sx={{ fontSize: 22 }} />,
    color:       "#5b2da0",
    bg:          "#f3eeff",
    placeholder: "Describe the context, the options considered, the decision taken, and the trade-offs.",
  },
  {
    entryType:   "KnownLimitation",
    label:       "Known limitation",
    description: "A system constraint or limitation the team needs to know about",
    icon:        <WarningAmberIcon sx={{ fontSize: 22 }} />,
    color:       "#8a4a1a",
    bg:          "#fef5ec",
    placeholder: "Describe the limitation, its impact, any known workaround, and the expected fix timeline.",
  },
  {
    entryType:   "Knowledge",  // document upload uses Knowledge as default; AI overrides
    label:       "Upload a document",
    description: "PDF, DOCX, Markdown, or TXT — AI extracts knowledge entries",
    icon:        <UploadFileOutlinedIcon sx={{ fontSize: 22 }} />,
    color:       "#1e4d42",
    bg:          "#e8f3ef",
    placeholder: "",           // not used — goes to document tab
  },
];

const STEPPER_LABELS = ["Describe", "Complete", "Review & save"];

// ── Main component ────────────────────────────────────────────────────────────

export default function CapturePage() {
  const { user } = useAuth();
  const qc       = useQueryClient();

  // Step: -1 = intent, 0 = input, 1 = follow-up, 2 = review
  const [step,        setStep]        = useState<-1 | 0 | 1 | 2>(-1);
  const [tile,        setTile]        = useState<IntentTile | null>(null);
  const [inputMode,   setInputMode]   = useState<"text" | "voice" | "document">("text");
  const [type,        setType]        = useState<EntryType>("Issue");
  const [project,     setProject]     = useState("");
  const [module,      setModule]      = useState("");
  const [raw,         setRaw]         = useState("");
  const [captureSession, setCaptureSession] = useState<CaptureSession | null>(null);

  // Selective follow-up state: which questions are selected + per-field answer
  const [selectedIdxs,  setSelectedIdxs]  = useState<number[]>([]);
  const [fieldAnswers,  setFieldAnswers]  = useState<Record<number, string>>({});

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  function stamp(result: AnalysisResult): AnalysisResult {
    const s = (e: KnowledgeEntry): KnowledgeEntry => ({ ...e, capturedBy: user?.username });
    return { ...result, entry: s(result.entry), suggestedEntries: result.suggestedEntries.map(s) };
  }

  // ── Step 0→1: evaluate completeness ──────────────────────────────────────
  const evaluate = useMutation({
    mutationFn: () => captureApi.evaluate(
      type, raw, captureSession?.sessionId, project || undefined, module || undefined,
    ),
    onSuccess: (session) => {
      setCaptureSession(session);
      resetFollowUp();
      if (session.readyToCommit) analyzeNote.mutate(session.currentInput);
      else setStep(1);
    },
  });

  // ── Step 1→1/2: submit selected answers, re-evaluate ─────────────────────
  const submitAnswers = useMutation({
    mutationFn: () => {
      const answers: FieldAnswer[] = selectedIdxs
        .filter(i => fieldAnswers[i]?.trim())
        .map(i => ({
          field:  captureSession!.missingFields[i] ?? `field_${i}`,
          answer: fieldAnswers[i].trim(),
        }));
      return captureApi.evaluate(
        type,
        captureSession!.currentInput,
        captureSession!.sessionId,
        project || undefined,
        module  || undefined,
        answers,
      );
    },
    onSuccess: (session) => {
      setCaptureSession(session);
      resetFollowUp();
      if (session.readyToCommit) analyzeNote.mutate(session.currentInput);
    },
  });

  // ── Analyse ───────────────────────────────────────────────────────────────
  const analyzeNote = useMutation({
    mutationFn: (input: string) => knowledgeApi.analyze({
      rawInput: input, entryType: type,
      project: project || undefined, module: module || undefined,
    }),
    onSuccess: (result) => { setAnalysis(stamp(result)); setStep(2); },
  });

  // ── Document flow ─────────────────────────────────────────────────────────
  function handleDocumentResult(result: AnalysisResult) {
    const stamped = stamp(result);
    const detected = stamped.suggestedEntries?.[0]?.entryType ?? stamped.entry.entryType;
    if (detected && detected !== type) setType(detected);
    setAnalysis(stamped);
    setStep(2);
  }

  function resetFollowUp() {
    setSelectedIdxs([]);
    setFieldAnswers({});
  }

  function reset() {
    setStep(-1); setTile(null); setInputMode("text");
    setType("Issue"); setProject(""); setModule(""); setRaw("");
    setCaptureSession(null); resetFollowUp(); setAnalysis(null);
    qc.invalidateQueries({ queryKey: ["knowledge"] });
  }

  function pickTile(t: IntentTile) {
    setTile(t);
    setType(t.entryType);
    setInputMode(t.label === "Upload a document" ? "document" : "text");
    setStep(0);
  }

  function toggleQuestion(i: number) {
    setSelectedIdxs(prev =>
      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
    );
  }

  const busy        = evaluate.isPending || submitAnswers.isPending || analyzeNote.isPending;
  const err         = evaluate.error ?? submitAnswers.error ?? analyzeNote.error;
  const answeredAny = selectedIdxs.some(i => fieldAnswers[i]?.trim());

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 960, mx: "auto", pb: { xs: 4, md: 6 } }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="overline" color="text.secondary">Capture</Typography>
        <Typography variant="h4" fontFamily="Georgia" fontWeight={600}>Log knowledge</Typography>
        <Typography variant="body2" color="text.secondary">
          Capture once. Find and reuse forever.
        </Typography>
      </Box>

      {/* ── Step -1: Intent tiles ─────────────────────────────────────────── */}
      {step === -1 && (
        <Box>
          <Typography variant="subtitle1" fontWeight={600} mb={0.75}>
            What are you logging today?
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2.5}>
            Pick the type that best matches — the AI will use the right extraction strategy.
          </Typography>
          <Box sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" },
            gap: 1.5,
            pb: 0.5,
          }}>
            {INTENT_TILES.map(t => (
              <Card
                key={`${t.entryType}-${t.label}`}
                onClick={() => pickTile(t)}
                sx={{
                  cursor: "pointer",
                  transition: "all .15s",
                  "&:hover": {
                    borderColor: t.color,
                    boxShadow: `0 4px 16px ${alpha(t.color, 0.15)}`,
                    transform: "translateY(-1px)",
                  },
                }}
              >
                <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                  {/* Icon + title on same row */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
                    <Box sx={{
                      width: 38, height: 38, borderRadius: 2, flexShrink: 0,
                      bgcolor: t.bg, color: t.color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {t.icon}
                    </Box>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                      {t.label}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                    {t.description}
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: t.color }}>
                    <Typography variant="caption" fontWeight={700}>Get started</Typography>
                    <ArrowForwardIcon sx={{ fontSize: 12 }} />
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>
      )}

      {/* ── Steps 0–2 stepper ────────────────────────────────────────────── */}
      {step >= 0 && (
        <Stepper activeStep={step} sx={{ mb: 3 }}>
          {STEPPER_LABELS.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>
      )}

      {/* ── Step 2: Review ───────────────────────────────────────────────── */}
      {step === 2 && analysis && (
        <ReviewPanel analysis={analysis} onDone={reset} />
      )}

      {/* ── Step 0: Input ────────────────────────────────────────────────── */}
      {step === 0 && tile && (
        <Card>
          <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            {/* Chosen intent + back link */}
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Box sx={{
                  width: 36, height: 36, borderRadius: 2, flexShrink: 0,
                  bgcolor: tile.bg, color: tile.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {tile.icon}
                </Box>
                <Box>
                  <Typography variant="subtitle2" fontWeight={700}>{tile.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{tile.description}</Typography>
                </Box>
              </Stack>
              <Button size="small" variant="text" onClick={() => { setStep(-1); setTile(null); }}
                sx={{ color: "text.secondary", fontSize: 12 }}>
                ← Change
              </Button>
            </Stack>

            <Divider />

            {/* Project + Module */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField size="small" label="Project (optional)" value={project}
                onChange={e => setProject(e.target.value)} sx={{ flex: 1 }} />
              <TextField size="small" label="Module (optional)" value={module}
                onChange={e => setModule(e.target.value)} sx={{ flex: 1 }} />
            </Stack>

            {/* Input mode tabs (not shown for document tile) */}
            {tile.label !== "Upload a document" && (
              <Tabs value={inputMode} onChange={(_, v) => setInputMode(v)}
                sx={{ minHeight: 36, "& .MuiTab-root": { minHeight: 36, py: 0 } }}>
                <Tab value="text"  icon={<TextFieldsIcon fontSize="small" />} iconPosition="start" label="Write" />
                <Tab value="voice" icon={<MicIcon fontSize="small" />}        iconPosition="start" label="Speak" />
              </Tabs>
            )}

            {/* ── Text ── */}
            {inputMode === "text" && (
              <>
                <TextField
                  label={tile.label} multiline minRows={7} fullWidth
                  value={raw} onChange={e => setRaw(e.target.value)}
                  placeholder={tile.placeholder}
                />
                {err && <Alert severity="error">{(err as Error).message}</Alert>}
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button variant="contained" disabled={busy || raw.length < 20}
                    onClick={() => evaluate.mutate()}
                    sx={{ bgcolor: "#1e4d42", "&:hover": { bgcolor: "#173d34" }, fontWeight: 700 }}
                    startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AutoFixHighIcon />}>
                    {busy ? "Analysing…" : "Analyse"}
                  </Button>
                </Box>
              </>
            )}

            {/* ── Voice ── */}
            {inputMode === "voice" && (
              <>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.5,
                  bgcolor: "#f5f8f6", borderRadius: 2, border: "1px solid #dce7e1" }}>
                  <VoiceInputButton onTranscript={t => setRaw(t)} existingText={raw} disabled={busy} />
                  <Typography variant="caption" color="text.secondary">
                    Speak in English, Hindi, or Hinglish — always saved in English.
                  </Typography>
                </Box>
                <TextField label="Transcript" multiline minRows={7} fullWidth
                  value={raw} onChange={e => setRaw(e.target.value)}
                  placeholder="Your speech will appear here live." />
                {err && <Alert severity="error">{(err as Error).message}</Alert>}
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button variant="contained" disabled={busy || raw.length < 20}
                    onClick={() => evaluate.mutate()}
                    sx={{ bgcolor: "#1e4d42", "&:hover": { bgcolor: "#173d34" }, fontWeight: 700 }}
                    startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AutoFixHighIcon />}>
                    {busy ? "Analysing…" : "Analyse transcript"}
                  </Button>
                </Box>
              </>
            )}

            {/* ── Document ── */}
            {inputMode === "document" && (
              <>
                <Alert severity="info" icon={false} sx={{ py: 0.75 }}>
                  <Typography variant="caption">
                    AI detects the entry type from the document — you can change it on the review screen.
                  </Typography>
                </Alert>
                <DocumentUploadZone entryType={type}
                  project={project || undefined} module={module || undefined}
                  onResult={handleDocumentResult} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Selective follow-up ──────────────────────────────────── */}
      {step === 1 && captureSession && (
        <Card>
          <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            {/* Header */}
            <Box>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                A few details would improve this entry
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Select the questions you can answer. You can skip any you don't know yet —
                the entry will still be created with what you've provided.
                {captureSession.round >= 2 && (
                  <strong> This is the last round of questions.</strong>
                )}
              </Typography>
            </Box>

            {/* Note so far — collapsible */}
            <details style={{ background: "#f5f8f6", borderRadius: 10, padding: "12px 14px" }}>
              <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#5a6b65" }}>
                Your note so far
              </summary>
              <Typography variant="body2" sx={{ mt: 1, whiteSpace: "pre-wrap", color: "text.secondary" }}>
                {captureSession.currentInput}
              </Typography>
            </details>

            {/* Per-question selectable cards */}
            <Stack spacing={1.5}>
              {captureSession.followUpQuestions.map((question, i) => {
                const selected = selectedIdxs.includes(i);
                const field    = captureSession.missingFields[i] ?? `field_${i}`;
                return (
                  <Card
                    key={i}
                    variant="outlined"
                    onClick={() => !selected && toggleQuestion(i)}
                    sx={{
                      borderRadius: 2,
                      borderColor: selected ? "#1e4d42" : "divider",
                      bgcolor:     selected ? alpha("#1e4d42", 0.03) : "#fff",
                      cursor:      selected ? "default" : "pointer",
                      transition:  "all .12s",
                      "&:hover": selected ? {} : {
                        borderColor: "#1e4d42",
                        bgcolor: alpha("#1e4d42", 0.025),
                      },
                    }}
                  >
                    <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                      {/* Question header */}
                      <Stack direction="row" alignItems="center" spacing={1} mb={selected ? 1.5 : 0}>
                        {/* Checkbox-style indicator */}
                        <Box sx={{
                          width: 20, height: 20, borderRadius: 1, flexShrink: 0,
                          border: "2px solid", borderColor: selected ? "#1e4d42" : "#c8d6d0",
                          bgcolor: selected ? "#1e4d42" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {selected && (
                            <CheckCircleOutlineIcon sx={{ fontSize: 14, color: "#fff" }} />
                          )}
                        </Box>
                        <Chip label={field} size="small"
                          sx={{ bgcolor: "#fff0eb", color: "#a05030", fontWeight: 700, fontSize: 10 }} />
                        <Typography variant="body2" fontWeight={500} sx={{ flex: 1 }}>
                          {question}
                        </Typography>
                        {selected && (
                          <Button size="small" variant="text" color="error"
                            onClick={e => { e.stopPropagation(); toggleQuestion(i); setFieldAnswers(p => { const n = {...p}; delete n[i]; return n; }); }}
                            sx={{ minWidth: 0, px: 0.5, fontSize: 11 }}>
                            Deselect
                          </Button>
                        )}
                      </Stack>

                      {/* Textarea — only visible when selected */}
                      <Collapse in={selected}>
                        <TextField
                          autoFocus={selectedIdxs[selectedIdxs.length - 1] === i}
                          multiline minRows={3} fullWidth size="small"
                          placeholder={`Your answer about ${field}…`}
                          value={fieldAnswers[i] ?? ""}
                          onChange={e => {
                            e.stopPropagation();
                            setFieldAnswers(p => ({ ...p, [i]: e.target.value }));
                          }}
                          onClick={e => e.stopPropagation()}
                          sx={{ mt: 0.5 }}
                        />
                      </Collapse>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>

            {err && <Alert severity="error">{(err as Error).message}</Alert>}

            {/* Actions */}
            <Stack direction="row" spacing={2} justifyContent="space-between">
              <Button variant="text" onClick={() => setStep(0)}>← Back</Button>
              <Stack direction="row" spacing={1}>
                {/* Skip all — always available */}
                <Button variant="outlined" disabled={busy}
                  onClick={() => analyzeNote.mutate(captureSession.currentInput)}>
                  Skip all & analyse
                </Button>
                {/* Submit selected — only active when at least one answer is written */}
                <Button
                  variant="contained"
                  disabled={busy || !answeredAny}
                  onClick={() => submitAnswers.mutate()}
                  sx={{ bgcolor: "#1e4d42", "&:hover": { bgcolor: "#173d34" }, fontWeight: 700 }}
                  startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlineIcon />}
                >
                  {busy
                    ? "Checking…"
                    : `Submit ${selectedIdxs.filter(i => fieldAnswers[i]?.trim()).length} answer${selectedIdxs.filter(i => fieldAnswers[i]?.trim()).length !== 1 ? "s" : ""}`}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
