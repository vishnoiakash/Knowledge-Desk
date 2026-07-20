import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AppBar, Box, Collapse, Divider, Drawer,
  IconButton, Toolbar, Tooltip, Typography, Avatar, CircularProgress, Badge,
} from "@mui/material";
import MenuIcon              from "@mui/icons-material/Menu";
import GridViewRoundedIcon   from "@mui/icons-material/GridViewRounded";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import CollectionsBookmarkIcon from "@mui/icons-material/CollectionsBookmark";
import AutoAwesomeIcon       from "@mui/icons-material/AutoAwesome";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import HistoryIcon           from "@mui/icons-material/History";
import LogoutIcon            from "@mui/icons-material/Logout";
import ExpandLessIcon        from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon        from "@mui/icons-material/ExpandMore";
import ChatIcon              from "@mui/icons-material/Chat";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import { useQuery }          from "@tanstack/react-query";
import { useAuth }           from "../contexts/AuthContext";
import { chatHistoryApi, questionsApi } from "../services/api";

const W     = 240;
const BRAND = "#1e4d42";
const ADMIN = import.meta.env.VITE_ADMIN_USERNAME as string | undefined;

const NAV = [
  { label: "Dashboard", icon: <GridViewRoundedIcon    sx={{ fontSize: 17 }} />, path: "/" },
  { label: "Capture",   icon: <DriveFileRenameOutlineIcon sx={{ fontSize: 17 }} />, path: "/capture" },
  { label: "Library",   icon: <CollectionsBookmarkIcon sx={{ fontSize: 17 }} />, path: "/library" },
  { label: "Assistant", icon: <AutoAwesomeIcon        sx={{ fontSize: 17 }} />, path: "/assistant" },
  { label: "Questions", icon: <HelpOutlineOutlinedIcon sx={{ fontSize: 17 }} />, path: "/questions" },
];

/** Plain nav item — no MUI ListItemButton so no hidden min-height */
function NavItem({
  icon, label, active, badge, onClick, to,
}: {
  icon: React.ReactNode; label: string; active: boolean;
  badge?: number; onClick?: () => void; to: string;
}) {
  return (
    <Box
      component={Link}
      to={to}
      onClick={onClick}
      sx={{
        display: "flex", alignItems: "center", gap: 1.25,
        px: 1.25, height: 34, borderRadius: 1.5,
        color: active ? "#fff" : "#9ac5b5",
        bgcolor: active ? "rgba(255,255,255,.12)" : "transparent",
        textDecoration: "none",
        cursor: "pointer",
        transition: "background .1s, color .1s",
        "&:hover": { bgcolor: active ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.07)", color: "#fff" },
        flexShrink: 0,
      }}
    >
      <Box sx={{ width: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {badge ? (
          <Badge badgeContent={badge} color="error"
            sx={{ "& .MuiBadge-badge": { fontSize: 9, minWidth: 14, height: 14, padding: 0 } }}>
            {icon}
          </Badge>
        ) : icon}
      </Box>
      <Typography sx={{ fontSize: 13, fontWeight: active ? 600 : 400, color: "inherit", lineHeight: 1 }}>
        {label}
      </Typography>
      {active && (
        <Box sx={{ ml: "auto", width: 4, height: 4, borderRadius: "50%", bgcolor: "#e8a48e", flexShrink: 0 }} />
      )}
    </Box>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout }  = useAuth();
  const location          = useLocation();
  const navigate          = useNavigate();
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const history = useQuery({
    queryKey: ["chatHistory"],
    queryFn:  chatHistoryApi.list,
    enabled:  historyOpen,
    staleTime: 30_000,
  });

  const questions = useQuery({
    queryKey: ["questions", "open"],
    queryFn:  () => questionsApi.list(false),
    staleTime: 60_000,
  });
  const forMeCount = questions.data?.filter(
    q => !q.isResolved && (q.raisedBy === user?.username || q.targetUsernames.includes(user?.username ?? ""))
  ).length ?? 0;

  const initials = (user?.displayName ?? user?.username ?? "?")
    .split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const close = () => setMobileOpen(false);

  const drawerContent = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: BRAND }}>

      {/* Brand */}
      <Box sx={{ px: 2, pt: 2.5, pb: 1.75, display: "flex", alignItems: "center", gap: 1.25 }}>
        <Box sx={{
          width: 34, height: 34, borderRadius: 2, flexShrink: 0,
          background: "linear-gradient(135deg,#e8a48e,#d4856a)",
          display: "grid", placeItems: "center",
          boxShadow: "0 2px 6px rgba(0,0,0,.22)",
        }}>
          <Typography sx={{ color: BRAND, fontFamily: "Georgia", fontWeight: 800, fontSize: 17, lineHeight: 1 }}>K</Typography>
        </Box>
        <Box>
          <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 13.5, lineHeight: 1.2 }}>
            Knowledge Desk
          </Typography>
          <Typography sx={{ color: "#6aaa95", fontSize: 10.5, mt: 0.2 }}>
            Engineering intelligence
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ borderColor: "rgba(255,255,255,.08)" }} />

      {/* Nav */}
      <Box sx={{ px: 1.5, pt: 1.25, flex: 1, display: "flex", flexDirection: "column", gap: 0.25, overflow: "hidden auto" }}>

        <Typography sx={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em",
          color: "#4d8070", px: 1, pb: 0.5, pt: 0.25, textTransform: "uppercase" }}>
          Workspace
        </Typography>

        {NAV.map(({ label, icon, path }) => (
          <NavItem key={path} to={path} icon={icon} label={label}
            active={isActive(path)}
            badge={label === "Questions" ? forMeCount || undefined : undefined}
            onClick={close}
          />
        ))}

        {ADMIN && user?.username === ADMIN && (
          <NavItem to="/admin" icon={<AdminPanelSettingsIcon sx={{ fontSize: 17 }} />}
            label="Admin" active={isActive("/admin")} onClick={close} />
        )}

        {/* History */}
        <Box sx={{ mt: 1.25 }}>
          <Divider sx={{ borderColor: "rgba(255,255,255,.07)", mb: 1 }} />
          <Typography sx={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em",
            color: "#4d8070", px: 1, pb: 0.5, textTransform: "uppercase" }}>
            History
          </Typography>

          {/* Chat history toggle */}
          <Box
            onClick={() => setHistoryOpen(o => !o)}
            sx={{
              display: "flex", alignItems: "center", gap: 1.25,
              px: 1.25, height: 34, borderRadius: 1.5,
              color: "#9ac5b5", cursor: "pointer",
              "&:hover": { bgcolor: "rgba(255,255,255,.07)", color: "#fff" },
            }}
          >
            <Box sx={{ width: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <HistoryIcon sx={{ fontSize: 17 }} />
            </Box>
            <Typography sx={{ fontSize: 13, flex: 1, color: "inherit", lineHeight: 1 }}>Chat history</Typography>
            {historyOpen
              ? <ExpandLessIcon sx={{ fontSize: 14, color: "#4d8070" }} />
              : <ExpandMoreIcon sx={{ fontSize: 14, color: "#4d8070" }} />}
          </Box>

          <Collapse in={historyOpen}>
            <Box sx={{ pl: 0.5, mt: 0.25, display: "flex", flexDirection: "column", gap: 0.25 }}>
              {history.isLoading && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, height: 28 }}>
                  <CircularProgress size={11} sx={{ color: "#4d8070" }} />
                  <Typography sx={{ fontSize: 11.5, color: "#4d8070" }}>Loading…</Typography>
                </Box>
              )}
              {history.data?.length === 0 && (
                <Typography sx={{ fontSize: 11.5, color: "#4d8070", px: 1.5, height: 28,
                  display: "flex", alignItems: "center", fontStyle: "italic" }}>
                  No conversations yet
                </Typography>
              )}
              {history.data?.map(s => (
                <Tooltip key={s.sessionId} title={new Date(s.lastActivityAt).toLocaleString()} placement="right">
                  <Box
                    onClick={() => { navigate("/assistant", { state: { sessionId: s.sessionId } }); close(); }}
                    sx={{
                      display: "flex", alignItems: "center", gap: 1, px: 1.25, height: 28,
                      borderRadius: 1.5, color: "#7aaa99", cursor: "pointer",
                      "&:hover": { bgcolor: "rgba(255,255,255,.06)", color: "#c8e0da" },
                    }}
                  >
                    <ChatIcon sx={{ fontSize: 12, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 11.5, flex: 1, minWidth: 0, color: "inherit",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1 }}>
                      {s.firstQuestion}
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: "#4d8070", flexShrink: 0 }}>
                      {Math.floor(s.turnCount / 2)}t
                    </Typography>
                  </Box>
                </Tooltip>
              ))}
            </Box>
          </Collapse>
        </Box>
      </Box>

      {/* Footer */}
      <Divider sx={{ borderColor: "rgba(255,255,255,.08)" }} />
      <Box sx={{ px: 1.75, py: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
        <Avatar sx={{
          width: 30, height: 30, flexShrink: 0,
          background: "linear-gradient(135deg,#e9a88f,#d4856a)",
          color: BRAND, fontSize: 10.5, fontWeight: 800,
        }}>
          {initials}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ color: "#e8f3ef", fontSize: 12, fontWeight: 600, lineHeight: 1.2 }} noWrap>
            {user?.displayName ?? user?.username}
          </Typography>
          <Typography sx={{ color: "#4d8070", fontSize: 10.5, lineHeight: 1.2 }} noWrap>
            {user?.email ?? user?.username}
          </Typography>
        </Box>
        <Tooltip title="Sign out" placement="right">
          <IconButton size="small" onClick={() => { logout(); navigate("/login"); }}
            sx={{ color: "#4d8070", p: 0.5, "&:hover": { color: "#fff", bgcolor: "rgba(255,255,255,.08)" } }}>
            <LogoutIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* Mobile AppBar */}
      <AppBar position="fixed" elevation={0}
        sx={{ display: { md: "none" }, bgcolor: BRAND, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <Toolbar sx={{ minHeight: 52 }}>
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(o => !o)} sx={{ mr: 1.5 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="subtitle1" fontWeight={700}>Knowledge Desk</Typography>
        </Toolbar>
      </AppBar>

      {/* Desktop drawer */}
      <Drawer variant="permanent"
        sx={{ display: { xs: "none", md: "block" }, width: W, flexShrink: 0,
          "& .MuiDrawer-paper": { width: W, boxSizing: "border-box", border: "none",
            boxShadow: "1px 0 8px rgba(18,46,40,.15)" } }}
        open>
        {drawerContent}
      </Drawer>

      {/* Mobile drawer */}
      <Drawer variant="temporary" open={mobileOpen} onClose={close}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { width: W, border: "none" } }}>
        {drawerContent}
      </Drawer>

      {/* Main */}
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, mt: { xs: "52px", md: 0 }, bgcolor: "background.default" }}>
        {children}
      </Box>
    </Box>
  );
}
