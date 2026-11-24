import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { ApiError } from "../api/client";
import { Layout } from "../components/Layout";
import { ToastProvider } from "../components/Toast";
import { AuthProvider, useAuth } from "../features/auth/AuthContext";
import { LoginPage } from "../features/auth/LoginPage";
import { DuesPage } from "../features/dues/DuesPage";
import { HomePage } from "../features/home/HomePage";
import { ClubPage, PasswordPage, SystemCheckPage } from "../features/more/AccountPages";
import { FeeGroupsPage } from "../features/more/FeeGroupsPage";
import { MorePage } from "../features/more/MorePage";
import { UsersPage } from "../features/more/UsersPage";
import { StudentFormPage } from "../features/students/StudentFormPage";
import { StudentProfilePage } from "../features/students/StudentProfilePage";
import { StudentsPage } from "../features/students/StudentsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't retry "not allowed / not found"; do retry flaky networks.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

function AdminOnly({ children }: { children: React.ReactElement }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/more" replace />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="students" element={<StudentsPage />} />
                <Route path="students/new" element={<StudentFormPage />} />
                <Route path="students/:id" element={<StudentProfilePage />} />
                <Route path="students/:id/edit" element={<StudentFormPage />} />
                <Route path="dues" element={<DuesPage />} />
                <Route path="more" element={<MorePage />} />
                <Route path="more/fee-groups" element={<FeeGroupsPage />} />
                <Route path="more/users" element={<AdminOnly><UsersPage /></AdminOnly>} />
                <Route path="more/club" element={<AdminOnly><ClubPage /></AdminOnly>} />
                <Route path="more/password" element={<PasswordPage />} />
                <Route path="more/status" element={<SystemCheckPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
