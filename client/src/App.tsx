import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import HomePage from "@/pages/home-page";
import ExchangeConnectPage from "@/pages/exchange-connect-page";
import ConnectedDashboardPage from "@/pages/connected-dashboard-page";
import { ProtectedRoute } from "./lib/protected-route";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/" component={HomePage} />
      <ProtectedRoute path="/connect" component={ExchangeConnectPage} />
      <ProtectedRoute path="/dashboard/:id" component={ConnectedDashboardPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Router />
        </div>
      </main>
      <Footer />
      <Toaster />
    </div>
  );
}

export default App;
