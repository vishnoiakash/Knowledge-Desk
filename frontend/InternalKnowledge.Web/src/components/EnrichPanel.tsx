import { useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Collapse, Divider, Stack, TextField, Tooltip, Typography, alpha,
} from "@mui/material";
import AutoFixHighIcon       from "@mui/icons-material/AutoFixHigh";
import CheckIcon             from "@mui/icons-material/Check";
import CloseIcon             from "@mui/icons-material/Close";
import AddIcon               from "@mui/icons-material/Add";
import EditOutlinedIcon      from "@mui/icons-material/EditOutlined";
import { useMutation }       from "@tanstack/react-query";
import { knowledgeApi, type EnrichResult, type FieldChange, type KnowledgeEntry } from "../services/api";
import { FIELD_LABELS }      from "../utils/entryTypeFields";

interface Props {
  entryId: string;
  onAccepted: (updated: KnowledgeEntry) => void;
  onClose: () => void;
}

export default function EnrichPanel({ entryId, onAccepted, onClose }: Props) {
  const [note,   setNote]   = useState("");
  const [result, setResult] = useState<EnrichResult | null>(null);

  // Which field changes the user has accepted (defaults to all)
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  const enrichMut = useMutation({
    mutationFn: () => knowledgeApi.enrich(entryId, note.trim()),
    onSuccess: (r) => {
      setResult(r);
      // Pre-select all proposed changes
      setAccepted(new Set(r.changes.map(c => c.field)));
    },
  });

  function toggleField(field: string) {
    setAccepted(prev => {
      const next = new Set(prev);
      next.has(field) ? next.delete(field) : next.add(field);
      return next;
    });
  }

  function applyAccepted() {
    if (!result) return;
    // Build the updated entry by applying only accepted changes
    const entry = { ...result.proposedEntry };
    for (const change of result.changes) {
      if (!accepted.has(change.field)) {
        // Revert to old value for rejected fields
        (entry as Record<string, unknown>)[change.field] = change.oldValue ?? null;
      }
    }
    onAccepted(entry);
  }

  const acceptedCount = accepted.size;
  const totalChanges  = result?.changes.length ?? 0;

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, border: "1.5px solid #1e4d42" }}>
      <CardContent sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2.5 }}>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              Add more information
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Paste what you know — AI will merge it into the right fields. You review each change before saving.
            </Typography>
          </Box>
          <Button size="small" onClick={onClose} sx={{ minWidth: 0, px: 0.5 }}>
            <CloseIcon fontSize="small" />
          </Button>
        </Stack>

        {/* ── Input phase ─────────────────────────────────────────────── */}
        {!result && (
          <>
            <TextField
              autoFocus multiline minRows={5} fullWidth
              label="What new information do you have?"
              placeholder={`Examples:\n• We later found the root cause was in the payments service too\n• Permanent fix deployed in v2.3.1 — removed the legacy session factory\n• Also affects users with >500 items in their cart`}
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            {enrichMut.error && (
              <Alert severity="error">{(enrichMut.error as Error).message}</Alert>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button variant="text" onClick={onClose}>Cancel</Button>
              <Button
                variant="contained"
                disabled={note.trim().length < 10 || enrichMut.isPending}
                onClick={() => enrichMut.mutate()}
                sx={{ bgcolor: "#1e4d42", "&:hover": { bgcolor: "#173d34" }, fontWeight: 700 }}
                startIcon={enrichMut.isPending
                  ? <CircularProgress size={16} color="inherit" />
                  : <AutoFixHighIcon />}
              >
                {enrichMut.isPending ? "Analysing…" : "Analyse & preview changes"}
              </Button>
            </Stack>
          </>
        )}

        {/* ── Diff review phase ────────────────────────────────────────── */}
        {result && (
          <>
            {/* AI summary */}
            <Alert icon={<AutoFixHighIcon />} severity="success" sx={{ py: 0.75 }}>
              <Typography variant="body2"><strong>AI summary:</strong> {result.summary}</Typography>
            </Alert>

            {result.changes.length === 0 ? (
              <Alert severity="info">
                The AI found no new information to add — the note may already be covered by the existing entry.
              </Alert>
            ) : (
              <Stack spacing={1.5}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  {totalChanges} field{totalChanges !== 1 ? "s" : ""} proposed — select which to accept
                </Typography>

                {result.changes.map(change => {
                  const isAccepted = accepted.has(change.field);
                  const label      = FIELD_LABELS[change.field] ?? change.field;
                  return (
                    <FieldDiffCard
                      key={change.field}
                      change={change}
                      label={label}
                      accepted={isAccepted}
                      onToggle={() => toggleField(change.field)}
                    />
                  );
                })}
              </Stack>
            )}

            {/* Actions */}
            {result.changes.length > 0 && (
              <>
                <Divider />
                <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    {acceptedCount} of {totalChanges} change{totalChanges !== 1 ? "s" : ""} selected
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button variant="text" onClick={() => { setResult(null); setNote(""); }}>
                      ← Edit note
                    </Button>
                    <Button variant="text" onClick={onClose}>Discard</Button>
                    <Button
                      variant="contained"
                      disabled={acceptedCount === 0}
                      onClick={applyAccepted}
                      sx={{ bgcolor: "#1e4d42", "&:hover": { bgcolor: "#173d34" }, fontWeight: 700 }}
                      startIcon={<CheckIcon />}
                    >
                      Apply {acceptedCount} change{acceptedCount !== 1 ? "s" : ""}
                    </Button>
                  </Stack>
                </Stack>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Field diff card ────────────────────────────────────────────────────────────

function FieldDiffCard({
  change, label, accepted, onToggle,
}: { change: FieldChange; label: string; accepted: boolean; onToggle: () => void }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        borderColor: accepted ? "#1e4d42" : "#e0e8e4",
        bgcolor: accepted ? alpha("#1e4d42", 0.025) : "#fafbf9",
        transition: "all .12s",
      }}
    >
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        {/* Card header */}
        <Stack direction="row" alignItems="center" spacing={1} mb={expanded ? 1.5 : 0}>
          {/* Accept toggle */}
          <Box
            onClick={onToggle}
            sx={{
              width: 22, height: 22, borderRadius: 1, flexShrink: 0, cursor: "pointer",
              border: "2px solid", borderColor: accepted ? "#1e4d42" : "#c8d6d0",
              bgcolor: accepted ? "#1e4d42" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all .12s",
            }}
          >
            {accepted && <CheckIcon sx={{ fontSize: 14, color: "#fff" }} />}
          </Box>

          {/* Field chip */}
          {change.isNew ? (
            <Chip icon={<AddIcon sx={{ fontSize: 11 }} />} label={label} size="small"
              sx={{ bgcolor: "#eef5ff", color: "#1a4a8a", fontWeight: 700, fontSize: 10 }} />
          ) : (
            <Chip icon={<EditOutlinedIcon sx={{ fontSize: 11 }} />} label={label} size="small"
              sx={{ bgcolor: "#fff0eb", color: "#a05030", fontWeight: 700, fontSize: 10 }} />
          )}

          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            {change.isNew ? "New field" : "Updated"}
          </Typography>

          <Button size="small" variant="text" onClick={() => setExpanded(v => !v)}
            sx={{ minWidth: 0, px: 0.5, fontSize: 11, color: "text.disabled" }}>
            {expanded ? "Collapse" : "Expand"}
          </Button>
        </Stack>

        <Collapse in={expanded}>
          <Stack spacing={1}>
            {/* Old value — only shown for updates */}
            {!change.isNew && change.oldValue && (
              <Box>
                <Typography variant="caption" color="text.disabled" fontWeight={600} display="block" mb={0.25}>
                  Current
                </Typography>
                <Box sx={{ bgcolor: "#fff8f5", border: "1px solid #fde0d5",
                  borderRadius: 1.5, p: 1.25, fontSize: 12.5, color: "#7a3f30",
                  whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {change.oldValue}
                </Box>
              </Box>
            )}

            {/* New value */}
            <Box>
              <Typography variant="caption" color="text.disabled" fontWeight={600} display="block" mb={0.25}>
                {change.isNew ? "Content" : "Proposed"}
              </Typography>
              <Box sx={{ bgcolor: "#f0fbf4", border: "1px solid #c3e8d0",
                borderRadius: 1.5, p: 1.25, fontSize: 12.5, color: "#1a5c35",
                whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {change.newValue}
              </Box>
            </Box>
          </Stack>
        </Collapse>
      </CardContent>
    </Card>
  );
}
