import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import RegisterPage from "./pages/RegisterPage";
import MemberPage from "./pages/MemberPage";
import DeliveryPage from "./pages/DeliveryPage";
import DeliveryScanPage from "./pages/DeliveryScanPage";

function LoginDashboard() { return <Dashboard />; }
function ManagerDashboard() { return <Dashboard requiredRole="manager" />; }
function CashierDashboard() { return <Dashboard requiredRole="cashier" />; }

function Router() {
  return <Switch>
    <Route path="/register/:token" component={RegisterPage} />
    <Route path="/member/:token" component={MemberPage} />
    <Route path="/delivery/:token" component={DeliveryPage} />
    <Route path="/delivery-scan/:token" component={DeliveryScanPage} />
    <Route path="/login" component={LoginDashboard} />
    <Route path="/manager" component={ManagerDashboard} />
    <Route path="/cashier" component={CashierDashboard} />
    <Route path="/" component={LoginDashboard} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster richColors position="top-center" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
