import React from "react";
import ReactDOM from "react-dom/client";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CssBaseline, ThemeProvider, createTheme, CircularProgress, Box, alpha } from "@mui/material";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Layout          from "./components/Layout";
import LoginPage       from "./pages/LoginPage";
import DashboardPage   from "./pages/DashboardPage";
import CapturePage     from "./pages/CapturePage";
import LibraryPage     from "./pages/LibraryPage";
import EntryDetailPage from "./pages/EntryDetailPage";
import AssistantPage   from "./pages/AssistantPage";
import QuestionsPage   from "./pages/QuestionsPage";
import AdminPage       from "./pages/AdminPage";

import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const BRAND   = "#1e4d42";
const BRAND_L = "#2d6b5c";
const CORAL   = "#e8795f";

const theme = createTheme({
  palette: {
    primary:    { main: BRAND, light: BRAND_L, dark: "#173d34" },
    secondary:  { main: CORAL },
    background: { default: "#f4f6f4", paper: "#ffffff" },
    text: {
      primary:   "#161f1d",
      secondary: "#5a6b65",
    },
    divider: "#e0e8e4",
  },
  typography: {
    fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
    h1: { fontFamily: "Georgia, serif", fontWeight: 600 },
    h2: { fontFamily: "Georgia, serif", fontWeight: 600 },
    h3: { fontFamily: "Georgia, serif", fontWeight: 600 },
    h4: { fontFamily: "Georgia, serif", fontWeight: 600 },
    h5: { fontFamily: "Georgia, serif", fontWeight: 500 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    overline: {
      fontSize: "0.65rem",
      fontWeight: 700,
      letterSpacing: "0.12em",
      color: "#7a9089",
    },
  },
  shape: { borderRadius: 10 },
  shadows: [
    "none",
    "0 1px 3px rgba(18,46,40,.06), 0 1px 2px rgba(18,46,40,.04)",
    "0 2px 6px rgba(18,46,40,.07), 0 1px 3px rgba(18,46,40,.04)",
    "0 4px 12px rgba(18,46,40,.08), 0 2px 4px rgba(18,46,40,.04)",
    "0 6px 16px rgba(18,46,40,.10), 0 2px 6px rgba(18,46,40,.04)",
    "0 8px 24px rgba(18,46,40,.12), 0 4px 8px rgba(18,46,40,.04)",
    ...Array(19).fill("none"),
  ] as any,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { background: "#f4f6f4" },
        "*::-webkit-scrollbar": { width: 6, height: 6 },
        "*::-webkit-scrollbar-track": { background: "transparent" },
        "*::-webkit-scrollbar-thumb": { background: "#c8d6d0", borderRadius: 3 },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          letterSpacing: 0,
          borderRadius: 8,
        },
        contained: {
          boxShadow: "0 2px 6px rgba(18,46,40,.18)",
          "&:hover": { boxShadow: "0 4px 12px rgba(18,46,40,.24)" },
        },
        outlined: { borderWidth: "1.5px", "&:hover": { borderWidth: "1.5px" } },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: "1px solid #e0e8e4",
          borderRadius: 12,
          transition: "box-shadow .15s, border-color .15s",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 6 },
        sizeSmall: { fontSize: "0.7rem" },
      },
    },
    MuiTextField: {
      defaultProps: { size: "small" },
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            "& fieldset": { borderColor: "#d4ddd8" },
            "&:hover fieldset": { borderColor: BRAND_L },
            "&.Mui-focused fieldset": { borderColor: BRAND },
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600 },
      },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: "#e0e8e4" } },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 10 },
      },
    },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location          = useLocation();

  if (loading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <CircularProgress sx={{ color: BRAND }} />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Layout>
              <Routes>
                <Route path="/"            element={<DashboardPage />} />
                <Route path="/capture"     element={<CapturePage />} />
                <Route path="/library"     element={<LibraryPage />} />
                <Route path="/library/:id" element={<EntryDetailPage />} />
                <Route path="/assistant"   element={<AssistantPage />} />
                <Route path="/questions"   element={<QuestionsPage />} />
                <Route path="/admin"       element={<AdminPage />} />
                <Route path="*"            element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <AuthProvider>
            <App />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
