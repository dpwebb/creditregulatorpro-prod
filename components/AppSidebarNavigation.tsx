import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LucideIcon, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./Collapsible";
import { Tooltip, TooltipTrigger, TooltipContent } from "./Tooltip";
import styles from "./AppSidebarNavigation.module.css";

export interface NavItemSingle {
  path: string;
  label: string;
  icon: LucideIcon;
  group?: never;
  items?: never;
}

export interface NavItemGroup {
  group: string;
  items: NavItemSingle[];
  path?: never;
  label?: never;
  icon?: never;
}

export type NavItem = NavItemSingle | NavItemGroup;

interface AppSidebarNavigationProps {
  navItems: NavItem[];
  isMinimized: boolean;
  onNavClick?: () => void;
}

function getTourAttribute(path: string): string | undefined {
  switch (path) {
    case "/upload": return "upload-report";
    case "/my-accounts": return "tradelines-nav";
    case "/packets": return "packets-nav";
    case "/evidence": return "evidence-nav";
    case "/calendar": return "compliance-nav";
    case "/progress": return "analytics-nav";
    default: return undefined;
  }
}

export const AppSidebarNavigation: React.FC<AppSidebarNavigationProps> = ({
  navItems,
  isMinimized,
  onNavClick,
}) => {
  const location = useLocation();

  const renderSingleItem = (item: NavItemSingle) => {
    const isActive = location.pathname === item.path;
    const tourAttribute = getTourAttribute(item.path);

    const linkContent = (
      <Link
        to={item.path}
        className={`${styles.navItem} ${isActive ? styles.active : ""}`}
        data-minimized={isMinimized}
        data-tour={tourAttribute}
        onClick={onNavClick}
      >
        <span className={styles.iconWrapper}>
          <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
        </span>
        {!isMinimized && <span className={styles.label}>{item.label}</span>}
        {isActive && <div className={styles.activeGlow} />}
      </Link>
    );

    if (isMinimized) {
      return (
        <Tooltip key={item.path}>
          <TooltipTrigger asChild>
            {linkContent}
          </TooltipTrigger>
          <TooltipContent side="right">
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return <React.Fragment key={item.path}>{linkContent}</React.Fragment>;
  };

  return (
    <nav className={styles.nav} data-minimized={isMinimized}>
      {navItems.map((item, index) => {
        if (item.group) {
          // Hide groups when minimized, render children as top-level items
          if (isMinimized) {
            return (
              <React.Fragment key={`group-${index}`}>
                {item.items.map(subItem => renderSingleItem(subItem))}
              </React.Fragment>
            );
          }
          
          return (
            <Collapsible key={`group-${index}`} defaultOpen={true} className={styles.groupCollapsible}>
              <CollapsibleTrigger className={styles.groupTrigger}>
                <span className={styles.groupLabel}>{item.group}</span>
                <ChevronDown size={14} className={styles.groupChevron} />
              </CollapsibleTrigger>
              <CollapsibleContent className={styles.groupContent}>
                {item.items.map(subItem => renderSingleItem(subItem))}
              </CollapsibleContent>
            </Collapsible>
          );
        }
        
        // Handle single items at top level if any (though currently all are grouped in AppLayout)
        return renderSingleItem(item as NavItemSingle);
      })}
    </nav>
  );
};