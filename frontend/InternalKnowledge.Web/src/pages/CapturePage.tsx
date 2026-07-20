import { useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Divider, FormControl, InputLabel, MenuItem, Select, Stack,
  Step, StepLabel, Stepper, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import MicIcon from "@mui/icons-material/Mic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  captureApi, knowledgeApi,
  type AnalysisResult, type CaptureSession, type EntryType, type KnowledgeEntry,
} from "../services/api";
import ReviewPanel from "../components/ReviewPanel";
import DocumentUploadZone from "../components/DocumentUploadZone";
import VoiceInputButton from "../components/VoiceInputButton";
import { useAuth } from "../contexts/AuthContext";

const TYPES: EntryType[] = ["Issue","Workflow","Knowledge","Troubleshooting","HowTo","Decision","KnownLimitation"];
const STEPS = ["Describe", "Complete", "Review & save"];

export default function CapturePage() {
  const { user } = useAuth();
  const qc       = useQueryClient();

  // Shared state
  const [inputMode, setInputMode] = useState<"text" | "document" | "voice">("text");
  const [type,    setType]    = useState<EntryType>("Issue");
  const [project, setProject] = useState("");
  const [module,  setModule]  = useState("");

  // Text-input flow
  const [raw,           setRaw]           = useState("");
  const [captureSession,setCaptureSession]= useState<CaptureSession | null>(null);
  const [followUpText,  setFollowUpText]  = useState("");

  // Shared review state
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [step,     setStep]     = useState(0);

  // ── stamp capturedBy on all entries from a result ─────────────────────────
  function stampResult(result: AnalysisResult): AnalysisResult {
    const stamp = (e: KnowledgeEntry): KnowledgeEntry => ({ ...e, capturedBy: user?.username });
    return { ...result, entry: stamp(result.entry), suggestedEntries: result.suggestedEntries.map(stamp) };
  }

  // ── Text flow: Step 0→1 evaluate completeness ─────────────────────────────
  const evaluate = useMutation({
    mutationFn: () => captureApi.evaluate(type, raw, captureSession?.sessionId, project || undefined, module || undefined),
    onSuccess: (session) => {
      setCaptureSession(session);
      if (session.readyToCommit) analyzeNote.mutate(raw);
      else setStep(1);
    },
  });

  // ── Text flow: Step 1→1 follow-up ─────────────────────────────────────────
  const addFollowUp = useMutation({
    mutationFn: () => {
      const merged = `${captureSession!.currentInput}\n\n${followUpText}`;
      return captureApi.evaluate(type, merged, captureSession!.sessionId, project || undefined, module || undefined);
    },
    onSuccess: (session) => {
      setCaptureSession(session);
      setFollowUpText("");
      if (session.readyToCommit) analyzeNote.mutate(session.currentInput);
    },
  });

  // ── Text flow: Step 1→2 / 0→2 AI analysis ────────────────────────────────
  const analyzeNote = useMutation({
    mutationFn: (input: string) => knowledgeApi.analyze({
      rawInput: input, entryType: type,
      project: project || undefined, module: module || undefined,
    }),
    onSuccess: (result) => { setAnalysis(stampResult(result)); setStep(2); },
  });

  // ── Document flow: upload → result → go straight to review ───────────────
  function handleDocumentResult(result: AnalysisResult) {
    const stamped = stampResult(result);
    // Auto-detect: use the type the AI assigned to the first entry.
    // If the user had "Issue" selected but uploaded an API doc, the AI will
    // return "Knowledge" — sync the selector so it reflects what was actually analysed.
    const detectedType = stamped.suggestedEntries?.[0]?.entryType ?? stamped.entry.entryType;
    if (detectedType && detectedType !== type) setType(detectedType);
    setAnalysis(stamped);
    setStep(2);
  }

  function reset() {
    setRaw(""); setProject(""); setModule(""); setType("Issue");
    setCaptureSession(null); setFollowUpText(""); setAnalysis(null); setStep(0);
    qc.invalidateQueries({ queryKey: ["knowledge"] });
  }

  const textBusy = evaluate.isPending || addFollowUp.isPending || analyzeNote.isPending;
  const textErr  = evaluate.error ?? addFollowUp.error ?? analyzeNote.error;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 960, mx: "auto" }}>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="overline" color="text.secondary">Capture</Typography>
        <Typography variant="h4" fontFamily="Georgia" fontWeight={600}>Log knowledge</Typography>
        <Typography variant="body2" color="text.secondary">
          Paste a note or upload a document — AI structures it into reusable knowledge entries.
        </Typography>
      </Box>

      {/* Stepper (only for text flow; document skips straight to step 2) */}
      {(inputMode === "text" || step === 2) && (
        <Stepper activeStep={step} sx={{ mb: 3 }}>
          {STEPS.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>
      )}

      {/* ── Step 2: Review ─────────────────────────────────────────────────── */}
      {step === 2 && analysis && (
        <ReviewPanel analysis={analysis} onDone={reset} />
      )}

      {/* ── Step 0: Input ──────────────────────────────────────────────────── */}
      {step === 0 && (
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5, p: 3 }}>

            {/* Type + Project + Module — shared for both input modes */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Entry type</InputLabel>
                <Select value={type} label="Entry type" onChange={e => setType(e.target.value as EntryType)}>
                  {TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField size="small" label="Project (optional)" value={project}
                onChange={e => setProject(e.target.value)} sx={{ flex: 1 }} />
              <TextField size="small" label="Module (optional)" value={module}
                onChange={e => setModule(e.target.value)} sx={{ flex: 1 }} />
            </Stack>

            <Divider />

            {/* Input mode tabs */}
            <Tabs
              value={inputMode}
              onChange={(_, v) => setInputMode(v)}
              sx={{ minHeight: 36, "& .MuiTab-root": { minHeight: 36, py: 0 } }}
            >
              <Tab value="text"     icon={<TextFieldsIcon fontSize="small" />} iconPosition="start" label="Write a note" />
              <Tab value="voice"    icon={<MicIcon fontSize="small" />}        iconPosition="start" label="Speak a note" />
              <Tab value="document" icon={<UploadFileIcon fontSize="small" />} iconPosition="start" label="Upload document" />
            </Tabs>

            {/* ── Text input ──────────────────────────────────────────────── */}
            {inputMode === "text" && (
              <>
                <TextField
                  label="Describe what happened"
                  multiline minRows={7} value={raw}
                  onChange={e => setRaw(e.target.value)}
                  inputProps={{ minLength: 20 }}
                  placeholder="Paste your note here. AI checks completeness before creating the entry — it will ask follow-up questions if key information is missing."
                  fullWidth
                />
                {textErr && <Alert severity="error">{textErr.message}</Alert>}
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    variant="contained" disabled={textBusy || raw.length < 20}
                    onClick={() => evaluate.mutate()}
                    sx={{ bgcolor: "#345f54", "&:hover": { bgcolor: "#2b4f46" }, fontWeight: 700 }}
                    startIcon={textBusy ? <CircularProgress size={16} color="inherit" /> : <AutoFixHighIcon />}
                  >
                    {textBusy ? "Analysing…" : "Analyse"}
                  </Button>
                </Box>
              </>
            )}

            {/* ── Voice input ─────────────────────────────────────────────── */}
            {inputMode === "voice" && (
              <>
                {/* The voice button sits above the textarea and updates it live */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.5,
                  bgcolor: "#f5f8f6", borderRadius: 2, border: "1px solid #dce7e1" }}>
                  <VoiceInputButton
                    onTranscript={text => setRaw(text)}
                    existingText={raw}
                    disabled={textBusy}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Speak in English, Hindi, or Hinglish — the entry will always be saved in English.
                    Click the mic to start, click Stop when done.
                  </Typography>
                </Box>

                <TextField
                  label="Transcript"
                  multiline minRows={7} value={raw}
                  onChange={e => setRaw(e.target.value)}
                  inputProps={{ minLength: 20 }}
                  placeholder="Your speech will appear here live. You can also edit it before analysing."
                  fullWidth
                />
                {textErr && <Alert severity="error">{textErr.message}</Alert>}
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    variant="contained" disabled={textBusy || raw.length < 20}
                    onClick={() => evaluate.mutate()}
                    sx={{ bgcolor: "#345f54", "&:hover": { bgcolor: "#2b4f46" }, fontWeight: 700 }}
                    startIcon={textBusy ? <CircularProgress size={16} color="inherit" /> : <AutoFixHighIcon />}
                  >
                    {textBusy ? "Analysing…" : "Analyse transcript"}
                  </Button>
                </Box>
              </>
            )}

            {/* ── Document upload ─────────────────────────────────────────── */}
            {inputMode === "document" && (
              <>
                <Alert severity="info" icon={false} sx={{ py: 0.75 }}>
                  <Typography variant="caption">
                    The entry type above is a hint — the AI will detect the actual type from the document content
                    and update it automatically. You can also change it on the review screen before saving.
                  </Typography>
                </Alert>
                <DocumentUploadZone
                  entryType={type}
                  project={project || undefined}
                  module={module || undefined}
                  onResult={handleDocumentResult}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Follow-up questions (text flow only) ───────────────────── */}
      {step === 1 && captureSession && (
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2.5 }}>
            <Alert severity="info" icon={false}>
              <Typography variant="subtitle2" gutterBottom>
                Some information appears to be missing. Please answer the questions below.
              </Typography>
              <Stack spacing={1} mt={1}>
                {captureSession.followUpQuestions.map((q, i) => (
                  <Box key={i} sx={{ display: "flex", gap: 1 }}>
                    <Chip label={captureSession.missingFields[i] ?? "?"} size="small"
                      sx={{ bgcolor: "#fff0eb", color: "#a05030", fontWeight: 700 }} />
                    <Typography variant="body2">{q}</Typography>
                  </Box>
                ))}
              </Stack>
            </Alert>

            <Box sx={{ bgcolor: "#f5f8f6", borderRadius: 2, p: 2 }}>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Your note so far
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                {captureSession.currentInput}
              </Typography>
            </Box>

            <TextField
              label="Your answers to the questions above"
              multiline minRows={4} fullWidth
              value={followUpText}
              onChange={e => setFollowUpText(e.target.value)}
              placeholder="Add the missing details here…"
            />

            {textErr && <Alert severity="error">{textErr.message}</Alert>}

            <Stack direction="row" spacing={2} justifyContent="space-between">
              <Button variant="text" onClick={() => setStep(0)}>← Back</Button>
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" disabled={textBusy}
                  onClick={() => analyzeNote.mutate(captureSession.currentInput)}>
                  Skip & analyse anyway
                </Button>
                <Button variant="contained" disabled={textBusy || !followUpText.trim()}
                  onClick={() => addFollowUp.mutate()}
                  sx={{ bgcolor: "#345f54", "&:hover": { bgcolor: "#2b4f46" }, fontWeight: 700 }}
                  startIcon={textBusy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlineIcon />}
                >
                  {textBusy ? "Checking…" : "Submit & check again"}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
