import { useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  IconButton, Stack, Switch, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import PersonOffIcon from "@mui/icons-material/PersonOff";
import PersonIcon from "@mui/icons-material/Person";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { Navigate } from "react-router-dom";

// The admin username is set via env var — only this user sees the page.
// Set VITE_ADMIN_USERNAME in your .env file.
const ADMIN = import.meta.env.VITE_ADMIN_USERNAME as string | undefined;

type UserRow = { username: string; displayName?: string; email?: string; isActive: boolean; createdAt: string };

export default function AdminPage() {
  const { user } = useAuth();

  // Hard redirect if not the admin
  if (ADMIN && user?.username !== ADMIN) {
    return <Navigate to="/" replace />;
  }

  return <UserManagement />;
}

function UserManagement() {
  const qc = useQueryClient();
  const [addOpen,  setAddOpen]  = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn:  usersApi.list,
    staleTime: 30_000,
  });

  const toggleMut = useMutation({
    mutationFn: (u: UserRow) =>
      usersApi.update(u.username, {
        displayName: u.displayName,
        email: u.email,
        isActive: !u.isActive,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 900, mx: "auto" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", mb: 3 }}>
        <Box>
          <Typography variant="overline" color="text.secondary">Admin</Typography>
          <Typography variant="h4" fontFamily="Georgia" fontWeight={600}>User management</Typography>
          <Typography variant="body2" color="text.secondary">
            Only users in this list can sign in via LDAP. Deactivating a user blocks their next login immediately.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)} color="primary">
          Add user
        </Button>
      </Box>

      {isLoading && <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>}
      {error     && <Alert severity="error" sx={{ mb: 2 }}>{(error as Error).message}</Alert>}

      <Card variant="outlined" sx={{ borderRadius: 2.5 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ "& th": { fontWeight: 700, bgcolor: "#f5f8f6", fontSize: 12 } }}>
                <TableCell>Username</TableCell>
                <TableCell>Display name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Added</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: "center", py: 4, color: "text.secondary" }}>
                    No users yet. Add the first one.
                  </TableCell>
                </TableRow>
              )}
              {users.map(u => (
                <TableRow key={u.username} sx={{ "&:hover": { bgcolor: "#f8fbf9" } }}>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ width: 28, height: 28, borderRadius: "50%",
                        bgcolor: u.isActive ? "#e9a88f" : "#ddd", color: "#21443b",
                        display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800 }}>
                        {u.username[0].toUpperCase()}
                      </Box>
                      <Typography variant="body2" fontWeight={600}>{u.username}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{u.displayName ?? <em style={{ color: "#999" }}>—</em>}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{u.email ?? <em>—</em>}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={u.isActive ? "Active" : "Inactive"}
                      size="small"
                      color={u.isActive ? "success" : "default"}
                      variant="outlined"
                      sx={{ fontSize: 10 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => setEditUser(u)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={u.isActive ? "Deactivate" : "Activate"}>
                        <IconButton
                          size="small"
                          color={u.isActive ? "warning" : "success"}
                          disabled={toggleMut.isPending}
                          onClick={() => toggleMut.mutate(u)}
                        >
                          {u.isActive
                            ? <PersonOffIcon fontSize="small" />
                            : <PersonIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Add user dialog */}
      <AddUserDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["users"] })}
      />

      {/* Edit user dialog */}
      {editUser && (
        <EditUserDialog
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["users"] }); setEditUser(null); }}
        />
      )}
    </Box>
  );
}

// ── Add user dialog ───────────────────────────────────────────────────────────

function AddUserDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [username,    setUsername]    = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email,       setEmail]       = useState("");
  const [isActive,    setIsActive]    = useState(true);

  const addMut = useMutation({
    mutationFn: () => usersApi.create({
      username:    username.trim().toLowerCase(),
      displayName: displayName.trim() || undefined,
      email:       email.trim() || undefined,
      isActive,
    }),
    onSuccess: () => {
      onCreated(); onClose();
      setUsername(""); setDisplayName(""); setEmail(""); setIsActive(true);
    },
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add user to allow-list</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "12px !important" }}>
        <TextField
          label="LDAP username" size="small" fullWidth autoFocus required
          value={username} onChange={e => setUsername(e.target.value)}
          helperText="Must match their corporate LDAP username exactly (lowercase)."
        />
        <TextField
          label="Display name (optional)" size="small" fullWidth
          value={displayName} onChange={e => setDisplayName(e.target.value)}
          placeholder="e.g. Alice Smith"
        />
        <TextField
          label="Email (optional)" size="small" fullWidth
          value={email} onChange={e => setEmail(e.target.value)}
          placeholder="e.g. alice@policybazaar.com"
        />
        <Stack direction="row" alignItems="center" spacing={1}>
          <Switch checked={isActive} onChange={e => setIsActive(e.target.checked)} size="small" />
          <Typography variant="body2">Active (can log in immediately)</Typography>
        </Stack>
        {addMut.error && <Alert severity="error">{(addMut.error as Error).message}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!username.trim() || addMut.isPending}
          onClick={() => addMut.mutate()} color="primary">
          {addMut.isPending ? <CircularProgress size={16} color="inherit" /> : "Add user"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Edit user dialog ──────────────────────────────────────────────────────────

function EditUserDialog({ user, onClose, onSaved }: {
  user: UserRow; onClose: () => void; onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [email,       setEmail]       = useState(user.email ?? "");
  const [isActive,    setIsActive]    = useState(user.isActive);

  const saveMut = useMutation({
    mutationFn: () => usersApi.update(user.username, {
      displayName: displayName.trim() || undefined,
      email:       email.trim() || undefined,
      isActive,
    }),
    onSuccess: onSaved,
  });

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit {user.username}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "12px !important" }}>
        <TextField
          label="Display name" size="small" fullWidth autoFocus
          value={displayName} onChange={e => setDisplayName(e.target.value)}
        />
        <TextField
          label="Email" size="small" fullWidth
          value={email} onChange={e => setEmail(e.target.value)}
        />
        <Stack direction="row" alignItems="center" spacing={1}>
          <Switch checked={isActive} onChange={e => setIsActive(e.target.checked)} size="small" />
          <Typography variant="body2">{isActive ? "Active" : "Inactive (blocked from login)"}</Typography>
        </Stack>
        {saveMut.error && <Alert severity="error">{(saveMut.error as Error).message}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={saveMut.isPending}
          onClick={() => saveMut.mutate()} color="primary">
          {saveMut.isPending ? <CircularProgress size={16} color="inherit" /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
