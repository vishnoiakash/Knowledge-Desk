import { useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Stack, Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import CloseIcon from "@mui/icons-material/Close";
import { useMutation } from "@tanstack/react-query";
import { captureApi, type AnalysisResult, type EntryType } from "../services/api";

const ACCEPTED = ".pdf,.docx,.md,.txt,.markdown";
const ACCEPTED_LABEL = "PDF, DOCX, Markdown, TXT";
const MAX_MB = 20;

interface Props {
  entryType: EntryType;
  project?: string;
  module?: string;
  onResult: (result: AnalysisResult, fileName: string, chunksAnalysed: number) => void;
}

export default function DocumentUploadZone({ entryType, project, module, onResult }: Props) {
  const inputRef              = useRef<HTMLInputElement>(null);
  const [file, setFile]       = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const upload = useMutation({
    mutationFn: (f: File) => captureApi.uploadDocument(f, entryType, project, module),
    onSuccess: (data) => onResult(data.result, data.fileName, data.chunksAnalysed),
  });

  function pickFile(f: File) {
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    const allowed = [".pdf", ".docx", ".md", ".txt", ".markdown"];
    if (!allowed.includes(ext)) {
      upload.reset();
      alert(`Unsupported file type "${ext}". Please upload a ${ACCEPTED_LABEL} file.`);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      alert(`File exceeds the ${MAX_MB} MB limit.`);
      return;
    }
    setFile(f);
    upload.reset();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) pickFile(dropped);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (picked) pickFile(picked);
    e.target.value = "";   // reset so the same file can be re-picked after removal
  }

  function removeFile() {
    setFile(null);
    upload.reset();
  }

  const busy = upload.isPending;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Drop zone */}
      <Box
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !file && inputRef.current?.click()}
        sx={{
          border: "2px dashed",
          borderColor: dragging ? "#345f54" : file ? "#345f54" : "#c8d5cf",
          borderRadius: 3,
          bgcolor: dragging ? "#eef7f3" : file ? "#f5fbf8" : "#fafbf9",
          p: 4,
          textAlign: "center",
          cursor: file ? "default" : "pointer",
          transition: "all .15s",
          "&:hover": file ? {} : { borderColor: "#345f54", bgcolor: "#eef7f3" },
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          style={{ display: "none" }}
          onChange={handleInputChange}
        />

        {!file ? (
          <Stack alignItems="center" spacing={1.5}>
            <UploadFileIcon sx={{ fontSize: 48, color: "#8aada4" }} />
            <Typography variant="subtitle2" fontWeight={600}>
              Drop a document here, or click to browse
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {ACCEPTED_LABEL} · max {MAX_MB} MB
            </Typography>
          </Stack>
        ) : (
          <Stack direction="row" alignItems="center" spacing={1.5} justifyContent="center">
            <InsertDriveFileIcon sx={{ color: "#345f54", fontSize: 32 }} />
            <Box sx={{ textAlign: "left" }}>
              <Typography variant="body2" fontWeight={600}>{file.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {(file.size / 1024).toFixed(0)} KB
              </Typography>
            </Box>
            {!busy && (
              <Button
                size="small" variant="text" color="error"
                onClick={e => { e.stopPropagation(); removeFile(); }}
                sx={{ minWidth: 0, p: 0.5, ml: "auto" }}
              >
                <CloseIcon fontSize="small" />
              </Button>
            )}
          </Stack>
        )}
      </Box>

      {/* Error */}
      {upload.error && (
        <Alert severity="error" onClose={() => upload.reset()}>
          {(upload.error as Error).message}
        </Alert>
      )}

      {/* Extract & analyse button */}
      {file && !upload.isSuccess && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5 }}>
          {busy && (
            <Stack direction="row" alignItems="center" spacing={1}>
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">
                Extracting text and analysing…
              </Typography>
            </Stack>
          )}
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => upload.mutate(file)}
            color="primary"
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <UploadFileIcon />}
          >
            {busy ? "Analysing…" : "Extract & analyse"}
          </Button>
        </Box>
      )}

      {/* Success summary */}
      {upload.isSuccess && upload.data && (
        <Alert severity="success" icon={false}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="body2">
              <strong>{upload.data.fileName}</strong> — extracted{" "}
              {upload.data.chunksExtracted} chunk{upload.data.chunksExtracted !== 1 ? "s" : ""},
              analysed {upload.data.chunksAnalysed}.
            </Typography>
            <Chip
              label={`${upload.data.result.suggestedEntries?.length || 1} entr${(upload.data.result.suggestedEntries?.length || 1) !== 1 ? "ies" : "y"} proposed`}
              size="small"
              color="success"
              variant="outlined"
            />
          </Stack>
        </Alert>
      )}
    </Box>
  );
}
