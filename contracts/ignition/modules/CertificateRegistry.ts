import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("CertificateRegistryModule", (m) => {
  const registry = m.contract("CertificateRegistry", [m.getParameter("initialAdministrator", m.getAccount(0))]);
  return { registry };
});
