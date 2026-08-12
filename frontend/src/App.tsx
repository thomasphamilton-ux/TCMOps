import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@mui/material";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { BrandingProvider } from "./context/BrandingContext";
import theme from "./theme/theme";

import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";

import LoginPage from "./pages/Login";
import RegisterPage from "./pages/Register";
import ClockPage from "./pages/Clock";
import DailyPage from "./pages/Daily";
import TeamCodingPage from "./pages/TeamCoding";
import WeeklyPage from "./pages/Weekly";
import PayInquiriesPage from "./pages/PayInquiries";
import TimeOffRequestsPage from "./pages/TimeOffRequests";
import DashboardPage from "./pages/Dashboard";
import UsersPage from "./pages/Users";
import EmployeeDetailPage from "./pages/EmployeeDetail";
import TeamsPage from "./pages/Teams";
import CostCodesPage from "./pages/CostCodes";
import ReportsPage from "./pages/Reports";
import ProjectsPage from "./pages/Projects";
import CompaniesPage from "./pages/Companies";
import MapPage from "./pages/Map";

const MANAGEMENT_ROLES = ["admin", "manager", "supervisor", "foreman"] as const;
const PROJECT_ADMIN_ROLES = ["admin", "manager"] as const;

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/clock" replace /> : <LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/clock"
        element={
          <ProtectedRoute>
            <Layout>
              <ClockPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/daily"
        element={
          <ProtectedRoute roles={[...MANAGEMENT_ROLES]}>
            <Layout>
              <DailyPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team-coding"
        element={
          <ProtectedRoute roles={[...MANAGEMENT_ROLES]}>
            <Layout>
              <TeamCodingPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/weekly"
        element={
          <ProtectedRoute>
            <Layout>
              <WeeklyPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pay-inquiries"
        element={
          <ProtectedRoute>
            <Layout>
              <PayInquiriesPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/time-off"
        element={
          <ProtectedRoute>
            <Layout>
              <TimeOffRequestsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute roles={[...MANAGEMENT_ROLES]}>
            <Layout>
              <DashboardPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute roles={[...MANAGEMENT_ROLES]}>
            <Layout>
              <ReportsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute roles={[...PROJECT_ADMIN_ROLES]}>
            <Layout>
              <UsersPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/:id"
        element={
          <ProtectedRoute roles={[...MANAGEMENT_ROLES]}>
            <Layout>
              <EmployeeDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/teams"
        element={
          <ProtectedRoute roles={[...PROJECT_ADMIN_ROLES]}>
            <Layout>
              <TeamsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cost-codes"
        element={
          <ProtectedRoute roles={[...PROJECT_ADMIN_ROLES]}>
            <Layout>
              <CostCodesPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute roles={["admin"]}>
            <Layout>
              <ProjectsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/companies"
        element={
          <ProtectedRoute roles={["admin"]}>
            <Layout>
              <CompaniesPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/map"
        element={
          <ProtectedRoute roles={[...MANAGEMENT_ROLES]}>
            <Layout>
              <MapPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/clock" replace />} />
      <Route path="*" element={<Navigate to="/clock" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <BrandingProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </BrandingProvider>
    </ThemeProvider>
  );
}
