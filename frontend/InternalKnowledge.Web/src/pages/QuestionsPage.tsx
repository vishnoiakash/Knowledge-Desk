import { useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Card, Chip, CircularProgress,
  Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, InputLabel, MenuItem, Select, Stack,
  Tab, Tabs, TextField, Typography,
} from "@mui/material";
import AddIcon                from "@mui/icons-material/Add";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import HelpOutlineIcon        from "@mui/icons-material/HelpOutlineOutlined";
import ReplyIcon              from "@mui/icons-material/Reply";
import CheckIcon              from "@mui/icons-material/Check";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { questionsApi, usersApi, type Audience, type OpenQuestionDto } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function QuestionsPage() {
  const { user } = useAuth();
  const qc       = useQueryClient();

  const [tab,       setTab]       = useState<"open" | "resolved">("open");
  const [project,   setProject]   = useState("");
  const [raiseOpen, setRaiseOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["questions", tab, project],
    queryFn:  () => questionsApi.list(tab === "resolved", project || undefined),
    staleTime: 15_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["questions"] });

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 960, mx: "auto" }}>
      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 3 }}>
        <Box>
          <Typography variant="overline" color="text.secondary">Questions</Typography>
          <Typography variant="h4" fontFamily="Georgia" fontWeight={600}>
            {tab === "open" ? "Open questions" : "Resolved questions"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Raise a question for the whole team or specific colleagues.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setRaiseOpen(true)}
          color="primary"
          sx={{ mt: 0.5 }}
        >
          Raise question
        </Button>
      </Box>

      {/* Filters */}
      <Stack direction="row" spacing={2} mb={2.5} alignItems="center">
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ minHeight: 36, "& .MuiTab-root": { minHeight: 36, py: 0 } }}
        >
          <Tab value="open"     label="Open" />
          <Tab value="resolved" label="Resolved" />
        </Tabs>
        <TextField
          size="small"
          placeholder="Filter by project"
          value={project}
          onChange={e => setProject(e.target.value)}
          sx={{ width: 200 }}
        />
      </Stack>

      {/* List */}
      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{(error as Error).message}</Alert>}

      <Stack spacing={1.5}>
        {data?.length === 0 && (
          <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
            <HelpOutlineIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
            <Typography>No {tab} questions{project ? ` in "${project}"` : ""}.</Typography>
          </Box>
        )}
        {data?.map(q => (
          <QuestionCard
            key={q.id}
            question={q}
            currentUser={user?.username ?? ""}
            onUpdated={invalidate}
          />
        ))}
      </Stack>

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

  const answerMut = useMutation({
    mutationFn: () => questionsApi.answer(
      question.id,
      answerText.trim(),
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

  const isOwn    = question.raisedBy === currentUser;
  const isTarget = question.targetUsernames.includes(currentUser);

  // Resolve is only available to the question owner AND only when there is
  // at least one answer — prevents resolving unanswered questions.
  const canResolve = !question.isResolved && isOwn && question.answers.length > 0;

  return (
    <Card
      sx={{
        opacity: question.isResolved ? 0.72 : 1,
        borderColor: question.isResolved ? "divider" : "divider",
      }}
    >
      {/* ── Card content ── */}
      <Box sx={{ px: 2.5, pt: 2, pb: expanded ? 0 : 2 }}>

        {/* Top row: chips + question text + actions */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
          {/* Left — text content */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Audience / status chips */}
            <Stack direction="row" spacing={0.75} mb={0.75} flexWrap="wrap" alignItems="center">
              <Chip
                label={question.audience === "All" ? "All users" : "Specific users"}
                size="small"
                color={question.audience === "All" ? "info" : "secondary"}
                sx={{ fontWeight: 700, fontSize: 10 }}
              />
              {question.isResolved && (
                <Chip
                  icon={<CheckCircleOutlineIcon sx={{ fontSize: 12 }} />}
                  label="Resolved"
                  size="small"
                  color="success"
                />
              )}
              {question.project && (
                <Chip
                  label={question.project}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: 10 }}
                />
              )}
              {question.audience === "Specific" && question.targetUsernames.length > 0 && (
                <Typography variant="caption" color="text.secondary">
                  → {question.targetUsernames.join(", ")}
                </Typography>
              )}
            </Stack>

            {/* Question text */}
            <Typography variant="body1" fontWeight={500} sx={{ lineHeight: 1.5 }}>
              {question.text}
            </Typography>

            {/* Meta */}
            <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
              Asked by <strong>{question.raisedBy}</strong>
              {" · "}
              {new Date(question.raisedAt).toLocaleString()}
              {question.answers.length > 0 && (
                <> · {question.answers.length} answer{question.answers.length !== 1 ? "s" : ""}</>
              )}
            </Typography>
          </Box>

          {/* Right — action buttons */}
          {!question.isResolved && (
            <Stack direction="row" spacing={0.75} flexShrink={0} alignItems="center" mt={0.25}>
              {(isOwn || isTarget) && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ReplyIcon sx={{ fontSize: 14 }} />}
                  onClick={() => setExpanded(v => !v)}
                  sx={{ fontSize: 12, height: 30, py: 0 }}
                >
                  {expanded ? "Close" : "Answer"}
                </Button>
              )}
              {canResolve && (
                <Button
                  size="small"
                  variant="outlined"
                  color="success"
                  startIcon={<CheckIcon sx={{ fontSize: 14 }} />}
                  disabled={resolveMut.isPending}
                  onClick={() => resolveMut.mutate()}
                  sx={{ fontSize: 12, height: 30, py: 0 }}
                >
                  {resolveMut.isPending ? <CircularProgress size={14} /> : "Resolve"}
                </Button>
              )}
              {!canResolve && isOwn && !question.isResolved && (
                <Button
                  size="small"
                  variant="outlined"
                  color="success"
                  disabled
                  title="Add at least one answer before resolving"
                  sx={{ fontSize: 12, height: 30, py: 0 }}
                >
                  Resolve
                </Button>
              )}
            </Stack>
          )}
        </Stack>

        {/* Existing answers */}
        {question.answers.length > 0 && (
          <Box sx={{ mt: 1.75 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Stack spacing={1.25}>
              {question.answers.map(a => (
                <Box
                  key={a.id}
                  sx={{
                    pl: 1.75,
                    borderLeft: "3px solid",
                    borderColor: "primary.light",
                    py: 0.25,
                  }}
                >
                  <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                    {a.answer}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    <strong>{a.answeredBy}</strong>
                    {" · "}
                    {new Date(a.answeredAt).toLocaleString()}
                    {a.knowledgeEntryId && (
                      <Chip
                        label="Linked to entry"
                        size="small"
                        color="success"
                        sx={{ ml: 1, fontSize: 10 }}
                      />
                    )}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </Box>

      {/* Answer form — shown inline below the card body */}
      <Collapse in={expanded}>
        <Divider />
        <Box sx={{ px: 2.5, py: 2 }}>
          <Stack spacing={1.5}>
            <TextField
              label="Your answer"
              multiline
              minRows={3}
              fullWidth
              size="small"
              autoFocus
              value={answerText}
              onChange={e => setAnswerText(e.target.value)}
              placeholder="Share what you know…"
            />
            <TextField
              label="Link to knowledge entry (optional)"
              size="small"
              fullWidth
              value={linkEntry}
              onChange={e => setLinkEntry(e.target.value)}
              helperText="Paste the entry ID to link it — this will auto-resolve the question."
            />
            {answerMut.error && (
              <Alert severity="error">{(answerMut.error as Error).message}</Alert>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button variant="text" onClick={() => setExpanded(false)}>
                Cancel
              </Button>
              <Button
                variant="contained"
                color="primary"
                disabled={!answerText.trim() || answerMut.isPending}
                onClick={() => answerMut.mutate()}
              >
                {answerMut.isPending
                  ? <CircularProgress size={16} color="inherit" />
                  : "Submit answer"}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Collapse>
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

  const { data: allUsers = [] } = useQuery({
    queryKey: ["users"],
    queryFn:  usersApi.list,
    staleTime: 60_000,
    enabled:  open,
  });

  const otherUsers = allUsers
    .filter(u => u.isActive && u.username !== me?.username)
    .map(u => ({
      label: u.displayName ? `${u.displayName} (${u.username})` : u.username,
      value: u.username,
    }));

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

  const canSubmit =
    text.trim().length > 0 &&
    (audience === "All" || targets.length > 0) &&
    !raiseMut.isPending;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Raise a question</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "12px !important" }}>
        <TextField
          label="Question"
          multiline
          minRows={3}
          fullWidth
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="What are you trying to find out?"
        />

        <FormControl size="small" fullWidth>
          <InputLabel>Audience</InputLabel>
          <Select
            value={audience}
            label="Audience"
            onChange={e => { setAudience(e.target.value as Audience); setTargets([]); }}
          >
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
          label="Project (optional)"
          size="small"
          fullWidth
          value={project}
          onChange={e => setProject(e.target.value)}
        />

        {raiseMut.error && (
          <Alert severity="error">{(raiseMut.error as Error).message}</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="primary"
          disabled={!canSubmit}
          onClick={() => raiseMut.mutate()}
        >
          {raiseMut.isPending
            ? <CircularProgress size={16} color="inherit" />
            : "Raise question"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
