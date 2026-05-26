import { Link, useRouterState } from "@tanstack/react-router";
import { BellIcon, HomeIcon, type LucideIcon, UserIcon, WalletIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type Tab = { to: string; labelKey: string; icon: LucideIcon };

const masterTabs: Tab[] = [
	{ to: "/master", labelKey: "fieldTabs.home", icon: HomeIcon },
	{ to: "/master/finance", labelKey: "fieldTabs.wallet", icon: WalletIcon },
	{ to: "/notifications", labelKey: "fieldTabs.inbox", icon: BellIcon },
	{ to: "/master/profile", labelKey: "fieldTabs.profile", icon: UserIcon },
];

const inspectorTabs: Tab[] = [
	{ to: "/inspector", labelKey: "fieldTabs.home", icon: HomeIcon },
	{ to: "/notifications", labelKey: "fieldTabs.inbox", icon: BellIcon },
	{ to: "/inspector/profile", labelKey: "fieldTabs.profile", icon: UserIcon },
];

export function FieldTabs({ variant }: { variant: "master" | "inspector" }) {
	const { t } = useTranslation();
	const { location } = useRouterState();
	const path = location.pathname;
	const tabs = variant === "master" ? masterTabs : inspectorTabs;
	return (
		<nav
			aria-label={t("fieldTabs.primaryAria")}
			className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80"
		>
			<ul className="mx-auto grid max-w-md grid-cols-4 [&:has(:nth-child(3):last-child)]:grid-cols-3">
				{tabs.map((tab) => {
					const active = path === tab.to || path.startsWith(`${tab.to}/`);
					const Icon = tab.icon;
					return (
						<li key={tab.to}>
							<Link
								to={tab.to}
								className={cn(
									"flex flex-col items-center gap-1 px-2 py-2 text-[11px] font-medium transition-colors",
									active ? "text-primary" : "text-muted-foreground hover:text-foreground",
								)}
							>
								<Icon className="size-5" />
								<span>{t(tab.labelKey)}</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
