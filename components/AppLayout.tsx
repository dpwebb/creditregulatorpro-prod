import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useIsMobile } from "../helpers/useIsMobile";
import {
  LayoutDashboard,
  Upload,
  Building2,
  FileText,
  Clock,
  ScrollText,
  ShieldCheck,
  BookOpen,
  Archive,
  FileCheck,
  Scale,
  AlertOctagon,
  Calendar,
  TrendingUp,
  User,
  Users,
  Shield,
  Activity,
  AlertCircle,
  Briefcase,
  GitCompare,
  Timer,
  Landmark,
  Fingerprint,
  ClipboardCheck,
  History,
  Bug,
  UserCog,
  Truck,
  Gavel,
  Banknote,
  BarChart3,
  CreditCard,
  MessageSquare,
  BookText,
  AlertTriangle,
  FlaskConical,
  Settings2,
  Menu,
  Info,
  ArrowLeft,
  GitBranch,
  X,
} from "lucide-react";
import { useAuth } from "../helpers/useAuth";
import { useRequestVerificationEmail } from "../helpers/useEmailVerification";
import { useToast } from "../helpers/useToast";
import { Button } from "./Button";
import { AppSidebarNavigation, NavItem } from "./AppSidebarNavigation";
import { AppSidebarUser } from "./AppSidebarUser";
import { AppSidebarToggle } from "./AppSidebarToggle";
import { AppSidebarPlatformFunctionsButton } from "./AppSidebarPlatformFunctionsButton";
import { TrialCountdownBanner } from "./TrialCountdownBanner";
import { APP_DISPLAY_VERSION } from "../helpers/appVersion";
import { AISupportChat } from "./AISupportChat";
import { PLATFORM_SCOPE_NOTICE } from "../helpers/platformScope";
import styles from "./AppLayout.module.css";

const SIDEBAR_MINIMIZED_KEY = "app-sidebar-minimized";

export const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { authState, logout } = useAuth();
  const isMobile = useIsMobile();
  const [isEmailBannerDismissed, setIsEmailBannerDismissed] = useState(false);
  const { mutate: sendVerificationEmail, isPending: isSendingVerification } = useRequestVerificationEmail();
  const { showSuccess, showError } = useToast();

  // Initialize from localStorage
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    const stored = localStorage.getItem(SIDEBAR_MINIMIZED_KEY);
    return stored === "true";
  });

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_MINIMIZED_KEY, String(isMinimized));
  }, [isMinimized]);

  // Automatically minimize on mobile
  useEffect(() => {
    if (isMobile) {
      setIsMinimized(true);
    }
  }, [isMobile]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const toggleSidebar = () => {
    setIsMinimized((prev) => !prev);
  };

  const isHomePage = location.pathname === "/";

  const isDisclaimerPage =
    location.pathname === "/upload" ||
    location.pathname === "/packets" ||
    location.pathname === "/my-accounts" ||
    location.pathname.startsWith("/tradelines/");

  const navItems = useMemo<NavItem[]>(() => {
    if (authState.type !== "authenticated") return [];

    /**
     * RBAC Persona Mapping:
     * - "user" role = Individual User persona (consumers managing their own disputes)
     * - "admin" role = Admin User persona (system administrators with full access)
     */
    const { role } = authState.user;
    const isAdmin = role === "admin"; // Admin User only
    const isSupport = role === "support"; // Support Agent

    const legalAndRulesItems = [
      { path: "/bureaus", label: "Credit Reporting Companies", icon: Building2 },
      { path: "/statutes", label: "Laws", icon: BookOpen },
      { path: "/metro2-compliance", label: "Reporting Format Guide", icon: BookText },
      { path: "/creditor-obligations", label: "Rules Creditors Must Follow", icon: Scale },
      { path: "/bureau-obligations", label: "Rules Credit Reporting Companies Must Follow", icon: Landmark },
      { path: "/collector-obligations", label: "Rules Collectors Must Follow", icon: Truck },
      { path: "/enforcement-mechanisms", label: "Enforcement", icon: Gavel },
      { path: "/regulatory-updates", label: "Regulatory Updates", icon: AlertOctagon },
    ];

    const adminItems: NavItem[] = [
      {
        group: "Platform",
        items: [
          { path: "/", label: "Home", icon: LayoutDashboard },
          { path: "/admin-user-management", label: "User Management", icon: UserCog },
          { path: "/admin-compliance-config", label: "Rule Check Settings", icon: ShieldCheck },
          { path: "/admin-activity-logs", label: "Activity Logs", icon: History },
          { path: "/admin-error-logs", label: "Error Logs", icon: Bug },
          { path: "/support-tickets", label: "Support Tickets", icon: MessageSquare },
                    { path: "/admin-knowledge-base", label: "Admin Guide", icon: BookOpen },
          { path: "/admin-letter-templates", label: "Letter Templates", icon: FileCheck },
        ]
      },
      {
        group: "Legal & Rules",
        items: legalAndRulesItems
      },
      {
        group: "Tools",
        items: [
          { path: "/admin-mock-lifecycle", label: "Lifecycle Testing", icon: ClipboardCheck },
          { path: "/admin-parser-testing", label: "Parser Testing", icon: FlaskConical },
          { path: "/admin-parser-mappings", label: "Parser Mappings", icon: Settings2 },
          { path: "/admin-version-management", label: "Version Management", icon: GitBranch },
        ]
      }
    ];

    const supportItems: NavItem[] = [
      {
        group: "Support",
        items: [
          { path: "/", label: "Home", icon: LayoutDashboard },
          { path: "/support-tickets", label: "Ticket Queue", icon: MessageSquare },
        ]
      },
      {
        group: "Reference",
        items: legalAndRulesItems
      },

    ];

    const userItems: NavItem[] = [
      { path: "/", label: "Home", icon: LayoutDashboard },
      { path: "/upload", label: "Upload Report", icon: Upload },
      { path: "/my-accounts", label: "My Accounts", icon: CreditCard },
            { path: "/packets", label: "My Letters", icon: ScrollText },
      { path: "/evidence", label: "My Evidence", icon: Archive },
      { path: "/progress", label: "Progress", icon: TrendingUp },
      { path: "/my-info", label: "My Info", icon: User },
    ];

    return isAdmin ? adminItems : isSupport ? supportItems : userItems;
  }, [authState]);

  return (
    <div className={styles.layout}>
      
      <div className={styles.backgroundGlow} />
      
      {/* Mobile backdrop for sidebar */}
      {!isMinimized && isMobile && (
        <div 
          className={styles.mobileBackdrop}
          onClick={() => setIsMinimized(true)}
          aria-hidden="true"
        />
      )}

      <aside 
        className={styles.sidebar}
        data-minimized={isMinimized}
        data-mobile={isMobile}
      >
        <div className={styles.logoContainer}>
          {isMinimized ? (
            <img 
              src="/brand/favicon.png"
              alt="CRP Logo" 
              className={styles.minimizedLogo} 
            />
          ) : (
            <div className={styles.htmlLogoWrapper}>
              <img 
                src="/brand/favicon.png"
                alt="CRP Shield" 
                className={styles.htmlLogoIcon} 
              />
              <div className={styles.htmlLogoText}>
                <span className={styles.htmlLogoTextTop}>Credit Regulator</span>
                <span className={styles.htmlLogoTextBottom}>PRO</span>
              </div>
            </div>
          )}
        </div>

        {!isMobile && (
          <AppSidebarToggle 
            isMinimized={isMinimized} 
            onToggle={toggleSidebar}
          />
        )}
        
        <AppSidebarNavigation 
          navItems={navItems} 
          isMinimized={isMinimized}
          onNavClick={isMobile ? () => setIsMinimized(true) : undefined}
        />

        <div className={styles.footer}>
          {authState.type === "authenticated" && authState.user.role === "admin" && (
            <AppSidebarPlatformFunctionsButton isMinimized={isMinimized} />
          )}
          <div className={styles.versionBadge} data-minimized={isMinimized}>
            v{APP_DISPLAY_VERSION}
          </div>
          {authState.type === "authenticated" && (
            <AppSidebarUser 
              user={authState.user} 
              onLogout={handleLogout}
              isMinimized={isMinimized}
            />
          )}
        </div>
      </aside>

      <main 
        className={styles.main}
        data-minimized={isMinimized}
        data-mobile={isMobile}
        data-tour="dashboard-overview"
      >
        <TrialCountdownBanner />
        {authState.type === "authenticated" && (
          <div className={styles.scopeBanner}>
            <Info size={14} className={styles.globalBannerIcon} />
            <span>{PLATFORM_SCOPE_NOTICE}</span>
          </div>
        )}
        {authState.type === "authenticated" && authState.user.role === "user" && isDisclaimerPage && (
          <div className={styles.globalBanner}>
            <Info size={14} className={styles.globalBannerIcon} />
            <span>You control each letter. Credit Regulator Pro helps you but does not represent you.</span>
          </div>
        )}
        {authState.type === "authenticated" && !authState.user.emailVerified && !isEmailBannerDismissed && (
          <div className={styles.emailVerificationBanner}>
            <AlertTriangle size={16} className={styles.emailBannerIcon} />
            <span className={styles.emailBannerText}>
              We need to check your email. Click the button so we can send you important updates.
            </span>
            <div className={styles.emailBannerActions}>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => {
                  sendVerificationEmail(undefined, {
                    onSuccess: () => showSuccess("Verification email sent!"),
                    onError: (err) => showError(err instanceof Error ? err.message : "Failed to send verification email")
                  });
                }} 
                disabled={isSendingVerification}
                className={styles.emailBannerButton}
              >
                {isSendingVerification ? "Sending..." : "Check My Email"}
              </Button>
              <button 
                className={styles.emailBannerDismiss} 
                onClick={() => setIsEmailBannerDismissed(true)}
                aria-label="Dismiss banner"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        <header className={styles.header}>
          <div className={styles.headerContent}>
            {isMobile && (
              <button 
                className={styles.mobileMenuButton}
                onClick={() => setIsMinimized(false)}
                aria-label="Open menu"
              >
                <Menu size={24} />
              </button>
            )}
            {!isHomePage && (
              <button
                className={styles.backButton}
                onClick={() => navigate(-1)}
                aria-label="Go back"
              >
                <ArrowLeft size={24} />
              </button>
            )}
          </div>
        </header>
        <div className={styles.contentContainer}>
          {children}
        </div>
      </main>
      {authState.type === "authenticated" && <AISupportChat />}
    </div>
  );
};

export default AppLayout;
