import { useEffect } from "react";

import LoginScreen from "@/lib/ui/screens/login";
import { traceStartup } from "@/lib/utils/startup-trace";

export default function LoginPage() {
  useEffect(() => traceStartup("écran connexion affiché"), []);
  return <LoginScreen />;
}
