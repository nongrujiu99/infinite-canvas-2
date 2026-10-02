import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import UserLayout from "@/layouts/user-layout";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import EcommercePage from "@/pages/ecommerce";
import EcommerceProjectPage from "@/pages/ecommerce/project";
import NotFound from "@/pages/not-found";
import PromptsPage from "@/pages/prompts";

export const router = createBrowserRouter([
 {
 element: (
 <UserLayout>
 <AnalyticsTracker />
 <Outlet />
 </UserLayout>
 ),
 children: [
 { path: "/", element: <Navigate to="/canvas" replace /> },
 { path: "/canvas", element: <CanvasPage /> },
 { path: "/canvas/:id", element: <CanvasProjectPage /> },
 { path: "/ecommerce", element: <EcommercePage /> },
 { path: "/ecommerce/:id", element: <EcommerceProjectPage /> },
 { path: "/prompts", element: <PromptsPage /> },
 ],
 },
 { path: "*", element: <NotFound /> },
], {
 basename: import.meta.env.BASE_URL,
});
