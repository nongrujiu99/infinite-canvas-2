import { Menu } from "lucide-react";
import { Button, Tooltip } from "antd";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function AppTopNav() {
 const { t } = useTranslation();
 const { pathname } = useLocation();
 const [mobileNavOpen, setMobileNavOpen] = useState(false);
 const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
 const slug = pathname.split("/").filter(Boolean)[0];
 const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;

 return (
 <>
 {!hideHeader ? (
 <header className="sticky top-0 z-20 h-15 shrink-0 border-b border-border bg-background/92 backdrop-blur-xl">
 <div className="mx-auto flex h-full max-w-7xl items-stretch justify-between gap-5 px-5 sm:px-8">
 <div className="flex min-w-0 items-center">
 <Link to="/" className="flex h-full shrink-0 items-center gap-2.5 text-sm font-semibold leading-none tracking-tight text-foreground transition hover:text-primary">
 <img src="/logo-wordmark.svg" alt={t("meta.title")} className="h-6 w-auto shrink-0" />
 </Link>

 <button
 type="button"
 className="ml-3 inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground transition hover:text-foreground md:hidden"
 onClick={() => setMobileNavOpen(true)}
 aria-label={t("topNav.openMenu")}
 title={t("topNav.menu")}
 >
 <Menu className="size-5" />
 </button>

 <nav className="hide-scrollbar ml-9 hidden h-15 min-w-0 items-center gap-7 overflow-x-auto md:flex">
 {navigationTools.map((tool) => {
 const Icon = tool.icon;
 const active = tool.slug === activeToolSlug;
 return (
 <Link
 key={tool.slug}
 to={`/${tool.slug}`}
 className={cn(
 "relative flex h-15 shrink-0 items-center gap-2 text-sm leading-6 transition after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full",
 active ? "font-semibold text-foreground after:bg-primary" : "text-muted-foreground after:bg-transparent hover:text-foreground",
 )}
 >
 <Icon className="size-4" />
 <span className="truncate">{t(`navigation.${tool.slug}`)}</span>
 </Link>
 );
 })}
 </nav>
 </div>

 <div className="my-auto flex h-9 min-w-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
 <UserStatusActions />
 </div>
 </div>
 </header>
 ) : null}

 <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
 <AppConfigModal />
 </>
 );
}
