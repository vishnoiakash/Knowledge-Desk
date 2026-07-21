import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Collapse, Divider, IconButton, Stack, TextField, Tooltip,
  Typography, Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import ThumbUpAltOutlinedIcon  from "@mui/icons-material/ThumbUpAltOutlined";
import ThumbDownAltOutlinedIcon from "@mui/icons-material/ThumbDownAltOutlined";
import ThumbUpIcon             from "@mui/icons-material/ThumbUp";
import ThumbDownIcon           from "@mui/icons-material/ThumbDown";
import EditIcon                from "@mui/icons-material/Edit";
import AddCircleOutlineIcon    from "@mui/icons-material/AddCircleOutlineOutlined";
import ArchiveIcon             from "@mui/icons-material/Archive";
import UnarchiveIcon           from "@mui/icons-material/Unarchive";
import ArrowBackIcon           from "@mui/icons-material/ArrowBack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { knowledgeApi, type KnowledgeEntry } from "../services/api";
import { getFieldSchema, FIELD_LABELS } from "../utils/entryTypeFields";
import EnrichPanel from "../components/EnrichPanel";

const META_FIELDS = ["project","module","affectedService"] as const;

export default function EntryDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const qc        = useQueryClient();

  const { data: entry, isLoading } = useQuery({
    queryKey: ["entry", id],
    queryFn:  () => knowledgeApi.get(id!),
    enabled:  !!id,
  });
  const { data: revisions } = useQuery({
    queryKey: ["revisions", id],
    queryFn:  () => knowledgeApi.revisions(id!),
    enabled:  !!id,
  });
  const { data: fbStats, refetch: refetchFb } = useQuery({
    queryKey: ["feedback", id],
    queryFn:  () => knowledgeApi.feedbackStats(id!),
    enabled:  !!id,
  });

  const [editing,   setEditing]   = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [draft,     setDraft]     = useState<KnowledgeEntry | null>(null);
  const [fbVote,    setFbVote]    = useState<boolean | null>(null);
  const [fbDialog,  setFbDialog]  = useState(false);
  const [fbComment, setFbComment] = useState("");

  const actionMut = useMutation({
    mutationFn: (kind: "save" | "archive" | "restore") =>
      kind === "save"    ? knowledgeApi.update(draft!) :
      kind === "archive" ? knowledgeApi.archive(id!)   :
                           knowledgeApi.restore(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["entry", id] }); setEditing(false); },
  });

  const feedbackMut = useMutation({
    mutationFn: ({ helpful, comment }: { helpful: boolean; comment?: string }) =>
      knowledgeApi.feedback(id!, helpful, comment),
    onSuccess: () => { setFbDialog(false); setFbComment(""); refetchFb(); },
  });

  // Called when user accepts enriched changes — saves directly without manual edit step
  const enrichSaveMut = useMutation({
    mutationFn: (proposed: KnowledgeEntry) => knowledgeApi.update(proposed),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entry", id] });
      qc.invalidateQueries({ queryKey: ["revisions", id] });
      setEnriching(false);
    },
  });

  function handleEnrichAccepted(proposed: KnowledgeEntry) {
    enrichSaveMut.mutate(proposed);
  }

  function openFeedback(helpful: boolean) {
    setFbVote(helpful);
    if (!helpful) { setFbDialog(true); return; }
    feedbackMut.mutate({ helpful });
  }

  if (isLoading) return <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress /></Box>;
  if (!entry)   return <Box sx={{ p: 4 }}><Alert severity="error">Entry not found.</Alert></Box>;

  const e = draft ?? entry;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1100, mx: "auto" }}>
      {/* Back */}
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/library")} sx={{ mb: 2 }}>
        Back to library
      </Button>

      {/* Header card */}
      <Card variant="outlined" sx={{ borderRadius: 3, mb: 2 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} mb={1} flexWrap="wrap">
                <Chip label={e.entryType} size="small" sx={{ bgcolor: "#eef3f0", fontWeight: 700 }} />
                <Chip label={e.status} size="small" variant="outlined"
                  color={e.status === "Active" ? "success" : e.status === "Archived" ? "error" : "warning"} />
                {e.project && <Chip label={e.project} size="small" variant="outlined" />}
                {e.capturedBy && (
                  <Chip label={`by ${e.capturedBy}`} size="small" variant="outlined"
                    sx={{ bgcolor: "#f0edf8", borderColor: "#c8bce8", color: "#5a4ea0" }} />
                )}
              </Stack>
              <Typography variant="h5" fontFamily="Georgia" fontWeight={600}>{e.title}</Typography>
              <Typography variant="body1" color="text.secondary" mt={0.5}>{e.summary}</Typography>
              <Typography variant="caption" color="text.secondary" mt={1} display="block">
                Created {new Date(e.createdAt).toLocaleString()} · Updated {new Date(e.updatedAt).toLocaleString()}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} flexShrink={0}>
              {/* Feedback buttons */}
              <Tooltip title="Helpful">
                <IconButton size="small" onClick={() => openFeedback(true)} color={fbVote === true ? "success" : "default"}>
                  {fbVote === true ? <ThumbUpIcon fontSize="small" /> : <ThumbUpAltOutlinedIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Not helpful">
                <IconButton size="small" onClick={() => openFeedback(false)} color={fbVote === false ? "error" : "default"}>
                  {fbVote === false ? <ThumbDownIcon fontSize="small" /> : <ThumbDownAltOutlinedIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              {fbStats && (
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
                  {fbStats.helpful}/{fbStats.total} helpful
                </Typography>
              )}
              <Divider orientation="vertical" flexItem />
              <Button size="small" startIcon={<AddCircleOutlineIcon />}
                onClick={() => { setEnriching(v => !v); setEditing(false); }}
                color={enriching ? "primary" : "inherit"}
                variant={enriching ? "outlined" : "text"}>
                Add more info
              </Button>
              <Button size="small" startIcon={<EditIcon />}
                onClick={() => { setDraft({ ...entry }); setEditing(true); setEnriching(false); }}>
                Edit
              </Button>
              {e.status === "Archived"
                ? <Button size="small" startIcon={<UnarchiveIcon />} onClick={() => actionMut.mutate("restore")}>Restore</Button>
                : <Button size="small" startIcon={<ArchiveIcon />} color="warning" onClick={() => actionMut.mutate("archive")}>Archive</Button>
              }
            </Stack>
          </Box>
        </CardContent>
      </Card>

      {/* Enrich panel */}
      <Collapse in={enriching}>
        <Box sx={{ mb: 2 }}>
          {enrichSaveMut.isSuccess && (
            <Alert severity="success" sx={{ mb: 1.5 }} onClose={() => enrichSaveMut.reset()}>
              Entry updated with the new information. Re-indexing in the background.
            </Alert>
          )}
          {enrichSaveMut.error && (
            <Alert severity="error" sx={{ mb: 1.5 }}>{(enrichSaveMut.error as Error).message}</Alert>
          )}
          {!enrichSaveMut.isSuccess && (
            <EnrichPanel
              entryId={id!}
              onAccepted={handleEnrichAccepted}
              onClose={() => setEnriching(false)}
            />
          )}
        </Box>
      </Collapse>

      {/* Edit form */}
      <Collapse in={editing}>
        <Card variant="outlined" sx={{ borderRadius: 3, mb: 2 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>Edit entry</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
              {/* Title */}
              <TextField key="title" label="Title" size="small" fullWidth
                value={String((e as Record<string, unknown>)["title"] ?? "")}
                onChange={x => setDraft({ ...e, title: x.target.value })}
                sx={{ gridColumn: "1 / -1" }}
              />

              {/* Entry-type-aware content fields */}
              {getFieldSchema(e.entryType).map(f => (
                <TextField key={f.key} label={f.label} size="small"
                  multiline={["summary","problem","rootCause","solution","prevention","detailedContent"].includes(f.key)}
                  minRows={f.rows ?? 2} fullWidth
                  value={String((e as Record<string, unknown>)[f.key] ?? "")}
                  onChange={x => setDraft({ ...e, [f.key]: x.target.value })}
                  sx={f.wide ? { gridColumn: "1 / -1" } : {}}
                />
              ))}

              {/* Meta fields always shown in edit */}
              {META_FIELDS.map(k => (
                <TextField key={k} label={FIELD_LABELS[k] ?? k} size="small" fullWidth
                  value={String((e as Record<string, unknown>)[k] ?? "")}
                  onChange={x => setDraft({ ...e, [k]: x.target.value })}
                />
              ))}
            </Box>
            <Stack direction="row" spacing={1} mt={2}>
              <Button variant="contained" onClick={() => actionMut.mutate("save")} disabled={actionMut.isPending}
                sx={{ bgcolor: "#345f54", "&:hover": { bgcolor: "#2b4f46" }, fontWeight: 700 }}>
                {actionMut.isPending ? <CircularProgress size={16} color="inherit" /> : "Save changes"}
              </Button>
              <Button variant="text" onClick={() => { setEditing(false); setDraft(null); }}>Cancel</Button>
            </Stack>
            {actionMut.error && <Alert severity="error" sx={{ mt: 1 }}>{actionMut.error.message}</Alert>}
          </CardContent>
        </Card>
      </Collapse>

      {/* Detail fields — entry-type-aware view */}
      {!editing && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, mb: 2 }}>
          {/* Render fields in schema order, only if they have content */}
          {getFieldSchema(e.entryType)
            .filter(f => !!(e as Record<string, unknown>)[f.key])
            .map(f => (
              <Card key={f.key} variant="outlined" sx={{ borderRadius: 2,
                gridColumn: f.wide ? "1 / -1" : "auto" }}>
                <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>
                    {f.label}
                  </Typography>
                  <Typography variant="body2" mt={0.5} sx={{ whiteSpace: "pre-wrap" }}>
                    {String((e as Record<string, unknown>)[f.key])}
                  </Typography>
                </CardContent>
              </Card>
            ))
          }

          {/* Fields not in schema but populated — show at the end so nothing is hidden */}
          {(["problem","rootCause","solution","prevention","detailedContent"] as const)
            .filter(k => {
              const schema = getFieldSchema(e.entryType);
              return !schema.some(f => f.key === k) && !!(e as Record<string, unknown>)[k];
            })
            .map(k => (
              <Card key={k} variant="outlined" sx={{ borderRadius: 2, gridColumn: "1 / -1" }}>
                <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="capitalize">
                    {FIELD_LABELS[k] ?? k}
                  </Typography>
                  <Typography variant="body2" mt={0.5} sx={{ whiteSpace: "pre-wrap" }}>
                    {String((e as Record<string, unknown>)[k])}
                  </Typography>
                </CardContent>
              </Card>
            ))
          }

          {/* Meta fields */}
          {META_FIELDS
            .filter(k => !!(e as Record<string, unknown>)[k])
            .map(k => (
              <Card key={k} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="capitalize">
                    {FIELD_LABELS[k] ?? k}
                  </Typography>
                  <Typography variant="body2" mt={0.5}>{String((e as Record<string, unknown>)[k])}</Typography>
                </CardContent>
              </Card>
            ))
          }
        </Box>
      )}

      {/* Revision history */}
      {revisions && revisions.length > 0 && (
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>Revision history</Typography>
            <Stack spacing={1}>
              {revisions.map(r => (
                <details key={r.id} style={{ borderRadius: 8, border: "1px solid #e3e8e5", padding: "10px 14px" }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                    Revision {r.revisionNumber} · {new Date(r.createdAt).toLocaleString()}
                  </summary>
                  <Box component="pre" sx={{ mt: 1, fontSize: 12, overflow: "auto", whiteSpace: "pre-wrap",
                    bgcolor: "#f5f8f6", borderRadius: 1, p: 1.5 }}>
                    {JSON.stringify(JSON.parse(r.snapshotJson), null, 2)}
                  </Box>
                </details>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Feedback dialog (for negative votes) */}
      <Dialog open={fbDialog} onClose={() => setFbDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>What could be improved?</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth multiline minRows={3} label="Optional comment"
            value={fbComment} onChange={e => setFbComment(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFbDialog(false)}>Cancel</Button>
          <Button variant="contained" color="error"
            onClick={() => feedbackMut.mutate({ helpful: false, comment: fbComment || undefined })}
            disabled={feedbackMut.isPending}>
            Submit feedback
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
