import { useState, type MouseEvent, type ReactNode } from "react";
import { AppBar, Toolbar, Typography, Button, Box, Menu, MenuItem, ListItemIcon } from "@mui/material";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import CheckIcon from "@mui/icons-material/Check";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth, type Role } from "../context/AuthContext";
import Logo from "./Logo";

interface NavItem {
  to: string;
  label: string;
  roles?: Role[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Grouped by what the group is FOR, not by page type — every role gets at
// least "My Time" (their own clock/hours); "Team" and "Setup" only appear at
// all once the account's role clears every item inside them, so the header
// itself already reflects security level before a single click happens.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "My Time",
    items: [
      { to: "/clock", label: "Clock" },
      { to: "/weekly", label: "Weekly" },
    ],
  },
  {
    label: "Team",
    items: [
      { to: "/daily", label: "Daily", roles: ["admin", "manager", "supervisor", "foreman"] },
      { to: "/dashboard", label: "Dashboard", roles: ["admin", "manager", "supervisor", "foreman"] },
      { to: "/reports", label: "Exports", roles: ["admin", "manager", "supervisor", "foreman"] },
      { to: "/map", label: "Map", roles: ["admin", "manager", "supervisor", "foreman"] },
    ],
  },
  {
    label: "Setup",
    items: [
      { to: "/users", label: "Users", roles: ["admin", "manager"] },
      { to: "/teams", label: "Teams", roles: ["admin", "manager"] },
      { to: "/cost-codes", label: "Cost Codes", roles: ["admin", "manager"] },
      { to: "/projects", label: "Projects", roles: ["admin"] },
      { to: "/companies", label: "Companies", roles: ["admin"] },
    ],
  },
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

const activeBlockButtonSx = {
  ...blockButtonSx,
  bgcolor: "grey.800",
  color: "#ffffff",
  "&:hover": {
    ...blockButtonSx["&:hover"],
    bgcolor: "grey.700",
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [openGroupLabel, setOpenGroupLabel] = useState<string | null>(null);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const openMenu = (e: MouseEvent<HTMLElement>, groupLabel: string) => {
    setAnchorEl(e.currentTarget);
    setOpenGroupLabel(groupLabel);
  };

  const closeMenu = () => {
    setAnchorEl(null);
    setOpenGroupLabel(null);
  };

  // Filtered per-item by role first, then any group left with zero items
  // (e.g. "Setup" for a plain employee) is dropped entirely rather than
  // showing an empty dropdown.
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || (user && item.roles.includes(user.role))),
  })).filter((group) => group.items.length > 0);

  return (
    <Box>
      <AppBar position="sticky" elevation={0} sx={{ top: 0, bgcolor: "transparent", boxShadow: "none" }}>
        <Toolbar sx={{ gap: 1.5, flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", alignItems: "center", mr: 3 }}>
            <Logo size={48} />
          </Box>

          {visibleGroups.map((group) => {
            const groupActive = group.items.some((item) => location.pathname.startsWith(item.to));
            return (
              <Box key={group.label}>
                <Button
                  onClick={(e) => openMenu(e, group.label)}
                  endIcon={<ArrowDropDownIcon />}
                  sx={groupActive ? activeBlockButtonSx : blockButtonSx}
                >
                  {group.label}
                </Button>
                <Menu anchorEl={anchorEl} open={openGroupLabel === group.label} onClose={closeMenu}>
                  {group.items.map((item) => {
                    const itemActive = location.pathname.startsWith(item.to);
                    return (
                      <MenuItem key={item.to} component={Link} to={item.to} onClick={closeMenu} selected={itemActive}>
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          {itemActive ? <CheckIcon fontSize="small" /> : null}
                        </ListItemIcon>
                        {item.label}
                      </MenuItem>
                    );
                  })}
                </Menu>
              </Box>
            );
          })}

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
