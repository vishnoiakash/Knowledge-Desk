import { useNavigate } from "react-router-dom";
import {
  Alert, Box, Button, Card, CardActionArea, CardContent,
  Chip, CircularProgress, Divider, Stack, Typography, alpha,
} from "@mui/material";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import CollectionsBookmarkIcon from "@mui/icons-material/CollectionsBookmark";
import SyncIcon from "@mui/icons-material/Sync";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useQuery } from "@tanstack/react-query";
import { knowledgeApi, questionsApi, adminApi } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

interface MetricsResponse {
  jobs: { status: string; count: number }[];
  memory: { jobsQueued: number; jobsCompleted: number; jobsFailed: number; indexedEntries: number };
}

const TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Issue:           { bg: "#fff1f0", text: "#c0392b", dot: "#e74c3c" },
  Troubleshooting: { bg: "#fff8ec", text: "#a05c1a", dot: "#f39c12" },
  HowTo:           { bg: "#edf7f0", text: "#1a7a46", dot: "#27ae60" },
  Workflow:        { bg: "#eaf3ef", text: "#1e6652", dot: "#2ecc71" },
  Knowledge:       { bg: "#eef5ff", text: "#1a4a8a", dot: "#3498db" },
  Decision:        { bg: "#f3eeff", text: "#5b2da0", dot: "#9b59b6" },
  KnownLimitation: { bg: "#fef5ec", text: "#8a4a1a", dot: "#e67e22" },
};

function TypeDot({ type }: { type: string }) {
  const c = TYPE_COLORS[type] ?? { bg: "#eef3f0", text: "#345f54", dot: "#345f54" };
  return (
    <Box sx={{
      display: "inline-flex", alignItems: "center", gap: 0.6,
      bgcolor: c.bg, color: c.text, borderRadius: 1,
      px: 0.75, py: 0.2, fontSize: 10.5, fontWeight: 700, lineHeight: 1.6, flexShrink: 0,
    }}>
      <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: c.dot, flexShrink: 0 }} />
      {type}
    </Box>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const entries   = useQuery({ queryKey: ["knowledge", {}], queryFn: () => knowledgeApi.list({ pageSize: 6, sort: "updatedDesc" }), staleTime: 60_000 });
  const questions = useQuery({ queryKey: ["questions", "open"], queryFn: () => questionsApi.list(false), staleTime: 30_000 });
  const metrics   = useQuery<MetricsResponse>({ queryKey: ["metrics"], queryFn: adminApi.metrics as () => Promise<MetricsResponse>, staleTime: 60_000 });

  const totalEntries  = entries.data?.totalCount ?? 0;
  const openQuestions = questions.data?.length ?? 0;
  const myQuestions   = questions.data?.filter(q =>
    !q.isResolved && (q.raisedBy === user?.username || q.targetUsernames.includes(user?.username ?? ""))
  ).length ?? 0;

  const indexingActive = metrics.isLoading
    ? null
    : (metrics.data?.jobs ?? []).filter(j => j.status === "Pending" || j.status === "Processing").reduce((s, j) => s + j.count, 0);

  const allOpen = questions.data?.filter(q => !q.isResolved) ?? [];
  const forMe   = allOpen.filter(q => q.raisedBy === user?.username || q.targetUsernames.includes(user?.username ?? ""));
  const hour    = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>

      {/* Header */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="overline">Dashboard</Typography>
        <Typography variant="h4" sx={{ mt: 0.25, mb: 0.5 }}>
          {greeting}, {user?.displayName?.split(" ")[0] ?? user?.username} 👋
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Your team's engineering knowledge — captured, indexed, and searchable.
        </Typography>
      </Box>

      {/* Stats — 4 equal cards, fixed dimensions */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2, mb: 2.5 }}>
        {([
          { label: "Knowledge entries", value: entries.isLoading   ? null : totalEntries,  icon: <CollectionsBookmarkIcon sx={{ fontSize: 18 }} />, color: "#1e4d42", bg: "#e8f3ef", path: "/library",   sub: "Total indexed" },
          { label: "Open questions",    value: questions.isLoading ? null : openQuestions, icon: <HelpOutlineOutlinedIcon sx={{ fontSize: 18 }} />, color: "#1a4a8a", bg: "#eef5ff", path: "/questions", sub: myQuestions > 0 ? `${myQuestions} for you` : "None for you" },
          { label: "For you",           value: questions.isLoading ? null : myQuestions,   icon: <HelpOutlineOutlinedIcon sx={{ fontSize: 18 }} />, color: myQuestions > 0 ? "#8a1a1a" : "#1e4d42", bg: myQuestions > 0 ? "#fff1f0" : "#e8f3ef", path: "/questions", sub: myQuestions > 0 ? "Needs attention" : "All clear" },
          { label: "Indexing queue",    value: indexingActive, icon: <SyncIcon sx={{ fontSize: 18, animation: (indexingActive ?? 0) > 0 ? "spin 2s linear infinite" : "none", "@keyframes spin": { "100%": { transform: "rotate(360deg)" } } }} />, color: "#1e4d42", bg: "#e8f3ef", path: null, sub: indexingActive === 0 ? "Queue empty" : "Processing…" },
        ] as const).map(({ label, value, icon, color, bg, path, sub }) => (
          <Card
            key={label}
            sx={{ cursor: path ? "pointer" : "default",
              "&:hover": path ? { borderColor: color, boxShadow: `0 2px 10px ${alpha(color, 0.1)}` } : {} }}
            onClick={() => path && navigate(path)}
          >
            <Box sx={{ p: 2, height: 108, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box sx={{ bgcolor: bg, borderRadius: 1.5, width: 32, height: 32,
                  display: "flex", alignItems: "center", justifyContent: "center", color }}>
                  {icon}
                </Box>
                {path && <ArrowForwardIcon sx={{ fontSize: 12, color: "text.disabled" }} />}
              </Box>
              <Box>
                <Typography sx={{ fontSize: 24, fontFamily: "Georgia,serif", fontWeight: 600, color, lineHeight: 1, mb: 0.3 }}>
                  {value === null ? <CircularProgress size={18} thickness={3} sx={{ color }} /> : value}
                </Typography>
                <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: "text.secondary", lineHeight: 1.3 }}>{label}</Typography>
                <Typography sx={{ fontSize: 10.5, color: "text.disabled", lineHeight: 1.3 }}>{sub}</Typography>
              </Box>
            </Box>
          </Card>
        ))}
      </Box>

      {/* Two-column body — same CSS Grid system as stats row for perfect alignment */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "7fr 5fr" }, gap: 2, alignItems: "flex-start" }}>

        {/* Left — recent entries */}
        <Box>
          <Card>
            <CardContent sx={{ p: 0 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 2.5, height: 52 }}>
                <Typography variant="subtitle1">Recent knowledge</Typography>
                <Button size="small" endIcon={<ArrowForwardIcon sx={{ fontSize: 12 }} />}
                  onClick={() => navigate("/library")} sx={{ color: "text.secondary", fontSize: 12 }}>
                  View all
                </Button>
              </Box>
              <Divider />

              {entries.isLoading && <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress size={22} /></Box>}
              {entries.error   && <Alert severity="error" sx={{ m: 2 }}>Could not load entries.</Alert>}

              {entries.data?.items.map((e, idx) => (
                <Box key={e.id} onClick={() => navigate(`/library/${e.id}`)} sx={{
                  display: "flex", alignItems: "center", gap: 1.5, px: 2.5, height: 56,
                  borderBottom: idx < (entries.data.items.length - 1) ? "1px solid" : "none",
                  borderColor: "divider", cursor: "pointer",
                  "&:hover": { bgcolor: alpha("#1e4d42", 0.03) },
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={0.75} alignItems="center" mb={0.3}>
                      <TypeDot type={e.entryType} />
                      {e.project && <Typography sx={{ fontSize: 11, color: "text.disabled" }}>{e.project}</Typography>}
                    </Stack>
                    <Typography variant="body2" fontWeight={600} noWrap>{e.title}</Typography>
                  </Box>
                  <Typography sx={{ fontSize: 11, color: "text.disabled", flexShrink: 0 }}>
                    {new Date(e.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </Typography>
                  <ArrowForwardIcon sx={{ fontSize: 12, color: "text.disabled", flexShrink: 0 }} />
                </Box>
              ))}

              {entries.data?.totalCount === 0 && (
                <Box sx={{ textAlign: "center", py: 5 }}>
                  <CollectionsBookmarkIcon sx={{ fontSize: 34, color: "text.disabled", mb: 1 }} />
                  <Typography variant="body2" color="text.secondary" gutterBottom>No knowledge captured yet.</Typography>
                  <Button variant="contained" size="small" onClick={() => navigate("/capture")}
                    sx={{ mt: 1, bgcolor: "#1e4d42", "&:hover": { bgcolor: "#173d34" } }}>
                    Log the first entry
                  </Button>
                </Box>
              )}

              {(entries.data?.totalCount ?? 0) > 6 && (
                <Box sx={{ height: 38, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                    Showing 6 of {entries.data?.totalCount} entries
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* Right — actions + questions */}
        <Box>
          <Stack spacing={2}>

            {/* Quick actions */}
            <Card>
              <CardContent sx={{ p: 0 }}>
                <Box sx={{ px: 2.5, height: 52, display: "flex", alignItems: "center" }}>
                  <Typography variant="subtitle1">Quick actions</Typography>
                </Box>
                <Divider />
                {([
                  { label: "Capture knowledge", desc: "Log a bug fix, decision, or how-to", icon: <DriveFileRenameOutlineIcon sx={{ fontSize: 17 }} />, color: "#1e4d42", bg: "#e8f3ef", path: "/capture" },
                  { label: "Ask the assistant", desc: "Grounded answers from your team's knowledge", icon: <AutoAwesomeIcon sx={{ fontSize: 17 }} />, color: "#1a4a8a", bg: "#eef5ff", path: "/assistant" },
                  { label: "Raise a question",  desc: "Ask the team or a specific colleague", icon: <HelpOutlineOutlinedIcon sx={{ fontSize: 17 }} />, color: "#5b2da0", bg: "#f3eeff", path: "/questions" },
                ] as const).map(({ label, desc, icon, color, bg, path }, i, arr) => (
                  <CardActionArea key={path} onClick={() => navigate(path)} sx={{
                    display: "flex", alignItems: "center", gap: 1.5, px: 2.5, height: 56,
                    borderBottom: i < arr.length - 1 ? "1px solid" : "none",
                    borderColor: "divider", justifyContent: "flex-start",
                  }}>
                    <Box sx={{ bgcolor: bg, color, borderRadius: 1.5, width: 32, height: 32,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {icon}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{label}</Typography>
                      <Typography sx={{ fontSize: 11.5, color: "text.secondary", lineHeight: 1.25 }}>{desc}</Typography>
                    </Box>
                    <ArrowForwardIcon sx={{ fontSize: 12, color: "text.disabled", flexShrink: 0 }} />
                  </CardActionArea>
                ))}
              </CardContent>
            </Card>

            {/* Open questions */}
            {allOpen.length > 0 && (
              <Card sx={{ borderColor: myQuestions > 0 ? "#1e4d42" : "divider" }}>
                <CardContent sx={{ p: 0 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 2.5, height: 52 }}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ lineHeight: 1.2 }}>Open questions</Typography>
                      {myQuestions > 0 && (
                        <Typography sx={{ fontSize: 11, color: "#c0392b", fontWeight: 600 }}>
                          {myQuestions} need{myQuestions === 1 ? "s" : ""} your attention
                        </Typography>
                      )}
                    </Box>
                    <Button size="small" endIcon={<ArrowForwardIcon sx={{ fontSize: 12 }} />}
                      onClick={() => navigate("/questions")} sx={{ color: "text.secondary", fontSize: 12 }}>
                      All
                    </Button>
                  </Box>
                  <Divider />
                  {[...forMe, ...allOpen.filter(q => q.raisedBy !== user?.username && !q.targetUsernames.includes(user?.username ?? ""))]
                    .slice(0, 4).map((q, i, arr) => {
                      const mine = q.raisedBy === user?.username || q.targetUsernames.includes(user?.username ?? "");
                      return (
                        <Box key={q.id} onClick={() => navigate("/questions")} sx={{
                          display: "flex", alignItems: "center", gap: 1.5, px: 2.5, height: 50,
                          borderBottom: i < arr.length - 1 ? "1px solid" : "none",
                          borderColor: "divider", cursor: "pointer",
                          bgcolor: mine ? alpha("#1e4d42", 0.025) : "transparent",
                          "&:hover": { bgcolor: alpha("#1e4d42", 0.05) },
                        }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 500 }} noWrap>{q.text}</Typography>
                            <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                              {q.raisedBy}{q.answers.length > 0 && ` · ${q.answers.length} answer${q.answers.length !== 1 ? "s" : ""}`}
                            </Typography>
                          </Box>
                          {mine && (
                            <Chip label="For you" size="small" sx={{ height: 17, fontSize: 10,
                              bgcolor: "#fff1f0", color: "#c0392b", fontWeight: 700,
                              border: "1px solid #ffd5d0", flexShrink: 0 }} />
                          )}
                        </Box>
                      );
                    })}
                  {allOpen.length > 4 && (
                    <Box sx={{ height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Typography sx={{ fontSize: 11, color: "text.disabled" }}>+{allOpen.length - 4} more</Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Empty questions state */}
            {!questions.isLoading && allOpen.length === 0 && (
              <Card>
                <CardContent sx={{ p: 2.5, textAlign: "center" }}>
                  <HelpOutlineOutlinedIcon sx={{ fontSize: 30, color: "text.disabled", mb: 0.5 }} />
                  <Typography variant="body2" color="text.secondary">No open questions right now.</Typography>
                  <Button size="small" onClick={() => navigate("/questions")} sx={{ color: "text.secondary", mt: 0.5 }}>
                    Raise one →
                  </Button>
                </CardContent>
              </Card>
            )}

          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
