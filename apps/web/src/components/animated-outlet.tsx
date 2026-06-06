import { Outlet, useLocation } from "@tanstack/react-router";
import { motion } from "motion/react";

export function AnimatedOutlet() {
	const { pathname } = useLocation();
	return (
		<motion.div
			key={pathname}
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.18, ease: "easeOut" }}
		>
			<Outlet />
		</motion.div>
	);
}
