import React from "react";
import {
  Navigate,
  Route,
  BrowserRouter,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth, type Role } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import { ThemeProvider } from "./lib/theme";
import { AlertsProvider } from "./lib/alerts";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import PurchaseOrders from "./pages/PurchaseOrders";
import Claims from "./pages/Claims";
import Alerts from "./pages/Alerts";
import Users from "./pages/Users";
import AuditLogs from "./pages/AuditLogs";
import VendorInventory from "./pages/VendorInventory";
import CustomerInventory from "./pages/CustomerInventory";
import SlaUpload from "./pages/SlaUpload";
import SlaView from "./pages/SlaView";
import MyVendors from "./pages/MyVendors";
import RagEvaluation from "./pages/RagEvaluation";
import Chatbot from "./pages/Chatbot";
import DeliveredOrders from "./pages/DeliveredOrders";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

function RequireRole({
  roles,
  children,
}: {
  roles: Role[];
  children: React.ReactNode;
}) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

const ERP_ROLES: Role[] = ["admin", "procurement_officer", "inventory_controller", "finance_officer"];

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AlertsProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                  path="/"
                  element={
                    <RequireAuth>
                      <Layout />
                    </RequireAuth>
                  }
                >
                  <Route index element={<Dashboard />} />

                  {/* Chatbot — admin only */}
                  <Route
                    path="chatbot"
                    element={
                      <RequireRole roles={["admin"]}>
                        <Chatbot />
                      </RequireRole>
                    }
                  />
                  <Route path="alerts" element={<Alerts />} />
                  <Route path="rag-evaluation" element={<RagEvaluation />} />

                  {/* Customer: view & place own orders */}
                  <Route
                    path="orders"
                    element={
                      <RequireRole roles={["customer", "admin", "procurement_officer"]}>
                        <Orders />
                      </RequireRole>
                    }
                  />

                  {/* Customer Order Requests — admin + procurement_officer */}
                  <Route
                    path="customer-order-requests"
                    element={
                      <RequireRole roles={["admin", "procurement_officer"]}>
                        <Orders />
                      </RequireRole>
                    }
                  />

                  {/* Purchase Orders (My Orders) — admin + procurement_officer */}
                  <Route
                    path="purchase-orders"
                    element={
                      <RequireRole roles={["admin", "procurement_officer"]}>
                        <PurchaseOrders />
                      </RequireRole>
                    }
                  />

                  {/* Delivered Orders — inventory_controller + admin */}
                  <Route
                    path="delivered-orders"
                    element={
                      <RequireRole roles={["admin", "inventory_controller"]}>
                        <DeliveredOrders />
                      </RequireRole>
                    }
                  />

                  {/* Inventory — admin + inventory_controller */}
                  <Route
                    path="vendor-inventory"
                    element={
                      <RequireRole roles={["admin", "inventory_controller"]}>
                        <VendorInventory />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="customer-inventory"
                    element={
                      <RequireRole roles={["admin", "inventory_controller"]}>
                        <CustomerInventory />
                      </RequireRole>
                    }
                  />

                  {/* SLA — admin + procurement_officer upload; admin + finance_officer read */}
                  <Route
                    path="sla-upload"
                    element={
                      <RequireRole roles={["admin", "procurement_officer"]}>
                        <SlaUpload />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="sla"
                    element={
                      <RequireRole roles={["admin", "finance_officer", "procurement_officer"]}>
                        <SlaView />
                      </RequireRole>
                    }
                  />

                  {/* Claims — admin + finance_officer */}
                  <Route
                    path="claims"
                    element={
                      <RequireRole roles={["admin", "finance_officer"]}>
                        <Claims />
                      </RequireRole>
                    }
                  />

                  {/* Vendor & Customer management — admin only */}
                  <Route
                    path="vendors"
                    element={
                      <RequireRole roles={["admin"]}>
                        <Users filterRole="vendor" title="Vendors" />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="customers"
                    element={
                      <RequireRole roles={["admin"]}>
                        <Users filterRole="customer" title="Customers" />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="my-vendors"
                    element={
                      <RequireRole roles={["admin"]}>
                        <MyVendors />
                      </RequireRole>
                    }
                  />

                  {/* Admin only */}
                  <Route
                    path="users"
                    element={
                      <RequireRole roles={["admin"]}>
                        <Users />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="audit-logs"
                    element={
                      <RequireRole roles={["admin"]}>
                        <AuditLogs />
                      </RequireRole>
                    }
                  />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </AlertsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
