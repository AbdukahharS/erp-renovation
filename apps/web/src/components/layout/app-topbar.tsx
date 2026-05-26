import { Link, useMatches } from "@tanstack/react-router";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

type CrumbStatic = { crumb?: string; crumbKey?: string };

export function AppTopbar() {
	const { t } = useTranslation();
	const matches = useMatches();
	const crumbs = matches
		.map((m) => {
			const data = (m.staticData ?? {}) as CrumbStatic;
			const label = data.crumbKey ? t(data.crumbKey) : data.crumb;
			return label ? { label, to: m.pathname } : null;
		})
		.filter((x): x is { label: string; to: string } => x !== null);

	return (
		<header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<SidebarTrigger className="-ml-1" />
			<Separator orientation="vertical" className="mr-1 h-5" />
			<Breadcrumb>
				<BreadcrumbList>
					{crumbs.length === 0 ? (
						<BreadcrumbItem>
							<BreadcrumbPage>{t("common.home")}</BreadcrumbPage>
						</BreadcrumbItem>
					) : (
						crumbs.map((c, i) => {
							const last = i === crumbs.length - 1;
							return (
								<Fragment key={c.to}>
									<BreadcrumbItem>
										{last ? (
											<BreadcrumbPage>{c.label}</BreadcrumbPage>
										) : (
											<BreadcrumbLink render={<Link to={c.to} />}>{c.label}</BreadcrumbLink>
										)}
									</BreadcrumbItem>
									{!last ? <BreadcrumbSeparator /> : null}
								</Fragment>
							);
						})
					)}
				</BreadcrumbList>
			</Breadcrumb>
			<div className="ml-auto flex items-center gap-1">
				<LanguageSwitcher />
				<ThemeToggle />
				<NotificationBell />
			</div>
		</header>
	);
}
