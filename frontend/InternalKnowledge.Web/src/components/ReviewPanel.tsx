import { useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider,
  FormControl, InputLabel, MenuItem, Select, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { knowledgeApi, type AnalysisResult, type EntryType, type KnowledgeEntry, type SearchResult } from "../services/api";
import { getFieldSchema } from "../utils/entryTypeFields";

const TYPES: EntryType[] = ["Issue","Workflow","Knowledge","Troubleshooting","HowTo","Decision","KnownLimitation"];

export default function ReviewPanel({ analysis, onDone }: { analysis: AnalysisResult; onDone: () => void }) {
  const initial = analysis.suggestedEntries?.length ? analysis.suggestedEntries : [analysis.entry];
  const [drafts,    setDrafts]    = useState(initial);
  const [saved,     setSaved]     = useState<string[]>([]);
  const [allow,     setAllow]     = useState(false);
  const [updateId,  setUpdateId]  = useState<string>();
  const [inspected, setInspected] = useState<KnowledgeEntry>();

  const qc = useQueryClient();

  const inspect = useMutation({
    mutationFn: (id: string) => knowledgeApi.get(id),
    onSuccess: setInspected,
  });

  const save = useMutation({
    mutationFn: async (entry: KnowledgeEntry) => {
      if (!updateId) return knowledgeApi.create(entry, allow);
      const existing = await knowledgeApi.get(updateId);
      return knowledgeApi.update({ ...entry, id: existing.id, createdAt: existing.createdAt, updatedAt: existing.updatedAt });
    },
    onSuccess: (e) => { setSaved(x => [...x, e.id]); qc.invalidateQueries({ queryKey: ["knowledge"] }); },
  });

  const update = (i: number, key: keyof KnowledgeEntry, value: unknown) =>
    setDrafts(x => x.map((e, n) => n === i ? { ...e, [key]: value } : e));

  const dups = analysis.potentialDuplicates ?? [];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Banner */}
      <Alert icon={false} severity="success" sx={{ borderRadius: 2 }}>
        <Typography variant="subtitle2">
          {drafts.length} {drafts.length === 1 ? "entry" : "entries"} ready for review
        </Typography>
      </Alert>

      {/* Duplicate warning */}
      {dups.length > 0 && (
        <Card variant="outlined" sx={{ borderRadius: 2, borderColor: "#f3dfc3", bgcolor: "#fff7ec" }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Potential duplicates found</Typography>
            <Stack spacing={1}>
              {dups.map((d: SearchResult) => (
                <Box key={d.knowledgeEntryId}
                  sx={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                        bgcolor: updateId === d.knowledgeEntryId ? "#eef7f3" : "#fff",
                        border: "1px solid", borderColor: updateId === d.knowledgeEntryId ? "#345f54" : "#e8d8c0",
                        borderRadius: 2, p: 1.5 }}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{d.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {d.summary} · {Math.round(d.similarity * 100)}% match
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="outlined" onClick={() => inspect.mutate(d.knowledgeEntryId)}>Inspect</Button>
                    <Button size="small" variant="outlined" color="warning"
                      onClick={() => { setUpdateId(d.knowledgeEntryId); setAllow(false); }}>
                      Update existing
                    </Button>
                  </Stack>
                </Box>
              ))}
            </Stack>

            {inspected && (
              <Box sx={{ mt: 1.5, p: 1.5, bgcolor: "#f5f8f6", borderRadius: 2, position: "relative" }}>
                <Button size="small" onClick={() => setInspected(undefined)}
                  sx={{ position: "absolute", top: 6, right: 6, minWidth: 0, px: 1 }}>×</Button>
                <Typography variant="subtitle2">{inspected.title}</Typography>
                <Typography variant="body2" color="text.secondary">{inspected.summary}</Typography>
                {inspected.solution && <Typography variant="body2" mt={0.5}><b>Solution:</b> {inspected.solution}</Typography>}
              </Box>
            )}

            <Stack direction="row" alignItems="center" spacing={2} mt={1.5}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={allow}
                  onChange={ev => { setAllow(ev.target.checked); if (ev.target.checked) setUpdateId(undefined); }} />
                Save as separate occurrence anyway
              </label>
              {updateId && (
                <Button size="small" variant="text" onClick={() => setUpdateId(undefined)}>
                  Clear update target
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Entry forms — one per proposed entry */}
      {drafts.map((e, i) => {
        const schema = getFieldSchema(e.entryType);

        return (
          <Card key={e.id} variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 3 }}>
              {/* Header row: title + editable entry type */}
              <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }}
                justifyContent="space-between" spacing={1.5} mb={2}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="h6">
                    {drafts.length === 1 ? "Review entry" : `Entry ${i + 1}`}
                  </Typography>
                  <Tooltip title="Changing the type updates which fields are shown and how the entry is indexed">
                    <InfoOutlinedIcon sx={{ fontSize: 15, color: "text.disabled" }} />
                  </Tooltip>
                </Stack>

                {/* Editable type selector — the main fix */}
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Entry type</InputLabel>
                  <Select
                    value={e.entryType}
                    label="Entry type"
                    onChange={x => update(i, "entryType", x.target.value as EntryType)}
                  >
                    {TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </Select>
                </FormControl>
              </Stack>

              {/* Title — always shown */}
              <TextField
                fullWidth size="small" label="Title" value={e.title}
                onChange={x => update(i, "title", x.target.value)}
                sx={{ mb: 2 }}
              />

              {/* Entry-type-aware field grid */}
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
                {schema
                  .filter(f => f.alwaysShow || !!(e as Record<string, unknown>)[f.key])
                  .map(f => (
                    <TextField
                      key={f.key}
                      label={f.label}
                      multiline
                      minRows={f.rows ?? 2}
                      fullWidth
                      size="small"
                      value={(e as Record<string, unknown>)[f.key] as string ?? ""}
                      onChange={x => update(i, f.key as keyof KnowledgeEntry, x.target.value)}
                      sx={f.wide ? { gridColumn: "1 / -1" } : {}}
                    />
                  ))
                }
              </Box>

              {/* Show any AI-filled fields not in the schema (so nothing is lost) */}
              {(["problem","rootCause","solution","prevention","detailedContent"] as const)
                .filter(k => {
                  const inSchema = schema.some(f => f.key === k);
                  const hasValue = !!(e as Record<string, unknown>)[k];
                  return !inSchema && hasValue;
                })
                .length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                      Additional fields filled by AI
                    </Typography>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
                      {(["problem","rootCause","solution","prevention","detailedContent"] as const)
                        .filter(k => !schema.some(f => f.key === k) && !!(e as Record<string, unknown>)[k])
                        .map(k => (
                          <TextField key={k} label={k} multiline minRows={2} fullWidth size="small"
                            value={(e as Record<string, unknown>)[k] as string ?? ""}
                            onChange={x => update(i, k, x.target.value)}
                            sx={{ gridColumn: "1 / -1" }}
                          />
                        ))
                      }
                    </Box>
                  </Box>
                )
              }

              <Divider sx={{ my: 2 }} />

              <Button
                variant="contained" startIcon={<SaveIcon />}
                disabled={saved.includes(updateId ?? e.id) || save.isPending ||
                  (dups.length > 0 && !allow && !updateId)}
                onClick={() => save.mutate(e)}
                sx={{ bgcolor: "#345f54", "&:hover": { bgcolor: "#2b4f46" }, fontWeight: 700 }}
              >
                {saved.includes(updateId ?? e.id)
                  ? "Saved ✓"
                  : updateId ? "Update existing entry" : "Save knowledge"}
              </Button>
              {save.error && <Alert severity="error" sx={{ mt: 1 }}>{save.error.message}</Alert>}
            </CardContent>
          </Card>
        );
      })}

      <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
        <Button variant="text" onClick={onDone}>
          {saved.length > 0 ? "Done" : "← Back to description"}
        </Button>
      </Box>
    </Box>
  );
}
