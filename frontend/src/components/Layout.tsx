import type { ReactNode } from "react";
import { AppBar, Toolbar, Typography, Button, Box } from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, type Role } from "../context/AuthContext";
import Logo from "./Logo";

const NAV_ITEMS: { to: string; label: string; roles?: Role[] }[] = [
  { to: "/clock", label: "Clock" },
  { to: "/daily", label: "Daily", roles: ["admin", "manager", "supervisor", "foreman"] },
  { to: "/weekly", label: "Weekly" },
  { to: "/dashboard", label: "Dashboard", roles: ["admin", "manager", "supervisor", "foreman"] },
  { to: "/reports", label: "Exports", roles: ["admin", "manager", "supervisor", "foreman"] },
  { to: "/map", label: "Map", roles: ["admin", "manager", "supervisor", "foreman"] },
  { to: "/users", label: "Users", roles: ["admin", "manager"] },
  { to: "/teams", label: "Teams", roles: ["admin", "manager"] },
  { to: "/cost-codes", label: "Cost Codes", roles: ["admin", "manager"] },
  { to: "/projects", label: "Projects", roles: ["admin"] },
];

const blockButtonSx = {
  bgcolor: "grey.300",
  color: "#000000",
  fontWeight: 700,
  border: "1px solid rgba(0,0,0,0.2)",
  boxShadow: "3px 3px 0px rgba(0,0,0,0.55)",
  transition: "transform 0.1s ease, box-shadow 0.1s ease",
  "&:hover": {
    bgcolor: "grey.400",
    boxShadow: "1px 1px 0px rgba(0,0,0,0.55)",
    transform: "translate(2px, 2px)",
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <Box>
      <AppBar position="sticky" elevation={0} sx={{ top: 0, bgcolor: "transparent", boxShadow: "none" }}>
        <Toolbar sx={{ gap: 1.5, flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", alignItems: "center", mr: 3 }}>
            <Logo size={48} />
          </Box>

          {NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role))).map((item) => (
            <Button key={item.to} component={Link} to={item.to} sx={blockButtonSx}>
              {item.label}
            </Button>
          ))}

          <Box sx={{ flexGrow: 1 }} />

          {user && (
            <Typography variant="body2" sx={{ mr: 2, fontWeight: 700, color: "#000000" }}>
              {user.name} ({user.role})
            </Typography>
          )}
          <Button onClick={handleLogout} sx={blockButtonSx}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ p: 3 }}>
        {children}
      </Box>
    </Box>
  );
}
