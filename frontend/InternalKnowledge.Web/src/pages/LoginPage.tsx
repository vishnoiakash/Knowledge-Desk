import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Alert, Box, Button, CircularProgress, IconButton,
  InputAdornment, Paper, TextField, Typography,
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const { login }    = useAuth();
  const navigate     = useNavigate();
  const location     = useLocation();
  const returnTo     = (location.state as { from?: string } | null)?.from ?? "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "#eef3f0" }}>
      <Paper elevation={0} sx={{ width: "min(400px, 92vw)", p: 4, border: "1px solid #dfe5e1", borderRadius: 3 }}>
        {/* Brand mark */}
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", mb: 3 }}>
          <Box sx={{
            width: 48, height: 48, borderRadius: 2.5, bgcolor: "#183f38",
            display: "grid", placeItems: "center", mb: 1.5,
          }}>
            <Typography sx={{ color: "#e8a48e", fontFamily: "Georgia", fontWeight: 800, fontSize: 22 }}>K</Typography>
          </Box>
          <Typography variant="h5" fontWeight={700} fontFamily="Georgia">Knowledge Desk</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Sign in with your corporate LDAP account
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
            fullWidth
            size="small"
            helperText="Enter your username or full email — the domain will be stripped automatically."
          />
          <TextField
            label="Password"
            type={showPw ? "text" : "password"}
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            fullWidth
            size="small"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                    {showPw ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !username || !password}
            fullWidth
            sx={{ mt: 1, bgcolor: "#345f54", "&:hover": { bgcolor: "#2b4f46" }, fontWeight: 700, py: 1.25 }}
          >
            {loading ? <CircularProgress size={20} color="inherit" /> : "Sign in"}
          </Button>
        </Box>

        <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={2.5}>
          Access is restricted to registered users. Contact your administrator to get access.
        </Typography>
      </Paper>
    </Box>
  );
}
