import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "./config/blockchain";
import { AdminLayout } from "./layouts/AdminLayout";
import { HomePage } from "./pages/HomePage";
import { DashboardPage } from "./pages/DashboardPage";
import { IssuePage } from "./pages/IssuePage";
import { ImportPage } from "./pages/ImportPage";
import { ManagePage } from "./pages/ManagePage";
import { AdministratorsPage } from "./pages/AdministratorsPage";

const queryClient = new QueryClient();

export default function App() {
  return <WagmiProvider config={wagmiConfig}><QueryClientProvider client={queryClient}><BrowserRouter><Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/admin" element={<AdminLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="issue" element={<IssuePage />} />
      <Route path="import" element={<ImportPage />} />
      <Route path="manage" element={<ManagePage />} />
      <Route path="administrators" element={<AdministratorsPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></BrowserRouter></QueryClientProvider></WagmiProvider>;
}

