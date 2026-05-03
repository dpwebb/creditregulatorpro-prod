import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LucideIcon, ChevronDown, Search, Star } from "lucide-react";
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

const FAVORITES_KEY = "app-sidebar-favorite-paths";
const RECENT_KEY = "app-sidebar-recent-paths";
const MAX_FAVORITES = 8;
const MAX_RECENT = 6;

function readStoredPaths(key: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function writeStoredPaths(key: string, value: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function isGroupItem(item: NavItem): item is NavItemGroup {
  return "group" in item;
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
  const [query, setQuery] = useState("");
  const [favoritePaths, setFavoritePaths] = useState<string[]>(() => readStoredPaths(FAVORITES_KEY));
  const [recentPaths, setRecentPaths] = useState<string[]>(() => readStoredPaths(RECENT_KEY));

  const allItemsByPath = useMemo(() => {
    const itemsByPath = new Map<string, NavItemSingle>();

    navItems.forEach((item) => {
      if (isGroupItem(item)) {
        item.items.forEach((nestedItem) => {
          itemsByPath.set(nestedItem.path, nestedItem);
        });
        return;
      }

      itemsByPath.set(item.path, item);
    });

    return itemsByPath;
  }, [navItems]);

  useEffect(() => {
    setFavoritePaths((prev) => prev.filter((path) => allItemsByPath.has(path)).slice(0, MAX_FAVORITES));
    setRecentPaths((prev) => prev.filter((path) => allItemsByPath.has(path)).slice(0, MAX_RECENT));
  }, [allItemsByPath]);

  useEffect(() => {
    writeStoredPaths(FAVORITES_KEY, favoritePaths);
  }, [favoritePaths]);

  useEffect(() => {
    writeStoredPaths(RECENT_KEY, recentPaths);
  }, [recentPaths]);

  const normalizedQuery = query.trim().toLowerCase();

  const itemMatchesQuery = (item: NavItemSingle) => {
    if (!normalizedQuery) {
      return true;
    }

    return (
      item.label.toLowerCase().includes(normalizedQuery) ||
      item.path.toLowerCase().includes(normalizedQuery)
    );
  };

  const filteredNavItems = useMemo<NavItem[]>(() => {
    if (!normalizedQuery) {
      return navItems;
    }

    return navItems.reduce<NavItem[]>((accumulator, item) => {
      if (isGroupItem(item)) {
        const filteredChildren = item.items.filter(itemMatchesQuery);
        if (filteredChildren.length === 0) {
          return accumulator;
        }

        accumulator.push({ group: item.group, items: filteredChildren });
        return accumulator;
      }

      if (itemMatchesQuery(item)) {
        accumulator.push(item);
      }

      return accumulator;
    }, []);
  }, [navItems, normalizedQuery]);

  const favoriteItems = useMemo(
    () =>
      favoritePaths
        .map((path) => allItemsByPath.get(path))
        .filter((item): item is NavItemSingle => Boolean(item)),
    [allItemsByPath, favoritePaths]
  );

  const recentItems = useMemo(
    () =>
      recentPaths
        .filter((path) => !favoritePaths.includes(path))
        .map((path) => allItemsByPath.get(path))
        .filter((item): item is NavItemSingle => Boolean(item)),
    [allItemsByPath, favoritePaths, recentPaths]
  );

  const toggleFavorite = (path: string) => {
    setFavoritePaths((prev) => {
      if (prev.includes(path)) {
        return prev.filter((existingPath) => existingPath !== path);
      }

      return [path, ...prev].slice(0, MAX_FAVORITES);
    });
  };

  const trackRecent = (path: string) => {
    setRecentPaths((prev) => [path, ...prev.filter((existingPath) => existingPath !== path)].slice(0, MAX_RECENT));
  };

  const renderSingleItem = (item: NavItemSingle) => {
    const isActive = location.pathname === item.path;
    const tourAttribute = getTourAttribute(item.path);
    const isFavorite = favoritePaths.includes(item.path);

    const linkContent = (
      <Link
        to={item.path}
        className={`${styles.navItem} ${isActive ? styles.active : ""}`}
        data-minimized={isMinimized}
        data-tour={tourAttribute}
        onClick={() => {
          trackRecent(item.path);
          onNavClick?.();
        }}
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

    return (
      <div key={item.path} className={styles.navRow}>
        {linkContent}
        <button
          type="button"
          className={styles.favoriteButton}
          data-favorite={isFavorite}
          onClick={() => toggleFavorite(item.path)}
          aria-label={isFavorite ? `Remove ${item.label} from favorites` : `Add ${item.label} to favorites`}
          title={isFavorite ? "Unpin from favorites" : "Pin to favorites"}
        >
          <Star size={14} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>
    );
  };

  return (
    <nav className={styles.nav} data-minimized={isMinimized}>
      {!isMinimized && (
        <div className={styles.searchWrapper}>
          <Search size={14} className={styles.searchIcon} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search menu"
            className={styles.searchInput}
            aria-label="Search navigation menu"
          />
        </div>
      )}

      {!isMinimized && !normalizedQuery && favoriteItems.length > 0 && (
        <Collapsible defaultOpen={true} className={styles.groupCollapsible}>
          <CollapsibleTrigger className={styles.groupTrigger}>
            <span className={styles.groupLabel}>Favorites</span>
            <ChevronDown size={14} className={styles.groupChevron} />
          </CollapsibleTrigger>
          <CollapsibleContent className={styles.groupContent}>
            {favoriteItems.map((item) => renderSingleItem(item))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {!isMinimized && !normalizedQuery && recentItems.length > 0 && (
        <Collapsible defaultOpen={true} className={styles.groupCollapsible}>
          <CollapsibleTrigger className={styles.groupTrigger}>
            <span className={styles.groupLabel}>Recent</span>
            <ChevronDown size={14} className={styles.groupChevron} />
          </CollapsibleTrigger>
          <CollapsibleContent className={styles.groupContent}>
            {recentItems.map((item) => renderSingleItem(item))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {filteredNavItems.map((item, index) => {
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

      {!isMinimized && normalizedQuery && filteredNavItems.length === 0 && (
        <div className={styles.searchEmptyState}>No menu items match "{query.trim()}".</div>
      )}
    </nav>
  );
};
