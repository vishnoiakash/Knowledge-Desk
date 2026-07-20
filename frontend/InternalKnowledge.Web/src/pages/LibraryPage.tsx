import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Button, Card, Chip, CircularProgress, FormControl, InputLabel,
  MenuItem, Pagination, Select, Stack, TextField, Typography, FormControlLabel, Switch,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useQuery } from "@tanstack/react-query";
import { knowledgeApi, type EntryType, type ListQuery, type Status } from "../services/api";

const TYPES: EntryType[] = ["Issue","Workflow","Knowledge","Troubleshooting","HowTo","Decision","KnownLimitation"];
const STATUSES: Status[] = ["Active","Draft","NeedsReview","Archived"];

const STATUS_COLOR: Record<string, "default"|"success"|"warning"|"error"> = {
  Active: "success", Draft: "default", NeedsReview: "warning", Archived: "error",
};

export default function LibraryPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState<ListQuery>({ page: 1, pageSize: 20, sort: "updatedDesc" });

  const { data, isLoading, error } = useQuery({
    queryKey: ["knowledge", q],
    queryFn:  () => knowledgeApi.list(q),
    placeholderData: prev => prev,
  });

  const set = (key: keyof ListQuery, value: unknown) =>
    setQ(prev => ({ ...prev, [key]: value, page: 1 }));

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", mb: 3 }}>
        <Box>
          <Typography variant="overline" color="text.secondary">Library</Typography>
          <Typography variant="h4" fontFamily="Georgia" fontWeight={600}>Knowledge base</Typography>
        </Box>
        <Button variant="contained" onClick={() => navigate("/capture")}
          sx={{ bgcolor: "#345f54", "&:hover": { bgcolor: "#2b4f46" }, fontWeight: 700 }}>
          + Log knowledge
        </Button>
      </Box>

      {/* Filters */}
      <Card variant="outlined" sx={{ mb: 3, borderRadius: 2 }}>
        <Box sx={{ p: 2, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr 1fr 1fr 1fr" }, gap: 1.5, alignItems: "center" }}>
          <TextField size="small" placeholder="Search…" value={q.query ?? ""}
            onChange={e => set("query", e.target.value)}
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: "text.secondary", fontSize: 18 }} /> }} />

          <FormControl size="small">
            <InputLabel>Type</InputLabel>
            <Select value={q.entryType ?? ""} label="Type" onChange={e => set("entryType", e.target.value)}>
              <MenuItem value="">All types</MenuItem>
              {TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl size="small">
            <InputLabel>Status</InputLabel>
            <Select value={q.status ?? ""} label="Status" onChange={e => set("status", e.target.value)}>
              <MenuItem value="">All statuses</MenuItem>
              {STATUSES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </Select>
          </FormControl>

          <TextField size="small" placeholder="Project" value={q.project ?? ""}
            onChange={e => set("project", e.target.value)} />

          <TextField size="small" placeholder="Technology" value={q.technology ?? ""}
            onChange={e => set("technology", e.target.value)} />

          <FormControlLabel sx={{ gridColumn: { xs: "auto", sm: "span 5" }, m: 0, width: "fit-content" }}
            control={<Switch size="small" checked={q.includeArchived ?? false}
              onChange={e => set("includeArchived", e.target.checked)} />}
            label={<Typography variant="caption">Include archived</Typography>} />
        </Box>
      </Card>

      {/* Results */}
      {isLoading && <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>}
      {error    && <Box sx={{ color: "error.main", py: 2 }}>{error.message}</Box>}

      <Stack spacing={1.5}>
        {data?.items.map(e => (
          <Card key={e.id} variant="outlined" sx={{ borderRadius: 2, cursor: "pointer",
            "&:hover": { borderColor: "#345f54", boxShadow: "0 2px 8px rgba(52,95,84,.12)" },
            transition: "all .15s" }}
            onClick={() => navigate(`/library/${e.id}`)}>
            <CardRow
              type={e.entryType} status={e.status as Status}
              title={e.title} summary={e.summary}
              project={e.project} updatedAt={e.updatedAt}
              tags={e.tags ?? []}
            />
          </Card>
        ))}
      </Stack>

      {data?.totalCount === 0 && (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="h6" color="text.secondary">No entries found</Typography>
          <Button sx={{ mt: 2 }} onClick={() => navigate("/capture")}>Log the first one →</Button>
        </Box>
      )}

      {(data?.totalPages ?? 1) > 1 && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
          <Pagination
            count={data?.totalPages ?? 1} page={data?.page ?? 1}
            onChange={(_, p) => setQ(prev => ({ ...prev, page: p }))}
            color="primary" />
        </Box>
      )}
    </Box>
  );
}

function CardRow({ type, status, title, summary, project, updatedAt, tags }: {
  type: string; status: Status; title: string; summary: string;
  project?: string; updatedAt: string; tags: string[];
}) {
  return (
    <Box sx={{ p: 2, display: "flex", gap: 2, alignItems: "flex-start" }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" mb={0.5} flexWrap="wrap">
          <Chip label={type} size="small" sx={{ bgcolor: "#eef3f0", fontSize: 10, fontWeight: 700 }} />
          <Chip label={status} size="small" color={STATUS_COLOR[status]} variant="outlined" sx={{ fontSize: 10 }} />
          {tags.slice(0, 3).map(t => <Chip key={t} label={t} size="small" variant="outlined" sx={{ fontSize: 10 }} />)}
        </Stack>
        <Typography variant="subtitle2" fontWeight={600} noWrap>{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{summary}</Typography>
        <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
          {project ?? "Unassigned"} · Updated {new Date(updatedAt).toLocaleDateString()}
        </Typography>
      </Box>
    </Box>
  );
}
