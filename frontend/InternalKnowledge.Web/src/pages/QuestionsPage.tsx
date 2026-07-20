import { useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress,
  Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, InputLabel, MenuItem, Select, Stack,
  Tab, Tabs, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import ReplyIcon from "@mui/icons-material/Reply";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { questionsApi, usersApi, type Audience, type OpenQuestionDto } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

export default function QuestionsPage() {
  const { user } = useAuth();
  const qc       = useQueryClient();

  const [tab,      setTab]      = useState<"open" | "resolved">("open");
  const [project,  setProject]  = useState("");
  const [raiseOpen,setRaiseOpen]= useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["questions", tab, project],
    queryFn:  () => questionsApi.list(tab === "resolved", project || undefined),
    staleTime: 15_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["questions"] });

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 960, mx: "auto" }}>
      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", mb: 3 }}>
        <Box>
          <Typography variant="overline" color="text.secondary">Questions</Typography>
          <Typography variant="h4" fontFamily="Georgia" fontWeight={600}>Open questions</Typography>
          <Typography variant="body2" color="text.secondary">
            Raise a question for the whole team or specific colleagues.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setRaiseOpen(true)}
          sx={{ bgcolor: "#345f54", "&:hover": { bgcolor: "#2b4f46" }, fontWeight: 700 }}>
          Raise question
        </Button>
      </Box>

      {/* Filters */}
      <Stack direction="row" spacing={2} mb={2} alignItems="center">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 36 }}>
          <Tab value="open"     label="Open"     sx={{ minHeight: 36, py: 0 }} />
          <Tab value="resolved" label="Resolved" sx={{ minHeight: 36, py: 0 }} />
        </Tabs>
        <TextField size="small" placeholder="Filter by project" value={project}
          onChange={e => setProject(e.target.value)} sx={{ width: 200 }} />
      </Stack>

      {/* List */}
      {isLoading && <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>}
      {error    && <Alert severity="error">{(error as Error).message}</Alert>}

      <Stack spacing={2}>
        {data?.length === 0 && (
          <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
            <HelpOutlineIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
            <Typography>No {tab} questions{project ? ` in "${project}"` : ""}.</Typography>
          </Box>
        )}
        {data?.map(q => (
          <QuestionCard key={q.id} question={q} currentUser={user?.username ?? ""}
            onUpdated={invalidate} />
        ))}
      </Stack>

      {/* Raise dialog */}
      <RaiseDialog open={raiseOpen} onClose={() => setRaiseOpen(false)} onCreated={invalidate} />
    </Box>
  );
}

// ── Question card ─────────────────────────────────────────────────────────────

function QuestionCard({
  question, currentUser, onUpdated,
}: { question: OpenQuestionDto; currentUser: string; onUpdated: () => void }) {
  const [expanded,   setExpanded]   = useState(false);
  const [answerText, setAnswerText] = useState("");
  const [linkEntry,  setLinkEntry]  = useState("");

  const qc = useQueryClient();

  const answerMut = useMutation({
    mutationFn: () => questionsApi.answer(
      question.id, answerText.trim(),
      linkEntry.trim() || undefined,
    ),
    onSuccess: () => {
      setAnswerText("");
      setLinkEntry("");
      setExpanded(false);
      onUpdated();
    },
  });

  const resolveMut = useMutation({
    mutationFn: () => questionsApi.resolve(question.id),
    onSuccess:  onUpdated,
  });

  // Visibility: own questions always visible; specific ones show target list
  const isOwn    = question.raisedBy === currentUser;
  const isTarget = question.targetUsernames.includes(currentUser);

  return (
    <Card variant="outlined" sx={{
      borderRadius: 2.5,
      borderColor: question.isResolved ? "divider" : "#345f54",
      opacity: question.isResolved ? 0.75 : 1,
    }}>
      <CardContent sx={{ p: 2.5 }}>
        {/* Top row */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} mb={0.75} flexWrap="wrap">
              <Chip
                label={question.audience === "All" ? "All users" : "Specific users"}
                size="small"
                color={question.audience === "All" ? "info" : "secondary"}
                sx={{ fontWeight: 700, fontSize: 10 }}
              />
              {question.isResolved && (
                <Chip icon={<CheckCircleOutlineIcon />} label="Resolved" size="small" color="success" />
              )}
              {question.project && (
                <Chip label={question.project} size="small" variant="outlined" sx={{ fontSize: 10 }} />
              )}
              {question.audience === "Specific" && (
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
                  → {question.targetUsernames.join(", ")}
                </Typography>
              )}
            </Stack>
            <Typography variant="body1" fontWeight={500}>{question.text}</Typography>
            <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
              Asked by <strong>{question.raisedBy}</strong> · {new Date(question.raisedAt).toLocaleString()}
              {question.answers.length > 0 && ` · ${question.answers.length} answer${question.answers.length > 1 ? "s" : ""}`}
            </Typography>
          </Box>

          <Stack direction="row" spacing={0.5} flexShrink={0}>
            {!question.isResolved && (isOwn || isTarget) && (
              <Button size="small" startIcon={<ReplyIcon />} variant="outlined"
                onClick={() => setExpanded(v => !v)}>
                Answer
              </Button>
            )}
            {!question.isResolved && isOwn && (
              <Button size="small" color="success" variant="outlined"
                disabled={resolveMut.isPending}
                onClick={() => resolveMut.mutate()}>
                Resolve
              </Button>
            )}
          </Stack>
        </Stack>

        {/* Existing answers */}
        {question.answers.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Stack spacing={1.5}>
              {question.answers.map(a => (
                <Box key={a.id} sx={{ pl: 2, borderLeft: "3px solid", borderColor: "#345f54" }}>
                  <Typography variant="body2">{a.answer}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    — <strong>{a.answeredBy}</strong> · {new Date(a.answeredAt).toLocaleString()}
                    {a.knowledgeEntryId && (
                      <Chip label="Linked to entry" size="small" color="success"
                        sx={{ ml: 1, fontSize: 10 }} />
                    )}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {/* Answer form */}
        <Collapse in={expanded}>
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={1.5}>
              <TextField
                label="Your answer" multiline minRows={3} fullWidth size="small"
                value={answerText} onChange={e => setAnswerText(e.target.value)}
                placeholder="Share what you know…"
              />
              <TextField
                label="Link to knowledge entry (optional — paste entry ID)"
                size="small" fullWidth value={linkEntry}
                onChange={e => setLinkEntry(e.target.value)}
                helperText="If you captured this as a knowledge entry, paste its ID here to auto-resolve the question."
              />
              {answerMut.error && (
                <Alert severity="error">{(answerMut.error as Error).message}</Alert>
              )}
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button variant="text" onClick={() => setExpanded(false)}>Cancel</Button>
                <Button variant="contained" disabled={!answerText.trim() || answerMut.isPending}
                  onClick={() => answerMut.mutate()}
                  sx={{ bgcolor: "#345f54", "&:hover": { bgcolor: "#2b4f46" }, fontWeight: 700 }}>
                  {answerMut.isPending ? <CircularProgress size={16} color="inherit" /> : "Submit answer"}
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

// ── Raise question dialog ─────────────────────────────────────────────────────

function RaiseDialog({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { user: me } = useAuth();

  const [text,     setText]     = useState("");
  const [audience, setAudience] = useState<Audience>("All");
  const [targets,  setTargets]  = useState<string[]>([]);
  const [project,  setProject]  = useState("");

  // Load the user list for the multiselect — exclude yourself
  const { data: allUsers = [] } = useQuery({
    queryKey: ["users"],
    queryFn:  usersApi.list,
    staleTime: 60_000,
    enabled:  open,
  });
  const otherUsers = allUsers
    .filter(u => u.isActive && u.username !== me?.username)
    .map(u => ({ label: u.displayName ? `${u.displayName} (${u.username})` : u.username, value: u.username }));

  const raiseMut = useMutation({
    mutationFn: () => questionsApi.raise(
      text.trim(),
      audience,
      audience === "Specific" ? targets : undefined,
      project.trim() || undefined,
    ),
    onSuccess: () => {
      onCreated();
      onClose();
      setText(""); setAudience("All"); setTargets([]); setProject("");
    },
  });

  const canSubmit = text.trim().length > 0 &&
    (audience === "All" || targets.length > 0) &&
    !raiseMut.isPending;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Raise a question</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "12px !important" }}>
        <TextField
          label="Question" multiline minRows={3} fullWidth autoFocus
          value={text} onChange={e => setText(e.target.value)}
          placeholder="What are you trying to find out?"
        />

        <FormControl size="small" fullWidth>
          <InputLabel>Audience</InputLabel>
          <Select value={audience} label="Audience"
            onChange={e => { setAudience(e.target.value as Audience); setTargets([]); }}>
            <MenuItem value="All">All users — visible on everyone's panel</MenuItem>
            <MenuItem value="Specific">Specific users — only they can see and answer</MenuItem>
          </Select>
        </FormControl>

        {audience === "Specific" && (
          <Autocomplete
            multiple
            options={otherUsers}
            getOptionLabel={o => o.label}
            value={otherUsers.filter(o => targets.includes(o.value))}
            onChange={(_, selected) => setTargets(selected.map(s => s.value))}
            isOptionEqualToValue={(o, v) => o.value === v.value}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  label={option.label}
                  size="small"
                  {...getTagProps({ index })}
                  key={option.value}
                />
              ))
            }
            renderInput={params => (
              <TextField
                {...params}
                label="Ask specific people"
                size="small"
                placeholder={targets.length === 0 ? "Select team members…" : ""}
                helperText="Only selected users will see this question."
              />
            )}
            noOptionsText="No other active users found"
          />
        )}

        <TextField
          label="Project (optional)" size="small" fullWidth
          value={project} onChange={e => setProject(e.target.value)}
        />

        {raiseMut.error && (
          <Alert severity="error">{(raiseMut.error as Error).message}</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!canSubmit}
          onClick={() => raiseMut.mutate()}
          sx={{ bgcolor: "#345f54", "&:hover": { bgcolor: "#2b4f46" }, fontWeight: 700 }}>
          {raiseMut.isPending ? <CircularProgress size={16} color="inherit" /> : "Raise question"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
