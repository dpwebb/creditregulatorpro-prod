import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import { 
  Database, 
  FileText, 
  Package, 
  Scale, 
  Upload,
  Archive,
  UserCog,
  ShieldCheck,
  History,
  GitBranch,
  BarChart3
} from "lucide-react";

import { useDashboardStats } from "../helpers/dashboardQueries";
import { useAuth } from "../helpers/useAuth";
import { useUserProfile } from "../helpers/useUserProfile";
import { Button } from "../components/Button";
import { HelpTooltip } from "../components/HelpTooltip";

import { useSupportTicketList } from "../helpers/supportTicketQueries";
import { formatRelativeTime } from "../helpers/formatters";
import { Badge } from "../components/Badge";
import { SupportDashboardChat } from "../components/SupportDashboardChat";
import { DashboardMetricCard } from "../components/DashboardMetricCard";
import { DashboardActivityTable } from "../components/DashboardActivityTable";
import { DashboardUsersTable } from "../components/DashboardUsersTable";
import { DisputeJourneyTracker } from "../components/DisputeJourneyTracker";
import { HiddenRiskWidget } from "../components/HiddenRiskWidget";
import { LandingPage } from "../components/LandingPage";
import AppLayout from "../components/AppLayout";
import { AuthLoadingState } from "../components/AuthLoadingState";

import styles from "./_index.module.css";

export default function DashboardPage() {
  const { authState } = useAuth();

  if (authState.type === "loading") {
    return <AuthLoadingState title="Loading..." />;
  }

  if (authState.type === "unauthenticated") {
    return <LandingPage />;
  }

  return (
    <AppLayout>
      <DashboardContent />
    </AppLayout>
  );
}

function DashboardContent() {
  const { data: stats, isFetching, error } = useDashboardStats();
  const { authState } = useAuth();
  const { profile } = useUserProfile();
  
  const user = authState.type === "authenticated" ? authState.user : null;
  const isAdmin = user?.role === "admin";
  const isSupport = user?.role === "support";
  
  const hasUploadedReport = (stats?.totalReportArtifacts ?? 0) > 0;

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorContent}>
          <h2 className={styles.errorTitle}>Unable to load dashboard</h2>
          <p className={styles.errorMessage}>Failed to load dashboard statistics. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{isAdmin ? "Dashboard" : isSupport ? "Support Dashboard" : "My Dashboard"} | Credit Regulator Pro</title>
      </Helmet>

      <div className={styles.container}>
        {/* Header Section */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h1 className={styles.title}>
              {isAdmin ? "Platform Dashboard" : isSupport ? "Support Dashboard" : `Welcome back, ${profile?.fullName?.split(" ")[0] || user?.displayName || ""}`}
            </h1>
            <p className={styles.subtitle}>
              {isAdmin 
                ? "System-wide overview" 
                : isSupport 
                ? "Manage support tickets and inquiries"
                : "Here's your dispute progress"
              }
              {isAdmin && (
                <HelpTooltip 
                  content="This app only works for Canadian credit reports. Your information stays in Canada." 
                  className={styles.tooltip}
                />
              )}
            </p>
          </div>
          
        </div>

        {isAdmin ? (
          <>
            {/* Admin Quick Actions */}
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Quick Actions</h2>
            </div>
            <div className={styles.quickActions}>
              <Button asChild variant="outline">
                <Link to="/admin-user-management"><UserCog size={16} /> User Management</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin-compliance-config"><ShieldCheck size={16} /> Rule Check Settings</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin-activity-logs"><History size={16} /> Activity Logs</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin-version-management"><GitBranch size={16} /> Version Management</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin-mock-lifecycle"><BarChart3 size={16} /> Lifecycle Testing</Link>
              </Button>
            </div>

            <div className={styles.hiddenRiskSection}>
              <HiddenRiskWidget isAdmin={true} />
            </div>

            {/* Users Table */}
            <DashboardUsersTable />

            {/* Recent Activity Section */}
            <DashboardActivityTable
              packets={stats?.recentPackets}
              isLoading={isFetching}
              isAdmin={true}
            />

            {/* Stats Grid */}
            <div className={styles.sectionCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderLeft}>
                  <BarChart3 className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>System Numbers</h2>
                </div>
              </div>
              
              <div className={styles.statsGridContainer}>
                <div className={styles.statsGrid}>
                  <DashboardMetricCard
                    title="Total Reports"
                    value={stats?.totalReportArtifacts}
                    loading={isFetching}
                    icon={Archive}
                    accentColor="primary"
                  />
                  <DashboardMetricCard
                    title="Total Accounts"
                    value={stats?.totalTradelines}
                    loading={isFetching}
                    icon={FileText}
                    accentColor="secondary"
                  />
                  <DashboardMetricCard
                    title="Total Rules to Follow"
                    value={stats?.totalObligations}
                    loading={isFetching}
                    icon={Scale}
                    accentColor="accent"
                  />
                  <DashboardMetricCard
                    title="Total Dispute Letters"
                    value={stats?.totalPackets}
                    loading={isFetching}
                    icon={Package}
                    accentColor="info"
                  />
                </div>
              </div>
            </div>
          </>
        ) : isSupport ? (
          <SupportDashboardContent />
        ) : (
          <div className={styles.userDashboardContent}>
            
            <DisputeJourneyTracker stats={stats} isLoading={isFetching} />
            <div className={styles.hiddenRiskSection}>
              <HiddenRiskWidget isAdmin={false} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SupportDashboardContent() {
  const { data: ticketsData, isPending } = useSupportTicketList({});
  const tickets = ticketsData?.tickets || [];
  
  const openCount = tickets.filter(t => t.status === "OPEN").length;
  const inProgressCount = tickets.filter(t => t.status === "IN_PROGRESS").length;
  const waitingCount = tickets.filter(t => t.status === "WAITING_ON_USER").length;
  const recentTickets = tickets.slice(0, 5);

  return (
    <div className={styles.supportDashboardContent}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
      </div>
      <div className={styles.quickActions}>
        <Button asChild variant="outline">
          <Link to="/support-tickets"><Package size={16} /> Ticket Queue</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/bureaus"><Database size={16} /> Bureaus</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/statutes"><Scale size={16} /> Statutes</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/user-manual"><FileText size={16} /> User Manual</Link>
        </Button>
      </div>

      <div className={styles.statsGridContainer}>
        <div className={styles.statsGrid}>
          <DashboardMetricCard
            title="Open Tickets"
            value={openCount}
            loading={isPending}
            icon={Archive}
            accentColor="error"
          />
          <DashboardMetricCard
            title="In Progress"
            value={inProgressCount}
            loading={isPending}
            icon={History}
            accentColor="warning"
          />
          <DashboardMetricCard
            title="Waiting on User"
            value={waitingCount}
            loading={isPending}
            icon={UserCog}
            accentColor="info"
          />
        </div>
      </div>

      <div className={styles.supportMainGrid}>
        <div className={styles.chatSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>AI Support Assistant</h2>
          </div>
          <SupportDashboardChat />
        </div>

        <div className={styles.recentTicketsSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Tickets</h2>
            <Link to="/support-tickets" className={styles.viewAllLink}>View All</Link>
          </div>
          
          <div className={styles.ticketList}>
            {isPending ? (
              <p className={styles.loadingText}>Loading tickets...</p>
            ) : recentTickets.length > 0 ? (
              recentTickets.map(ticket => (
                <Link to={`/support-tickets/${ticket.id}`} key={ticket.id} className={styles.ticketCard}>
                  <div className={styles.ticketHeader}>
                    <span className={styles.ticketSubject}>{ticket.subject}</span>
                    <Badge variant={ticket.status === "OPEN" ? "error" : ticket.status === "IN_PROGRESS" ? "warning" : "default"}>
                      {ticket.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className={styles.ticketFooter}>
                    <span className={styles.ticketUser}>{ticket.userDisplayName}</span>
                    <span className={styles.ticketDate}>{formatRelativeTime(ticket.updatedAt)}</span>
                  </div>
                </Link>
              ))
            ) : (
              <p className={styles.emptyText}>No recent tickets found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
